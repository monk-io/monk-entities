import { action, Args } from "monkec/base";
import { AWSRoute53Entity, AWSRoute53Definition, AWSRoute53State } from "./route53-base.ts";
import cli from "cli";
import {
    extractXMLValue,
    extractXMLBlocks,
    escapeXml,
} from "./common.ts";

export interface HealthCheckDefinition extends AWSRoute53Definition {
    /** @description Health check protocol type (HTTP, HTTPS, TCP, HTTP_STR_MATCH, HTTPS_STR_MATCH) */
    check_type: string;

    /** @description IP address to check */
    ip_address?: string;

    /** @description Fully qualified domain name to check */
    fqdn?: string;

    /** @description Port number (default: 80 for HTTP, 443 for HTTPS) */
    port?: number;

    /** @description URL path for HTTP/HTTPS checks */
    resource_path?: string;

    /** @description Search string for STR_MATCH check types */
    search_string?: string;

    /** @description Request interval in seconds (10 or 30, default: 30) */
    request_interval?: number;

    /** @description Failure threshold (1-10, default: 3) */
    failure_threshold?: number;

    /** @description Whether to enable SNI for HTTPS (default: true) */
    enable_sni?: boolean;

    /** @description Whether to measure latency */
    measure_latency?: boolean;

    /** @description Regions to check from */
    check_regions?: string[];

    /** @description Resource tags */
    tags?: Record<string, string>;
}

export interface HealthCheckState extends AWSRoute53State {
    /** @description Route 53 health check ID */
    health_check_id?: string;

    /** @description Health check type */
    check_type?: string;

    /** @description Target being checked */
    target?: string;

    /** @description Current health status */
    health_status?: string;
}

/**
 * @description AWS Route 53 Health Check entity.
 * Creates and manages endpoint health checks for DNS failover routing.
 * Supports HTTP, HTTPS, TCP, and string-match check types with configurable
 * intervals, failure thresholds, and regional check locations.
 *
 * ## Required Permissions
 * - `route53:CreateHealthCheck` — create health checks
 * - `route53:GetHealthCheck` — read health check configuration
 * - `route53:UpdateHealthCheck` — update check parameters
 * - `route53:DeleteHealthCheck` — delete health checks
 * - `route53:GetHealthCheckStatus` — get current health status from all regions
 * - `route53:GetHealthCheckLastFailureReason` — get last failure details
 * - `route53:ChangeTagsForResource` — manage health check tags
 *
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.health_check_id` - Health check ID, used by `aws-route53/record` for failover routing
 * - `state.check_type` - Health check protocol type
 * - `state.target` - FQDN or IP being monitored
 *
 * ## Composing with Other Entities
 * Works with:
 * - `aws-route53/record` - Associate via health_check_id for failover/weighted routing
 */
export class HealthCheck extends AWSRoute53Entity<HealthCheckDefinition, HealthCheckState> {

    static readonly readiness = { period: 15, initialDelay: 5, attempts: 20 };

    override create(): void {
        const checkType = this.definition.check_type;
        if (!checkType) throw new Error("check_type is required");

        if (!this.definition.ip_address && !this.definition.fqdn) {
            throw new Error("Either ip_address or fqdn is required");
        }

        cli.output(`Creating health check: ${checkType} for ${this.definition.fqdn || this.definition.ip_address}`);

        const callerRef = `monk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const xml = this.buildCreateHealthCheckXml(callerRef);

        const response = this.route53Request("CreateHealthCheck", "/healthcheck", "POST", xml);

        const healthCheckBlock = extractXMLValue(response.body, "Id");
        if (!healthCheckBlock) {
            throw new Error("Failed to extract health check ID from response");
        }

        this.state.existing = false;
        this.state.health_check_id = healthCheckBlock;
        this.state.check_type = checkType;
        this.state.target = this.definition.fqdn || this.definition.ip_address;

        // Apply tags
        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            this.applyTags(this.state.health_check_id, this.definition.tags);
        }

        cli.output(`Health check created: ${this.state.health_check_id}`);
    }

    override update(): void {
        if (!this.state.health_check_id) {
            this.create();
            return;
        }

        cli.output(`Updating health check: ${this.state.health_check_id}`);

        const xml = this.buildUpdateHealthCheckXml();
        this.route53Request(
            "UpdateHealthCheck",
            `/healthcheck/${this.state.health_check_id}`,
            "POST",
            xml
        );

        // Update tags
        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            this.applyTags(this.state.health_check_id, this.definition.tags);
        }

        this.state.target = this.definition.fqdn || this.definition.ip_address;
        cli.output(`Health check updated`);
    }

    override delete(): void {
        if (!this.state.health_check_id) return;

        if (this.state.existing) {
            cli.output(`Health check was pre-existing, skipping deletion: ${this.state.health_check_id}`);
            return;
        }

        cli.output(`Deleting health check: ${this.state.health_check_id}`);
        this.route53Request(
            "DeleteHealthCheck",
            `/healthcheck/${this.state.health_check_id}`,
            "DELETE"
        );
        cli.output(`Health check deleted`);
    }

    override checkReadiness(): boolean {
        if (!this.state.health_check_id) return false;

        try {
            const response = this.route53Request(
                "GetHealthCheck",
                `/healthcheck/${this.state.health_check_id}`
            );
            return response.statusCode === 200;
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    @action("get-status")
    getStatus(_args?: Args): void {
        if (!this.state.health_check_id) throw new Error("Health check not created yet");

        const response = this.route53Request(
            "GetHealthCheckStatus",
            `/healthcheck/${this.state.health_check_id}/status`
        );

        const statusBlocks = extractXMLBlocks(response.body, "HealthCheckObservation");

        cli.output(`=== Health Check Status ===`);
        cli.output(`Health Check ID: ${this.state.health_check_id}`);
        cli.output(`Type: ${this.state.check_type}`);
        cli.output(`Target: ${this.state.target}`);
        cli.output(``);

        for (const block of statusBlocks) {
            const region = extractXMLValue(block, "Region") || "unknown";
            const ipAddress = extractXMLValue(block, "IPAddress") || "unknown";
            const status = extractXMLValue(block, "Status") || "unknown";

            cli.output(`  ${region} (${ipAddress}): ${status}`);
        }
    }

    @action("get-last-failure-reason")
    getLastFailureReason(_args?: Args): void {
        if (!this.state.health_check_id) throw new Error("Health check not created yet");

        const response = this.route53Request(
            "GetHealthCheckLastFailureReason",
            `/healthcheck/${this.state.health_check_id}/lastfailurereason`
        );

        const observationBlocks = extractXMLBlocks(response.body, "HealthCheckObservation");

        cli.output(`=== Last Failure Reason ===`);
        cli.output(`Health Check ID: ${this.state.health_check_id}`);
        cli.output(``);

        if (observationBlocks.length === 0) {
            cli.output(`No failure observations found.`);
            return;
        }

        for (const block of observationBlocks) {
            const region = extractXMLValue(block, "Region") || "unknown";
            const ipAddress = extractXMLValue(block, "IPAddress") || "unknown";
            const status = extractXMLValue(block, "Status") || "unknown";

            cli.output(`  ${region} (${ipAddress}): ${status}`);
        }
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(`=== Route 53 Health Check Cost Estimate ===`);
        cli.output(`Health Check ID: ${this.state.health_check_id || "not created"}`);
        cli.output(`Type: ${this.definition.check_type}`);
        cli.output(`Target: ${this.definition.fqdn || this.definition.ip_address}`);
        cli.output(``);

        let monthlyCost = 0;

        // Base health check cost
        const isAwsEndpoint = this.isPrivateIp(this.definition.ip_address);
        const baseCost = isAwsEndpoint ? 0.50 : 0.75;
        monthlyCost += baseCost;
        cli.output(`Pricing:`);
        cli.output(`  Base Health Check: $${baseCost.toFixed(2)}/month ${isAwsEndpoint ? "(AWS endpoint)" : "(non-AWS endpoint)"}`);

        // HTTPS add-on
        if (this.definition.check_type === "HTTPS" || this.definition.check_type === "HTTPS_STR_MATCH") {
            monthlyCost += 1.00;
            cli.output(`  HTTPS: +$1.00/month`);
        }

        // String match add-on
        if (this.definition.check_type === "HTTP_STR_MATCH" || this.definition.check_type === "HTTPS_STR_MATCH") {
            monthlyCost += 2.00;
            cli.output(`  String Matching: +$2.00/month`);
        }

        // Fast interval add-on
        if (this.definition.request_interval === 10) {
            monthlyCost += 1.00;
            cli.output(`  Fast Interval (10s): +$1.00/month`);
        }

        // Latency measurement add-on
        if (this.definition.measure_latency) {
            monthlyCost += 1.00;
            cli.output(`  Latency Measurement: +$1.00/month (optional)`);
        }

        cli.output(``);
        cli.output(`Estimated Monthly Cost: $${monthlyCost.toFixed(2)}`);
    }

    @action("costs")
    costs(): void {
        if (!this.state.health_check_id) {
            cli.output(JSON.stringify({
                type: "aws-route53-health-check",
                costs: { month: { amount: "0", currency: "USD" } }
            }));
            return;
        }

        try {
            let monthlyCost = this.isPrivateIp(this.definition.ip_address) ? 0.50 : 0.75;

            if (this.definition.check_type === "HTTPS" || this.definition.check_type === "HTTPS_STR_MATCH") {
                monthlyCost += 1.00;
            }
            if (this.definition.check_type === "HTTP_STR_MATCH" || this.definition.check_type === "HTTPS_STR_MATCH") {
                monthlyCost += 2.00;
            }
            if (this.definition.request_interval === 10) {
                monthlyCost += 1.00;
            }
            if (this.definition.measure_latency) {
                monthlyCost += 1.00;
            }

            cli.output(JSON.stringify({
                type: "aws-route53-health-check",
                costs: { month: { amount: monthlyCost.toFixed(2), currency: "USD" } }
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "aws-route53-health-check",
                costs: { month: { amount: "0", currency: "USD", error: error instanceof Error ? error.message : "Unknown error" } }
            }));
        }
    }

    private buildCreateHealthCheckXml(callerRef: string): string {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<CreateHealthCheckRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <CallerReference>${escapeXml(callerRef)}</CallerReference>
  <HealthCheckConfig>
    <Type>${escapeXml(this.definition.check_type)}</Type>`;

        if (this.definition.ip_address) {
            xml += `
    <IPAddress>${escapeXml(this.definition.ip_address)}</IPAddress>`;
        }

        if (this.definition.fqdn) {
            xml += `
    <FullyQualifiedDomainName>${escapeXml(this.definition.fqdn)}</FullyQualifiedDomainName>`;
        }

        if (this.definition.port !== undefined) {
            xml += `
    <Port>${this.definition.port}</Port>`;
        }

        if (this.definition.resource_path) {
            xml += `
    <ResourcePath>${escapeXml(this.definition.resource_path)}</ResourcePath>`;
        }

        if (this.definition.search_string) {
            xml += `
    <SearchString>${escapeXml(this.definition.search_string)}</SearchString>`;
        }

        if (this.definition.request_interval !== undefined) {
            xml += `
    <RequestInterval>${this.definition.request_interval}</RequestInterval>`;
        }

        if (this.definition.failure_threshold !== undefined) {
            xml += `
    <FailureThreshold>${this.definition.failure_threshold}</FailureThreshold>`;
        }

        if (this.definition.enable_sni !== undefined) {
            xml += `
    <EnableSNI>${this.definition.enable_sni}</EnableSNI>`;
        }

        if (this.definition.measure_latency) {
            xml += `
    <MeasureLatency>true</MeasureLatency>`;
        }

        if (this.definition.check_regions && this.definition.check_regions.length > 0) {
            xml += `
    <Regions>`;
            for (const region of this.definition.check_regions) {
                xml += `
      <Region>${escapeXml(region)}</Region>`;
            }
            xml += `
    </Regions>`;
        }

        xml += `
  </HealthCheckConfig>
</CreateHealthCheckRequest>`;

        return xml;
    }

    private buildUpdateHealthCheckXml(): string {
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<UpdateHealthCheckRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">`;

        if (this.definition.ip_address) {
            xml += `
  <IPAddress>${escapeXml(this.definition.ip_address)}</IPAddress>`;
        }

        if (this.definition.fqdn) {
            xml += `
  <FullyQualifiedDomainName>${escapeXml(this.definition.fqdn)}</FullyQualifiedDomainName>`;
        }

        if (this.definition.port !== undefined) {
            xml += `
  <Port>${this.definition.port}</Port>`;
        }

        if (this.definition.resource_path !== undefined) {
            xml += `
  <ResourcePath>${escapeXml(this.definition.resource_path)}</ResourcePath>`;
        }

        if (this.definition.search_string !== undefined) {
            xml += `
  <SearchString>${escapeXml(this.definition.search_string)}</SearchString>`;
        }

        if (this.definition.failure_threshold !== undefined) {
            xml += `
  <FailureThreshold>${this.definition.failure_threshold}</FailureThreshold>`;
        }

        if (this.definition.enable_sni !== undefined) {
            xml += `
  <EnableSNI>${this.definition.enable_sni}</EnableSNI>`;
        }

        if (this.definition.check_regions && this.definition.check_regions.length > 0) {
            xml += `
  <Regions>`;
            for (const region of this.definition.check_regions) {
                xml += `
    <Region>${escapeXml(region)}</Region>`;
            }
            xml += `
  </Regions>`;
        }

        xml += `
</UpdateHealthCheckRequest>`;

        return xml;
    }

    private applyTags(healthCheckId: string, tags: Record<string, string>): void {
        const tagXml = Object.entries(tags)
            .map(([key, value]) => `<Tag><Key>${escapeXml(key)}</Key><Value>${escapeXml(value)}</Value></Tag>`)
            .join("\n      ");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeTagsForResourceRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <AddTags>
    ${tagXml}
  </AddTags>
</ChangeTagsForResourceRequest>`;

        this.route53Request("ChangeTagsForResource", `/tags/healthcheck/${healthCheckId}`, "POST", xml);
        cli.output(`Applied ${Object.keys(tags).length} tag(s) to health check`);
    }

    private isPrivateIp(ip: string | undefined): boolean {
        if (!ip) return false;
        if (ip.startsWith("10.")) return true;
        if (ip.startsWith("192.168.")) return true;
        // RFC 1918: 172.16.0.0 - 172.31.255.255
        if (ip.startsWith("172.")) {
            const secondOctet = parseInt(ip.split(".")[1], 10);
            return secondOctet >= 16 && secondOctet <= 31;
        }
        return false;
    }
}
