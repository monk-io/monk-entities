# GCP Pub/Sub Worker

Demonstrates asynchronous messaging with Google Cloud Pub/Sub — a worker application publishes events to a topic and consumes them via a pull subscription.

## Architecture

```
                          ┌─────────────────┐
                          │  Service Usage   │
                          │  (enable APIs)   │
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
     ┌────────▼────────┐  ┌───────▼────────┐  ┌────────▼────────┐
     │  Pub/Sub Topic   │  │ Service Account│  │  Service Account│
     │  (message bus)   │  │  (IAM access)  │  │    Key (secret) │
     └────────┬─────────┘  └───────┬────────┘  └────────┬────────┘
              │                    │                     │
     ┌────────▼─────────┐         │                     │
     │  Subscription     │         │                     │
     │  (pull delivery)  │         │                     │
     └────────┬──────────┘         │                     │
              │                    │                     │
              └──────────┬─────────┴─────────────────────┘
                         │
                ┌────────▼────────┐
                │  Worker (Node)  │
                │  publish → pull │
                └─────────────────┘
```

**How it works:**
1. `gcp/service-usage` enables the Pub/Sub and IAM APIs
2. `gcp/pubsub-topic` creates a topic with 1-hour message retention
3. `gcp/pubsub-subscription` creates a pull subscription wired to the topic via `connection-target`
4. `gcp/service-account` + `gcp/service-account-key` provide credentials for the worker
5. The worker container publishes 5 demo events and pulls them back, demonstrating the full round-trip

## Prerequisites

- GCP provider configured in Monk:
  ```bash
  monk cluster provider add -p gcp
  ```
- GCP project with billing enabled
- IAM permissions: `roles/pubsub.admin`, `roles/iam.serviceAccountAdmin`, `roles/serviceusage.serviceUsageAdmin`

## Deploy

```bash
# Load the GCP entity package
monk load dist/gcp/MANIFEST

# Load the example stack
monk load examples/gcp-pubsub-worker/stack.yaml

# Deploy (replace TAG with your cloud node tag)
monk run -t TAG gcp-pubsub-demo/pubsub-app
```

## Verify

### Check stack status

```bash
monk ps
```

All 6 entities should show ready (`true true`).

### View worker output

```bash
monk logs gcp-pubsub-demo/pubsub-worker
```

Expected output:
```
GCP Pub/Sub Worker Demo
Project:      my-project
Topic:        projects/my-project/topics/demo-notifications
Subscription: projects/my-project/subscriptions/demo-worker-sub

--- PUBLISHING MESSAGES ---
  Published [order.created] → ID: 12345678
  Published [user.registered] → ID: 12345679
  ...

--- PULLING MESSAGES ---
  Message #1:
    Type:  order.created
    Data:  {"orderId":"ORD-001","amount":49.99}
  ...

Acknowledged 5 message(s).
Pub/Sub demo completed successfully!
```

### Inspect entities via actions

```bash
# Topic details
monk do gcp-pubsub-demo/notifications-topic/get-info

# List subscriptions attached to the topic
monk do gcp-pubsub-demo/notifications-topic/list-subscriptions

# Subscription details
monk do gcp-pubsub-demo/worker-subscription/get-info

# Publish an ad-hoc message
monk do gcp-pubsub-demo/notifications-topic/publish message="Hello from CLI"

# Pull messages
monk do gcp-pubsub-demo/worker-subscription/pull-messages max_messages=5

# Cost estimate
monk do gcp-pubsub-demo/notifications-topic/get-cost-estimate
```

## Key Wiring Patterns

### 1. Topic → Subscription via connection-target

```yaml
worker-subscription:
  defines: gcp/pubsub-subscription
  topic_name: <- connection-target("topic") entity-state get-member("topic_name")
  connections:
    topic:
      runnable: gcp-pubsub-demo/notifications-topic
      service: data
```

The subscription reads the topic's full resource name (`projects/{project}/topics/{name}`) from entity state at runtime — no hardcoded project IDs.

### 2. Entity state → container env vars

```yaml
pubsub-worker:
  variables:
    pubsub_topic:
      env: PUBSUB_TOPIC
      value: <- connection-target("topic") entity-state get-member("topic_name")
    pubsub_subscription:
      env: PUBSUB_SUBSCRIPTION
      value: <- connection-target("subscription") entity-state get-member("subscription_name")
```

The worker container receives fully-qualified resource names as environment variables, which the GCP SDK uses directly.

### 3. Service account key → secret → container

```yaml
pubsub-key:
  defines: gcp/service-account-key
  secret: pubsub-sa-key
  permitted-secrets:
    pubsub-sa-key: true

pubsub-worker:
  permitted-secrets:
    pubsub-sa-key: true
  variables:
    sa_key:
      env: GOOGLE_APPLICATION_CREDENTIALS_JSON
      value: <- secret("pubsub-sa-key")
```

The service account key is generated, stored as a Monk secret, and injected into the container as an env var. The container writes it to a file and sets `GOOGLE_APPLICATION_CREDENTIALS`.

## Customization

- **Push delivery**: Add `push_endpoint: https://your-service/webhook` to the subscription definition instead of pulling
- **Dead letter queue**: Add a second topic + `dead_letter_topic` on the subscription for failed messages
- **Message filtering**: Add `filter: 'attributes.eventType = "order.created"'` to only receive specific events
- **Exactly-once delivery**: Add `enable_exactly_once_delivery: true` on the subscription

## Cleanup

```bash
monk delete --force gcp-pubsub-demo/pubsub-app
```
