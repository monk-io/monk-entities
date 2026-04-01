# GCP Pub/Sub Entity Integration Plan

## Entities

| Entity | Class | Description |
|--------|-------|-------------|
| `gcp/pubsub-topic` | `PubsubTopic` | Manages Pub/Sub topics — create, update labels/retention/schema, publish messages, cost estimation |
| `gcp/pubsub-subscription` | `PubsubSubscription` | Manages Pub/Sub subscriptions — pull/push delivery, dead letter, retry policies, message filtering |

## API Details

- **Base URL**: `https://pubsub.googleapis.com/v1`
- **Auth**: GCP builtin (`gcp.get()` / `gcp.post()` / etc.) — no secrets needed
- **Topics**: PUT to create (idempotent), GET, PATCH, DELETE
- **Subscriptions**: PUT to create (idempotent), GET, PATCH, DELETE
- **No long-running operations** — all calls synchronous

## Design Decisions

- Added Pub/Sub to existing `gcp` package rather than a new `gcp-pubsub` package — consistent with other GCP entities
- Uses `PUT` for create (Pub/Sub API is idempotent on PUT)
- Subscription resolves topic via `connection-target` for entity composition
- Cost estimation fetches from Cloud Billing Catalog API with fallback to known published pricing ($40/TiB, $0.27/GiB-month storage)
- Base64 encode/decode implemented inline (Goja runtime doesn't have `btoa`/`atob`)

## Progress

- [x] Plan — approved 2026-04-01
- [x] Implement — 2 entities, 6 files modified/created, compiled clean
- [x] Tests — 11 test steps covering full lifecycle + all actions
- [x] Manual testing — all entities pass create → ready → actions → delete
- [x] Integration tests — 15/15 passed (68s)
- [ ] PR — pending
- [ ] Merged

## Files Created/Modified

- `src/gcp/pubsub-topic.ts` — **Created**
- `src/gcp/pubsub-subscription.ts` — **Created**
- `src/gcp/common.ts` — **Modified** (added PUBSUB_API_URL, catalog entry, type)
- `src/gcp/example.yaml` — **Modified** (added Pub/Sub examples)
- `src/gcp/README.md` — **Modified** (added Pub/Sub entity docs)
- `src/gcp/test/stack-template.yaml` — **Modified** (added Pub/Sub test instances)
- `src/gcp/test/stack-integration.test.yaml` — **Modified** (added Pub/Sub test steps + cleanup)

## Issues Found

- Cloud Billing Catalog API requires listing all services first to find Pub/Sub service ID (no fixed ID) — falls back to published pricing on API error
- Pub/Sub messages use base64 encoding — needed custom base64 encode/decode for Goja runtime
