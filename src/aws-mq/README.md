# AWS MQ Entity for Monk

![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-green)
![Test Coverage](https://img.shields.io/badge/Tests-17%2F17%20Passing-brightgreen)
![AWS MQ](https://img.shields.io/badge/AWS-MQ-orange)

A comprehensive Monk entity for managing Amazon MQ message brokers with enterprise-grade features, security, and lifecycle management.

## Overview

This entity provides complete lifecycle management for AWS MQ brokers, supporting both ActiveMQ and RabbitMQ engines with advanced configuration options, security features, and infrastructure protection.

### Key Features

- ✅ **Multi-Engine Support**: ActiveMQ and RabbitMQ
- ✅ **Deployment Modes**: Single instance, Active/Standby, and Cluster Multi-AZ
- ✅ **Security**: LDAP integration, encryption, VPC networking
- ✅ **High Availability**: Multi-AZ deployments with automatic failover
- ✅ **Infrastructure Protection**: Safe handling of pre-existing brokers
- ✅ **Comprehensive Actions**: Detailed broker information and management
- ✅ **Enterprise Features**: Custom configurations, maintenance windows, logging

## Architecture

The entity follows a modular architecture with three core components:

```
src/aws-mq/
├── base.ts           # Abstract base class with AWS API integration
├── common.ts         # Validation, utilities, and state formatting
├── broker.ts         # Concrete MQ broker implementation
├── example.yaml      # Usage examples
└── README.md         # This documentation
```

### State Management

The entity maintains minimal runtime state, avoiding duplication of configuration data:

```typescript
interface AWSMQState {
    existing: boolean;              // Safety flag for pre-existing resources
    broker_id?: string;            // AWS-assigned broker ID
    broker_arn?: string;           // AWS-assigned broker ARN
    broker_state?: string;         // Current broker state (RUNNING, etc.)
    created?: string;              // Creation timestamp
    last_modified?: string;        // Last modification timestamp
    endpoints?: string[];          // Connection endpoints
    web_console_url?: string;      // Web console URL
}
```

## Configuration

### Required Parameters

```yaml
variables:
  region: us-east-1                    # AWS region
  broker_name: my-broker               # Unique broker name
  engine_type: ACTIVEMQ               # ACTIVEMQ or RABBITMQ
  host_instance_type: mq.t3.micro     # Instance type
```

### Engine Versions

- **ActiveMQ**: `5.18` (recommended)
- **RabbitMQ**: `3.13` (recommended)

### Deployment Modes

- `SINGLE_INSTANCE` - Single broker instance
- `ACTIVE_STANDBY_MULTI_AZ` - High availability with standby
- `CLUSTER_MULTI_AZ` - Multi-node cluster (RabbitMQ only)

### Security Configuration

```yaml
variables:
  # Network Security
  publicly_accessible: false
  subnet_ids:
    - subnet-12345678
    - subnet-87654321
  security_groups:
    - sg-abcdef123
  
  # Encryption
  encryption_options:
    use_aws_owned_key: false
    kms_key_id: arn:aws:kms:region:account:key/key-id
  
  # User Management (secure password references)
  users:
    - username: admin
      password_secret_ref: admin-password-secret
      console_access: true
      groups:
        - admin
```

### LDAP Integration

```yaml
variables:
  ldap_authentication:
    host: ldap.company.com
    port: 636
    user_base: ou=users,dc=company,dc=com
    role_base: ou=roles,dc=company,dc=com
    service_account_username: mq-service
    service_account_password_secret_ref: ldap-service-password
```

## Custom Actions

The entity provides three custom actions for broker management:

### `get-broker-info`

Displays comprehensive broker information including configuration, status, and connection details.

```bash
monk do my-stack/my-broker/get-broker-info
```

**Output includes:**
- Broker ID, name, and state
- Engine type and version
- Instance type and deployment mode
- Network configuration
- Logging settings
- Endpoint details

### `get-connection-info`

Provides connection information and example commands for different protocols.

```bash
monk do my-stack/my-broker/get-connection-info
```

**Output includes:**
- Connection endpoints for all protocols
- Web console URL
- Example connection commands
- Protocol-specific configuration

### `reboot-broker`

Initiates a broker reboot for maintenance or troubleshooting.

```bash
monk do my-stack/my-broker/reboot-broker
```

**Note**: Reboots typically take 5-10 minutes to complete.

## Security Best Practices

### Password Management

🔒 **NEVER use plain text passwords in entity definitions**

```yaml
# ✅ CORRECT - Use secret references
users:
  - username: admin
    password_secret_ref: my-admin-password
    
# ❌ WRONG - Never use plain text
users:
  - username: admin
    password: "plain-text-password"  # SECURITY RISK!
```

### Network Security

```yaml
# Recommended security configuration
variables:
  publicly_accessible: false
  subnet_ids:
    - subnet-private-1a
    - subnet-private-1b
  security_groups:
    - sg-restrictive-mq
```

### Infrastructure Protection

The entity automatically detects pre-existing brokers and marks them as `existing: true` to prevent accidental deletion:

```
✅ Found and managing existing broker my-broker (ID: b-12345)
```

## Examples

### Basic ActiveMQ Broker

```yaml
activemq-broker:
  defines: aws-mq/mq-broker
  variables:
    region: us-east-1
    broker_name: basic-activemq
    engine_type: ACTIVEMQ
    engine_version: "5.18"
    host_instance_type: mq.t3.micro
    deployment_mode: SINGLE_INSTANCE
    users:
      - username: admin
        password_secret_ref: activemq-admin-password
        console_access: true
```

### Production RabbitMQ with High Availability

```yaml
rabbitmq-broker:
  defines: aws-mq/mq-broker
  variables:
    region: us-west-2
    broker_name: prod-rabbitmq
    engine_type: RABBITMQ
    engine_version: "3.13"
    host_instance_type: mq.m5.large
    deployment_mode: CLUSTER_MULTI_AZ
    publicly_accessible: false
    subnet_ids:
      - subnet-12345678
      - subnet-87654321
    auto_minor_version_upgrade: true
    enable_general_logging: true
    enable_audit_logging: true
```

See `example.yaml` for more comprehensive examples.

## AWS IAM Permissions

The entity requires the following AWS IAM permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "mq:CreateBroker",
                "mq:DeleteBroker", 
                "mq:DescribeBroker",
                "mq:ListBrokers",
                "mq:RebootBroker",
                "mq:UpdateBroker",
                "mq:CreateUser",
                "mq:DeleteUser",
                "mq:DescribeUser",
                "mq:ListUsers",
                "mq:UpdateUser",
                "ec2:CreateSecurityGroup",
                "ec2:DeleteSecurityGroup",
                "ec2:DescribeSecurityGroups",
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:RevokeSecurityGroupIngress",
                "ec2:DescribeSubnets",
                "ec2:DescribeVpcs",
                "kms:DescribeKey",
                "kms:CreateGrant",
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "*"
        }
    ]
}
```

## Testing

The entity includes a comprehensive integration test suite:

```bash
# Run all tests
sudo INPUT_DIR=./src/aws-mq/ ./monkec.sh test

# Build entity only
./build.sh aws-mq
```

### Test Coverage

- ✅ Broker creation and readiness (17 tests total)
- ✅ Existing broker detection and management
- ✅ All custom actions with real AWS data
- ✅ Lifecycle operations (create, update, reboot, delete)
- ✅ Error handling and edge cases
- ✅ Complete cleanup and resource safety

## Troubleshooting

### Common Issues

**403 Forbidden Errors**
- Verify AWS IAM permissions are correctly configured
- Check that the AWS credentials have MQ access

**Broker Creation Timeouts**
- AWS MQ brokers typically take 5-15 minutes to deploy
- Multi-AZ deployments take longer than single instance

**Connection Issues**
- Verify security group rules allow traffic on broker ports
- Check VPC and subnet configuration for private brokers

**Password Validation Errors**
- Passwords must be 12-250 characters
- Use complex passwords with special characters

### Debug Information

Enable detailed logging by checking entity state and AWS responses:

```bash
# Check entity status
monk describe my-stack/my-broker

# View broker information
monk do my-stack/my-broker/get-broker-info

# Check monk logs
monk logs my-stack/my-broker
```

## Limitations

- **Start/Stop Operations**: AWS MQ brokers cannot be stopped, only deleted
- **Storage Changes**: Storage type cannot be modified after creation
- **Engine Changes**: Engine type cannot be changed after creation
- **AZ Changes**: Availability zones cannot be modified after creation

## Version History

- **v1.0.0** - Initial production release with full ActiveMQ and RabbitMQ support
- Comprehensive integration test suite (17/17 tests passing)
- Enterprise security features and infrastructure protection
- Complete documentation and examples

## Support

For issues, questions, or contributions:
- Review the integration tests in `test/` directory
- Check AWS MQ documentation for service-specific limitations
- Verify IAM permissions match the requirements above

---

**Status**: Production Ready ✅  
**Last Updated**: September 2025  
**Compatibility**: AWS MQ API 2014-10-31