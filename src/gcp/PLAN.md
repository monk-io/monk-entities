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

---

# GCP Cloud Run Entity Integration Plan

## Entities

| Entity | Class | Description |
|--------|-------|-------------|
| `gcp/cloud-run-service` | `CloudRunService` | Manages Cloud Run services — deploy containers, scaling, traffic, IAM, cost estimation |
| `gcp/cloud-run-job` | `CloudRunJob` | Manages Cloud Run jobs — batch/scheduled container execution, overrides, cost estimation |

## API Details

- **Base URL**: `https://run.googleapis.com/v2` (already in `common.ts` as `CLOUD_RUN_API_URL`)
- **Auth**: GCP builtin (`gcp.get()` / `gcp.post()` / etc.) — no secrets needed
- **All create/update/delete are LROs** — poll via `GET .../operations/{id}`, uses `waitForOperation()`
- **Readiness**: `reconciling == false` AND `terminalCondition.state == "CONDITION_SUCCEEDED"`

## Design Decisions

- Added to existing `gcp` package — consistent with all other GCP entities
- No domain mapping entity — v2 API doesn't have first-class domain mappings
- No revision entity — revisions are immutable, exposed via `get-revisions` action
- `allow_unauthenticated` definition field auto-sets IAM on create; also available as manual action
- Cost estimation queries Cloud Billing Catalog API with fallback to published pricing
- Used `container_args` instead of `args` to avoid conflict with Monk's reserved `args` field
- Used `service_description` instead of `description` (reserved by Monk)

## Progress

- [x] Plan — approved 2026-04-02
- [x] Implement — 2 entities, 4 files created, 3 modified, compiled clean
- [x] Tests — 14 test steps covering full lifecycle + all actions
- [x] Manual testing — all entities pass create → ready → actions → delete
- [x] Integration tests — 17/17 passed (102s)
- [ ] PR
- [ ] Merged

## Files Created/Modified

- `src/gcp/cloud-run-service.ts` — **Created**
- `src/gcp/cloud-run-job.ts` — **Created**
- `src/gcp/common.ts` — **Modified** (added CloudRunIngress, CloudRunExecutionEnvironment types)
- `src/gcp/example.yaml` — **Modified** (added Cloud Run service and job examples)
- `src/gcp/README.md` — **Modified** (added Cloud Run entity docs)
- `src/gcp/test/cloud-run-template.yaml` — **Created**
- `src/gcp/test/cloud-run-integration.test.yaml` — **Created**

## Issues Found

- Cloud Run Admin API must be enabled before use — service-usage entity needed as dependency
- `setIamPolicy` requires `run.services.setIamPolicy` permission which test SA lacked — made IAM call non-fatal in create() with warning message
- Cloud Billing Catalog API requires listing services to find Cloud Run service ID — falls back to published pricing when API access limited
