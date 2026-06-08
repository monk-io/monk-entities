# MongoDB Atlas — IP Access List entity (+ user-role scoping enhancement) Plan

## Progress

- [x] Plan — approved 2026-06-08
- [x] Implement — `ip-access-list.ts` (`IpAccessListEntry`), compiled clean (4 entities)
- [x] Tests — `ip-access-list-template.yaml` + `ip-access-list-integration.test.yaml` (8 steps)
- [x] Integration test — 8/8 passed (~20s), CIDR URL-encoding + actions + graceful delete verified, no orphans
- [ ] PR
- [ ] Merged
- [ ] (deferred) user-role per-database scoping enhancement — captured below, not yet implemented



Adds a first-class **IP Access List** entity to the existing `mongodb-atlas` package,
and captures a related **user-role per-database scoping** enhancement. This extends an
existing package — it reuses `common.ts` and `atlas-base.ts` (auth, `makeRequest`,
`checkResourceExists`, idempotent `deleteResource`, single `2025-03-12` resource version).

## Overview
- **Module**: `src/mongodb-atlas/` (existing)
- **MANIFEST REPO**: `mongodb-atlas`
- **API base URL**: `https://cloud.mongodb.com/api/atlas/v2`
- **API version**: `2025-03-12` (single pinned media type in `common.ts`)
- **Auth**: service-account OAuth2 (inherited from `MongoDBAtlasEntity`); requires **Project Owner**
- **Default secret**: `mongodb-atlas-token`

## Motivation
Today the IP access list is a **fire-and-forget side effect** of `cluster.create()`
(`cluster.ts` `configureIPAccessList` → `POST /groups/{id}/accessList`): failures are
swallowed, changes aren't reconciled, and entries are **never removed** on teardown. The
project IP access list is the network gate — Atlas rejects all connections except from
listed IPs/CIDRs/AWS security groups. Promoting it to a managed entity gives proper
create/update/delete lifecycle, dynamic IP wiring, and time-boxed entries.

## Entities

### IpAccessListEntry
- **File**: `ip-access-list.ts`
- **Class**: `IpAccessListEntry` (defines `mongodb-atlas/ip-access-list-entry`)
- **Model**: one entity instance = **one access-list entry** (keyed by its value). Clean
  idempotent CRUD; multiple instances can target the same project.
- **API endpoints**:
  - Create: `POST /groups/{project_id}/accessList` — body is an **array** of one entry
    `[{ ipAddress | cidrBlock | awsSecurityGroup, comment?, deleteAfterDate? }]` →
    returns `{ results: [entry] }`
  - Read: `GET /groups/{project_id}/accessList/{entryValue}` → entry object
  - List: `GET /groups/{project_id}/accessList` → `{ results: [...], totalCount }`
  - Delete: `DELETE /groups/{project_id}/accessList/{entryValue}` (no response body)
  - **No single-entry PATCH** — updates (comment/deleteAfterDate) are done as delete + recreate.
- **`entryValue`**: whichever of `ipAddress` / `cidrBlock` / `awsSecurityGroup` is set.
  **CIDR must URL-encode the `/`** (`10.0.0.0/24` → `10.0.0.0%2F24`) in GET/DELETE paths.
- **Definition fields**:
  - `secret_ref: string` (from base)
  - `project_id: string` (required)
  - `ip_address?: string` — exactly one of these three must be set:
  - `cidr_block?: string`
  - `aws_security_group?: string`
  - `comment?: string` (maps to `comment`; avoid the reserved name `description`)
  - `delete_after?: string` — ISO-8601; maps to `deleteAfterDate` for time-boxed access
- **State fields**: `project_id`, `entry_value`, `kind` (`ip`|`cidr`|`sg`), `comment`, `existing`
- **create()**: validate exactly one of the three values; check existing via GET entry
  (set `existing=true` if found); else POST the single-element array; store `entry_value`.
- **update()**: if `comment`/`delete_after` changed, delete + recreate the entry (no PATCH).
- **delete()**: `deleteResource("/groups/{project_id}/accessList/{entryValue}", ...)` —
  inherited graceful 404 handling makes it idempotent.
- **Readiness**: **synchronous** — entries apply immediately. `checkReadiness` = GET entry
  returns 200. No async polling, no `static readiness` tuning needed beyond defaults.
- **Custom actions**: `get-info` (print the entry), `list-entries` (list all entries in the
  project — useful for auditing). Optional.
- **Required permissions**: service account needs **Project Owner** (`Project IP Access List
  Admin` is implied). API actions: create/list/get/delete access-list entries.
- **Cost estimation**: **none** — IP access list is free. Per cost-action convention, only
  billable entities need `get-cost-estimate`/`costs`; this entity omits them.
- **Notes / quirks**:
  - POST body is an **array**, not a single object (matches existing `cluster.ts` usage).
  - CIDR `/` URL-encoding is the main correctness gotcha for GET/DELETE.
  - `0.0.0.0/0` is valid but opens the project to the internet — document as demo-only.
  - Reserved names: do **not** use `description` or `type` as fields (use `comment`).

## Related enhancement (separate, capture now)

### User-role per-database scoping (`user.ts`)
**Limitation today**: `user.ts` hardcodes the role's `databaseName: "admin"`, so a plain
`readWrite` is scoped to the `admin` auth DB and cannot write to app databases — you must
use `readWriteAnyDatabase`/`atlasAdmin` (this bit the example app this cycle).

**Enhancement**: add an optional `database?: string` field to `UserDefinition`. When set,
build the role as `{ databaseName: <database>, roleName: <role> }` so users can be granted
least-privilege `readWrite` on a single application database. Default remains `admin` for
backward compatibility. Optionally support a `roles[]` array for multiple scoped roles.
- Backward compatible: omitting `database` preserves current behavior.
- Update `user.ts` `create()` role construction + state `roles`.
- Note: changing roles on an existing user needs a `PATCH /databaseUsers/.../{user}` with the
  new `roles` array (today `update()` only re-reads).

## Implementation Order
1. `ip-access-list.ts` — new entity (reuses existing base/common).
2. Add to package: appears automatically in generated `MANIFEST` on compile.
3. (Optional, follow-up) Refactor `cluster.ts`: deprecate the inline `configureIPAccessList`
   side effect in favor of standalone entities, or keep `allow_ips` as a convenience that is
   documented as not-lifecycle-managed.
4. (Separate change) `user.ts` per-database role scoping enhancement.

## Required Permissions (SaaS / Atlas)
Service account (or API key) must hold **Project Owner** on the target project. This covers:
- `Add Entries to Project IP Access List` (POST)
- `Return All / One Project IP Access List Entries` (GET)
- `Remove One Entry from Project IP Access List` (DELETE)

No cloud-provider IAM and no `pricing`/metrics permissions needed (entity is non-billable).

## Risks and Gotchas
- **CIDR URL-encoding** in single-entry GET/DELETE paths (`/` → `%2F`).
- **POST body is an array** — sending a bare object will 400.
- **No PATCH for a single entry** — comment/deleteAfterDate changes require delete + recreate.
- **Reserved property names** — use `comment`, never `description`/`type`.
- **Shared project list** — multiple entry entities and `cluster.allow_ips` all write to the
  same project list; deleting one entity must only remove its own entry (key by value).
- **Mutual exclusivity** — validate exactly one of `ip_address`/`cidr_block`/`aws_security_group`.

## Test Plan
- **Credentials**: `MONGODB_ATLAS_TOKEN` (clientId:clientSecret) with Project Owner; org `Monk`.
- **Flow**: create project → create `ip-access-list-entry` (e.g. a CIDR) → readiness (GET 200)
  → `get-info`/`list-entries` action → update comment (delete+recreate) → delete (idempotent)
  → delete project.
- **Readiness time**: immediate (synchronous) — no provisioning wait.
- **Dependencies**: entry depends on project (`project_id` via
  `connection-target("project") entity-state get-member("id")`).
- **No cost** to test (free resource); no cluster required, so fast.
