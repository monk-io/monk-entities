# AWS Cognito Entity Testing

This directory contains integration tests for the AWS Cognito entities.

## Prerequisites

1. **AWS Credentials**: Ensure you have valid AWS credentials configured
2. **AWS Permissions**: The following IAM permissions are required:
   - `cognito-idp:CreateUserPool`
   - `cognito-idp:DescribeUserPool`
   - `cognito-idp:UpdateUserPool`
   - `cognito-idp:DeleteUserPool`
   - `cognito-idp:ListUserPools`
   - `cognito-idp:AdminCreateUser`
   - `cognito-idp:ListUsers`
   - `cognito-idp:ListUserPoolClients`

3. **Environment Setup**: Copy `env.example` to `.env` and configure as needed

## Running Tests

### Basic Test Run
```bash
# From the monk-entities root directory
sudo INPUT_DIR=./src/aws-cognito/ ./monkec.sh test
```

### Specific Test File
```bash
sudo INPUT_DIR=./src/aws-cognito/ ./monkec.sh test --test-file stack-integration.test.yaml
```

### Verbose Output
```bash
sudo INPUT_DIR=./src/aws-cognito/ ./monkec.sh test --verbose
```

## Test Coverage

The integration tests cover:

### Basic User Pool Tests
- Creation and lifecycle management
- Basic configuration (MFA, password policy, etc.)
- User management (create, list)
- Client listing
- Pool information retrieval

### Advanced User Pool Tests
- Complex configuration with custom attributes
- Strong password policies
- Admin-only user creation
- Device security settings
- Advanced security features

### Update and Cleanup Tests
- Configuration updates
- Proper resource cleanup
- Pre-existing resource protection

## Test Structure

- **`stack-template.yaml`**: Defines test User Pool instances
- **`stack-integration.test.yaml`**: Main integration test suite
- **`env.example`**: Environment variable template
- **`.env`**: Your actual environment configuration (not committed)

## Expected Results

All tests should pass with:
- ✅ User Pool creation and management
- ✅ User creation and listing
- ✅ Configuration updates
- ✅ Custom actions execution
- ✅ Proper cleanup

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure your AWS credentials have the required Cognito permissions
2. **Region Issues**: Verify the AWS region is correct in your configuration
3. **Resource Limits**: AWS has limits on User Pool creation (check your quotas)
4. **Cleanup Failures**: Resources are protected from deletion if they were pre-existing

### Debug Mode

Run tests with verbose output to see detailed step execution:
```bash
sudo INPUT_DIR=./src/aws-cognito/ ./monkec.sh test --verbose
```

### Manual Cleanup

If tests fail and leave resources behind:
```bash
# List User Pools
aws cognito-idp list-user-pools --max-items 60

# Delete specific pool (if created by tests)
aws cognito-idp delete-user-pool --user-pool-id us-east-1_XXXXXXXXX
```

## Security Notes

- Test User Pools are created with secure defaults
- Temporary passwords are auto-generated and stored in Monk's secret vault
- No plaintext passwords are used in configurations
- All test resources are tagged for identification

## Cost Considerations

- AWS Cognito User Pools have a free tier (50,000 MAU)
- Test User Pools created during testing are deleted automatically
- Ensure cleanup completes to avoid unnecessary charges
