/**
 * GCP Cloud DNS Record Set Entity
 *
 * Creates and manages DNS resource record sets within a Cloud DNS managed zone.
 *
 * @see https://cloud.google.com/dns/docs/reference/rest/v1/resourceRecordSets
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { CLOUD_DNS_API_URL } from "./common.ts";

/**
 * Definition for a Cloud DNS Record Set entity
 */
export interface CloudDnsRecordSetDefinition extends GcpEntityDefinition {
    /**
     * @description Managed zone name that contains this record set
     */
    zone_name: string;

    /**
     * @description DNS record name with trailing dot (e.g., "www.example.com.")
     */
    record_name: string;

    /**
     * @description DNS record type (A, AAAA, CNAME, MX, TXT, NS, SOA, SRV, CAA, PTR)
     */
    record_type: string;

    /**
     * @description Time-to-live in seconds (default: 300)
     */
    ttl?: number;

    /**
     * @description Record data values (format depends on record type)
     */
    rrdatas: string[];
}

/**
 * State for a Cloud DNS Record Set entity
 */
export interface CloudDnsRecordSetState extends GcpEntityState {
    /**
     * @description Full DNS name of the record
     */
    record_name?: string;

    /**
     * @description DNS record type
     */
    record_type?: string;
}

/**
 * @description GCP Cloud DNS Record Set entity. Creates and manages individual DNS
 * resource record sets (A, AAAA, CNAME, MX, TXT, etc.) within a Cloud DNS managed zone.
 *
 * ## Required Permissions
 * - `dns.resourceRecordSets.create` — create record sets
 * - `dns.resourceRecordSets.get` — check existence and readiness
 * - `dns.resourceRecordSets.update` — update record sets
 * - `dns.resourceRecordSets.delete` — delete record sets
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.record_name` — full DNS name of the record
 * - `state.record_type` — DNS record type
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/cloud-dns-zone` — the zone that contains this record set
 * - `gcp/service-usage` — enable `dns.googleapis.com` API
 */
export class CloudDnsRecordSet extends GcpEntity<CloudDnsRecordSetDefinition, CloudDnsRecordSetState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    protected getEntityName(): string {
        return `Cloud DNS Record ${this.definition.record_name || 'unnamed'} (${this.definition.record_type || '?'})`;
    }

    /**
     * Build the API URL for record sets in this zone
     */
    private getRrsetsBaseUrl(): string {
        return `${CLOUD_DNS_API_URL}/projects/${this.projectId}/managedZones/${this.definition.zone_name}/rrsets`;
    }

    /**
     * Build the API URL for this specific record set
     */
    private getRecordUrl(): string {
        return `${this.getRrsetsBaseUrl()}/${this.definition.record_name}/${this.definition.record_type}`;
    }

    /**
     * Build the record set request body from definition
     */
    private buildRecordBody(): Record<string, unknown> {
        return {
            name: this.definition.record_name,
            type: this.definition.record_type,
            ttl: this.definition.ttl ?? 300,
            rrdatas: this.definition.rrdatas,
        };
    }

    override create(): void {
        const recordUrl = this.getRecordUrl();

        // Check if record already exists
        const existing = this.checkResourceExists(recordUrl);
        if (existing) {
            this.state.existing = true;
            this.state.record_name = existing.name || this.definition.record_name;
            this.state.record_type = existing.type || this.definition.record_type;
            cli.output(`Adopted existing DNS record: ${this.state.record_name} ${this.state.record_type}`);
            return;
        }

        // Create the record set
        const body = this.buildRecordBody();
        const result = this.post(this.getRrsetsBaseUrl(), body);

        this.state.record_name = result.name || this.definition.record_name;
        this.state.record_type = result.type || this.definition.record_type;
        this.state.existing = false;
        cli.output(`Created DNS record: ${this.state.record_name} ${this.state.record_type}`);
    }

    override update(): void {
        if (!this.state.record_name) {
            this.create();
            return;
        }

        const body = this.buildRecordBody();
        this.patch(this.getRecordUrl(), body);
        cli.output(`Updated DNS record: ${this.state.record_name} ${this.state.record_type}`);
    }

    override delete(): void {
        if (!this.state.record_name) return;

        if (this.state.existing) {
            cli.output(`DNS record ${this.definition.record_name} wasn't created by this entity, skipping delete`);
            return;
        }

        // Check if record (or zone) still exists before attempting delete
        const existing = this.checkResourceExists(this.getRecordUrl());
        if (!existing) {
            cli.output(`DNS record ${this.definition.record_name} ${this.definition.record_type} already deleted`);
            return;
        }

        try {
            this.httpDelete(this.getRecordUrl());
            cli.output(`Successfully deleted DNS record: ${this.definition.record_name} ${this.definition.record_type}`);
        } catch (error) {
            throw new Error(`Failed to delete DNS record: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.record_name) return false;
        try {
            const result = this.get(this.getRecordUrl());
            return Boolean(result && result.name);
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // =========================================================================
    // Actions
    // =========================================================================

    /**
     * Get record set details
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.record_name) throw new Error("Record not created yet");

        const info = this.get(this.getRecordUrl());
        cli.output(`\nDNS Record Set:`);
        cli.output(`  Name: ${info.name}`);
        cli.output(`  Type: ${info.type}`);
        cli.output(`  TTL:  ${info.ttl || "default"} seconds`);
        cli.output(`  Zone: ${this.definition.zone_name}`);
        if (info.rrdatas && info.rrdatas.length > 0) {
            cli.output(`  Data:`);
            for (const rd of info.rrdatas) {
                cli.output(`    - ${rd}`);
            }
        }
    }
}
