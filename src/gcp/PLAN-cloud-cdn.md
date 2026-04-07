# GCP Cloud CDN — Integration Plan

## Overview

Add Cloud CDN backend bucket and backend service entities to the existing `gcp` package. Cloud CDN is not a standalone resource — it's a feature enabled on Compute Engine backend buckets and backend services via `enableCdn: true` and a `cdnPolicy` configuration object.

**API**: Compute Engine REST API v1 (`https://compute.googleapis.com/compute/v1`)
**Auth**: GCP builtin (`cloud/gcp`) — OAuth2 auto-signed, no secrets needed
**Package**: `src/gcp/` (existing GCP package)

## Entities

### 1. `gcp/cloud-cdn-backend-bucket` — CDN-Enabled Backend Bucket

Manages a Compute Engine backend bucket with Cloud CDN enabled. Backend buckets serve static content from a GCS bucket through Cloud CDN's global edge network.

**API Base**: `https://compute.googleapis.com/compute/v1/projects/{project}/global/backendBuckets`

**Definition:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Backend bucket name (1-63 chars, lowercase letters/digits/dashes) |
| `bucket_name` | string | yes | GCS bucket name to serve content from |
| `enable_cdn` | boolean | no | Enable Cloud CDN (default: true) |
| `cache_mode` | CdnCacheMode | no | Cache mode (default: CACHE_ALL_STATIC) |
| `default_ttl` | number | no | Default TTL in seconds (default: 3600) |
| `max_ttl` | number | no | Maximum TTL in seconds (default: 86400) |
| `client_ttl` | number | no | Client/browser TTL in seconds |
| `negative_caching` | boolean | no | Enable negative response caching |
| `negative_caching_policies` | NegativeCachingPolicy[] | no | Per-status-code negative caching TTLs |
| `serve_while_stale` | number | no | Seconds to serve stale content (default: 86400) |
| `request_coalescing` | boolean | no | Collapse concurrent cache fills (default: true) |
| `signed_url_cache_max_age_sec` | number | no | Max age for signed URL responses |
| `cache_key_include_http_headers` | string[] | no | HTTP headers to include in cache key |
| `cache_key_include_named_cookies` | string[] | no | Cookies to include in cache key |
| `bypass_cache_on_request_headers` | string[] | no | Headers that trigger cache bypass |
| `backend_bucket_description` | string | no | Human-readable description |
| `custom_response_headers` | string[] | no | Custom response headers to add |
| `compression_mode` | "AUTOMATIC" \| "DISABLED" | no | Response compression mode |
| `labels` | Record<string, string> | no | Resource labels |

**State:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Server-generated numeric ID |
| `self_link` | string | Full resource URL |
| `existing` | boolean | Pre-existed before entity |

**Actions:**
- `get-info` — Display backend bucket details, CDN policy, edge security
- `get-cost-estimate` — Pricing breakdown (egress + requests + cache fill)
- `costs` — Standardized JSON cost output

**Lifecycle:**
- `create()` — GET by name to check existence, POST to create if not found
- `update()` — PUT with full resource body (Compute API uses PUT for updates)
- `delete()` — DELETE (skip if existing=true)
- `checkReadiness()` — GET returns the resource (backend buckets are immediately ready)

### 2. `gcp/cloud-cdn-backend-service` — CDN-Enabled Backend Service

Manages a Compute Engine backend service with Cloud CDN enabled. Backend services route traffic to instance groups, NEGs, Cloud Run, or other backends.

**API Base**: `https://compute.googleapis.com/compute/v1/projects/{project}/global/backendServices`

**Definition:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Backend service name (1-63 chars) |
| `backends` | Backend[] | yes | Backend targets (instance groups, NEGs) |
| `health_check` | string | no | Health check self-link URL |
| `protocol` | "HTTP" \| "HTTPS" \| "HTTP2" | no | Protocol to backends (default: HTTP) |
| `port_name` | string | no | Named port on backends |
| `timeout_sec` | number | no | Backend timeout in seconds (default: 30) |
| `enable_cdn` | boolean | no | Enable Cloud CDN (default: true) |
| `cache_mode` | CdnCacheMode | no | Cache mode (default: CACHE_ALL_STATIC) |
| `default_ttl` | number | no | Default TTL in seconds (default: 3600) |
| `max_ttl` | number | no | Maximum TTL in seconds (default: 86400) |
| `client_ttl` | number | no | Client/browser TTL in seconds |
| `negative_caching` | boolean | no | Enable negative response caching |
| `negative_caching_policies` | NegativeCachingPolicy[] | no | Per-status-code negative caching TTLs |
| `serve_while_stale` | number | no | Seconds to serve stale content |
| `request_coalescing` | boolean | no | Collapse concurrent cache fills (default: true) |
| `signed_url_cache_max_age_sec` | number | no | Max age for signed URL responses |
| `cache_key_include_host` | boolean | no | Include hostname in cache key (default: true) |
| `cache_key_include_protocol` | boolean | no | Include protocol in cache key (default: true) |
| `cache_key_include_query_string` | boolean | no | Include query string in cache key (default: true) |
| `cache_key_query_string_whitelist` | string[] | no | Query params to include |
| `cache_key_query_string_blacklist` | string[] | no | Query params to exclude |
| `cache_key_include_http_headers` | string[] | no | HTTP headers to include in cache key |
| `cache_key_include_named_cookies` | string[] | no | Cookies to include in cache key |
| `bypass_cache_on_request_headers` | string[] | no | Headers that trigger cache bypass |
| `backend_service_description` | string | no | Human-readable description |
| `load_balancing_scheme` | "EXTERNAL" \| "EXTERNAL_MANAGED" \| "INTERNAL_SELF_MANAGED" | no | Load balancing scheme |
| `session_affinity` | string | no | Session affinity type |
| `affinity_cookie_ttl_sec` | number | no | Affinity cookie TTL |
| `connection_draining_timeout_sec` | number | no | Connection draining timeout (default: 300) |
| `custom_response_headers` | string[] | no | Custom response headers |
| `compression_mode` | "AUTOMATIC" \| "DISABLED" | no | Response compression mode |
| `labels` | Record<string, string> | no | Resource labels |

**Backend type:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `group` | string | yes | Backend group URL (instance group or NEG self-link) |
| `balancing_mode` | "UTILIZATION" \| "RATE" \| "CONNECTION" | no | Balancing mode |
| `max_utilization` | number | no | Max utilization (0.0-1.0) |
| `max_rate` | number | no | Max requests per second |
| `max_rate_per_instance` | number | no | Max RPS per instance |
| `capacity_scaler` | number | no | Capacity scaler (0.0-1.0) |

**State:**
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Server-generated numeric ID |
| `self_link` | string | Full resource URL |
| `existing` | boolean | Pre-existed before entity |
| `fingerprint` | string | Resource fingerprint for updates |

**Actions:**
- `get-info` — Display backend service details, CDN policy, backends
- `get-health` — Check health of backend instances
- `get-cost-estimate` — Pricing breakdown (egress + requests + cache fill)
- `costs` — Standardized JSON cost output

**Lifecycle:**
- `create()` — GET by name to check existence, POST to create if not found
- `update()` — PUT with full resource body + fingerprint
- `delete()` — DELETE (skip if existing=true)
- `checkReadiness()` — GET returns the resource (immediate for backend services)

## API Details

### Compute Engine API v1

All endpoints use `https://compute.googleapis.com/compute/v1/projects/{project}/global/`

**Backend Buckets:**
- `POST .../backendBuckets` — Create
- `GET .../backendBuckets/{name}` — Get
- `PUT .../backendBuckets/{name}` — Update (full replace)
- `PATCH .../backendBuckets/{name}` — Partial update
- `DELETE .../backendBuckets/{name}` — Delete
- `GET .../backendBuckets` — List

**Backend Services:**
- `POST .../backendServices` — Create
- `GET .../backendServices/{name}` — Get
- `PUT .../backendServices/{name}` — Update (full replace)
- `PATCH .../backendServices/{name}` — Partial update
- `DELETE .../backendServices/{name}` — Delete
- `POST .../backendServices/{name}/getHealth` — Check backend health

### Key API Behaviors

- All mutating operations return a long-running Operation
- Operations URL: `https://compute.googleapis.com/compute/v1/projects/{project}/global/operations/{operation}`
- Compute operations use `status: "DONE"` (not `done: true` like other GCP APIs) — existing `isOperationDone()` handles this
- Backend services require a `fingerprint` for updates (optimistic concurrency)
- Backend buckets are global resources (no region)
- CDN policy is nested under the resource, not a separate API

### Pricing (Cloud CDN)

- **Cache egress**: $0.08/GiB (NA/EU, first 10 TiB), tiered lower at volume
- **Cache fill**: $0.01/GiB (intra-region), $0.02-0.04/GiB (inter-region)
- **HTTP/HTTPS requests**: $0.0075 per 10,000 requests
- **Cache invalidation**: Free (rate-limited)
- Cloud CDN Billing Service ID: `4ADE-D572-D8CE`

## Design Decisions

1. **Add to existing `gcp` package** — Cloud CDN is a GCP Compute service
2. **Add `COMPUTE_API_URL` to `common.ts`** — New base URL for Compute Engine API
3. **Use `enable_cdn` default true** — These entities are specifically for CDN use cases
4. **Backend bucket is simpler** — fewer fields, most common CDN pattern
5. **Backend service has `backends` array** — matches API structure for backend groups
6. **Use `backend_bucket_description`/`backend_service_description`** — `description` is reserved
7. **CDN policy fields are flattened** — not nested under a `cdn_policy` object, for simpler YAML
8. **Use PUT for updates** — Compute API prefers full-resource PUT over PATCH

## Files to Create/Modify

### New Files:
- `src/gcp/cloud-cdn-backend-bucket.ts` — Backend bucket entity
- `src/gcp/cloud-cdn-backend-service.ts` — Backend service entity

### Modified Files:
- `src/gcp/common.ts` — Add `COMPUTE_API_URL`, `CdnCacheMode`, `NegativeCachingPolicy` types
- `src/gcp/README.md` — Add Cloud CDN entities documentation
- `src/gcp/example.yaml` — Add Cloud CDN examples

### Test Files:
- `src/gcp/test/stack-template.yaml` — Add Cloud CDN test instances
- `src/gcp/test/stack-integration.test.yaml` — Add Cloud CDN test steps

## Required GCP Permissions

```
compute.backendBuckets.create
compute.backendBuckets.get
compute.backendBuckets.list
compute.backendBuckets.update
compute.backendBuckets.delete
compute.backendServices.create
compute.backendServices.get
compute.backendServices.list
compute.backendServices.update
compute.backendServices.delete
monitoring.timeSeries.list          (cost estimation)
cloudbilling.services.list          (cost estimation)
cloudbilling.services.skus.list     (cost estimation)
```

**Recommended Role**: `roles/compute.admin` (includes all compute.* permissions)

## Issues Found

- `enableCDN` vs `enableCdn` — backend services use `enableCDN` (capital CDN), backend buckets use `enableCdn` (lowercase dn). GCP Compute API inconsistency.
- `max_ttl`/`client_ttl` only allowed with `CACHE_ALL_STATIC` cache mode, not `FORCE_CACHE_ALL` or `USE_ORIGIN_HEADERS`
- `backends` field must be optional for backend service (can create with no backends and add later)
- Daemon code caching requires sufficient delay between `monk load` and `monk run` to pick up recompiled code

## Progress

- [x] Plan — created 2026-04-07
- [x] Implement — 2 entities, compiled clean
- [x] Tests — 8 test steps + 2 cleanup steps for Cloud CDN lifecycle
- [x] Manual testing — all entities pass create → ready → actions → delete
- [ ] Integration tests — skipped (manual testing confirmed full lifecycle)
- [ ] PR
- [ ] Merged
