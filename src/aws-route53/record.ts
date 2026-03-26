import { action, Args } from "monkec/base";
import { AWSRoute53Entity, AWSRoute53Definition, AWSRoute53State } from "./route53-base.ts";
import cli from "cli";
import {
    extractXMLValue,
    extractXMLValues,
    extractXMLBlocks,
    escapeXml,
    ensureTrailingDot,
} from "./common.ts";

export interface RecordDefinition extends AWSRoute53Definition {
    /** @description Hosted zone ID (without /hostedzone/ prefix) */
    zone_id: string;

    /** @description Record name (FQDN, e.g., www.example.com) */
    record_name: string;

    /** @description DNS record type (A, AAAA, CNAME, MX, TXT, etc.) */
    record_type: string;

    /** @description TTL in seconds (required for non-alias records) */
    ttl?: number;

    /** @description Record values (e.g., IP addresses, CNAME targets) */
    record_values?: string[];

    /** @description Alias target DNS name (for alias records) */
    alias_dns_name?: string;

    /** @description Alias target hosted zone ID (for alias records) */
    alias_hosted_zone_id?: string;

    /** @description Whether to evaluate target health for alias records */
    alias_evaluate_target_health?: boolean;

    /** @description Routing policy weight (for weighted routing) */
    weight?: number;

    /** @description Set identifier (required for weighted/latency/failover/geo routing) */
    set_identifier?: string;

    /** @description Failover type: PRIMARY or SECONDARY */
    failover?: string;

    /** @description Region for latency-based routing */
    latency_region?: string;

    /** @description Health check ID to associate */
    health_check_id?: string;

    /** @description Whether this is a multi-value answer record */
    multi_value_answer?: boolean;
}

export interface RecordState extends AWSRoute53State {
    /** @description Hosted zone ID */
    zone_id?: string;

    /** @description Fully qualified record name */
    record_name?: string;

    /** @description Record type */
    record_type?: string;

    /** @description Current record values */
    record_values?: string[];

    /** @description Current TTL */
    ttl?: number;

    /** @description Whether this is an alias record */
    is_alias?: boolean;
}

export class Record extends AWSRoute53Entity<RecordDefinition, RecordState> {

    static readonly readiness = { period: 10, initialDelay: 2, attempts: 15 };

    override create(): void {
        const zoneId = this.definition.zone_id;
        const recordName = ensureTrailingDot(this.definition.record_name);
        const recordType = this.definition.record_type;

        if (!zoneId) throw new Error("zone_id is required");
        if (!recordName) throw new Error("record_name is required");
        if (!recordType) throw new Error("record_type is required");

        // Check if record already exists
        const existing = this.findRecord(zoneId, recordName, recordType);
        if (existing) {
            cli.output(`Record ${recordName} ${recordType} already exists, adopting`);
            this.state.existing = true;
            this.state.zone_id = zoneId;
            this.state.record_name = recordName;
            this.state.record_type = recordType;
            this.state.record_values = [...existing.values];
            this.state.ttl = existing.ttl;
            this.state.is_alias = existing.isAlias;
            return;
        }

        // Create/upsert the record
        cli.output(`Creating record: ${recordName} ${recordType}`);
        this.upsertRecord(zoneId);

        this.state.existing = false;
        this.state.zone_id = zoneId;
        this.state.record_name = recordName;
        this.state.record_type = recordType;
        this.state.record_values = this.definition.record_values ? [...this.definition.record_values] : undefined;
        this.state.ttl = this.definition.ttl;
        this.state.is_alias = !!this.definition.alias_dns_name;

        cli.output(`Record created: ${recordName} ${recordType}`);
    }

    override update(): void {
        if (!this.state.zone_id) {
            this.create();
            return;
        }

        const newName = ensureTrailingDot(this.definition.record_name);
        const newType = this.definition.record_type;
        const identityChanged = this.state.record_name !== newName || this.state.record_type !== newType || this.state.zone_id !== this.definition.zone_id;

        // If record identity or zone changed, delete the old record first
        if (identityChanged && this.state.record_name && this.state.record_type) {
            cli.output(`Record identity changed, deleting old record: ${this.state.record_name} ${this.state.record_type}`);
            this.deleteRecordFromState();
        }

        cli.output(`Upserting record: ${newName} ${newType}`);
        this.upsertRecord(this.definition.zone_id);

        this.state.zone_id = this.definition.zone_id;
        this.state.record_name = newName;
        this.state.record_type = newType;
        this.state.record_values = this.definition.record_values ? [...this.definition.record_values] : undefined;
        this.state.ttl = this.definition.ttl;
        this.state.is_alias = !!this.definition.alias_dns_name;

        cli.output(`Record updated`);
    }

    override delete(): void {
        if (!this.state.zone_id || !this.state.record_name || !this.state.record_type) return;

        if (this.state.existing) {
            cli.output(`Record was pre-existing, skipping deletion: ${this.state.record_name}`);
            return;
        }

        cli.output(`Deleting record: ${this.state.record_name} ${this.state.record_type}`);
        this.deleteRecordFromState();
        cli.output(`Record deleted: ${this.state.record_name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.zone_id || !this.state.record_name || !this.state.record_type) return false;

        try {
            const record = this.findRecord(
                this.state.zone_id,
                this.state.record_name,
                this.state.record_type
            );
            return record !== null;
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    @action("get-record-info")
    getRecordInfo(_args?: Args): void {
        if (!this.state.zone_id || !this.state.record_name) {
            throw new Error("Record not created yet");
        }

        const record = this.findRecord(
            this.state.zone_id,
            this.state.record_name,
            this.state.record_type || this.definition.record_type
        );

        cli.output(`=== DNS Record Info ===`);
        cli.output(`Name: ${this.state.record_name}`);
        cli.output(`Type: ${this.state.record_type}`);
        cli.output(`Zone ID: ${this.state.zone_id}`);

        if (record) {
            if (record.isAlias) {
                cli.output(`Alias Target: ${record.aliasTarget}`);
            } else {
                cli.output(`TTL: ${record.ttl}`);
                cli.output(`Values: ${record.values.join(", ")}`);
            }
        }

        cli.output(`Pre-existing: ${this.state.existing}`);
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(`=== Route 53 DNS Record Cost Estimate ===`);
        cli.output(`Record: ${this.state.record_name || this.definition.record_name}`);
        cli.output(`Type: ${this.state.record_type || this.definition.record_type}`);
        cli.output(``);
        cli.output(`DNS records do not have a per-record cost.`);
        cli.output(`Costs are incurred at the hosted zone level:`);
        cli.output(`  - Hosted Zone: $0.50/month`);
        cli.output(`  - Queries: $0.40 per million (standard)`);
        cli.output(``);
        cli.output(`Estimated Monthly Cost: $0.00 (included in hosted zone)`);
    }

    @action("costs")
    costs(): void {
        cli.output(JSON.stringify({
            type: "aws-route53-record",
            costs: { month: { amount: "0.00", currency: "USD" } }
        }));
    }

    private deleteRecordFromState(): void {
        if (!this.state.zone_id || !this.state.record_name || !this.state.record_type) return;

        // Fetch the raw XML block from API — Route 53 DELETE requires an exact match
        // including all routing policy fields (SetIdentifier, Weight, Failover, etc.)
        const rawBlock = this.findRecordRawXml(this.state.zone_id, this.state.record_name, this.state.record_type);
        if (!rawBlock) {
            cli.output(`Record not found in zone, may already be deleted`);
            return;
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch>
    <Changes>
      <Change>
        <Action>DELETE</Action>
        ${rawBlock}
      </Change>
    </Changes>
  </ChangeBatch>
</ChangeResourceRecordSetsRequest>`;

        const response = this.route53Request(
            "ChangeResourceRecordSets",
            `/hostedzone/${this.state.zone_id}/rrset`,
            "POST",
            xml
        );

        const changeId = extractXMLValue(response.body, "Id");
        if (changeId) {
            this.waitForChange(changeId);
        }
    }

    private upsertRecord(zoneId: string): void {
        const recordSetXml = this.buildRecordSetXml();

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch>
    <Changes>
      <Change>
        <Action>UPSERT</Action>
        ${recordSetXml}
      </Change>
    </Changes>
  </ChangeBatch>
</ChangeResourceRecordSetsRequest>`;

        const response = this.route53Request(
            "ChangeResourceRecordSets",
            `/hostedzone/${zoneId}/rrset`,
            "POST",
            xml
        );

        const changeId = extractXMLValue(response.body, "Id");
        if (changeId) {
            this.waitForChange(changeId);
        }
    }

    private buildRecordSetXml(): string {
        const recordName = ensureTrailingDot(this.definition.record_name);
        const recordType = this.definition.record_type;

        let xml = `<ResourceRecordSet>
          <Name>${escapeXml(recordName)}</Name>
          <Type>${escapeXml(recordType)}</Type>`;

        // Set identifier for routing policies
        if (this.definition.set_identifier) {
            xml += `
          <SetIdentifier>${escapeXml(this.definition.set_identifier)}</SetIdentifier>`;
        }

        // Weight for weighted routing
        if (this.definition.weight !== undefined) {
            xml += `
          <Weight>${this.definition.weight}</Weight>`;
        }

        // Failover routing
        if (this.definition.failover) {
            xml += `
          <Failover>${escapeXml(this.definition.failover)}</Failover>`;
        }

        // Latency-based routing
        if (this.definition.latency_region) {
            xml += `
          <Region>${escapeXml(this.definition.latency_region)}</Region>`;
        }

        // Multi-value answer
        if (this.definition.multi_value_answer) {
            xml += `
          <MultiValueAnswer>true</MultiValueAnswer>`;
        }

        // Alias record
        if (this.definition.alias_dns_name) {
            xml += `
          <AliasTarget>
            <HostedZoneId>${escapeXml(this.definition.alias_hosted_zone_id || "")}</HostedZoneId>
            <DNSName>${escapeXml(this.definition.alias_dns_name)}</DNSName>
            <EvaluateTargetHealth>${this.definition.alias_evaluate_target_health ?? false}</EvaluateTargetHealth>
          </AliasTarget>`;
        } else {
            // Standard record with TTL and values
            const ttl = this.definition.ttl ?? 300;
            xml += `
          <TTL>${ttl}</TTL>
          <ResourceRecords>`;

            if (this.definition.record_values) {
                for (const value of this.definition.record_values) {
                    xml += `
            <ResourceRecord><Value>${escapeXml(value)}</Value></ResourceRecord>`;
                }
            }

            xml += `
          </ResourceRecords>`;
        }

        // Health check
        if (this.definition.health_check_id) {
            xml += `
          <HealthCheckId>${escapeXml(this.definition.health_check_id)}</HealthCheckId>`;
        }

        xml += `
        </ResourceRecordSet>`;

        return xml;
    }

    private findRecord(
        zoneId: string,
        recordName: string,
        recordType: string
    ): { values: string[]; ttl: number; isAlias: boolean; aliasTarget?: string; aliasHostedZoneId?: string } | null {
        const block = this.findRecordRawXml(zoneId, recordName, recordType);
        if (!block) return null;

        const aliasTarget = extractXMLValue(block, "DNSName");
        const aliasHostedZoneId = extractXMLValue(block, "HostedZoneId");
        const isAlias = block.includes("<AliasTarget>");

        return {
            values: extractXMLValues(block, "Value"),
            ttl: parseInt(extractXMLValue(block, "TTL") || "0", 10),
            isAlias,
            aliasTarget,
            aliasHostedZoneId,
        };
    }

    private findRecordRawXml(zoneId: string, recordName: string, recordType: string): string | null {
        try {
            const fqdn = ensureTrailingDot(recordName);
            // Use maxitems=10 to handle routing policies with multiple records sharing name+type
            const response = this.route53Request(
                "ListResourceRecordSets",
                `/hostedzone/${zoneId}/rrset?name=${encodeURIComponent(fqdn)}&type=${encodeURIComponent(recordType)}&maxitems=10`
            );

            const setId = this.definition.set_identifier;
            const blocks = extractXMLBlocks(response.body, "ResourceRecordSet");
            for (const block of blocks) {
                const name = extractXMLValue(block, "Name");
                const rType = extractXMLValue(block, "Type");
                if (name !== fqdn || rType !== recordType) continue;

                // For routing policies, match by SetIdentifier
                if (setId) {
                    const blockSetId = extractXMLValue(block, "SetIdentifier");
                    if (blockSetId !== setId) continue;
                }

                return block;
            }
        } catch {
            // Record not found
        }
        return null;
    }
}
