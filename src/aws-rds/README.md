# AWS RDS Entity for Monk Orchestrator

This directory contains a **production-ready** AWS RDS (Relational Database Service) entity implementation for the Monk orchestrator platform. The entity provides complete lifecycle management for RDS database instances including creation, updates, deletion, readiness checks, and comprehensive database management operations.

## 🎯 Status: Production Ready ✅

- ✅ **Fully Functional**: All lifecycle operations and custom actions working
- ✅ **Comprehensive Testing**: Complete integration test suite available  
- ✅ **Multiple Engines**: Support for MySQL, PostgreSQL, MariaDB, Oracle, SQL Server
- ✅ **AWS Compatible**: Successfully tested with AWS RDS API (IAM permissions required)
- ✅ **Production Features**: Multi-AZ, encryption, backups, security groups
- ✅ **Error Handling**: Robust AWS API error handling and reporting

## Architecture

The AWS RDS entity follows the established Monk entity pattern with three main components:

### Core Files

- **`base.ts`**: Contains the `AWSRDSEntity` base class that provides common functionality for RDS operations
  - AWS API integration using the built-in `aws` module
  - Core RDS operations (create, delete, modify, describe instances)
  - Database instance state management
  - Error handling and XML response parsing

- **`common.ts`**: Contains shared utilities and interfaces
  - Database engine validation and normalization
  - Storage size validation
  - Parameter building for AWS API calls
  - Helper functions for instance configuration

- **`instance.ts`**: Main RDS instance entity implementation
  - Extends `AWSRDSEntity` base class
  - Implements lifecycle methods: create, start, stop, update, delete, checkReadiness
  - Provides custom actions for database management
  - Handles all supported database engines

## Entity Usage

### Basic MySQL Instance

```yaml
namespace: my-app

my-mysql-db:
  defines: aws-rds/rds-instance
  region: us-east-1
  db_instance_identifier: my-mysql-instance
  db_instance_class: db.t3.micro
  engine: mysql
  engine_version: "8.0"
  master_username: admin
  password_secret_ref: my-mysql-db-password
  allocated_storage: 20
  port: 3306
  storage_type: gp2
  auto_minor_version_upgrade: true
  backup_retention_period: 7
  publicly_accessible: false
  multi_az: false
  deletion_protection: false
  skip_final_snapshot: true
  tags:
    Environment: development
    Application: my-app
    ManagedBy: monk
```

### PostgreSQL with Advanced Configuration

```yaml
namespace: my-app

my-postgres-db:
  defines: aws-rds/rds-instance
  region: us-west-2
  db_instance_identifier: my-postgres-instance
  db_instance_class: db.t3.small
  engine: postgres
  engine_version: "15.4"
  master_username: postgres
  allocated_storage: 50
  port: 5432
  storage_type: gp3
  auto_minor_version_upgrade: true
  backup_retention_period: 14
  preferred_backup_window: "07:00-08:00"
  preferred_maintenance_window: "sun:08:00-sun:09:00"
  publicly_accessible: false
  multi_az: true
  storage_encrypted: true
  deletion_protection: true
  skip_final_snapshot: false
  final_db_snapshot_identifier: my-postgres-final-snapshot
  vpc_security_group_ids:
    - sg-12345678
  db_subnet_group_name: my-subnet-group
  tags:
    Environment: production
    Application: my-app
    ManagedBy: monk
```

## Configuration Parameters

### Required Parameters

- `region` - AWS region for the database instance
- `db_instance_identifier` - Unique identifier for the database instance
- `db_instance_class` - Instance class (e.g., db.t3.micro, db.m5.large)
- `engine` - Database engine (mysql, postgres, mariadb, oracle-ee, sqlserver-se)
- `master_username` - Master username for the database
- `allocated_storage` - Initial storage size in GB (minimum 20GB)

### Optional Parameters

- `engine_version` - Specific engine version (defaults to latest)
- `port` - Database port (defaults based on engine)
- `db_name` - Name of the database to create (PostgreSQL/MySQL only)
- `master_user_password` - Master password (can be managed externally)
- `vpc_security_group_ids` - List of VPC security group IDs
- `db_subnet_group_name` - Database subnet group name
- `backup_retention_period` - Backup retention in days (0-35)
- `preferred_backup_window` - Backup window (e.g., "07:00-08:00")
- `preferred_maintenance_window` - Maintenance window (e.g., "sun:08:00-sun:09:00")
- `auto_minor_version_upgrade` - Enable automatic minor version upgrades
- `multi_az` - Enable Multi-AZ deployment for high availability
- `publicly_accessible` - Make instance publicly accessible
- `storage_type` - Storage type (gp2, gp3, io1, io2)
- `storage_encrypted` - Enable storage encryption
- `kms_key_id` - KMS key ID for encryption
- `deletion_protection` - Enable deletion protection
- `skip_final_snapshot` - Skip final snapshot on deletion
- `final_db_snapshot_identifier` - Final snapshot identifier
- `tags` - Resource tags

## Supported Database Engines

The entity supports all major RDS database engines:

### MySQL
- Engine: `mysql`
- Versions: 5.7, 8.0
- Default Port: 3306

### PostgreSQL  
- Engine: `postgres` or `postgresql`
- Versions: 11, 12, 13, 14, 15
- Default Port: 5432
- **Database Creation**: Use `db_name` parameter to create initial database. If not specified, only the default `postgres` database exists.

### MariaDB
- Engine: `mariadb`
- Versions: 10.3, 10.4, 10.5, 10.6
- Default Port: 3306

### Oracle
- Engine: `oracle-ee`, `oracle-se2`
- Versions: 19c, 21c
- Default Port: 1521

### SQL Server
- Engine: `sqlserver-ex`, `sqlserver-web`, `sqlserver-se`, `sqlserver-ee`
- Versions: 2017, 2019, 2022
- Default Port: 1433

## Password Management

The entity uses secure password management through Monk's secret system:

### Automatic Password Generation
If `password_secret_ref` is not specified, the entity automatically generates a secret reference using the pattern: `{db_instance_identifier}-master-password`

### Password Storage
- Passwords are stored securely in Monk's secret vault
- If a password doesn't exist, a secure 16-character password is automatically generated
- Passwords are never stored in plain text in the entity definition

### Password Retrieval
Passwords are stored securely in Monk's secret vault and should be accessed using Monk's secret management tools directly, not through entity actions for security reasons.

### Example Configuration
```yaml
my-database:
  defines: aws-rds/rds-instance
  # ... other configuration ...
  password_secret_ref: my-custom-password-secret  # Optional: defaults to {identifier}-master-password
```

## Custom Actions

The entity provides several custom actions for database management:

### get-instance-info
Display comprehensive database instance information.

```bash
monk do my-app/my-database/get-instance-info
```

**Output includes:**
- Instance identifier and status
- Engine type and version
- Instance class and storage details
- Endpoint information
- Multi-AZ and accessibility settings
- Backup and maintenance windows
- Security group information

### get-connection-info
Show database connection information and CLI commands.

```bash
monk do my-app/my-database/get-connection-info
```

**Output includes:**
- Host and port information
- Database engine details
- Connection string format
- CLI command examples (mysql, psql)

### update-password
Update the master password for the database instance.

```bash
monk do my-app/my-database/update-password
```

**Use Cases:**
- Reset password for existing RDS instances
- Synchronize existing instances with Monk's secret management
- Update passwords for security compliance

**Process:**
- Retrieves password from Monk's secret vault (or generates new one)
- Updates RDS instance via AWS ModifyDBInstance API
- Applied immediately to the database

**Note:** This operation may cause a brief interruption for existing connections.

### create-snapshot
Create a manual database snapshot.

```bash
monk do my-app/my-database/create-snapshot
```

**Optional Parameters:**
- `snapshot_id` - Custom snapshot identifier

## Lifecycle Management

### Creation
The entity handles both new and existing RDS instances:

**New Instances:**
- Creates a new RDS instance with the specified configuration
- Generates and securely stores master password in Monk's secret vault
- Creation typically takes 10-15 minutes

**Existing Instances:**
- Detects pre-existing RDS instances automatically
- Marks them as `existing: true` (protected from deletion)
- **Automatically updates master password** to synchronize with Monk's secret management
- Allows management without recreating the infrastructure

### Readiness Check
The entity implements comprehensive readiness checks that verify the instance is in "available" status and ready to accept connections.

**Readiness Configuration:**
- Check Period: 30 seconds
- Initial Delay: 60 seconds  
- Max Attempts: 40 (20 minutes total)

### Updates
The entity supports updating instance configuration through Monk's built-in update mechanism.

**Usage:**
```bash
monk update rds-client-demo/mysql-database
```

**Supported Updates:**
- Instance class scaling (db_instance_class)
- Storage scaling (allocated_storage, max_allocated_storage)  
- Engine version upgrades (engine_version)
- Backup settings (backup_retention_period, backup_window)
- Maintenance settings (maintenance_window, auto_minor_version_upgrade)
- Multi-AZ configuration (multi_az)
- Performance Insights (performance_insights_enabled, monitoring_interval)
- CloudWatch logs exports (enabled_cloudwatch_logs_exports)
- Deletion protection (deletion_protection)
- VPC security groups (vpc_security_group_ids)
- **Security group access rules** (allowed_cidr_blocks, allowed_security_group_names)

**Update Process:**
1. Modify the entity definition in your YAML file
2. Run `monk update <entity-name>` 
3. Monk calls the entity's `update()` method
4. Entity applies changes via AWS ModifyDBInstance API
5. State is updated with the new configuration

**Security Group Rules Updates:**
For auto-created security groups, the entity supports dynamic updates to access rules:
- **Add/remove CIDR blocks**: Update `allowed_cidr_blocks` list
- **Add/remove security group references**: Update `allowed_security_group_names` list
- Rules are updated incrementally (only changed rules are added/removed)
- Existing security groups (not auto-created) are left unchanged during updates

**Example Update Workflow:**
```yaml
# Initial configuration
allowed_cidr_blocks:
  - "10.0.0.0/16"
allowed_security_group_names:
  - "app-servers-sg"

# After update - adds new CIDR, removes security group reference
allowed_cidr_blocks:
  - "10.0.0.0/16"
  - "172.16.0.0/12"  # NEW: Added this CIDR block
# removed: allowed_security_group_names (removed app-servers-sg access)
```

**Notes:**
- Updates are applied immediately by default
- Some updates may require a brief restart (e.g., instance class changes)
- Security group rule changes take effect immediately without downtime
- Engine version upgrades are one-way operations

### Deletion
The entity properly deletes RDS instances with configurable final snapshot behavior.

## Security Features

### VPC Security Groups
Configure network access using VPC security groups:

```yaml
vpc_security_group_ids:
  - sg-12345678  # Database access
  - sg-87654321  # Application access
```

#### Automatic Security Group Creation
If `vpc_security_group_ids` is not specified, the entity can automatically create a security group for you:

```yaml
# Auto-create security group with default settings
auto_create_security_group: true  # Default: true if vpc_security_group_ids not specified

# Customize auto-created security group
security_group_name: my-db-security-group
security_group_description: "Custom description for auto-created security group"
vpc_id: vpc-0123456789abcdef0  # Optional: specify VPC (uses default VPC if not provided)

# Security access control (at least one must be specified)
allowed_cidr_blocks:           # Optional: allow access from specific IP ranges
  - "10.0.0.0/16"             # VPC CIDR
  - "192.168.1.0/24"          # Office network

allowed_security_group_names:  # Optional: allow access from specific security groups
  - "app-servers-sg"          # Application servers
  - "web-servers-sg"          # Web servers
```

**Security Group Auto-Creation Features:**
- Automatically creates a security group if none specified
- **Smart reuse**: If a security group with the same name already exists, it will be reused instead of creating a duplicate
- Creates security group in specified VPC or default VPC if none provided
- Configures ingress rules for the database port (only for newly created security groups)
- Supports both CIDR blocks and security group references for access control
- **Secure by default**: Requires explicit access configuration (no default 0.0.0.0/0)
- **Intelligent cleanup**: Only deletes security groups that were actually created (not existing ones that were reused)
- Preserves existing security groups (won't delete pre-existing ones)

**Access Control Options:**
- `allowed_cidr_blocks`: Grant access to specific IP address ranges
- `allowed_security_group_names`: Grant access to instances in specific security groups
- **At least one access method must be specified** for security

### Database Subnet Groups
Deploy in specific subnets using database subnet groups:

```yaml
db_subnet_group_name: my-private-subnet-group
```

### Encryption
Enable encryption at rest with AWS KMS:

```yaml
storage_encrypted: true
kms_key_id: arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012
```

### Access Control
Control public accessibility and implement proper network isolation:

```yaml
publicly_accessible: false  # Recommended for production
multi_az: true              # High availability
deletion_protection: true   # Prevent accidental deletion
```

## High Availability and Backup

### Multi-AZ Deployment
Enable Multi-AZ for automatic failover:

```yaml
multi_az: true
```

### Automated Backups
Configure automated backup retention:

```yaml
backup_retention_period: 14
preferred_backup_window: "07:00-08:00"
```

### Maintenance Windows
Schedule maintenance during low-traffic periods:

```yaml
preferred_maintenance_window: "sun:08:00-sun:09:00"
auto_minor_version_upgrade: true
```

## Testing

The entity includes comprehensive integration tests that validate:

- Database instance creation and deletion
- All custom actions
- Multiple database engines (MySQL, PostgreSQL)
- Lifecycle operations
- Error handling

### Running Tests

```bash
# Basic test run
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test

# Verbose output
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test --verbose

# Specific test file
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test --test-file stack-integration.test.yaml
```

**Prerequisites:**
- AWS credentials configured
- Required RDS permissions (see AWS Permissions section below)
- ~30 minutes for full test execution

**Test Status:** ✅ Integration tests pass successfully. Entity correctly interfaces with AWS RDS API.

See [test/README.md](test/README.md) for detailed testing information.

## AWS Permissions

The entity requires the following AWS IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rds:CreateDBInstance",
        "rds:DescribeDBInstances",
        "rds:ModifyDBInstance",
        "rds:DeleteDBInstance",
        "rds:CreateDBSnapshot",
        "rds:DescribeDBSnapshots",
        "rds:ListTagsForResource",
        "rds:AddTagsToResource"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:CreateSecurityGroup",
        "ec2:DescribeSecurityGroups",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:DeleteSecurityGroup"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "${aws:RequestedRegion}"
        }
      }
    }
  ]
}
```

**Note:** EC2 security group permissions are only required if using the automatic security group creation feature. If you provide explicit `vpc_security_group_ids`, these permissions are not needed.

## Error Handling

The entity provides comprehensive error handling:

- **AWS API Errors**: Full error messages with AWS error codes
- **Validation Errors**: Input validation with helpful error messages
- **Timeout Handling**: Proper timeout management for long-running operations
- **State Management**: Robust state tracking and recovery

## Best Practices

### Development
1. Use `db.t3.micro` instances for development (Free Tier eligible)
2. Set `deletion_protection: false` for easy cleanup
3. Use `skip_final_snapshot: true` for faster deletion

### Production
1. Enable Multi-AZ for high availability
2. Use appropriate instance classes for workload
3. Enable encryption and deletion protection
4. Configure proper security groups and subnet groups
5. Set up automated backups with appropriate retention

### Cost Optimization
1. Use appropriate instance sizes
2. Monitor storage growth and set max allocated storage
3. Use gp3 storage for better price/performance
4. Consider Reserved Instances for long-term workloads

## Examples

Complete examples are available in the `example.yaml` file, including:

- Basic MySQL development instance
- Production PostgreSQL with advanced features
- Multi-AZ setup with encryption
- Custom VPC and security group configuration

## Limitations

- Maximum 1 database instance per entity definition
- RDS instance limits apply (AWS account limits)
- Some advanced features require specific instance classes
- Cross-region replication requires separate entities

## Support

This entity supports all AWS RDS features available through the AWS API including:
- All database engines and versions
- Performance Insights integration
- Enhanced monitoring
- Read replicas (via separate entity instances)
- Backup and restore operations 