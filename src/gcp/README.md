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
| `gcp/service-account` | Service accounts with IAM role bindings |
| `gcp/service-account-key` | Service account keys stored in Monk secrets |

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

## Best Practices

1. **Always enable APIs first** using `service-usage` entity
2. **Use dependencies** (`depends.wait-for`) to ensure proper ordering
3. **Use connections** to pass resource references between entities
4. **Store secrets** using `permitted-secrets` for passwords and keys
5. **Use idempotent names** that won't conflict with other projects
6. **Set appropriate timeouts** for long-running operations

## Contributing

See the main [README.md](../../README.md) for contribution guidelines.
