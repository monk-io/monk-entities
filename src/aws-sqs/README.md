# AWS SQS Entity for Monk Orchestrator

This directory contains an AWS SQS (Simple Queue Service) entity implementation for the Monk orchestrator platform. The entity provides lifecycle management for SQS queues including creation, updates, deletion, and readiness checks.

## Architecture

The AWS SQS entity follows the established Monk entity pattern with three main components:

### Core Files

- **`base.ts`**: Contains the `AWSSQSEntity` base class that provides common functionality for SQS operations
  - AWS API integration using the built-in `aws` module
  - Core SQS operations (create, delete, get attributes, etc.)
  - Queue state management
  - Error handling and logging

- **`common.ts`**: Contains shared utilities and interfaces
  - Queue attribute type definitions
  - Validation functions for queue names and message sizes
  - Helper functions for attribute format conversion
  - Default configurations for standard and FIFO queues

- **`queue.ts`**: Main SQS queue entity implementation
  - Extends `AWSSQSEntity` base class
  - Implements lifecycle methods: create, start, stop, update, delete, checkReadiness
  - Provides custom actions for queue management
  - Handles both standard and FIFO queue configurations

## Entity Usage

### Basic Standard Queue

```yaml
my-queue:
  defines: aws-sqs/sqs-queue
  region: us-east-1
  queue_name: my-standard-queue
  delay_seconds: 0
  maximum_message_size: 262144
  message_retention_period: 345600  # 4 days
  receive_message_wait_time_seconds: 20  # Long polling
  visibility_timeout: 30
  fifo_queue: false
  sqs_managed_sse_enabled: true
  tags:
    Environment: production
    Owner: my-team
```

### FIFO Queue with Dead Letter Queue

```yaml
fifo-queue:
  defines: aws-sqs/sqs-queue
  region: us-east-1
  queue_name: my-fifo-queue.fifo
  fifo_queue: true
  content_based_deduplication: true
  redrive_policy:
    dead_letter_target_arn: "arn:aws:sqs:us-east-1:123456789012:my-dlq"
    max_receive_count: 3
  tags:
    Environment: production
    Type: fifo
```

## Configuration Options

### Required Parameters

- `region`: AWS region where the queue will be created
- `queue_name`: Name of the SQS queue (must follow AWS naming rules)

### Optional Parameters

- `delay_seconds`: Time in seconds to delay message delivery (0-900)
- `maximum_message_size`: Maximum message size in bytes (1024-262144)
- `message_retention_period`: Time to retain messages in seconds (60-1209600)
- `receive_message_wait_time_seconds`: Long polling wait time (0-20)
- `visibility_timeout`: Message visibility timeout in seconds (0-43200)
- `fifo_queue`: Enable FIFO queue functionality (boolean)
- `content_based_deduplication`: Enable content-based deduplication for FIFO queues
- `kms_master_key_id`: KMS key for server-side encryption
- `kms_data_key_reuse_period_seconds`: KMS data key reuse period (60-86400)
- `redrive_policy`: Dead letter queue configuration
- `redrive_allow_policy`: Dead letter queue redrive permissions
- `sqs_managed_sse_enabled`: Enable SQS-managed server-side encryption
- `policy`: Custom queue policy JSON
- `tags`: Resource tags as key-value pairs

## Entity State

The entity maintains the following state information:

- `existing`: Whether the queue existed before creation
- `queue_name`: The queue name
- `queue_url`: The full queue URL
- `queue_arn`: The queue ARN
- `created_timestamp`: When the queue was created
- `last_modified_timestamp`: When the queue was last modified
- `approximate_number_of_messages`: Approximate number of visible messages
- `approximate_number_of_messages_not_visible`: Approximate number of in-flight messages
- `attributes`: Current queue attributes

## Custom Actions

The entity provides several custom actions for queue management:

- `getQueueInfo()`: Retrieve current queue attributes
- `sendTestMessage(messageBody?)`: Send a test message to the queue
- `receiveMessages(maxMessages?, waitTimeSeconds?)`: Receive messages from the queue
- `purgeQueue()`: Remove all messages from the queue
- `getQueueStatistics()`: Get queue statistics and metrics
- `listQueueTags()`: List queue tags
- `setQueueTags(tags)`: Set queue tags

## Implementation Status

### ✅ Completed Features

- Base entity architecture with AWS integration
- Common utilities and type definitions
- Queue lifecycle management (create, update, delete)
- Support for both standard and FIFO queues
- Configuration validation
- State management
- Example configurations
- Test template
- Documentation

### ⚠️ Known Issues

The current implementation has some TypeScript compilation issues that need to be resolved:

1. **URLSearchParams Compatibility**: The runtime environment doesn't provide `URLSearchParams`. Need to implement custom parameter encoding.

2. **Action Decorator Issues**: The `@action` decorator has signature compatibility issues. May need to use a different approach for custom actions.

3. **Type Compatibility**: Some type mismatches between `QueueAttributes` and `Record<string, string>` interfaces.

### 🔄 Next Steps

1. Fix TypeScript compilation errors
2. Complete URLSearchParams replacement with custom encoding
3. Resolve action decorator issues
4. Add comprehensive error handling
5. Implement proper SQS API response parsing
6. Add integration tests
7. Performance optimizations

## Testing

### Build the Entity

```bash
./build.sh aws-sqs
```

### Load the Template

```bash
sudo /home/ivan/Work/monk/dist/monk load ./dist/aws-sqs/MANIFEST
sudo /home/ivan/Work/monk/dist/monk load ./src/aws-sqs/test/stack-template.yaml
```

### Run the Test

```bash
# Clear any existing instances
sudo /home/ivan/Work/monk/dist/monk purge --no-confirm aws-sqs-test/test-queue

# Run the test template
sudo /home/ivan/Work/monk/dist/monk run aws-sqs-test/test-queue

# Check status
sudo /home/ivan/Work/monk/dist/monk ps -a
sudo /home/ivan/Work/monk/dist/monk describe aws-sqs-test/test-queue
```

## Security Considerations

- AWS credentials are automatically injected by the Monk runtime
- Queue policies should follow the principle of least privilege
- Enable server-side encryption for sensitive data
- Use VPC endpoints when operating in private networks
- Monitor queue access with CloudTrail

## Performance Considerations

- Use long polling (`receive_message_wait_time_seconds > 0`) to reduce empty receives
- Configure appropriate visibility timeouts for your processing time
- Consider FIFO queues only when message ordering is critical (lower throughput)
- Use message batching for high-throughput scenarios
- Monitor queue depth and processing lag

## Examples

See `example.yaml` for comprehensive configuration examples including:
- Standard queue with long polling
- FIFO queue with content-based deduplication
- Queue with dead letter queue configuration
- High-throughput queue with custom encryption
- Simple test queue for development

## Contributing

When contributing to this entity:

1. Follow the established TypeScript patterns
2. Add appropriate debug logging
3. Update documentation for new features
4. Include tests for new functionality
5. Ensure compatibility with both standard and FIFO queues 