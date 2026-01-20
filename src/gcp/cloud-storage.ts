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
        if (this.definition.public_access_prevention) {
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
}
