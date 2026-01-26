# AWS RDS Deployment Guide for AI Agent

## Overview

Deploy a private RDS instance (no public access) with dynamic security group access from cluster nodes using two entities:
1. `aws-rds/rds-instance` - Creates and manages the RDS database
2. `aws-rds/rds-access-list` - Manages security group rules dynamically at runtime

## Required AWS IAM Permissions

Add these RDS permissions to your IAM policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds:DescribeDBInstances",
        "rds:CreateDBInstance",
        "rds:ModifyDBInstance",
        "rds:DeleteDBInstance",
        "rds:AddTagsToResource",
        "rds:CreateDBSnapshot",
        "rds:DescribeDBSnapshots",
        "rds:DeleteDBSnapshot"
      ],
      "Resource": ["*"]
    }
  ]
}
```

**Note:** EC2 security group permissions (`ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, etc.) are assumed to be available from the core Monk cluster policy.

## Architecture Pattern

```yaml
# 1. RDS Instance - creates database with auto-created security group
database:
  defines: aws-rds/rds-instance
  ...
  auto_create_security_group: true    # Creates empty SG
  publicly_accessible: false           # Private access only

# 2. Access List - dynamically manages SG rules after clients are deployed
access-list:
  defines: aws-rds/rds-access-list
  security_group_id: <- connection-target("db") entity-state get-member("created_security_group_id")
  allowed_security_group_names: <- runnable-peers("namespace/client")
  depends:
    wait-for:
      runnables:
        - namespace/database
        - namespace/client          # Wait for clients to be deployed first
```

## Deployment Sequence (Critical)

**The deployment order is mandatory and cannot be changed:**

```
1. RDS Instance     →  2. Client Application  →  3. Access List
   (creates DB +        (deploys to nodes,        (reads client's node SGs,
    empty SG)            gets assigned SGs)        opens access)
```

### Why This Order Matters

| Step | What Happens | Why It Must Be First |
|------|--------------|----------------------|
| **1. RDS Instance** | Creates database + empty security group | Access list needs `created_security_group_id` from instance state |
| **2. Client** | Deploys containers to cluster nodes | Each node has a security group; `runnable-peers()` returns these SG names |
| **3. Access List** | Adds client node SGs to RDS security group | Can only run after knowing which nodes host the client |

### The Problem Without This Sequence

If you try to deploy `rds-access-list` before the client:
- `runnable-peers("my-app/mysql-client")` returns **empty list** (client doesn't exist yet)
- Security group gets **no ingress rules**
- Client containers start but **cannot connect** to database

### Enforcing Order with Dependencies

Always set `depends.wait-for` on the access-list to wait for BOTH database AND client:

```yaml
mysql-access-list:
  defines: aws-rds/rds-access-list
  depends:
    wait-for:
      runnables:
        - my-app/mysql-database   # Need SG ID from state
        - my-app/mysql-client     # Need to know client's nodes
      timeout: 600
```

## Key Entity Options

### aws-rds/rds-instance

| Option | Required | Description |
|--------|----------|-------------|
| `region` | ✓ | AWS region (e.g., `us-east-1`) |
| `db_instance_identifier` | ✓ | Unique identifier (1-63 chars, starts with letter) |
| `db_instance_class` | ✓ | Instance type (e.g., `db.t3.micro`) |
| `engine` | ✓ | Database engine: `mysql`, `postgres`, `mariadb` |
| `master_username` | ✓ | Master database user |
| `allocated_storage` | ✓ | Storage in GB (min 20) |
| `password_secret_ref` | | Secret name for password (auto-generates if omitted) |
| `publicly_accessible` | | **Set to `false` for private access** |
| `auto_create_security_group` | | **Set to `true` to auto-create empty SG** |
| `security_group_name` | | Custom name for auto-created SG |
| `db_name` | | Initial database name to create |

**State fields exposed for composition:**
- `state.endpoint_address` - Database hostname
- `state.endpoint_port` - Database port
- `state.created_security_group_id` - ID of auto-created security group

### aws-rds/rds-access-list

| Option | Required | Description |
|--------|----------|-------------|
| `region` | ✓ | AWS region (must match RDS instance) |
| `security_group_id` | ✓ | Target SG to manage (use from RDS state) |
| `port` | ✓ | Database port to allow (use from RDS state) |
| `allowed_security_group_names` | | **SG names of nodes allowed to connect** |
| `allowed_cidr_blocks` | | CIDR blocks allowed (e.g., `10.0.0.0/16`) |
| `vpc_id` | | VPC for SG name resolution |

## Complete Example: Private MySQL with Cluster Access

```yaml
namespace: my-app

# 1. RDS Instance (private, auto-creates empty security group)
mysql-database:
  defines: aws-rds/rds-instance
  permitted-secrets:
    my-mysql-password: true
  region: us-east-1
  db_instance_identifier: my-mysql-db
  db_name: myapp
  allocated_storage: 20
  db_instance_class: db.t3.micro
  engine: mysql
  engine_version: "8.0"
  master_username: admin
  password_secret_ref: my-mysql-password
  
  # CRITICAL: Private access configuration
  publicly_accessible: false
  auto_create_security_group: true
  security_group_name: my-mysql-sg
  
  skip_final_snapshot: true
  deletion_protection: false

# 2. Client Application
mysql-client:
  defines: runnable
  permitted-secrets:
    my-mysql-password: true
  connections:
    db:
      runnable: my-app/mysql-database
      service: default
  depends:
    wait-for:
      runnables:
        - my-app/mysql-database
      timeout: 600
  variables:
    db_host:
      env: DB_HOST
      value: <- connection-target("db") entity-state get-member("endpoint_address")
    db_port:
      env: DB_PORT
      value: <- connection-target("db") entity-state get-member("endpoint_port")
    db_password:
      env: DB_PASSWORD
      value: <- secret("my-mysql-password")
  containers:
    app:
      image: my-app-image:latest

# 3. Access List (dynamically allows client nodes to connect)
mysql-access-list:
  defines: aws-rds/rds-access-list
  region: <- connection-target("db") entity get-member("region")
  security_group_id: <- connection-target("db") entity-state get-member("created_security_group_id")
  port: <- connection-target("db") entity-state get-member("endpoint_port")
  
  # KEY: Allow all nodes running the client
  allowed_security_group_names: <- runnable-peers("my-app/mysql-client")
  
  connections:
    db:
      runnable: my-app/mysql-database
      service: default
  depends:
    wait-for:
      runnables:
        - my-app/mysql-database
        - my-app/mysql-client    # Must wait for client to get its SG
      timeout: 600
```

## Why Use rds-access-list Separately?

1. **Dynamic Runtime Access**: Security group rules are applied *after* client nodes are deployed, using their actual security groups
2. **No Chicken-and-Egg**: The RDS instance creates an empty SG first, then access-list populates rules once clients exist
3. **Auto-Sync**: On `monk update`, access-list synchronizes rules with current cluster state (adds new nodes, removes old ones)
4. **Clean Separation**: Database lifecycle is independent from access policy

## Access Methods

| Method | Use When | Example |
|--------|----------|---------|
| `allowed_security_group_names` | Private cluster access | `<- runnable-peers("ns/client")` |
| `allowed_cidr_blocks` | Public IP access | `<- runnable-peers-public-ips("ns/client")` or `["10.0.0.0/16"]` |

## Deployment Steps

```bash
# 1. Load entities and template
monk load dist/aws-rds/MANIFEST
monk load my-template.yaml

# 2. Add password secret
monk secrets add -g my-mysql-password='SecurePassword123!'

# 3. Deploy in STRICT ORDER:

# Step 3a: Deploy RDS instance first (creates DB + empty security group)
monk update my-app/mysql-database
# Wait for instance to become available (~10-15 min)

# Step 3b: Deploy client application (assigns nodes with their security groups)
monk update my-app/mysql-client
# Client starts but cannot connect yet (SG has no rules)

# Step 3c: Deploy access list LAST (opens access from client nodes to DB)
monk update my-app/mysql-access-list
# Now client can connect - SG rules allow traffic from client's node SGs
```

**Alternative:** Deploy all at once (dependencies enforce correct order automatically):
```bash
monk update my-app/mysql-database my-app/mysql-client my-app/mysql-access-list
```

## Key Points for Agent

1. **Deploy in order: instance → client → access-list** - access-list needs to know client's nodes to get their security groups
2. **Always set `publicly_accessible: false`** for private databases
3. **Always use `auto_create_security_group: true`** to get a manageable SG
4. **The access-list must depend on BOTH database AND client** - it needs the client's SG to exist
5. **Use `runnable-peers()` function** to automatically get security group names of all nodes running a runnable
6. **Connection values use `entity-state`** for runtime values (endpoint, port, SG ID) vs `entity` for definition values (region)
7. **Password is auto-generated** if `password_secret_ref` points to a non-existent secret
