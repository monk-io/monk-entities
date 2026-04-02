/**
 * GCP Cloud DNS Managed Zone Entity
 *
 * Creates and manages Google Cloud DNS managed zones for DNS hosting.
 *
 * @see https://cloud.google.com/dns/docs/reference/rest/v1/managedZones
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { CLOUD_DNS_API_URL, extractPriceFromSku } from "./common.ts";

/**
 * Zone visibility type
 */
export type ZoneVisibility = "public" | "private";

/**
 * Definition for a Cloud DNS Managed Zone entity
 */
export interface CloudDnsZoneDefinition extends GcpEntityDefinition {
    /**
     * @description Zone name (1-63 characters: lowercase letters, digits, or dashes)
     */
    name: string;

    /**
     * @description DNS name for the zone with trailing dot (e.g., "example.com.")
     */
    dns_name: string;

    /**
     * @description Human-readable description of the zone (up to 1024 characters)
     */
    zone_description?: string;

    /**
     * @description Zone visibility: "public" (internet-accessible) or "private" (VPC-only). Default: "public"
     */
    visibility?: ZoneVisibility;

    /**
     * @description Enable DNSSEC for the zone
     */
    dnssec_enabled?: boolean;

    /**
     * @description Labels to apply to the zone
     */
    labels?: Record<string, string>;

    /**
     * @description VPC network self-links for private zone visibility (e.g., "projects/my-project/global/networks/my-vpc")
     */
    networks?: string[];

    /**
     * @description Enable Cloud DNS query logging
     */
    logging_enabled?: boolean;
}

/**
 * State for a Cloud DNS Managed Zone entity
 */
export interface CloudDnsZoneState extends GcpEntityState {
    /**
     * @description Server-generated zone ID
     */
    zone_id?: string;

    /**
     * @description Assigned DNS nameservers for the zone
     */
    name_servers?: string[];
}

/**
 * @description GCP Cloud DNS Managed Zone entity. Creates and manages DNS zones
 * for hosting DNS records in Google Cloud DNS.
 *
 * ## Required Permissions
 * - `dns.managedZones.create` — create zones
 * - `dns.managedZones.get` — check existence and readiness
 * - `dns.managedZones.update` — update zone configuration
 * - `dns.managedZones.delete` — delete zones
 * - `dns.resourceRecordSets.list` — list record sets (list-record-sets action)
 * - `monitoring.timeSeries.list` — cost estimation metrics
 * - `cloudbilling.services.list` — cost estimation pricing
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.zone_id` — server-generated zone ID
 * - `state.name_servers` — assigned nameservers, useful for domain registrar configuration
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/cloud-dns-record-set` — create DNS records in this zone
 * - `gcp/service-usage` — enable `dns.googleapis.com` API
 */
export class CloudDnsZone extends GcpEntity<CloudDnsZoneDefinition, CloudDnsZoneState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    protected getEntityName(): string {
        return `Cloud DNS Zone ${this.definition.name || 'unnamed'}`;
    }

    /**
     * Build the API URL for managed zones
     */
    private getZonesBaseUrl(): string {
        return `${CLOUD_DNS_API_URL}/projects/${this.projectId}/managedZones`;
    }

    /**
     * Build the API URL for this specific zone
     */
    private getZoneUrl(): string {
        return `${this.getZonesBaseUrl()}/${this.definition.name}`;
    }

    /**
     * Build the zone request body from definition
     */
    private buildZoneBody(): Record<string, unknown> {
        const body: Record<string, unknown> = {
            name: this.definition.name,
            dnsName: this.definition.dns_name,
        };

        if (this.definition.zone_description) {
            body.description = this.definition.zone_description;
        }

        body.visibility = this.definition.visibility || "public";

        if (this.definition.dnssec_enabled) {
            body.dnssecConfig = {
                state: "on",
            };
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        if (this.definition.visibility === "private" && this.definition.networks) {
            body.privateVisibilityConfig = {
                networks: this.definition.networks.map((network: string) => ({
                    networkUrl: network,
                })),
            };
        }

        if (this.definition.logging_enabled) {
            body.cloudLoggingConfig = {
                enableLogging: true,
            };
        }

        return body;
    }

    override create(): void {
        const zoneUrl = this.getZoneUrl();

        // Check if zone already exists
        const existing = this.checkResourceExists(zoneUrl);
        if (existing) {
            this.state.existing = true;
            this.state.zone_id = existing.id;
            this.state.name_servers = existing.nameServers || [];
            cli.output(`Adopted existing Cloud DNS zone: ${this.definition.name}`);
            return;
        }

        // Create the zone
        const body = this.buildZoneBody();
        const result = this.post(this.getZonesBaseUrl(), body);

        this.state.zone_id = result.id;
        const nameServers: string[] = result.nameServers || [];
        this.state.name_servers = nameServers;
        this.state.existing = false;
        cli.output(`Created Cloud DNS zone: ${this.definition.name}`);
        if (nameServers.length > 0) {
            cli.output(`  Nameservers: ${nameServers.join(", ")}`);
        }
    }

    override update(): void {
        if (!this.state.zone_id) {
            this.create();
            return;
        }

        const body: Record<string, unknown> = {};

        if (this.definition.zone_description !== undefined) {
            body.description = this.definition.zone_description;
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        if (this.definition.dnssec_enabled !== undefined) {
            body.dnssecConfig = {
                state: this.definition.dnssec_enabled ? "on" : "off",
            };
        }

        if (this.definition.logging_enabled !== undefined) {
            body.cloudLoggingConfig = {
                enableLogging: this.definition.logging_enabled,
            };
        }

        if (Object.keys(body).length === 0) {
            cli.output("No updatable fields changed, skipping update");
            return;
        }

        this.patch(this.getZoneUrl(), body);
        cli.output(`Updated Cloud DNS zone: ${this.definition.name}`);
    }

    override delete(): void {
        if (!this.state.zone_id) return;

        this.deleteResource(this.getZoneUrl(), `Cloud DNS zone ${this.definition.name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.zone_id) return false;
        try {
            const result = this.get(this.getZoneUrl());
            return Boolean(result && result.nameServers && result.nameServers.length > 0);
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
     * Get zone details
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.zone_id) throw new Error("Zone not created yet");

        const info = this.get(this.getZoneUrl());
        cli.output(`\nCloud DNS Zone: ${this.definition.name}`);
        cli.output(`  DNS Name: ${info.dnsName}`);
        cli.output(`  Zone ID: ${info.id}`);
        cli.output(`  Visibility: ${info.visibility || "public"}`);
        if (info.description) {
            cli.output(`  Description: ${info.description}`);
        }
        if (info.nameServers && info.nameServers.length > 0) {
            cli.output(`  Nameservers:`);
            for (const ns of info.nameServers) {
                cli.output(`    - ${ns}`);
            }
        }
        if (info.dnssecConfig) {
            cli.output(`  DNSSEC: ${info.dnssecConfig.state || "off"}`);
        }
        if (info.labels && Object.keys(info.labels).length > 0) {
            cli.output(`  Labels: ${JSON.stringify(info.labels)}`);
        }
        if (info.cloudLoggingConfig) {
            cli.output(`  Query Logging: ${info.cloudLoggingConfig.enableLogging ? "enabled" : "disabled"}`);
        }
        cli.output(`  Created: ${info.creationTime || "unknown"}`);
    }

    /**
     * List all record sets in this zone
     */
    @action("list-record-sets")
    listRecordSets(_args?: Args): void {
        if (!this.state.zone_id) throw new Error("Zone not created yet");

        const url = `${this.getZoneUrl()}/rrsets`;
        const result = this.get(url);

        const rrsets = result.rrsets || [];
        cli.output(`\nRecord Sets for zone ${this.definition.name} (${this.definition.dns_name}):`);
        if (rrsets.length === 0) {
            cli.output("  (none)");
        } else {
            for (const rr of rrsets) {
                const data = (rr.rrdatas || []).join(", ");
                cli.output(`  ${rr.name} ${rr.type} ${rr.ttl || "-"}s  ${data}`);
            }
        }
        cli.output(`\nTotal: ${rrsets.length} record sets`);
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Fetch Cloud DNS pricing from GCP Cloud Billing Catalog API
     */
    private fetchDnsPricing(): {
        zonePerMonth: number;
        queriesPerMillion: number;
        source: string;
    } {
        try {
            const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
            const servicesUrl = `${billingApiUrl}/services?pageSize=200`;
            const servicesResp = this.get(servicesUrl);

            let serviceId = '';
            if (servicesResp.services && Array.isArray(servicesResp.services)) {
                for (const svc of servicesResp.services) {
                    if (svc.displayName && svc.displayName.toLowerCase() === 'cloud dns') {
                        serviceId = svc.name?.split('/').pop() || '';
                        break;
                    }
                }
            }

            if (!serviceId) {
                throw new Error('Cloud DNS service not found in Cloud Billing Catalog');
            }

            const skusUrl = `${billingApiUrl}/services/${serviceId}/skus?currencyCode=USD&pageSize=200`;
            const response = this.get(skusUrl);

            let zoneRate = 0;
            let queryRate = 0;

            if (response.skus && Array.isArray(response.skus)) {
                for (const sku of response.skus) {
                    const desc = (sku.description || '').toLowerCase();
                    const price = extractPriceFromSku(sku);
                    if (price <= 0) continue;

                    if (desc.includes('managed zone') && !desc.includes('query')) {
                        if (zoneRate === 0) zoneRate = price;
                    } else if (desc.includes('queries') || desc.includes('query')) {
                        if (queryRate === 0) queryRate = price;
                    }
                }
            }

            // Fallback to published pricing
            if (zoneRate === 0) zoneRate = 0.20;
            if (queryRate === 0) queryRate = 0.40;

            return {
                zonePerMonth: zoneRate,
                queriesPerMillion: queryRate,
                source: zoneRate === 0.20 ? 'Fallback pricing' : 'GCP Cloud Billing Catalog API',
            };
        } catch {
            return {
                zonePerMonth: 0.20,
                queriesPerMillion: 0.40,
                source: 'Fallback pricing (API error)',
            };
        }
    }

    /**
     * Get DNS query metrics from Cloud Monitoring
     */
    private getDnsQueryMetrics(): { totalQueries: number } {
        const metrics = { totalQueries: 0 };

        try {
            const monitoringUrl = 'https://monitoring.googleapis.com/v3';
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const endTime = now.toISOString();
            const startTime = thirtyDaysAgo.toISOString();

            const filter = `metric.type="dns.googleapis.com/query/response_count" AND resource.labels.zone_name="${this.definition.name}"`;
            const url = `${monitoringUrl}/projects/${this.projectId}/timeSeries?filter=${encodeURIComponent(filter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            try {
                const resp = this.get(url);
                if (resp.timeSeries && Array.isArray(resp.timeSeries)) {
                    for (const ts of resp.timeSeries) {
                        for (const point of ts.points || []) {
                            metrics.totalQueries += parseInt(point.value?.int64Value || point.value?.doubleValue || '0', 10);
                        }
                    }
                }
            } catch {
                // Metrics may not be available yet
            }
        } catch {
            // Return zero metrics on any error
        }

        return metrics;
    }

    /**
     * Calculate monthly cost
     */
    private calculateMonthlyCost(): { total: number; zoneCost: number; queryCost: number; pricing: any; metrics: any } {
        const pricing = this.fetchDnsPricing();
        const metrics = this.getDnsQueryMetrics();

        const zoneCost = pricing.zonePerMonth;
        const queryCost = (metrics.totalQueries / 1_000_000) * pricing.queriesPerMillion;

        return {
            total: zoneCost + queryCost,
            zoneCost,
            queryCost,
            pricing,
            metrics,
        };
    }

    /**
     * Get detailed cost estimate for this zone
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        if (!this.state.zone_id) {
            cli.output("Zone not created yet — no cost to estimate");
            return;
        }

        const { total, zoneCost, queryCost, pricing, metrics } = this.calculateMonthlyCost();

        cli.output(`\nCost Estimate for Cloud DNS Zone: ${this.definition.name}`);
        cli.output(`  Project: ${this.projectId}`);
        cli.output(`  DNS Name: ${this.definition.dns_name}`);
        cli.output(`  Pricing Source: ${pricing.source}`);

        cli.output(`\nPricing Rates:`);
        cli.output(`  Managed Zone: $${pricing.zonePerMonth.toFixed(2)}/zone/month`);
        cli.output(`  DNS Queries:  $${pricing.queriesPerMillion.toFixed(2)}/million queries`);

        cli.output(`\nUsage (last 30 days):`);
        cli.output(`  DNS Queries: ${metrics.totalQueries.toLocaleString()}`);

        cli.output(`\nCost Breakdown:`);
        cli.output(`  Zone Hosting: $${zoneCost.toFixed(2)}`);
        cli.output(`  Query Volume: $${queryCost.toFixed(4)} (${(metrics.totalQueries / 1_000_000).toFixed(4)}M queries)`);
        cli.output(`  ─────────────────`);
        cli.output(`  Estimated Monthly Total: $${total.toFixed(2)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Zone cost is $0.20/month for the first 25 zones, $0.10/month for additional`);
        cli.output(`  - Query cost is $0.40/million for the first 1B queries, $0.20/million for additional`);
        cli.output(`  - No free tier for Cloud DNS`);
    }

    /**
     * Standardized cost output for Monk billing system
     */
    @action("costs")
    costs(): void {
        if (!this.state.zone_id) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-dns-zone",
                costs: { month: { amount: "0", currency: "USD" } }
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-cloud-dns-zone",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } }
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-dns-zone",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            }));
        }
    }
}
