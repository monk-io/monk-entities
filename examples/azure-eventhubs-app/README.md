# Azure Event Hubs Streaming Application

Demonstrates event streaming patterns using Azure Event Hubs entities with MonkEC orchestration.

## Architecture

```
                    ┌──────────────────────────────┐
                    │  Event Hubs Namespace         │
                    │  (Standard, Kafka, AutoInflate)│
                    └────────┬─────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │                              │
     ┌────────▼────────┐          ┌──────────▼──────────┐
     │   telemetry     │          │      alerts          │
     │   (Event Hub)   │          │      (Event Hub)     │
     │   8 partitions  │          │      4 partitions    │
     │   3-day retain  │          │      7-day retain    │
     └────────┬────────┘          └──────────┬──────────┘
              │                              │
     ┌────────┼────────┐           ┌─────────▼─────────┐
     │                 │           │  alert-processor   │
     ▼                 ▼           │  (Consumer Group)  │
┌──────────┐   ┌──────────┐       └───────────────────┘
│ realtime │   │  batch   │
│dashboard │   │analytics │
│  (CG)    │   │  (CG)    │
└──────────┘   └──────────┘

         ┌─────────────────┐
         │  Streaming App  │
         │  (produce +     │
         │   consume)      │
         └─────────────────┘
```

## Patterns Demonstrated

| Pattern | Component | Description |
|---------|-----------|-------------|
| **High-Throughput Ingestion** | Telemetry Hub (8 partitions) | Batch sending of sensor/device telemetry |
| **Multiple Consumers** | Consumer Groups | Independent readers on the same event stream |
| **Partition Key Routing** | Partitioned sends | Events from the same device routed to the same partition |
| **Auto-Inflate** | Namespace | Automatic throughput scaling under load |
| **Kafka Compatibility** | Namespace | Kafka protocol support enabled |
| **Alert Streaming** | Alerts Hub | Lower-volume critical event stream with longer retention |
| **Secret Management** | Connection String | Namespace connection string stored as Monk secret |

## Event Types

### Telemetry Events
Simulated IoT sensor data sent in high-throughput batches:

| Metric | Unit | Range |
|--------|------|-------|
| `temperature` | °C | 15–85 |
| `humidity` | % | 20–95 |
| `pressure` | hPa | 950–1050 |
| `cpu_usage` | % | 0–100 |
| `memory_usage` | % | 10–99 |

### Alert Events
Threshold-based alerts with severity levels: `info`, `warning`, `critical`.

## Usage

### 1. Load entities and template

```bash
# Load the Event Hubs entity module
monk load dist/azure-eventhubs/MANIFEST

# Load the example template
monk load examples/azure-eventhubs-app/azure-eventhubs-app.yaml
```

### 2. Deploy infrastructure only

```bash
monk run azure-eventhubs-app/infra-stack
```

### 3. Deploy complete stack (infrastructure + app)

```bash
monk run azure-eventhubs-app/complete-stack
```

### 4. Monitor

```bash
monk ps
monk describe azure-eventhubs-app/eventhubs-namespace
monk describe azure-eventhubs-app/telemetry-hub
monk logs -f azure-eventhubs-app/streaming-app
```

### 5. Cleanup

```bash
monk stop azure-eventhubs-app/complete-stack
monk purge azure-eventhubs-app/complete-stack
```

## Local Development

```bash
cd examples/azure-eventhubs-app

# Install dependencies
npm install

# Copy and configure environment
cp env.example .env
# Edit .env with your Event Hubs connection string

# Run in development mode
npm run dev

# Build and run compiled
npm run build
npm start
```

## Docker

```bash
docker build -t azure-eventhubs-app:latest .
docker run --env-file .env azure-eventhubs-app:latest
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `EVENTHUBS_CONNECTION_STRING` | Event Hubs connection string | *required* |
| `TELEMETRY_HUB_NAME` | Telemetry event hub name | `telemetry` |
| `ALERTS_HUB_NAME` | Alerts event hub name | `alerts` |
| `CONSUMER_GROUP` | Consumer group for reading | `realtime-dashboard` |
| `OPERATION_INTERVAL_MS` | Delay between cycles (ms) | `3000` |
| `MAX_OPERATIONS` | Max cycles (0 = unlimited) | `30` |

## Prerequisites

- Monk orchestrator installed
- Azure credentials configured
- `azure-eventhubs` module compiled and loaded
