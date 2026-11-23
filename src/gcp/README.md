# GCP Entities

Google Cloud Platform entities for MonkEC. This package provides TypeScript-based entities for managing GCP resources with full type safety, idempotency, and comprehensive testing.

## Available Entities

| Entity | Description |
|--------|-------------|
| `gcp/service-usage` | Enable GCP APIs for a project |
| `gcp/cloud-sql-instance` | Cloud SQL database instances (PostgreSQL, MySQL, SQL Server) |
| `gcp/cloud-sql-database` | Databases within Cloud SQL instances |
| `gcp/cloud-sql-user` | Database users with password management |
| `gcp/big-query` | BigQuery datasets and tables |
| `gcp/cloud-storage` | Cloud Storage buckets |
| `gcp/cloud-storage-hmac-keys` | Cloud Storage HMAC keys for S3-compatible access |
| `gcp/firestore` | Firestore databases with PITR and backup support |
| `gcp/memorystore-redis` | Memorystore for Redis instances with export/import support |
| `gcp/cloud-run-service` | Cloud Run services for serverless container deployment |
| `gcp/cloud-run-job` | Cloud Run jobs for batch container execution |
| `gcp/pubsub-topic` | Pub/Sub topics for asynchronous messaging |
| `gcp/pubsub-subscription` | Pub/Sub subscriptions (pull or push delivery) |
| `gcp/cloud-dns-zone` | Cloud DNS managed zones (public/private) |
| `gcp/cloud-dns-record-set` | DNS record sets (A, AAAA, CNAME, MX, TXT, etc.) |
| `gcp/artifact-registry-repository` | Artifact Registry repositories (Docker, Maven, npm, Python, etc.) |
| `gcp/cloud-cdn-backend-bucket` | Cloud CDN backend bucket for static content from GCS |
| `gcp/cloud-cdn-backend-service` | Cloud CDN backend service for dynamic backends |
| `gcp/cloud-tasks-queue` | Cloud Tasks queues for HTTP task dispatch |
| `gcp/compute-disk` | Persistent Disks: blank, cloned from a disk, or restored from a snapshot |
| `gcp/compute-snapshot` | Standard snapshots of Persistent Disks |
| `gcp/gke-cluster` | Zonal GKE Standard cluster with one node pool |
| `gcp/service-account` | Service accounts with IAM role bindings |
| `gcp/service-account-key` | Service account keys stored in Monk secrets |
| `gcp/identity-platform-config` | Identity Platform project-level configuration (sign-in, MFA, domains) |
| `gcp/identity-platform-tenant` | Identity Platform tenants for multi-tenant user isolation |
| `gcp/identity-platform-oauth-idp-config` | Custom OIDC identity provider configurations |
| `gcp/identity-platform-default-idp-config` | Built-in social identity providers (Google, Facebook, Apple, etc.) |
| `gcp/identity-platform-inbound-saml-config` | SAML 2.0 identity provider configurations for enterprise SSO |
| `gcp/iap-brand` | IAP OAuth brand (adopt-only) — required for OAuth clients |
| `gcp/iap-oauth-client` | IAP OAuth 2.0 client under a brand (secret written to Monk secret) |
| `gcp/iap-settings` | IAP access/application settings attached to a resource |
| `gcp/iap-tunnel-dest-group` | IAP TCP tunnel destination group |
| `gcp/iap-access-policy` | IAM role binding for an IAP-protected resource |
| `gcp/cloud-armor-security-policy` | Global Cloud Armor security policy with inline rules + backend attach |

## Prerequisites

1. **GCP Project**: A GCP project with billing enabled
2. **Authentication**: Configure GCP credentials via one of:
   - `gcloud auth application-default login`
   - Service account key file via `GOOGLE_APPLICATION_CREDENTIALS`
   - Workload Identity (in GKE)
3. **APIs Enabled**: Enable required APIs using the `service-usage` entity

## Quick Start

### 1. Build the Entity Package

```bash
# From repo root
./build.sh gcp

# Or manually
INPUT_DIR=./src/gcp/ OUTPUT_DIR=./dist/gcp/ ./monkec.sh compile
```

### 2. Load the Entities

```bash
monk load dist/gcp/MANIFEST
```

### 3. Create Your Stack

```yaml
namespace: my-app

# Enable required APIs first
enable-apis:
  defines: gcp/service-usage
  apis:
    - sqladmin.googleapis.com
    - storage.googleapis.com

# Create a Cloud SQL instance
my-postgres:
  defines: gcp/cloud-sql-instance
  name: my-app-db
  database_version: POSTGRES_14
  tier: db-f1-micro
  region: us-central1
  allow_all: true
  depends:
    wait-for:
      runnables:
        - my-app/enable-apis
      timeout: 300

# Create a database
my-database:
  defines: gcp/cloud-sql-database
  instance: <- connection-target("instance") entity get-member("name")
  name: production
  connections:
    instance:
      runnable: my-app/my-postgres
      service: instance
  depends:
    wait-for:
      runnables:
        - my-app/my-postgres
      timeout: 600
```

### 4. Deploy

```bash
monk load my-stack.yaml
monk run my-app
```

## Entity Reference

### service-usage

Enable GCP APIs for your project.

```yaml
enable-apis:
  defines: gcp/service-usage
  # Single API
  name: sqladmin.googleapis.com
  # Or multiple APIs (batch mode)
  apis:
    - sqladmin.googleapis.com
    - bigquery.googleapis.com
    - storage.googleapis.com
  # Optional: override project
  project: my-project-id
```

### cloud-sql-instance

Create and manage Cloud SQL database instances.

```yaml
my-postgres:
  defines: gcp/cloud-sql-instance
  name: my-instance                    # Required: instance name
  database_version: POSTGRES_14        # Default: POSTGRES_14
  tier: db-f1-micro                    # Default: db-f1-micro
  region: us-central1                  # Default: us-central1
  allow_all: false                     # Default: false (allow 0.0.0.0/0)
  root_password: ""                    # Optional: set root password
  deletion_protection: false           # Default: false
  storage_type: PD_SSD                 # Default: PD_SSD
  storage_size_gb: 10                  # Default: 10
  storage_auto_resize: true            # Default: true
  availability_type: ZONAL             # Default: ZONAL (or REGIONAL)
  backup_start_time: "03:00"           # Optional: enable backups
  point_in_time_recovery_enabled: false # Default: false
  services:
    instance:
      protocol: tcp
      address: <- entity-state get-member("address") default("")
      port: <- entity-state get-member("port") default(5432) to-int
```

**Supported Database Versions:**
- PostgreSQL: `POSTGRES_9_6` through `POSTGRES_16`
- MySQL: `MYSQL_5_6`, `MYSQL_5_7`, `MYSQL_8_0`
- SQL Server: `SQLSERVER_2017_*`, `SQLSERVER_2019_*`

**Actions:**
- `get-info`: Get instance details
- `restart`: Restart the instance
- `stop`: Stop the instance
- `start`: Start the instance

**Backup & Restore Actions:**
- `get-backup-info`: Show backup configuration and PITR status
- `create-backup`: Create an on-demand backup
- `list-backups`: List all backups (automated and on-demand)
- `describe-backup`: Get detailed backup information
- `delete-backup`: Delete a specific backup
- `restore`: Restore from a backup
- `get-restore-status`: Check restore operation progress

### cloud-sql-database

Create databases within a Cloud SQL instance.

```yaml
my-database:
  defines: gcp/cloud-sql-database
  instance: <- connection-target("instance") entity get-member("name")
  name: myapp_production               # Required: database name
  charset: UTF8                        # Optional: character set
  collation: en_US.UTF8                # Optional: collation
  connections:
    instance:
      runnable: my-namespace/my-instance
      service: instance
```

### cloud-sql-user

Create database users with automatic password management.

```yaml
my-user:
  defines: gcp/cloud-sql-user
  instance: <- connection-target("instance") entity get-member("name")
  name: app_user                       # Required: username
  password_secret: my-db-password      # Required: secret name for password
  host: "%"                            # Optional: host restriction (MySQL)
  type: BUILT_IN                       # Default: BUILT_IN
  permitted-secrets:
    my-db-password: true
  connections:
    instance:
      runnable: my-namespace/my-instance
      service: instance
```

The password is automatically generated if the secret doesn't exist.

### big-query

Create and manage BigQuery datasets.

```yaml
my-dataset:
  defines: gcp/big-query
  dataset: analytics_data              # Required: dataset ID
  location: US                         # Default: US
  description: My analytics dataset    # Optional
  default_table_expiration_ms: 86400000 # Optional: 24 hours
  labels:                              # Optional
    environment: production
  tables: |                            # Optional: JSON array of tables
    [
      {
        "name": "events",
        "fields": [
          {"name": "id", "type": "STRING"},
          {"name": "timestamp", "type": "TIMESTAMP"},
          {"name": "data", "type": "JSON"}
        ]
      }
    ]
```

**Actions:**
- `get`: Get dataset details
- `list-tables`: List all tables in the dataset
- `create-table`: Create a new table (args: name, schema)
- `delete-table`: Delete a table (args: name)

**Backup & Restore Actions (Table Snapshots):**
- `get-backup-info`: Show time travel settings and storage billing model
- `create-snapshot`: Create a table snapshot (args: table, snapshot, expiration_days, snapshot_time)
- `list-snapshots`: List all table snapshots in the dataset
- `describe-snapshot`: Get detailed snapshot information
- `delete-snapshot`: Delete a table snapshot
- `restore`: Restore a table from a snapshot (args: snapshot, target)
- `time-travel-info`: Show time travel query examples for a table

### cloud-storage

Create and manage Cloud Storage buckets.

```yaml
my-bucket:
  defines: gcp/cloud-storage
  name: globally-unique-bucket-name    # Required: must be globally unique
  location: US                         # Default: US
  storage_class: STANDARD              # Default: STANDARD
  uniform_bucket_level_access: true    # Default: true
  versioning_enabled: false            # Default: false
  predefined_acl: private              # Optional
  labels:                              # Optional
    environment: production
  lifecycle_rules: |                   # Optional: JSON array
    [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 365}
      }
    ]
  cors: |                              # Optional: JSON array
    [
      {
        "origin": ["*"],
        "method": ["GET"],
        "maxAgeSeconds": 3600
      }
    ]
```

**Actions:**
- `get`: Get bucket details
- `list-objects`: List objects (args: prefix, max_results)

### cloud-storage-hmac-keys

Create HMAC access keys for the Cloud Storage XML API (S3-compatible).
These keys are stored in Monk secrets:
- `gcs-hmac-access-key` (default)
- `gcs-hmac-secret-key` (default)

Prerequisites:
- Enable `storage.googleapis.com` with `gcp/service-usage`
- Use a service account from `gcp/service-account` and pass its `state.email`

```yaml
storage-hmac-keys:
  defines: gcp/cloud-storage-hmac-keys
  service_account_email: <- connection-target("sa") entity-state get-member("email")
  access_key_secret_ref: gcs-hmac-access-key
  secret_key_secret_ref: gcs-hmac-secret-key
  permitted-secrets:
    gcs-hmac-access-key: true
    gcs-hmac-secret-key: true
  connections:
    sa:
      runnable: gcp/service-account/my-sa
      service: service-account
```

Use these secrets with S3-compatible clients and point the endpoint to
`https://storage.googleapis.com`.

### firestore

Create and manage Firestore databases with point-in-time recovery support.

```yaml
my-firestore:
  defines: gcp/firestore
  database_id: my-database           # Required: database ID (use "(default)" for default)
  location: nam5                     # Required: multi-region or regional location
  type: FIRESTORE_NATIVE             # Default: FIRESTORE_NATIVE (or DATASTORE_MODE)
  point_in_time_recovery: true       # Optional: enable PITR for 7-day recovery window
  delete_protection: false           # Optional: prevent accidental deletion
  concurrency_mode: OPTIMISTIC       # Optional: OPTIMISTIC or PESSIMISTIC
```

**Actions:**
- `get`: Get database details
- `export-documents`: Export documents to GCS (args: output_uri_prefix, collection_ids)
- `import-documents`: Import documents from GCS (args: input_uri_prefix, collection_ids)

**Backup & Restore Actions:**
- `get-backup-info`: Show PITR status and earliest restore time
- `list-backups`: List backups in a location (args: location, limit)
- `describe-backup`: Get detailed backup information (args: backup_name)
- `delete-backup`: Delete a backup (args: backup_name)
- `restore`: Restore to a new database from backup (args: backup_name, target_database)
- `get-restore-status`: Check restore operation progress (args: operation_name)

### memorystore-redis

Create and manage Memorystore for Redis instances.

```yaml
my-redis:
  defines: gcp/memorystore-redis
  name: my-cache
  region: us-central1
  tier: BASIC
  memory_size_gb: 1
  redis_version: REDIS_7_0
  auth_enabled: true
  persistence_config:
    persistence_mode: RDB
    rdb_snapshot_period: SIX_HOURS
  depends:
    wait-for:
      runnables:
        - my-app/enable-apis
      timeout: 300
```

**Actions:**
- `get-info`: Get instance details

**Backup & Restore Actions:**
- `get-backup-info`: Show persistence and export/import guidance
- `create-snapshot`: Export to Cloud Storage (args: output_uri)
- `list-snapshots`: List export/import operations (args: filter, limit)
- `restore`: Import from Cloud Storage (args: source_uri)
- `get-restore-status`: Check export/import operation status (args: operation_name)

**Required API:**
- `redis.googleapis.com` via `gcp/service-usage` 

### pubsub-topic

Create and manage Pub/Sub topics for asynchronous messaging.

```yaml
my-topic:
  defines: gcp/pubsub-topic
  name: my-notifications                # Required: topic name
  labels:                               # Optional
    environment: production
  message_retention_duration: "604800s"  # Optional: 7 days retention
  kms_key_name: ""                      # Optional: KMS encryption key
  schema_name: ""                       # Optional: schema for validation
  schema_encoding: JSON                 # Optional: JSON or BINARY
  services:
    data:
      protocol: custom
```

**Actions:**
- `get-info`: Get topic details
- `publish`: Publish a message (args: message, attributes, ordering_key)
- `list-subscriptions`: List all subscriptions attached to this topic
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `pubsub.topics.create`, `pubsub.topics.get`, `pubsub.topics.update`, `pubsub.topics.delete`
- `pubsub.topics.publish` (for publish action)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `pubsub.googleapis.com` via `gcp/service-usage`

### pubsub-subscription

Create and manage Pub/Sub subscriptions for consuming messages.

```yaml
my-subscription:
  defines: gcp/pubsub-subscription
  name: my-worker                       # Required: subscription name
  topic_name: <- connection-target("topic") entity-state get-member("topic_name")
  ack_deadline_seconds: 60              # Optional: 10-600 seconds
  message_retention_duration: "604800s"  # Optional: message retention
  retain_acked_messages: false           # Optional
  filter: ""                            # Optional: message filter
  enable_exactly_once_delivery: false   # Optional
  push_endpoint: ""                     # Optional: push URL (pull if empty)
  dead_letter_topic: ""                 # Optional: DLQ topic resource name
  max_delivery_attempts: 5              # Optional: 5-100
  min_retry_delay: "10s"                # Optional
  max_retry_delay: "600s"              # Optional
  labels:                               # Optional
    environment: production
  connections:
    topic:
      runnable: my-namespace/my-topic
      service: data
  depends:
    wait-for:
      runnables:
        - my-namespace/my-topic
      timeout: 120
```

**Actions:**
- `get-info`: Get subscription details
- `pull-messages`: Pull and acknowledge messages (args: max_messages)
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `pubsub.subscriptions.create`, `pubsub.subscriptions.get`, `pubsub.subscriptions.update`, `pubsub.subscriptions.delete`
- `pubsub.subscriptions.consume` (for pull-messages action)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `pubsub.googleapis.com` via `gcp/service-usage`

### cloud-run-service

Deploy and manage serverless containers on Cloud Run.

```yaml
my-service:
  defines: gcp/cloud-run-service
  name: my-api                          # Required: service name
  location: us-central1                 # Required: GCP region
  image: gcr.io/my-project/my-image:v1  # Required: container image
  port: 8080                            # Default: 8080
  cpu: "1"                              # Default: "1"
  memory: 512Mi                         # Default: 512Mi
  timeout_seconds: 300                  # Default: 300
  concurrency: 80                       # Default: 80
  min_instances: 0                      # Default: 0
  max_instances: 100                    # Default: 100
  cpu_idle: true                        # Default: true (request-based billing)
  startup_cpu_boost: false              # Optional: extra CPU during startup
  ingress: INGRESS_TRAFFIC_ALL          # Default: INGRESS_TRAFFIC_ALL
  allow_unauthenticated: true           # Optional: set allUsers as invoker
  service_account: my-sa@project.iam.gserviceaccount.com  # Optional
  env_vars:                             # Optional
    DB_HOST: 10.0.0.1
    ENV: production
  labels:                               # Optional
    environment: production
  services:
    data:
      protocol: custom
```

**Actions:**
- `get-info`: Get service details (JSON)
- `get-revisions`: List service revisions
- `allow-unauthenticated`: Set IAM policy for public access
- `deny-unauthenticated`: Remove public access
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `run.services.create`, `run.services.get`, `run.services.update`, `run.services.delete`
- `run.services.getIamPolicy`, `run.services.setIamPolicy` (for IAM actions)
- `run.operations.get` (for LRO polling)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `run.googleapis.com` via `gcp/service-usage`

### cloud-run-job

Create and manage batch container workloads on Cloud Run Jobs.

```yaml
my-job:
  defines: gcp/cloud-run-job
  name: data-processor                  # Required: job name
  location: us-central1                 # Required: GCP region
  image: gcr.io/my-project/processor:v1 # Required: container image
  cpu: "2"                              # Default: "1"
  memory: 1Gi                           # Default: 512Mi
  timeout_seconds: 600                  # Default: 600
  max_retries: 3                        # Default: 3
  task_count: 10                        # Default: 1
  parallelism: 5                        # Default: 0 (auto)
  service_account: my-sa@project.iam.gserviceaccount.com  # Optional
  command: ["python"]                   # Optional: entrypoint override
  container_args: ["process.py"]        # Optional: arguments
  env_vars:                             # Optional
    BATCH_SIZE: "1000"
  labels:                               # Optional
    team: data
```

**Actions:**
- `get-info`: Get job details (JSON)
- `execute`: Trigger a new execution (args: task_count, timeout, env)
- `get-executions`: List recent executions
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `run.jobs.create`, `run.jobs.get`, `run.jobs.update`, `run.jobs.delete`
- `run.jobs.run` (for execute action)
- `run.executions.get`, `run.executions.list` (for execution tracking)
- `run.operations.get` (for LRO polling)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `run.googleapis.com` via `gcp/service-usage`

### cloud-dns-zone

Create and manage Cloud DNS managed zones for DNS hosting.

```yaml
my-zone:
  defines: gcp/cloud-dns-zone
  name: my-app-zone                     # Required: zone name (1-63 chars)
  dns_name: "myapp.example.com."        # Required: DNS name with trailing dot
  zone_description: "My app DNS zone"   # Optional
  visibility: public                    # Optional: "public" or "private"
  dnssec_enabled: false                 # Optional: enable DNSSEC
  logging_enabled: false                # Optional: query logging
  labels:                               # Optional
    environment: production
  networks:                             # Optional: VPC networks (for private zones)
    - projects/my-project/global/networks/my-vpc
  services:
    data:
      protocol: custom
```

**Actions:**
- `get-info`: Get zone details and nameservers
- `list-record-sets`: List all DNS records in the zone
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `dns.managedZones.create`, `dns.managedZones.get`, `dns.managedZones.update`, `dns.managedZones.delete`
- `dns.resourceRecordSets.list` (for list-record-sets action)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `dns.googleapis.com` via `gcp/service-usage`

### cloud-dns-record-set

Create and manage DNS record sets within a Cloud DNS managed zone.

```yaml
my-record:
  defines: gcp/cloud-dns-record-set
  zone_name: my-app-zone                # Required: zone name
  record_name: "www.myapp.example.com." # Required: DNS name with trailing dot
  record_type: A                        # Required: record type
  ttl: 300                              # Optional: TTL in seconds (default: 300)
  rrdatas:                              # Required: record data values
    - "203.0.113.10"
  depends:
    wait-for:
      runnables:
        - my-namespace/my-zone
      timeout: 120
```

**Supported Record Types:** A, AAAA, CNAME, MX, TXT, NS, SOA, SRV, CAA, PTR

**Actions:**
- `get-info`: Get record details

**Required Permissions:**
- `dns.resourceRecordSets.create`, `dns.resourceRecordSets.get`, `dns.resourceRecordSets.update`, `dns.resourceRecordSets.delete`

**Required API:**
- `dns.googleapis.com` via `gcp/service-usage`

### artifact-registry-repository

Create and manage Artifact Registry repositories for container images and language packages.

```yaml
my-docker-repo:
  defines: gcp/artifact-registry-repository
  name: my-app-docker                    # Required: repository ID
  location: us-central1                  # Required: GCP region
  repo_format: DOCKER                    # Required: DOCKER, MAVEN, NPM, PYTHON, APT, YUM, GO, GENERIC
  mode: STANDARD_REPOSITORY              # Optional: STANDARD_REPOSITORY, VIRTUAL_REPOSITORY, REMOTE_REPOSITORY
  repo_description: "Docker images"      # Optional
  docker_immutable_tags: false            # Optional: Docker-specific
  labels:                                # Optional
    environment: production
  services:
    data:
      protocol: custom
```

**Actions:**
- `get-info`: Get repository details
- `list-packages`: List packages in the repository
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `artifactregistry.repositories.create`, `artifactregistry.repositories.get`, `artifactregistry.repositories.update`, `artifactregistry.repositories.delete`
- `artifactregistry.packages.list` (for list-packages action)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `artifactregistry.googleapis.com` via `gcp/service-usage`

### cloud-cdn-backend-bucket

Create a CDN-enabled backend bucket to serve static content from Cloud Storage through Cloud CDN.

```yaml
my-cdn-bucket:
  defines: gcp/cloud-cdn-backend-bucket
  name: my-static-cdn                   # Required: backend bucket name
  bucket_name: my-gcs-bucket            # Required: GCS bucket to serve from
  enable_cdn: true                      # Default: true
  cache_mode: CACHE_ALL_STATIC          # Default: CACHE_ALL_STATIC
  default_ttl: 3600                     # Default: 3600 (1 hour)
  max_ttl: 86400                        # Default: 86400 (1 day)
  client_ttl: 300                       # Optional: browser cache TTL
  compression_mode: AUTOMATIC           # Optional: AUTOMATIC or DISABLED
  custom_response_headers:              # Optional
    - "X-Cache-Status:{cdn_cache_status}"
```

**Actions:**
- `get-info`: Get backend bucket details
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `compute.backendBuckets.create`, `compute.backendBuckets.get`, `compute.backendBuckets.update`, `compute.backendBuckets.delete`
- `compute.globalOperations.get` (for LRO polling)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `compute.googleapis.com` via `gcp/service-usage`

### cloud-cdn-backend-service

Create a CDN-enabled backend service for instance groups, NEGs, or serverless backends.

```yaml
my-cdn-service:
  defines: gcp/cloud-cdn-backend-service
  name: my-api-cdn                       # Required: backend service name
  backends:                              # Required: backend targets
    - group: https://compute.googleapis.com/.../networkEndpointGroups/my-neg
      balancing_mode: RATE
      max_rate_per_instance: 100
  enable_cdn: true                       # Default: true
  cache_mode: USE_ORIGIN_HEADERS         # Default: CACHE_ALL_STATIC
  protocol: HTTPS                        # Default: HTTP
  health_check: https://...              # Optional: health check self-link
  timeout_sec: 30                        # Default: 30
  labels:                                # Optional
    environment: production
```

**Actions:**
- `get-info`: Get backend service details
- `get-health`: Check health of backend instances
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `compute.backendServices.create`, `compute.backendServices.get`, `compute.backendServices.update`, `compute.backendServices.delete`
- `compute.globalOperations.get` (for LRO polling)
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `compute.googleapis.com` via `gcp/service-usage`

### compute-disk

Create a zonal Persistent Disk: blank, a clone of another disk in the same zone, or restored from a snapshot. `create` returns as soon as GCP accepts the request; the entity is ready once the disk is `READY`, which for a clone of a large disk takes minutes (readiness waits up to 30). A runnable can then name the disk in its `volumes:` block: Monk finds the disk by name and mounts it as it is (it formats only a disk with no filesystem), so cloned data is kept.

```yaml
data-clone:
  defines: gcp/compute-disk
  name: data-clone-1                    # Required: disk name, unique in the zone
  zone: europe-west1-b                  # Required
  source_disk: main-data                # Optional: name, projects/P/zones/Z/disks/D, or self-link
  # source_snapshot: main-data-snap-1   # Optional: name, projects/P/global/snapshots/S, or self-link
  # disk_type: pd-balanced              # Default: the source disk's type (GCP default otherwise)
  # size_gb: 50                         # Default: the source's size; must not be smaller. Required for a blank disk
  labels:
    purpose: branch
  permissions:
    cloud: [gcp]
```

Set at most one of `source_disk` and `source_snapshot`. Raising `size_gb` later resizes the disk; disks cannot shrink, and the type and source cannot change in place.

**State:** `name`, `id`, `self_link`, `zone`, `size_gb`, `disk_type`, `status`, `source_disk`, `source_snapshot`, `users` (instances it is attached to), `existing`, `operation_name`.

**Delete:** deletes the disk and waits until it is gone. A disk attached to an instance is not deleted; the error names the instances, so stop what mounts it first. A disk that existed before the entity created it is adopted (`existing: true`) and left in place, unless `force_ownership: true`. Disks the entity creates carry a `monk-owner` label, so a create whose response was lost is not mistaken for someone else's disk.

**Actions:**
- `get-info`: the disk as GCP describes it
- `snapshot`: start a snapshot of the disk (`name`, optional `storage_location`); the snapshot is not managed by Monk, use `gcp/compute-snapshot` for one that is
- `get-cost-estimate`: capacity cost breakdown
- `costs`: hourly and monthly cost as JSON for billing

Costs use Compute Engine list prices per GB-month (us-central1 / europe-west1 rates; other regions are higher). Provisioned IOPS and throughput (pd-extreme, Hyperdisk) are not included.

**Required Permissions:**
- `compute.disks.create`, `compute.disks.get`, `compute.disks.delete`, `compute.disks.resize`, `compute.disks.setLabels`
- `compute.disks.useReadOnly` on a source disk; `compute.snapshots.get`, `compute.snapshots.useReadOnly` on a source snapshot
- `compute.disks.createSnapshot`, `compute.snapshots.create` (for the `snapshot` action)
- `compute.zoneOperations.get`

### compute-snapshot

Take a standard snapshot of a Persistent Disk. Ready once the snapshot is `READY`; restore it with `gcp/compute-disk` (`source_snapshot`). Several snapshots can be taken back to back by defining one entity per snapshot.

```yaml
data-snapshot:
  defines: gcp/compute-snapshot
  name: main-data-snap-1                # Required: unique in the project
  source_disk: main-data                # Required: name, path, or self-link
  zone: europe-west1-b                  # Required when source_disk is a bare name
  storage_locations: [europe-west1]     # Optional: region or multi-region
  permissions:
    cloud: [gcp]
```

**State:** `name`, `id`, `self_link`, `status`, `source_disk`, `disk_size_gb`, `storage_bytes`, `storage_locations`, `existing`, `operation_name`.

**Delete:** deletes the snapshot and waits until it is gone; disks restored from it are not affected. Adopted snapshots are left in place unless `force_ownership: true`.

**Actions:** `get-info`, `get-cost-estimate`, `costs` (snapshot storage at the list price per GB-month of what the snapshot stores).

**Required Permissions:**
- `compute.snapshots.create`, `compute.snapshots.get`, `compute.snapshots.delete`, `compute.snapshots.setLabels`
- `compute.disks.createSnapshot` on the source disk
- `compute.globalOperations.get`

**Required API (both):**
- `compute.googleapis.com` via `gcp/service-usage`

### gke-cluster

Create a zonal Google Kubernetes Engine Standard cluster with one node pool. `create` returns as soon as GCP accepts the request; the entity is ready once the cluster is `RUNNING` (5-8 minutes; readiness waits up to about 22). The state exposes `gke_cluster`, `gke_location` and `gke_project`, which the `k8s/*` entities take to reach the cluster with the Monk cluster's GCP credentials.

```yaml
gke:
  defines: gcp/gke-cluster
  name: workloads                       # Required: at most 40 chars
  location: europe-west1-b              # Required: a zone (regions are refused)
  # release_channel: REGULAR            # RAPID, REGULAR, STABLE, EXTENDED or NONE
  # kubernetes_version: "1.33"          # Default: the channel's default
  machine_type: e2-standard-2           # Default: e2-standard-2
  node_count: 3                         # Default: 3
  disk_size_gb: 30                      # Default: 30
  disk_type: pd-standard                # Default: pd-standard
  # spot: true                          # Spot VMs: cheaper, reclaimed at any time
  # dataplane_v2: true                  # Default: true; enforces NetworkPolicies
  # logging: false                      # Default: false (off keeps the cost down)
  # monitoring: false                   # Default: false
  # network: default
  # subnetwork: my-subnet
  labels:
    purpose: demo
  permissions:
    cloud: [gcp]

app-namespace:
  defines: k8s/manifest
  gke_cluster: <- connection-target("gke") entity-state get-member("gke_cluster")
  gke_location: <- connection-target("gke") entity-state get-member("gke_location")
  gke_project: <- connection-target("gke") entity-state get-member("gke_project")
  connections:
    gke:
      runnable: gcp-example/gke
      service: default
```

The disk defaults differ from GKE's own (100 GB `pd-balanced` per node) because those disks count against the regional SSD quota. The GCE Persistent Disk CSI driver add-on is enabled. Logging and monitoring are off by default.

`dataplane_v2` (default `true`) creates the cluster with GKE Dataplane V2 (`ADVANCED_DATAPATH`), which enforces Kubernetes NetworkPolicies. It is create-only: changing it needs a new cluster.

**Update:** changing `node_count` resizes the pool; changing `labels` sets the cluster's resource labels. Both are cluster operations that cannot overlap, so when both change the resize is applied first and the labels with the next `monk update`. Anything else (`machine_type`, disks, `spot`, network, `kubernetes_version`, `release_channel`, `dataplane_v2`) needs a new cluster: the entity says so and leaves the cluster alone.

**State:** `name`, `location`, `project`, `gke_cluster`, `gke_location`, `gke_project`, `endpoint`, `ca_certificate`, `status`, `master_version`, `node_pool`, `node_count`, `self_link`, `existing`, `operation_name`.

**Delete:** deletes the cluster and waits until it is gone (3-5 minutes; up to 15). A cluster that existed before the entity created it is adopted (`existing: true`) and left in place, unless `force_ownership: true`. Clusters the entity creates carry a `monk-owner` label.

**Actions:**
- `get-info`: the cluster as GCP describes it
- `get-kubeconfig`: a kubeconfig using the `gke-gcloud-auth-plugin` exec form (Monk's k8s module maps it to Monk's GCP credentials; kubectl needs the plugin installed)
- `get-cost-estimate`: node VMs and boot disks at list prices (e2 types; spot at about 30%). The management fee is not included: the first zonal cluster per billing account is free
- `costs`: hourly and monthly cost as JSON for billing

**Required Permissions:**
- `container.clusters.create`, `container.clusters.get`, `container.clusters.delete`, `container.clusters.update`, `container.operations.get`
- `iam.serviceAccounts.actAs` on the nodes' service account

**Required API:**
- `container.googleapis.com` via `gcp/service-usage`

### cloud-tasks-queue

Create and manage Cloud Tasks queues for dispatching HTTP tasks.

```yaml
my-queue:
  defines: gcp/cloud-tasks-queue
  name: my-task-queue                    # Required: queue name
  location: us-central1                  # Required: GCP region
  max_dispatches_per_second: 100         # Optional: dispatch rate (default 500)
  max_burst_size: 50                     # Optional: burst size (default 100)
  max_concurrent_dispatches: 50          # Optional: concurrency (default 1000)
  max_attempts: 5                        # Optional: retry attempts (default 100)
  min_backoff: "1s"                      # Optional: min retry delay
  max_backoff: "300s"                    # Optional: max retry delay
  max_doublings: 4                       # Optional: backoff doublings (default 16)
  max_retry_duration: "3600s"            # Optional: total retry window
  log_level: INFO                        # Optional: logging level
  services:
    data:
      protocol: custom
```

**Actions:**
- `get-info`: Get queue details
- `pause`: Pause task dispatch
- `resume`: Resume task dispatch
- `purge-tasks`: Delete all tasks in the queue
- `create-task`: Create an HTTP task (args: url, method, body, schedule_time, service_account_email)
- `list-tasks`: List tasks (args: page_size)
- `get-cost-estimate`: Detailed cost breakdown
- `costs`: Standardized JSON cost for billing

**Required Permissions:**
- `cloudtasks.queues.create`, `cloudtasks.queues.get`, `cloudtasks.queues.update`, `cloudtasks.queues.delete`
- `cloudtasks.queues.pause`, `cloudtasks.queues.resume`, `cloudtasks.queues.purge`
- `cloudtasks.tasks.create`, `cloudtasks.tasks.list`
- `monitoring.timeSeries.list` (for cost estimation)

**Required API:**
- `cloudtasks.googleapis.com` via `gcp/service-usage`

### service-account

Create service accounts with IAM role bindings.

```yaml
my-sa:
  defines: gcp/service-account
  name: my-app-sa                      # Required: account ID
  display_name: My App Service Account # Optional
  description: Service account for... # Optional
  roles:                               # Optional: project-level roles
    - roles/cloudsql.client
    - roles/storage.objectViewer
```

**Actions:**
- `get-info`: Get service account details
- `enable`: Enable the service account
- `disable`: Disable the service account

### service-account-key

Create service account keys and store in Monk secrets.

```yaml
my-sa-key:
  defines: gcp/service-account-key
  secret: my-sa-credentials            # Required: secret name
  service_account_id: <- connection-target("sa") entity-state get-member("unique_id")
  key_type: TYPE_GOOGLE_CREDENTIALS_FILE # Default
  key_algorithm: KEY_ALG_RSA_2048      # Default
  permitted-secrets:
    my-sa-credentials: true
  connections:
    sa:
      runnable: my-namespace/my-sa
      service: service-account
```

## Idempotency

All GCP entities are idempotent:

- **Create**: If a resource already exists, it will be "adopted" and marked as `existing: true` in state
- **Delete**: Resources marked as `existing` won't be deleted (they weren't created by this entity)
- **Update**: Safe to run multiple times; only necessary changes are applied

## State Management

Each entity tracks important state information:

```yaml
# Example state for cloud-sql-instance
state:
  address: "34.123.45.67"
  port: 5432
  connection_name: "project:region:instance"
  existing: false
  database_version: "POSTGRES_14"
```

Access state values in other entities:

```yaml
other-entity:
  db_host: <- connection-target("db") entity-state get-member("address")
```

## Error Handling

Entities provide clear error messages and handle common failure scenarios:

- API rate limiting (retry with backoff)
- Resource not found (graceful handling)
- Permission denied (clear error message)
- Operation timeout (configurable timeouts)

## Testing

Run tests for the GCP entities:

```bash
# Set up environment
cp src/gcp/test/env.example src/gcp/test/.env
# Edit .env with your GCP credentials

# Run tests
sudo INPUT_DIR=./src/gcp/ ./monkec.sh test --verbose
```

Offline tests (`test/*.test.ts`, currently `compute-disk`, `compute-snapshot` and `gke-cluster`) need no cluster
and no credentials: they replay recordings of live runs.

```bash
monk entity test src/gcp
monk entity test --explore src/gcp     # with faults injected

# Re-record against a real project (creates and deletes 10 GB pd-standard disks and a snapshot)
GCP_CREDENTIALS="$(cat key.json)" GCP_PROJECT=my-project GCP_ZONE=europe-west1-b \
  monk entity test --record --run 'cloned from another|snapshotted and restored' src/gcp
```

The service account key in `GCP_CREDENTIALS` is only used to get access tokens; it is never
written to the recordings.

## Backup & Restore Interface

GCP database entities implement a unified backup and restore interface, providing consistent operations across different database types.

### Supported Entities

| Entity | Backup Type | Point-in-Time Recovery |
|--------|-------------|------------------------|
| `gcp/cloud-sql-instance` | Automated + On-demand backups | ✅ Supported (enable via `point_in_time_recovery_enabled`) |
| `gcp/firestore` | Scheduled backups + Export | ✅ Supported (enable via `point_in_time_recovery`) |
| `gcp/big-query` | Table snapshots + Time travel | ✅ Built-in (7+ days via `max_time_travel_hours`) |
| `gcp/memorystore-redis` | RDB snapshots + Export/Import | ❌ Not supported (use export/import for point-in-time) |

### Common Operations

```bash
# Check backup configuration
monk do namespace/entity get-backup-info

# Create a backup/snapshot
monk do namespace/cloud-sql create-backup description="Pre-migration"
monk do namespace/firestore export-documents output_uri_prefix="gs://bucket/backup"
monk do namespace/bigquery create-snapshot table="events" snapshot="events_backup"
monk do namespace/redis create-snapshot output_uri="gs://bucket/redis-backup.rdb"

# List available backups
monk do namespace/cloud-sql list-backups
monk do namespace/firestore list-backups location="nam5"
monk do namespace/bigquery list-snapshots
monk do namespace/redis list-snapshots

# Restore from backup
monk do namespace/cloud-sql restore backup_id="123456789"
monk do namespace/firestore restore backup_name="projects/.../backups/..." target_database="restored-db"
monk do namespace/bigquery restore snapshot="events_backup" target="events_restored"
monk do namespace/redis restore source_uri="gs://bucket/redis-backup.rdb"

# Check restore progress
monk do namespace/entity get-restore-status operation_name="..."
```

### Cloud SQL Backup Example

```yaml
# Enable automated backups with PITR
my-postgres:
  defines: gcp/cloud-sql-instance
  name: production-db
  database_version: POSTGRES_16
  tier: db-custom-2-7680
  region: us-central1
  backup_start_time: "03:00"              # Enable automated backups at 3 AM
  point_in_time_recovery_enabled: true    # Enable PITR for granular recovery
```

### BigQuery Time Travel

BigQuery provides built-in time travel for querying historical data:

```sql
-- Query data from 1 day ago
SELECT * FROM `project.dataset.table`
FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)

-- Query data at a specific point in time
SELECT * FROM `project.dataset.table`
FOR SYSTEM_TIME AS OF TIMESTAMP("2024-01-15 10:00:00 UTC")
```

Configure extended time travel (up to 7 weeks) using PHYSICAL storage billing:

```yaml
my-dataset:
  defines: gcp/big-query
  dataset: analytics
  storage_billing_model: PHYSICAL
  max_time_travel_hours: 1176    # 49 days (7 weeks)
```

## Identity-Aware Proxy (IAP) Entities

Five entities manage different aspects of Google Cloud Identity-Aware Proxy.

### Prerequisites

1. **Enable the IAP API** via `gcp/service-usage` with `apis: [iap.googleapis.com]`.
2. **Configure the OAuth consent screen** in the Cloud Console (APIs & Services → OAuth consent screen). `iap-brand` is adopt-only and throws a clear error if the brand does not exist.
3. **Grant IAP permissions** to the monk cluster service account. For full IAP management:
   - `roles/iap.admin` — required for `iap-access-policy` (setIamPolicy on web and tunnel resources) and for `iap-settings` PATCH.
   - `clientauthconfig.clients.*` permissions — required for `iap-oauth-client` (included in `roles/iap.admin`).
   - `resourcemanager.projects.get` — required by `iap-settings` and `iap-access-policy` to resolve the project number used in `iap_web` paths (included in basic roles).

### Entities

- `gcp/iap-brand` — adopts the project's OAuth brand (read-only) so OAuth clients can be created under it.
- `gcp/iap-oauth-client` — creates/manages IAP OAuth 2.0 clients; writes the generated secret to a Monk secret (`secret_ref`). Supports `reset-secret` to rotate.
- `gcp/iap-settings` — PATCHes `accessSettings`/`applicationSettings` on an existing IAP-protected resource (App Engine app, Compute backend service, Cloud Run service, organization, or folder). Snapshots prior settings and restores them on delete.
- `gcp/iap-tunnel-dest-group` — full CRUD for TCP tunnel destination groups (CIDRs + FQDNs) scoped to a project + location.
- `gcp/iap-access-policy` — manages a single `(target, role)` IAM binding on an IAP-protected resource. Only members added by this entity are tracked for clean removal on delete; pre-existing members are left intact.

### Target resource path builder

Both `iap-settings` and `iap-access-policy` use a common set of `target_*` fields to build the IAP resource path (using the project NUMBER, not project ID — auto-resolved via Resource Manager):

| `target_kind` | Path produced | Required fields |
|---------------|---------------|-----------------|
| `project` | `projects/{PN}/iap_web` | — |
| `organization` | `organizations/{ID}/iap_web` | `organization_id` |
| `folder` | `folders/{ID}/iap_web` | `folder_id` |
| `app-engine` | `projects/{PN}/iap_web/appengine-{APP}` | `app_id` |
| `app-engine-service` | `…/services/{SVC}` | `app_id`, `app_engine_service` |
| `compute` | `projects/{PN}/iap_web/compute/services/{BE}` | `backend_service` |
| `compute-regional` | `…/compute-{REGION}/services/{BE}` | `backend_service`, `region` |
| `cloud-run` | `projects/{PN}/iap_web/cloud_run-{REGION}/services/{NAME}` | `cloud_run_service`, `region` |
| `raw` | `resource_path` verbatim | `resource_path` |

### Example stack

See `src/gcp/example-iap.yaml` for a full example wiring brand → OAuth client → access policy → tunnel group → (commented) settings on a Compute backend service.

### Known limitations

- **External-audience brands** cannot be created via the IAP API (only via Cloud Console). `iap-brand` is adopt-only.
- **Client secret on GET** — GCP does not return IAP OAuth client secrets on GET. Adopting an existing client triggers a secret rotation so the Monk secret always holds a valid value.
- **IAP settings PATCH** requires the target resource to already exist. This entity does not create the underlying Compute backend service / App Engine app / Cloud Run service.

## Cloud Armor Security Policies

`gcp/cloud-armor-security-policy` manages global Cloud Armor security policies (type `CLOUD_ARMOR`) that protect external/global HTTP(S) load balancer backend services. Rules are declared inline in the Definition and reconciled via per-rule API endpoints, avoiding fingerprint races on rule edits.

### Prerequisites

1. **Enable the Compute Engine API** via `gcp/service-usage` with `apis: [compute.googleapis.com]`.
2. **Grant permissions** to the monk cluster service account. The single role `roles/compute.securityAdmin` covers everything needed. For a principle-of-least-privilege custom role, grant:
   - `compute.securityPolicies.create` / `.get` / `.list` / `.update` / `.delete` / `.use`
   - `compute.securityPolicies.addRule` / `.getRule` / `.patchRule` / `.removeRule`
   - `compute.backendServices.get` / `.setSecurityPolicy` (for attach/detach actions)
   - `compute.globalOperations.get` (LRO polling)
   - `monitoring.timeSeries.list` and `cloudbilling.services.list` (cost estimation)

### Example

```yaml
my-waf:
  defines: gcp/cloud-armor-security-policy
  name: monk-test-ca-policy
  policy_description: "Block bad actors, rate-limit everything else"
  default_action: deny(403)
  rules:
    - priority: 1000
      action: deny(403)
      src_ip_ranges: ["203.0.113.0/24"]       # Known bad range
      rule_description: "Block known bad IPs"
    - priority: 2000
      action: allow
      src_ip_ranges: ["10.0.0.0/8", "192.168.0.0/16"]
      rule_description: "Allow internal"
    - priority: 3000
      action: throttle
      match_expression: "true"
      rate_limit:
        rate_limit_count: 100
        rate_limit_interval_sec: 60
        conform_action: allow
        exceed_action: deny(429)
        enforce_on_key: IP
  adaptive_protection: true
  advanced_options:
    json_parsing: STANDARD
    log_level: NORMAL
```

### Actions

| Action | Args | Purpose |
|--------|------|---------|
| `get-info` | — | Dump full policy JSON |
| `list-rules` | — | Pretty-print rules (sorted by priority, default marked) |
| `add-rule` | `priority`, `action`, `src_ip_ranges` OR `match_expression`, `rule_description?`, `preview?` | Add a rule |
| `update-rule` | `priority`, plus any of `action`, `src_ip_ranges`, `match_expression`, `rule_description`, `preview` | Patch a rule |
| `remove-rule` | `priority` | Remove a rule (rejects default priority `2147483647`) |
| `set-default-action` | `action` | Change action on the default rule |
| `attach-backend-service` | `backend_service` (name or self-link) | Attach policy to a backend service |
| `detach-backend-service` | `backend_service` | Detach policy from a backend service |
| `get-cost-estimate` | — | Human-readable cost breakdown |
| `costs` | — | JSON cost for billing system |

### Notes and limitations

- **Scope**: only global `CLOUD_ARMOR` policies. Edge (`CLOUD_ARMOR_EDGE`) and regional policies are not supported by this entity.
- **Default rule**: GCP auto-creates a default rule at priority `2147483647`. Use `default_action` in the definition (or the `set-default-action` action) to change it — it cannot be deleted.
- **Rule priorities**: integer `0`–`2147483646`, unique within the policy. Lower = higher priority.
- **Adaptive Protection ML features** require Cloud Armor Enterprise. Enabling `adaptive_protection: true` on a Standard project is accepted but ML signals stay inactive.
- **Deletion is blocked if attached** to any backend service. Use the `detach-backend-service` action first.
- **`attach-backend-service`** applies the policy via `setSecurityPolicy`; `detach-backend-service` does the same with an empty policy string.

## Best Practices

1. **Always enable APIs first** using `service-usage` entity
2. **Use dependencies** (`depends.wait-for`) to ensure proper ordering
3. **Use connections** to pass resource references between entities
4. **Store secrets** using `permitted-secrets` for passwords and keys
5. **Use idempotent names** that won't conflict with other projects
6. **Set appropriate timeouts** for long-running operations

## Contributing

See the main [README.md](../../README.md) for contribution guidelines.
