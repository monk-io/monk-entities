# mongodb-atlas — IP Access List Entry — Implementation Summary

## Entities

| Entity | Actions | Description |
|--------|---------|-------------|
| `mongodb-atlas/ip-access-list-entry` | `get-info`, `list-entries` | Manages a single project IP access list entry (IP / CIDR / AWS security group) with full create/update/delete lifecycle |

## Files Created / Changed
- `src/mongodb-atlas/ip-access-list.ts` — new entity (`IpAccessListEntry`)
- `src/mongodb-atlas/test/ip-access-list-template.yaml` — project + CIDR entry stack
- `src/mongodb-atlas/test/ip-access-list-integration.test.yaml` — 8-step lifecycle + actions
- `src/mongodb-atlas/README.md` — documented the entity + required permissions
- `dist/mongodb-atlas/*` — regenerated (new `ip-access-list-entry.*`, MANIFEST)

## Design Notes
- One entity instance = one access-list entry, keyed by its value (idempotent CRUD).
- Reuses the existing base (auth, `makeRequest`, graceful `deleteResource`, `2025-03-12`).
- `create()` adopts a pre-existing entry (`existing: true`); `update()` is delete+recreate
  (no single-entry PATCH); `delete()` is idempotent via the base's resource-gone handling.
- Synchronous readiness (entries apply immediately) — quick existence check, no polling.
- Non-billable → no cost actions.

## Test Results
- Integration: **8/8 steps passed** (~20s) — create (CIDR `192.0.2.0/24`), readiness,
  `get-info`, `list-entries`, graceful delete. CIDR `/` URL-encoding path verified.
- No orphaned Atlas resources after teardown.

## Gotchas Confirmed
- CIDR entries require URL-encoding the `/` in GET/DELETE paths (`encodeURIComponent`).
- The create endpoint takes an **array** of entries, not a single object.

## Deferred (captured in PLAN.md)
- User-role per-database scoping: add optional `database` field to `UserDefinition` so
  roles can be scoped to a specific DB (least privilege) instead of the hardcoded `admin`.

## PR
- Branch: `feat/mongodb-atlas-ip-access-list`
- URL: _pending_
