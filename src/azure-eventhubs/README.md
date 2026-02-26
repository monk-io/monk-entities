# Azure Event Hubs Entity Package

This package provides MonkEC entities for managing Azure Event Hubs resources including namespaces, event hubs, and consumer groups.

## Entities

### `azure-eventhubs/event-hubs-namespace`

Creates and manages Azure Event Hubs namespaces.

**Key Properties:**
- `namespace_name` - Unique namespace name (6-50 characters)
- `location` - Azure region
- `sku.name` - Pricing tier: `Basic`, `Standard`, or `Premium`
- `sku.capacity` - Throughput units (Standard) or processing units (Premium)
- `zone_redundant` - Enable zone redundancy (Premium only)
- `is_auto_inflate_enabled` - Enable automatic scaling (Standard)
- `maximum_throughput_units` - Max throughput units when auto-inflate enabled
- `kafka_enabled` - Enable Apache Kafka protocol support
- `minimum_tls_version` - Minimum TLS version (`1.0`, `1.1`, `1.2`)
- `disable_local_auth` - Disable SAS key authentication

**Actions:**
- `get-info` - Display detailed namespace information
- `list-eventhubs` - List all event hubs in the namespace
- `regenerate-key` - Regenerate authorization keys

### `azure-eventhubs/event-hub`

Creates and manages event hubs within an Event Hubs namespace.

**Key Properties:**
- `namespace_name` - Parent namespace name
- `eventhub_name` - Event hub name (1-256 characters)
- `partition_count` - Number of partitions (1-32 for Standard, up to 1024 for Premium)
- `message_retention_in_days` - Message retention (1-7 for Standard, 1-90 for Premium)
- `capture` - Capture configuration for archiving events to storage

**Capture Configuration:**
- `capture.enabled` - Enable capture
- `capture.encoding` - Encoding format (`Avro` or `AvroDeflate`)
- `capture.interval_in_seconds` - Time window (60-900 seconds)
- `capture.size_limit_in_bytes` - Size limit per file
- `capture.destination_storage_account_resource_id` - Storage account resource ID
- `capture.destination_blob_container` - Blob container name

**Actions:**
- `get-info` - Display detailed event hub information
- `list-consumer-groups` - List all consumer groups
- `get-partition-info` - Display partition information

### `azure-eventhubs/consumer-group`

Creates and manages consumer groups within an Event Hub.

**Key Properties:**
- `namespace_name` - Parent namespace name
- `eventhub_name` - Parent event hub name
- `consumer_group_name` - Consumer group name (1-50 characters)
- `user_metadata` - Optional metadata for the consumer group

**Actions:**
- `get-info` - Display detailed consumer group information

## Usage Examples

### Basic Namespace and Event Hub

```yaml
namespace: my-streaming

eventhubs-namespace:
  defines: azure-eventhubs/event-hubs-namespace
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-eventhubs"
  location: "East US"
  sku:
    name: "Standard"
    capacity: 1

events-hub:
  defines: azure-eventhubs/event-hub
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-eventhubs"
  eventhub_name: "events"
  partition_count: 4
  message_retention_in_days: 1
  depends:
    - wait-for:
        runnables:
          - my-streaming/eventhubs-namespace
```

### Event Hub with Consumer Groups

```yaml
namespace: my-processing

processor-consumer:
  defines: azure-eventhubs/consumer-group
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-eventhubs"
  eventhub_name: "events"
  consumer_group_name: "processor"
  user_metadata: "Main event processor"
  depends:
    - wait-for:
        runnables:
          - my-processing/events-hub

analytics-consumer:
  defines: azure-eventhubs/consumer-group
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-eventhubs"
  eventhub_name: "events"
  consumer_group_name: "analytics"
  user_metadata: "Analytics pipeline consumer"
  depends:
    - wait-for:
        runnables:
          - my-processing/events-hub
```

### Event Hub with Capture

```yaml
namespace: my-archive

captured-hub:
  defines: azure-eventhubs/event-hub
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-eventhubs"
  eventhub_name: "captured-events"
  partition_count: 4
  message_retention_in_days: 1
  capture:
    enabled: true
    encoding: "Avro"
    interval_in_seconds: 300
    size_limit_in_bytes: 314572800
    skip_empty_archives: true
    destination_storage_account_resource_id: "/subscriptions/.../storageAccounts/mystorage"
    destination_blob_container: "eventhubs-archive"
```

## SKU Comparison

| Feature | Basic | Standard | Premium |
|---------|-------|----------|---------|
| Throughput Units | 1 | 1-40 (auto-inflate) | 1-16 PUs |
| Partitions | Up to 32 | Up to 32 | Up to 1024 |
| Message Retention | 1 day | 1-7 days | 1-90 days |
| Consumer Groups | 1 | 20 | 1000 |
| Kafka Support | ✗ | ✓ | ✓ |
| Capture | ✗ | ✓ | ✓ |
| Zone Redundancy | ✗ | ✗ | ✓ |
| Dedicated Resources | ✗ | ✗ | ✓ |

## Authentication

This entity package uses Azure's built-in authentication. Credentials are automatically injected by the Monk runtime when running in an Azure environment or when Azure credentials are configured.

## State Fields

### Namespace State
- `namespace_name` - Namespace identifier
- `service_bus_endpoint` - Event Hubs endpoint URL
- `provisioning_state` - Current provisioning state
- `sku_tier` - SKU tier

### Event Hub State
- `eventhub_name` - Event hub identifier
- `namespace_name` - Parent namespace
- `partition_count` - Number of partitions
- `partition_ids` - List of partition IDs
- `status` - Event hub status

### Consumer Group State
- `consumer_group_name` - Consumer group identifier
- `eventhub_name` - Parent event hub
- `namespace_name` - Parent namespace

## Notes

- The `$Default` consumer group is created automatically with each event hub and cannot be deleted
- Partition count cannot be changed after event hub creation
- Auto-inflate is only available for Standard tier namespaces
- Kafka protocol support requires Standard or Premium tier
