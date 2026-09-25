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
- **Cost Estimation**: Table-driven monthly cost estimates, plus actual billed cost from the Atlas invoice API
- **Error Handling**: Comprehensive error handling and logging
- **Resource Cleanup**: Proper resource cleanup on entity deletion

## Snapshots Quick Reference

| Action | Command | Description |
|--------|---------|-------------|
| **Get Backup Info** | `monk do ns/cluster/get-backup-info` | View backup configuration |
| **Create Backup** | `monk do ns/cluster/create-snapshot` | Create on-demand snapshot |
| **List Snapshots** | `monk do ns/cluster/list-snapshots` | View available snapshots |
| **Restore** | `monk do ns/cluster/restore snapshot_id="xxx"` | Restore from snapshot |
| **Check Status** | `monk do ns/cluster/get-restore-status job_id="xxx"` | Monitor restore progress |
| **List Jobs** | `monk do ns/cluster/list-restore-jobs` | View all restore jobs |

**Requirements:** M10+ cluster (dedicated). M0 (free) and FLEX clusters do not support the on-demand backup API.

**⚠️ Important:** Restore operations make the cluster **READ-ONLY** until complete.

## Cost Quick Reference

| Action | Command | Description |
|--------|---------|-------------|
| **Estimate Cost** | `monk do ns/cluster/get-cost-estimate` | Human-readable monthly cost breakdown |
| **Costs (JSON)** | `monk do ns/cluster/costs` | Machine-readable output for Monk billing |
| **Actual Cost** | `monk do ns/cluster/get-actual-cost` | Cost MongoDB has billed this period |

**Requirements:** the two estimate actions need no extra permissions. `get-actual-cost`
requires credentials with the org-level **Organization Billing Viewer** role.

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
  instance_size: "M0" | "FLEX" | "M10" | "M20" | "M30" | "M40" | "M50" | "M60" | "M80";
  allow_ips?: string[];         // IP addresses allowed to access
}
```

**State Interface:**
```typescript
interface ClusterState {
  id?: string;                  // Cluster ID
  name?: string;                // Cluster name
  project_id?: string;          // Project ID the cluster was created in
  tier_family?: "free" | "flex" | "dedicated"; // Tier family at creation time
  connection_standard?: string; // Standard connection string
  connection_srv?: string;      // SRV connection string
  applied_ips?: string[];       // allow_ips currently applied by this entity
  existing?: boolean;           // Whether cluster existed before
}
```

**Update behavior:**
- `allow_ips` is reconciled on every update, and on delete: CIDRs/IPs added to the definition
  are added to the project's access list, ones removed from the definition are removed, and
  all of them are removed when the cluster itself is deleted — but only entries this entity
  itself added (tracked via `state.applied_ips`, or by the `"Added by MonkeC entity"` comment
  for entries from before that tracking existed). Entries added by other means (e.g.
  `mongodb-atlas/ip-access-list-entry`, or manually in the Atlas UI) are never touched.
  Reconciliation requires the project's access list to fit in a single API page; a project
  with a very large shared access list will raise an error rather than reconcile partially.
- For **dedicated (M10+)** clusters, `instance_size`, `region`, and `provider` are reconciled
  via `PATCH` when changed — Atlas supports resizing and migrating dedicated clusters in place.
- For **M0 (free)** and **FLEX** clusters, Atlas does not support region/provider migration;
  changing `region` or `provider` on an existing M0/FLEX cluster raises an error instead of
  silently no-oping.
- Changing `name`, `project_id`, or `instance_size` **across tier families** (free ↔ Flex ↔
  dedicated) is not supported by Atlas in place and raises an error — delete and recreate the
  cluster to apply those changes.

#### Dynamic IP Access

Atlas refuses connections from any address not on the project's IP access list, so a workload
cannot reach the cluster until its node IP is listed. Don't hardcode `allow_ips` (and don't
ship `0.0.0.0/0` outside throwaway test stacks) — wire it to the connecting workload's node
addresses:

```yaml
cluster:
  defines: mongodb-atlas/cluster
  name: app-cluster
  project_id: <- connection-target("project") entity-state get-member("id")
  provider: AWS
  region: US_EAST_1
  instance_size: M10
  secret_ref: mongodb-atlas-token
  # Node IPs of every replica of the API workload
  allow_ips: <- runnable-peers-public-ips("my-app/api")
```

`runnable-peers-public-ips` returns bare IPs (`["8.8.8.8"]`), which the entity sends as Atlas
`ipAddress` entries; values containing `/` are sent as CIDR blocks instead.

**This does not require waiting for the workload to be ready.** The operator reads node
addresses from Monk's own container state (`runnable -> container -> peer.PublicIP`), so they
resolve as soon as the workload's containers are *placed*. The cluster does not need to depend
on the workload — which is just as well, since the workload depends on the cluster's
connection string.

It does need the workload to be placed *when the operator is evaluated*, and returns an empty
list otherwise. So on a first full-stack deploy the list usually starts empty and fills in on
the next `monk update` of the cluster; if the workload must connect on its very first start,
put the entry in a `mongodb-atlas/ip-access-list-entry` that depends on the workload instead.
The list is also a snapshot — if the workload is rescheduled or scaled, `monk update` the
cluster to reconcile it.

| Operator | Returns | Use for |
|---|---|---|
| `runnable-peers-public-ips("ns/workload")` | Array of node IPs | `allow_ips`, multi-node or scaled workloads |
| `peer-ip-address("ns/workload")` | Single node IP | one `ip-access-list-entry` |
| `service-public-ip("ns/workload", "svc")` | Single node IP behind a service | a specific service's node |
| `ip-address-public` | Public IP of the evaluating node | whitelisting the Monk node itself |

For workloads on a private network, `mongodb-atlas/ip-access-list-entry` also accepts
`aws_security_group`, which needs an active VPC peering connection and avoids public IPs.

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

### 4. IP Access List Entry

Manages a single entry in a project's IP access list (the network gate — Atlas
rejects connections from non-listed sources). One entity instance = one entry,
with full create/update/delete lifecycle. `cluster.allow_ips` also reconciles
adds/removes on update (see above), but only for the whole list at once and only
for entries it added itself — use this entity when you need independent lifecycle
control (e.g. time-boxed access, or an entry shared across multiple clusters).

**Definition Interface:**
```typescript
interface IpAccessListEntryDefinition {
  secret_ref: string;            // Secret reference for API token
  project_id: string;            // Project (group) ID
  ip_address?: string;           // exactly one of these three:
  cidr_block?: string;           //   single IP / CIDR block / AWS security group
  aws_security_group?: string;
  comment?: string;              // optional note
  delete_after?: string;         // optional ISO-8601 auto-expiry (time-boxed access)
}
```

**Actions:** `get-info`, `list-entries`.

**Required permissions:** the service account / API key must hold the **Project
Owner** role on the target project (covers add / list / get / remove access list
entry operations). No cost actions — IP access list entries are free.

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

### Cost Actions

MongoDB publishes **no pricing API** — the Atlas Administration API reports only incurred
usage, never a rate card. Estimates therefore come from a hardcoded rate table
(`DEDICATED_PRICING` in `cluster.ts`) transcribed from MongoDB's published pricing, which
needs refreshing when MongoDB changes its rates.

#### Get Cost Estimate

Reads the live cluster topology and prices it against the rate table:

```bash
monk do mongodb-test-stack/dev-cluster/get-cost-estimate
```

Reports tier, provider, region, node count, disk size and backup status, then the monthly
compute cost plus what is excluded from it.

**A tier rate covers an entire 3-node replica set, not one node.** Extra nodes (added
regions, read-only or analytics nodes) scale the rate per node:

```
monthly = hourly × 730 × (total_nodes / 3)
```

Rates are the AWS us-east-1 baseline, so GCP, Azure and other regions will differ. Backup
snapshot storage and data transfer are usage-based and excluded from the total rather than
guessed. M0 reports $0; FLEX reports its $8/month base tier and notes the $30/month cap.

#### Costs (JSON)

Standardized output consumed by Monk's billing system:

```bash
monk do mongodb-test-stack/dev-cluster/costs
```

```json
{
  "type": "mongodb-atlas-cluster",
  "costs": {
    "hour":  { "amount": "0.540000", "currency": "USD" },
    "month": { "amount": "394.20",   "currency": "USD" }
  }
}
```

Monk core invokes only this action; it prefers the `hour` period and computes running cost
from it. Reporting `hour` avoids core's `Monthly -> Hourly` conversion, which divides by 720
while core treats a month as 730 hours — a ~1.4% overstatement for month-only entities.
`month` is retained for the repo-wide convention and for humans.

This reports the table-driven estimate, not invoiced amounts — the estimate is
deterministic, needs only the project-scoped credentials the entity already has, and covers
a full month. An unknown tier yields `amount: "0"` plus an `error` field rather than a
substituted rate.

#### Get Actual Cost

Reports what MongoDB has actually billed for this cluster in the current period, by summing
the pending invoice's line items for this cluster and project, grouped by SKU:

```bash
monk do mongodb-test-stack/dev-cluster/get-actual-cost
```

Because it is MongoDB's own figure it includes backup, data transfer and applied discounts.
Note that a pending invoice is a **partial-month accrual**, not a full-month projection.

**Permissions:** Atlas billing endpoints require the org-level **Organization Billing
Viewer** role. There is no project-scoped billing role, so a project-scoped service account
cannot read invoices at all. Grant the role under Organization Settings → Access Manager →
Service Accounts. The action detects a 401/403 and explains this rather than failing
opaquely; `get-cost-estimate` works without any billing access.

### Backup Actions

MongoDB Atlas clusters (M10 and higher) support on-demand backup snapshots via custom actions. Backups are stored according to your backup retention policy and can be used for restore operations.

**⚠️ Important Backup Limitations:**
- **M0 Free clusters:** No backup API support. Use `mongodump`/`mongorestore` for manual backups
- **FLEX clusters:** Replaced the retired M2/M5 shared tiers (M2/M5 reached End-of-Life 2026-01-22). Receive automatic snapshots; not managed via these on-demand actions
- **Flex clusters:** Automatic daily snapshots (cannot be disabled)
- **M10+ clusters:** Full Cloud Backup support with on-demand snapshots via API
- **During restore:** Cluster becomes read-only until restore completes

#### Get Backup Info

View backup configuration and status:

```bash
monk do my-mongodb/my-cluster/get-backup-info
```

**Output includes:**
- Cluster tier and backup support status
- Backup enabled status
- Provider and region information

#### Create Backup Snapshot

Create an on-demand backup snapshot of your cluster:

```bash
# Create backup with default settings (7 days retention)
monk do my-mongodb/my-cluster/create-snapshot

# Create backup with custom description
monk do my-mongodb/my-cluster/create-snapshot description="Pre-migration backup"

# Create backup with custom retention period
monk do my-mongodb/my-cluster/create-snapshot description="Before upgrade" retention_days=14
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
monk do my-mongodb/my-cluster/list-snapshots

# List more snapshots
monk do my-mongodb/my-cluster/list-snapshots limit=20
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
   monk do my-mongodb/my-cluster/create-snapshot description="Pre-deployment backup"
   ```

2. **Retention Planning**: Consider your recovery requirements when setting retention
   - Development: 3-7 days
   - Staging: 7-14 days
   - Production: 14-30 days (or more)

3. **Regular Verification**: Periodically list snapshots to verify backups are being created
   ```bash
   monk do my-mongodb/my-cluster/list-snapshots
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
monk do my-mongodb/my-cluster/restore snapshot_id="5e8f8f8f8f8f8f8f8f8f8f8f"

# Restore to a different cluster
monk do my-mongodb/my-cluster/restore snapshot_id="xxx" target_id="restored-cluster"

# Restore to a different project
monk do my-mongodb/my-cluster/restore snapshot_id="xxx" target_project_id="project-id"
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
monk do my-mongodb/my-cluster/restore restore_timestamp="2024-12-01T10:00:00Z"

# Restore to specific time on different cluster
monk do my-mongodb/my-cluster/restore restore_timestamp="2024-12-01T10:00:00Z" target_id="pitr-cluster"
```

#### Check Restore Status

Monitor the progress of a restore job:

```bash
# Check status of a specific restore job
monk do my-mongodb/my-cluster/get-restore-status job_id="restore-job-id"
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
monk do my-mongodb/my-cluster/list-restore-jobs

# List more jobs
monk do my-mongodb/my-cluster/list-restore-jobs limit=20
```

#### Restore Workflow Example

Complete disaster recovery workflow:

```bash
# 1. Get backup info to confirm backup is enabled
monk do my-mongodb/my-cluster/get-backup-info

# 2. List available snapshots to find the right one
monk do my-mongodb/my-cluster/list-snapshots

# 3. Start restore from snapshot
monk do my-mongodb/my-cluster/restore snapshot_id="5e8f8f8f8f8f8f8f8f8f8f8f"

# 4. Check restore progress periodically
monk do my-mongodb/my-cluster/get-restore-status job_id="restore-job-id"

# 5. Once complete, verify data integrity
# (cluster is read-write again after restore completes)
```

#### Restore Best Practices

1. **Test Restores Regularly**: Practice restore procedures before you need them
   ```bash
   # Restore to a test cluster, not production
   monk do prod/cluster/restore snapshot_id="xxx" target_id="restore-test"
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
      monk do my-mongodb/my-cluster/create-snapshot \
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
- **FLEX**: Flex cluster — modern low-traffic tier replacing the retired M2/M5 shared clusters
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
