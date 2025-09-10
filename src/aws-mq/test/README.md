# AWS MQ Entity Integration Tests

This directory contains comprehensive integration tests for the AWS MQ entity using the Monk testing framework.

## Prerequisites

### AWS Permissions

The tests require the following AWS IAM permissions:

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
                "ec2:DescribeVpcs",
                "ec2:DescribeSubnets",
                "logs:CreateLogGroup",
                "logs:DescribeLogGroups"
            ],
            "Resource": "*"
        }
    ]
}
```

### AWS Configuration

Ensure your AWS credentials are configured:

```bash
# Option 1: AWS CLI
aws configure

# Option 2: Environment variables
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"

# Option 3: IAM roles (recommended for EC2/containers)
# Attach appropriate IAM role to your compute instance
```

### Environment Setup

1. **Copy environment template:**
   ```bash
   cp env.example .env
   ```

2. **Configure test settings (optional):**
   ```bash
   # Edit .env file
   TEST_TIMEOUT=1800000
   MONKEC_VERBOSE=true
   ```

## Running Tests

### Basic Test Execution

```bash
# From the repository root
sudo INPUT_DIR=./src/aws-mq/ ./monkec.sh test

# With verbose output for debugging
sudo INPUT_DIR=./src/aws-mq/ ./monkec.sh test --verbose

# Run specific test file
sudo INPUT_DIR=./src/aws-mq/ ./monkec.sh test --test-file stack-integration.test.yaml
```

### Expected Test Behavior

The integration test will:

1. **Setup Phase** (~2 minutes):
   - Load compiled AWS MQ entity
   - Load test stack template
   - Set up required secrets

2. **Broker Creation** (~5-15 minutes):
   - Create new ActiveMQ broker OR detect existing broker
   - Wait for broker to reach RUNNING state
   - Verify broker configuration

3. **Custom Actions Testing** (~2 minutes):
   - Test `get-broker-info` action
   - Test `get-connection-info` action
   - Test `reboot-broker` action

4. **Lifecycle Testing** (~5-10 minutes):
   - Test stop/start operations
   - Verify broker state management
   - Test update operations

5. **Cleanup Phase** (~2-5 minutes):
   - Delete test broker (if created by test)
   - Clean up resources

**Total Expected Duration:** 15-35 minutes depending on AWS region and existing resources.

## Test Files

- **`stack-template.yaml`** - Defines test broker configuration
- **`stack-integration.test.yaml`** - Main integration test suite
- **`env.example`** - Environment variables template
- **`README.md`** - This documentation file

## Test Configuration

### Broker Configuration

The test creates a basic ActiveMQ broker with:
- **Engine:** ActiveMQ 5.18
- **Instance Type:** mq.t3.micro (free tier eligible)
- **Deployment:** Single instance
- **Users:** Test admin and user accounts
- **Security:** Publicly accessible with default security groups

### Secrets Management

The test automatically manages required secrets:
- `test-mq-admin-password` - Admin user password
- `test-mq-user-password` - Regular user password

Passwords must be 16+ characters as required by AWS MQ.

## Troubleshooting

### Common Issues

1. **Permission Denied Errors:**
   ```
   Error: User: arn:aws:iam::123456789012:user/test-user is not authorized to perform: mq:CreateBroker
   ```
   **Solution:** Add required IAM permissions (see prerequisites above)

2. **Broker Already Exists:**
   ```
   ConflictException: Broker with name 'test-activemq-basic' already exists
   ```
   **Solution:** The entity handles existing brokers automatically. This is expected behavior.

3. **Timeout During Broker Creation:**
   ```
   Timeout waiting for broker readiness
   ```
   **Solution:** Increase timeout in test configuration or check AWS service status.

4. **Quota Exceeded:**
   ```
   LimitExceededException: Maximum number of brokers exceeded
   ```
   **Solution:** Delete unused brokers or request quota increase from AWS.

### Debug Information

**Enable verbose output:**
```bash
sudo INPUT_DIR=./src/aws-mq/ ./monkec.sh test --verbose
```

**Check entity logs:**
```bash
# During test execution
sudo /home/ivan/Work/monk/dist/monk logs -f aws-mq-test/test-activemq-broker
```

**Inspect entity state:**
```bash
# During test execution
sudo /home/ivan/Work/monk/dist/monk describe aws-mq-test/test-activemq-broker
```

### Manual Cleanup

If tests fail and leave resources behind:

```bash
# Delete test broker manually
sudo /home/ivan/Work/monk/dist/monk delete --force aws-mq-test/test-activemq-broker

# Clean up any remaining AWS resources via AWS Console:
# 1. Go to Amazon MQ console
# 2. Find and delete any test brokers (name: test-activemq-basic)
# 3. Check CloudWatch logs for any remaining log groups
```

## AWS Costs

The test uses AWS free tier eligible resources when possible:
- **mq.t3.micro instance** - Free tier: 750 hours/month
- **Data transfer** - Minimal during testing
- **CloudWatch logs** - First 5GB/month free

**Estimated cost per test run:** $0.00 - $0.10 USD (depending on usage and region)

## Best Practices

1. **Run tests in development AWS account** - Avoid running in production
2. **Monitor AWS costs** - Set up billing alerts
3. **Clean up regularly** - Delete test resources after testing
4. **Use consistent naming** - All test resources use predictable names
5. **Check quotas** - Ensure adequate AWS service quotas before testing

## Integration with CI/CD

Example GitHub Actions workflow:

```yaml
name: AWS MQ Entity Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
          
      - name: Run AWS MQ entity tests
        run: |
          sudo INPUT_DIR=./src/aws-mq/ ./monkec.sh test
```

**Required GitHub Secrets:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`