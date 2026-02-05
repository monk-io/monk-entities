# AWS RDS Access Control Playbook

> **Entity:** `aws-rds/rds-instance`, `aws-rds/rds-access-list`  
> **Category:** Database, Security  
> **Difficulty:** Medium  
> **Prerequisites:** AWS credentials with RDS permissions, Monk cluster with AWS nodes

---

## TL;DR

```yaml
# 1. RDS Instance - NO access rules here
database:
  defines: aws-rds/rds-instance
  publicly_accessible: false
  auto_create_security_group: true

# 2. Access List - manages access AFTER client deploys
access-list:
  defines: aws-rds/rds-access-list
  security_group_id: <- connection-target("db") entity-state get-member("created_security_group_id")
  allowed_security_group_names: <- runnable-peers("ns/client")
  depends:
    wait-for:
      runnables: [ns/database, ns/client]  # CRITICAL: both!
```

---

## Problem Statement

When deploying RDS databases, agents often use a **simple but insecure approach**:

```yaml
# ❌ WRONG: Hardcoded CIDR blocks
database:
  defines: aws-rds/rds-instance
  publicly_accessible: false
  auto_create_security_group: true
  allowed_cidr_blocks:
    - "172.31.0.0/16"  # Hardcoded VPC CIDR - allows ANY instance in VPC
```

**Why this is wrong:**
- Opens access to **entire VPC subnet**, not just client nodes
- Violates principle of least privilege
- Requires manual updates when infrastructure changes
- Security groups are statically defined at RDS creation time

## Solution: Dynamic Access Control with `rds-access-list`

Use two separate entities:
1. `aws-rds/rds-instance` - Creates database with **empty** security group
2. `aws-rds/rds-access-list` - Manages security group rules **dynamically** based on actual client deployment

```yaml
# ✅ CORRECT: Dynamic security group discovery
database:
  defines: aws-rds/rds-instance
  publicly_accessible: false
  auto_create_security_group: true
  # NO allowed_cidr_blocks here - access-list manages this

access-list:
  defines: aws-rds/rds-access-list
  allowed_security_group_names: <- runnable-peers("ns/client")  # Dynamic discovery
```

---

## Decision Tree: Which Access Pattern to Use?

```
Is client running on AWS nodes in the same VPC as RDS?
│
├─ YES → Pattern 1: Private Access (Security Groups)
│        Use: allowed_security_group_names + runnable-peers()
│        RDS: publicly_accessible: false
│
└─ NO (other cloud, different region, on-prem)
         → Pattern 2: Public Access (CIDR Blocks)
           Use: allowed_cidr_blocks + runnable-peers-public-ips()
           RDS: publicly_accessible: true
```

---

## Pattern 1: Private VPC Access (Recommended)

**When to use:** Client runs on AWS nodes in the same VPC as RDS.

### Step 1: Define RDS Instance

```yaml
mysql-database:
  defines: aws-rds/rds-instance
  region: us-east-1
  db_instance_identifier: my-mysql-db
  db_instance_class: db.t3.micro
  engine: mysql
  engine_version: "8.0"
  allocated_storage: 20
  master_username: admin
  password_secret_ref: my-mysql-password
  db_name: myapp
  
  # CRITICAL: Private access with auto-created empty security group
  publicly_accessible: false
  auto_create_security_group: true
  
  # DO NOT set allowed_cidr_blocks or allowed_security_group_names here
  # Access is managed by rds-access-list entity
  
  skip_final_snapshot: true
  deletion_protection: false
  permitted-secrets:
    my-mysql-password: true
  services:
    default:
      protocol: custom
```

### Step 2: Define Client Application

```yaml
mysql-client:
  defines: runnable
  containers:
    main:
      image: my-app:latest
  connections:
    db:
      runnable: ns/mysql-database
      service: default
  depends:
    wait-for:
      runnables:
        - ns/mysql-database
      timeout: 900
  variables:
    db-host:
      type: string
      value: <- connection-target("db") entity-state get-member("endpoint_address")
      env: DB_HOST
    db-port:
      type: int
      value: <- connection-target("db") entity-state get-member("endpoint_port")
      env: DB_PORT
    db-user:
      type: string
      value: <- connection-target("db") entity get-member("master_username")
      env: DB_USER
    db-password:
      type: string
      value: <- secret("my-mysql-password")
      env: DB_PASSWORD
  permitted-secrets:
    my-mysql-password: true
```

### Step 3: Define Access List (CRITICAL)

```yaml
mysql-access-list:
  defines: aws-rds/rds-access-list
  region: <- connection-target("db") entity get-member("region")
  security_group_id: <- connection-target("db") entity-state get-member("created_security_group_id")
  port: <- connection-target("db") entity-state get-member("endpoint_port")
  
  # KEY: Dynamically discover client node security groups
  allowed_security_group_names: <- runnable-peers("ns/mysql-client")
  
  connections:
    db:
      runnable: ns/mysql-database
      service: default
  depends:
    wait-for:
      runnables:
        - ns/mysql-database    # Need security_group_id from state
        - ns/mysql-client      # Need to know which nodes run client
      timeout: 600
```

---

## Pattern 2: Public Access (Cross-Region/Multi-Cloud)

**When to use:** Client runs outside AWS VPC (other cloud provider, different AWS region, on-premises).

### RDS Instance Configuration

```yaml
postgres-database:
  defines: aws-rds/rds-instance
  region: us-east-1
  db_instance_identifier: my-postgres-db
  engine: postgres
  # ... other config ...
  
  # CRITICAL: Public endpoint required for cross-VPC access
  publicly_accessible: true
  auto_create_security_group: true
```

### Access List Configuration

```yaml
postgres-access-list:
  defines: aws-rds/rds-access-list
  region: <- connection-target("db") entity get-member("region")
  security_group_id: <- connection-target("db") entity-state get-member("created_security_group_id")
  port: <- connection-target("db") entity-state get-member("endpoint_port")
  
  # KEY: Use public IPs instead of security group names
  allowed_cidr_blocks: <- runnable-peers-public-ips("ns/postgres-client")
  
  connections:
    db:
      runnable: ns/postgres-database
      service: default
  depends:
    wait-for:
      runnables:
        - ns/postgres-database
        - ns/postgres-client
      timeout: 600
```

---

## Deployment Sequence (CRITICAL)

**The order is mandatory. Incorrect order = connection failures.**

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  1. RDS Instance │ ──▶ │  2. Client App   │ ──▶ │  3. Access List  │
│                 │     │                 │     │                 │
│ Creates:        │     │ Deploys to:     │     │ Reads:          │
│ • Database      │     │ • Cluster nodes │     │ • Client's node │
│ • Empty SG      │     │ • Gets assigned │     │   security groups│
│                 │     │   security groups│     │ Opens:          │
│                 │     │                 │     │ • SG ingress rules│
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Why This Order?

| Step | What It Produces | Who Needs It |
|------|------------------|--------------|
| 1. RDS Instance | `state.created_security_group_id` | Access List |
| 2. Client | Node security group assignments | Access List (`runnable-peers()`) |
| 3. Access List | Ingress rules on RDS security group | Client (to connect) |

### What Happens If Order Is Wrong?

```
If access-list deploys BEFORE client:
  └─▶ runnable-peers("ns/client") returns EMPTY LIST
      └─▶ Security group gets NO INGRESS RULES
          └─▶ Client deploys but CANNOT CONNECT to database
              └─▶ Application fails with connection timeout
```

### Enforcing Order with Dependencies

```yaml
access-list:
  depends:
    wait-for:
      runnables:
        - ns/database   # ✓ Provides security_group_id
        - ns/client     # ✓ Provides node security groups
      timeout: 600
```

---

## Required AWS IAM Permissions

Add these RDS-specific permissions:

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

**Note:** EC2 security group permissions (`ec2:CreateSecurityGroup`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:RevokeSecurityGroupIngress`, `ec2:DescribeSecurityGroups`) are provided by the core Monk cluster policy.

---

## Key Functions Reference

| Function | Returns | Use Case |
|----------|---------|----------|
| `runnable-peers("ns/client")` | List of security group names for nodes running the client | Private VPC access |
| `runnable-peers-public-ips("ns/client")` | List of public IPs of nodes running the client | Public/cross-cloud access |
| `connection-target("db") entity-state get-member("X")` | Runtime value from connected entity state | Get endpoint, port, SG ID |
| `connection-target("db") entity get-member("X")` | Definition value from connected entity | Get region, username |

---

## Entity Options Quick Reference

### aws-rds/rds-instance

| Option | Required | Description |
|--------|----------|-------------|
| `region` | ✓ | AWS region |
| `db_instance_identifier` | ✓ | Unique DB identifier |
| `db_instance_class` | ✓ | Instance type (e.g., `db.t3.micro`) |
| `engine` | ✓ | `mysql`, `postgres`, `mariadb` |
| `master_username` | ✓ | DB admin username |
| `allocated_storage` | ✓ | Storage in GB (min 20) |
| `publicly_accessible` | | `false` for private, `true` for public |
| `auto_create_security_group` | | `true` to create manageable SG |
| `password_secret_ref` | | Secret name for password |

**State outputs:**
- `state.endpoint_address` - DB hostname
- `state.endpoint_port` - DB port  
- `state.created_security_group_id` - Auto-created SG ID

### aws-rds/rds-access-list

| Option | Required | Description |
|--------|----------|-------------|
| `region` | ✓ | Must match RDS instance region |
| `security_group_id` | ✓ | Target SG to manage |
| `port` | ✓ | DB port to allow |
| `allowed_security_group_names` | | SG names (private access) |
| `allowed_cidr_blocks` | | CIDR blocks (public access) |

---

## Common Mistakes

### ❌ Mistake 1: Hardcoded CIDR in RDS Instance

```yaml
# WRONG - static, insecure
database:
  defines: aws-rds/rds-instance
  allowed_cidr_blocks:
    - "172.31.0.0/16"
```

**Fix:** Remove `allowed_cidr_blocks` from instance, use `rds-access-list` instead.

### ❌ Mistake 2: Access List Without Client Dependency

```yaml
# WRONG - access-list deploys before client exists
access-list:
  defines: aws-rds/rds-access-list
  depends:
    wait-for:
      runnables:
        - ns/database  # Missing client!
```

**Fix:** Add client to dependencies.

### ❌ Mistake 3: Using `entity` Instead of `entity-state`

```yaml
# WRONG - endpoint_address is runtime state, not definition
db-host:
  value: <- connection-target("db") entity get-member("endpoint_address")
```

**Fix:** Use `entity-state` for runtime values.

---

## Deployment Commands

```bash
# Load entities
monk load dist/aws-rds/MANIFEST

# Load template
monk load my-template.yaml

# Add secrets
monk secrets add -g my-mysql-password='SecurePassword123!'

# Deploy (dependencies ensure correct order)
monk update ns/mysql-database ns/mysql-client ns/mysql-access-list

# Or deploy individually in order
monk update ns/mysql-database    # Wait ~10-15 min for RDS
monk update ns/mysql-client
monk update ns/mysql-access-list
```

---

## Summary

| Scenario | RDS Setting | Access List Setting |
|----------|-------------|---------------------|
| Client in same VPC | `publicly_accessible: false` | `allowed_security_group_names: <- runnable-peers()` |
| Client outside VPC | `publicly_accessible: true` | `allowed_cidr_blocks: <- runnable-peers-public-ips()` |

**Always:**
1. Use `auto_create_security_group: true` on RDS instance
2. Use separate `rds-access-list` entity for access control
3. Set access-list to depend on **both** database and client
4. Use dynamic functions (`runnable-peers`) instead of hardcoded values
