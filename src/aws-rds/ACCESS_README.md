# AWS RDS Access Entity

## Status
**Production Ready ✅**

## Overview
The AWS RDS Access entity provides dedicated management of security group access rules for RDS instances. This entity focuses solely on managing inbound TCP rules for database access, allowing fine-grained control over which IP addresses and security groups can connect to your RDS instances.

## Architecture
- `access.ts` - Complete RDS Access implementation with security group rule management
- `access-example.yaml` - Usage examples and patterns
- `ACCESS_README.md` - This comprehensive documentation

## Key Features
- **Dedicated Access Management**: Manages only security group rules, no other RDS operations
- **Rule Synchronization**: Automatically synchronizes desired rules with actual AWS security group state
- **CIDR and Security Group Support**: Allows access from both IP ranges and other security groups
- **Non-destructive Management**: Only manages rules for the specified port, leaves other rules intact
- **Real-time Validation**: Validates security group existence and rule states

## Security
- **Least Privilege**: Only requires EC2 permissions for security group management
- **No Resource Creation**: Only modifies existing security groups, never creates or deletes them
- **Rule Isolation**: Only manages rules for the specific port defined in the entity
- **Safe Cleanup**: Removes only the rules it manages during deletion

## Definition Parameters

### Required Parameters
```yaml
region: string                    # AWS region
security_group_id: string         # Target security group ID to manage
```

### Optional Parameters
```yaml
port: number                      # TCP port to manage (default: 3306)
allowed_cidr_blocks: string[]     # List of CIDR blocks allowed access
allowed_security_group_names: string[]  # List of security group names allowed access
vpc_id: string                    # VPC ID for security group name resolution
```

## Custom Actions

### get-access-info
Displays comprehensive information about currently managed access rules.

```bash
# Show access information
monk do entity-name/get-access-info
```

**Output includes:**
- Security group ID being managed
- Managed port and protocol
- Current CIDR block rules
- Current security group rules

### sync-rules
Manually synchronizes security group rules with the entity definition.

```bash
# Force synchronization of rules
monk do entity-name/sync-rules
```

**Use cases:**
- After external changes to security group rules
- Manual verification of rule synchronization
- Troubleshooting access issues

## Usage Examples

### Basic Access Management
```yaml
database-access:
  defines: aws-rds/access
  region: us-east-1
  security_group_id: sg-12345678
  port: 3306
  allowed_cidr_blocks:
    - "10.0.0.0/16"
    - "192.168.1.0/24"
  allowed_security_group_names:
    - "web-servers-sg"
    - "app-servers-sg"
```

### PostgreSQL Access
```yaml
postgres-access:
  defines: aws-rds/access
  region: us-west-2
  security_group_id: sg-87654321
  port: 5432
  vpc_id: vpc-abcdef12
  allowed_cidr_blocks:
    - "10.1.0.0/16"
  allowed_security_group_names:
    - "application-tier-sg"
```

### Security Group Only Access
```yaml
secure-access:
  defines: aws-rds/access
  region: eu-west-1
  security_group_id: sg-abcdef12
  port: 3306
  allowed_security_group_names:
    - "backend-services-sg"
    - "admin-access-sg"
  # No CIDR blocks = no direct IP access
```

## Integration with RDS Instance Entity

The RDS Access entity is designed to work alongside the RDS Instance entity for scenarios where you need additional access control beyond what the RDS instance provides:

```yaml
# RDS Instance with basic security group
mysql-database:
  defines: aws-rds/instance
  region: us-east-1
  db_instance_identifier: my-mysql-db
  # ... other RDS configuration
  auto_create_security_group: true
  security_group_name: my-mysql-sg
  allowed_cidr_blocks:
    - "10.0.0.0/16"

# Additional access management
additional-access:
  defines: aws-rds/access
  region: us-east-1
  security_group_id: sg-mysql-from-rds-instance  # Get from RDS instance
  port: 3306
  allowed_cidr_blocks:
    - "10.0.0.0/16"
    - "192.168.0.0/16"  # Additional CIDR block
  allowed_security_group_names:
    - "admin-sg"        # Additional security group
```

## Lifecycle Behavior

### Create
1. Validates that the target security group exists
2. Sets up state to track the security group and port
3. Synchronizes rules to match the definition
4. Does not create any AWS resources

### Update
1. Handles port changes by cleaning up old port rules
2. Synchronizes rules for the current/new port
3. Adds new rules and removes obsolete rules atomically

### Delete
1. Removes all rules managed by this entity
2. Leaves other rules in the security group intact
3. Does not delete the security group itself

### Readiness
- Checks that the target security group still exists
- Returns true when security group is accessible

## State Management

The entity maintains minimal state:
```typescript
interface AWSRDSAccessState {
    existing: boolean;          // Always true (managing existing SG)
    security_group_id?: string; // Security group being managed
    managed_port?: number;      // Port being managed
}
```

State characteristics:
- **No Rule Caching**: Always queries AWS for current rule state
- **Minimal Footprint**: Only tracks essential management information
- **Real-time Accuracy**: State reflects actual AWS resources

## Required AWS Permissions

The entity requires the following IAM permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeVpcs",
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress"
            ],
            "Resource": "*"
        }
    ]
}
```

## Error Handling

The entity provides comprehensive error handling:
- **Security Group Not Found**: Fails fast if target security group doesn't exist
- **Permission Errors**: Clear messages for insufficient AWS permissions
- **Rule Conflicts**: Handles duplicate rule authorization gracefully
- **Network Errors**: Robust retry behavior for transient AWS API issues

## Best Practices

### Security
- **Principle of Least Privilege**: Only grant access to necessary CIDR blocks and security groups
- **Regular Audits**: Use `get-access-info` action to review current access rules
- **VPC Isolation**: Specify `vpc_id` when using security group names for clarity

### Operations
- **Incremental Changes**: Make small, incremental changes to access rules
- **Test Changes**: Use development environments to test rule changes before production
- **Monitor Access**: Combine with AWS CloudTrail to monitor access rule modifications

### Integration
- **Separate Concerns**: Use RDS Instance entity for database management, RDS Access for access control
- **Consistent Naming**: Use descriptive security group names for easy identification
- **Documentation**: Document the purpose of each access rule in your infrastructure code

## Troubleshooting

### Common Issues

**Security Group Not Found**
```
Error: Security group sg-12345678 not found
```
- Verify the security group ID is correct
- Ensure the security group exists in the specified region
- Check AWS permissions for DescribeSecurityGroups

**Security Group Name Resolution Failed**
```
Error: Security group 'web-servers-sg' not found in VPC vpc-12345678
```
- Verify the security group name is correct
- Ensure the security group exists in the specified VPC
- Provide `vpc_id` parameter if not using default VPC

**Permission Denied**
```
Error: Failed to update security group rules: UnauthorizedOperation
```
- Verify IAM permissions include required EC2 actions
- Check that the security group is in the same account
- Ensure cross-account access is properly configured if needed

### Debugging Commands

```bash
# Check current access configuration
monk do entity-name/get-access-info

# Force rule synchronization
monk do entity-name/sync-rules

# Check entity readiness
monk describe entity-name
```

## Testing

### Integration Testing
The entity includes comprehensive integration tests covering:
- Basic rule management scenarios
- CIDR block and security group combinations
- Error conditions and edge cases
- Integration with other AWS services

Run tests:
```bash
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test --test-file access-integration.test.yaml
```

### Manual Testing
```bash
# Create access management
monk load access-example.yaml
monk run basic-rds-access

# Verify rules
monk do basic-rds-access/get-access-info

# Test rule changes
# Edit the YAML file and update
monk update basic-rds-access

# Cleanup
monk purge --force basic-rds-access
```

## Limitations

- **TCP Only**: Currently supports only TCP protocol rules
- **Single Port**: Manages rules for one port per entity instance
- **Existing Security Groups**: Does not create or delete security groups
- **VPC Bound**: Security group name resolution limited to single VPC

## Related Documentation

- [AWS RDS Instance Entity](README.md)
- [Entity Development Rules](../../ENTITY_RULES.md)
- [AWS Security Groups Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/VPC_SecurityGroups.html)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review AWS CloudTrail logs for API call details
3. Verify AWS permissions and security group states
4. Consult the entity development rules for best practices
