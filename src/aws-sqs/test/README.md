# AWS SQS Queue Entity Testing

This directory contains comprehensive integration tests for the AWS SQS Queue TypeScript entity, including queue lifecycle management, custom actions testing, and message operations.

## Prerequisites

1. **AWS Account**: You need an AWS account with SQS access
2. **AWS Credentials**: AWS credentials configured for the Monk runtime
3. **SQS Permissions**: Ensure your AWS credentials have the following SQS permissions:
   - `sqs:CreateQueue`
   - `sqs:DeleteQueue` (Note: Currently has permission issues in test environment)
   - `sqs:GetQueueUrl`
   - `sqs:GetQueueAttributes`
   - `sqs:SetQueueAttributes`
   - `sqs:SendMessage`
   - `sqs:ReceiveMessage`
   - `sqs:PurgeQueue`
   - `sqs:TagQueue`
   - `sqs:UntagQueue`
   - `sqs:ListQueueTags`

## Test Coverage

### Core Entity Lifecycle
- ✅ Queue creation and deployment
- ✅ Queue readiness verification  
- ✅ Queue deletion (with permission caveats)

### Custom Actions Testing
- ✅ **get-queue-information-and-attributes** - Retrieve queue configuration
- ✅ **get-queue-statistics-and-metrics** - Get queue performance metrics
- ✅ **send-a-test-message-to-the-queue** - Send test messages
- ✅ **receive-messages-from-the-queue** - Receive and process messages
- ✅ **list-queue-tags** - List queue metadata tags
- ✅ **set-queue-tags** - Set queue metadata tags
- ✅ **purge-all-messages-from-the-queue** - Clear all queue messages

### Advanced Scenarios
- ✅ Multiple message operations
- ✅ Queue statistics after message operations
- ✅ Message purging and cleanup

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
sudo INPUT_DIR=./src/aws-sqs/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/aws-sqs/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/aws-sqs/ ./monkec.sh test --test-file stack-integration.test.yaml

# Test FIFO queue specifically
sudo INPUT_DIR=./src/aws-sqs/ ./monkec.sh test --test-file fifo-integration.test.yaml
```

## Test Configuration

### Queue Configuration
The test uses a standard SQS queue with the following configuration:
- **Queue Name**: `test-sqs-queue`
- **Region**: `us-east-1`
- **Message Retention**: 4 days (345600 seconds)
- **Visibility Timeout**: 30 seconds
- **Receive Wait Time**: 20 seconds (long polling)
- **SSE**: SQS-managed encryption enabled
- **FIFO**: Disabled (standard queue)

### Known Issues

1. **Delete Queue Permissions**: The test environment AWS user (`monk-deployer`) currently lacks `sqs:deletequeue` permission, so queue deletion during cleanup may fail. This is expected and the test should still pass.

2. **Queue Persistence**: Failed deletions may leave test queues in AWS. Manual cleanup may be required.

## Expected Results

✅ **All tests should pass** with the following outcomes:
- Queue creation and deployment: SUCCESS
- All 7 custom actions: SUCCESS  
- Message operations: SUCCESS
- Queue statistics: SUCCESS
- Final cleanup: May show permission warnings but should complete

## Troubleshooting

### Common Issues

1. **AWS Credentials**: Ensure AWS credentials are properly configured
2. **Permissions**: Verify SQS permissions are granted to your AWS user
3. **Region**: Ensure the test region (`us-east-1`) is accessible
4. **Timeouts**: Increase timeout if needed for slower AWS responses

 