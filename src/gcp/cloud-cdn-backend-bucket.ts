/**
 * GCP Cloud CDN Backend Bucket Entity
 *
 * Creates and manages Compute Engine backend buckets with Cloud CDN enabled.
 * Backend buckets serve static content from a GCS bucket through Cloud CDN's
 * global edge network.
 *
 * @see https://cloud.google.com/cdn/docs/setting-up-cdn-with-bucket
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/backendBuckets
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import {
    COMPUTE_API_URL,
    CdnCacheMode,
    NegativeCachingPolicy,
    CdnCompressionMode,
    extractPriceFromSku,
} from "./common.ts";

/**
 * Cloud CDN Backend Bucket definition
 */
export interface CloudCdnBackendBucketDefinition extends GcpEntityDefinition {
    /**
     * @description Backend bucket name (1-63 chars, lowercase letters, digits, dashes)
     */
    name: string;

    /**
     * @description GCS bucket name to serve content from
     */
    bucket_name: string;

    /**
     * @description Enable Cloud CDN for this backend bucket
     */
    enable_cdn?: boolean;

    /**
     * @description Cache mode controlling how caching decisions are made
     */
    cache_mode?: CdnCacheMode;

    /**
     * @description Default TTL in seconds when origin has no valid TTL (default: 3600)
     */
    default_ttl?: number;

    /**
     * @description Maximum TTL cap in seconds (default: 86400)
     */
    max_ttl?: number;

    /**
     * @description Client/browser-side TTL in seconds
     */
    client_ttl?: number;

    /**
     * @description Enable caching of error responses
     */
    negative_caching?: boolean;

    /**
     * @description Per-status-code negative caching TTL policies
     */
    negative_caching_policies?: NegativeCachingPolicy[];

    /**
     * @description Seconds to serve stale content while revalidating (default: 86400)
     */
    serve_while_stale?: number;

    /**
     * @description Collapse concurrent cache fill requests for the same key
     */
    request_coalescing?: boolean;

    /**
     * @description Max age in seconds for signed URL cached responses
     */
    signed_url_cache_max_age_sec?: number;

    /**
     * @description HTTP headers to include in the cache key
     */
    cache_key_include_http_headers?: string[];

    /**
     * @description Named cookies to include in the cache key
     */
    cache_key_include_named_cookies?: string[];

    /**
     * @description Request headers that trigger cache bypass (up to 5)
     */
    bypass_cache_on_request_headers?: string[];

    /**
     * @description Human-readable description
     */
    backend_bucket_description?: string;

    /**
     * @description Custom response headers to add (e.g., "X-Cache-Status:{cdn_cache_status}")
     */
    custom_response_headers?: string[];

    /**
     * @description Response compression mode
     */
    compression_mode?: CdnCompressionMode;
}

/**
 * Cloud CDN Backend Bucket state
 */
export interface CloudCdnBackendBucketState extends GcpEntityState {
    /**
     * @description Server-generated numeric ID
     */
    id?: string;

    /**
     * @description Full resource self-link URL
     */
    self_link?: string;
}

/**
 * @description Manages a Compute Engine backend bucket with Cloud CDN enabled.
 * Serves static content from a GCS bucket through Google's global CDN edge network.
 * Supports cache mode configuration, TTLs, signed URLs, negative caching,
 * cache key policies, and response compression.
 *
 * ## Required Permissions
 * - `compute.backendBuckets.create` — create backend buckets
 * - `compute.backendBuckets.get` — check backend bucket status
 * - `compute.backendBuckets.update` — update backend buckets
 * - `compute.backendBuckets.delete` — delete backend buckets
 * - `compute.globalOperations.get` — poll long-running operations
 * - `monitoring.timeSeries.list` — cost estimation metrics
 * - `cloudbilling.services.list` — cost estimation pricing
 *
 * ## Secrets
 * - Reads: none (authenticated via gcp provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.id` - Numeric backend bucket ID
 * - `state.self_link` - Full resource URL for use in URL maps
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/cloud-storage` — GCS bucket that serves as the origin
 * - `gcp/service-usage` — enable compute.googleapis.com API
 */
export class CloudCdnBackendBucket extends GcpEntity<CloudCdnBackendBucketDefinition, CloudCdnBackendBucketState> {

    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    protected getEntityName(): string {
        return `Cloud CDN Backend Bucket ${this.definition.name || 'unnamed'}`;
    }

    private getResourceUrl(): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global/backendBuckets/${this.definition.name}`;
    }

    private getCollectionUrl(): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global/backendBuckets`;
    }

    private getOperationUrl(operationName: string): string {
        return `${COMPUTE_API_URL}/projects/${this.projectId}/global/operations/${operationName}`;
    }

    private getBackendBucket(): any | null {
        return this.checkResourceExists(this.getResourceUrl());
    }

    private populateState(resource: any): void {
        this.state.id = resource.id?.toString();
        this.state.self_link = resource.selfLink;
    }

    private buildCdnPolicy(): any {
        const policy: any = {};

        const cacheMode = this.definition.cache_mode || "CACHE_ALL_STATIC";
        policy.cacheMode = cacheMode;

        // TTL fields: defaultTtl and clientTtl allowed for CACHE_ALL_STATIC and FORCE_CACHE_ALL
        // maxTtl only allowed for CACHE_ALL_STATIC
        if (cacheMode !== "USE_ORIGIN_HEADERS") {
            if (this.definition.default_ttl !== undefined) {
                policy.defaultTtl = this.definition.default_ttl;
            }
            if (this.definition.client_ttl !== undefined) {
                policy.clientTtl = this.definition.client_ttl;
            }
            if (cacheMode === "CACHE_ALL_STATIC") {
                if (this.definition.max_ttl !== undefined) {
                    policy.maxTtl = this.definition.max_ttl;
                }
            }
        }

        if (this.definition.negative_caching !== undefined) {
            policy.negativeCaching = this.definition.negative_caching;
        }

        if (this.definition.negative_caching_policies && this.definition.negative_caching_policies.length > 0) {
            policy.negativeCachingPolicy = this.definition.negative_caching_policies.map((p: NegativeCachingPolicy) => ({
                code: p.code,
                ttl: p.ttl,
            }));
        }

        if (this.definition.serve_while_stale !== undefined) {
            policy.serveWhileStale = this.definition.serve_while_stale;
        }

        if (this.definition.request_coalescing !== undefined) {
            policy.requestCoalescing = this.definition.request_coalescing;
        }

        if (this.definition.signed_url_cache_max_age_sec !== undefined) {
            policy.signedUrlCacheMaxAgeSec = this.definition.signed_url_cache_max_age_sec.toString();
        }

        if (this.definition.cache_key_include_http_headers || this.definition.cache_key_include_named_cookies) {
            const cacheKeyPolicy: any = {};
            if (this.definition.cache_key_include_http_headers) {
                cacheKeyPolicy.includeHttpHeaders = this.definition.cache_key_include_http_headers;
            }
            if (this.definition.cache_key_include_named_cookies) {
                cacheKeyPolicy.includeNamedCookies = this.definition.cache_key_include_named_cookies;
            }
            policy.cacheKeyPolicy = cacheKeyPolicy;
        }

        if (this.definition.bypass_cache_on_request_headers && this.definition.bypass_cache_on_request_headers.length > 0) {
            policy.bypassCacheOnRequestHeaders = this.definition.bypass_cache_on_request_headers.map((h: string) => ({
                headerName: h,
            }));
        }

        return policy;
    }

    private buildResourceBody(): any {
        const body: any = {
            name: this.definition.name,
            bucketName: this.definition.bucket_name,
            enableCdn: this.definition.enable_cdn !== false,
        };

        if (body.enableCdn) {
            body.cdnPolicy = this.buildCdnPolicy();
        }

        if (this.definition.backend_bucket_description) {
            body.description = this.definition.backend_bucket_description;
        }

        if (this.definition.custom_response_headers) {
            body.customResponseHeaders = this.definition.custom_response_headers;
        }

        if (this.definition.compression_mode) {
            body.compressionMode = this.definition.compression_mode;
        }

        return body;
    }

    private waitForComputeOperation(operationName: string): void {
        const opName = operationName.split("/").pop() || operationName;
        const operationUrl = this.getOperationUrl(opName);
        this.waitForOperation(operationUrl, 60, 5000);
    }

    override create(): void {
        const existing = this.getBackendBucket();
        if (existing) {
            cli.output(`Backend bucket ${this.definition.name} already exists, adopting`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        cli.output(`Creating Cloud CDN backend bucket: ${this.definition.name}`);
        const body = this.buildResourceBody();
        const operation = this.post(this.getCollectionUrl(), body);

        if (operation?.name) {
            cli.output("Waiting for backend bucket creation...");
            this.waitForComputeOperation(operation.name);
        }

        const resource = this.getBackendBucket();
        if (resource) {
            this.populateState(resource);
        }
        this.state.existing = false;

        cli.output(`Backend bucket ${this.definition.name} created with CDN ${this.definition.enable_cdn !== false ? 'enabled' : 'disabled'}`);
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        cli.output(`Updating Cloud CDN backend bucket: ${this.definition.name}`);
        const body = this.buildResourceBody();
        const operation = this.put(this.getResourceUrl(), body);

        if (operation?.name) {
            cli.output("Waiting for backend bucket update...");
            this.waitForComputeOperation(operation.name);
        }

        const resource = this.getBackendBucket();
        if (resource) {
            this.populateState(resource);
        }

        cli.output(`Backend bucket ${this.definition.name} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Backend bucket ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getBackendBucket();
        if (!existing) {
            cli.output(`Backend bucket ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting backend bucket: ${this.definition.name}`);
        const operation = this.httpDelete(this.getResourceUrl());

        if (operation?.name) {
            cli.output("Waiting for backend bucket deletion...");
            this.waitForComputeOperation(operation.name);
        }

        cli.output(`Backend bucket ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const resource = this.getBackendBucket();
        if (!resource) {
            cli.output("Backend bucket not found");
            return false;
        }

        this.populateState(resource);
        cli.output(`Backend bucket ${this.definition.name} is ready (CDN: ${resource.enableCdn ? 'enabled' : 'disabled'})`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getBackendBucket() !== null;
    }

    // ==================== ACTIONS ====================

    @action("get-info")
    getInfo(_args?: Args): void {
        const resource = this.getBackendBucket();
        if (!resource) {
            throw new Error("Backend bucket not found");
        }
        cli.output(JSON.stringify(resource, null, 2));
    }

    // ==================== COST ESTIMATION ====================

    private fetchCdnPricing(): {
        egressPerGib: number;
        requestPer10k: number;
        cacheFillPerGib: number;
        source: string;
    } {
        try {
            const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
            const cdnServiceId = '4ADE-D572-D8CE';
            const skusUrl = `${billingApiUrl}/services/${cdnServiceId}/skus?currencyCode=USD`;
            const response = this.get(skusUrl);

            if (response.skus && Array.isArray(response.skus)) {
                let egressRate = 0;
                let requestRate = 0;
                let fillRate = 0;

                for (const sku of response.skus) {
                    const desc = (sku.description || '').toLowerCase();
                    const price = extractPriceFromSku(sku);
                    if (price <= 0) continue;

                    if (desc.includes('cache egress') && desc.includes('north america')) {
                        egressRate = price;
                    } else if (desc.includes('cache lookup') || desc.includes('http request')) {
                        requestRate = price;
                    } else if (desc.includes('cache fill') && desc.includes('intra')) {
                        fillRate = price;
                    }
                }

                if (egressRate > 0) {
                    return {
                        egressPerGib: egressRate,
                        requestPer10k: requestRate > 0 ? requestRate : 0.0075,
                        cacheFillPerGib: fillRate > 0 ? fillRate : 0.01,
                        source: 'GCP Cloud Billing Catalog API',
                    };
                }
            }
        } catch {
            // Fall through to published pricing
        }

        return {
            egressPerGib: 0.08,
            requestPer10k: 0.0075,
            cacheFillPerGib: 0.01,
            source: 'Published pricing (fallback)',
        };
    }

    private getCdnMetrics(): { requestCount: number; egressBytes: number } | null {
        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const backendName = this.definition.name;

            const filter = encodeURIComponent(
                `metric.type="loadbalancing.googleapis.com/https/backend_request_count" AND resource.labels.backend_name="${backendName}"`
            );
            const url = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${filter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let requestCount = 0;
            try {
                const response = this.get(url);
                if (response.timeSeries && response.timeSeries.length > 0) {
                    for (const ts of response.timeSeries) {
                        for (const point of (ts.points || [])) {
                            requestCount += parseInt(point.value?.int64Value || point.value?.doubleValue || '0', 10);
                        }
                    }
                }
            } catch {
                // Metrics may not be available
            }

            const egressFilter = encodeURIComponent(
                `metric.type="loadbalancing.googleapis.com/https/backend_response_bytes_count" AND resource.labels.backend_name="${backendName}"`
            );
            const egressUrl = `https://monitoring.googleapis.com/v3/projects/${this.projectId}/timeSeries?filter=${egressFilter}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            let egressBytes = 0;
            try {
                const egressResponse = this.get(egressUrl);
                if (egressResponse.timeSeries && egressResponse.timeSeries.length > 0) {
                    for (const ts of egressResponse.timeSeries) {
                        for (const point of (ts.points || [])) {
                            egressBytes += parseFloat(point.value?.doubleValue || point.value?.int64Value || '0');
                        }
                    }
                }
            } catch {
                // Metrics may not be available
            }

            return { requestCount, egressBytes };
        } catch {
            return null;
        }
    }

    private calculateMonthlyCost(): { total: number; pricing: any; metrics: any } {
        const pricing = this.fetchCdnPricing();
        const metrics = this.getCdnMetrics();

        let totalMonthlyCost = 0;

        if (metrics) {
            const egressGib = metrics.egressBytes / (1024 * 1024 * 1024);
            const egressCost = egressGib * pricing.egressPerGib;
            const requestCost = (metrics.requestCount / 10000) * pricing.requestPer10k;
            const fillCost = egressGib * 0.1 * pricing.cacheFillPerGib;
            totalMonthlyCost = egressCost + requestCost + fillCost;
        }

        return { total: totalMonthlyCost, pricing, metrics };
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const name = this.definition.name;

        cli.output(`\nCost Estimate for Cloud CDN Backend Bucket: ${name}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\nConfiguration:`);
        cli.output(`  Name: ${name}`);
        cli.output(`  GCS Bucket: ${this.definition.bucket_name}`);
        cli.output(`  CDN Enabled: ${this.definition.enable_cdn !== false}`);
        cli.output(`  Cache Mode: ${this.definition.cache_mode || 'CACHE_ALL_STATIC'}`);

        const { total, pricing, metrics } = this.calculateMonthlyCost();

        cli.output(`\nPricing (${pricing.source}):`);
        cli.output(`  Cache Egress: $${pricing.egressPerGib.toFixed(4)}/GiB`);
        cli.output(`  Requests: $${pricing.requestPer10k.toFixed(4)}/10k requests`);
        cli.output(`  Cache Fill: $${pricing.cacheFillPerGib.toFixed(4)}/GiB`);

        if (metrics && metrics.requestCount > 0) {
            const egressGib = metrics.egressBytes / (1024 * 1024 * 1024);
            cli.output(`\nUsage (Last 30 Days from Cloud Monitoring):`);
            cli.output(`  Requests: ${metrics.requestCount.toLocaleString()}`);
            cli.output(`  Egress: ${egressGib.toFixed(2)} GiB`);
        } else {
            cli.output(`\nNo usage metrics available from Cloud Monitoring`);
        }

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`ESTIMATED MONTHLY COST: $${total.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Cache egress pricing is tiered; shown rate is for first 10 TiB/month`);
        cli.output(`  - Cache fill cost estimated at 10% of egress (actual depends on hit rate)`);
        cli.output(`  - Does not include: GCS storage costs, SSL certificate costs`);
    }

    @action("costs")
    costs(_args?: Args): void {
        if (!this.state.id) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-cdn-backend-bucket",
                costs: { month: { amount: "0", currency: "USD" } },
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-cloud-cdn-backend-bucket",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } },
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-cloud-cdn-backend-bucket",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } },
            }));
        }
    }
}
