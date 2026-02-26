# Azure Service Bus Entity Package

This package provides MonkEC entities for managing Azure Service Bus resources including namespaces, queues, topics, and subscriptions.

## Entities

### `azure-servicebus/service-bus-namespace`

Creates and manages Azure Service Bus namespaces.

**Key Properties:**
- `namespace_name` - Unique namespace name (6-50 characters)
- `location` - Azure region
- `sku.name` - Pricing tier: `Basic`, `Standard`, or `Premium`
- `sku.capacity` - Messaging units for Premium tier (1, 2, 4, 8, or 16)
- `zone_redundant` - Enable zone redundancy (Premium only)
- `minimum_tls_version` - Minimum TLS version (`1.0`, `1.1`, `1.2`)
- `disable_local_auth` - Disable SAS key authentication
- `public_network_access` - Enable/disable public access

**Actions:**
- `get-info` - Display detailed namespace information
- `list-queues` - List all queues in the namespace
- `list-topics` - List all topics in the namespace
- `regenerate-key` - Regenerate authorization keys

### `azure-servicebus/queue`

Creates and manages queues within a Service Bus namespace for point-to-point messaging.

**Key Properties:**
- `namespace_name` - Parent namespace name
- `queue_name` - Queue name (1-260 characters)
- `max_size_in_megabytes` - Maximum queue size
- `default_message_time_to_live` - Message TTL (ISO 8601 duration)
- `lock_duration` - Peek-lock duration
- `max_delivery_count` - Max delivery attempts before dead-lettering
- `requires_session` - Enable session support
- `requires_duplicate_detection` - Enable duplicate detection
- `dead_lettering_on_message_expiration` - Dead-letter expired messages
- `forward_to` - Forward messages to another queue/topic
- `forward_dead_lettered_messages_to` - Forward dead letters

**Actions:**
- `get-info` - Display detailed queue information
- `get-runtime-info` - Display message counts and statistics

### `azure-servicebus/topic`

Creates and manages topics within a Service Bus namespace for publish-subscribe messaging.

**Key Properties:**
- `namespace_name` - Parent namespace name
- `topic_name` - Topic name (1-260 characters)
- `max_size_in_megabytes` - Maximum topic size
- `default_message_time_to_live` - Message TTL (ISO 8601 duration)
- `enable_partitioning` - Enable partitioning for high throughput
- `requires_duplicate_detection` - Enable duplicate detection
- `support_ordering` - Support message ordering

**Actions:**
- `get-info` - Display detailed topic information
- `list-subscriptions` - List all subscriptions
- `get-runtime-info` - Display message counts and statistics

### `azure-servicebus/subscription`

Creates and manages subscriptions within a Service Bus topic for receiving messages.

**Key Properties:**
- `namespace_name` - Parent namespace name
- `topic_name` - Parent topic name
- `subscription_name` - Subscription name (1-50 characters)
- `default_message_time_to_live` - Message TTL
- `lock_duration` - Peek-lock duration
- `max_delivery_count` - Max delivery attempts
- `requires_session` - Enable session support
- `dead_lettering_on_message_expiration` - Dead-letter expired messages
- `default_rule_filter` - SQL filter expression for messages
- `default_rule_action` - SQL action for matched messages
- `forward_to` - Forward messages to another queue/topic

**Actions:**
- `get-info` - Display detailed subscription information
- `list-rules` - List all filter rules
- `get-runtime-info` - Display message counts and statistics

## Usage Examples

### Basic Namespace and Queue

```yaml
namespace: my-messaging

servicebus-namespace:
  defines: azure-servicebus/service-bus-namespace
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-servicebus"
  location: "East US"
  sku:
    name: "Standard"

orders-queue:
  defines: azure-servicebus/queue
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-servicebus"
  queue_name: "orders"
  max_delivery_count: 10
  dead_lettering_on_message_expiration: true
  depends:
    - wait-for:
        runnables:
          - my-messaging/servicebus-namespace
```

### Pub/Sub with Topics and Subscriptions

```yaml
namespace: my-pubsub

events-topic:
  defines: azure-servicebus/topic
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-servicebus"
  topic_name: "events"
  depends:
    - wait-for:
        runnables:
          - my-pubsub/servicebus-namespace

# Subscription that receives all messages
all-events:
  defines: azure-servicebus/subscription
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-servicebus"
  topic_name: "events"
  subscription_name: "all-events"
  depends:
    - wait-for:
        runnables:
          - my-pubsub/events-topic

# Filtered subscription for high-priority events only
high-priority:
  defines: azure-servicebus/subscription
  subscription_id: "your-subscription-id"
  resource_group_name: "your-resource-group"
  namespace_name: "my-servicebus"
  topic_name: "events"
  subscription_name: "high-priority"
  default_rule_filter: "priority = 'high'"
  depends:
    - wait-for:
        runnables:
          - my-pubsub/events-topic
```

## SKU Comparison

| Feature | Basic | Standard | Premium |
|---------|-------|----------|---------|
| Queues | ✓ | ✓ | ✓ |
| Topics/Subscriptions | ✗ | ✓ | ✓ |
| Message Size | 256 KB | 256 KB | 100 MB |
| Partitioning | ✗ | ✓ | ✓ |
| Sessions | ✗ | ✓ | ✓ |
| Zone Redundancy | ✗ | ✗ | ✓ |
| Dedicated Resources | ✗ | ✗ | ✓ |

## ISO 8601 Duration Format

Service Bus uses ISO 8601 duration format for time-based properties:

- `PT1M` - 1 minute
- `PT5M` - 5 minutes
- `PT1H` - 1 hour
- `P1D` - 1 day
- `P7D` - 7 days
- `P14D` - 14 days

## Authentication

This entity package uses Azure's built-in authentication. Credentials are automatically injected by the Monk runtime when running in an Azure environment or when Azure credentials are configured.

## State Fields

### Namespace State
- `namespace_name` - Namespace identifier
- `service_bus_endpoint` - Service Bus endpoint URL
- `provisioning_state` - Current provisioning state

### Queue State
- `queue_name` - Queue identifier
- `namespace_name` - Parent namespace
- `message_count` - Current message count
- `status` - Queue status

### Topic State
- `topic_name` - Topic identifier
- `namespace_name` - Parent namespace
- `subscription_count` - Number of subscriptions
- `status` - Topic status

### Subscription State
- `subscription_name` - Subscription identifier
- `topic_name` - Parent topic
- `namespace_name` - Parent namespace
- `message_count` - Current message count
- `status` - Subscription status
