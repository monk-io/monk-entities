# AWS DynamoDB Entity for Monk

A comprehensive TypeScript entity for managing AWS DynamoDB tables in the Monk orchestrator.

## Features

- **Complete Lifecycle Management**: Create, update, delete, and manage DynamoDB tables
- **Advanced Table Configuration**: Support for GSI, LSI, provisioned/on-demand billing, encryption, and streams
- **Custom Actions**: Built-in actions for data operations (put, get, delete, scan items)
- **Error Handling**: Robust error handling with detailed error messages
- **JSON String Arguments**: Supports complex object arguments passed as JSON strings

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Lifecycle Methods](#lifecycle-methods)
- [Custom Actions](#custom-actions)
- [Examples](#examples)
- [Testing](#testing)
- [AWS Permissions](#aws-permissions)
- [Troubleshooting](#troubleshooting)

## Installation

1. Ensure you have the Monk CLI and Monkec compiler installed
2. Load the entity manifest:
   ```bash
   monk load ./dist/aws-dynamo-db/MANIFEST
   ```

## Quick Start

### Basic Table Definition

```yaml
namespace: my-app
test-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: my-test-table
  attribute_definitions!0:
    AttributeName: id
    AttributeType: S
  key_schema!0:
    AttributeName: id
    KeyType: HASH
  billing_mode: PAY_PER_REQUEST
  tags:
    Environment: production
    Application: my-app
```

### Usage in Stack

```bash
# Deploy the table
monk run my-app/test-table

# Use custom actions
monk do my-app/test-table/put-item --item='{"id":{"S":"test-1"},"name":{"S":"Test Item"}}'
monk do my-app/test-table/get-item --key='{"id":{"S":"test-1"}}'
monk do my-app/test-table/scan-table --limit=10

# Clean up
monk purge my-app/test-table
```

## Configuration

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `region` | string | AWS region for the table |
| `table_name` | string | Name of the DynamoDB table (3-255 chars, alphanumeric, dots, dashes, underscores) |
| `attribute_definitions` | array | Attribute definitions for keys and indexes |
| `key_schema` | array | Primary key schema (hash and optional range key) |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `billing_mode` | string | `PAY_PER_REQUEST` | Billing mode (`PAY_PER_REQUEST` or `PROVISIONED`) |
| `provisioned_throughput` | object | - | Read/write capacity units (required if billing_mode is PROVISIONED) |
| `global_secondary_indexes` | array | - | Global Secondary Indexes configuration |
| `local_secondary_indexes` | array | - | Local Secondary Indexes configuration |
| `deletion_protection_enabled` | boolean | `false` | Enable deletion protection |
| `point_in_time_recovery_enabled` | boolean | `false` | Enable point-in-time recovery |
| `table_class` | string | `STANDARD` | Table class (`STANDARD` or `STANDARD_INFREQUENT_ACCESS`) |
| `sse_specification` | object | - | Server-side encryption configuration |
| `stream_specification` | object | - | DynamoDB Streams configuration |
| `tags` | object | - | Key-value tags for the table |

### Indexed Array Format

Due to Monk's YAML processing, arrays must be specified using indexed notation:

```yaml
# Attribute definitions
attribute_definitions!0:
  AttributeName: id
  AttributeType: S
attribute_definitions!1:
  AttributeName: timestamp
  AttributeType: N

# Key schema
key_schema!0:
  AttributeName: id
  KeyType: HASH
key_schema!1:
  AttributeName: timestamp
  KeyType: RANGE
```

## Lifecycle Methods

### `create()`
Creates the DynamoDB table if it doesn't exist. If the table already exists, adopts it into the entity state.

### `start()`
Waits for the table to reach `ACTIVE` status. Essential for ensuring the table is ready for operations.

### `stop()`
No-op for DynamoDB tables (tables don't have a "stopped" state).

### `update()`
Updates table configuration. Limited to certain properties like billing mode, provisioned throughput, and global secondary indexes.

### `delete()`
Deletes the DynamoDB table. This operation is irreversible.

### `checkReadiness()`
Checks if the table exists and is in `ACTIVE` status.

## Custom Actions

All custom actions expect complex objects (items, keys) to be passed as JSON strings.

### `get-table-details`
Returns detailed information about the table.

```bash
monk do my-app/test-table/get-table-details
```

### `put-item`
Inserts or updates an item in the table.

```bash
monk do my-app/test-table/put-item --item='{"id":{"S":"user123"},"name":{"S":"John Doe"},"age":{"N":"30"}}'
```

### `get-item`
Retrieves an item by its primary key.

```bash
monk do my-app/test-table/get-item --key='{"id":{"S":"user123"}}'
```

### `delete-item`
Deletes an item by its primary key.

```bash
monk do my-app/test-table/delete-item --key='{"id":{"S":"user123"}}'
```

### `scan-table`
Scans the table and returns items (with optional limit).

```bash
monk do my-app/test-table/scan-table
monk do my-app/test-table/scan-table --limit=5
```

### `list-tags`
Lists all tags associated with the table.

```bash
monk do my-app/test-table/list-tags
```

## Backup & Restore Actions

DynamoDB supports two backup mechanisms:
- **Point-in-Time Recovery (PITR)**: Continuous backups with 35-day retention
- **On-Demand Backups**: User-initiated snapshots retained indefinitely

### Backup Actions Quick Reference

| Action | Command | Description |
|--------|---------|-------------|
| **Get Backup Info** | `monk do ns/table/get-backup-info` | View PITR status and recent backups |
| **Create Backup** | `monk do ns/table/create-snapshot` | Create on-demand backup |
| **List Backups** | `monk do ns/table/list-snapshots` | List available backups |
| **Describe Backup** | `monk do ns/table/describe-snapshot` | Get detailed backup info |
| **Delete Backup** | `monk do ns/table/delete-snapshot` | Delete an on-demand backup |
| **Restore** | `monk do ns/table/restore` | Restore to a new table |
| **Check Status** | `monk do ns/table/get-restore-status` | Monitor restore progress |

### `get-backup-info`
View backup configuration including PITR status and recent backups.

```bash
monk do my-app/test-table/get-backup-info
```

### `create-snapshot`
Create an on-demand backup snapshot.

```bash
# Create backup with auto-generated name
monk do my-app/test-table/create-snapshot

# Create backup with custom name
monk do my-app/test-table/create-snapshot backup_name="pre-migration-backup"
```

### `list-snapshots`
List available on-demand backups.

```bash
# List backups (default: 20)
monk do my-app/test-table/list-snapshots

# List more backups
monk do my-app/test-table/list-snapshots limit="50"
```

### `describe-snapshot`
Get detailed information about a specific backup.

```bash
# Using backup ARN
monk do my-app/test-table/describe-snapshot backup_arn="arn:aws:dynamodb:..."

# Using backup ID (extracted from ARN)
monk do my-app/test-table/describe-snapshot snapshot_id="01234567890123-abcdef"
```

### `delete-snapshot`
Delete an on-demand backup.

```bash
monk do my-app/test-table/delete-snapshot backup_arn="arn:aws:dynamodb:..."
```

### `restore`
Restore to a **new table** from backup or point-in-time.

```bash
# Restore from on-demand backup
monk do my-app/test-table/restore backup_arn="arn:aws:dynamodb:..." target_table="restored-table"

# Point-in-time restore to latest
monk do my-app/test-table/restore use_latest="true" target_table="restored-table"

# Point-in-time restore to specific timestamp (ISO format)
monk do my-app/test-table/restore restore_timestamp="2024-12-15T10:30:00Z" target_table="restored-table"

# Point-in-time restore to specific timestamp (Unix seconds)
monk do my-app/test-table/restore restore_timestamp="1702636200" target_table="restored-table"
```

**Important**: DynamoDB restore always creates a **new table**. It does not overwrite the source table.

### `get-restore-status`
Check the status of a restored table.

```bash
monk do my-app/test-table/get-restore-status target_table="restored-table"
```

### Backup Configuration

Enable Point-in-Time Recovery in your table definition:

```yaml
my-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: my-production-table
  # ... key schema ...
  point_in_time_recovery_enabled: true  # Enable PITR (35-day continuous backup)
  deletion_protection_enabled: true      # Prevent accidental deletion
```

### Backup Best Practices

1. **Enable PITR for production tables** - Continuous backups with 35-day retention
2. **Create on-demand backups before major changes** - Migrations, schema updates
3. **Test restore procedures regularly** - Verify you can restore when needed
4. **Use meaningful backup names** - Include date, purpose, or version

## Examples

### Simple Table with Tags

```yaml
namespace: blog
posts-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-west-2
  table_name: blog-posts
  attribute_definitions!0:
    AttributeName: post_id
    AttributeType: S
  key_schema!0:
    AttributeName: post_id
    KeyType: HASH
  billing_mode: PAY_PER_REQUEST
  tags:
    Application: blog
    Environment: production
    Owner: content-team
```

### Table with Composite Key and GSI

```yaml
namespace: analytics
events-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: us-east-1
  table_name: user-events
  
  # Attributes for primary key and GSI
  attribute_definitions!0:
    AttributeName: user_id
    AttributeType: S
  attribute_definitions!1:
    AttributeName: timestamp
    AttributeType: N
  attribute_definitions!2:
    AttributeName: event_type
    AttributeType: S
  
  # Composite primary key
  key_schema!0:
    AttributeName: user_id
    KeyType: HASH
  key_schema!1:
    AttributeName: timestamp
    KeyType: RANGE
  
  # Global Secondary Index for querying by event type
  global_secondary_indexes!0:
    IndexName: EventTypeIndex
    KeySchema!0:
      AttributeName: event_type
      KeyType: HASH
    KeySchema!1:
      AttributeName: timestamp
      KeyType: RANGE
    Projection:
      ProjectionType: ALL
  
  billing_mode: PAY_PER_REQUEST
  
  # Enable streams for real-time processing
  stream_specification:
    StreamEnabled: true
    StreamViewType: NEW_AND_OLD_IMAGES
  
  # Enable encryption
  sse_specification:
    Enabled: true
    SSEType: KMS
  
  tags:
    Application: analytics
    DataClassification: sensitive
```

### Provisioned Table with Full Configuration

```yaml
namespace: ecommerce
orders-table:
  defines: aws-dynamo-db/dynamo-db-table
  region: eu-west-1
  table_name: customer-orders
  
  attribute_definitions!0:
    AttributeName: customer_id
    AttributeType: S
  attribute_definitions!1:
    AttributeName: order_date
    AttributeType: S
  attribute_definitions!2:
    AttributeName: order_status
    AttributeType: S
  
  key_schema!0:
    AttributeName: customer_id
    KeyType: HASH
  key_schema!1:
    AttributeName: order_date
    KeyType: RANGE
  
  billing_mode: PROVISIONED
  provisioned_throughput:
    ReadCapacityUnits: 10
    WriteCapacityUnits: 5
  
  global_secondary_indexes!0:
    IndexName: OrderStatusIndex
    KeySchema!0:
      AttributeName: order_status
      KeyType: HASH
    Projection:
      ProjectionType: KEYS_ONLY
    ProvisionedThroughput:
      ReadCapacityUnits: 5
      WriteCapacityUnits: 5
  
  deletion_protection_enabled: true
  point_in_time_recovery_enabled: true
  
  tags:
    Application: ecommerce
    CriticalData: true
    BackupRequired: true
```

## Testing

The entity includes comprehensive integration tests:

```bash
# Run basic integration tests
sudo INPUT_DIR=./src/aws-dynamo-db/ ./monkec.sh test --test-file stack-integration.test.yaml

# Run advanced tests (GSI, provisioned billing, encryption)
sudo INPUT_DIR=./src/aws-dynamo-db/ ./monkec.sh test --test-file stack-advanced.test.yaml

# Run all tests
sudo INPUT_DIR=./src/aws-dynamo-db/ ./monkec.sh test
```

### Test Coverage

- Table creation and lifecycle management
- Basic and advanced table configurations
- All custom actions (CRUD operations)
- Global and Local Secondary Indexes
- Provisioned and on-demand billing modes
- Encryption and streaming
- Tag management
- Error handling and edge cases

## AWS Permissions

The entity requires the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:UpdateTable",
        "dynamodb:DeleteTable",
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan",
        "dynamodb:Query",
        "dynamodb:ListTagsOfResource",
        "dynamodb:TagResource",
        "dynamodb:UntagResource"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/*",
        "arn:aws:dynamodb:*:*:table/*/index/*"
      ]
    }
  ]
}
```

## Troubleshooting

### Common Issues

**Table creation fails with AccessDeniedException**
- Ensure your AWS credentials have the required DynamoDB permissions
- Check that the IAM policy includes all necessary actions
- Verify the table name follows AWS naming conventions

**Complex object arguments not working**
- Ensure complex objects (items, keys) are passed as JSON strings
- Use proper DynamoDB attribute value format: `{"id":{"S":"value"}}`
- Escape quotes properly in command line: `--item='{"id":{"S":"test"}}'`

**GSI creation fails**
- Verify all GSI attributes are defined in `attribute_definitions`
- Check that KeySchema within GSI uses the indexed array format
- Ensure ProjectionType is one of: `ALL`, `KEYS_ONLY`, `INCLUDE`

**Table not ready errors**
- The `start()` method waits for table to become ACTIVE
- Large tables or tables with GSI may take several minutes to become ready
- Monitor AWS console for table creation progress

### Error Messages

The entity provides detailed error messages for common issues:

- **Table creation failures**: Includes specific AWS error type and message
- **Invalid JSON**: Clear indication when item/key JSON is malformed
- **Missing required fields**: Validation errors with specific field names
- **AWS API errors**: Full error details including request ID for AWS support

### Debugging

For debugging issues:

1. **Check table status**: Use `get-table-details` action
2. **Verify permissions**: Ensure IAM policies are correctly applied
3. **Test connectivity**: Verify AWS credentials and region settings
4. **Monitor AWS console**: Check DynamoDB console for table state and errors

## State Management

The entity maintains minimal state:

- `table_name`: The actual table name in AWS
- `table_arn`: The table's ARN for tagging and permissions
- `table_status`: Current table status (CREATING, ACTIVE, etc.)
- `existing`: Whether the table existed before entity creation

All other table information is retrieved dynamically from AWS APIs.

## Best Practices

1. **Use PAY_PER_REQUEST billing** for most use cases unless you have predictable traffic
2. **Enable point-in-time recovery** for production tables
3. **Use encryption** for sensitive data
4. **Tag your tables** appropriately for cost allocation and management
5. **Design your key schema carefully** - it cannot be changed after creation
6. **Plan your GSI requirements** upfront - adding them later requires table updates
7. **Use descriptive table names** that include environment and application identifiers

## Contributing

When contributing to this entity:

1. Follow the existing code style and patterns
2. Add comprehensive tests for new functionality
3. Update documentation for any new features
4. Ensure all tests pass before submitting changes
5. Test against real AWS infrastructure when possible

## Version History

- **v1.0.0**: Initial release with full DynamoDB table lifecycle management
- Support for basic and advanced table configurations
- Complete set of custom actions for data operations
- Comprehensive integration tests
- JSON string argument support for complex objects 