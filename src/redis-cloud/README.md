# Monk Redis Cloud example

Example of deploying a Redis Cloud Database using Monk.

## Usage

1. Create account in Redis Cloud, add payment method and get your API account and user keys.

2. Build entities
```
./build.sh redis-cloud
```

3. Load the Redis Cloud stack
```
monk load ./dist/redis-cloud/MANIFEST

Loaded 0 runnables, 0 process groups, 0 services, 5 entities, 0 entity instances and 2 modules from 7 files
✨ Loaded:
 ├─⚙️ Entities: 
 │  ├─🧩 redis-cloud/essentials-database
 │  ├─🧩 redis-cloud/essentials-subscription
 │  ├─🧩 redis-cloud/pro-database   
 │  ├─🧩 redis-cloud/pro-subscription
 │  └─🧩 redis-cloud/subscription   
 └─✨ Modules:  
    ├─🧩 redis-cloud/base
    └─🧩 redis-cloud/common

```

```
monk load ./src/redis-cloud/example.yaml

Loaded 1 runnables, 1 process groups, 0 services, 0 entities, 2 entity instances and 0 modules
✨ Loaded:
 ├─🔩 Runnables:        
 │  └─🧩 redis-cloud-example/redis-client
 ├─🔗 Process groups:   
 │  └─🧩 redis-cloud-example/stack
 └─⚙️ Entity instances: 
    ├─🧩 redis-cloud-example/essentials-database
    └─🧩 redis-cloud-example/essentials-subscription

```

4. Create secrets for the Redis Cloud API keys. Secret for password (redis-cloud-db-password) is optional, will be generated automatically if not provided.

```
monk secrets add -g redis-cloud-account-key="YOUR_ACCOUNT_KEY"
monk secrets add -g redis-cloud-user-key="YOUR_USER_KEY"
```

5. Deploy example stack using Monk.

```
monk run redis-cloud-example/stack
```

```
monk ps -a

✔ Got state
Group/Runnable/Containers                                          Ready   Status   Uptime   Peer   Ports  
🔗 local/redis-cloud-example/stack                                         running                          
   👽 local/redis-cloud-example/essentials-database                true    running                          
   👽 local/redis-cloud-example/essentials-subscription            true    running                          
   🔩 local/redis-cloud-example/redis-client                       true    running                         
    └─📦 local-dd1fa22dc0d41816577792f24b-mple-redis-client-redis          running  26s      local                     

        

```

-  Check connection to Redis Cloud database from the Redis client runnable

```
monk exec redis-cloud-example/redis-client bash -c 'redis-cli -u redis://${REDIS_USER}:${REDIS_PASSWORD}@${REDIS_ADDR} INCR mycounter'

✔ Connecting to shell started.
Warning: Using a password with '-a' or '-u' option on the command line interface may not be safe.
(integer) 1
```

- To delete the stack run:

```
monk delete redis-cloud-example/stack
```

## Custom Actions

### Backup Actions

Both Essentials and Pro databases support manual on-demand backups via custom actions.

#### Get Backup Info

View backup configuration for any database:

```bash
# Get backup info for Essentials database
monk do redis-cloud-example/essentials-database get-backup-info

# Get backup info for Pro database
monk do redis-cloud-example/pro-database get-backup-info
```

#### Essentials Database Backup

Back up an Essentials database to its configured `periodic_backup_path` or a custom location:

```bash
# Backup to configured periodic_backup_path
monk do redis-cloud-example/essentials-database create-snapshot

# Backup to custom location
monk do redis-cloud-example/essentials-database create-snapshot backup_path="s3://my-bucket/adhoc-backup/"
```

**Requirements:**
- Database must have `periodic_backup_path` configured, OR
- Provide `adhocBackupPath` parameter

**Configuration Example:**
```yaml
essentials-database:
  defines: redis-cloud/essentials-database
  name: MyDatabase
  subscription_id: 12345
  periodic_backup_path: "s3://my-backups/redis/"  # Required for automatic backups
```

#### Pro Database Backup

Back up a Pro database to its configured `remote_backup` location or a custom location:

```bash
# Backup to configured remote_backup storage path
monk do redis-cloud-example/pro-database create-snapshot

# Backup to custom location
monk do redis-cloud-example/pro-database create-snapshot backup_path="s3://my-bucket/adhoc-backup/"

# For Active-Active databases, backup specific region
monk do redis-cloud-example/pro-database create-snapshot region_name="us-east-1"

# Backup specific region to custom location
monk do redis-cloud-example/pro-database create-snapshot region_name="us-east-1" backup_path="s3://custom-path/"
```

**Requirements:**
- Database must have `remote_backup.storage_path` configured, OR
- Provide `adhocBackupPath` parameter
- For Active-Active databases, you must backup each region separately using `regionName`

**Configuration Example:**
```yaml
pro-database:
  defines: redis-cloud/pro-database
  name: ProductionDB
  subscription_id: 67890
  dataset_size_in_gb: 10
  remote_backup:
    active: true
    interval: every-6-hours
    storage_type: aws-s3
    storage_path: s3://prod-backups/redis/
```

**Notes:**
- Backups are asynchronous operations
- Maximum 4 simultaneous backups per cluster (default limit)
- Backup storage must have available capacity
- Supported storage types: AWS S3, Google Cloud Storage, Azure Blob Storage, FTP

#### List Snapshots

View available backups for a database:

```bash
# List backups for Essentials database
monk do redis-cloud-example/essentials-database list-snapshots

# List backups for Pro database
monk do redis-cloud-example/pro-database list-snapshots
```

### Restore Actions

Both Essentials and Pro databases support restoring/importing data from external storage locations.

**⚠️ WARNING:** Restore operations will **OVERWRITE ALL EXISTING DATA** in the target database. Always ensure you have current backups before performing a restore.

#### Essentials Database Restore

Restore an Essentials database from an external backup file:

```bash
# Restore from AWS S3
monk do redis-cloud-example/essentials-database restore \
  source_type="aws-s3" \
  source_uri="s3://my-backups/redis/backup-2025-11-27.rdb"

# Restore from Google Cloud Storage
monk do redis-cloud-example/essentials-database restore \
  source_type="google-blob-storage" \
  source_uri="gs://my-backups/redis/backup.rdb.gz"

# Restore from FTP server
monk do redis-cloud-example/essentials-database restore \
  source_type="ftp" \
  source_uri="ftp://user:pass@ftp.example.com/backup.rdb"

# Restore from HTTP server
monk do redis-cloud-example/essentials-database restore \
  source_type="http" \
  source_uri="http://backups.example.com/redis/backup.rdb"
```

#### Pro Database Restore

Restore a Pro database from an external backup file:

```bash
# Restore from AWS S3
monk do redis-cloud-example/pro-database restore \
  source_type="aws-s3" \
  source_uri="s3://prod-backups/redis/latest.rdb"

# Restore from Azure Blob Storage
monk do redis-cloud-example/pro-database restore \
  source_type="azure-blob-storage" \
  source_uri="abs://:accesskey@storageaccount/container/backup.rdb"

# Import from another Redis instance
monk do redis-cloud-example/pro-database restore \
  source_type="redis" \
  source_uri="redis://password@source-host:6379"
```

#### Supported Source Types

| Source Type | `source_type` Value | URI Format (`source_uri`) |
|------------|-------------------|-----------|
| AWS S3 | `aws-s3` | `s3://bucket/[path/]file.rdb[.gz]` |
| Google Cloud Storage | `google-blob-storage` | `gs://bucket/[path/]file.rdb[.gz]` |
| Azure Blob Storage | `azure-blob-storage` | `abs://:key@account/[container/]file.rdb[.gz]` |
| FTP Server | `ftp` | `ftp://[user[:pass]@]host[:port]/[path/]file.rdb[.gz]` |
| HTTP/HTTPS | `http` | `http://[user[:pass]@]host[:port]/[path/]file.rdb[.gz]` |
| Redis Server | `redis` | `redis://[password@]host:port` |

**Requirements:**
- Backup file must be in RDB format (`.rdb` or `.rdb.gz`)
- Redis Cloud must have READ access to the backup file location
- For S3/GCS/Azure: Ensure proper bucket/container permissions
- For FTP/HTTP: Include credentials in URI if required

**Notes:**
- Restore is an asynchronous operation that may take several minutes for large datasets
- Database may be unavailable during the restore process
- Gzip-compressed files (`.rdb.gz`) are supported
- AOF files are NOT supported for import