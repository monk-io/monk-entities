# MongoDB Atlas Entity

A comprehensive MongoDB Atlas entity for the Monk Entity Compiler that provides programmatic management of MongoDB Atlas resources including projects, clusters, and users.

## Overview

This entity allows you to:
- Create and manage MongoDB Atlas projects
- Deploy and configure MongoDB Atlas clusters
- Create and manage database users
- Configure IP access lists
- Retrieve connection strings for applications
- Create and manage backup snapshots (M10+ clusters)

## Features

- **Project Management**: Create and manage MongoDB Atlas projects within your organization
- **Cluster Deployment**: Deploy MongoDB clusters with configurable instance sizes and regions
- **User Management**: Create database users with specific roles and permissions
- **IP Access Control**: Configure IP access lists for security
- **Connection String Generation**: Automatically generate connection strings for applications
- **Backup Management**: Create on-demand snapshots and list available backups (M10+ clusters)
- **Restore Operations**: Restore from snapshots or point-in-time, monitor restore progress (M10+ clusters)
- **Error Handling**: Comprehensive error handling and logging
- **Resource Cleanup**: Proper resource cleanup on entity deletion

## Snapshots Quick Reference

| Action | Command | Description |
|--------|---------|-------------|
| **Get Backup Info** | `monk do ns/cluster get-backup-info` | View backup configuration |
| **Create Backup** | `monk do ns/cluster create-snapshot` | Create on-demand snapshot |
| **List Snapshots** | `monk do ns/cluster list-snapshots` | View available snapshots |
| **Restore** | `monk do ns/cluster restore snapshot_id="xxx"` | Restore from snapshot |
| **Check Status** | `monk do ns/cluster get-restore-status job_id="xxx"` | Monitor restore progress |
| **List Jobs** | `monk do ns/cluster list-restore-jobs` | View all restore jobs |

**Requirements:** M10+ cluster (dedicated). M0/M2/M5 shared tiers do not support backup API.

**⚠️ Important:** Restore operations make the cluster **READ-ONLY** until complete.

## Prerequisites

1. **MongoDB Atlas Account**: You need a MongoDB Atlas account with API access
2. **Service Account Token**: Create a service account token in MongoDB Atlas
3. **Organization Access**: Ensure your service account has access to the target organization
4. **Organization Name**: Know your exact MongoDB Atlas organization name (find it in the top-left of the Atlas console)

## Setup

### 1. Create MongoDB Atlas Service Account Credentials

1. Log in to MongoDB Atlas
2. Go to Organization Settings → Access Manager → Service Accounts
3. Create a new service account with appropriate permissions:
   - Organization Project Creator (for creating projects)
   - Organization Owner or Organization Member (for managing resources)
4. Click "Generate Token" or "Create Service Account Credentials"
5. Copy both the **Client ID** and **Client Secret** (you'll need both)
6. Format as: `clientId:clientSecret` (colon-separated, no spaces)

### 2. Store Credentials in Monk Secrets

```bash
# Store your MongoDB Atlas service account credentials (format: clientId:clientSecret)
monk secrets add -g mongodb-atlas-token="your_client_id:your_client_secret"

# Example (not real credentials):
# monk secrets add -g mongodb-atlas-token="mdb_client_abc123:secret_xyz789"

# Store password for database users (optional)
monk secrets add -g mongodb-user-password="your_secure_password_here"
```

## Entity Types

### 1. Project Entity

Creates and manages MongoDB Atlas projects.

**Definition Interface:**
```typescript
interface ProjectDefinition {
  secret_ref: string;      // Secret reference for API token
  name: string;            // Project name
  organization: string;    // Organization name
}
```

**State Interface:**
```typescript
interface ProjectState {
  id?: string;            // Project ID
  name?: string;          // Project name
  existing?: boolean;     // Whether project existed before
}
```

### 2. Cluster Entity

Creates and manages MongoDB Atlas clusters.

**Definition Interface:**
```typescript
interface ClusterDefinition {
  secret_ref: string;           // Secret reference for API token
  name: string;                 // Cluster name
  project_id: string;           // Project ID
  provider: "AWS" | "GCP" | "AZURE";  // Cloud provider
  region: string;               // Cloud region
  instance_size: "M0" | "M2" | "M5" | "M10" | "M20" | "M30" | "M40" | "M50" | "M60" | "M80";
  allow_ips?: string[];         // IP addresses allowed to access
}
```

**State Interface:**
```typescript
interface ClusterState {
  id?: string;                  // Cluster ID
  name?: string;                // Cluster name
  connection_standard?: string; // Standard connection string
  connection_srv?: string;      // SRV connection string
  existing?: boolean;           // Whether cluster existed before
}
```

### 3. User Entity

Creates and manages MongoDB Atlas database users.

**Definition Interface:**
```typescript
interface UserDefinition {
  secret_ref: string;           // Secret reference for API token
  name: string;                 // Username
  project_id: string;           // Project ID
  role: string;                 // Database role
  password_secret_ref: string;  // Secret reference for password
}
```

**State Interface:**
```typescript
interface UserState {
  name?: string;                // Username
  existing?: boolean;           // Whether user existed before
}
```

## Usage Examples

### Basic Example

```yaml
namespace: my-mongodb

# Create a project
my-project:
  defines: mongodb-atlas/project
  name: my-application-project
  organization: YourOrgName  # Replace with your actual MongoDB Atlas organization name
  secret_ref: mongodb-atlas-token
  permitted-secrets:
    mongodb-atlas-token: true

# Create a cluster
my-cluster:
  defines: mongodb-atlas/cluster
  name: my-application-cluster
  project_id: <- connection-target("project") entity-state get-member("id")
  provider: AWS
  region: US_EAST_1
  instance_size: M0
  secret_ref: mongodb-atlas-token
  allow_ips:
    - 192.168.1.0/24
  connections:
    project:
      runnable: my-mongodb/my-project
      service: data
  depends:
    wait-for:
      runnables:
        - my-mongodb/my-project
      timeout: 120

# Create a user
my-user:
  defines: mongodb-atlas/user
  name: app-user
  role: readWrite
  project_id: <- connection-target("project") entity-state get-member("id")
  secret_ref: mongodb-atlas-token
  password_secret_ref: mongodb-user-password
  connections:
    project:
      runnable: my-mongodb/my-project
      service: data
  depends:
    wait-for:
      runnables:
        - my-mongodb/my-project
      timeout: 120
```

### Application Integration Example

```yaml
# Application that uses MongoDB
my-app:
  defines: runnable
  connections:
    db:
      runnable: my-mongodb/my-cluster
      service: data
    user:
      runnable: my-mongodb/my-user
      service: data
  variables:
    mongodb_connection:
      env: MONGODB_CONNECTION_STRING
      value: <- connection-target("db") entity-state get-member("connection_srv")
      type: string
    mongodb_username:
      env: MONGODB_USERNAME
      value: <- connection-target("user") entity get-member("name")
      type: string
    mongodb_password:
      env: MONGODB_PASSWORD
      value: <- secret("mongodb-user-password")
      type: string
  containers:
    app:
      image: my-app:latest
```

## Custom Actions

### Backup Actions

MongoDB Atlas clusters (M10 and higher) support on-demand backup snapshots via custom actions. Backups are stored according to your backup retention policy and can be used for restore operations.

**⚠️ Important Backup Limitations:**
- **M0 Free clusters:** No backup API support. Use `mongodump`/`mongorestore` for manual backups
- **M2/M5 clusters:** Being migrated to Flex clusters (as of February 2025)
- **Flex clusters:** Automatic daily snapshots (cannot be disabled)
- **M10+ clusters:** Full Cloud Backup support with on-demand snapshots via API
- **During restore:** Cluster becomes read-only until restore completes

#### Get Backup Info

View backup configuration and status:

```bash
monk do my-mongodb/my-cluster get-backup-info
```

**Output includes:**
- Cluster tier and backup support status
- Backup enabled status
- Provider and region information

#### Create Backup Snapshot

Create an on-demand backup snapshot of your cluster:

```bash
# Create backup with default settings (7 days retention)
monk do my-mongodb/my-cluster create-snapshot

# Create backup with custom description
monk do my-mongodb/my-cluster create-snapshot description="Pre-migration backup"

# Create backup with custom retention period
monk do my-mongodb/my-cluster create-snapshot description="Before upgrade" retention_days=14
```

**Parameters:**
- `description` (optional): Description for the snapshot. Default: "Manual backup at <timestamp>"
- `retention_days` (optional): Number of days to retain the snapshot. Default: 7

**Requirements:**
- Cluster must be M10 or higher (dedicated cluster)
- Cluster must be in IDLE state (not UPDATING or MAINTENANCE)
- Sufficient storage quota for backups
- Project must have Cloud Backup enabled

**Important Constraints:**
- Cluster becomes **read-only** during restore operations
- Snapshots are **immutable** and cannot be modified
- Can restore to same version or higher version only
- Maximum retention depends on your backup policy

#### List Available Snapshots

View all available backup snapshots:

```bash
# List snapshots (default: show 10)
monk do my-mongodb/my-cluster list-snapshots

# List more snapshots
monk do my-mongodb/my-cluster list-snapshots limit=20
```

**Parameters:**
- `limit` (optional): Maximum number of snapshots to display. Default: 10

**Output includes:**
- Snapshot ID (needed for restore operations)
- Status (queued, inProgress, completed, failed)
- Type (onDemand or scheduled)
- Creation and expiration dates
- Description and size

**Example output:**
```
==================================================
Listing backup snapshots for cluster: my-cluster
==================================================

Total snapshots available: 5
Showing: 5 snapshot(s)

📸 Snapshot #1
   ID: 5e8f8f8f8f8f8f8f8f8f8f8f
   Status: completed
   Type: onDemand
   Created: 2024-11-27T10:30:00Z
   Expires: 2024-12-04T10:30:00Z
   Description: Pre-migration backup
   Size: 2.45 GB

📸 Snapshot #2
   ID: 5e8f8f8f8f8f8f8f8f8f8f90
   Status: completed
   Type: scheduled
   Created: 2024-11-26T00:00:00Z
   Expires: 2024-12-26T00:00:00Z
   Size: 2.40 GB
```

#### Configuration Example for Backups

For clusters that need backup support, ensure you're using M10 or higher:

```yaml
namespace: my-mongodb

my-production-cluster:
  defines: mongodb-atlas/cluster
  name: production-cluster
  project_id: <- connection-target("project") entity-state get-member("id")
  provider: AWS
  region: US_EAST_1
  instance_size: M10  # M10+ required for backups
  secret_ref: mongodb-atlas-token
  connections:
    project:
      runnable: my-mongodb/my-project
      service: data
```

#### Backup Best Practices

1. **Before Major Changes**: Always create a backup before deployments or migrations
   ```bash
   monk do my-mongodb/my-cluster create-snapshot description="Pre-deployment backup"
   ```

2. **Retention Planning**: Consider your recovery requirements when setting retention
   - Development: 3-7 days
   - Staging: 7-14 days
   - Production: 14-30 days (or more)

3. **Regular Verification**: Periodically list snapshots to verify backups are being created
   ```bash
   monk do my-mongodb/my-cluster list-snapshots
   ```

4. **Document Snapshot IDs**: Save snapshot IDs for critical backups for quick restore

5. **Monitor Costs**: Snapshots consume storage and incur costs. Review retention policies regularly.

### Restore Actions

MongoDB Atlas clusters (M10 and higher) support restoring from snapshots via custom actions.

**⚠️ IMPORTANT WARNINGS:**
- The target cluster becomes **READ-ONLY** during restore operations
- Restoring to the same cluster **OVERWRITES ALL EXISTING DATA**
- Restore operations can take **several hours** depending on data size
- Plan maintenance windows accordingly

#### Restore from Snapshot

Restore the cluster from a backup snapshot:

```bash
# Restore from snapshot (overwrites current cluster data!)
monk do my-mongodb/my-cluster restore snapshot_id="5e8f8f8f8f8f8f8f8f8f8f8f"

# Restore to a different cluster
monk do my-mongodb/my-cluster restore snapshot_id="xxx" target_id="restored-cluster"

# Restore to a different project
monk do my-mongodb/my-cluster restore snapshot_id="xxx" target_project_id="project-id"
```

**Parameters:**
- `snapshot_id` (required*): ID of the snapshot to restore
- `restore_timestamp` (required*): ISO 8601 timestamp or Unix seconds for point-in-time restore (alternative to snapshot_id)
- `target_id` (optional): Target cluster name (default: current cluster)
- `target_project_id` (optional): Target project ID (default: current project)

*Either `snapshot_id` or `restore_timestamp` is required.

#### Point-in-Time Restore

Restore to a specific point in time (requires continuous cloud backup):

```bash
# Restore to specific timestamp (ISO 8601 format)
monk do my-mongodb/my-cluster restore restore_timestamp="2024-12-01T10:00:00Z"

# Restore to specific time on different cluster
monk do my-mongodb/my-cluster restore restore_timestamp="2024-12-01T10:00:00Z" target_id="pitr-cluster"
```

#### Check Restore Status

Monitor the progress of a restore job:

```bash
# Check status of a specific restore job
monk do my-mongodb/my-cluster get-restore-status job_id="restore-job-id"
```

**Output includes:**
- Job ID and status (IN_PROGRESS, COMPLETED, FAILED)
- Target cluster and project
- Creation and completion times
- Snapshot or point-in-time details

#### List Restore Jobs

View all restore jobs for the cluster:

```bash
# List restore jobs (default: show 10)
monk do my-mongodb/my-cluster list-restore-jobs

# List more jobs
monk do my-mongodb/my-cluster list-restore-jobs limit=20
```

#### Restore Workflow Example

Complete disaster recovery workflow:

```bash
# 1. Get backup info to confirm backup is enabled
monk do my-mongodb/my-cluster get-backup-info

# 2. List available snapshots to find the right one
monk do my-mongodb/my-cluster list-snapshots

# 3. Start restore from snapshot
monk do my-mongodb/my-cluster restore snapshot_id="5e8f8f8f8f8f8f8f8f8f8f8f"

# 4. Check restore progress periodically
monk do my-mongodb/my-cluster get-restore-status job_id="restore-job-id"

# 5. Once complete, verify data integrity
# (cluster is read-write again after restore completes)
```

#### Restore Best Practices

1. **Test Restores Regularly**: Practice restore procedures before you need them
   ```bash
   # Restore to a test cluster, not production
   monk do prod/cluster restore snapshot_id="xxx" target_id="restore-test"
   ```

2. **Document Recovery Procedures**: Keep runbooks with snapshot IDs and restore commands

3. **Plan Maintenance Windows**: Restores make clusters read-only; schedule accordingly

4. **Verify After Restore**: Always validate data integrity after restore completes

5. **Monitor Long-Running Restores**: Large datasets can take hours; use `get-restore-status` to track

#### Automated Backup Workflows

Integrate backups into your deployment workflows:

```yaml
# Pre-deployment backup action
pre-deploy-backup:
  defines: action
  action:
    code: |
      monk do my-mongodb/my-cluster create-snapshot \
        description="Pre-deployment $(date +%Y-%m-%d-%H:%M)"

production-deployment:
  defines: runnable
  # ... your deployment config
  depends:
    wait-for:
      runnables:
        - my-mongodb/pre-deploy-backup
```

**Notes:**
- Snapshot creation is asynchronous and may take several minutes to hours depending on cluster size
- Maximum 4 simultaneous backup operations per cluster (default limit)
- Scheduled backups are managed by Atlas backup policy (not via these actions)
- On-demand snapshots count toward your backup storage quota

## Testing

### Compilation Test

```bash
# Compile the MongoDB Atlas module
INPUT_DIR=./src/mongodb-atlas/ OUTPUT_DIR=./dist/mongodb-atlas/ ./monkec.sh compile

# Run the comprehensive test suite (example wrapper)
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

### Integration Test

Use the provided test configuration:

```bash
# Deploy the test stack
monk load dist/examples/mongodb-atlas
monk load examples/mongodb-atlas/test/test-mongodb.yaml
monk run mongodb-test/test-stack
```

The test configuration (`test/test-mongodb.yaml`) includes:
- Project creation
- Cluster deployment with M0 (free tier) instance
- User creation with readWrite role
- Connection testing with MongoDB client

## Configuration Options

### Instance Sizes

- **M0**: Free tier (512 MB storage, shared CPU)
- **M2/M5**: Shared clusters
- **M10+**: Dedicated clusters with increasing resources

### Cloud Providers and Regions

**AWS Regions:**
- `US_EAST_1`, `US_WEST_2`, `EU_WEST_1`, `AP_SOUTHEAST_1`, etc.

**GCP Regions:**
- `CENTRAL_US`, `EASTERN_US`, `WESTERN_EUROPE`, etc.

**Azure Regions:**
- `EAST_US_2`, `WEST_EUROPE`, `SOUTHEAST_ASIA`, etc.

### Database Roles

Common roles include:
- `read`: Read-only access
- `readWrite`: Read and write access
- `dbAdmin`: Database administration
- `atlasAdmin`: Full Atlas administration

## Security Best Practices

1. **Use Service Account Tokens**: Always use service account tokens, not personal API keys
2. **Limit IP Access**: Configure `allow_ips` to restrict access to known IP ranges
3. **Strong Passwords**: Use strong, randomly generated passwords for database users
4. **Least Privilege**: Assign minimal required roles to database users
5. **Secret Management**: Store all credentials in Monk secrets, never in configuration files

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify service account token is correct and starts with `mdb_`
   - Check organization access permissions

2. **Project Not Found**
   - Verify organization name is correct
   - Ensure service account has access to the organization

3. **Cluster Creation Timeout**
   - Increase timeout values in depends section
   - Check MongoDB Atlas status page for service issues

4. **Connection Issues**
   - Verify IP access list includes your application's IP range
   - Check that cluster is in IDLE state before connecting

### Debug Mode

Enable debug output by checking the entity logs:

```bash
monk logs mongodb-atlas/cluster
monk logs mongodb-atlas/project
monk logs mongodb-atlas/user
```

## API Rate Limits

MongoDB Atlas API has rate limits:
- 100 requests per minute for most endpoints
- The entity includes automatic token caching to minimize API calls
- Cached tokens are stored in secrets with expiration

## Files

- `base.ts` - Base class with common functionality
- `common.ts` - Shared utilities and authentication
- `cluster.ts` - Cluster entity implementation
- `project.ts` - Project entity implementation
- `user.ts` - User entity implementation
- `test/example.yaml` - Complete example configuration
- `test/test-mongodb.yaml` - Test configuration
- `test/stack.yaml` - Stack configuration
- `test/example-stack.yaml` - Example stack configuration
- `README.md` - This documentation

## Support

For issues and questions:
1. Check the MongoDB Atlas documentation
2. Review the entity logs for error details
3. Verify your API credentials and permissions
4. Test with the provided example configurations in the `test/` directory

## License

This entity is part of the Monk Entity Compiler project.
