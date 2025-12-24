# Database Backup Management Guide for AI Agents

This guide provides standardized instructions for managing backups across all supported database providers using Monk entities.

## Command Format

All backup actions use the standard Monk command format:
```bash
monk do <namespace>/<entity>/<action> [parameters]
```

Parameters use `snake_case` naming convention.

---

## Entity Definition Parameters for Backups

This section describes the YAML configuration parameters that control backup behavior when defining database entities.

---

### AWS RDS Backup Parameters

Configure automated backups and snapshot behavior in the entity definition:

```yaml
my-mysql-db:
  defines: aws-rds/rds-instance
  region: us-east-1
  db_instance_identifier: my-mysql-instance
  engine: mysql
  # ... other required parameters ...
  
  # Backup Configuration
  backup_retention_period: 7              # Days to retain automated backups (0-35)
  preferred_backup_window: "07:00-08:00"  # Daily backup window (UTC)
  skip_final_snapshot: false              # Create final snapshot on deletion
  final_db_snapshot_identifier: "final-snapshot-name"  # Name for final snapshot
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `backup_retention_period` | number | 1 | Number of days to retain automated backups. Set to `0` to disable automated backups. Range: 0-35 |
| `preferred_backup_window` | string | AWS-assigned | Daily time range for automated backups (UTC). Format: `hh24:mi-hh24:mi` (e.g., `"07:00-08:00"`). Must be at least 30 minutes |
| `preferred_maintenance_window` | string | AWS-assigned | Weekly maintenance window (UTC). Format: `ddd:hh24:mi-ddd:hh24:mi` (e.g., `"sun:08:00-sun:09:00"`) |
| `skip_final_snapshot` | boolean | false | If `true`, skips creating a final snapshot when the instance is deleted. **Warning**: Data will be unrecoverable |
| `final_db_snapshot_identifier` | string | - | Name for the final snapshot created on deletion. Required if `skip_final_snapshot` is `false` |
| `storage_encrypted` | boolean | false | Enable encryption at rest (also encrypts backups) |
| `deletion_protection` | boolean | false | Prevents accidental deletion of the instance |

**Example - Production with Full Backup Configuration:**
```yaml
production-postgres:
  defines: aws-rds/rds-instance
  region: us-west-2
  db_instance_identifier: prod-postgres
  db_instance_class: db.m5.large
  engine: postgres
  master_username: admin
  allocated_storage: 100
  backup_retention_period: 14              # 2 weeks retention
  preferred_backup_window: "03:00-04:00"   # 3-4 AM UTC
  preferred_maintenance_window: "sun:05:00-sun:06:00"
  storage_encrypted: true
  skip_final_snapshot: false
  final_db_snapshot_identifier: prod-postgres-final
  deletion_protection: true
```

---

### AWS DynamoDB Backup Parameters

Configure backup and point-in-time recovery in the entity definition:

```yaml
my-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: my-production-table
  # ... key schema ...
  
  # Backup Configuration
  point_in_time_recovery_enabled: true   # Enable PITR (35-day continuous backup)
  deletion_protection_enabled: true      # Prevent accidental deletion
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `point_in_time_recovery_enabled` | boolean | false | Enable Point-in-Time Recovery with 35-day continuous backups. Allows restore to any second within retention period |
| `deletion_protection_enabled` | boolean | false | Prevents accidental deletion of the table |

**Example - Production Table with PITR:**
```yaml
production-orders:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: production-orders
  attribute_definitions:
    - AttributeName: order_id
      AttributeType: S
  key_schema:
    - AttributeName: order_id
      KeyType: HASH
  billing_mode: PAY_PER_REQUEST
  point_in_time_recovery_enabled: true   # 35-day continuous backup
  deletion_protection_enabled: true      # Prevent accidental deletion
  tags:
    Environment: production
    BackupEnabled: "true"
```

**Key Notes:**
- PITR provides **35-day** retention (cannot be changed)
- On-demand backups are created via actions, not definition parameters
- On-demand backups are retained **indefinitely** until deleted
- Restore always creates a **new table** (no in-place restore)

---

### Azure Cosmos DB Backup Parameters

Configure backup policy when creating a database account:

```yaml
cosmos-account:
  defines: azure-cosmosdb/database-account
  subscription_id: "your-subscription-id"
  resource_group_name: "your-rg"
  account_name: "my-cosmos-account"
  locations:
    - location_name: "East US"
      failover_priority: 0
  
  # Backup Policy Configuration
  backup_policy:
    backup_type: "Continuous"           # or "Periodic"
    continuous_tier: "Continuous7Days"  # or "Continuous30Days"
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `backup_policy` | object | No | Backup configuration object |
| `backup_policy.backup_type` | string | Yes | `"Continuous"` for point-in-time restore, or `"Periodic"` for scheduled backups |
| `backup_policy.continuous_tier` | string | No | For Continuous only: `"Continuous7Days"` (7-day retention) or `"Continuous30Days"` (30-day retention). Default: `"Continuous7Days"` |
| `backup_policy.periodic_interval_minutes` | number | No | For Periodic only: Interval between backups in minutes. Range: 60-1440. Default: 240 (4 hours) |
| `backup_policy.periodic_retention_hours` | number | No | For Periodic only: Backup retention in hours. Range: 8-720. Default: 8 |
| `backup_policy.backup_storage_redundancy` | string | No | Storage redundancy: `"Geo"`, `"Local"`, or `"Zone"`. Default: `"Geo"` |

**Continuous Backup (Recommended for Self-Service Restore):**
```yaml
cosmos-continuous:
  defines: azure-cosmosdb/database-account
  # ... required params ...
  backup_policy:
    backup_type: "Continuous"
    continuous_tier: "Continuous30Days"  # 30-day point-in-time restore
```

**Periodic Backup (Scheduled Backups):**
```yaml
cosmos-periodic:
  defines: azure-cosmosdb/database-account
  # ... required params ...
  backup_policy:
    backup_type: "Periodic"
    periodic_interval_minutes: 120      # Every 2 hours
    periodic_retention_hours: 168       # 7 days retention
    backup_storage_redundancy: "Geo"    # Geo-redundant storage
```

**Important Notes:**
- Once Continuous backup is enabled, it **cannot be changed back to Periodic**
- Periodic backup restore requires an Azure Support ticket
- Continuous backup enables self-service point-in-time restore via actions

---

### MongoDB Atlas Backup Parameters

MongoDB Atlas M10+ clusters have Cloud Backup enabled by default. Backup behavior is managed at the cluster tier level:

```yaml
my-cluster:
  defines: mongodb-atlas/cluster
  name: my-production-cluster
  project_id: <- connection-target("project") entity-state get-member("id")
  provider: AWS
  region: US_EAST_1
  instance_size: M10    # M10+ required for backup API
  secret_ref: mongodb-atlas-token
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `instance_size` | string | Yes | Cluster tier. **M10 or higher required for backup API**. Shared tiers (M0/M2/M5) do not support backup operations |

**Backup Support by Tier:**

| Tier | Backup Support | Notes |
|------|----------------|-------|
| M0 (Free) | ❌ No API | Use `mongodump`/`mongorestore` manually |
| M2/M5 | ❌ No API | Being migrated to Flex clusters |
| Flex | ⚠️ Limited | Automatic daily snapshots only (cannot be disabled or triggered manually) |
| M10+ | ✅ Full | Cloud Backup with on-demand snapshots, point-in-time recovery, and restore API |

**Example - Production Cluster with Backup Support:**
```yaml
production-cluster:
  defines: mongodb-atlas/cluster
  name: production-cluster
  project_id: <- connection-target("project") entity-state get-member("id")
  provider: AWS
  region: US_EAST_1
  instance_size: M10   # Required for backup operations
  secret_ref: mongodb-atlas-token
```

**Note:** Backup retention policies are managed in the MongoDB Atlas console, not via entity definition.

---

### Redis Cloud Backup Parameters

Redis Cloud has different backup options for Essentials and Pro tiers.

#### Essentials Subscription Parameters

Enable backup support at the subscription level:

```yaml
my-subscription:
  defines: redis-cloud/essentials-subscription
  name: My-Subscription
  provider: AWS
  region: us-east-1
  size: 30
  # ... auth params ...
  
  # Backup Support
  support_instant_and_daily_backups: true   # Enable backup capability
  support_data_persistence: true            # Enable data persistence
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `support_instant_and_daily_backups` | boolean | false | Enable instant and daily backup capability for databases in this subscription |
| `support_data_persistence` | boolean | false | Enable data persistence (required for backups to have meaningful data) |

#### Essentials Database Parameters

Configure backup path at the database level:

```yaml
my-essentials-db:
  defines: redis-cloud/essentials-database
  name: my-redis-db
  subscription_id: <- connection-target("sub") entity-state get-member("id")
  # ... auth params ...
  
  # Data Persistence
  data_persistence: "aof-every-1-second"    # Persistence mode
  
  # Backup Configuration
  periodic_backup_path: "s3://my-bucket/redis-backups/"  # Backup storage location
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `data_persistence` | string | Persistence mode: `"none"`, `"aof-every-1-second"`, `"aof-every-write"`, `"snapshot-every-1-hour"`, `"snapshot-every-6-hours"`, `"snapshot-every-12-hours"` |
| `periodic_backup_path` | string | Path to backup storage (S3/GCS/Azure). If set, automatic daily backups are enabled |

#### Pro Database Parameters

Pro databases support advanced remote backup configuration:

```yaml
my-pro-db:
  defines: redis-cloud/pro-database
  name: production-redis
  subscription_id: <- connection-target("sub") entity-state get-member("id")
  dataset_size_in_gb: 10
  # ... other params ...
  
  # Data Persistence
  data_persistence: "aof-every-1-second"
  replication: true
  
  # Remote Backup Configuration
  remote_backup:
    active: true
    interval: "every-6-hours"
    storage_type: "aws-s3"
    storage_path: "s3://my-bucket/redis-pro-backups/"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `data_persistence` | string | Same options as Essentials |
| `replication` | boolean | Enable replication for high availability |
| `remote_backup` | object | Remote backup configuration |
| `remote_backup.active` | boolean | Enable/disable scheduled remote backups |
| `remote_backup.interval` | string | Backup frequency: `"every-1-hours"`, `"every-2-hours"`, `"every-4-hours"`, `"every-6-hours"`, `"every-12-hours"`, `"every-24-hours"` |
| `remote_backup.time_utc` | string | Backup start time (UTC). Only for `"every-12-hours"` or `"every-24-hours"`. Format: `"14:00"` |
| `remote_backup.storage_type` | string | Storage provider: `"aws-s3"`, `"google-blob-storage"`, `"azure-blob-storage"`, `"ftp"` |
| `remote_backup.storage_path` | string | Full path to backup location (e.g., `"s3://bucket/path/"`) |

**Example - Pro Database with Full Backup Configuration:**
```yaml
production-redis:
  defines: redis-cloud/pro-database
  name: production-redis
  subscription_id: <- connection-target("sub") entity-state get-member("id")
  dataset_size_in_gb: 25
  data_persistence: "aof-every-1-second"
  replication: true
  enable_tls: true
  remote_backup:
    active: true
    interval: "every-6-hours"
    time_utc: "02:00"           # Backups at 2 AM UTC
    storage_type: "aws-s3"
    storage_path: "s3://prod-backups/redis/production/"
```

---

### DigitalOcean Database Backup Parameters

DigitalOcean managed databases include automatic daily backups with 7-day retention. Backups cannot be disabled or configured - they are always enabled.

```yaml
my-postgres:
  defines: digitalocean-database/database
  name: my-postgres-cluster
  engine: pg
  version: "16"
  num_nodes: 1
  region: nyc1
  size: db-s-1vcpu-1gb
  # No backup-specific parameters - backups are automatic
```

| Feature | Value | Notes |
|---------|-------|-------|
| Automatic Backups | Always enabled | Cannot be disabled |
| Backup Frequency | Daily | Managed by DigitalOcean |
| Retention Period | 7 days | Fixed, cannot be changed |
| PITR Support | PostgreSQL, MySQL only | Via fork operation |
| Restore Method | Fork to new cluster | No in-place restore |

**Key Notes:**
- All DigitalOcean managed databases have automatic daily backups included
- Backup retention is fixed at 7 days
- Restore always creates a NEW cluster (fork) - no in-place restore option
- Point-in-time recovery is available only for PostgreSQL and MySQL
- Kafka does not support backups

---

## AWS RDS (Relational Database Service)

### Overview
AWS RDS supports MySQL, PostgreSQL, MariaDB, Oracle, and SQL Server with automated and manual backup capabilities.

### Backup Model
- **Automated Backups**: Daily snapshots with transaction logs for point-in-time recovery
- **Manual Snapshots**: User-initiated snapshots that persist until explicitly deleted
- **Retention**: Automated backups retained 1-35 days; manual snapshots indefinitely

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View backup retention, window, and status | None |
| `create-snapshot` | Create manual snapshot | `snapshot_id` |
| `list-snapshots` | List all available snapshots | None |
| `describe-snapshot` | Get detailed snapshot information | `snapshot_id` |
| `delete-snapshot` | Delete a manual snapshot | `snapshot_id` |
| `restore` | Restore to a new instance from snapshot | `snapshot_id`, `target_id` |
| `get-restore-status` | Check status of restored instance | `instance_id` |

### Usage Examples

```bash
# Check current backup configuration
monk do my-app/my-mysql-db/get-backup-info

# Create a snapshot before maintenance
monk do my-app/my-mysql-db/create-snapshot snapshot_id="pre-upgrade-2024-12-12"

# List all available snapshots
monk do my-app/my-mysql-db/list-snapshots

# Get details about a specific snapshot
monk do my-app/my-mysql-db/describe-snapshot snapshot_id="pre-upgrade-2024-12-12"

# Restore to a new instance
monk do my-app/my-mysql-db/restore snapshot_id="pre-upgrade-2024-12-12" target_id="restored-db"

# Check restore progress (RDS instances take 10-30 minutes to create)
monk do my-app/my-mysql-db/get-restore-status instance_id="restored-db"

# Delete old snapshot (only manual snapshots can be deleted)
monk do my-app/my-mysql-db/delete-snapshot snapshot_id="old-snapshot"
```

### Important Notes
- Restoring creates a NEW instance; it does not overwrite the existing one
- The `target_id` must be unique within the AWS region
- Automated snapshots cannot be deleted manually (controlled by retention policy)
- Restoration time depends on snapshot size and instance type

---

## AWS DynamoDB

### Overview
Amazon DynamoDB is a fully managed NoSQL key-value and document database that provides fast performance at any scale.

### Backup Model
- **Point-in-Time Recovery (PITR)**: Continuous backups with 35-day retention, restore to any second
- **On-Demand Backups**: User-initiated snapshots retained indefinitely until deleted
- **Restore Target**: Always creates a NEW table (does not overwrite source)

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View PITR status and recent backups | None |
| `create-snapshot` | Create on-demand backup | None (optional: `backup_name`) |
| `list-snapshots` | List available backups | None (optional: `limit`) |
| `describe-snapshot` | Get detailed backup information | `backup_arn` or `snapshot_id` |
| `delete-snapshot` | Delete an on-demand backup | `backup_arn` or `snapshot_id` |
| `restore` | Restore to a new table | `target_table` + (`backup_arn` OR `restore_timestamp` OR `use_latest`) |
| `get-restore-status` | Check status of restored table | `target_table` |

### Usage Examples

```bash
# Check backup configuration and PITR status
monk do my-app/my-table/get-backup-info

# Create an on-demand backup
monk do my-app/my-table/create-snapshot backup_name="pre-migration-backup"

# List available backups
monk do my-app/my-table/list-snapshots limit="20"

# Get details about a specific backup
monk do my-app/my-table/describe-snapshot backup_arn="arn:aws:dynamodb:us-east-1:123456789:table/my-table/backup/xxx"

# Restore from on-demand backup to new table
monk do my-app/my-table/restore backup_arn="arn:aws:dynamodb:..." target_table="restored-table"

# Point-in-time restore to latest available
monk do my-app/my-table/restore use_latest="true" target_table="restored-table"

# Point-in-time restore to specific timestamp (ISO format)
monk do my-app/my-table/restore restore_timestamp="2024-12-15T10:30:00Z" target_table="restored-table"

# Point-in-time restore to specific timestamp (Unix seconds)
monk do my-app/my-table/restore restore_timestamp="1702636200" target_table="restored-table"

# Check restore progress
monk do my-app/my-table/get-restore-status target_table="restored-table"

# Delete an old backup
monk do my-app/my-table/delete-snapshot backup_arn="arn:aws:dynamodb:..."
```

### Important Notes
- **Restore creates a NEW table** - DynamoDB does not support in-place restore
- PITR provides 35-day retention; on-demand backups are retained indefinitely
- Backup includes table data, settings, LSIs, and GSIs
- Enable `point_in_time_recovery_enabled: true` in definition for PITR
- On-demand backups can be created anytime without affecting table performance

### Required IAM Permissions

For backup operations, the IAM policy must include:
```json
{
  "Effect": "Allow",
  "Action": "dynamodb:*",
  "Resource": [
    "arn:aws:dynamodb:*:*:table/*",
    "arn:aws:dynamodb:*:*:table/*/backup/*"
  ]
}
```

Or specific actions: `DescribeContinuousBackups`, `UpdateContinuousBackups`, `ListBackups`, `CreateBackup`, `DescribeBackup`, `DeleteBackup`, `RestoreTableFromBackup`, `RestoreTableToPointInTime`.

---

## Azure Cosmos DB

### Overview
Azure Cosmos DB is a globally distributed, multi-model database with continuous or periodic backup options.

### Backup Model
- **Continuous Backup**: Automatic continuous backup with point-in-time restore (self-service)
  - Continuous7Days: 7-day retention
  - Continuous30Days: 30-day retention
- **Periodic Backup**: Automatic backups at configured intervals (restore requires support ticket)

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View backup policy and earliest restore time | None |
| `list-restorable-accounts` | List accounts available for restore | None |
| `list-restorable-databases` | List databases that can be restored | `source_id`, `location` |
| `list-restorable-containers` | List containers that can be restored | `source_id`, `database_name`, `location` |
| `restore` | Create new account from point-in-time backup | `target_id`, `source_id`, `location`, `restore_timestamp` |

### Usage Examples

```bash
# Check backup configuration and earliest restore time
monk do my-app/cosmos-account/get-backup-info

# List accounts that can be restored
monk do my-app/cosmos-account/list-restorable-accounts

# List restorable databases for a specific account
monk do my-app/cosmos-account/list-restorable-databases \
  source_id="<restorable-account-instance-id>" \
  location="East US"

# List restorable containers within a database
monk do my-app/cosmos-account/list-restorable-containers \
  source_id="<restorable-account-instance-id>" \
  database_name="my-database" \
  location="East US"

# Restore to a new account at a specific point in time
monk do my-app/cosmos-account/restore \
  target_id="restored-cosmos-account" \
  source_id="<restorable-account-instance-id>" \
  location="East US" \
  restore_timestamp="2024-12-01T10:00:00Z"
```

### Important Notes
- Continuous backup is required for self-service point-in-time restore
- Restoring creates a NEW account; it does not overwrite the existing one
- The `source_id` is the instance ID from `list-restorable-accounts`, not the account name
- `restore_timestamp` must be within the retention window and in ISO 8601 format
- Periodic backup mode requires an Azure Support ticket for restore

---

## MongoDB Atlas

### Overview
MongoDB Atlas provides managed MongoDB clusters with automated cloud backup for M10+ dedicated clusters.

### Backup Model
- **Cloud Backup**: Automated snapshots with configurable retention
- **On-Demand Snapshots**: User-initiated backups
- **Point-in-Time Recovery**: Continuous oplog backup for precise recovery (M10+ only)
- **Limitation**: M0/M2/M5 shared tiers do NOT support backup API

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View backup configuration and status | None |
| `create-snapshot` | Create on-demand snapshot | None (optional: `description`, `retention_days`) |
| `list-snapshots` | List available snapshots | None |
| `describe-snapshot` | Get detailed snapshot information | `snapshot_id` |
| `delete-snapshot` | Delete a backup snapshot | `snapshot_id` |
| `restore` | Restore from snapshot or point-in-time | `snapshot_id` OR `restore_timestamp` |
| `get-restore-status` | Check restore job progress | `job_id` |
| `list-restore-jobs` | View all restore jobs | None |

### Usage Examples

```bash
# Check backup configuration
monk do my-mongodb/my-cluster/get-backup-info

# Create a snapshot with description
monk do my-mongodb/my-cluster/create-snapshot description="Pre-migration backup"

# Create a snapshot with custom retention
monk do my-mongodb/my-cluster/create-snapshot description="Long-term" retention_days="30"

# List all available snapshots
monk do my-mongodb/my-cluster/list-snapshots

# Get details about a specific snapshot
monk do my-mongodb/my-cluster/describe-snapshot snapshot_id="6753abc123def456"

# Restore from a specific snapshot (WARNING: overwrites cluster data!)
monk do my-mongodb/my-cluster/restore snapshot_id="6753abc123def456"

# Point-in-time restore to specific timestamp
monk do my-mongodb/my-cluster/restore restore_timestamp="1702300800"

# Check restore job progress
monk do my-mongodb/my-cluster/get-restore-status job_id="6753xyz789"

# List all restore jobs
monk do my-mongodb/my-cluster/list-restore-jobs

# Delete an old snapshot
monk do my-mongodb/my-cluster/delete-snapshot snapshot_id="6753abc123def456"
```

### Important Notes
- **WARNING**: Restore OVERWRITES the existing cluster data (unlike RDS/Cosmos which create new instances)
- Backup API requires M10+ dedicated clusters; M0/M2/M5 shared tiers return errors
- `restore_timestamp` is Unix timestamp in seconds (not ISO 8601)
- Point-in-time restore requires continuous backup to be enabled
- Snapshots may take several minutes to complete

---

## Redis Cloud

### Overview
Redis Cloud offers Essentials (shared) and Pro (dedicated) database tiers with backup capabilities.

### Backup Model
- **Automatic Backups**: Configured per database with interval settings
- **On-Demand Snapshots**: User-initiated backups
- **Remote Backup** (Pro only): Scheduled backups to S3/GCS/Azure Blob
- **Import/Restore**: Restore from external RDB files via HTTP/FTP/S3/GCS/Azure

### Available Actions (Essentials & Pro)

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View backup configuration | None |
| `create-snapshot` | Create on-demand backup | None |
| `list-snapshots` | List available backups | None |
| `restore` | Import data from external backup | `source_type`, `source_uri` |
| `get-restore-status` | Check restore task progress | `task_id` |

### Supported Source Types for Restore
- `http` - HTTP/HTTPS URL
- `ftp` - FTP server
- `aws-s3` - Amazon S3
- `azure-blob-storage` - Azure Blob Storage
- `google-blob-storage` - Google Cloud Storage

### Usage Examples

```bash
# Check backup configuration
monk do my-app/my-redis/get-backup-info

# Create an on-demand backup snapshot
monk do my-app/my-redis/create-snapshot

# List available backups
monk do my-app/my-redis/list-snapshots

# Restore from S3 backup
monk do my-app/my-redis/restore \
  source_type="aws-s3" \
  source_uri="s3://my-bucket/backups/redis-backup.rdb"

# Restore from HTTP URL
monk do my-app/my-redis/restore \
  source_type="http" \
  source_uri="https://backups.example.com/redis-backup.rdb"

# Restore from Azure Blob Storage
monk do my-app/my-redis/restore \
  source_type="azure-blob-storage" \
  source_uri="https://myaccount.blob.core.windows.net/backups/redis.rdb"

# Check restore task progress
monk do my-app/my-redis/get-restore-status task_id="abc123-task-id"
```

### Pro-Only Features
```bash
# Pro databases support remote backup configuration in the entity definition
# Backups are automatically sent to configured storage (S3/GCS/Azure)

# Check Pro database backup info (includes remote backup status)
monk do my-app/my-pro-redis/get-backup-info
```

### Important Notes
- Restore imports data INTO the existing database (merge/overwrite behavior)
- The `source_uri` must be accessible from Redis Cloud infrastructure
- For S3, ensure proper bucket permissions or use signed URLs
- Task status values: `received`, `processing-in-progress`, `processing-completed`, `processing-error`

---

### GCP Cloud SQL Backup Parameters

Configure automated backups and point-in-time recovery in the entity definition:

```yaml
my-postgres:
  defines: gcp/cloud-sql-instance
  name: my-postgres-instance
  database_version: POSTGRES_14
  tier: db-custom-2-4096
  region: us-central1
  
  # Backup Configuration
  backup_start_time: "03:00"              # Enables automated daily backups
  point_in_time_recovery_enabled: true    # Enable PITR (7-day recovery window)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `backup_start_time` | string | - | Daily backup start time in HH:MM format (UTC). Setting this enables automated backups |
| `point_in_time_recovery_enabled` | boolean | false | Enable point-in-time recovery. Requires binary logging for MySQL |

---

### GCP Firestore Backup Parameters

Configure point-in-time recovery and delete protection:

```yaml
my-firestore:
  defines: gcp/firestore
  database_id: my-database
  location: us-central1
  
  # Backup Configuration
  point_in_time_recovery: POINT_IN_TIME_RECOVERY_ENABLED
  delete_protection: DELETE_PROTECTION_ENABLED
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `point_in_time_recovery` | enum | DISABLED | `POINT_IN_TIME_RECOVERY_ENABLED` or `POINT_IN_TIME_RECOVERY_DISABLED`. Enables 7-day document-level time travel |
| `delete_protection` | enum | DISABLED | `DELETE_PROTECTION_ENABLED` or `DELETE_PROTECTION_DISABLED`. Prevents accidental database deletion |

**Note:** Firestore PITR allows **reading historical document versions** (7 days), NOT database-level restore. Use `export-documents` for full database backups.

---

### GCP BigQuery Backup Parameters

Configure time travel window for datasets:

```yaml
my-dataset:
  defines: gcp/big-query
  dataset: my_analytics_dataset
  location: US
  dataset_description: Analytics data warehouse
  
  # Time Travel Configuration
  max_time_travel_hours: 168              # 7 days (maximum)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_time_travel_hours` | number | 168 | Maximum time travel window in hours. Range: 48-168 (2-7 days) |
| `default_table_expiration_ms` | number | - | Default table expiration in milliseconds. 0 = tables never expire |

**Note:** BigQuery provides automatic time travel (no configuration needed). Table snapshots can be created manually via `create-snapshot` action.

---

## GCP Cloud SQL

### Overview
GCP Cloud SQL is a fully managed relational database service supporting PostgreSQL, MySQL, and SQL Server with automated backups and point-in-time recovery.

### Backup Model
- **Automated Backups**: Daily backups with configurable start time and retention (1-365 days)
- **On-Demand Backups**: User-initiated backups retained indefinitely until deleted
- **Point-in-Time Recovery**: Transaction log backups for precise recovery (requires binary logging)
- **Restore Target**: Overwrites the existing instance (unlike RDS which creates new)

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View backup configuration and PITR status | None |
| `create-backup` | Create on-demand backup | None (optional: `description`) |
| `list-backups` | List available backups | None |
| `describe-backup` | Get detailed backup information | `backup_id` |
| `delete-backup` | Delete a backup | `backup_id` |
| `restore` | Restore from backup (overwrites instance) | `backup_id` |
| `get-restore-status` | Check restore operation progress | `operation_name` |

### Usage Examples

```bash
# Check backup configuration and PITR status
monk do my-app/my-postgres/get-backup-info

# Create an on-demand backup
monk do my-app/my-postgres/create-backup description="Pre-upgrade backup"

# List all available backups
monk do my-app/my-postgres/list-backups

# Get details about a specific backup
monk do my-app/my-postgres/describe-backup backup_id="1765968494026"

# Restore from backup (WARNING: overwrites instance!)
monk do my-app/my-postgres/restore backup_id="1765968494026"

# Check restore progress
monk do my-app/my-postgres/get-restore-status operation_name="operations/abc123"

# Delete an old backup
monk do my-app/my-postgres/delete-backup backup_id="1765968494026"
```

### Entity Definition Parameters

```yaml
my-postgres:
  defines: gcp/cloud-sql-instance
  name: my-postgres-instance
  database_version: POSTGRES_14
  tier: db-custom-2-4096
  region: us-central1
  
  # Backup Configuration
  backup_start_time: "03:00"              # Daily backup start time (UTC)
  point_in_time_recovery_enabled: true    # Enable PITR
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `backup_start_time` | string | - | Daily backup start time in HH:MM format (UTC). Setting this enables automated backups |
| `point_in_time_recovery_enabled` | boolean | false | Enable point-in-time recovery (requires binary logging for MySQL) |

### Important Notes
- **Restore OVERWRITES the instance** - unlike AWS RDS, Cloud SQL restore replaces the existing instance
- Automated backups require `backup_start_time` to be set
- PITR allows restore to any point in the last 7 days (for automated backups)
- On-demand backups are retained indefinitely until manually deleted

---

## GCP Firestore

### Overview
GCP Firestore is a NoSQL document database with export/import capabilities and optional scheduled backups.

### Backup Model
- **Export/Import**: Manual exports to Cloud Storage buckets
- **Scheduled Backups**: Managed backups with retention policies (configured via backup schedules)
- **Point-in-Time Recovery**: Document-level time travel (7-day retention) - read historical versions, NOT database-level restore
- **Restore Target**: Creates a NEW database (does not overwrite)

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View PITR status and configuration | None |
| `export-documents` | Export database to Cloud Storage | `output_uri_prefix` |
| `import-documents` | Import from Cloud Storage export | `input_uri_prefix` |
| `list-backups` | List scheduled backups | `location` |
| `describe-backup` | Get backup details | `backup_name` |
| `delete-backup` | Delete a scheduled backup | `backup_name` |
| `restore` | Restore from scheduled backup to new database | `backup_name`, `target_database` |
| `get-restore-status` | Check restore operation progress | `operation_name` |

### Usage Examples

```bash
# Check backup configuration and PITR status
monk do my-app/my-firestore/get-backup-info

# Export database to Cloud Storage
monk do my-app/my-firestore/export-documents output_uri_prefix="gs://my-bucket/firestore-backup"

# Export specific collections
monk do my-app/my-firestore/export-documents \
  output_uri_prefix="gs://my-bucket/firestore-backup" \
  collection_ids="users,orders"

# Import from Cloud Storage export
monk do my-app/my-firestore/import-documents input_uri_prefix="gs://my-bucket/firestore-backup"

# List scheduled backups in a location
monk do my-app/my-firestore/list-backups location="us-central1"

# Get backup details
monk do my-app/my-firestore/describe-backup backup_name="projects/my-project/locations/us-central1/backups/backup-id"

# Restore to a new database
monk do my-app/my-firestore/restore \
  backup_name="projects/my-project/locations/us-central1/backups/backup-id" \
  target_database="restored-database"

# Check restore progress
monk do my-app/my-firestore/get-restore-status operation_name="projects/my-project/databases/restored-database/operations/xxx"

# Delete an old backup
monk do my-app/my-firestore/delete-backup backup_name="projects/my-project/locations/us-central1/backups/backup-id"
```

### Entity Definition Parameters

```yaml
my-firestore:
  defines: gcp/firestore
  database_id: my-database
  location: us-central1
  
  # Optional Configuration
  database_type: FIRESTORE_NATIVE           # or DATASTORE_MODE
  point_in_time_recovery: POINT_IN_TIME_RECOVERY_ENABLED
  delete_protection: DELETE_PROTECTION_ENABLED
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `point_in_time_recovery` | string | DISABLED | `POINT_IN_TIME_RECOVERY_ENABLED` or `POINT_IN_TIME_RECOVERY_DISABLED` |
| `delete_protection` | string | DISABLED | `DELETE_PROTECTION_ENABLED` or `DELETE_PROTECTION_DISABLED` |

### Important Notes
- **PITR in Firestore is document-level only** - it allows reading historical document versions, NOT database-level restore
- Export/Import is the primary method for full database backups
- Scheduled backups require backup schedules (configured separately)
- Restore always creates a NEW database with the specified ID
- Export requires a Cloud Storage bucket with appropriate permissions

---

## GCP BigQuery

### Overview
GCP BigQuery is a serverless data warehouse with time travel and table snapshot capabilities.

### Backup Model
- **Time Travel**: Query data at any point in the last 2-7 days (configurable up to 7 days)
- **Table Snapshots**: Point-in-time snapshots of tables (retained for 7 days by default)
- **Restore Target**: Creates a NEW table (clone from snapshot)

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View dataset info and time travel window | None |
| `create-snapshot` | Create table snapshot | `source_table` (optional: `snapshot_table`, `snapshot_time`) |
| `list-snapshots` | List tables in dataset (including snapshots) | None |
| `describe-snapshot` | Get table/snapshot details | `table_name` |
| `delete-snapshot` | Delete a snapshot table | `table_name` |
| `restore` | Restore table from snapshot | `snapshot_table`, `target_table` |

### Usage Examples

```bash
# Check dataset info and time travel settings
monk do my-app/my-dataset/get-backup-info

# Create a snapshot of a table (at current time)
monk do my-app/my-dataset/create-snapshot source_table="my_table"

# Create a snapshot with custom name
monk do my-app/my-dataset/create-snapshot \
  source_table="my_table" \
  snapshot_table="my_table_backup_20241217"

# Create a snapshot at a specific point in time (time travel)
monk do my-app/my-dataset/create-snapshot \
  source_table="my_table" \
  snapshot_time="2024-12-16T10:00:00Z"

# List all tables/snapshots in dataset
monk do my-app/my-dataset/list-snapshots

# Get table/snapshot details
monk do my-app/my-dataset/describe-snapshot table_name="my_table_backup"

# Restore by creating a new table from snapshot
monk do my-app/my-dataset/restore \
  snapshot_table="my_table_backup" \
  target_table="my_table_restored"

# Delete a snapshot
monk do my-app/my-dataset/delete-snapshot table_name="my_table_backup"
```

### Entity Definition Parameters

```yaml
my-dataset:
  defines: gcp/big-query
  dataset: my_analytics_dataset
  location: US
  dataset_description: Analytics data warehouse
  
  # Time Travel Configuration (via dataset options)
  default_table_expiration_ms: 0            # Tables don't expire
  max_time_travel_hours: 168                # 7 days time travel (default)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `max_time_travel_hours` | number | 168 | Maximum time travel window in hours (48-168, i.e., 2-7 days) |
| `default_table_expiration_ms` | number | - | Default table expiration in milliseconds (0 = never) |

### Important Notes
- **Time travel** allows querying historical data without creating snapshots
- **Snapshots** capture table state at a specific point; retained for 7 days by default
- Restore creates a NEW table (clone) from the snapshot
- Snapshot creation uses BigQuery Jobs API and may take a few seconds
- Time travel window is configurable per-dataset (2-7 days)

---

## DigitalOcean Database

### Overview
DigitalOcean Managed Databases support PostgreSQL, MySQL, Valkey (Redis replacement), MongoDB, Kafka, and OpenSearch with automatic daily backups.

### Backup Model
- **Automatic Daily Backups**: All managed databases include automatic daily backups (cannot be disabled)
- **Retention**: Fixed 7-day retention for all engines
- **Point-in-Time Recovery**: Available for PostgreSQL and MySQL only
- **Restore Method**: Fork to new cluster (no in-place restore)

### Available Actions

| Action | Description | Required Parameters |
|--------|-------------|---------------------|
| `get-backup-info` | View backup configuration and PITR status | None |
| `list-backups` | List available backup points | None |
| `describe-backup` | Get details of a specific backup | `backup_created_at` |
| `restore` | Fork new cluster from backup | `new_cluster_name`, `backup_created_at` or `restore_time` |
| `get-restore-status` | Check fork operation progress | `cluster_id` |

### Usage Examples

```bash
# Check backup configuration and PITR status
monk do my-app/my-postgres/get-backup-info

# List available backups
monk do my-app/my-postgres/list-backups

# Get details of a specific backup
monk do my-app/my-postgres/describe-backup backup_created_at="2024-12-15T00:00:00Z"

# Restore from a specific backup to new cluster
monk do my-app/my-postgres/restore \
  new_cluster_name="restored-db" \
  backup_created_at="2024-12-15T00:00:00Z"

# Point-in-time recovery (PostgreSQL/MySQL only)
monk do my-app/my-postgres/restore \
  new_cluster_name="restored-db" \
  restore_time="2024-12-15T14:30:00Z"

# Restore with custom size and region
monk do my-app/my-postgres/restore \
  new_cluster_name="restored-db" \
  backup_created_at="2024-12-15T00:00:00Z" \
  size="db-s-2vcpu-4gb" \
  num_nodes="2" \
  region="nyc3"

# Check restore (fork) progress
monk do my-app/my-postgres/get-restore-status cluster_id="<new-cluster-id>"
```

### Backup Support by Engine

| Engine | Daily Backups | PITR | Fork/Restore |
|--------|:-------------:|:----:|:------------:|
| PostgreSQL (`pg`) | ✅ | ✅ | ✅ |
| MySQL (`mysql`) | ✅ | ✅ | ✅ |
| Valkey (`valkey`) | ✅ | ❌ | ❌ |
| MongoDB (`mongodb`) | ✅ | ❌ | ❌ |
| Kafka (`kafka`) | ❌ | ❌ | ❌ |
| OpenSearch (`opensearch`) | ✅ | ❌ | ❌ |

### Important Notes
- **Restore creates a NEW cluster** - DigitalOcean does not support in-place restore
- Automatic backups are always enabled (cannot be disabled)
- Backup retention is fixed at 7 days (cannot be changed)
- PITR is only available for PostgreSQL and MySQL
- The restored cluster is independent and not managed by the source entity
- First backup may take up to 24 hours after cluster creation

---

## Cross-Provider Comparison

### Action Standardization

| Action | AWS RDS | AWS DynamoDB | Azure Cosmos | MongoDB Atlas | Redis Cloud | GCP Cloud SQL | GCP Firestore | GCP BigQuery | DO Database |
|--------|:-------:|:------------:|:------------:|:-------------:|:-----------:|:-------------:|:-------------:|:------------:|:-----------:|
| `get-backup-info` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `create-snapshot` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌² | ✅ | ❌³ |
| `list-snapshots` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `describe-snapshot` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `delete-snapshot` | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌³ |
| `restore` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `get-restore-status` | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `export-documents` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `import-documents` | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `list-restorable-*` | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

²Firestore uses `export-documents` for manual backups; scheduled backups are managed via backup schedules.
³DigitalOcean backups are automatic and cannot be created/deleted manually.

### Restore Behavior Differences

| Provider | Restore Target | Data Handling |
|----------|----------------|---------------|
| AWS RDS | New instance | Creates new DB instance |
| AWS DynamoDB | New table | Creates new table (never overwrites) |
| Azure Cosmos DB | New account | Creates new Cosmos account |
| MongoDB Atlas | Same cluster | **OVERWRITES** existing data |
| Redis Cloud | Same database | Imports/merges data |
| GCP Cloud SQL | Same instance | **OVERWRITES** existing instance |
| GCP Firestore | New database | Creates new database |
| GCP BigQuery | New table | Creates new table (clone) |
| DigitalOcean Database | New cluster | Creates new cluster (fork) |

### Parameter Naming Convention

All parameters use `snake_case`:
- `snapshot_id` - Identifier for a snapshot
- `backup_arn` - Full ARN for a backup (DynamoDB)
- `backup_name` - Name for a new backup (DynamoDB)
- `target_id` - Target resource identifier for restore
- `target_table` - Target table name for restore (DynamoDB)
- `source_id` - Source resource identifier
- `instance_id` - Instance identifier for status checks
- `task_id` / `job_id` - Task/job identifier for async operations
- `restore_timestamp` - Point-in-time timestamp
- `use_latest` - Restore to latest available point (DynamoDB PITR)
- `source_type` - Type of backup source (Redis Cloud)
- `source_uri` - URI to backup file (Redis Cloud)

---

## Best Practices for AI Agents

### Pre-Operation Checks
1. Always run `get-backup-info` first to verify backup configuration
2. Check if the database tier supports backup operations (e.g., M10+ for MongoDB Atlas)
3. Verify required parameters are available before attempting restore

### Creating Backups
1. Use descriptive `snapshot_id` or `description` with date/purpose
2. For critical operations, wait for snapshot completion before proceeding
3. Document the snapshot ID for potential rollback

### Restore Operations
1. **AWS RDS / AWS DynamoDB / Azure Cosmos DB / GCP Firestore / GCP BigQuery / DigitalOcean Database**: Safe - creates new resources
2. **MongoDB Atlas / GCP Cloud SQL**: **DANGEROUS** - overwrites existing data; confirm with user
3. **Redis Cloud**: Merges data; may affect existing keys

### Monitoring Async Operations
1. Use `get-restore-status` or `get-restore-status` to track progress
2. Poll at reasonable intervals (30-60 seconds)
3. Handle timeout scenarios (restores can take 10-60+ minutes)

### Error Handling
- `CLUSTER_TIER_NOT_SUPPORTED` (MongoDB): Upgrade to M10+
- `SNAPSHOT_NOT_FOUND`: Verify snapshot_id with `list-snapshots`
- `INSUFFICIENT_PERMISSIONS`: Check IAM/RBAC configuration
- `RESOURCE_EXISTS`: Target ID already in use (RDS/Cosmos)
- `403 Permission Denied` (GCP): Check service account IAM roles
- `BACKUP_NOT_FOUND` (GCP): Verify backup_id with `list-backups`

### GCP-Specific IAM Permissions

For GCP database backup operations, the service account needs these roles:

| Database | Required Roles |
|----------|----------------|
| Cloud SQL | `roles/cloudsql.admin` or specific `cloudsql.backupRuns.*` permissions |
| Firestore | `roles/datastore.owner` or `roles/firebase.admin` |
| BigQuery | `roles/bigquery.admin` or `bigquery.tables.create`, `bigquery.jobs.create` |

