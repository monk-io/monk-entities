# AWS IAM Policy Entity Testing

This directory contains comprehensive tests for the AWS IAM Policy entity.

## Test Setup

1. **AWS Credentials**
   - AWS credentials are automatically injected into the builtin `aws` module
   - No manual credential configuration required
   - Ensure your AWS credentials have the required IAM permissions (see below)

2. **Environment Configuration (Optional)**
   ```bash
   # Copy the environment template if you need test-specific secrets
   cp test/env.example test/.env
   
   # Edit .env only for sensitive test data (if any)
   vim test/.env
   ```

3. **Required AWS Permissions**
   Your AWS credentials must have the following IAM permissions:
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
           "iam:SimulatePrincipalPolicy"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

## Running Tests

### Build and Test
```bash
# Build the entity
./build.sh aws/iam

# Load the compiled entity
sudo /home/ivan/Work/monk/dist/monk load ./dist/aws/iam/MANIFEST

# Run tests
sudo INPUT_DIR=./src/aws/iam/ ./monkec.sh test

# Run with verbose output
sudo INPUT_DIR=./src/aws/iam/ ./monkec.sh test --verbose

# Run specific test file
sudo INPUT_DIR=./src/aws/iam/ ./monkec.sh test --test-file test/stack-integration.test.yaml

# Watch mode for development
sudo INPUT_DIR=./src/aws/iam/ ./monkec.sh test --watch
```

## Test Structure

### Stack Template (`stack-template.yaml`)
Defines a test IAM policy with:
- S3 bucket permissions (GetObject, PutObject, ListBucket)
- CloudWatch Logs permissions for testing
- Conditional access based on object prefixes
- Test tags and metadata
- All configuration is directly in YAML (no environment variables needed)

### Integration Test (`stack-integration.test.yaml`)
Comprehensive test suite covering:
- **Creation**: Policy creation and readiness verification
- **Actions**: Testing all custom actions (get-document, list-versions, etc.)
- **Updates**: Policy version management
- **Cleanup**: Proper resource deletion

### Test Actions Covered
1. **get-document**: Retrieves and displays the policy document
2. **list-versions**: Shows all policy versions with default indicator
3. **list-attachments**: Displays entities attached to the policy
4. **validate**: Validates the policy document
5. **set-default-version**: Changes the default policy version

## Test Scenarios

### Basic Lifecycle
1. Create IAM policy with test configuration
2. Verify policy exists and is ready
3. Test policy document retrieval
4. Update policy (creates new version)
5. Clean up resources

### Advanced Features
- Policy version management
- Policy validation
- Attachment tracking
- Error handling and recovery

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Verify your AWS credentials have required IAM permissions
   - AWS credentials are automatically injected - no manual setup needed
   - Check if testing account has policy creation limits

2. **Policy Already Exists**
   - Tests handle existing policies by importing them
   - Policy names are defined directly in stack-template.yaml
   - Use unique policy names if conflicts occur

3. **Rate Limiting**
   - AWS IAM has rate limits for API calls
   - Test includes appropriate delays between operations

4. **Policy Version Limits**
   - AWS allows maximum 5 policy versions
   - Tests clean up non-default versions during deletion

5. **Environment Variables**
   - Entity parameters are directly in YAML template
   - .env file only needed for actual secrets (rare for this entity)
   - AWS credentials are automatically available

### Debug Commands
```bash
# Check entity state
sudo /home/ivan/Work/monk/dist/monk describe aws-iam-test/test-iam-policy

# View entity logs
sudo /home/ivan/Work/monk/dist/monk logs aws-iam-test/test-iam-policy

# Test specific action
sudo /home/ivan/Work/monk/dist/monk do aws-iam-test/test-iam-policy/get-document
```

## Test Data

The test uses a comprehensive IAM policy that:
- Allows S3 operations (GetObject, PutObject, ListBucket) on test bucket
- Allows CloudWatch Logs operations for testing
- Includes conditional access based on object prefixes
- Uses proper IAM policy structure with SIDs and versioning
- All parameters defined directly in stack-template.yaml

This provides a realistic test scenario while being safe for testing environments and requires no external configuration. 