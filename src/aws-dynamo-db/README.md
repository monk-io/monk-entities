# AWS DynamoDB Entity for Monk Orchestrator

This directory contains a production-ready AWS DynamoDB entity implementation for the Monk orchestrator platform. The entity provides complete lifecycle management for DynamoDB tables including creation, updates, deletion, readiness checks, and comprehensive table management operations.

## 🎯 Status: Production Ready ✅

- ✅ **Fully Functional**: All lifecycle operations and custom actions working
- ✅ **Comprehensive Testing**: Complete integration test suite
- ✅ **All Table Types**: Full support for standard tables, GSI, LSI, and advanced configurations
- ✅ **AWS Compatible**: Successfully tested with AWS DynamoDB service
- ✅ **Zero Issues**: All compilation and runtime issues resolved

## Architecture

The AWS DynamoDB entity follows the established Monk entity pattern with three main components:

### Core Files

- **`base.ts`**: Contains the `AWSDynamoDBEntity` base class that provides common functionality for DynamoDB operations
  - AWS API integration using the built-in `aws` module
  - Core DynamoDB operations (create, delete, describe, etc.)
  - Table state management
  - Error handling and logging

- **`common.ts`**: Contains shared utilities and interfaces
  - Table schema type definitions
  - Validation functions for table names and configurations
  - Helper functions for data format conversion
  - Default configurations for different table types

- **`table.ts`**: Main DynamoDB table entity implementation
  - Extends `AWSDynamoDBEntity` base class
  - Implements lifecycle methods: create, start, stop, update, delete, checkReadiness
  - Provides custom actions for table management
  - Handles advanced DynamoDB features like GSI, LSI, encryption, and streams

## Entity Usage

### Basic Table with Pay-Per-Request Billing

```yaml
simple-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: simple-example-table
  attribute_definitions:
    - AttributeName: id
      AttributeType: S
  key_schema:
    - AttributeName: id
      KeyType: HASH
  billing_mode: PAY_PER_REQUEST
  tags:
    Environment: production
    Owner: my-team
```

### Table with Composite Key and Provisioned Billing

```yaml
user-posts-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: user-posts-example
  attribute_definitions:
    - AttributeName: user_id
      AttributeType: S
    - AttributeName: post_timestamp
      AttributeType: N
  key_schema:
    - AttributeName: user_id
      KeyType: HASH
    - AttributeName: post_timestamp
      KeyType: RANGE
  billing_mode: PROVISIONED
  provisioned_throughput:
    ReadCapacityUnits: 5
    WriteCapacityUnits: 5
  sse_specification:
    Enabled: true
    SSEType: AES256
  point_in_time_recovery_enabled: true
  tags:
    Environment: production
    Purpose: user-content
```

### Advanced Table with Global Secondary Index

```yaml
analytics-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: analytics-example
  attribute_definitions:
    - AttributeName: event_id
      AttributeType: S
    - AttributeName: timestamp
      AttributeType: N
    - AttributeName: user_type
      AttributeType: S
  key_schema:
    - AttributeName: event_id
      KeyType: HASH
    - AttributeName: timestamp
      KeyType: RANGE
  billing_mode: PAY_PER_REQUEST
  global_secondary_indexes:
    - IndexName: UserTypeIndex
      KeySchema:
        - AttributeName: user_type
          KeyType: HASH
        - AttributeName: timestamp
          KeyType: RANGE
      Projection:
        ProjectionType: ALL
  stream_specification:
    StreamEnabled: true
    StreamViewType: NEW_AND_OLD_IMAGES
  tags:
    Environment: production
    Purpose: analytics
```

## Configuration Options

### Required Parameters

- `region`: AWS region where the table will be created
- `table_name`: Name of the DynamoDB table (must follow AWS naming rules)
- `attribute_definitions`: Array of attribute definitions for the table
- `key_schema`: Array defining the hash and range keys

### Optional Parameters

- `billing_mode`: Table billing mode ("PROVISIONED" or "PAY_PER_REQUEST", default: "PAY_PER_REQUEST")
- `provisioned_throughput`: Read/write capacity units (required if billing_mode is PROVISIONED)
- `global_secondary_indexes`: Array of global secondary index definitions
- `local_secondary_indexes`: Array of local secondary index definitions
- `sse_specification`: Server-side encryption configuration
- `stream_specification`: DynamoDB stream configuration
- `table_class`: Table class ("STANDARD" or "STANDARD_INFREQUENT_ACCESS")
- `deletion_protection_enabled`: Enable deletion protection (boolean)
- `point_in_time_recovery_enabled`: Enable point-in-time recovery (boolean)
- `tags`: Resource tags as key-value pairs

## Entity State

The entity maintains minimal state information for optimal performance:

- `table_name`: The table name
- `table_arn`: The table ARN
- `table_status`: Current table status
- `existing`: Whether the table existed before creation

**Note**: Other information such as table attributes, timestamps, item counts, and detailed configurations are fetched via API calls when needed, following the principle of storing only essential state data.

## Custom Actions

The entity provides several custom actions for table management:

- `getTableDetails()`: Retrieve current table information and configuration
- `putItem(item)`: Add an item to the table
- `getItem(key)`: Retrieve an item from the table by key
- `deleteItem(key)`: Remove an item from the table
- `scanTable(limit?)`: Scan the table and return items
- `listTags()`: List all tags associated with the table

## Implementation Features

### ✅ Completed Features

- **Full Entity Implementation**: Complete AWS DynamoDB entity with all lifecycle operations
- **Base Architecture**: Robust `AWSDynamoDBEntity` base class with AWS integration using built-in `aws` module
- **Common Utilities**: Comprehensive shared utilities and type definitions
- **Table Lifecycle Management**: Full support for create, start, stop, update, delete, and checkReadiness operations
- **Advanced DynamoDB Features**: Complete support for GSI, LSI, encryption, streams, and point-in-time recovery
- **Configuration Validation**: Comprehensive validation for table names, billing modes, and configurations
- **Optimized State Management**: Minimal state storage with dynamic API-based data retrieval
- **Custom Actions**: Six fully functional custom actions for table management
- **JSON Response Parsing**: Proper parsing of AWS DynamoDB JSON API responses
- **Error Handling**: Comprehensive error handling with detailed logging
- **Array Field Handling**: Custom logic to handle Monk's indexed array format
- **Integration Tests**: Complete test suite with various table configurations
- **Example Configurations**: Multiple real-world configuration examples
- **Documentation**: Comprehensive documentation and usage examples

### Key Technical Achievements

1. **Array Field Processing**: Successfully implemented custom logic to handle Monk's indexed field format (`field!0`, `field!1`, etc.) for array data
2. **AWS API Integration**: Seamless integration with AWS DynamoDB API using the built-in `aws` module
3. **Comprehensive Validation**: Full validation of table configurations, names, and billing modes
4. **Error Handling**: Robust error handling with detailed AWS API error reporting
5. **State Optimization**: Minimal state storage design for optimal performance

## Development Notes

### Array Field Handling

This entity includes custom logic to handle Monk's indexed array format. DynamoDB configuration arrays like `attribute_definitions` and `key_schema` are passed from Monk templates as indexed fields (`attribute_definitions!0`, `key_schema!0`, etc.). The entity includes the `extractArrayFromIndexedFields()` utility method to convert these back to proper arrays for AWS API calls.

### AWS API Usage

The entity uses the built-in `aws` module for all API calls, which automatically handles AWS credentials and request signing. All requests are made to the DynamoDB JSON API endpoint with proper headers and request formatting.

### Validation Strategy

The entity performs comprehensive validation of all configuration parameters before making AWS API calls, ensuring early detection of configuration errors and providing clear error messages.

## Getting Started

1. **Load the Entity**: Load the compiled entity into Monk
   ```bash
   monk load ./dist/aws-dynamo-db/MANIFEST
   ```

2. **Create a Template**: Define your DynamoDB table configuration
   ```yaml
   my-table:
     defines: aws-dynamo-db/dynamo-db-table
     region: us-east-1
     table_name: my-table
     # ... configuration options
   ```

3. **Deploy**: Run the entity to create your DynamoDB table
   ```bash
   monk run my-namespace/my-table
   ```

## Examples

See the [example.yaml](./example.yaml) file for comprehensive usage examples including:
- Simple tables with pay-per-request billing
- Tables with composite keys and provisioned billing
- Advanced tables with Global Secondary Indexes
- Tables with encryption and streams

## Best Practices

1. **Use Pay-Per-Request**: For most use cases, use `PAY_PER_REQUEST` billing mode for simplicity
2. **Plan Your Keys**: Design your primary key and GSI carefully for optimal query patterns
3. **Enable Encryption**: Always enable server-side encryption for production data
4. **Use Point-in-Time Recovery**: Enable PITR for critical tables
5. **Tag Your Resources**: Use consistent tagging for resource management
6. **Monitor Costs**: Use appropriate table classes and billing modes for your workload

## API Reference

- [AWS DynamoDB CreateTable API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_CreateTable.html)
- [AWS DynamoDB UpdateTable API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateTable.html)
- [AWS DynamoDB DescribeTable API](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DescribeTable.html) 