# AWS SNS Entity - Quick Start Guide

## Installation

The entity has been compiled to `dist/aws-sns/`. Load it into Monk:

```bash
cd dist/aws-sns/
monk load MANIFEST
```

## Basic Usage

### 1. Create a Simple Topic

```yaml
namespace: my-app

notifications:
  defines: aws-sns/topic
  region: us-east-1
  topic_name: app-notifications
  display_name: Application Notifications
```

Deploy it:
```bash
monk load example.yaml
monk update my-app/notifications
```

### 2. Subscribe an Email

```bash
monk do my-app/notifications/subscribe protocol=email endpoint=user@example.com
```

Check your email for confirmation link!

### 3. Publish a Message

```bash
monk do my-app/notifications/publish message="Hello from SNS!" subject="Test"
```

### 4. List Subscriptions

```bash
monk do my-app/notifications/list-subscriptions
```

### 5. Get Topic Details

```bash
monk do my-app/notifications/get-attributes
monk describe my-app/notifications
```

## FIFO Topic Example

```yaml
order-events:
  defines: aws-sns/topic
  region: us-east-1
  topic_name: order-events
  fifo_topic: true
  content_based_deduplication: true
```

Publish to FIFO topic:
```bash
monk do my-app/order-events/publish message="Order #123 created" message_group_id=orders
```

## Encrypted Topic Example

```yaml
secure-notifications:
  defines: aws-sns/topic
  region: us-east-1
  topic_name: secure-notifications
  kms_master_key_id: alias/aws/sns
```

## Testing

1. Copy the env example:
   ```bash
   cd src/aws-sns/test/
   cp env.example .env
   ```

2. Edit `.env` with your AWS credentials:
   ```
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   ```

3. Run tests:
   ```bash
   cd /path/to/monk-entities
   sudo INPUT_DIR=./src/aws-sns/ ./monkec.sh test --verbose
   ```

## All Available Actions

- `get-attributes` - Display all topic attributes
- `list-subscriptions` - List subscriptions
- `subscribe` - Subscribe an endpoint
- `unsubscribe` - Remove a subscription
- `publish` - Publish a message
- `add-permission` - Add cross-account permission
- `remove-permission` - Remove permission

## Common Commands

```bash
# Check status
monk ps -a
monk describe my-app/notifications

# View logs
monk logs my-app/notifications

# Delete
monk delete --force my-app/notifications
```

## Subscription Protocols

- `email` - Email subscription (requires confirmation)
- `email-json` - Email with JSON payload
- `sms` - SMS messages
- `sqs` - SQS queue
- `lambda` - Lambda function
- `http` - HTTP endpoint
- `https` - HTTPS endpoint
- `application` - Mobile push notification

## Troubleshooting

### Email subscription not confirmed
Check spam folder for confirmation email from AWS SNS.

### Topic already exists
The entity will automatically adopt existing topics. Check the `existing` flag in state.

### FIFO topic errors
- Ensure topic name ends with `.fifo`
- Provide `message_group_id` when publishing
- Optionally provide `message_deduplication_id`

### Permissions errors
Ensure your IAM user/role has the required SNS permissions (see README.md).

## Documentation

- Full documentation: `README.md`
- Implementation details: `IMPLEMENTATION_SUMMARY.md`
- AWS SNS docs: https://docs.aws.amazon.com/sns/

