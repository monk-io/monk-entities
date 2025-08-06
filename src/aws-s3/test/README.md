# AWS S3 Bucket Entity Testing

This directory contains comprehensive integration tests for the AWS S3 Bucket TypeScript entity, including bucket lifecycle management, custom actions testing, and object operations.

## Prerequisites

1. **AWS Account**: You need an AWS account with S3 access
2. **AWS Credentials**: AWS credentials configured for the Monk runtime
3. **S3 Permissions**: Ensure your AWS credentials have the following S3 permissions:
   - `s3:CreateBucket`
   - `s3:DeleteBucket`
   - `s3:ListBucket`
   - `s3:HeadBucket`
   - `s3:GetBucketLocation`
   - `s3:GetBucketVersioning`
   - `s3:PutBucketVersioning`
   - `s3:GetBucketCors`
   - `s3:PutBucketCors`
   - `s3:GetBucketLifecycleConfiguration`
   - `s3:PutBucketLifecycleConfiguration`
   - `s3:GetBucketEncryption`
   - `s3:PutBucketEncryption`
   - `s3:GetBucketTagging`
   - `s3:PutBucketTagging`
   - `s3:GetBucketPublicAccessBlock`
   - `s3:PutBucketPublicAccessBlock`
   - `s3:GetObject`
   - `s3:PutObject`
   - `s3:DeleteObject`
   - `s3:ListMultipartUploads`

## Test Coverage

### Core Entity Lifecycle
- ✅ Bucket creation and deployment
- ✅ Bucket readiness verification  
- ✅ Bucket configuration (versioning, CORS, encryption)
- ✅ Bucket deletion

### Custom Actions Testing
- ✅ **get-bucket-info** - Retrieve bucket configuration and status
- ✅ **list-objects** - List and display bucket objects
- ✅ **generate-presigned-url** - Generate presigned URLs for object access
- ✅ **get-bucket-statistics** - Get bucket size and object statistics
- ✅ **empty-bucket** - Delete all objects from bucket

### Advanced Scenarios
- ✅ Basic bucket (standard configuration)
- ✅ Versioned bucket with CORS configuration
- ✅ Bucket with lifecycle rules and encryption
- ✅ Object operations and statistics
- ✅ Presigned URL generation for different methods

### Known Limitations
- **Bucket Tags**: Setting bucket tags requires AWS checksum headers (Content-MD5 or x-amz-checksum-*) which are not currently implemented due to runtime module limitations. Tags will show warnings but won't prevent bucket creation.
- **Object Deletion**: Individual object deletion may fail due to AWS permissions (403 Forbidden), which is expected in test environments.

## Setup

### Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env
```

Edit `.env` with your actual values (currently minimal configuration required):

```bash
# Optional: Test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=300000
```

## Running Tests

### Basic Testing

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/aws-s3/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/aws-s3/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/aws-s3/ ./monkec.sh test --test-file stack-integration.test.yaml
```

## Test Configuration

### Bucket Configurations
The test uses multiple S3 buckets with different configurations:

1. **Basic Bucket**: `test-s3-basic-bucket`
   - **Region**: `us-east-1`
   - **Versioning**: Disabled
   - **Public Access**: Blocked
   - **Basic configuration for testing core functionality**

2. **Versioned Bucket**: `test-s3-versioned-bucket`
   - **Region**: `us-east-1`
   - **Versioning**: Enabled
   - **CORS**: Configured for web access
   - **Public Access**: Blocked

3. **Advanced Bucket**: `test-s3-advanced-bucket`
   - **Region**: `us-east-1`
   - **Versioning**: Enabled
   - **Lifecycle Rules**: 30-day transition to IA, 90-day to Glacier
   - **Server-Side Encryption**: AES256
   - **Public Access**: Blocked

### Known Issues

1. **Bucket Tagging**: The test environment may show warnings when setting bucket tags due to AWS checksum requirements. This is expected and documented.

2. **Object Deletion**: The `empty-bucket` action may show 403 Forbidden errors when attempting to delete test objects. This is due to AWS permissions and doesn't indicate a code failure.

3. **Bucket Persistence**: Test buckets may persist in AWS if deletion fails. Manual cleanup may be required.

## Expected Results

✅ **All tests should pass** with the following outcomes:
- Bucket creation and deployment: SUCCESS
- All 5 custom actions: SUCCESS  
- Object operations: SUCCESS (with expected permission warnings)
- Bucket statistics: SUCCESS
- Final cleanup: Should complete successfully

## Troubleshooting

### Common Issues

1. **AWS Credentials**: Ensure AWS credentials are properly configured
2. **Permissions**: Verify S3 permissions are granted to your AWS user
3. **Region**: Ensure the test region (`us-east-1`) is accessible
4. **Bucket Names**: S3 bucket names must be globally unique. Test names include random suffixes to avoid conflicts
5. **Timeouts**: Increase timeout if needed for slower AWS responses

### Debug Commands

```bash
# Check Monk entity status
sudo /home/ivan/Work/monk/dist/monk ps -a

# Describe specific bucket entity
sudo /home/ivan/Work/monk/dist/monk describe aws-s3-test/test-basic-bucket

# Test individual custom actions
sudo /home/ivan/Work/monk/dist/monk do aws-s3-test/test-basic-bucket/get-bucket-info
sudo /home/ivan/Work/monk/dist/monk do aws-s3-test/test-basic-bucket/list-objects
sudo /home/ivan/Work/monk/dist/monk do aws-s3-test/test-basic-bucket/get-bucket-statistics

# Generate presigned URLs
sudo /home/ivan/Work/monk/dist/monk do aws-s3-test/test-basic-bucket/generate-presigned-url object_key=test.txt method=GET expires=3600
```

### Manual Cleanup

If test cleanup fails, you can manually delete test buckets:

```bash
# Purge and delete test stack
sudo /home/ivan/Work/monk/dist/monk purge --force aws-s3-test/stack
```

## Performance Notes

- **Bucket Operations**: S3 bucket operations are generally fast (< 5 seconds)
- **Object Operations**: Listing objects and statistics depend on bucket contents
- **Presigned URLs**: Generated instantly without AWS API calls
- **Regional Delays**: Operations in different AWS regions may have additional latency 