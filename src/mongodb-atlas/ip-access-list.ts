import { MongoDBAtlasEntity, MongoDBAtlasEntityDefinition, MongoDBAtlasEntityState } from "./atlas-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";

/**
 * Definition for a single MongoDB Atlas project IP access list entry.
 * Exactly one of `ip_address`, `cidr_block`, or `aws_security_group` must be set.
 * @interface IpAccessListEntryDefinition
 */
export interface IpAccessListEntryDefinition extends MongoDBAtlasEntityDefinition {
    /**
     * @description Project (group) ID the access list entry belongs to
     * @minLength 1
     * @maxLength 24
     */
    project_id: string;

    /**
     * @description Single IP address to allow (mutually exclusive with cidr_block / aws_security_group)
     */
    ip_address?: string;

    /**
     * @description CIDR block to allow, e.g. "10.0.0.0/24" (mutually exclusive with ip_address / aws_security_group)
     */
    cidr_block?: string;

    /**
     * @description AWS security group ID to allow, e.g. "sg-0123abcd" (requires an active VPC peering connection)
     */
    aws_security_group?: string;

    /**
     * @description Optional human-readable note stored on the entry
     * @maxLength 80
     */
    comment?: string;

    /**
     * @description Optional ISO-8601 timestamp after which Atlas automatically removes the entry (time-boxed access)
     */
    delete_after?: string;
}

/**
 * Mutable runtime state for an IP access list entry.
 * @interface IpAccessListEntryState
 */
export interface IpAccessListEntryState extends MongoDBAtlasEntityState {
    /**
     * @description Project (group) ID the entry belongs to
     */
    project_id?: string;

    /**
     * @description The entry value (IP address, CIDR block, or AWS security group ID)
     */
    entry_value?: string;

    /**
     * @description Kind of entry: "ip", "cidr", or "sg"
     */
    kind?: string;

    /**
     * @description Comment stored on the entry
     */
    comment?: string;
}

interface ResolvedEntry {
    field: "ipAddress" | "cidrBlock" | "awsSecurityGroup";
    value: string;
    kind: "ip" | "cidr" | "sg";
}

/**
 * @description Manages a single entry in a MongoDB Atlas project's IP access list.
 * The IP access list is the network gate for a project: Atlas rejects all client
 * connections except from listed IP addresses, CIDR blocks, or AWS security groups.
 * Each entity instance manages one entry (keyed by its value) with full lifecycle —
 * unlike the cluster entity's `allow_ips`, entries are reconciled and removed on delete.
 *
 * ## Required Permissions
 * Service account / API key must have the Project Owner role on the target project
 * (covers add, list, get, and remove access list entry operations).
 *
 * ## Secrets
 * - Reads: secret named by `secret_ref` - MongoDB Atlas service account credentials
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.entry_value` - the IP/CIDR/security-group value managed by this entry
 * - `state.project_id` - the project the entry belongs to
 *
 * ## Composing with Other Entities
 * Works with:
 * - `mongodb-atlas/project` - the project whose access list this entry belongs to
 * - `mongodb-atlas/cluster` - grants the network access clusters in the project rely on
 */
export class IpAccessListEntry extends MongoDBAtlasEntity<IpAccessListEntryDefinition, IpAccessListEntryState> {

    /** Access list entries apply immediately; readiness is a quick existence check. */
    static readiness = {
        period: 5,
        initialDelay: 2,
        attempts: 6
    };

    protected getEntityName(): string {
        return this.resolveEntry().value;
    }

    /** Validate and resolve the single allowed entry value from the definition. */
    private resolveEntry(): ResolvedEntry {
        const set: ResolvedEntry[] = [];
        if (this.definition.ip_address) {
            set.push({ field: "ipAddress", value: this.definition.ip_address, kind: "ip" });
        }
        if (this.definition.cidr_block) {
            set.push({ field: "cidrBlock", value: this.definition.cidr_block, kind: "cidr" });
        }
        if (this.definition.aws_security_group) {
            set.push({ field: "awsSecurityGroup", value: this.definition.aws_security_group, kind: "sg" });
        }

        if (set.length === 0) {
            throw new Error("One of ip_address, cidr_block, or aws_security_group must be set");
        }
        if (set.length > 1) {
            throw new Error("Only one of ip_address, cidr_block, or aws_security_group may be set");
        }
        return set[0];
    }

    private collectionPath(): string {
        return `/groups/${this.definition.project_id}/accessList`;
    }

    /** Single-entry path. CIDR blocks contain "/", which must be URL-encoded. */
    private entryPath(value: string): string {
        return `${this.collectionPath()}/${encodeURIComponent(value)}`;
    }

    /** POST the entry (the create endpoint takes an array of entries). */
    private createEntry(entry: ResolvedEntry): void {
        const body: Record<string, unknown> = { [entry.field]: entry.value };
        if (this.definition.comment) {
            body.comment = this.definition.comment;
        }
        if (this.definition.delete_after) {
            body.deleteAfterDate = this.definition.delete_after;
        }

        this.makeRequest("POST", this.collectionPath(), [body]);

        this.state = {
            project_id: this.definition.project_id,
            entry_value: entry.value,
            kind: entry.kind,
            comment: this.definition.comment,
            existing: false
        };
    }

    override create(): void {
        const entry = this.resolveEntry();

        // Adopt a pre-existing entry rather than recreating it.
        const existing = this.checkResourceExists(this.entryPath(entry.value));
        if (existing && (existing.ipAddress || existing.cidrBlock || existing.awsSecurityGroup)) {
            this.state = {
                project_id: this.definition.project_id,
                entry_value: entry.value,
                kind: entry.kind,
                comment: existing.comment,
                existing: true
            };
            return;
        }

        this.createEntry(entry);
    }

    override update(): void {
        if (!this.state.entry_value) {
            this.create();
            return;
        }

        // Never mutate an entry that pre-existed this entity.
        if (this.state.existing) {
            return;
        }

        const desired = this.resolveEntry();

        // There is no single-entry PATCH; apply changes by removing the currently
        // managed entry and recreating it from the current definition.
        try {
            this.makeRequest("DELETE", this.entryPath(this.state.entry_value));
        } catch (error) {
            if (!this.isResourceGoneError(error)) {
                throw error;
            }
        }
        this.createEntry(desired);
    }

    override delete(): void {
        if (!this.state.entry_value) {
            cli.output("IP access list entry does not exist, nothing to delete");
            return;
        }
        this.deleteResource(this.entryPath(this.state.entry_value), "IP access list entry");
    }

    override checkReadiness(): boolean {
        if (!this.state.entry_value) {
            return false;
        }
        const data = this.checkResourceExists(this.entryPath(this.state.entry_value));
        return Boolean(data && (data.ipAddress || data.cidrBlock || data.awsSecurityGroup));
    }

    override checkLiveness(): boolean {
        if (!this.state.entry_value) {
            throw new Error("IP access list entry value is not available");
        }
        const data = this.checkResourceExists(this.entryPath(this.state.entry_value));
        if (!data) {
            throw new Error(`IP access list entry ${this.state.entry_value} not found`);
        }
        return true;
    }

    /** Print details for this access list entry. */
    @action("get-info")
    getInfo(_args?: Args): void {
        const entry = this.resolveEntry();
        const data = this.checkResourceExists(this.entryPath(entry.value));
        cli.output("==================================================");
        cli.output(`IP Access List Entry: ${entry.value} (${entry.kind})`);
        cli.output(`Project ID: ${this.definition.project_id}`);
        cli.output("==================================================");
        if (!data) {
            cli.output("Entry not found in project access list.");
            return;
        }
        cli.output(`  ipAddress: ${data.ipAddress || "-"}`);
        cli.output(`  cidrBlock: ${data.cidrBlock || "-"}`);
        cli.output(`  awsSecurityGroup: ${data.awsSecurityGroup || "-"}`);
        cli.output(`  comment: ${data.comment || "-"}`);
        cli.output(`  deleteAfterDate: ${data.deleteAfterDate || "-"}`);
    }

    /** List all entries in the project's IP access list. */
    @action("list-entries")
    listEntries(_args?: Args): void {
        const response = this.makeRequest("GET", this.collectionPath());
        const entries = (response && response.results) ? response.results : [];
        cli.output("==================================================");
        cli.output(`IP Access List for project ${this.definition.project_id}`);
        cli.output(`Total entries: ${response?.totalCount ?? entries.length}`);
        cli.output("==================================================");
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const value = e.ipAddress || e.cidrBlock || e.awsSecurityGroup || "(unknown)";
            cli.output(`  ${i + 1}. ${value}${e.comment ? ` — ${e.comment}` : ""}`);
        }
    }
}
