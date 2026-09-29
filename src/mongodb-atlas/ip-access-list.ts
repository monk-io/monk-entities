import { MongoDBAtlasEntity, MongoDBAtlasEntityDefinition, MongoDBAtlasEntityState } from "./atlas-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import { accessListRecordKey, normalizeAccessListKey } from "./access-list-key.ts";
import {
    AccessListAttributes,
    accessListAttributeDrift,
    deleteAfterExpired,
    describeAttributeDrift,
    hasAttributeDrift
} from "./access-list-attrs.ts";

/** Page size for reading the whole access list (Atlas maximum). */
const LIST_PAGE_SIZE = 500;
/** POST attempts before create gives up on an entry Atlas keeps dropping. */
const MAX_CREATE_ATTEMPTS = 4;
/** Waits between post-create visibility checks; the entry must survive all of them. */
const VERIFY_DELAYS_MS = [1500, 3000];
/** Linear backoff (plus random jitter) before a re-POST, to desync concurrent writers. */
const RETRY_BACKOFF_MS = 2000;
const RETRY_JITTER_MS = 2000;

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

    /**
     * @description Expiry (ISO-8601) stored on the entry, if any
     */
    delete_after?: string;

    /**
     * @description True once delete_after has passed and Atlas has removed the entry as
     * configured; the entity then leaves it removed instead of re-adding it
     */
    expired?: boolean;
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
 * Each entity instance manages one entry (keyed by its canonical value, so a single IP
 * and its /32 are the same entry) with full lifecycle —
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

    /**
     * Every entry in the project's access list, read in one page. Atlas caps a project's
     * access list well below the maximum page size, so a short page means the read is
     * incomplete — fail rather than decide ownership against partial data.
     */
    private listAllEntries(): any[] {
        const response = this.makeRequest("GET", `${this.collectionPath()}?itemsPerPage=${LIST_PAGE_SIZE}`);
        const entries: any[] = (response && Array.isArray(response.results)) ? response.results : [];
        const totalCount = response?.totalCount ?? entries.length;
        if (entries.length < totalCount) {
            throw new Error(
                `IP access list for project ${this.definition.project_id} has ${totalCount} entries but only ` +
                `${entries.length} were returned in one page`
            );
        }
        return entries;
    }

    /**
     * Find the Atlas record for `key` (a canonical key from normalizeAccessListKey).
     * Matches by canonical key, so `ip_address: X` and `cidr_block: X/32` find the same
     * record. Throws when the list cannot be read.
     */
    private findEntry(key: string): any | null {
        for (const e of this.listAllEntries()) {
            if (accessListRecordKey(e) === key) {
                return e;
            }
        }
        return null;
    }

    /** Like findEntry, but a failed read counts as "not seen" instead of throwing. */
    private entryVisible(key: string): boolean {
        try {
            return this.findEntry(key) !== null;
        } catch (_error) {
            return false;
        }
    }

    private entryBody(entry: ResolvedEntry): Record<string, unknown> {
        const body: Record<string, unknown> = { [entry.field]: entry.value };
        if (this.definition.comment) {
            body.comment = this.definition.comment;
        }
        if (this.definition.delete_after) {
            body.deleteAfterDate = this.definition.delete_after;
        }
        return body;
    }

    /**
     * POST the entry and confirm Atlas actually kept it.
     *
     * The access list is one project-wide document: concurrent POSTs from other entities
     * (or anything else writing the list) can make Atlas drop an entry it had already
     * accepted with a 2xx. So a successful response proves nothing on its own. After each
     * POST the entry must be present in the POST response and then stay visible across
     * a settle window; if it vanishes, re-POST (adding an entry that is already present is
     * a no-op) after a jittered backoff, and give up with an error after a bounded number
     * of attempts rather than report an entry that does not exist.
     */
    private createEntry(entry: ResolvedEntry, key: string): void {
        const body = this.entryBody(entry);

        for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
            if (attempt > 1) {
                sleep(RETRY_BACKOFF_MS * (attempt - 1) + Math.floor(Math.random() * RETRY_JITTER_MS));
            }

            const response = this.makeRequest("POST", this.collectionPath(), [body]);
            // The response carries (the first page of) the resulting access list. Only a
            // complete page can prove the entry absent.
            const returned: any[] = (response && Array.isArray(response.results)) ? response.results : [];
            const complete = returned.length > 0 && returned.length >= (response?.totalCount ?? returned.length);
            if (complete && !returned.some((e) => accessListRecordKey(e) === key)) {
                cli.output(`IP access list entry ${entry.value} missing from the create response (attempt ${attempt}/${MAX_CREATE_ATTEMPTS}), retrying`);
                continue;
            }

            let persisted = true;
            for (const delay of VERIFY_DELAYS_MS) {
                sleep(delay);
                if (!this.entryVisible(key)) {
                    persisted = false;
                    break;
                }
            }
            if (!persisted) {
                cli.output(`IP access list entry ${entry.value} was dropped by Atlas after create (attempt ${attempt}/${MAX_CREATE_ATTEMPTS}), retrying`);
                continue;
            }

            this.state = {
                project_id: this.definition.project_id,
                entry_value: entry.value,
                kind: entry.kind,
                comment: this.definition.comment,
                delete_after: this.definition.delete_after,
                existing: false
            };
            return;
        }

        throw new Error(
            `IP access list entry ${entry.value} was not persisted in project ${this.definition.project_id} ` +
            `after ${MAX_CREATE_ATTEMPTS} attempts; Atlas accepted the request but the entry is not in the ` +
            `access list (concurrent access list writes can drop entries)`
        );
    }

    /**
     * Adopt an entry that is already in the access list, or create a new one.
     * Existence is decided BEFORE posting and by canonical key, so an entry that is
     * already present under another spelling (X vs X/32) is adopted as `existing` and
     * never deleted by this entity.
     */
    private adoptOrCreate(entry: ResolvedEntry): void {
        const key = normalizeAccessListKey(entry.value);
        const existing = this.findEntry(key);
        if (existing) {
            this.state = {
                project_id: this.definition.project_id,
                entry_value: entry.value,
                kind: entry.kind,
                comment: existing.comment,
                delete_after: existing.deleteAfterDate,
                existing: true
            };
            return;
        }

        this.createEntry(entry, key);
    }

    override create(): void {
        this.adoptOrCreate(this.resolveEntry());
    }

    override update(): void {
        if (!this.state.entry_value) {
            this.create();
            return;
        }

        const desired = this.resolveEntry();

        // Same entry (compared by canonical key, so switching between ip_address X and
        // cidr_block X/32 is not a change). Only comment/delete_after can differ.
        if (normalizeAccessListKey(desired.value) === normalizeAccessListKey(this.state.entry_value)) {
            this.state.entry_value = desired.value;
            this.state.kind = desired.kind;
            this.reconcileAttributes(desired);
            return;
        }

        // The desired value changed (e.g. a runnable-derived IP moved to a new
        // peer). Never delete an entry this entity did not create itself --
        // `existing` describes the OLD value's adoption status, not a permanent
        // freeze on ever reconciling this entity again. There is no single-entry
        // PATCH; apply the change by removing the old entry (when owned) and
        // adopting-or-creating the new one.
        if (!this.state.existing) {
            try {
                this.makeRequest("DELETE", this.entryPath(this.state.entry_value));
            } catch (error) {
                if (!this.isResourceGoneError(error)) {
                    throw error;
                }
            }
        }
        this.adoptOrCreate(desired);
    }

    /** True when the definition's delete_after is at or before now. */
    private expiredAsConfigured(): boolean {
        return deleteAfterExpired(this.definition.delete_after, Date.now());
    }

    private desiredAttributes(): AccessListAttributes {
        return { comment: this.definition.comment, deleteAfterDate: this.definition.delete_after };
    }

    private refreshAttributesFromLive(live: any): void {
        this.state.comment = live.comment;
        this.state.delete_after = live.deleteAfterDate;
    }

    /**
     * Apply comment/delete_after changes to an entry whose value is unchanged.
     *
     * Atlas has no single-entry PATCH, and its docs don't say whether POSTing an entry
     * that already exists updates its comment or expiry. So: re-POST the entry, read it
     * back, and if Atlas kept the old values, delete and recreate it. Removing an expiry
     * goes straight to delete-and-recreate, since a POST without deleteAfterDate is not
     * documented to clear one. An adopted entry (`existing: true`) belongs to someone
     * else and is never modified; the change is reported as not applied.
     */
    private reconcileAttributes(desired: ResolvedEntry): void {
        const key = normalizeAccessListKey(desired.value);
        const live = this.findEntry(key);

        if (!live) {
            // Past its delete_after, Atlas removed the entry by design. Re-adding it would
            // reopen access that was meant to lapse (or fail on a past deleteAfterDate).
            if (this.expiredAsConfigured()) {
                cli.output(
                    `IP access list entry ${desired.value} expired as configured (delete_after ` +
                    `${this.definition.delete_after}) and was removed by Atlas; not re-adding it. ` +
                    `Set a future delete_after, or remove it, to restore access.`
                );
                this.state.expired = true;
                this.state.comment = undefined;
                this.state.delete_after = this.definition.delete_after;
                return;
            }
            // Adopted entries are never recreated (same rule as checkReadiness): it
            // wasn't ours, so re-adding it would silently claim it.
            if (this.state.existing) {
                cli.output(
                    `WARNING: IP access list entry ${desired.value} was adopted (existing: true) and is no longer in ` +
                    `project ${this.definition.project_id}. Not re-creating it; add it in Atlas, or remove it from ` +
                    `this stack and redeploy so this entity creates and owns it.`
                );
                return;
            }
            // Ours, no expiry or a future one, removed out of band: add it again.
            cli.output(`IP access list entry ${desired.value} not found in project ${this.definition.project_id}, re-adding it`);
            this.adoptOrCreate(desired);
            return;
        }

        this.state.expired = false;

        const want = this.desiredAttributes();
        const drift = accessListAttributeDrift(want, live);
        if (!hasAttributeDrift(drift)) {
            this.refreshAttributesFromLive(live);
            return;
        }

        const change = describeAttributeDrift(drift, want, live);
        if (this.state.existing) {
            cli.output(
                `WARNING: IP access list entry ${desired.value} was not created by this entity (existing: true), ` +
                `so the change to ${change} was NOT applied. Change it in Atlas directly, or remove the entry and ` +
                `let this entity create it.`
            );
            this.refreshAttributesFromLive(live);
            return;
        }

        cli.output(`Updating IP access list entry ${desired.value}: ${change}`);

        if (!drift.clearsDeleteAfter) {
            this.makeRequest("POST", this.collectionPath(), [this.entryBody(desired)]);
            const after = this.findEntry(key);
            if (after && !hasAttributeDrift(accessListAttributeDrift(want, after))) {
                this.refreshAttributesFromLive(after);
                return;
            }
            cli.output(`Atlas kept the old values after re-adding the entry; deleting and recreating it`);
        }

        cli.output(
            `WARNING: recreating IP access list entry ${desired.value}. Connections from it are refused ` +
            `until the new entry is active (usually a few seconds).`
        );
        try {
            this.makeRequest("DELETE", this.entryPath(desired.value));
        } catch (error) {
            if (!this.isResourceGoneError(error)) {
                throw error;
            }
        }
        this.createEntry(desired, key);

        const recreated = this.findEntry(key);
        if (recreated && hasAttributeDrift(accessListAttributeDrift(want, recreated))) {
            throw new Error(
                `IP access list entry ${desired.value} was recreated but Atlas reports ` +
                `${describeAttributeDrift(accessListAttributeDrift(want, recreated), want, recreated)}`
            );
        }
        if (recreated) {
            this.refreshAttributesFromLive(recreated);
        }
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
        if (data && (data.ipAddress || data.cidrBlock || data.awsSecurityGroup)) {
            return true;
        }

        // Removed by Atlas at its configured expiry: that is the desired end state, so
        // don't re-add it (the past deleteAfterDate would be rejected anyway).
        if (this.expiredAsConfigured()) {
            cli.output(`IP access list entry ${this.state.entry_value} expired as configured (delete_after ${this.definition.delete_after})`);
            return true;
        }

        // An entry this entity created can still be dropped by a concurrent access list
        // write after create verified it. Re-add it (a no-op if it reappeared) so the
        // next readiness poll can pass; never recreate an adopted entry.
        if (!this.state.existing) {
            cli.output(`IP access list entry ${this.state.entry_value} not found, re-adding it`);
            try {
                this.makeRequest("POST", this.collectionPath(), [this.entryBody(this.resolveEntry())]);
            } catch (error) {
                cli.output(`Re-adding IP access list entry failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return false;
    }

    override checkLiveness(): boolean {
        if (!this.state.entry_value) {
            throw new Error("IP access list entry value is not available");
        }
        const data = this.checkResourceExists(this.entryPath(this.state.entry_value));
        if (!data && this.expiredAsConfigured()) {
            return true;
        }
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
