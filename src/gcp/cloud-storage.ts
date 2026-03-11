/**
 * GCP Cloud Storage Bucket Entity
 *
 * Creates and manages Cloud Storage buckets for object storage.
 *
 * @see https://cloud.google.com/storage/docs/buckets
 * @see https://cloud.google.com/storage/docs/json_api/v1/buckets
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import {
    CLOUD_STORAGE_API_URL,
    StorageClass,
    StorageLocation,
    PredefinedAcl,
    PublicAccessPrevention,
} from "./common.ts";

/**
 * Lifecycle rule action configuration
 */
export interface LifecycleAction {
    /**
     * @description Action type: Delete, SetStorageClass, or AbortIncompleteMultipartUpload
     */
    type: "Delete" | "SetStorageClass" | "AbortIncompleteMultipartUpload";

    /**
     * @description Target storage class (when type is SetStorageClass)
     */
    storageClass?: StorageClass;
}

/**
 * Lifecycle rule condition configuration
 */
export interface LifecycleCondition {
    /**
     * @description Object age in days
     */
    age?: number;

    /**
     * @description Created before date (YYYY-MM-DD)
     */
    createdBefore?: string;

    /**
     * @description Custom time before date (YYYY-MM-DD)
     */
    customTimeBefore?: string;

    /**
     * @description Days since custom time
     */
    daysSinceCustomTime?: number;

    /**
     * @description Days since becoming non-current
     */
    daysSinceNoncurrentTime?: number;

    /**
     * @description Is live object (not archived version)
     */
    isLive?: boolean;

    /**
     * @description Match storage class
     */
    matchesStorageClass?: StorageClass[];

    /**
     * @description Match name prefix patterns
     */
    matchesPrefix?: string[];

    /**
     * @description Match name suffix patterns
     */
    matchesSuffix?: string[];

    /**
     * @description Number of newer versions
     */
    numNewerVersions?: number;

    /**
     * @description Non-current time before date (YYYY-MM-DD)
     */
    noncurrentTimeBefore?: string;
}

/**
 * Lifecycle rule configuration
 */
export interface LifecycleRule {
    action: LifecycleAction;
    condition: LifecycleCondition;
}

/**
 * CORS configuration for a bucket
 */
export interface CorsConfiguration {
    /**
     * @description Allowed origins (e.g., ["https://example.com"])
     */
    origin?: string[];

    /**
     * @description Allowed HTTP methods (e.g., ["GET", "POST"])
     */
    method?: string[];

    /**
     * @description Allowed request headers
     */
    responseHeader?: string[];

    /**
     * @description Max age in seconds for preflight cache
     */
    maxAgeSeconds?: number;
}

/**
 * Cloud Storage Bucket entity definition
 * @interface CloudStorageDefinition
 */
export interface CloudStorageDefinition extends GcpEntityDefinition {
    /**
     * @description Bucket name (must be globally unique).
     * Names must be 3-63 characters, start with a letter or number,
     * and contain only lowercase letters, numbers, hyphens, and underscores.
     */
    name: string;

    /**
     * @description Location for the bucket.
     * - Multi-regions: US, EU, ASIA (highest availability)
     * - Dual-regions: NAM4, EUR4, ASIA1 (cross-region redundancy)
     * - Regions: us-central1, europe-west1, etc. (lowest latency)
     * @default US
     * @see StorageLocation for valid values
     */
    location?: StorageLocation;

    /**
     * @description Storage class for the bucket.
     * - STANDARD: Frequently accessed data, highest performance
     * - NEARLINE: Data accessed < once per month (30-day minimum)
     * - COLDLINE: Data accessed < once per quarter (90-day minimum)
     * - ARCHIVE: Data accessed < once per year (365-day minimum)
     * @default STANDARD
     */
    storage_class?: StorageClass;

    /**
     * @description Predefined ACL applied when creating the bucket.
     * Use uniform_bucket_level_access instead for new buckets.
     * @see PredefinedAcl for valid values
     */
    predefined_acl?: PredefinedAcl;

    /**
     * @description Default ACL for objects created in this bucket
     */
    predefined_default_object_acl?: PredefinedAcl;

    /**
     * @description Enable object versioning.
     * Keeps previous versions of objects when overwritten or deleted.
     * @default false
     */
    versioning_enabled?: boolean;

    /**
     * @description Enable uniform bucket-level access (recommended).
     * When enabled, ACLs are disabled and only IAM controls access.
     * @default true
     */
    uniform_bucket_level_access?: boolean;

    /**
     * @description Public access prevention setting.
     * - inherited: Public access allowed (subject to ACLs/IAM)
     * - enforced: Public access blocked at bucket level
     * @default inherited
     */
    public_access_prevention?: PublicAccessPrevention;

    /**
     * @description Key-value labels for organizing buckets
     */
    labels?: Record<string, string>;

    /**
     * @description Lifecycle rules as JSON string.
     * Array of LifecycleRule objects for automatic object management.
     * @example '[{"action":{"type":"Delete"},"condition":{"age":365}}]'
     */
    lifecycle_rules?: string;

    /**
     * @description CORS configuration as JSON string.
     * Array of CorsConfiguration objects for cross-origin access.
     * @example '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]'
     */
    cors?: string;

    /**
     * @description Default event-based hold on new objects
     * @default false
     */
    default_event_based_hold?: boolean;

    /**
     * @description Retention period in seconds for object retention policy
     */
    retention_period_seconds?: number;

    /**
     * @description Enable requester pays (requesters pay for data access)
     * @default false
     */
    requester_pays?: boolean;

    /**
     * @description Custom Cloud KMS key for bucket encryption
     * Format: projects/{project}/locations/{location}/keyRings/{keyRing}/cryptoKeys/{key}
     */
    kms_key_name?: string;
}

/**
 * Cloud Storage Bucket entity state
 * @interface CloudStorageState
 */
export interface CloudStorageState extends GcpEntityState {
    /**
     * @description Bucket name
     */
    name?: string;

    /**
     * @description Bucket ID (project number + bucket name)
     */
    id?: string;

    /**
     * @description Self-link URL for the bucket
     */
    self_link?: string;

    /**
     * @description Bucket location (e.g., US, EU, us-central1)
     */
    location?: string;

    /**
     * @description Storage class (STANDARD, NEARLINE, COLDLINE, ARCHIVE)
     */
    storage_class?: string;

    /**
     * @description Bucket creation timestamp (RFC3339)
     */
    time_created?: string;

    /**
     * @description Last update timestamp (RFC3339)
     */
    updated?: string;

    /**
     * @description Whether versioning is enabled
     */
    versioning_enabled?: boolean;

    /**
     * @description GCS URI for the bucket (gs://bucket-name)
     */
    gs_uri?: string;
}

/**
 * Cloud Storage Bucket entity
 *
 * Creates and manages Cloud Storage buckets for storing objects (files, blobs).
 * Supports storage classes, lifecycle management, versioning, and encryption.
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## Dependencies
 * - `storage.googleapis.com` API is typically enabled by default in GCP projects
 * - For custom encryption, may require `cloudkms.googleapis.com` API
 *
 * ## State Fields for Composition
 * The following state fields can be used by other entities or applications:
 * - `state.gs_uri` - GCS URI for the bucket (format: gs://bucket-name)
 * - `state.name` - Bucket name for SDK/API operations
 * - `state.location` - Bucket location (important for data locality)
 * - `state.self_link` - Full resource URL
 *
 * ## Composing with Other Entities
 * Cloud Storage buckets work well with:
 * - `gcp/service-account` - Create a service account with storage roles for access
 * - `gcp/big-query` - Export/import data between GCS and BigQuery
 *
 * ## Accessing Bucket Data
 * Applications can access bucket objects using:
 * - GCS URI: `state.gs_uri` + `/path/to/object`
 * - HTTPS URL: `https://storage.googleapis.com/{bucket}/{object}`
 *
 * ## S3-Compatible (XML API) Access
 * Cloud Storage supports an S3-compatible XML API for simple migrations.
 * Use `gcp/cloud-storage-hmac-keys` to generate HMAC credentials and
 * point your S3-compatible clients to `https://storage.googleapis.com`.
 * Make sure `storage.googleapis.com` is enabled via `gcp/service-usage`,
 * and use a `gcp/service-account` email for the HMAC key.
 *
 * @example S3-compatible access (HMAC keys)
 * ```yaml
 * storage-hmac-keys:
 *   defines: gcp/cloud-storage-hmac-keys
 *   service_account_email: <- connection-target("sa") entity-state get-member("email")
 *   access_key_secret_ref: gcs-hmac-access-key
 *   secret_key_secret_ref: gcs-hmac-secret-key
 *   permitted-secrets:
 *     gcs-hmac-access-key: true
 *     gcs-hmac-secret-key: true
 *   connections:
 *     sa:
 *       runnable: gcp/service-account/my-sa
 *       service: service-account
 * ```
 *
 * @see https://cloud.google.com/storage/docs/buckets
 * @see https://cloud.google.com/storage/docs/aws-simple-migration
 *
 * @example Basic bucket
 * ```yaml
 * my-bucket:
 *   defines: gcp/cloud-storage
 *   name: my-unique-bucket-name
 *   location: US
 *   storage_class: STANDARD
 *   uniform_bucket_level_access: true
 * ```
 *
 * @example Regional bucket with lifecycle rules
 * ```yaml
 * data-bucket:
 *   defines: gcp/cloud-storage
 *   name: my-project-data-bucket
 *   location: us-central1
 *   storage_class: STANDARD
 *   versioning_enabled: true
 *   labels:
 *     environment: production
 *     team: data-engineering
 *   lifecycle_rules: |
 *     [
 *       {"action":{"type":"SetStorageClass","storageClass":"NEARLINE"},"condition":{"age":30}},
 *       {"action":{"type":"SetStorageClass","storageClass":"COLDLINE"},"condition":{"age":90}},
 *       {"action":{"type":"Delete"},"condition":{"age":365}}
 *     ]
 * ```
 *
 * @example Archive bucket with retention
 * ```yaml
 * archive-bucket:
 *   defines: gcp/cloud-storage
 *   name: my-project-archives
 *   location: US
 *   storage_class: ARCHIVE
 *   public_access_prevention: enforced
 *   retention_period_seconds: 31536000  # 1 year
 * ```
 *
 * @example Bucket with service account access
 * ```yaml
 * # Create storage bucket
 * data-bucket:
 *   defines: gcp/cloud-storage
 *   name: my-project-uploads
 *   location: us-central1
 *
 * # Service account with storage access
 * app-sa:
 *   defines: gcp/service-account
 *   name: my-app-storage
 *   roles:
 *     - roles/storage.objectAdmin
 *
 * # Generate key for application (writes secret!)
 * app-sa-key:
 *   defines: gcp/service-account-key
 *   service_account_id: <- connection-target("sa") entity-state get-member("unique_id")
 *   secret: gcs-credentials
 *   permitted-secrets:
 *     gcs-credentials: true
 *   connections:
 *     sa:
 *       runnable: gcp/service-account/app-sa
 *       service: service-account
 * ```
 */
export class CloudStorage extends GcpEntity<CloudStorageDefinition, CloudStorageState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Cloud Storage Bucket ${this.definition.name}`;
    }

    /**
     * Get bucket details from API
     */
    private getBucket(): any | null {
        return this.checkResourceExists(`${CLOUD_STORAGE_API_URL}/b/${this.definition.name}`);
    }

    /**
     * Populate state from bucket response
     */
    private populateState(bucket: any): void {
        this.state.name = bucket.name;
        this.state.id = bucket.id;
        this.state.self_link = bucket.selfLink;
        this.state.location = bucket.location;
        this.state.storage_class = bucket.storageClass;
        this.state.time_created = bucket.timeCreated;
        this.state.updated = bucket.updated;
        this.state.versioning_enabled = bucket.versioning?.enabled || false;
        this.state.gs_uri = `gs://${bucket.name}`;
    }

    override create(): void {
        // Check if bucket already exists
        const existing = this.getBucket();

        if (existing) {
            cli.output(`Bucket ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        // Build bucket configuration
        const body: any = {
            name: this.definition.name,
            location: this.definition.location || "US",
            storageClass: this.definition.storage_class || "STANDARD",
        };

        // Configure versioning
        if (this.definition.versioning_enabled) {
            body.versioning = { enabled: true };
        }

        // Configure IAM settings
        body.iamConfiguration = {};
        if (this.definition.uniform_bucket_level_access !== false) {
            body.iamConfiguration.uniformBucketLevelAccess = { enabled: true };
        }
        // Only include publicAccessPrevention if explicitly set to "enforced"
        // "inherited" is the default and some API versions don't accept it explicitly
        if (this.definition.public_access_prevention && this.definition.public_access_prevention !== "inherited") {
            body.iamConfiguration.publicAccessPrevention = this.definition.public_access_prevention;
        }

        // Add labels
        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        // Add lifecycle rules
        if (this.definition.lifecycle_rules) {
            body.lifecycle = { rule: JSON.parse(this.definition.lifecycle_rules) };
        }

        // Add CORS configuration
        if (this.definition.cors) {
            body.cors = JSON.parse(this.definition.cors);
        }

        // Default event-based hold
        if (this.definition.default_event_based_hold) {
            body.defaultEventBasedHold = true;
        }

        // Retention policy
        if (this.definition.retention_period_seconds) {
            body.retentionPolicy = {
                retentionPeriod: this.definition.retention_period_seconds.toString(),
            };
        }

        // Requester pays
        if (this.definition.requester_pays) {
            body.billing = { requesterPays: true };
        }

        // KMS encryption
        if (this.definition.kms_key_name) {
            body.encryption = { defaultKmsKeyName: this.definition.kms_key_name };
        }

        // Build URL with optional ACL parameters
        let url = `${CLOUD_STORAGE_API_URL}/b?project=${this.projectId}`;
        if (this.definition.predefined_acl) {
            url += `&predefinedAcl=${this.definition.predefined_acl}`;
        }
        if (this.definition.predefined_default_object_acl) {
            url += `&predefinedDefaultObjectAcl=${this.definition.predefined_default_object_acl}`;
        }

        cli.output(`Creating Cloud Storage bucket: ${this.definition.name}`);
        cli.output(`Request URL: ${url}`);
        cli.output(`Request body: ${JSON.stringify(body, null, 2)}`);

        const result = this.post(url, body);

        this.populateState(result);
        this.state.existing = false;

        cli.output(`Bucket created: gs://${this.definition.name}`);
    }

    override update(): void {
        const existing = this.getBucket();

        if (!existing) {
            cli.output("Bucket not found, creating...");
            this.create();
            return;
        }

        // Update bucket metadata
        const body: any = {};

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        if (this.definition.versioning_enabled !== undefined) {
            body.versioning = { enabled: this.definition.versioning_enabled };
        }

        if (this.definition.lifecycle_rules) {
            body.lifecycle = { rule: JSON.parse(this.definition.lifecycle_rules) };
        }

        if (this.definition.cors) {
            body.cors = JSON.parse(this.definition.cors);
        }

        if (Object.keys(body).length > 0) {
            const result = this.patch(`${CLOUD_STORAGE_API_URL}/b/${this.definition.name}`, body);
            this.populateState(result);
            cli.output(`Bucket ${this.definition.name} updated`);
        } else {
            this.populateState(existing);
        }
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Bucket ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getBucket();
        if (!existing) {
            cli.output(`Bucket ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Cloud Storage bucket: ${this.definition.name}`);
        this.httpDelete(`${CLOUD_STORAGE_API_URL}/b/${this.definition.name}`);
        cli.output(`Bucket ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const bucket = this.getBucket();
        if (!bucket) {
            cli.output("Bucket not found");
            return false;
        }

        this.populateState(bucket);
        cli.output(`Bucket gs://${this.definition.name} is ready in ${bucket.location}`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getBucket() !== null;
    }

    @action("get")
    getInfo(_args?: Args): void {
        const bucket = this.getBucket();
        if (!bucket) {
            throw new Error("Bucket not found");
        }
        cli.output(JSON.stringify(bucket, null, 2));
    }

    @action("list-objects")
    listObjects(args?: Args): void {
        const prefix = args?.prefix || "";
        const maxResults = args?.max_results || "100";

        let url = `${CLOUD_STORAGE_API_URL}/b/${this.definition.name}/o?maxResults=${maxResults}`;
        if (prefix) {
            url += `&prefix=${encodeURIComponent(prefix)}`;
        }

        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Get estimated monthly cost for this Cloud Storage bucket
     * 
     * Calculates costs based on:
     * - Storage size by storage class
     * - Operations (Class A and Class B)
     * - Network egress
     * - Retrieval costs (for NEARLINE, COLDLINE, ARCHIVE)
     * 
     * Usage:
     * - monk do namespace/bucket get-cost-estimate
     * 
     * Required IAM permissions:
     * - storage.buckets.get
     * - storage.objects.list
     * - monitoring.timeSeries.list (for metrics)
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`💰 Cost Estimate for Cloud Storage Bucket`);
        cli.output(`Bucket: ${this.definition.name}`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`==================================================`);

        // Get bucket details
        const bucket = this.getBucket();
        if (!bucket) {
            throw new Error(`Bucket ${this.definition.name} not found`);
        }

        const location = bucket.location || this.definition.location || 'US';
        const defaultStorageClass = bucket.storageClass || this.definition.storage_class || 'STANDARD';

        cli.output(`\n📊 Bucket Configuration:`);
        cli.output(`   Location: ${location}`);
        cli.output(`   Default Storage Class: ${defaultStorageClass}`);
        cli.output(`   Versioning: ${bucket.versioning?.enabled ? 'Enabled' : 'Disabled'}`);

        // Get storage statistics by listing objects
        const storageStats = this.getStorageStatistics();

        cli.output(`\n📦 Storage Statistics:`);
        cli.output(`   Total Objects: ${storageStats.totalObjects}`);
        cli.output(`   Total Size: ${this.formatBytes(storageStats.totalBytes)}`);
        
        for (const [storageClass, stats] of Object.entries(storageStats.byClass)) {
            const classStats = stats as { count: number; bytes: number };
            cli.output(`   ${storageClass}: ${classStats.count} objects, ${this.formatBytes(classStats.bytes)}`);
        }

        // Get pricing from Cloud Billing Catalog API
        const pricing = this.getCloudStoragePricing(location);

        // Get Cloud Monitoring metrics for operations and egress
        const metrics = this.getCloudMonitoringMetrics();

        // Calculate storage costs by class
        let totalStorageCost = 0;
        const storageCostBreakdown: Record<string, number> = {};

        for (const [storageClass, stats] of Object.entries(storageStats.byClass)) {
            const classStats = stats as { count: number; bytes: number };
            const sizeGb = classStats.bytes / (1024 * 1024 * 1024);
            const rate = pricing.storageRates[storageClass] || pricing.storageRates['STANDARD'];
            const cost = sizeGb * rate;
            storageCostBreakdown[storageClass] = cost;
            totalStorageCost += cost;
        }

        // Calculate operations costs
        const classAOps = metrics.classAOperations;
        const classBOps = metrics.classBOperations;
        const classARate = pricing.operationsRates.classA;
        const classBRate = pricing.operationsRates.classB;
        const operationsCost = (classAOps / 10000) * classARate + (classBOps / 10000) * classBRate;

        // Calculate network egress costs (using API tiered rates)
        const egressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
        const networkCost = this.calculateNetworkEgressCost(egressGb, pricing.networkEgressRate, pricing.networkEgressTiers);

        // Calculate retrieval costs for cold storage classes
        let retrievalCost = 0;
        const retrievalGb = metrics.retrievalBytes / (1024 * 1024 * 1024);
        if (retrievalGb > 0) {
            // Use the retrieval rate for the bucket's actual storage class
            const storageClass = (this.definition.storage_class || 'STANDARD').toUpperCase();
            const retrievalRate = pricing.retrievalRates[storageClass] || 0;
            retrievalCost = retrievalGb * retrievalRate;
        }

        // Total cost
        const totalCost = totalStorageCost + operationsCost + networkCost + retrievalCost;

        cli.output(`\n💵 Cost Breakdown (Monthly):`);
        cli.output(`   Storage: $${totalStorageCost.toFixed(2)}`);
        for (const [storageClass, cost] of Object.entries(storageCostBreakdown)) {
            if (cost > 0) {
                const classStats = storageStats.byClass[storageClass] as { count: number; bytes: number };
                const sizeGb = classStats.bytes / (1024 * 1024 * 1024);
                const rate = pricing.storageRates[storageClass] || pricing.storageRates['STANDARD'];
                cli.output(`      └─ ${storageClass}: ${sizeGb.toFixed(2)} GB × $${rate.toFixed(4)}/GB = $${cost.toFixed(2)}`);
            }
        }
        cli.output(`   Operations: $${operationsCost.toFixed(2)}`);
        cli.output(`      └─ Class A (writes): ${classAOps.toLocaleString()} ops × $${classARate.toFixed(4)}/10k = $${((classAOps / 10000) * classARate).toFixed(2)}`);
        cli.output(`      └─ Class B (reads): ${classBOps.toLocaleString()} ops × $${classBRate.toFixed(4)}/10k = $${((classBOps / 10000) * classBRate).toFixed(2)}`);
        cli.output(`   Network Egress: $${networkCost.toFixed(2)}`);
        cli.output(`      └─ ${egressGb.toFixed(2)} GB egress`);
        if (retrievalCost > 0) {
            cli.output(`   Retrieval: $${retrievalCost.toFixed(2)}`);
            cli.output(`      └─ ${retrievalGb.toFixed(2)} GB retrieved`);
        }
        cli.output(`   ─────────────────────────────`);
        cli.output(`   TOTAL: $${totalCost.toFixed(2)}/month`);

        cli.output(`\n📈 Cloud Monitoring Metrics (last 30 days):`);
        cli.output(`   Class A Operations: ${classAOps.toLocaleString()}`);
        cli.output(`   Class B Operations: ${classBOps.toLocaleString()}`);
        cli.output(`   Network Egress: ${this.formatBytes(metrics.networkEgressBytes)}`);
        cli.output(`   Network Ingress: ${this.formatBytes(metrics.networkIngressBytes)}`);
        cli.output(`   Retrieval: ${this.formatBytes(metrics.retrievalBytes)}`);

        // Output JSON summary
        const summary = {
            bucket: {
                name: this.definition.name,
                project: this.projectId,
                location: location,
                storage_class: defaultStorageClass,
                versioning_enabled: bucket.versioning?.enabled || false
            },
            storage_statistics: {
                total_objects: storageStats.totalObjects,
                total_bytes: storageStats.totalBytes,
                total_gb: parseFloat((storageStats.totalBytes / (1024 * 1024 * 1024)).toFixed(2)),
                by_class: Object.fromEntries(
                    Object.entries(storageStats.byClass).map(([k, v]) => {
                        const stats = v as { count: number; bytes: number };
                        return [k, { count: stats.count, bytes: stats.bytes, gb: parseFloat((stats.bytes / (1024 * 1024 * 1024)).toFixed(2)) }];
                    })
                )
            },
            pricing_rates: {
                source: pricing.source,
                currency: 'USD',
                storage_per_gb_month: pricing.storageRates,
                operations_per_10k: pricing.operationsRates,
                network_egress_per_gb: pricing.networkEgressRate,
                retrieval_per_gb: pricing.retrievalRates
            },
            cost_breakdown: {
                storage_monthly: parseFloat(totalStorageCost.toFixed(2)),
                operations_monthly: parseFloat(operationsCost.toFixed(2)),
                network_monthly: parseFloat(networkCost.toFixed(2)),
                retrieval_monthly: parseFloat(retrievalCost.toFixed(2)),
                total_monthly: parseFloat(totalCost.toFixed(2))
            },
            metrics: {
                period_days: 30,
                class_a_operations: classAOps,
                class_b_operations: classBOps,
                network_egress_bytes: metrics.networkEgressBytes,
                network_ingress_bytes: metrics.networkIngressBytes,
                retrieval_bytes: metrics.retrievalBytes
            },
            disclaimer: "Pricing from GCP Cloud Billing Catalog API. Metrics from Cloud Monitoring. Actual costs may vary based on committed use discounts and additional features."
        };

        cli.output(`\n📋 JSON Summary:`);
        cli.output(JSON.stringify(summary, null, 2));
        cli.output(`\n==================================================`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     * 
     * Output format:
     * {
     *   "type": "gcp-cloud-storage",
     *   "costs": {
     *     "month": {
     *       "amount": "3.51",
     *       "currency": "USD"
     *     }
     *   }
     * }
     */
    @action("costs")
    costs(): void {
        // Get bucket details
        const bucket = this.getBucket();
        if (!bucket) {
            // Return zero cost if bucket doesn't exist
            const result = {
                type: "gcp-cloud-storage",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const location = bucket.location || this.definition.location || 'US';

            // Get storage statistics by listing objects
            const storageStats = this.getStorageStatistics();

            // Get pricing from Cloud Billing Catalog API
            const pricing = this.getCloudStoragePricing(location);

            // Get Cloud Monitoring metrics for operations and egress
            const metrics = this.getCloudMonitoringMetrics();

            // Calculate storage costs by class
            let totalStorageCost = 0;
            for (const [storageClass, stats] of Object.entries(storageStats.byClass)) {
                const classStats = stats as { count: number; bytes: number };
                const sizeGb = classStats.bytes / (1024 * 1024 * 1024);
                const rate = pricing.storageRates[storageClass] || pricing.storageRates['STANDARD'];
                totalStorageCost += sizeGb * rate;
            }

            // Calculate operations costs
            const classAOps = metrics.classAOperations;
            const classBOps = metrics.classBOperations;
            const operationsCost = (classAOps / 10000) * pricing.operationsRates.classA + 
                                   (classBOps / 10000) * pricing.operationsRates.classB;

            // Calculate network egress costs (using API tiered rates)
            const egressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
            const networkCost = this.calculateNetworkEgressCost(egressGb, pricing.networkEgressRate, pricing.networkEgressTiers);

            // Calculate retrieval costs using the bucket's actual storage class rate
            let retrievalCost = 0;
            const retrievalGb = metrics.retrievalBytes / (1024 * 1024 * 1024);
            if (retrievalGb > 0) {
                const storageClass = (this.definition.storage_class || 'STANDARD').toUpperCase();
                const retrievalRate = pricing.retrievalRates[storageClass] || 0;
                retrievalCost = retrievalGb * retrievalRate;
            }

            // Total cost
            const totalCost = totalStorageCost + operationsCost + networkCost + retrievalCost;

            const result = {
                type: "gcp-cloud-storage",
                costs: {
                    month: {
                        amount: totalCost.toFixed(2),
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));

        } catch (error) {
            // Return zero cost on error
            const result = {
                type: "gcp-cloud-storage",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD",
                        error: (error as Error).message
                    }
                }
            };
            cli.output(JSON.stringify(result));
        }
    }

    /**
     * Get storage statistics by listing all objects
     */
    private getStorageStatistics(): {
        totalObjects: number;
        totalBytes: number;
        byClass: Record<string, { count: number; bytes: number }>;
    } {
        const stats = {
            totalObjects: 0,
            totalBytes: 0,
            byClass: {} as Record<string, { count: number; bytes: number }>
        };

        try {
            let pageToken: string | undefined;
            do {
                let url = `${CLOUD_STORAGE_API_URL}/b/${this.definition.name}/o?maxResults=1000`;
                if (pageToken) {
                    url += `&pageToken=${encodeURIComponent(pageToken)}`;
                }

                const response = this.get(url);
                const items = response.items || [];

                for (const item of items) {
                    const size = parseInt(item.size || '0', 10);
                    const storageClass = item.storageClass || 'STANDARD';

                    stats.totalObjects++;
                    stats.totalBytes += size;

                    if (!stats.byClass[storageClass]) {
                        stats.byClass[storageClass] = { count: 0, bytes: 0 };
                    }
                    stats.byClass[storageClass].count++;
                    stats.byClass[storageClass].bytes += size;
                }

                pageToken = response.nextPageToken;
            } while (pageToken);
        } catch (error) {
            cli.output(`Warning: Could not list objects: ${(error as Error).message}`);
        }

        // If no objects found, ensure at least the default class is present
        if (Object.keys(stats.byClass).length === 0) {
            const defaultClass = this.definition.storage_class || 'STANDARD';
            stats.byClass[defaultClass] = { count: 0, bytes: 0 };
        }

        return stats;
    }

    /**
     * Get Cloud Storage pricing from GCP Cloud Billing Catalog API
     */
    private getCloudStoragePricing(location: string): {
        storageRates: Record<string, number>;
        operationsRates: { classA: number; classB: number };
        networkEgressRate: number;
        networkEgressTiers: { limitGb: number; ratePerGb: number }[];
        retrievalRates: Record<string, number>;
        source: string;
    } {
        try {
            const apiPricing = this.fetchCloudStoragePricingFromAPI(location);
            if (apiPricing) {
                return { ...apiPricing, source: 'GCP Cloud Billing Catalog API' };
            }
        } catch (error) {
            cli.output(`Warning: Failed to fetch pricing from GCP API: ${(error as Error).message}`);
        }

        // If API fails, throw error (no hardcoded fallback)
        throw new Error(
            'Failed to fetch pricing from GCP Cloud Billing Catalog API. ' +
            'Ensure the Cloud Billing API is enabled and you have cloudbilling.skus.list permission.'
        );
    }

    /**
     * Fetch Cloud Storage pricing from GCP Cloud Billing Catalog API
     */
    private fetchCloudStoragePricingFromAPI(location: string): {
        storageRates: Record<string, number>;
        operationsRates: { classA: number; classB: number };
        networkEgressRate: number;
        networkEgressTiers: { limitGb: number; ratePerGb: number }[];
        retrievalRates: Record<string, number>;
    } | null {
        const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
        
        // Cloud Storage service ID
        const cloudStorageServiceId = '95FF-2EF5-5EA1'; // Cloud Storage service ID
        
        // Determine location type for pricing
        const isMultiRegion = ['US', 'EU', 'ASIA'].includes(location.toUpperCase());
        
        try {
            // Fetch SKUs for Cloud Storage
            const skusUrl = `${billingApiUrl}/services/${cloudStorageServiceId}/skus?currencyCode=USD`;
            const response = this.get(skusUrl);
            
            if (!response.skus || !Array.isArray(response.skus)) {
                return null;
            }

            const skus = response.skus;
            
            // Track which rates were found from the API
            const storageRates: Record<string, number> = {};
            let classARate = 0;
            let classBRate = 0;
            let networkEgressRate = 0;
            let networkEgressTiers: { limitGb: number; ratePerGb: number }[] = [];
            const retrievalRates: Record<string, number> = {
                'STANDARD': 0 // Standard retrieval is always free
            };

            for (const sku of skus) {
                const desc = (sku.description || '').toLowerCase();
                const category = sku.category?.resourceFamily || '';
                
                // Check if SKU matches our location
                const serviceRegions = sku.serviceRegions || [];
                const matchesLocation = serviceRegions.some((r: string) => 
                    r.toLowerCase() === location.toLowerCase() ||
                    r === 'global' ||
                    (isMultiRegion && r.toLowerCase().includes(location.toLowerCase()))
                );
                
                if (!matchesLocation && serviceRegions.length > 0) {
                    continue;
                }

                const price = this.extractPriceFromSku(sku);
                if (price <= 0) continue;

                // Storage pricing
                if (category === 'Storage' && desc.includes('storage')) {
                    if (desc.includes('standard') && !desc.includes('nearline') && !desc.includes('coldline') && !desc.includes('archive')) {
                        storageRates['STANDARD'] = price;
                    } else if (desc.includes('nearline')) {
                        storageRates['NEARLINE'] = price;
                    } else if (desc.includes('coldline')) {
                        storageRates['COLDLINE'] = price;
                    } else if (desc.includes('archive')) {
                        storageRates['ARCHIVE'] = price;
                    }
                }

                // Operations pricing
                if (desc.includes('class a') && desc.includes('operations')) {
                    classARate = price;
                } else if (desc.includes('class b') && desc.includes('operations')) {
                    classBRate = price;
                }

                // Network egress - extract full tiered rates
                if (desc.includes('download') && desc.includes('worldwide') || 
                    (desc.includes('egress') && desc.includes('internet'))) {
                    networkEgressRate = price;
                    // Extract tiered rates from the SKU for accurate tiered pricing
                    networkEgressTiers = this.extractTieredRatesFromSku(sku);
                }

                // Retrieval pricing
                if (desc.includes('retrieval')) {
                    if (desc.includes('nearline')) {
                        retrievalRates['NEARLINE'] = price;
                    } else if (desc.includes('coldline')) {
                        retrievalRates['COLDLINE'] = price;
                    } else if (desc.includes('archive')) {
                        retrievalRates['ARCHIVE'] = price;
                    }
                }
            }

            // Validate that we got the minimum required rates from the API
            if (!storageRates['STANDARD'] || classARate <= 0 || classBRate <= 0 || networkEgressRate <= 0) {
                return null;
            }

            return {
                storageRates,
                operationsRates: { classA: classARate, classB: classBRate },
                networkEgressRate,
                networkEgressTiers,
                retrievalRates
            };
        } catch (error) {
            cli.output(`Error fetching pricing: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Extract price from SKU pricing info
     */
    private extractPriceFromSku(sku: any): number {
        try {
            const pricingInfo = sku.pricingInfo;
            if (!pricingInfo || !Array.isArray(pricingInfo) || pricingInfo.length === 0) {
                return 0;
            }

            const pricing = pricingInfo[0];
            const tieredRates = pricing.pricingExpression?.tieredRates;
            if (!tieredRates || !Array.isArray(tieredRates) || tieredRates.length === 0) {
                return 0;
            }

            // Get the first non-zero rate
            for (const rate of tieredRates) {
                const unitPrice = rate.unitPrice;
                if (unitPrice) {
                    const units = parseInt(unitPrice.units || '0', 10);
                    const nanos = parseInt(unitPrice.nanos || '0', 10);
                    const price = units + (nanos / 1e9);
                    if (price > 0) {
                        return price;
                    }
                }
            }
            return 0;
        } catch {
            return 0;
        }
    }

    /**
     * Extract full tiered rates from a SKU's pricing info.
     * Returns an array of { limitGb, ratePerGb } sorted by tier start usage.
     * The limitGb is the upper bound of the tier (Infinity for the last tier).
     */
    private extractTieredRatesFromSku(sku: any): { limitGb: number; ratePerGb: number }[] {
        try {
            const pricingInfo = sku.pricingInfo;
            if (!pricingInfo || !Array.isArray(pricingInfo) || pricingInfo.length === 0) {
                return [];
            }

            const pricing = pricingInfo[0];
            const tieredRates = pricing.pricingExpression?.tieredRates;
            if (!tieredRates || !Array.isArray(tieredRates) || tieredRates.length === 0) {
                return [];
            }

            const tiers: { startUsageAmount: number; ratePerGb: number }[] = [];
            for (const rate of tieredRates) {
                const unitPrice = rate.unitPrice;
                const startUsageAmount = rate.startUsageAmount || 0;
                let price = 0;
                if (unitPrice) {
                    const units = parseInt(unitPrice.units || '0', 10);
                    const nanos = parseInt(unitPrice.nanos || '0', 10);
                    price = units + (nanos / 1e9);
                }
                tiers.push({ startUsageAmount, ratePerGb: price });
            }

            // Sort by start usage amount
            tiers.sort((a, b) => a.startUsageAmount - b.startUsageAmount);

            // Convert to { limitGb, ratePerGb } format
            const result: { limitGb: number; ratePerGb: number }[] = [];
            for (let i = 0; i < tiers.length; i++) {
                const nextStart = i + 1 < tiers.length ? tiers[i + 1].startUsageAmount : Infinity;
                result.push({
                    limitGb: nextStart,
                    ratePerGb: tiers[i].ratePerGb
                });
            }

            return result;
        } catch {
            return [];
        }
    }

    /**
     * Calculate network egress cost with tiered pricing from the API.
     * Uses actual tiered rates from the GCP Cloud Billing API when available,
     * otherwise falls back to the single rate (flat pricing).
     */
    private calculateNetworkEgressCost(
        egressGb: number,
        ratePerGb: number,
        egressTiers?: { limitGb: number; ratePerGb: number }[]
    ): number {
        if (egressGb <= 0) return 0;

        // If we have actual tiered rates from the API, use them
        if (egressTiers && egressTiers.length > 1) {
            let cost = 0;
            let remaining = egressGb;

            for (const tier of egressTiers) {
                if (remaining <= 0) break;

                // Calculate how much usage falls in this tier
                const tierCapacity = tier.limitGb === Infinity ? remaining : tier.limitGb;
                const usageInTier = Math.min(remaining, tierCapacity);

                cost += usageInTier * tier.ratePerGb;
                remaining -= usageInTier;
            }

            return cost;
        }

        // Fallback: use flat rate (no tiered discount approximation)
        return egressGb * ratePerGb;
    }

    /**
     * Get metrics from Cloud Monitoring API
     */
    private getCloudMonitoringMetrics(): {
        classAOperations: number;
        classBOperations: number;
        networkEgressBytes: number;
        networkIngressBytes: number;
        retrievalBytes: number;
    } {
        const defaultMetrics = {
            classAOperations: 0,
            classBOperations: 0,
            networkEgressBytes: 0,
            networkIngressBytes: 0,
            retrievalBytes: 0
        };

        try {
            const monitoringApiUrl = 'https://monitoring.googleapis.com/v3';
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const endTime = now.toISOString();
            const startTime = thirtyDaysAgo.toISOString();

            // Cloud Storage metric types
            const metricTypes = [
                'storage.googleapis.com/api/request_count',
                'storage.googleapis.com/network/sent_bytes_count',
                'storage.googleapis.com/network/received_bytes_count'
            ];

            const results: Record<string, number> = {};

            for (const metricType of metricTypes) {
                try {
                    const filter = `metric.type="${metricType}" AND resource.labels.bucket_name="${this.definition.name}"`;
                    const encodedFilter = encodeURIComponent(filter);
                    
                    const url = `${monitoringApiUrl}/projects/${this.projectId}/timeSeries?` +
                        `filter=${encodedFilter}&` +
                        `interval.startTime=${startTime}&` +
                        `interval.endTime=${endTime}&` +
                        `aggregation.alignmentPeriod=2592000s&` +
                        `aggregation.perSeriesAligner=ALIGN_SUM`;

                    const response = this.get(url);
                    
                    if (response.timeSeries && response.timeSeries.length > 0) {
                        for (const series of response.timeSeries) {
                            const points = series.points || [];
                            let total = 0;
                            for (const point of points) {
                                const value = point.value?.int64Value || 
                                             point.value?.doubleValue || 0;
                                total += parseFloat(value.toString());
                            }
                            
                            // Categorize by method for request_count
                            if (metricType.includes('request_count')) {
                                const method = series.metric?.labels?.method || '';
                                // Class A: insert, update, compose, copy, rewrite, list
                                // Class B: get, getIamPolicy, testIamPermissions
                                if (['insert', 'update', 'compose', 'copy', 'rewrite', 'list'].some(m => method.toLowerCase().includes(m))) {
                                    results['classA'] = (results['classA'] || 0) + total;
                                } else {
                                    results['classB'] = (results['classB'] || 0) + total;
                                }
                            } else if (metricType.includes('sent_bytes')) {
                                results['egress'] = (results['egress'] || 0) + total;
                            } else if (metricType.includes('received_bytes')) {
                                results['ingress'] = (results['ingress'] || 0) + total;
                            }
                        }
                    }
                } catch (metricError) {
                    // Continue with other metrics if one fails
                }
            }

            // For non-STANDARD storage classes, retrieval is charged per GB of data read.
            // The sent_bytes_count metric captures bytes sent (downloaded), which represents retrieval.
            const storageClass = (this.definition.storage_class || 'STANDARD').toUpperCase();
            const retrievalBytes = (storageClass !== 'STANDARD') ? (results['egress'] || 0) : 0;

            return {
                classAOperations: results['classA'] || 0,
                classBOperations: results['classB'] || 0,
                networkEgressBytes: results['egress'] || 0,
                networkIngressBytes: results['ingress'] || 0,
                retrievalBytes
            };
        } catch (error) {
            cli.output(`Warning: Could not fetch Cloud Monitoring metrics: ${(error as Error).message}`);
            return defaultMetrics;
        }
    }

    /**
     * Format bytes to human-readable string
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
