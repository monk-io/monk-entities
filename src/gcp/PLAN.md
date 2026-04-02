# GCP Cloud DNS — Integration Plan

## Overview

Add Cloud DNS managed zone and DNS record set entities to the existing `gcp` package. Cloud DNS is Google Cloud's scalable, reliable DNS service for publishing domain names to the global DNS.

**API**: Cloud DNS REST API v1 (`https://dns.googleapis.com/dns/v1`)
**Auth**: GCP builtin (`cloud/gcp`) — OAuth2 auto-signed, no secrets needed
**Package**: `src/gcp/` (existing GCP package)

## Entities

### 1. `gcp/cloud-dns-zone` — Managed DNS Zone

Manages GCP Cloud DNS managed zones (public or private DNS zones).

**API Base**: `https://dns.googleapis.com/dns/v1/projects/{project}/managedZones`

**Definition:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Zone name (1-63 chars, letters/digits/dashes) |
| `dns_name` | string | yes | DNS name with trailing dot (e.g., "example.com.") |
| `zone_description` | string | no | User annotation (up to 1024 chars) |
| `visibility` | "public" \| "private" | no | Zone visibility (default: "public") |
| `dnssec_enabled` | boolean | no | Enable DNSSEC |
| `labels` | Record<string, string> | no | User labels |
| `networks` | string[] | no | VPC network self-links for private zones |
| `logging_enabled` | boolean | no | Enable query logging |

**State:**
| Field | Type | Description |
|-------|------|-------------|
| `zone_id` | string | Server-generated zone ID |
| `name_servers` | string[] | Assigned nameservers |
| `existing` | boolean | Pre-existed before entity |

**Actions:**
- `get-info` — Display zone details, nameservers, DNSSEC status
- `list-record-sets` — List all DNS records in the zone
- `get-cost-estimate` — Pricing breakdown (per-zone + per-query)
- `costs` — Standardized JSON cost output

**Lifecycle:**
- `create()` — GET by name to check existence, POST to create if not found
- `update()` — PATCH with description, labels, DNSSEC, logging changes
- `delete()` — DELETE (skip if existing=true)
- `checkReadiness()` — GET returns zone with nameServers populated

### 2. `gcp/cloud-dns-record-set` — DNS Record Set

Manages individual DNS resource record sets within a managed zone.

**API Base**: `https://dns.googleapis.com/dns/v1/projects/{project}/managedZones/{zone}/rrsets`

**Definition:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `zone_name` | string | yes | Managed zone name (short name, not full path) |
| `record_name` | string | yes | DNS record name with trailing dot (e.g., "www.example.com.") |
| `record_type` | string | yes | Record type (A, AAAA, CNAME, MX, TXT, NS, SOA, SRV, CAA, PTR) |
| `ttl` | number | no | Time-to-live in seconds (default: 300) |
| `rrdatas` | string[] | yes | Record data values |

**State:**
| Field | Type | Description |
|-------|------|-------------|
| `record_name` | string | Full DNS name of the record |
| `record_type` | string | Record type |
| `existing` | boolean | Pre-existed before entity |

**Actions:**
- `get-info` — Display record details (name, type, TTL, data)

**Lifecycle:**
- `create()` — GET by name+type to check existence, POST to create if not found
- `update()` — PATCH with new TTL/rrdatas
- `delete()` — DELETE by name+type (skip if existing=true)
- `checkReadiness()` — GET returns the record

**Composition:**
- Reads `zone_name` from definition (short name like "my-zone")
- Can compose with `gcp/cloud-dns-zone` via `connection-target("zone") entity-state get-member("zone_id")`
  - But since the API uses zone name (not ID), the simpler pattern is to pass the zone name directly

## API Details

### Cloud DNS API v1 Endpoints

**ManagedZones:**
- `POST /dns/v1/projects/{project}/managedZones` — Create zone
- `GET /dns/v1/projects/{project}/managedZones/{managedZone}` — Get zone
- `GET /dns/v1/projects/{project}/managedZones` — List zones
- `PATCH /dns/v1/projects/{project}/managedZones/{managedZone}` — Update zone
- `DELETE /dns/v1/projects/{project}/managedZones/{managedZone}` — Delete zone

**ResourceRecordSets:**
- `POST /dns/v1/projects/{project}/managedZones/{managedZone}/rrsets` — Create record
- `GET /dns/v1/projects/{project}/managedZones/{managedZone}/rrsets/{name}/{type}` — Get record
- `GET /dns/v1/projects/{project}/managedZones/{managedZone}/rrsets` — List records
- `PATCH /dns/v1/projects/{project}/managedZones/{managedZone}/rrsets/{name}/{type}` — Update record
- `DELETE /dns/v1/projects/{project}/managedZones/{managedZone}/rrsets/{name}/{type}` — Delete record

### Key API Behaviors

- Zone names are globally unique within a project
- Record sets are identified by `name` + `type` within a zone
- Zone creation is synchronous (no LRO)
- DNSSEC config is part of the zone resource
- Record `name` must end with a trailing dot
- `rrdatas` is an array of strings (format depends on record type)

### Pricing (Cloud DNS)

- **Managed zones**: $0.20/zone/month (first 25 zones), $0.10/zone/month (additional)
- **Queries**: $0.40/million queries/month (first 1B), $0.20/million (additional)
- No free tier for Cloud DNS

## Design Decisions

1. **Add to existing `gcp` package** — Cloud DNS is a GCP service, fits with other GCP entities
2. **Add `CLOUD_DNS_API_URL` to `common.ts`** — Follow existing pattern for API base URLs
3. **Use `zone_name` not `managed_zone`** — Shorter, clearer, consistent with other entity naming
4. **Use `record_type` not `type`** — `type` is a reserved JSON Schema keyword
5. **Use `zone_description` not `description`** — `description` is reserved by Monk
6. **No routing policy support initially** — Complex feature (geo, WRR, primary-backup), add later
7. **Record set identifies by name+type** — API's natural key, no separate ID needed

## Files to Create/Modify

### New Files:
- `src/gcp/cloud-dns-zone.ts` — Managed zone entity
- `src/gcp/cloud-dns-record-set.ts` — Record set entity

### Modified Files:
- `src/gcp/common.ts` — Add `CLOUD_DNS_API_URL` constant
- `src/gcp/README.md` — Add Cloud DNS entities documentation
- `src/gcp/example.yaml` — Add Cloud DNS examples

### Test Files:
- `src/gcp/test/stack-template.yaml` — Update with Cloud DNS test instances
- `src/gcp/test/stack-integration.test.yaml` — Update with Cloud DNS test steps

## Required GCP Permissions

```
dns.managedZones.create
dns.managedZones.get
dns.managedZones.list
dns.managedZones.update
dns.managedZones.delete
dns.resourceRecordSets.create
dns.resourceRecordSets.get
dns.resourceRecordSets.list
dns.resourceRecordSets.update
dns.resourceRecordSets.delete
monitoring.timeSeries.list          (cost estimation)
cloudbilling.services.list          (cost estimation)
cloudbilling.services.skus.list     (cost estimation)
```

**Recommended Role**: `roles/dns.admin` (includes all dns.* permissions)

## Progress

- [x] Plan — created 2026-04-02
- [x] Implement — 2 entities, compiled clean, MANIFEST LOAD order fixed
- [x] Tests — 8 test steps + 2 cleanup steps for Cloud DNS lifecycle
- [x] Manual testing — all entities pass create → ready → actions → delete
- [x] Integration tests — 10/10 Cloud DNS steps passed (total suite: 56/58, 2 pre-existing Cloud SQL failures)
- [x] PR — #182
- [ ] Merged
