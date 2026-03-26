import { action, Args } from "monkec/base";
import { AWSRoute53Entity, AWSRoute53Definition, AWSRoute53State } from "./route53-base.ts";
import cli from "cli";
import {
    extractXMLValue,
    extractXMLValues,
    extractXMLBlocks,
    escapeXml,
    ensureTrailingDot,
    stripZoneIdPrefix,
    validateDomainName,
} from "./common.ts";

export interface HostedZoneDefinition extends AWSRoute53Definition {
    /** @description Domain name for the hosted zone (e.g., example.com) */
    zone_name: string;

    /** @description Whether this is a private hosted zone */
    is_private?: boolean;

    /** @description VPC ID for private hosted zones */
    vpc_id?: string;

    /** @description VPC region for private hosted zones (defaults to entity region) */
    vpc_region?: string;

    /** @description Comment for the hosted zone */
    zone_comment?: string;

    /** @description Resource tags */
    tags?: Record<string, string>;
}

export interface HostedZoneState extends AWSRoute53State {
    /** @description Route 53 hosted zone ID (without /hostedzone/ prefix) */
    zone_id?: string;

    /** @description Fully qualified zone name */
    zone_name?: string;

    /** @description Assigned name servers */
    name_servers?: string[];

    /** @description Number of record sets in the zone */
    record_set_count?: number;
}

export class HostedZone extends AWSRoute53Entity<HostedZoneDefinition, HostedZoneState> {

    static readonly readiness = { period: 10, initialDelay: 2, attempts: 12 };

    override create(): void {
        const zoneName = this.definition.zone_name;

        if (!validateDomainName(zoneName)) {
            throw new Error(`Invalid domain name: ${zoneName}`);
        }

        // Check if zone already exists
        const existing = this.findZoneByName(zoneName);
        if (existing) {
            cli.output(`Hosted zone for ${zoneName} already exists, adopting: ${existing.zoneId}`);
            this.state.existing = true;
            this.state.zone_id = existing.zoneId;
            this.state.zone_name = existing.zoneName;
            this.state.name_servers = existing.nameServers;
            this.state.record_set_count = existing.recordSetCount;
            return;
        }

        // Create hosted zone
        cli.output(`Creating hosted zone: ${zoneName}`);
        const callerRef = `monk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<CreateHostedZoneRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <Name>${escapeXml(ensureTrailingDot(zoneName))}</Name>
  <CallerReference>${escapeXml(callerRef)}</CallerReference>`;

        if (this.definition.zone_comment) {
            xml += `
  <HostedZoneConfig>
    <Comment>${escapeXml(this.definition.zone_comment)}</Comment>`;
            if (this.definition.is_private) {
                xml += `
    <PrivateZone>true</PrivateZone>`;
            }
            xml += `
  </HostedZoneConfig>`;
        } else if (this.definition.is_private) {
            xml += `
  <HostedZoneConfig>
    <PrivateZone>true</PrivateZone>
  </HostedZoneConfig>`;
        }

        if (this.definition.is_private && this.definition.vpc_id) {
            xml += `
  <VPC>
    <VPCRegion>${escapeXml(this.definition.vpc_region || this.region)}</VPCRegion>
    <VPCId>${escapeXml(this.definition.vpc_id)}</VPCId>
  </VPC>`;
        }

        xml += `
</CreateHostedZoneRequest>`;

        const response = this.route53Request("CreateHostedZone", "/hostedzone", "POST", xml);

        const rawZoneId = extractXMLValue(response.body, "Id");
        const zoneId = rawZoneId ? stripZoneIdPrefix(rawZoneId) : undefined;
        const nameServers = extractXMLValues(response.body, "NameServer");

        if (!zoneId) {
            throw new Error("Failed to extract zone ID from CreateHostedZone response");
        }

        this.state.existing = false;
        this.state.zone_id = zoneId;
        this.state.zone_name = ensureTrailingDot(zoneName);
        this.state.name_servers = nameServers;
        this.state.record_set_count = 2; // SOA + NS created by default

        // Apply tags if provided
        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            this.applyTags(zoneId, this.definition.tags);
        }

        // Wait for change to propagate
        const changeInfoMatch = response.body.match(/<ChangeInfo>[\s\S]*?<Id>([^<]+)<\/Id>/);
        if (changeInfoMatch) {
            this.waitForChange(changeInfoMatch[1]);
        }

        cli.output(`Hosted zone created: ${zoneId}`);
        cli.output(`Name servers: ${nameServers.join(", ")}`);
    }

    override update(): void {
        if (!this.state.zone_id) {
            this.create();
            return;
        }

        // Update comment if changed
        if (this.definition.zone_comment !== undefined) {
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<UpdateHostedZoneCommentRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <Comment>${escapeXml(this.definition.zone_comment)}</Comment>
</UpdateHostedZoneCommentRequest>`;

            this.route53Request("UpdateHostedZoneComment", `/hostedzone/${this.state.zone_id}`, "POST", xml);
            cli.output(`Updated hosted zone comment`);
        }

        // Update tags
        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            this.applyTags(this.state.zone_id, this.definition.tags);
        }

        // Refresh state
        this.refreshState();
    }

    override delete(): void {
        if (!this.state.zone_id) return;

        if (this.state.existing) {
            cli.output(`Hosted zone was pre-existing, skipping deletion: ${this.state.zone_id}`);
            return;
        }

        cli.output(`Deleting hosted zone: ${this.state.zone_id}`);

        // Must delete all non-default records first
        this.deleteNonDefaultRecords();

        this.route53Request("DeleteHostedZone", `/hostedzone/${this.state.zone_id}`, "DELETE");
        cli.output(`Hosted zone deleted: ${this.state.zone_id}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.zone_id) return false;

        try {
            const response = this.route53Request("GetHostedZone", `/hostedzone/${this.state.zone_id}`);
            return response.statusCode === 200;
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    @action("get-zone-info")
    getZoneInfo(_args?: Args): void {
        if (!this.state.zone_id) throw new Error("Zone not created yet");

        this.refreshState();

        cli.output(`=== Hosted Zone Info ===`);
        cli.output(`Zone ID: ${this.state.zone_id}`);
        cli.output(`Zone Name: ${this.state.zone_name}`);
        cli.output(`Record Sets: ${this.state.record_set_count}`);
        cli.output(`Name Servers:`);
        if (this.state.name_servers) {
            for (const ns of this.state.name_servers) {
                cli.output(`  - ${ns}`);
            }
        }
        cli.output(`Pre-existing: ${this.state.existing}`);
    }

    @action("list-records")
    listRecords(_args?: Args): void {
        if (!this.state.zone_id) throw new Error("Zone not created yet");

        const response = this.route53Request(
            "ListResourceRecordSets",
            `/hostedzone/${this.state.zone_id}/rrset`
        );

        const recordBlocks = extractXMLBlocks(response.body, "ResourceRecordSet");

        cli.output(`=== DNS Records in ${this.state.zone_name} ===`);
        for (const block of recordBlocks) {
            const name = extractXMLValue(block, "Name") || "unknown";
            const recordType = extractXMLValue(block, "Type") || "unknown";
            const ttl = extractXMLValue(block, "TTL") || "N/A";
            const values = extractXMLValues(block, "Value");
            const aliasTarget = extractXMLValue(block, "DNSName");

            if (aliasTarget) {
                cli.output(`  ${name} ${recordType} ALIAS -> ${aliasTarget}`);
            } else {
                cli.output(`  ${name} ${recordType} TTL=${ttl} ${values.join(", ")}`);
            }
        }
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(`=== Route 53 Hosted Zone Cost Estimate ===`);
        cli.output(`Zone: ${this.state.zone_name || this.definition.zone_name}`);
        cli.output(`Zone ID: ${this.state.zone_id || "not created"}`);
        cli.output(``);

        // Base hosted zone cost
        const zoneCost = 0.50;
        cli.output(`Pricing:`);
        cli.output(`  Hosted Zone: $${zoneCost.toFixed(2)}/month`);
        cli.output(`  Standard Queries: $0.40 per million`);
        cli.output(`  Latency-Based Routing Queries: $0.60 per million`);
        cli.output(`  Geo DNS Queries: $0.70 per million`);
        cli.output(``);

        // Try to get query metrics from CloudWatch
        let queryCost = 0;
        if (this.state.zone_id) {
            const queryCount = this.getCloudWatchMetric(
                "AWS/Route53",
                "DNSQueries",
                [{ Name: "HostedZoneId", Value: this.state.zone_id }]
            );
            queryCost = (queryCount / 1_000_000) * 0.40;
            cli.output(`Usage (last 30 days):`);
            cli.output(`  DNS Queries: ${queryCount.toLocaleString()}`);
            cli.output(`  Query Cost: $${queryCost.toFixed(2)}`);
        }

        const totalCost = zoneCost + queryCost;
        cli.output(``);
        cli.output(`Estimated Monthly Cost: $${totalCost.toFixed(2)}`);
        cli.output(``);
        cli.output(`Note: Does not include health check costs, traffic policy costs,`);
        cli.output(`or domain registration fees.`);
    }

    @action("costs")
    costs(): void {
        if (!this.state.zone_id) {
            cli.output(JSON.stringify({
                type: "aws-route53-hosted-zone",
                costs: { month: { amount: "0", currency: "USD" } }
            }));
            return;
        }

        try {
            const zoneCost = 0.50;
            const queryCount = this.getCloudWatchMetric(
                "AWS/Route53",
                "DNSQueries",
                [{ Name: "HostedZoneId", Value: this.state.zone_id }]
            );
            const queryCost = (queryCount / 1_000_000) * 0.40;
            const totalCost = zoneCost + queryCost;

            cli.output(JSON.stringify({
                type: "aws-route53-hosted-zone",
                costs: { month: { amount: totalCost.toFixed(2), currency: "USD" } }
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "aws-route53-hosted-zone",
                costs: { month: { amount: "0", currency: "USD", error: error instanceof Error ? error.message : "Unknown error" } }
            }));
        }
    }

    private findZoneByName(zoneName: string): { zoneId: string; zoneName: string; nameServers: string[]; recordSetCount: number } | null {
        try {
            const fqdn = ensureTrailingDot(zoneName);
            const response = this.route53Request(
                "ListHostedZonesByName",
                `/hostedzonesbyname?dnsname=${encodeURIComponent(fqdn)}&maxitems=1`
            );

            const zoneBlocks = extractXMLBlocks(response.body, "HostedZone");
            for (const block of zoneBlocks) {
                const name = extractXMLValue(block, "Name");
                if (name === fqdn) {
                    const rawId = extractXMLValue(block, "Id");
                    const zoneId = rawId ? stripZoneIdPrefix(rawId) : "";
                    const recordSetCount = parseInt(extractXMLValue(block, "ResourceRecordSetCount") || "0", 10);

                    // Get name servers
                    const nsResponse = this.route53Request("GetHostedZone", `/hostedzone/${zoneId}`);
                    const nameServers = extractXMLValues(nsResponse.body, "NameServer");

                    return { zoneId, zoneName: fqdn, nameServers, recordSetCount };
                }
            }
        } catch {
            // Zone not found
        }
        return null;
    }

    private refreshState(): void {
        if (!this.state.zone_id) return;

        try {
            const response = this.route53Request("GetHostedZone", `/hostedzone/${this.state.zone_id}`);
            this.state.zone_name = extractXMLValue(response.body, "Name") || this.state.zone_name;
            this.state.record_set_count = parseInt(
                extractXMLValue(response.body, "ResourceRecordSetCount") || "0",
                10
            );
            this.state.name_servers = extractXMLValues(response.body, "NameServer");
        } catch (error) {
            cli.output(`Warning: Could not refresh zone state: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private applyTags(zoneId: string, tags: Record<string, string>): void {
        const tagXml = Object.entries(tags)
            .map(([key, value]) => `<Tag><Key>${escapeXml(key)}</Key><Value>${escapeXml(value)}</Value></Tag>`)
            .join("\n      ");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeTagsForResourceRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <AddTags>
    ${tagXml}
  </AddTags>
</ChangeTagsForResourceRequest>`;

        this.route53Request("ChangeTagsForResource", `/tags/hostedzone/${zoneId}`, "POST", xml);
        cli.output(`Applied ${Object.keys(tags).length} tag(s)`);
    }

    private deleteNonDefaultRecords(): void {
        if (!this.state.zone_id) return;

        const zoneName = this.state.zone_name || ensureTrailingDot(this.definition.zone_name);
        let hasMore = true;
        let nextName: string | undefined;
        let nextType: string | undefined;

        while (hasMore) {
            let path = `/hostedzone/${this.state.zone_id}/rrset`;
            if (nextName && nextType) {
                path += `?name=${encodeURIComponent(nextName)}&type=${encodeURIComponent(nextType)}`;
            }

            const response = this.route53Request("ListResourceRecordSets", path);

            const isTruncated = extractXMLValue(response.body, "IsTruncated") === "true";
            nextName = extractXMLValue(response.body, "NextRecordName");
            nextType = extractXMLValue(response.body, "NextRecordType");
            hasMore = isTruncated && !!nextName && !!nextType;

            const recordBlocks = extractXMLBlocks(response.body, "ResourceRecordSet");
            const changeBatchItems: string[] = [];

            for (const block of recordBlocks) {
                const recordType = extractXMLValue(block, "Type");
                const recordName = extractXMLValue(block, "Name");
                // Skip default SOA record and apex NS record (but delete subdomain NS delegations)
                if (recordType === "SOA") continue;
                if (recordType === "NS" && recordName === zoneName) continue;

                changeBatchItems.push(`
      <Change>
        <Action>DELETE</Action>
        ${block}
      </Change>`);
            }

            if (changeBatchItems.length === 0) continue;

            cli.output(`Deleting ${changeBatchItems.length} non-default record(s)...`);

            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch>
    <Changes>${changeBatchItems.join("")}
    </Changes>
  </ChangeBatch>
</ChangeResourceRecordSetsRequest>`;

            const changeResponse = this.route53Request(
                "ChangeResourceRecordSets",
                `/hostedzone/${this.state.zone_id}/rrset`,
                "POST",
                xml
            );

            const changeId = this.extractFromBody(changeResponse.body, "Id");
            if (changeId) {
                this.waitForChange(changeId);
            }
        }
    }
}
