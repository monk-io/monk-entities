# AWS Neptune

Monk entities for managing Amazon Neptune graph database resources. Neptune is a fully managed graph database service that supports both property graph (Gremlin) and RDF (SPARQL) query languages.

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS Neptune Stack                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    aws-neptune/cluster                               │   │
│  │  - Creates Neptune DB cluster                                        │   │
│  │  - Auto-creates security group (optional)                            │   │
│  │  - Exposes: endpoint, reader_endpoint, port, created_security_group_id│  │
│  └────────────────────────────┬────────────────────────────────────────┘   │
│                               │                                             │
│           ┌───────────────────┼───────────────────┐                        │
│           ▼                   ▼                   ▼                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐              │
│  │ aws-neptune/    │ │ aws-neptune/    │ │ aws-neptune/    │              │
│  │ instance        │ │ instance        │ │ instance        │              │
│  │ (Writer)        │ │ (Reader 1)      │ │ (Reader 2)      │              │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 aws-neptune/neptune-access-list                      │   │
│  │  - Manages security group ingress rules                              │   │
│  │  - Allows traffic from client security groups or CIDR blocks         │   │
│  │  - MUST depend on both cluster AND client                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────────────────────────────────────┐   │
│  │ aws-neptune/    │ │ aws-neptune/cluster-parameter-group             │   │
│  │ subnet-group    │ │ (Optional - for custom parameters)              │   │
│  │ (Optional)      │ └─────────────────────────────────────────────────┘   │
│  └─────────────────┘                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## ⚠️ Critical: Neptune Network Access

**Neptune does NOT support public access.** All connections must originate from within the VPC:

| Access Method | Supported | Description |
|---------------|-----------|-------------|
| Public Internet | ❌ No | Not available - Neptune has no public endpoint option |
| Same VPC | ✅ Yes | EC2, ECS, EKS, Lambda in same VPC |
| VPC Peering | ✅ Yes | Cross-VPC access via peering |
| VPN/Direct Connect | ✅ Yes | On-premises access via VPN |
| Bastion/SSH Tunnel | ✅ Yes | Developer access via jump host |

## Entities

| Entity | Description | Key State Fields |
|--------|-------------|------------------|
| `aws-neptune/cluster` | Neptune database cluster | `endpoint`, `reader_endpoint`, `port`, `created_security_group_id` |
| `aws-neptune/instance` | Database instance within a cluster | `endpoint_address`, `endpoint_port`, `status` |
| `aws-neptune/neptune-access-list` | Security group ingress rules | Manages access to cluster |
| `aws-neptune/cluster-parameter-group` | Cluster parameter configuration | `db_cluster_parameter_group_name` |
| `aws-neptune/subnet-group` | VPC subnet group for clusters | `db_subnet_group_name` |

## Authentication

All entities use AWS provider authentication. Credentials are automatically injected via the built-in `aws` module.

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds:CreateDBCluster",
        "rds:DescribeDBClusters",
        "rds:ModifyDBCluster",
        "rds:DeleteDBCluster",
        "rds:CreateDBInstance",
        "rds:DescribeDBInstances",
        "rds:ModifyDBInstance",
        "rds:DeleteDBInstance",
        "rds:CreateDBClusterParameterGroup",
        "rds:DescribeDBClusterParameterGroups",
        "rds:ModifyDBClusterParameterGroup",
        "rds:DeleteDBClusterParameterGroup",
        "rds:CreateDBSubnetGroup",
        "rds:DescribeDBSubnetGroups",
        "rds:ModifyDBSubnetGroup",
        "rds:DeleteDBSubnetGroup",
        "rds:CreateDBClusterSnapshot",
        "rds:DescribeDBClusterSnapshots",
        "rds:StartDBCluster",
        "rds:StopDBCluster",
        "rds:FailoverDBCluster",
        "rds:RebootDBInstance",
        "rds:AddTagsToResource",
        "rds:RemoveTagsFromResource",
        "rds:ListTagsForResource",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:DescribeSecurityGroups",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:DescribeVpcs"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🔐 Access Control Pattern

### The Two-Entity Pattern

Neptune access control uses a **two-entity pattern**:

1. **Cluster Entity** (`aws-neptune/cluster`):
   - Creates the Neptune cluster
   - Auto-creates a security group with NO inbound rules
   - Exposes `created_security_group_id` in state

2. **Access List Entity** (`aws-neptune/neptune-access-list`):
   - Manages inbound rules on the cluster's security group
   - Adds rules to allow traffic from clients
   - Must run AFTER both cluster AND client are deployed

```yaml
# Pattern: Cluster creates SG, Access-List configures rules
neptune-cluster:
  defines: aws-neptune/cluster
  auto_create_security_group: true  # Creates SG with no inbound rules
  # State output: created_security_group_id: sg-xxxxx

neptune-access-list:
  defines: aws-neptune/neptune-access-list
  security_group_id: <- cluster state.created_security_group_id
  allowed_security_group_names: <- runnable-peers("client")
  depends:
    wait-for:
      runnables: [cluster, client]  # CRITICAL: Wait for BOTH!
```

### Why This Pattern?

1. **Security**: Cluster starts with no access - explicit allow required
2. **Dynamic**: Access rules can be updated without recreating cluster
3. **Composable**: Multiple access-lists can manage different client groups
4. **Auditable**: Clear separation of infrastructure and access control

## Usage Examples

### Minimal Example - Cluster with Instance

```yaml
namespace: my-neptune

# Cluster - uses default VPC and auto-creates security group
my-cluster:
  defines: aws-neptune/cluster
  region: us-east-1
  db_cluster_identifier: my-graph-db
  storage_encrypted: true
  auto_create_security_group: true
  skip_final_snapshot: true
  tags:
    environment: development

# Instance - must wait for cluster
my-instance:
  defines: aws-neptune/instance
  depends:
    wait-for:
      runnables:
        - my-neptune/my-cluster
      timeout: 900
  connections:
    cluster:
      runnable: my-neptune/my-cluster
      service: data
  region: us-east-1
  db_instance_identifier: my-graph-db-instance
  db_cluster_identifier: <- connection-target("cluster") entity-state get-member("db_cluster_identifier")
  db_instance_class: db.t3.medium
```

### Complete Example with Client and Access Control

```yaml
namespace: neptune-app

# =============================================================================
# CLUSTER
# =============================================================================
# Creates Neptune cluster with auto-managed security group.
# The security group starts with NO inbound rules for security.

neptune-cluster:
  defines: aws-neptune/cluster
  region: us-east-1
  db_cluster_identifier: app-graph-db
  engine_version: "1.2.1.0"
  auto_create_security_group: true
  security_group_name: app-neptune-sg
  storage_encrypted: true
  backup_retention_period: 7
  skip_final_snapshot: false
  final_db_snapshot_identifier: app-graph-db-final
  tags:
    environment: production
    application: my-app

# =============================================================================
# INSTANCE
# =============================================================================
# Creates database instance. Gets cluster ID from cluster state.

neptune-instance:
  defines: aws-neptune/instance
  depends:
    wait-for:
      runnables:
        - neptune-app/neptune-cluster
      timeout: 900
  connections:
    cluster:
      runnable: neptune-app/neptune-cluster
      service: data
  region: us-east-1
  db_instance_identifier: app-graph-db-instance
  db_cluster_identifier: <- connection-target("cluster") entity-state get-member("db_cluster_identifier")
  db_instance_class: db.r5.large
  tags:
    role: primary

# =============================================================================
# CLIENT APPLICATION
# =============================================================================
# Your application that connects to Neptune.
# MUST be deployed to AWS (EC2/ECS/EKS) in same VPC!

app-client:
  defines: runnable
  connections:
    cluster:
      runnable: neptune-app/neptune-cluster
      service: data
  depends:
    wait-for:
      runnables:
        - neptune-app/neptune-cluster
        - neptune-app/neptune-instance
      timeout: 900
  variables:
    # Get endpoint from cluster STATE (runtime value)
    neptune_host:
      env: NEPTUNE_HOST
      value: <- connection-target("cluster") entity-state get-member("endpoint")
      type: string
    # Get port from cluster STATE
    neptune_port:
      env: NEPTUNE_PORT
      value: <- connection-target("cluster") entity-state get-member("port")
      type: string
  containers:
    app:
      image: your-registry/your-app:latest
      environment:
        - NEPTUNE_USE_SSL=true

# =============================================================================
# ACCESS LIST
# =============================================================================
# Configures security group to allow client access.
# CRITICAL: Must depend on BOTH cluster AND client!
#
# - security_group_id: From cluster state (needs cluster deployed)
# - allowed_security_group_names: From client's node (needs client deployed)

neptune-access-list:
  defines: aws-neptune/neptune-access-list
  region: <- connection-target("cluster") entity get-member("region")
  security_group_id: <- connection-target("cluster") entity-state get-member("created_security_group_id")
  port: <- connection-target("cluster") entity-state get-member("port")
  
  # Dynamic: Allow traffic from client's node security groups
  allowed_security_group_names: <- runnable-peers("neptune-app/app-client")
  
  connections:
    cluster:
      runnable: neptune-app/neptune-cluster
      service: data
  depends:
    wait-for:
      runnables:
        - neptune-app/neptune-cluster
        - neptune-app/app-client  # MUST wait for client!
      timeout: 900
```

### Static CIDR Access (VPN/Direct Connect)

```yaml
# For known IP ranges (VPN, Direct Connect, specific subnets)
neptune-access-static:
  defines: aws-neptune/neptune-access-list
  region: <- connection-target("cluster") entity get-member("region")
  security_group_id: <- connection-target("cluster") entity-state get-member("created_security_group_id")
  port: <- connection-target("cluster") entity-state get-member("port")
  
  # Static CIDR blocks
  allowed_cidr_blocks:
    - "10.0.0.0/8"       # VPC CIDR
    - "172.16.0.0/12"    # VPN CIDR
    - "192.168.1.0/24"   # Office network
  
  connections:
    cluster:
      runnable: neptune-app/neptune-cluster
      service: data
  depends:
    wait-for:
      runnables:
        - neptune-app/neptune-cluster
      timeout: 600
```

### Using Custom VPC by Name

```yaml
my-cluster:
  defines: aws-neptune/cluster
  region: us-east-1
  db_cluster_identifier: my-graph-db
  
  # Look up VPC by its Name tag instead of hardcoding ID
  vpc_name: my-custom-vpc
  
  auto_create_security_group: true
  storage_encrypted: true
```

### Serverless Neptune

```yaml
serverless-cluster:
  defines: aws-neptune/cluster
  region: us-east-1
  db_cluster_identifier: my-serverless-neptune
  serverless_v2_scaling_configuration:
    min_capacity: 1    # Minimum NCUs
    max_capacity: 8    # Maximum NCUs
  storage_encrypted: true

serverless-instance:
  defines: aws-neptune/instance
  depends:
    wait-for:
      runnables:
        - my-namespace/serverless-cluster
      timeout: 900
  region: us-east-1
  db_instance_identifier: my-serverless-instance
  db_cluster_identifier: my-serverless-neptune
  db_instance_class: db.serverless  # Required for serverless
```

## Configuration Reference

### Cluster (`aws-neptune/cluster`)

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `db_cluster_identifier` | string | Yes | - | Unique cluster identifier (1-63 chars) |
| `engine_version` | string | No | - | Neptune engine version (e.g., "1.2.1.0") |
| `port` | number | No | 8182 | Database port |
| `auto_create_security_group` | boolean | No | true | Auto-create security group |
| `security_group_name` | string | No | - | Name for auto-created SG |
| `vpc_id` | string | No | - | VPC ID (uses default if not specified) |
| `vpc_name` | string | No | - | VPC name tag (alternative to vpc_id) |
| `vpc_security_group_ids` | string[] | No | - | Existing security group IDs |
| `db_subnet_group_name` | string | No | - | Subnet group for VPC |
| `db_cluster_parameter_group_name` | string | No | - | Parameter group name |
| `backup_retention_period` | number | No | 1 | Backup retention (1-35 days) |
| `storage_encrypted` | boolean | No | false | Enable encryption |
| `kms_key_id` | string | No | - | KMS key for encryption |
| `iam_database_authentication_enabled` | boolean | No | false | Enable IAM auth |
| `deletion_protection` | boolean | No | false | Prevent deletion |
| `skip_final_snapshot` | boolean | No | false | Skip final snapshot |
| `final_db_snapshot_identifier` | string | No | - | Final snapshot name |
| `serverless_v2_scaling_configuration` | object | No | - | Serverless config |
| `tags` | map | No | - | Resource tags |

**State Fields:**

| Field | Description | Use in Composition |
|-------|-------------|-------------------|
| `endpoint` | Writer endpoint | Client connection string |
| `reader_endpoint` | Reader endpoint | Read-only queries |
| `port` | Connection port | Client connection |
| `created_security_group_id` | Auto-created SG ID | Access-list configuration |
| `db_cluster_identifier` | Cluster name | Instance association |
| `db_cluster_arn` | Full ARN | IAM policies |
| `status` | Current status | Health checks |
| `vpc_id` | VPC ID | Network configuration |

### Instance (`aws-neptune/instance`)

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `db_instance_identifier` | string | Yes | - | Unique instance identifier |
| `db_cluster_identifier` | string | Yes | - | Parent cluster identifier |
| `db_instance_class` | string | Yes | - | Instance class (e.g., db.r5.large) |
| `availability_zone` | string | No | - | Specific AZ for instance |
| `db_parameter_group_name` | string | No | - | Instance parameter group |
| `auto_minor_version_upgrade` | boolean | No | true | Auto upgrade minor versions |
| `promotion_tier` | number | No | 0 | Failover priority (0-15) |
| `enable_performance_insights` | boolean | No | false | Enable Performance Insights |
| `tags` | map | No | - | Resource tags |

### Access List (`aws-neptune/neptune-access-list`)

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `security_group_id` | string | Yes | - | Security group ID to manage |
| `port` | number | Yes | - | Neptune port (usually 8182) |
| `allowed_cidr_blocks` | string[] | No | - | CIDR blocks to allow |
| `allowed_security_group_names` | string[] | No | - | Security group names to allow |
| `vpc_id` | string | No | - | VPC ID for resolving SG names |

**Note:** Provide either `allowed_cidr_blocks` OR `allowed_security_group_names`, not both.

### Cluster Parameter Group (`aws-neptune/cluster-parameter-group`)

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `db_cluster_parameter_group_name` | string | Yes | - | Parameter group name |
| `db_parameter_group_family` | string | Yes | - | Family (e.g., neptune1.2) |
| `parameter_group_description` | string | No | - | Description |
| `parameters` | map | No | - | Parameter key-value pairs |
| `tags` | map | No | - | Resource tags |

### Subnet Group (`aws-neptune/subnet-group`)

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `db_subnet_group_name` | string | Yes | - | Subnet group name |
| `db_subnet_group_description` | string | No | - | Description |
| `subnet_ids` | string[] | Yes | - | List of subnet IDs (min 2) |
| `tags` | map | No | - | Resource tags |

## Actions

### Cluster Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `get-info` | Get detailed cluster information | - |
| `list-instances` | List instances in the cluster | - |
| `create-snapshot` | Create a manual snapshot | `snapshot_identifier` |
| `list-snapshots` | List cluster snapshots | - |
| `failover` | Initiate cluster failover | `target_instance` (optional) |
| `start` | Start a stopped cluster | - |
| `stop` | Stop a running cluster | - |

### Instance Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `get-info` | Get detailed instance information | - |
| `reboot` | Reboot the instance | `force_failover` (optional) |
| `promote` | Promote to cluster writer | - |
| `get-logs` | List available log files | - |

## Monk Expression Reference

| Expression | Returns | Example |
|------------|---------|---------|
| `entity get-member("field")` | Definition value | `region`, `db_cluster_identifier` |
| `entity-state get-member("field")` | State value | `endpoint`, `created_security_group_id` |
| `runnable-peers("ns/name")` | SG names of nodes | For dynamic access control |

## Connecting to Neptune

### Gremlin (Property Graph)

```javascript
// Using Gremlin JavaScript driver
const gremlin = require('gremlin');
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;

const endpoint = process.env.NEPTUNE_HOST;
const port = process.env.NEPTUNE_PORT || 8182;

const connection = new DriverRemoteConnection(
  `wss://${endpoint}:${port}/gremlin`,
  { rejectUnauthorized: false }
);

const g = gremlin.process.AnonymousTraversalSource.traversal()
  .withRemote(connection);

// Query example
const vertices = await g.V().limit(10).toList();
```

### HTTP/REST API

```bash
# Gremlin via HTTP
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"gremlin": "g.V().limit(10)"}' \
  https://<endpoint>:8182/gremlin

# SPARQL via HTTP
curl -X POST \
  -H "Content-Type: application/sparql-query" \
  -d "SELECT * WHERE { ?s ?p ?o } LIMIT 10" \
  https://<endpoint>:8182/sparql
```

## Related Documentation

- [Neptune Client Example](../../examples/neptune-client/README.md)
- [Amazon Neptune User Guide](https://docs.aws.amazon.com/neptune/latest/userguide/)
- [Neptune API Reference](https://docs.aws.amazon.com/neptune/latest/APIReference/)
- [Gremlin Documentation](https://tinkerpop.apache.org/docs/current/reference/)
- [SPARQL Documentation](https://www.w3.org/TR/sparql11-query/)
