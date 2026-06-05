# mongodb-atlas: Flex support + API modernization — design

**Date:** 2026-06-05
**Status:** Approved

## Problem

The `mongodb-atlas` cluster entity is shipping a broken path: `instance_size` offers
`M2`/`M5`, but those shared tiers reached End-of-Life on **2026-01-22** and the Atlas
Admin API no longer creates them. The package also pins a 3-year-old resource version
(`2023-01-01`) for most calls and lacks support for **Flex** clusters (the modern
replacement for M2/M5 and serverless). Resource cleanup also emits spurious errors when a
resource is already gone (404 `GROUP_NOT_FOUND`).

## Goals

1. **Correctness:** add Flex cluster support; remove dead M2/M5 tiers.
2. **Modernize:** standardize on a single current resource version (`2025-03-12`).
3. **Targeted base cleanup:** simplify `makeRequest`; make deletes idempotent.

Non-goals: new entity types beyond Flex routing; full base rewrite to the neon/workos
shape (those bases don't handle per-resource versioning, so a wholesale copy would
regress Atlas).

## Design

### `common.ts`
- Single version constant: `API_VERSION = "application/vnd.atlas.2025-03-12+json"`.
  Remove the `API_VERSION_2025` dual split. `BASE_URL`, `getToken`, `getOrganization`
  unchanged.

### `atlas-base.ts`
- `makeRequest`: always use the single 2025-03-12 media type for `Accept` and (on writes)
  `Content-Type`. Delete the `isClusterRequest()` version switch.
- `deleteResource`: treat HTTP 404 / errorCode `*_NOT_FOUND` / "does not exist" as success
  (idempotent delete) via a new `isResourceGoneError()` helper. Eliminates cleanup noise
  when the parent group is already deleted.
- `before()`, `checkResourceExists`, `start`/`stop` unchanged.

### `cluster.ts`
- `instance_size`: `"M0" | "FLEX" | "M10" | "M20" | "M30" | "M40" | "M50" | "M60" | "M80"`
  (M2/M5 removed).
- `clusterPath()` helper routes by tier:
  - **FLEX** → `POST /groups/{id}/flexClusters`, body
    `{ name, providerSettings: { backingProviderName: provider, regionName: region } }`.
    Get/update/delete under `/flexClusters/{name}`.
  - **M0** → `/clusters` with `providerName: TENANT` (unchanged).
  - **M10+** → `/clusters` dedicated (unchanged).
- `update`/`delete`/`checkReadiness`/`checkLiveness` use `clusterPath()`. Flex GET returns
  the same `stateName` / `connectionStrings` shape, so readiness logic is shared.
- `validateBackupSupport()`: allow only M10+ dedicated (reject M0 and FLEX). Flex gets
  automatic snapshots not managed by these on-demand actions.

### `project.ts` / `user.ts`
- No structural change; they now ride `2025-03-12`. Re-validate `groups` create
  (`withDefaultAlertsSettings`) and `databaseUsers` create payloads under the new version.

### Tests + docs
- Re-run `stack-integration.test.yaml` (M0 — no extra cost) to validate version bump, base
  refactor, and graceful delete end-to-end. Confirm the 404 cleanup noise is gone.
- Optionally add a Flex cluster test (Flex is billable but minor) — confirm before
  provisioning.
- Update `README.md` instance-size table: drop M2/M5, add FLEX.

## Risks

- **Version bump (highest):** payload shapes for `groups`/`databaseUsers` could differ under
  `2025-03-12`. Mitigated by the M0 integration test. Flex payload is unverified unless a
  Flex test runs.
- Local monkec runner requires the full `input/<pkg>/test/...` template path workaround (see
  memory `project_monkec_test_dir_local`); not committed.

## Validation checklist

- [ ] `monkec compile` clean
- [ ] `stack-integration.test.yaml` passes (M0) with no 404 cleanup noise
- [ ] (optional) Flex test passes
- [ ] README updated
