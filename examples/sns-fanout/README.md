# SNS Fan-Out Pattern Example

Demonstrates the SNS Fan-Out pattern: one topic distributes messages to multiple SQS queues with message filtering.

## Architecture

```
                        ┌─────────────────┐
                        │  Events Topic   │
                        │   (SNS)         │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┬─────────────┐
              │                  │                  │             │
         [filter:              [filter:         [filter:      [no filter]
          orders]              payments]        critical]
              │                  │                  │             │
              ▼                  ▼                  ▼             ▼
      ┌──────────────┐   ┌──────────────┐   ┌──────────┐  ┌──────────────┐
      │Orders Queue  │   │Payments Queue│   │  Email   │  │Priority Queue│
      │   (SQS)      │   │   (SQS)      │   │          │  │   (SQS)      │
      └──────────────┘   └──────────────┘   └──────────┘  └──────────────┘
```

## What It Does

**Topic**: `events-topic` - Receives all application events

**Subscriptions**:
1. **Orders Queue** - Filters for: `order_created`, `order_shipped`, `order_cancelled`
2. **Payments Queue** - Filters for: `payment_received`, `payment_failed`, `refund_processed`
3. **Priority Queue** - No filter, receives ALL events (monitoring/audit)
4. **Email** - Filters for: critical events only (`priority=critical`)

**Publisher**: Containerized app that publishes test events with message attributes

## Message Flow Example

When the publisher sends events:

| Event | Orders Queue | Payments Queue | Priority Queue | Email |
|-------|-------------|----------------|----------------|-------|
| `order_created` | ✅ | ❌ | ✅ | ❌ |
| `order_shipped` | ✅ | ❌ | ✅ | ❌ |
| `payment_received` | ❌ | ✅ | ✅ | ❌ |
| `payment_failed` (critical) | ❌ | ✅ | ✅ | ✅ |
| `order_cancelled` (critical) | ✅ | ❌ | ✅ | ✅ |
| `refund_processed` | ❌ | ✅ | ✅ | ❌ |

## Usage

### 1. Load and run

```bash
# Load both SNS and SQS modules
sudo /home/ivan/Work/monk/dist/monk load dist/aws-sns
sudo /home/ivan/Work/monk/dist/monk load dist/aws-sqs

# Load and run the stack
sudo /home/ivan/Work/monk/dist/monk load examples/sns-fanout/complete-stack.yaml
sudo /home/ivan/Work/monk/dist/monk run sns-fanout/fanout-stack
```

### 2. Check publisher logs

```bash
sudo /home/ivan/Work/monk/dist/monk logs sns-fanout/event-publisher
```

Expected output:

```
📤 Event Publisher Starting...
Publishing test events to SNS topic...

1️⃣  Order Events:
✅ Published: order_created (priority: normal) - MessageId: abc-123
✅ Published: order_shipped (priority: normal) - MessageId: def-456

2️⃣  Payment Events:
✅ Published: payment_received (priority: normal) - MessageId: ghi-789

3️⃣  Critical Event:
✅ Published: payment_failed (priority: critical) - MessageId: jkl-012

✅ All events published successfully!

📊 Expected message distribution:
   - Orders Queue:    3 messages
   - Payments Queue:  3 messages
   - Priority Queue:  5 messages (ALL events)
   - Email:           2 messages (critical only)
```

### 3. Verify message delivery

Check how many messages each queue received:

```bash
# Orders queue
sudo /home/ivan/Work/monk/dist/monk do sns-fanout/orders-queue get-attributes | grep ApproximateNumberOfMessages

# Payments queue
sudo /home/ivan/Work/monk/dist/monk do sns-fanout/payments-queue get-attributes | grep ApproximateNumberOfMessages

# Priority queue (should have ALL messages)
sudo /home/ivan/Work/monk/dist/monk do sns-fanout/priority-queue get-attributes | grep ApproximateNumberOfMessages
```

### 4. Check email

For the email subscription:
1. Check the email inbox for `admin@example.com`
2. Confirm the subscription (click link in confirmation email)
3. Run the publisher again to receive critical event notifications

### 5. Cleanup

```bash
sudo /home/ivan/Work/monk/dist/monk stop sns-fanout/fanout-stack
sudo /home/ivan/Work/monk/dist/monk purge sns-fanout/fanout-stack
```

## Key Features Demonstrated

### Message Filtering
Each subscription uses a `filter_policy` to receive only relevant events:

```yaml
filter_policy: |
  {
    "event_type": ["order_created", "order_shipped", "order_cancelled"]
  }
```

### Multiple Attribute Filters
Email subscription filters by BOTH `priority` and `event_type`:

```yaml
filter_policy: |
  {
    "priority": ["critical"],
    "event_type": ["payment_failed", "order_cancelled"]
  }
```

### Raw Message Delivery
SQS subscriptions use `raw_message_delivery: true` to receive the message body directly without SNS envelope.

### Dynamic ARN Injection
Subscriptions automatically get topic and queue ARNs via Monk connections:

```yaml
topic_arn: <- connection-target("topic") entity-state get-member("topic_arn")
endpoint: <- connection-target("queue") entity-state get-member("queue_arn")
```

## Use Cases

This pattern is ideal for:

- **Microservices**: Each service processes only its events
- **Event-driven architecture**: Decouple producers from consumers
- **Monitoring**: Priority queue gets ALL events for audit/analytics
- **Alerting**: Email subscription for critical events
- **Load distribution**: Multiple queues process different event types in parallel

## Prerequisites

- Monk orchestrator installed
- AWS credentials configured
- IAM permissions: `SNS:*`, `SQS:*`
- Both `aws-sns` and `aws-sqs` modules compiled and loaded

## Notes

- Email subscription requires manual confirmation via email link
- SQS queues need permissions to receive messages from SNS (handled automatically by Monk)
- Message filtering is applied at SNS, reducing costs and queue load
- Raw message delivery makes SQS messages easier to process
- Priority queue receives ALL events regardless of attributes

