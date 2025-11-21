# AWS SNS Entity

Manage Amazon Simple Notification Service (SNS) topics with Monk.

## Features

- Create and manage SNS topics (standard and FIFO)
- Configure topic attributes (display name, encryption, delivery policy)
- Subscribe endpoints to topics (email, SMS, SQS, Lambda, etc.)
- Publish messages to topics
- Manage topic permissions
- Full lifecycle management (create, update, delete)
- Support for encrypted topics with KMS
- Automatic adoption of existing topics

## Prerequisites

- AWS account with SNS access
- AWS credentials configured (Access Key ID and Secret Access Key)
- Appropriate IAM permissions for SNS operations

## Configuration

### SNS Topic

```yaml
my-topic:
  defines: aws-sns/sns-topic
  region: us-east-1
  topic_name: my-notification-topic
  display_name: My Notification Topic  # Optional
  fifo_topic: false                     # Optional, default: false
  content_based_deduplication: false    # Optional, for FIFO topics
  kms_master_key_id: alias/aws/sns     # Optional, for encryption
  tags:                                 # Optional
    Environment: production
    Application: myapp
```

### Configuration Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `region` | string | Yes | AWS region for the SNS topic |
| `topic_name` | string | Yes | Name of the SNS topic (1-256 chars, alphanumeric, hyphens, underscores) |
| `display_name` | string | No | Human-readable display name (max 100 chars) |
| `fifo_topic` | boolean | No | Create a FIFO topic (name must end with .fifo) |
| `content_based_deduplication` | boolean | No | Enable content-based deduplication for FIFO topics |
| `kms_master_key_id` | string | No | KMS key ID/ARN for server-side encryption |
| `policy` | string | No | JSON policy document for the topic |
| `delivery_policy` | string | No | JSON delivery policy for the topic |
| `tags` | object | No | Resource tags for the topic |

## State

The entity maintains the following state:

| Field | Type | Description |
|-------|------|-------------|
| `existing` | boolean | Whether the topic pre-existed |
| `topic_name` | string | The topic name |
| `topic_arn` | string | The ARN of the topic |
| `is_fifo` | boolean | Whether this is a FIFO topic |

## Custom Actions

### get-attributes

Get all attributes of the topic.

```bash
monk do aws-sns-example/my-topic/get-attributes
```

### list-subscriptions

List all subscriptions for the topic.

```bash
monk do aws-sns-example/my-topic/list-subscriptions
```

### subscribe

Subscribe an endpoint to the topic.

```bash
# Email subscription
monk do aws-sns-example/my-topic/subscribe protocol=email endpoint=user@example.com

# SMS subscription
monk do aws-sns-example/my-topic/subscribe protocol=sms endpoint=+1234567890

# SQS subscription
monk do aws-sns-example/my-topic/subscribe protocol=sqs endpoint=arn:aws:sqs:us-east-1:123456789012:my-queue

# Lambda subscription
monk do aws-sns-example/my-topic/subscribe protocol=lambda endpoint=arn:aws:lambda:us-east-1:123456789012:function:my-function
```

**Note:** Email subscriptions require confirmation via email.

### unsubscribe

Unsubscribe an endpoint from the topic.

```bash
monk do aws-sns-example/my-topic/unsubscribe subscription_arn=arn:aws:sns:us-east-1:123456789012:my-topic:abc123
```

### publish

Publish a message to the topic.

```bash
# Standard topic
monk do aws-sns-example/my-topic/publish message="Hello World" subject="Test Message"

# FIFO topic
monk do aws-sns-example/my-fifo-topic/publish message="Order created" subject="Order Event" message_group_id=orders
```

### add-permission

Add a permission to the topic policy.

```bash
monk do aws-sns-example/my-topic/add-permission label=MyPermission aws_account_id=123456789012 action_name=Publish
```

### remove-permission

Remove a permission from the topic policy.

```bash
monk do aws-sns-example/my-topic/remove-permission label=MyPermission
```

## Examples

### Basic Topic

```yaml
namespace: my-app

notifications:
  defines: aws-sns/sns-topic
  region: us-east-1
  topic_name: app-notifications
  display_name: Application Notifications
  tags:
    Environment: production
```

### FIFO Topic with Deduplication

```yaml
namespace: my-app

order-events:
  defines: aws-sns/sns-topic
  region: us-east-1
  topic_name: order-events
  fifo_topic: true
  content_based_deduplication: true
  display_name: Order Events
  tags:
    Environment: production
```

### Encrypted Topic

```yaml
namespace: my-app

secure-notifications:
  defines: aws-sns/sns-topic
  region: us-east-1
  topic_name: secure-notifications
  display_name: Secure Notifications
  kms_master_key_id: alias/aws/sns
  tags:
    Environment: production
    Security: high
```

## Usage

### Load the entity

```bash
monk load MANIFEST
```

### Deploy a topic

```bash
monk load example.yaml
monk update aws-sns-example/notifications
```

### Check status

```bash
monk describe aws-sns-example/notifications
monk ps -a
```

### Use custom actions

```bash
# Get topic attributes
monk do aws-sns-example/notifications/get-attributes

# Subscribe an email
monk do aws-sns-example/notifications/subscribe protocol=email endpoint=alerts@example.com

# Publish a message
monk do aws-sns-example/notifications/publish message="System alert" subject="Alert"

# List subscriptions
monk do aws-sns-example/notifications/list-subscriptions
```

### Delete a topic

```bash
monk delete --force aws-sns-example/notifications
```

## AWS Credentials

This entity uses the built-in AWS module for authentication. AWS credentials should be configured via environment variables or AWS credential files:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN` (optional, for temporary credentials)

For testing, create a `.env` file in the `test/` directory with your credentials.

## IAM Permissions

The following IAM permissions are required:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sns:CreateTopic",
        "sns:DeleteTopic",
        "sns:GetTopicAttributes",
        "sns:SetTopicAttributes",
        "sns:ListTopics",
        "sns:ListSubscriptionsByTopic",
        "sns:Subscribe",
        "sns:Unsubscribe",
        "sns:Publish",
        "sns:AddPermission",
        "sns:RemovePermission",
        "sns:TagResource",
        "sns:UntagResource",
        "sns:ListTagsForResource"
      ],
      "Resource": "*"
    }
  ]
}
```

For encrypted topics, additional KMS permissions are required:

```json
{
  "Effect": "Allow",
  "Action": [
    "kms:Decrypt",
    "kms:GenerateDataKey"
  ],
  "Resource": "arn:aws:kms:*:*:key/*"
}
```

## FIFO Topics

FIFO (First-In-First-Out) topics provide:

- Message ordering within message groups
- Exactly-once message delivery
- High throughput (up to 300 publishes/second)

**Important:** 
- FIFO topic names must end with `.fifo`
- When publishing to FIFO topics, you must provide a `message_group_id`
- If not using content-based deduplication, you must provide a `message_deduplication_id`

## Troubleshooting

### Topic creation fails

- Verify AWS credentials are correctly configured
- Check IAM permissions for SNS operations
- Ensure topic name follows naming rules (alphanumeric, hyphens, underscores only)

### Email subscription not working

- Email subscriptions require confirmation
- Check the subscriber's inbox (including spam folder)
- The subscription will remain in "PendingConfirmation" state until confirmed

### FIFO topic issues

- Ensure topic name ends with `.fifo`
- Provide `message_group_id` when publishing
- If not using content-based deduplication, provide `message_deduplication_id`

### Encrypted topic access denied

- Verify KMS key permissions
- Ensure the IAM role has `kms:Decrypt` and `kms:GenerateDataKey` permissions
- Check that the KMS key policy allows SNS to use the key

## References

- [AWS SNS Documentation](https://docs.aws.amazon.com/sns/)
- [AWS SNS API Reference](https://docs.aws.amazon.com/sns/latest/api/)
- [AWS SNS FIFO Topics](https://docs.aws.amazon.com/sns/latest/dg/sns-fifo-topics.html)
- [Monk Documentation](../../doc/)

