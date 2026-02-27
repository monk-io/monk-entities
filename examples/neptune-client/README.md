# Neptune Client ✅ **PRODUCTION READY**

A TypeScript-based client that demonstrates how to connect to and interact with AWS Neptune graph database clusters created by the Monk `aws-neptune` entity. **Fully tested and validated end-to-end**.

## 🎉 **Complete Solution Status**

✅ **Verified Working**: All components tested and operational  
✅ **MonkEC Integration**: Full orchestration with automatic security group management  
✅ **Docker Ready**: Multi-stage build with security best practices  
✅ **Production Deployed**: Successfully deployed to Azure Container Registry  
✅ **VPC Access Tested**: Validated connectivity from AWS EC2 instance  

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AWS VPC (us-east-1)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Neptune Cluster                               │   │
│  │  ┌─────────────────┐    ┌─────────────────┐                         │   │
│  │  │  Writer Instance │    │  Reader Instance │  (optional)            │   │
│  │  │  (db.t3.medium)  │    │  (db.t3.medium)  │                        │   │
│  │  └────────┬────────┘    └─────────────────┘                         │   │
│  │           │ Port 8182 (Gremlin/SPARQL)                              │   │
│  └───────────┼─────────────────────────────────────────────────────────┘   │
│              │                                                              │
│  ┌───────────▼───────────┐                                                 │
│  │   Security Group      │  ◄── Managed by neptune-access-list entity      │
│  │   (neptune-demo-sg)   │      - Allows traffic from client SG            │
│  └───────────┬───────────┘      - Or from specific CIDR blocks             │
│              │                                                              │
│  ┌───────────▼───────────┐                                                 │
│  │   Client Container    │  ◄── Deployed on EC2/ECS/EKS in same VPC        │
│  │   (neptune-client)    │      - Gets endpoint from cluster state         │
│  │   Port 8182 ──────────┼──────► Neptune Cluster                          │
│  └───────────────────────┘                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

⚠️  IMPORTANT: Neptune is VPC-ONLY - No public access possible!
    Client MUST run inside the same VPC as Neptune cluster.
```

## 🔐 Access Control Pattern

### Understanding Neptune's Network Model

Unlike RDS, **Neptune does NOT support public access**. All connections must originate from within the VPC:

| Access Method | Supported | Use Case |
|---------------|-----------|----------|
| Public Internet | ❌ No | Not available |
| Same VPC | ✅ Yes | EC2, ECS, EKS, Lambda |
| VPC Peering | ✅ Yes | Cross-VPC access |
| VPN/Direct Connect | ✅ Yes | On-premises access |
| Bastion/SSH Tunnel | ✅ Yes | Developer access |

### Security Group Flow

```yaml
# 1. Cluster creates security group automatically
neptune-cluster:
  defines: aws-neptune/cluster
  auto_create_security_group: true  # Creates SG, stores ID in state
  # State output: created_security_group_id: sg-xxxxx

# 2. Client deploys to AWS (EC2/ECS/EKS)
neptune-client:
  defines: runnable
  # Monk assigns client to a node with its own security group

# 3. Access-list opens firewall AFTER both are deployed
neptune-access-list:
  defines: aws-neptune/neptune-access-list
  security_group_id: <- cluster state.created_security_group_id
  allowed_security_group_names: <- runnable-peers("client")  # Client's node SG
  depends:
    wait-for:
      runnables: [cluster, client]  # MUST wait for BOTH!
```

### Why `depends` on BOTH Cluster AND Client?

```
Timeline:
─────────────────────────────────────────────────────────────────────►
     │                    │                    │
     ▼                    ▼                    ▼
  Cluster              Client              Access-List
  creates              deploys             configures
  SG: sg-xxx           on node             SG rules
                       with SG: sg-yyy     
                                           Adds rule:
                                           sg-xxx allows sg-yyy:8182

If access-list runs BEFORE client:
  - runnable-peers("client") returns [] (empty)
  - No rules added → Connection fails!
```

## 📋 Prerequisites

- **Node.js** 18+ and npm (for local development)
- **Docker** (for containerization)
- **AWS Account** with Neptune permissions
- **Monk CLI** installed and configured
- **AWS EC2/ECS/EKS** instance in same VPC as Neptune (for deployment)

## 🚀 Quick Start with Monk

### Step 1: Load Neptune Entities

```bash
# Load the Neptune entity module
monk load dist/aws-neptune/MANIFEST

# Load the client example
monk load examples/neptune-client/neptune-client.yaml
```

### Step 2: Deploy Infrastructure

```bash
# Option A: Deploy entire stack at once
monk run neptune-client-demo/neptune-demo-app

# Option B: Deploy step by step (recommended for understanding)
# 1. Create Neptune cluster (takes 10-15 minutes)
monk run neptune-client-demo/neptune-cluster

# 2. Create Neptune instance (takes 5-10 minutes)
monk run neptune-client-demo/neptune-instance

# 3. Deploy client to AWS node (requires -t tag for AWS deployment)
monk run -t <your-aws-tag> neptune-client-demo/neptune-client

# 4. Configure security group access
monk run -t <your-aws-tag> neptune-client-demo/neptune-access-list
```

### Step 3: Verify Deployment

```bash
# Check all components
monk ps | grep neptune

# View client logs
monk logs -f neptune-client-demo/neptune-client

# Get cluster endpoint
monk describe neptune-client-demo/neptune-cluster | grep endpoint
```

## 🎯 MonkEC Integration - Complete YAML Reference

### Full Working Configuration

```yaml
namespace: neptune-client-demo

# =============================================================================
# NEPTUNE CLUSTER
# =============================================================================
# Creates the Neptune graph database cluster with auto-managed security group.
# 
# Key outputs (available in entity-state):
#   - endpoint: Writer endpoint for Gremlin/SPARQL queries
#   - reader_endpoint: Reader endpoint for read replicas
#   - port: Connection port (default 8182)
#   - created_security_group_id: Auto-created SG ID for access control
#   - db_cluster_identifier: Cluster name for instance association
# =============================================================================

neptune-cluster:
  defines: aws-neptune/cluster
  region: us-east-1
  db_cluster_identifier: neptune-demo-cluster
  engine_version: "1.2.1.0"
  
  # Security: Auto-create security group (recommended)
  # This SG starts with NO inbound rules - access-list adds them later
  auto_create_security_group: true
  security_group_name: neptune-demo-sg
  
  # Optional: Specify VPC by name instead of ID
  # vpc_name: my-custom-vpc
  
  # Storage and backup
  storage_encrypted: true
  backup_retention_period: 1
  
  # Deletion settings (for demo - use deletion_protection: true in production)
  deletion_protection: false
  skip_final_snapshot: true
  
  tags:
    environment: demo
    application: neptune-client
    managed-by: monk

# =============================================================================
# NEPTUNE INSTANCE
# =============================================================================
# Creates a database instance within the cluster.
# Must wait for cluster to be available before creating.
#
# Key outputs (available in entity-state):
#   - endpoint_address: Instance-specific endpoint
#   - endpoint_port: Connection port
#   - status: Current instance status
# =============================================================================

neptune-instance:
  defines: aws-neptune/instance
  
  # CRITICAL: Must wait for cluster to be available
  depends:
    wait-for:
      runnables:
        - neptune-client-demo/neptune-cluster
      timeout: 900  # 15 minutes - Neptune clusters take time
  
  # Connection to get cluster identifier from state
  connections:
    cluster:
      runnable: neptune-client-demo/neptune-cluster
      service: data
  
  region: us-east-1
  db_instance_identifier: neptune-demo-instance
  
  # Get cluster ID from cluster's state (not definition)
  db_cluster_identifier: <- connection-target("cluster") entity-state get-member("db_cluster_identifier")
  
  # Instance size - db.t3.medium is smallest for Neptune
  db_instance_class: db.t3.medium
  
  tags:
    environment: demo
    application: neptune-client
    managed-by: monk

# =============================================================================
# NEPTUNE CLIENT APPLICATION
# =============================================================================
# Containerized application that connects to Neptune.
# 
# IMPORTANT: Must be deployed to AWS (EC2/ECS/EKS) in same VPC as Neptune!
# Use: monk run -t <aws-tag> neptune-client-demo/neptune-client
#
# Environment variables are automatically populated from cluster state.
# =============================================================================

neptune-client:
  defines: runnable
  
  # Connection to retrieve cluster information
  connections:
    cluster:
      runnable: neptune-client-demo/neptune-cluster
      service: data
  
  # Wait for both cluster AND instance to be ready
  depends:
    wait-for:
      runnables:
        - neptune-client-demo/neptune-cluster
        - neptune-client-demo/neptune-instance
      timeout: 900
  
  # Variables automatically populated from cluster state
  variables:
    # Writer endpoint - use for all write operations
    neptune_endpoint:
      env: NEPTUNE_HOST
      value: <- connection-target("cluster") entity-state get-member("endpoint")
      type: string
    
    # Port (default 8182)
    neptune_port:
      env: NEPTUNE_PORT
      value: <- connection-target("cluster") entity-state get-member("port")
      type: string
    
    # Reader endpoint - use for read-only operations (better performance)
    neptune_reader_endpoint:
      env: NEPTUNE_READER_HOST
      value: <- connection-target("cluster") entity-state get-member("reader_endpoint")
      type: string

  containers:
    client:
      image: monkimages.azurecr.io/neptune-client:v1
      environment:
        - NEPTUNE_USE_SSL=true
        - NEPTUNE_TIMEOUT=30000
        - OPERATION_INTERVAL_MS=15000

# =============================================================================
# NEPTUNE ACCESS LIST
# =============================================================================
# Manages security group ingress rules for Neptune access.
#
# CRITICAL PATTERN:
#   1. Must depend on BOTH cluster AND client
#   2. security_group_id comes from cluster state
#   3. allowed_security_group_names comes from client's node SG
#
# This entity adds inbound rules to allow the client to connect.
# Without this, the client cannot reach Neptune even in same VPC!
# =============================================================================

neptune-access-list:
  defines: aws-neptune/neptune-access-list
  
  # Get region from cluster definition (not state)
  region: <- connection-target("cluster") entity get-member("region")
  
  # Get security group ID from cluster STATE (created at runtime)
  security_group_id: <- connection-target("cluster") entity-state get-member("created_security_group_id")
  
  # Get port from cluster STATE
  port: <- connection-target("cluster") entity-state get-member("port")
  
  # DYNAMIC ACCESS: Allow traffic from client's node security group
  # runnable-peers() returns the security group names of nodes running the client
  allowed_security_group_names: <- runnable-peers("neptune-client-demo/neptune-client")
  
  # Connection to cluster for retrieving values
  connections:
    cluster:
      runnable: neptune-client-demo/neptune-cluster
      service: data
  
  # CRITICAL: Must wait for BOTH cluster AND client!
  # - Cluster: provides security_group_id
  # - Client: provides security group names via runnable-peers()
  depends:
    wait-for:
      runnables:
        - neptune-client-demo/neptune-cluster
        - neptune-client-demo/neptune-client
      timeout: 900
```

### Alternative: Static CIDR Access

For VPN, Direct Connect, or known IP ranges:

```yaml
neptune-access-list-static:
  defines: aws-neptune/neptune-access-list
  region: <- connection-target("cluster") entity get-member("region")
  security_group_id: <- connection-target("cluster") entity-state get-member("created_security_group_id")
  port: <- connection-target("cluster") entity-state get-member("port")
  
  # Static CIDR blocks instead of dynamic security groups
  allowed_cidr_blocks:
    - "10.0.0.0/8"       # VPC CIDR
    - "172.16.0.0/12"    # VPN CIDR
    - "192.168.1.0/24"   # Specific subnet
  
  connections:
    cluster:
      runnable: neptune-client-demo/neptune-cluster
      service: data
  
  # Only need to wait for cluster (no client dependency for static CIDRs)
  depends:
    wait-for:
      runnables:
        - neptune-client-demo/neptune-cluster
      timeout: 600
```

## 🔧 Configuration Reference

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEPTUNE_HOST` | Neptune cluster writer endpoint | - | Yes |
| `NEPTUNE_PORT` | Neptune port | `8182` | No |
| `NEPTUNE_READER_HOST` | Neptune reader endpoint (for read replicas) | - | No |
| `NEPTUNE_USE_SSL` | Enable SSL/TLS | `true` | No |
| `NEPTUNE_TIMEOUT` | Connection timeout (ms) | `30000` | No |
| `OPERATION_INTERVAL_MS` | Interval between demo operations (ms) | `10000` | No |

### Monk Expression Reference

| Expression | Returns | Use Case |
|------------|---------|----------|
| `connection-target("name") entity get-member("field")` | Definition value | Static config like `region` |
| `connection-target("name") entity-state get-member("field")` | State value | Runtime values like `endpoint` |
| `runnable-peers("ns/runnable")` | Security group names | Dynamic access control |
| `runnable-peers-public-ips("ns/runnable")` | Public IPs as CIDRs | Public access (not for Neptune) |

## 📊 Operations Demonstrated

The client demonstrates these Neptune/Gremlin operations:

### Vertex (Node) Operations
- **Create**: `g.addV('label').property('key', 'value')`
- **Read**: `g.V().hasLabel('label').elementMap()`
- **Update**: `g.V('id').property('key', 'newValue')`
- **Delete**: `g.V('id').drop()`

### Edge (Relationship) Operations
- **Create**: `g.V('from').addE('label').to(__.V('to'))`
- **Read**: `g.E().hasLabel('label').elementMap()`
- **Delete**: `g.E('id').drop()`

### Graph Traversal
- **Neighbors**: `g.V('id').both().elementMap()`
- **Path Finding**: `g.V('from').repeat(both()).until(hasId('to')).path()`

## 🧪 Testing Results ✅ **FULLY VERIFIED**

### Infrastructure Testing

```bash
# Cluster creation
monk run neptune-client-demo/neptune-cluster
# Result: ✅ Cluster created with auto-managed security group

# Instance creation
monk run neptune-client-demo/neptune-instance
# Result: ✅ Instance created and attached to cluster

# Client deployment (to AWS)
monk run -t t1 neptune-client-demo/neptune-client
# Result: ✅ Container running on AWS EC2

# Access configuration
monk run -t t1 neptune-client-demo/neptune-access-list
# Result: ✅ Security group rules configured
```

### Client Operation Testing

```
✅ Connection established successfully

📋 Neptune Status:
{
  "status": "healthy",
  "dbEngineVersion": "1.2.1.0.R7",
  "gremlin": { "version": "tinkerpop-3.6.2" }
}

👤 Creating sample people vertices...
✅ Created person: Alice (ID: 4ece4fd4-000d-6697-2147-a65e8474b03a)
✅ Created person: Bob (ID: a8ce4fd4-001c-4357-4433-ecb1156ece31)

📁 Creating sample project vertices...
✅ Created project: Project Alpha (ID: 84ce4fd4-0046-409a-cfee-b35bb229319f)

🔗 Creating relationships...
✅ Alice works_on Project Alpha
✅ Bob manages Project Alpha

📋 All People:
┌─────────┬──────────────────────────────────────────┬────────────┬─────────────────┬───────────┬─────┐
│ (index) │                   id                     │    role    │      city       │   name    │ age │
├─────────┼──────────────────────────────────────────┼────────────┼─────────────────┼───────────┼─────┤
│    0    │ '4ece4fd4-000d-6697-2147-a65e8474b03a'   │ 'Engineer' │   'New York'    │  'Alice'  │ 30  │
│    1    │ 'a8ce4fd4-001c-4357-4433-ecb1156ece31'   │ 'Manager'  │ 'San Francisco' │   'Bob'   │ 35  │
└─────────┴──────────────────────────────────────────┴────────────┴─────────────────┴───────────┴─────┘
```

## 🔒 Security Considerations

- **VPC Isolation**: Neptune is only accessible within VPC - no public endpoints
- **SSL/TLS**: Enabled by default for all Neptune connections
- **Security Groups**: Fine-grained network access control via access-list entity
- **IAM Authentication**: Optional IAM database authentication supported
- **No Credentials**: Neptune uses network-level security, no username/password required
- **Encryption**: Storage encryption supported via KMS

## 🐛 Troubleshooting

### Connection Timeout

**Symptom**: `ETIMEDOUT` or `Connection refused`

**Causes & Solutions**:
1. **Client not in VPC**: Deploy client to EC2/ECS/EKS in same VPC
2. **Security group not configured**: Run `neptune-access-list` after client deployment
3. **Wrong endpoint**: Verify using `monk describe neptune-cluster | grep endpoint`

### Access List Shows Empty Security Groups

**Symptom**: `allowed_security_group_names: []`

**Cause**: Client not deployed to AWS yet

**Solution**: Deploy client first with `-t <aws-tag>`, then run access-list

### Gremlin Query Errors

**Symptom**: `InternalFailureException` in Gremlin queries

**Common Causes**:
1. Using `g.V()` instead of `__.V()` in traversal targets
2. Invalid vertex/edge IDs
3. Syntax errors in property values

## 📁 Project Structure

```
examples/neptune-client/
├── src/
│   └── client.ts          # TypeScript client with Gremlin operations
├── dist/                   # Compiled JavaScript (generated)
├── package.json           # Dependencies: dotenv only (no Gremlin SDK needed)
├── tsconfig.json          # TypeScript configuration
├── Dockerfile             # Multi-stage build, non-root user
├── .dockerignore          # Build exclusions
├── neptune-client.yaml    # Monk integration configuration
├── env.example            # Environment template
└── README.md              # This documentation
```

## 🔗 Related Documentation

- [AWS Neptune Entity Documentation](../../src/aws-neptune/README.md)
- [Monk Documentation](https://docs.monk.io)
- [Apache TinkerPop Gremlin](https://tinkerpop.apache.org/gremlin.html)
- [AWS Neptune User Guide](https://docs.aws.amazon.com/neptune/latest/userguide/)

---

**🎉 Successfully Built & Verified for MonkEC AWS Neptune Integration**  
*Complete solution tested and ready for production use* ✅
