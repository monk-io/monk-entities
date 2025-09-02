# AWS IAM Entities

This collection provides comprehensive AWS IAM (Identity and Access Management) entity management using the AWS REST API through the built-in AWS module. It includes full lifecycle management for IAM policies, users, and roles with automatic credential handling and advanced security features.

## Available Entities

- **`aws-iam/iam-policy`**: IAM policies with versioning and validation
- **`aws-iam/iam-role`**: IAM roles with trust relationships and policy attachments
- **`aws-iam/iam-user`**: IAM users with automatic access key generation

## Features

### Common Features
- **Full Lifecycle Management**: Create, read, update, and delete IAM resources
- **Pre-existing Resource Protection**: Safely manage existing AWS resources
- **Error Handling**: Comprehensive error handling with detailed AWS API error reporting
- **XML Response Parsing**: Handles AWS IAM XML responses automatically
- **Custom Actions**: Extended functionality beyond basic CRUD operations
- **Automatic Cleanup**: Proper resource deletion with dependency management

### Policy-Specific Features
- **Policy Versioning**: Automatic version management with ability to set default versions
- **Policy Validation**: Built-in policy document validation and simulation
- **Attachment Tracking**: Monitor which entities (users, groups, roles) use the policy

### User-Specific Features
- **Automatic Access Key Generation**: Create and manage AWS access keys securely
- **Secret Management**: Store credentials in Monk's secret vault
- **Policy Attachment**: Automatically attach managed policies to users
- **Permissions Boundary**: Support for permissions boundaries
- **AssumeRole Support**: Create users for AssumeRole authentication patterns

### Role-Specific Features
- **Trust Policy Management**: Define and manage assume role policies
- **Session Duration Control**: Configure maximum session durations
- **Cross-Account Access**: Support for cross-account role assumptions

## Usage

### IAM User Examples

#### Basic User with Access Keys
```yaml
namespace: my-app

app-user:
  defines: aws-iam/iam-user
  region: us-east-1
  user_name: my-application-user
  create_access_keys: true
  access_key_id_secret_ref: my-app-access-key-id
  secret_access_key_secret_ref: my-app-secret-access-key
  attached_policy_arns:
    - "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess"
  tags:
    Environment: production
    Application: my-app
```

#### AssumeRole User Pattern
```yaml
namespace: my-app

# Minimal user for AssumeRole
assume-user:
  defines: aws-iam/user
  region: us-east-1
  user_name: service-assume-user
  create_access_keys: true
  attached_policy_arns:
    - <- connection-target("assume-policy") entity-state get-member("policy_arn")
  connections:
    assume-policy:
      runnable: my-app/assume-policy
      service: policy

# Policy allowing AssumeRole
assume-policy:
  defines: aws-iam/iam-policy
  region: us-east-1
  policy_name: AssumeServiceRolePolicy
  policy_document:
    Version: "2012-10-17"
    Statement:
      - Effect: Allow
        Action: sts:AssumeRole
        Resource: <- connection-target("service-role") entity-state get-member("role_arn")
  connections:
    service-role:
      runnable: my-app/service-role
      service: role

# Service role with actual permissions
service-role:
  defines: aws-iam/role
  region: us-east-1
  role_name: MyServiceRole
  assume_role_policy_document:
    Version: "2012-10-17"
    Statement:
      - Effect: Allow
        Principal:
          AWS: <- connection-target("assume-user") entity-state get-member("user_arn")
        Action: sts:AssumeRole
  attached_policies:
    - "arn:aws:iam::aws:policy/AmazonS3FullAccess"
  connections:
    assume-user:
      runnable: my-app/assume-user
      service: user
```

### IAM Policy Examples

#### Basic Policy Definition

```yaml
namespace: my-app

s3-read-only-policy:
  defines: aws/iam/iam-policy
  region: us-east-1
  policy_name: S3ReadOnlyAccess
  policy_description: "Allows read-only access to S3 buckets"
  path: "/application/"
  policy_document:
    Version: "2012-10-17"
    Statement:
      - Effect: Allow
        Action:
          - s3:GetObject
          - s3:ListBucket
        Resource:
          - "arn:aws:s3:::my-bucket/*"
          - "arn:aws:s3:::my-bucket"
  tags:
    Environment: production
    Application: my-app
    ManagedBy: monk
```

### Advanced Policy with Conditions

```yaml
namespace: my-app

conditional-s3-policy:
  defines: aws/iam/iam-policy
  region: us-east-1
  policy_name: ConditionalS3Access
  policy_description: "S3 access with IP and time restrictions"
  policy_document:
    Version: "2012-10-17"
    Statement:
      - Effect: Allow
        Action:
          - s3:GetObject
          - s3:PutObject
        Resource:
          - "arn:aws:s3:::secure-bucket/*"
        Condition:
          DateGreaterThan:
            "aws:CurrentTime": "2024-01-01T00:00:00Z"
          IpAddress:
            "aws:SourceIp": ["203.0.113.0/24", "198.51.100.0/24"]
          Bool:
            "aws:SecureTransport": "true"
      - Effect: Deny
        Action: "*"
        Resource: "*"
        Condition:
          DateLessThan:
            "aws:CurrentTime": "2024-01-01T00:00:00Z"
  tags:
    Security: high
    Compliance: required
```

## Configuration Parameters

### IAM User Parameters

#### Required Parameters
- **region**: AWS region for IAM operations
- **user_name**: Name of the IAM user (must be unique within the AWS account)

#### Optional Parameters
- **path**: IAM path for the user (default: "/")
- **permissions_boundary**: ARN of permissions boundary policy
- **tags**: Key-value pairs for resource tagging
- **attached_policy_arns**: List of managed policy ARNs to attach
- **create_access_keys**: Whether to create access keys (default: false)
- **access_key_id_secret_ref**: Secret reference for access key ID
- **secret_access_key_secret_ref**: Secret reference for secret access key

### IAM Policy Parameters

#### Required Parameters
- **region**: AWS region where the policy will be created
- **policy_name**: Name of the IAM policy (must be unique within the AWS account)
- **policy_document**: JSON policy document defining permissions

#### Optional Parameters
- **policy_description**: Human-readable description of the policy
- **path**: IAM path for the policy (default: "/")
- **tags**: Key-value pairs for resource tagging

## Custom Actions

### IAM Policy Actions

#### get-document
Retrieves and displays the current policy document.

```bash
monk do my-app/s3-read-only-policy/get-document
```

#### list-versions
Lists all versions of the policy with creation dates and default version indicator.

```bash
monk do my-app/s3-read-only-policy/list-versions
```

#### list-attachments
Shows all entities (users, groups, roles) that have this policy attached.

```bash
monk do my-app/s3-read-only-policy/list-attachments
```

#### validate
Validates the policy document syntax and simulates policy evaluation.

```bash
monk do my-app/s3-read-only-policy/validate
```

#### set-default-version
Sets a specific policy version as the default.

```bash
monk do my-app/s3-read-only-policy/set-default-version version_id=v2
```

### IAM User Actions

#### get-user-info
Retrieves and displays comprehensive user information including ARN, policies, and access key status.

```bash
monk do my-app/app-user/get-user-info
```

#### get-credentials
Shows credential information and export commands for using the user's access keys.

```bash
monk do my-app/app-user/get-credentials
```

#### list-access-keys
Lists all access keys associated with the user.

```bash
monk do my-app/app-user/list-access-keys
```

#### create-access-keys
Creates new access keys for the user (if not already created).

```bash
monk do my-app/app-user/create-access-keys
```

#### regenerate-access-keys
Deletes existing access keys and creates new ones.

```bash
monk do my-app/app-user/regenerate-access-keys
```

## Policy Versioning

AWS IAM policies support versioning. When you update a policy:

1. **Automatic Versioning**: Updates create a new policy version automatically
2. **Default Version**: The new version becomes the default version
3. **Version Limit**: AWS allows maximum 5 versions per policy
4. **Cleanup**: Non-default versions are automatically cleaned up during deletion

## Building and Testing

### Build the Entity
```bash
# Build all modules including aws/iam
./build.sh

# Build only aws/iam
./build.sh aws/iam
```

### Load the Entity
```bash
# Load the compiled entity
sudo /home/ivan/Work/monk/dist/monk load ./dist/aws/iam/MANIFEST
```

### Run Tests
```bash
# Run integration tests (AWS credentials auto-injected)
sudo INPUT_DIR=./src/aws/iam/ ./monkec.sh test

# Run with verbose output for debugging
sudo INPUT_DIR=./src/aws/iam/ ./monkec.sh test --verbose

# All test configuration is in YAML templates - no .env setup required
```

## AWS Permissions Required

The AWS credentials used must have the following IAM permissions:

### For Policy Management
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreatePolicy",
        "iam:GetPolicy",
        "iam:DeletePolicy",
        "iam:CreatePolicyVersion",
        "iam:GetPolicyVersion",
        "iam:DeletePolicyVersion",
        "iam:ListPolicyVersions",
        "iam:SetDefaultPolicyVersion",
        "iam:ListEntitiesForPolicy",
        "iam:SimulatePrincipalPolicy",
        "iam:ListPolicies"
      ],
      "Resource": "*"
    }
  ]
}
```

### For User Management
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateUser",
        "iam:GetUser",
        "iam:DeleteUser",
        "iam:CreateAccessKey",
        "iam:DeleteAccessKey",
        "iam:ListAccessKeys",
        "iam:UpdateAccessKey",
        "iam:AttachUserPolicy",
        "iam:DetachUserPolicy",
        "iam:ListAttachedUserPolicies",
        "iam:TagUser",
        "iam:UntagUser"
      ],
      "Resource": "*"
    }
  ]
}
```

### For Role Management (if using AssumeRole patterns)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:GetRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:UpdateAssumeRolePolicy",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

## Common Policy Patterns

### Service-Specific Access
```yaml
# EC2 instance management
ec2-admin-policy:
  defines: aws/iam/iam-policy
  policy_name: EC2AdminAccess
  policy_document:
    Version: "2012-10-17"
    Statement:
      - Effect: Allow
        Action:
          - ec2:*
        Resource: "*"
```

### Resource-Specific Access
```yaml
# Specific S3 bucket access
bucket-specific-policy:
  defines: aws/iam/iam-policy
  policy_name: MyBucketAccess
  policy_document:
    Version: "2012-10-17"
    Statement:
      - Effect: Allow
        Action:
          - s3:GetObject
          - s3:PutObject
          - s3:DeleteObject
        Resource:
          - "arn:aws:s3:::my-specific-bucket/*"
```

### Cross-Account Access
```yaml
# Cross-account policy
cross-account-policy:
  defines: aws/iam/iam-policy
  policy_name: CrossAccountAccess
  policy_document:
    Version: "2012-10-17"
    Statement:
      - Effect: Allow
        Action:
          - sts:AssumeRole
        Resource:
          - "arn:aws:iam::ACCOUNT-ID:role/CrossAccountRole"
        Condition:
          StringEquals:
            "aws:RequestedRegion": ["us-east-1", "us-west-2"]
```

## Error Handling

The entity provides comprehensive error handling:

- **AWS API Errors**: Detailed error messages from AWS IAM API
- **Policy Validation**: Syntax and semantic validation of policy documents
- **Existence Checks**: Handles cases where policies already exist or don't exist
- **Permission Errors**: Clear messages for insufficient permissions
- **Rate Limiting**: Appropriate handling of AWS API rate limits

## Limitations

- **Policy Size**: AWS limits policy documents to 6KB
- **Version Count**: Maximum 5 versions per policy
- **Account Limits**: AWS accounts have limits on total policies (usually 1500)
- **Name Uniqueness**: Policy names must be unique within the AWS account

## Implementation Details

- **AWS REST API**: Uses the IAM REST API directly (not SDK)
- **XML Parsing**: Custom XML parsing for IAM API responses
- **Form Encoding**: Proper form encoding for IAM API requests
- **Error Recovery**: Robust error handling and recovery mechanisms
- **State Management**: Proper entity state tracking for lifecycle operations

## See Also

- [AWS IAM API Documentation](https://docs.aws.amazon.com/IAM/latest/APIReference/)
- [IAM Policy Language](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_grammar.html)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) 