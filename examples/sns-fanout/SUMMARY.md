# SNS Fan-Out Pattern - Implementation Summary

## What Was Built

A complete **SNS Fan-Out pattern** example demonstrating real-world microservices architecture.

## Components

### 1. SNS Topic
- **`events-topic`** - Central hub for all application events

### 2. SQS Queues (3)
- **`orders-queue`** - Processes order events
- **`payments-queue`** - Processes payment events  
- **`priority-queue`** - Receives ALL events (monitoring/audit)

### 3. SNS Subscriptions (4)
- **`orders-subscription`** - Filters: `order_created`, `order_shipped`, `order_cancelled`
- **`payments-subscription`** - Filters: `payment_received`, `payment_failed`, `refund_processed`
- **`priority-subscription`** - No filter (receives everything)
- **`email-subscription`** - Filters: `priority=critical` only

### 4. Publisher Application
- Containerized Python app
- Publishes 6 different event types
- Uses message attributes for filtering
- Demonstrates the fan-out in action

## Key Features

✅ **Message Filtering** - Each queue gets only relevant events  
✅ **Multi-attribute Filtering** - Email filters by priority AND event_type  
✅ **Raw Message Delivery** - SQS gets clean messages without SNS envelope  
✅ **Dynamic Connections** - ARNs injected automatically via Monk  
✅ **Complete Orchestration** - All resources created and wired together  
✅ **Real-world Pattern** - Production-ready microservices architecture

## Message Flow

```
Publisher → SNS Topic → [Filtered] → Multiple Queues + Email
```

**Example**: `payment_failed` (critical) event goes to:
- ✅ Payments Queue (matches `payment_failed` filter)
- ✅ Priority Queue (no filter, gets everything)
- ✅ Email (matches `priority=critical` AND `event_type` filter)
- ❌ Orders Queue (doesn't match filter)

## Files

- `complete-stack.yaml` - Full stack definition (8 entities + 1 runnable)
- `README.md` - Usage guide and documentation
- `SUMMARY.md` - This file

## Why This Pattern?

### Benefits:
1. **Decoupling** - Services don't know about each other
2. **Scalability** - Easy to add new consumers
3. **Flexibility** - Each consumer processes at its own pace
4. **Cost-effective** - Filtering happens at SNS (no wasted SQS messages)
5. **Resilience** - One service failure doesn't affect others

### Use Cases:
- E-commerce order processing
- Payment systems
- Event-driven microservices
- Monitoring and alerting
- Audit logging

## Testing

Load and run:
```bash
monk load dist/aws-sns dist/aws-sqs
monk load examples/sns-fanout/complete-stack.yaml
monk run sns-fanout/fanout-stack
```

Check results:
```bash
monk logs sns-fanout/event-publisher
monk do sns-fanout/orders-queue get-attributes
```

Expected: 3 messages in orders-queue, 3 in payments-queue, 5 in priority-queue.

## Prerequisites

- AWS credentials configured
- IAM permissions: `SNS:*`, `SQS:*`
- Both `aws-sns` and `aws-sqs` modules loaded
- Change email endpoint to your actual email address

## What This Demonstrates

This example showcases:
1. The power of the **new `aws-sns/sns-subscription` entity**
2. Real-world **microservices architecture pattern**
3. **Message filtering** for cost optimization
4. **Monk orchestration** capabilities (connections, dependencies, dynamic values)
5. **Complete end-to-end** implementation (infrastructure + application)

Perfect for understanding how to build production-grade event-driven systems with Monk!

