# Azure Service Bus Messaging Application

Demonstrates pub/sub and point-to-point messaging patterns using Azure Service Bus entities with MonkEC orchestration.

## Architecture

```
                    ┌──────────────────────────┐
                    │  Service Bus Namespace    │
                    │  (Standard tier)          │
                    └────────┬─────────────────┘
                             │
              ┌──────────────┼──────────────────┐
              │                                  │
     ┌────────▼────────┐              ┌──────────▼──────────┐
     │  order-events   │              │    commands          │
     │  (Topic)        │              │    (Queue)           │
     └────────┬────────┘              └──────────┬──────────┘
              │                                  │
    ┌─────────┼──────────┐              ┌────────▼────────┐
    │         │          │              │  Publisher App   │
    ▼         ▼          ▼              │  (send/receive)  │
┌────────┐┌────────┐┌────────┐         └─────────────────┘
│ order- ││payment-││ audit- │
│processor││handler ││ logger │
│  (sub)  ││ (sub)  ││ (sub)  │
└────────┘└────────┘└────────┘
    │         │
    ▼         ▼
┌─────────────────┐
│  dead-letters   │
│  (Queue)        │
└─────────────────┘
```

## Patterns Demonstrated

| Pattern | Component | Description |
|---------|-----------|-------------|
| **Pub/Sub** | Topic + Subscriptions | One topic fans out events to multiple filtered subscriptions |
| **Point-to-Point** | Queue | Commands sent to a single queue, processed by one consumer |
| **Message Filtering** | SQL Subscriptions | Each subscription receives only matching event types |
| **Dead-Letter Handling** | DLQ + Forwarding | Failed messages forwarded to a dead-letter queue |
| **Batch Sending** | Batch API | Multiple events sent in a single batch for throughput |
| **Secret Management** | Connection String | Namespace connection string stored as Monk secret |

## Message Flow

When the publisher sends events to the `order-events` topic:

| Event | order-processor | payment-handler | audit-logger |
|-------|:-:|:-:|:-:|
| `OrderCreated` | ✅ | ❌ | ✅ |
| `OrderUpdated` | ✅ | ❌ | ✅ |
| `OrderCancelled` | ✅ | ❌ | ✅ |
| `PaymentReceived` | ❌ | ✅ | ✅ |
| `PaymentFailed` | ❌ | ✅ | ✅ |
| `RefundProcessed` | ❌ | ✅ | ✅ |

## Usage

### 1. Load entities and template

```bash
# Load the Service Bus entity module
monk load dist/azure-servicebus/MANIFEST

# Load the example template
monk load examples/azure-servicebus-app/azure-servicebus-app.yaml
```

### 2. Deploy infrastructure only

```bash
monk run azure-servicebus-app/infra-stack
```

### 3. Deploy complete stack (infrastructure + app)

```bash
monk run azure-servicebus-app/complete-stack
```

### 4. Monitor

```bash
monk ps
monk describe azure-servicebus-app/servicebus-namespace
monk logs -f azure-servicebus-app/publisher
```

### 5. Cleanup

```bash
monk stop azure-servicebus-app/complete-stack
monk purge azure-servicebus-app/complete-stack
```

## Local Development

```bash
cd examples/azure-servicebus-app

# Install dependencies
npm install

# Copy and configure environment
cp env.example .env
# Edit .env with your Service Bus connection string

# Run in development mode
npm run dev

# Build and run compiled
npm run build
npm start
```

## Docker

```bash
docker build -t azure-servicebus-app:latest .
docker run --env-file .env azure-servicebus-app:latest
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVICEBUS_CONNECTION_STRING` | Service Bus connection string | *required* |
| `TOPIC_NAME` | Topic name for pub/sub events | `order-events` |
| `QUEUE_NAME` | Queue name for commands | `commands` |
| `OPERATION_INTERVAL_MS` | Delay between cycles (ms) | `5000` |
| `MAX_OPERATIONS` | Max cycles (0 = unlimited) | `20` |

## Prerequisites

- Monk orchestrator installed
- Azure credentials configured
- `azure-servicebus` module compiled and loaded
