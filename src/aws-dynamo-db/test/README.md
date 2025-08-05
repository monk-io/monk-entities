# AWS DynamoDB Table Entity Testing

This directory contains comprehensive integration tests for the AWS DynamoDB Table TypeScript entity, including table lifecycle management, custom actions testing, and item operations.

## Prerequisites

1. **AWS Account**: You need an AWS account with DynamoDB access
2. **AWS Credentials**: AWS credentials configured for the Monk runtime
3. **DynamoDB Permissions**: Ensure your AWS credentials have the following DynamoDB permissions:
   - `dynamodb:CreateTable`
   - `dynamodb:DeleteTable`
   - `dynamodb:DescribeTable`
   - `dynamodb:UpdateTable`
   - `dynamodb:PutItem`
   - `dynamodb:GetItem`
   - `dynamodb:DeleteItem`
   - `dynamodb:Scan`
   - `dynamodb:UpdateContinuousBackups`
   - `dynamodb:TagResource`
   - `dynamodb:UntagResource`
   - `dynamodb:ListTagsOfResource`

## Test Coverage

### Core Entity Lifecycle
- ✅ Table creation and deployment
- ✅ Table readiness verification  
- ✅ Table deletion and cleanup

### Custom Actions Testing
- ✅ **get-table-details** - Retrieve table configuration and status
- ✅ **put-item** - Add items to the table
- ✅ **get-item** - Retrieve items from the table by key
- ✅ **delete-item** - Remove items from the table
- ✅ **scan-table** - Scan the table and retrieve items
- ✅ **list-tags** - List table metadata tags

### Advanced Scenarios
- ✅ Multiple item operations (put, get, delete)
- ✅ Table scanning with item count verification
- ✅ Tag management operations
- ✅ Error handling for missing items

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
sudo INPUT_DIR=./src/aws-dynamo-db/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/aws-dynamo-db/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/aws-dynamo-db/ ./monkec.sh test --test-file stack-integration.test.yaml
```

## Test Configuration

### Table Configuration
The test uses a standard DynamoDB table with the following configuration:
- **Table Name**: `monk-test-dynamodb`
- **Region**: `us-east-1`
- **Primary Key**: `id` (String, Hash key)
- **Billing Mode**: Pay-per-request
- **Tags**: Environment=test, Purpose=integration-testing, Owner=monk-framework

### Test Data
The integration tests use the following test items:
- **Test Item 1**: `{"id": {"S": "test-item-1"}, "name": {"S": "Test Item One"}, "value": {"N": "100"}}`
- **Test Item 2**: `{"id": {"S": "test-item-2"}, "name": {"S": "Test Item Two"}, "value": {"N": "200"}}`

## Expected Results

✅ **All tests should pass** with the following outcomes:
- Table creation and deployment: SUCCESS
- All 6 custom actions: SUCCESS  
- Item operations (put, get, delete): SUCCESS
- Table scanning: SUCCESS
- Tag operations: SUCCESS
- Final cleanup: SUCCESS

## Test Scenarios

### 1. Table Lifecycle
- Create table with specified configuration
- Wait for table to reach ACTIVE status
- Verify table properties and configuration

### 2. Item Operations
- Put multiple test items into the table
- Retrieve items by primary key
- Verify item data integrity
- Delete items and verify removal

### 3. Table Operations
- Scan table to retrieve all items
- Verify item counts and data
- Test table information retrieval

### 4. Tag Management
- List existing table tags
- Verify tag configuration from template

### 5. Error Handling
- Test retrieval of non-existent items
- Verify proper error responses

## Known Considerations

1. **Table Creation Time**: DynamoDB table creation can take several seconds. The test includes appropriate wait times.

2. **Eventually Consistent Reads**: Some operations may experience eventual consistency delays, which is normal for DynamoDB.

3. **Item Format**: DynamoDB uses attribute value format (`{"S": "string"}`, `{"N": "number"}`) for items.

## Troubleshooting

### Common Issues

1. **AWS Credentials**: Ensure AWS credentials are properly configured
2. **Permissions**: Verify DynamoDB permissions are granted to your AWS user
3. **Region**: Ensure the test region (`us-east-1`) is accessible
4. **Timeouts**: Increase timeout if needed for slower DynamoDB responses
5. **Table Limits**: Ensure your AWS account doesn't have DynamoDB table limits reached

### Debug Information

The integration tests include detailed logging to help diagnose issues:
- Table creation and status updates
- Item operation results
- API response details
- Error messages with context

## Cleanup

The test includes automatic cleanup that:
- Deletes all test items created during testing
- Removes the test table (if not pre-existing)
- Cleans up any test resources

Manual cleanup may be required if tests are interrupted:
```bash
# Manual table deletion if needed
aws dynamodb delete-table --table-name monk-test-dynamodb --region us-east-1
``` 