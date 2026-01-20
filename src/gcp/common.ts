/**
 * GCP Entities - Common Constants, Interfaces, and Utilities
 *
 * This module contains shared code for all GCP entities.
 */

// =============================================================================
// API Base URLs
// =============================================================================

/** Cloud SQL Admin API base URL */
export const CLOUD_SQL_API_URL = "https://sqladmin.googleapis.com/sql/v1beta4";

/** BigQuery API base URL */
export const BIGQUERY_API_URL = "https://bigquery.googleapis.com/bigquery/v2";

/** Cloud Storage API base URL */
export const CLOUD_STORAGE_API_URL = "https://storage.googleapis.com/storage/v1";

/** IAM API base URL */
export const IAM_API_URL = "https://iam.googleapis.com/v1";

/** Cloud Resource Manager API base URL */
export const RESOURCE_MANAGER_API_URL = "https://cloudresourcemanager.googleapis.com/v1";

/** Service Usage API base URL */
export const SERVICE_USAGE_API_URL = "https://serviceusage.googleapis.com/v1";

/** Cloud Functions API v2 base URL */
export const CLOUD_FUNCTIONS_API_URL = "https://cloudfunctions.googleapis.com/v2";

/** Cloud Run API base URL */
export const CLOUD_RUN_API_URL = "https://run.googleapis.com/v2";

/** Memorystore for Redis API base URL */
export const MEMORYSTORE_REDIS_API_URL = "https://redis.googleapis.com/v1";

/** Firebase Hosting API base URL */
export const FIREBASE_HOSTING_API_URL = "https://firebasehosting.googleapis.com/v1beta1";

/** Firestore API base URL */
export const FIRESTORE_API_URL = "https://firestore.googleapis.com/v1";

/**
 * Catalog of common GCP APIs with service name and base URL.
 * Useful for schema enumerations and documentation references.
 */
export const GCP_API_CATALOG = {
    cloud_sql: {
        service: "sqladmin.googleapis.com",
        base_url: CLOUD_SQL_API_URL,
    },
    bigquery: {
        service: "bigquery.googleapis.com",
        base_url: BIGQUERY_API_URL,
    },
    cloud_storage: {
        service: "storage.googleapis.com",
        base_url: CLOUD_STORAGE_API_URL,
    },
    iam: {
        service: "iam.googleapis.com",
        base_url: IAM_API_URL,
    },
    resource_manager: {
        service: "cloudresourcemanager.googleapis.com",
        base_url: RESOURCE_MANAGER_API_URL,
    },
    service_usage: {
        service: "serviceusage.googleapis.com",
        base_url: SERVICE_USAGE_API_URL,
    },
    cloud_functions: {
        service: "cloudfunctions.googleapis.com",
        base_url: CLOUD_FUNCTIONS_API_URL,
    },
    cloud_run: {
        service: "run.googleapis.com",
        base_url: CLOUD_RUN_API_URL,
    },
    firebase_hosting: {
        service: "firebasehosting.googleapis.com",
        base_url: FIREBASE_HOSTING_API_URL,
    },
    firestore: {
        service: "firestore.googleapis.com",
        base_url: FIRESTORE_API_URL,
    },
    memorystore_redis: {
        service: "redis.googleapis.com",
        base_url: MEMORYSTORE_REDIS_API_URL,
    },
} as const;

/**
 * Base URLs for common GCP APIs.
 * Keep this in sync with GCP_API_CATALOG.
 */
export type GcpApiBaseUrl =
    | "https://sqladmin.googleapis.com/sql/v1beta4"
    | "https://bigquery.googleapis.com/bigquery/v2"
    | "https://storage.googleapis.com/storage/v1"
    | "https://iam.googleapis.com/v1"
    | "https://cloudresourcemanager.googleapis.com/v1"
    | "https://serviceusage.googleapis.com/v1"
    | "https://cloudfunctions.googleapis.com/v2"
    | "https://run.googleapis.com/v2"
    | "https://firebasehosting.googleapis.com/v1beta1"
    | "https://firestore.googleapis.com/v1"
    | "https://redis.googleapis.com/v1";

/**
 * Service IDs for common GCP APIs.
 * Keep this in sync with GCP_API_CATALOG.
 */
export type GcpApiServiceName =
    | "sqladmin.googleapis.com"
    | "bigquery.googleapis.com"
    | "storage.googleapis.com"
    | "iam.googleapis.com"
    | "cloudresourcemanager.googleapis.com"
    | "serviceusage.googleapis.com"
    | "cloudfunctions.googleapis.com"
    | "run.googleapis.com"
    | "firebasehosting.googleapis.com"
    | "firestore.googleapis.com"
    | "redis.googleapis.com";

// =============================================================================
// Common Enums
// =============================================================================

/**
 * Supported Cloud SQL database versions
 * @see https://cloud.google.com/sql/docs/mysql/admin-api/rest/v1/SqlDatabaseVersion
 */
export type DatabaseVersion =
    // MySQL versions
    | "MYSQL_5_6"
    | "MYSQL_5_7"
    | "MYSQL_8_0"
    | "MYSQL_8_0_18"
    | "MYSQL_8_0_26"
    | "MYSQL_8_0_27"
    | "MYSQL_8_0_28"
    | "MYSQL_8_0_30"
    | "MYSQL_8_0_31"
    | "MYSQL_8_0_32"
    | "MYSQL_8_0_33"
    | "MYSQL_8_0_34"
    | "MYSQL_8_0_35"
    | "MYSQL_8_0_36"
    | "MYSQL_8_0_37"
    | "MYSQL_8_0_38"
    | "MYSQL_8_0_39"
    | "MYSQL_8_0_40"
    | "MYSQL_8_0_41"
    | "MYSQL_8_0_42"
    | "MYSQL_8_0_43"
    | "MYSQL_8_0_44"
    | "MYSQL_8_4"
    // PostgreSQL versions
    | "POSTGRES_9_6"
    | "POSTGRES_10"
    | "POSTGRES_11"
    | "POSTGRES_12"
    | "POSTGRES_13"
    | "POSTGRES_14"
    | "POSTGRES_15"
    | "POSTGRES_16"
    | "POSTGRES_17"
    | "POSTGRES_18"
    // SQL Server 2017
    | "SQLSERVER_2017_STANDARD"
    | "SQLSERVER_2017_ENTERPRISE"
    | "SQLSERVER_2017_EXPRESS"
    | "SQLSERVER_2017_WEB"
    // SQL Server 2019
    | "SQLSERVER_2019_STANDARD"
    | "SQLSERVER_2019_ENTERPRISE"
    | "SQLSERVER_2019_EXPRESS"
    | "SQLSERVER_2019_WEB"
    // SQL Server 2022
    | "SQLSERVER_2022_STANDARD"
    | "SQLSERVER_2022_ENTERPRISE"
    | "SQLSERVER_2022_EXPRESS"
    | "SQLSERVER_2022_WEB";

/**
 * Cloud SQL machine tiers
 * @see https://cloud.google.com/sql/docs/mysql/machine-series-overview
 *
 * Common formats:
 * - Shared core: "db-f1-micro", "db-g1-small"
 * - Custom Enterprise: "db-custom-{vCPUs}-{memoryMB}" (e.g., "db-custom-2-7680")
 * - Custom N4: "db-custom-N4-{vCPUs}-{memoryMB}"
 * - Enterprise Plus N2: "db-perf-optimized-N-{vCPUs}" (2-128)
 * - Enterprise Plus C4A: "db-c4a-highmem-{vCPUs}" (2-72)
 * - Legacy N1: "db-n1-standard-{vCPUs}", "db-n1-highmem-{vCPUs}"
 */
export type MachineTier =
    // Shared core (low-cost dev/test)
    | "db-f1-micro"
    | "db-g1-small"
    // Enterprise Plus - N2 series (performance optimized)
    | "db-perf-optimized-N-2"
    | "db-perf-optimized-N-4"
    | "db-perf-optimized-N-8"
    | "db-perf-optimized-N-16"
    | "db-perf-optimized-N-32"
    | "db-perf-optimized-N-48"
    | "db-perf-optimized-N-64"
    | "db-perf-optimized-N-80"
    | "db-perf-optimized-N-96"
    | "db-perf-optimized-N-128"
    // Enterprise Plus - C4A series (Arm-based)
    | "db-c4a-highmem-2"
    | "db-c4a-highmem-4"
    | "db-c4a-highmem-8"
    | "db-c4a-highmem-16"
    | "db-c4a-highmem-32"
    | "db-c4a-highmem-48"
    | "db-c4a-highmem-72"
    // Legacy N1 standard (still supported)
    | "db-n1-standard-1"
    | "db-n1-standard-2"
    | "db-n1-standard-4"
    | "db-n1-standard-8"
    | "db-n1-standard-16"
    | "db-n1-standard-32"
    | "db-n1-standard-64"
    // Legacy N1 highmem (still supported)
    | "db-n1-highmem-2"
    | "db-n1-highmem-4"
    | "db-n1-highmem-8"
    | "db-n1-highmem-16"
    | "db-n1-highmem-32"
    | "db-n1-highmem-64"
    // Custom tiers use pattern: db-custom-{vCPUs}-{memoryMB}
    | string;

/**
 * GCP regions
 * @see https://cloud.google.com/sql/docs/mysql/locations
 */
export type GcpRegion =
    // Africa
    | "africa-south1"
    // Asia
    | "asia-east1"
    | "asia-east2"
    | "asia-northeast1"
    | "asia-northeast2"
    | "asia-northeast3"
    | "asia-south1"
    | "asia-south2"
    | "asia-southeast1"
    | "asia-southeast2"
    // Australia
    | "australia-southeast1"
    | "australia-southeast2"
    // Europe
    | "europe-central2"
    | "europe-north1"
    | "europe-southwest1"
    | "europe-west1"
    | "europe-west2"
    | "europe-west3"
    | "europe-west4"
    | "europe-west6"
    | "europe-west8"
    | "europe-west9"
    | "europe-west10"
    | "europe-west12"
    // Middle East
    | "me-central1"
    | "me-central2"
    | "me-west1"
    // North America
    | "northamerica-northeast1"
    | "northamerica-northeast2"
    | "northamerica-south1"
    | "us-central1"
    | "us-south1"
    | "us-east1"
    | "us-east4"
    | "us-east5"
    | "us-west1"
    | "us-west2"
    | "us-west3"
    | "us-west4"
    // South America
    | "southamerica-east1"
    | "southamerica-west1";

/**
 * Service account key types
 */
export type KeyType =
    | "TYPE_UNSPECIFIED"
    | "TYPE_PKCS12_FILE"
    | "TYPE_GOOGLE_CREDENTIALS_FILE";

/**
 * Service account key algorithms
 */
export type KeyAlgorithm =
    | "KEY_ALG_UNSPECIFIED"
    | "KEY_ALG_RSA_1024"
    | "KEY_ALG_RSA_2048";

// =============================================================================
// BigQuery Enums
// =============================================================================

/**
 * BigQuery dataset locations
 * @see https://cloud.google.com/bigquery/docs/locations
 *
 * Includes multi-regions (US, EU) and all regional locations.
 */
export type BigQueryLocation =
    // Multi-regions
    | "US"
    | "EU"
    // Americas
    | "us-central1"
    | "us-east1"
    | "us-east4"
    | "us-east5"
    | "us-south1"
    | "us-west1"
    | "us-west2"
    | "us-west3"
    | "us-west4"
    | "northamerica-northeast1"
    | "northamerica-northeast2"
    | "northamerica-south1"
    | "southamerica-east1"
    | "southamerica-west1"
    // Europe
    | "europe-central2"
    | "europe-north1"
    | "europe-north2"
    | "europe-southwest1"
    | "europe-west1"
    | "europe-west2"
    | "europe-west3"
    | "europe-west4"
    | "europe-west6"
    | "europe-west8"
    | "europe-west9"
    | "europe-west10"
    | "europe-west12"
    // Asia Pacific
    | "asia-east1"
    | "asia-east2"
    | "asia-northeast1"
    | "asia-northeast2"
    | "asia-northeast3"
    | "asia-south1"
    | "asia-south2"
    | "asia-southeast1"
    | "asia-southeast2"
    | "australia-southeast1"
    | "australia-southeast2"
    // Middle East & Africa
    | "me-central1"
    | "me-central2"
    | "me-west1"
    | "africa-south1";

/**
 * BigQuery table field data types
 * @see https://cloud.google.com/bigquery/docs/reference/standard-sql/data-types
 */
export type BigQueryFieldType =
    // String types
    | "STRING"
    | "BYTES"
    // Numeric types
    | "INTEGER"
    | "INT64"
    | "FLOAT"
    | "FLOAT64"
    | "NUMERIC"
    | "BIGNUMERIC"
    // Boolean
    | "BOOLEAN"
    | "BOOL"
    // Date/Time types
    | "DATE"
    | "TIME"
    | "DATETIME"
    | "TIMESTAMP"
    | "INTERVAL"
    // Complex types
    | "RECORD"
    | "STRUCT"
    | "ARRAY"
    // Special types
    | "GEOGRAPHY"
    | "JSON"
    | "RANGE";

/**
 * BigQuery table field modes
 * @see https://cloud.google.com/bigquery/docs/schemas
 */
export type BigQueryFieldMode =
    /** Field may contain null values (default) */
    | "NULLABLE"
    /** Field must always contain a value */
    | "REQUIRED"
    /** Field contains an array of values */
    | "REPEATED";

/**
 * BigQuery dataset storage billing model
 * @see https://cloud.google.com/bigquery/docs/storage_overview
 *
 * - LOGICAL: Billed based on logical (uncompressed) bytes. Time travel included.
 * - PHYSICAL: Billed based on physical (compressed) bytes. Time travel charged separately.
 *
 * Note: Changes take 24 hours to take effect and can only be changed every 14 days.
 */
export type BigQueryStorageBillingModel =
    | "LOGICAL"
    | "PHYSICAL"
    | "STORAGE_BILLING_MODEL_UNSPECIFIED";

/**
 * BigQuery table types
 */
export type BigQueryTableType =
    /** Regular BigQuery table */
    | "TABLE"
    /** View defined by a SQL query */
    | "VIEW"
    /** Materialized view */
    | "MATERIALIZED_VIEW"
    /** External table (data stored outside BigQuery) */
    | "EXTERNAL"
    /** Snapshot of another table */
    | "SNAPSHOT";

// =============================================================================
// Cloud Storage Enums
// =============================================================================

/**
 * Cloud Storage bucket storage classes
 * @see https://cloud.google.com/storage/docs/storage-classes
 */
export type StorageClass =
    /** Best for frequently accessed data */
    | "STANDARD"
    /** Best for data accessed less than once a month */
    | "NEARLINE"
    /** Best for data accessed less than once a quarter */
    | "COLDLINE"
    /** Best for data accessed less than once a year */
    | "ARCHIVE";

/**
 * Cloud Storage bucket locations
 * @see https://cloud.google.com/storage/docs/locations
 *
 * Includes multi-regions, dual-regions, and regional locations.
 */
export type StorageLocation =
    // Multi-regions
    | "US"
    | "EU"
    | "ASIA"
    // Dual-regions
    | "NAM4"   // Iowa and South Carolina
    | "EUR4"   // Netherlands and Finland
    | "EUR5"   // Belgium and Netherlands
    | "EUR7"   // Germany and Netherlands
    | "EUR8"   // Germany and Switzerland
    | "ASIA1"  // Tokyo and Osaka
    // Regional locations (same as GcpRegion)
    | "africa-south1"
    | "asia-east1"
    | "asia-east2"
    | "asia-northeast1"
    | "asia-northeast2"
    | "asia-northeast3"
    | "asia-south1"
    | "asia-south2"
    | "asia-southeast1"
    | "asia-southeast2"
    | "australia-southeast1"
    | "australia-southeast2"
    | "europe-central2"
    | "europe-north1"
    | "europe-southwest1"
    | "europe-west1"
    | "europe-west2"
    | "europe-west3"
    | "europe-west4"
    | "europe-west6"
    | "europe-west8"
    | "europe-west9"
    | "europe-west10"
    | "europe-west12"
    | "me-central1"
    | "me-central2"
    | "me-west1"
    | "northamerica-northeast1"
    | "northamerica-northeast2"
    | "northamerica-south1"
    | "us-central1"
    | "us-south1"
    | "us-east1"
    | "us-east4"
    | "us-east5"
    | "us-west1"
    | "us-west2"
    | "us-west3"
    | "us-west4"
    | "southamerica-east1"
    | "southamerica-west1";

/**
 * Cloud Storage predefined ACLs
 * @see https://cloud.google.com/storage/docs/access-control/lists#predefined-acl
 */
export type PredefinedAcl =
    /** No predefined ACL applied */
    | "authenticatedRead"
    /** Bucket/object owner gets OWNER, all authenticated users get READER */
    | "bucketOwnerFullControl"
    /** Object owner gets OWNER, bucket owner gets OWNER */
    | "bucketOwnerRead"
    /** Object owner gets OWNER, bucket owner gets READER */
    | "private"
    /** Bucket/object owner gets OWNER */
    | "projectPrivate"
    /** Project team members get access based on their roles */
    | "publicRead"
    /** All users get READER access */
    | "publicReadWrite";
    /** All users get READER and WRITER access */

/**
 * Cloud Storage public access prevention settings
 */
export type PublicAccessPrevention =
    /** Public access is allowed (subject to ACLs/IAM) */
    | "inherited"
    /** Public access is blocked at the bucket level */
    | "enforced";

// =============================================================================
// Cloud Functions Enums
// =============================================================================

/**
 * Cloud Functions Gen 2 runtimes
 * @see https://cloud.google.com/functions/docs/concepts/execution-environment
 */
export type CloudFunctionRuntime =
    // Node.js
    | "nodejs18"
    | "nodejs20"
    | "nodejs22"
    // Python
    | "python39"
    | "python310"
    | "python311"
    | "python312"
    // Go
    | "go121"
    | "go122"
    // Java
    | "java11"
    | "java17"
    | "java21"
    // .NET
    | "dotnet6"
    | "dotnet8"
    // Ruby
    | "ruby32"
    | "ruby33"
    // PHP
    | "php82"
    | "php83";

/**
 * Cloud Functions ingress settings
 * @see https://cloud.google.com/functions/docs/networking/network-settings
 */
export type CloudFunctionIngress =
    /** Allow all traffic */
    | "ALLOW_ALL"
    /** Allow only internal traffic */
    | "ALLOW_INTERNAL_ONLY"
    /** Allow internal traffic and traffic from Cloud Load Balancing */
    | "ALLOW_INTERNAL_AND_GCLB";

/**
 * Cloud Functions VPC egress settings
 */
export type CloudFunctionVpcEgress =
    /** Route only private IP traffic through VPC connector */
    | "PRIVATE_RANGES_ONLY"
    /** Route all traffic through VPC connector */
    | "ALL_TRAFFIC";

/**
 * Cloud Functions event trigger types
 * @see https://cloud.google.com/functions/docs/calling
 */
export type CloudFunctionTriggerType =
    /** HTTP trigger (default) */
    | "http"
    /** Pub/Sub trigger */
    | "google.cloud.pubsub.topic.v1.messagePublished"
    /** Cloud Storage triggers */
    | "google.cloud.storage.object.v1.finalized"
    | "google.cloud.storage.object.v1.deleted"
    | "google.cloud.storage.object.v1.archived"
    | "google.cloud.storage.object.v1.metadataUpdated"
    /** Firestore triggers */
    | "google.cloud.firestore.document.v1.created"
    | "google.cloud.firestore.document.v1.updated"
    | "google.cloud.firestore.document.v1.deleted"
    | "google.cloud.firestore.document.v1.written"
    /** Firebase Auth triggers */
    | "google.firebase.auth.user.v1.created"
    | "google.firebase.auth.user.v1.deleted"
    /** Firebase Remote Config triggers */
    | "google.firebase.remoteconfig.remoteConfig.v1.updated"
    /** Cloud Scheduler (via Pub/Sub) */
    | "google.cloud.scheduler.job.v1.executed";

// =============================================================================
// Memorystore for Redis Enums
// =============================================================================

/**
 * Memorystore for Redis tiers
 * @see https://cloud.google.com/memorystore/docs/redis/reference/rest/v1/projects.locations.instances
 */
export type RedisTier =
    | "BASIC"
    | "STANDARD_HA";

/**
 * Memorystore for Redis versions
 * @see https://cloud.google.com/memorystore/docs/redis/reference/rest/v1/projects.locations.instances
 */
export type RedisVersion =
    | "REDIS_7_2"
    | "REDIS_7_0"
    | "REDIS_6_X"
    | "REDIS_5_0"
    | "REDIS_4_0"
    | "REDIS_3_2"
    | string;

/**
 * Memorystore for Redis transit encryption modes
 * @see https://cloud.google.com/memorystore/docs/redis/reference/rest/v1/projects.locations.instances
 */
export type RedisTransitEncryptionMode =
    | "TRANSIT_ENCRYPTION_MODE_UNSPECIFIED"
    | "DISABLED"
    | "SERVER_AUTHENTICATION";

/**
 * Memorystore for Redis persistence modes
 * @see https://cloud.google.com/memorystore/docs/redis/reference/rest/v1/projects.locations.instances
 */
export type RedisPersistenceMode =
    | "PERSISTENCE_MODE_UNSPECIFIED"
    | "DISABLED"
    | "RDB";

/**
 * Memorystore for Redis snapshot periods
 * @see https://cloud.google.com/memorystore/docs/redis/reference/rest/v1/projects.locations.instances
 */
export type RedisRdbSnapshotPeriod =
    | "SNAPSHOT_PERIOD_UNSPECIFIED"
    | "ONE_HOUR"
    | "SIX_HOURS"
    | "TWELVE_HOURS"
    | "TWENTY_FOUR_HOURS";

/**
 * Memorystore for Redis connect modes
 */
export type RedisConnectMode =
    | "DIRECT_PEERING"
    | "PRIVATE_SERVICE_ACCESS";

/**
 * Memorystore for Redis read replicas mode
 */
export type RedisReadReplicasMode =
    | "READ_REPLICAS_MODE_UNSPECIFIED"
    | "READ_REPLICAS_DISABLED"
    | "READ_REPLICAS_ENABLED";

/**
 * Memorystore for Redis instance states
 */
export type RedisInstanceState =
    | "STATE_UNSPECIFIED"
    | "CREATING"
    | "READY"
    | "UPDATING"
    | "DELETING"
    | "REPAIRING"
    | "MAINTENANCE"
    | "IMPORTING"
    | "FAILING_OVER";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the default port for a database version
 */
export function getDefaultPort(databaseVersion: string): number {
    if (databaseVersion.includes("MYSQL")) {
        return 3306;
    }
    if (databaseVersion.includes("SQLSERVER")) {
        return 1433;
    }
    // Default to PostgreSQL
    return 5432;
}

/**
 * Parse a GCP API error response
 */
export function parseGcpError(response: { error?: string; body: string }): string {
    if (response.error) {
        try {
            const body = JSON.parse(response.body);
            if (body.error?.message) {
                return `${response.error}: ${body.error.message}`;
            }
        } catch {
            // Ignore parse errors
        }
        return `${response.error}: ${response.body}`;
    }
    return response.body;
}

/**
 * Check if an operation is complete.
 * Supports both standard GCP LRO pattern (done boolean) and legacy status string.
 *
 * @param operation - The operation object or status string
 * @returns true if the operation is complete
 */
export function isOperationDone(operation: { done?: boolean; status?: string } | string | undefined): boolean {
    if (operation === undefined || operation === null) {
        return false;
    }
    // Standard GCP LRO pattern uses a boolean 'done' field
    if (typeof operation === "object") {
        if (operation.done === true) {
            return true;
        }
        // Fall back to status string for APIs that use it (e.g., Cloud SQL)
        if (operation.status) {
            return operation.status === "DONE" || operation.status === "finished" || operation.status === "completed";
        }
        return false;
    }
    // Legacy: direct status string
    return operation === "DONE" || operation === "finished" || operation === "completed";
}

/**
 * Check if an operation failed.
 * Supports both standard GCP LRO pattern (error object) and legacy status string.
 *
 * @param operation - The operation object or status string
 * @returns true if the operation failed
 */
export function isOperationFailed(operation: { done?: boolean; error?: unknown; status?: string } | string | undefined): boolean {
    if (operation === undefined || operation === null) {
        return false;
    }
    // Standard GCP LRO pattern: done is true but has an error object
    if (typeof operation === "object") {
        if (operation.done === true && operation.error) {
            return true;
        }
        // Fall back to status string for APIs that use it
        if (operation.status) {
            return operation.status === "FAILED" || operation.status === "failed" || operation.status === "error";
        }
        return false;
    }
    // Legacy: direct status string
    return operation === "FAILED" || operation === "failed" || operation === "error";
}

// =============================================================================
// Common API Response Interfaces
// =============================================================================

/**
 * GCP Operation response (for long-running operations)
 *
 * Standard GCP LRO pattern uses 'done' boolean field.
 * Some APIs (e.g., Cloud SQL) also use a 'status' string field.
 * @see https://cloud.google.com/service-usage/docs/reference/rest/v1/operations
 */
export interface GcpOperation {
    /** Full resource name of the operation */
    name: string;
    /** Standard LRO completion indicator */
    done?: boolean;
    /** Legacy status field used by some APIs (e.g., Cloud SQL) */
    status?: string;
    /** Metadata about the operation */
    metadata?: Record<string, unknown>;
    /** Operation type (used by some APIs) */
    operationType?: string;
    /** Target resource ID (used by some APIs) */
    targetId?: string;
    /** Error details if the operation failed */
    error?: {
        code: number;
        message: string;
        details?: Array<Record<string, unknown>>;
    };
    /** Response payload when operation completes successfully */
    response?: Record<string, unknown>;
}

/**
 * GCP Error response
 */
export interface GcpErrorResponse {
    error: {
        code: number;
        message: string;
        status?: string;
        errors?: Array<{
            message: string;
            domain: string;
            reason: string;
        }>;
    };
}

/**
 * IAM Policy structure
 */
export interface IamPolicy {
    version: number;
    etag: string;
    bindings: Array<{
        role: string;
        members: string[];
        condition?: {
            title: string;
            description: string;
            expression: string;
        };
    }>;
}
