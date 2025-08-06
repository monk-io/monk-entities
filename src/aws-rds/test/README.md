# AWS RDS Entity Tests

This directory contains integration tests for the AWS RDS entity.

## Prerequisites

1. **AWS Credentials**: Configure AWS credentials using one of:
   - AWS CLI: `aws configure`
   - Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   - IAM instance profile (if running on EC2)

2. **Required AWS Permissions**: The AWS credentials must have permissions for:
   - `rds:CreateDBInstance`
   - `rds:DescribeDBInstances`
   - `rds:ModifyDBInstance`
   - `rds:DeleteDBInstance`
   - `rds:CreateDBSnapshot`
   - `rds:DescribeDBSnapshots`

3. **Environment Setup**: 
   ```bash
   cp env.example .env
   # Edit .env file if needed
   ```

## Running Tests

### Basic Test Run
```bash
# From the project root
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test
```

### Verbose Output
```bash
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test --verbose
```

### Specific Test File
```bash
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test --test-file stack-integration.test.yaml
```

## Test Structure

### Test Files

- `stack-template.yaml` - Defines test RDS instances (MySQL and PostgreSQL)
- `stack-integration.test.yaml` - Main integration test with lifecycle and custom actions
- `env.example` - Example environment configuration
- `.env` - Your local environment configuration (not committed)

### Test Scenarios

1. **Instance Creation** - Creates MySQL and PostgreSQL RDS instances
2. **Readiness Checks** - Waits for instances to become available
3. **Custom Actions** - Tests all custom actions:
   - `get-instance-info` - Display instance details
   - `get-connection-info` - Show connection information
   - `create-snapshot` - Create database snapshot
4. **Lifecycle Operations** - Tests start, stop, update operations
5. **Cleanup** - Deletes all test instances

## Test Duration

- **Expected Runtime**: 20-30 minutes
- **Timeout**: 30 minutes total
- **Instance Creation**: ~10-15 minutes per instance
- **Instance Deletion**: ~5-10 minutes per instance

## Cost Considerations

⚠️ **Important**: Running these tests will create actual AWS RDS instances that incur costs.

- **Instance Type**: db.t3.micro (Free Tier eligible)
- **Storage**: 20GB (Free Tier eligible)
- **Duration**: Tests run for ~30 minutes
- **Estimated Cost**: $0-2 depending on Free Tier usage

The tests use `skip_final_snapshot: true` and `deletion_protection: false` to minimize costs and ensure cleanup.

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure AWS credentials have RDS permissions
2. **Timeout Issues**: RDS instance creation can take 10-15 minutes
3. **Instance Name Conflicts**: Test uses unique identifiers to avoid conflicts
4. **Network Issues**: Instances are created with `publicly_accessible: false`

### Manual Cleanup

If tests fail to clean up properly:

```bash
# List test instances
aws rds describe-db-instances --query "DBInstances[?contains(DBInstanceIdentifier, 'monkec-test')]"

# Delete manually if needed
aws rds delete-db-instance --db-instance-identifier monkec-test-mysql-db --skip-final-snapshot
aws rds delete-db-instance --db-instance-identifier monkec-test-postgres-db --skip-final-snapshot
```

### Test Logs

Enable verbose output to see detailed operation logs:
```bash
sudo INPUT_DIR=./src/aws-rds/ ./monkec.sh test --verbose
``` 