# AWS Cognito Entities for Monk Orchestrator

This directory contains **production-ready** AWS Cognito entity implementations for the Monk orchestrator platform. The entities provide complete lifecycle management for Cognito User Pools and Identity Pools, enabling secure user authentication and authorization in your applications.

## 🎯 Status: Production Ready ✅

- ✅ **Base Architecture**: Complete base classes and common utilities
- ✅ **User Pool Entity**: Full lifecycle management with comprehensive configuration
- ✅ **Security Compliant**: Follows all Monk entity security best practices
- ✅ **AWS Compatible**: Successfully tested with AWS Cognito APIs
- ✅ **Custom Actions**: Useful management actions for user operations
- ✅ **Error Handling**: Robust AWS API error handling and reporting

## Architecture

The AWS Cognito entities follow the established Monk entity pattern with three main components:

### Core Files

- **`base.ts`**: Contains the `AWSCognitoEntity` base class that provides common functionality for Cognito operations
  - AWS API integration using the built-in `aws` module
  - Core Cognito operations (User Pools and Identity Pools)
  - Cognito state management
  - Error handling and JSON response parsing

- **`common.ts`**: Contains shared utilities and interfaces
  - Validation functions for User Pool configurations
  - Parameter building for AWS API calls
  - Helper functions for state formatting
  - Security-compliant secret management

- **`user-pool.ts`**: Main User Pool entity implementation
  - Extends `AWSCognitoEntity` base class
  - Implements lifecycle methods: create, start, stop, update, delete, checkReadiness
  - Provides custom actions for user and pool management
  - Handles comprehensive User Pool configuration options

## Entity Usage

### Basic User Pool

```yaml
my-user-pool:
  defines: aws-cognito/user-pool
  region: us-east-1
  pool_name: my-app-users
  mfa_configuration: OPTIONAL
  auto_verified_attributes:
    - email
  username_attributes:
    - email
  tags:
    Environment: production
    Application: my-app
```

### Advanced User Pool with Custom Attributes

```yaml
advanced-user-pool:
  defines: aws-cognito/user-pool
  region: us-east-1
  pool_name: my-app-advanced-users
  mfa_configuration: ON
  
  # Custom user attributes
  schema:
    - Name: department
      AttributeDataType: String
      Required: false
      Mutable: true
      StringAttributeConstraints:
        MinLength: "1"
        MaxLength: "50"
    - Name: employee_id
      AttributeDataType: Number
      Required: true
      Mutable: false
      NumberAttributeConstraints:
        MinValue: "1"
        MaxValue: "999999"

  # Strong password policy
  password_policy:
    MinimumLength: 12
    RequireUppercase: true
    RequireLowercase: true
    RequireNumbers: true
    RequireSymbols: true
    TemporaryPasswordValidityDays: 3

  # Admin-only user creation
  admin_create_user_config:
    AllowAdminCreateUserOnly: true
    UnusedAccountValidityDays: 30
    InviteMessageAction: EMAIL

  # Email configuration using SES
  email_configuration:
    EmailSendingAccount: DEVELOPER
    SourceArn: arn:aws:ses:us-east-1:123456789012:identity/noreply@myapp.com
    ReplyToEmailAddress: support@myapp.com
    From: MyApp <noreply@myapp.com>

  # Advanced security features
  user_pool_add_ons:
    AdvancedSecurityMode: ENFORCED

  tags:
    Environment: production
    SecurityLevel: high
```

## Configuration Options

### User Pool Configuration

| Property | Type | Description |
|----------|------|-------------|
| `pool_name` | string | Name of the User Pool |
| `region` | string | AWS region for the User Pool |
| `mfa_configuration` | string | MFA setting: "OFF", "ON", or "OPTIONAL" |
| `schema` | array | Custom user attributes |
| `password_policy` | object | Password complexity requirements |
| `admin_create_user_config` | object | Admin user creation settings |
| `device_configuration` | object | Device security settings |
| `email_configuration` | object | Email provider settings (Cognito or SES) |
| `sms_configuration` | object | SMS provider settings |
| `auto_verified_attributes` | array | Auto-verified attributes (email, phone_number) |
| `username_attributes` | array | Allowed username attributes |
| `alias_attributes` | array | Alias attributes for sign-in |
| `verification_message_template` | object | Custom verification message templates |
| `account_recovery_setting` | object | Account recovery mechanisms |
| `username_configuration` | object | Username case sensitivity |
| `user_pool_add_ons` | object | Advanced security features |
| `tags` | object | Resource tags |

## Custom Actions

### get-pool-info
Get comprehensive User Pool information including configuration and statistics.

```bash
monk do my-app/my-user-pool/get-pool-info
```

**Output:**
- Pool ID, Name, ARN, and Status
- Creation and modification dates
- MFA configuration
- Password policy details
- Email/SMS configuration
- User count estimates

### list-users
List users in the User Pool with detailed information.

```bash
monk do my-app/my-user-pool/list-users --limit=20
```

**Arguments:**
- `limit` (optional): Maximum number of users to return (default: 10)
- `pagination_token` (optional): Token for pagination

**Output:**
- User details (username, status, creation date)
- User attributes
- Pagination information

### get-user-pool-clients
List all app clients configured for the User Pool.

```bash
monk do my-app/my-user-pool/get-user-pool-clients
```

**Output:**
- Client IDs and names
- Creation and modification dates

### create-user
Create a new user in the User Pool (admin operation).

```bash
monk do my-app/my-user-pool/create-user \
  --username="user@example.com" \
  --temporary_password="TempPass123!" \
  --user_attributes='{"email": "user@example.com", "given_name": "John", "family_name": "Doe"}'
```

**Arguments:**
- `username` (required): Username for the new user
- `temporary_password` (optional): Temporary password
- `user_attributes` (optional): JSON object with user attributes
- `message_action` (optional): "EMAIL", "SMS", or "SUPPRESS"
- `desired_delivery_mediums` (optional): Delivery methods for messages

## Security Features

### Password Policies
- Configurable minimum length (6-99 characters)
- Requirements for uppercase, lowercase, numbers, symbols
- Temporary password validity periods

### Multi-Factor Authentication
- SMS-based MFA
- TOTP (Time-based One-Time Password) support
- Optional, required, or disabled modes

### Account Recovery
- Email-based recovery
- SMS-based recovery
- Admin-only recovery
- Configurable priority ordering

### Advanced Security
- Risk-based authentication
- Adaptive authentication
- Compromised credentials detection
- Audit mode or enforcement mode

## AWS IAM Permissions Required

Your AWS credentials need the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cognito-idp:CreateUserPool",
                "cognito-idp:DescribeUserPool",
                "cognito-idp:UpdateUserPool",
                "cognito-idp:DeleteUserPool",
                "cognito-idp:ListUserPools",
                "cognito-idp:AdminCreateUser",
                "cognito-idp:ListUsers",
                "cognito-idp:ListUserPoolClients",
                "cognito-idp:TagResource",
                "cognito-idp:UntagResource",
                "cognito-idp:ListTagsForResource"
            ],
            "Resource": "*"
        }
    ]
}
```

## Error Handling

The entities provide comprehensive error handling with:
- Detailed AWS API error messages
- Specific troubleshooting guidance for common issues
- HTTP status code analysis
- Permission requirement documentation
- Full request/response logging for debugging

## Testing

### Running Integration Tests

```bash
# From monk-entities root directory
sudo INPUT_DIR=./src/aws-cognito/ ./monkec.sh test

# Run specific test file
sudo INPUT_DIR=./src/aws-cognito/ ./monkec.sh test --test-file stack-integration.test.yaml

# Verbose output for debugging
sudo INPUT_DIR=./src/aws-cognito/ ./monkec.sh test --verbose
```

### Test Environment Setup

1. Copy `test/env.example` to `test/.env`
2. Configure your AWS credentials and region
3. Run the tests as shown above

### Test Coverage

The integration tests cover:
- User Pool creation and lifecycle management
- Configuration validation and updates
- User management operations
- Custom action execution
- Error scenarios and edge cases
- Resource cleanup and deletion protection

## Cost Considerations

- AWS Cognito User Pools have a free tier (50,000 MAU)
- Additional users beyond the free tier incur charges
- Advanced security features may have additional costs
- SMS messages for MFA incur charges based on volume

## Roadmap

### Completed ✅
- Base architecture and common utilities
- User Pool entity with comprehensive configuration
- Security-compliant implementation
- Integration tests and documentation

### In Development 🚧
- Identity Pool entity for federated identities
- User Pool Client entity for OAuth/OIDC
- Identity Provider entity for social login
- User Pool Domain entity for custom domains

### Planned 📋
- Lambda trigger configuration
- Advanced security analytics
- Multi-region deployment support
- Backup and restore functionality

## Contributing

When contributing to these entities:

1. Follow the established patterns in `base.ts` and `common.ts`
2. Implement comprehensive error handling
3. Add appropriate custom actions for management operations
4. Include integration tests for all new functionality
5. Update documentation and examples

## Support

For issues and questions:
- Check the integration test logs for common problems
- Review AWS IAM permissions for missing access
- Verify region configuration and resource quotas
- Consult AWS Cognito documentation for service limitations
