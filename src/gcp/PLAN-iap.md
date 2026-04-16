# GCP Identity-Aware Proxy (IAP) — Plan

Adds five IAP entities to the existing `src/gcp/` package.

## Entities

| Entity | Description |
|--------|-------------|
| `gcp/iap-brand` | OAuth brand (consent screen) — adopt existing only |
| `gcp/iap-oauth-client` | IAP OAuth client under a brand; CRUD + rotate |
| `gcp/iap-settings` | Per-resource IAP settings (AccessSettings/ApplicationSettings) |
| `gcp/iap-tunnel-dest-group` | TCP tunnel destination group (cidrs/fqdns) |
| `gcp/iap-access-policy` | IAM binding for a `(target, role)` pair on an IAP-protected resource |

## API

- **Base URL:** `https://iap.googleapis.com/v1`
- **Auth:** GCP builtin (`gcp.get()`, `gcp.post()`, etc.)
- **Brand:** `projects/{project}/brands`
- **OAuth client:** `projects/{project}/brands/{brand}/identityAwareProxyClients[/{id}][:resetSecret]`
- **IAP settings:** `GET|PATCH /v1/{name=**}:iapSettings` (PATCH requires `updateMask` query param)
- **Tunnel dest group:** `projects/{project}/iap_tunnel/locations/{location}/destGroups[/{id}]`
- **IAM:** `POST /v1/{resource=**}:getIamPolicy` and `:setIamPolicy`

Synchronous (no long-running operations on any IAP endpoint).

## Target resource paths

Used by `iap-settings` and `iap-access-policy`. All require GCP **project number** (not ID) — the entity auto-resolves via Resource Manager `GET /v1/projects/{id}`.

| Kind | Path |
|------|------|
| `app-engine` (app-wide) | `projects/{PN}/iap_web/appengine-{APP_ID}` |
| `app-engine-service` | `…/services/{SERVICE}` |
| `compute` (global BE) | `projects/{PN}/iap_web/compute/services/{BE_ID}` |
| `compute-regional` | `projects/{PN}/iap_web/compute-{REGION}/services/{BE_ID}` |
| `cloud-run` | `projects/{PN}/iap_web/cloud_run-{REGION}/services/{NAME}` |
| `project` (whole IAP) | `projects/{PN}/iap_web` |
| `organization` | `organizations/{ORG_ID}/iap_web` |
| `folder` | `folders/{FOLDER_ID}/iap_web` |
| `raw` | `resource_path` passed through verbatim (escape hatch) |

Definition shape: `{ target_kind, app_id?, service?, backend_service?, region?, cloud_run_service?, organization_id?, folder_id?, resource_path? }`.

## Entity details

### `iap-brand` (adopt-only)

**Definition fields:** none beyond base `GcpEntityDefinition` (`project?`).

**State fields:** `brand_name` (full resource name), `brand_id` (trailing segment), `application_title`, `support_email`, `org_internal_only`, `existing: true` always.

**Lifecycle:** `create()` lists brands; if exactly one found, adopt (set `brand_id`). If none, throw a clear error pointing to Cloud Console. `delete()` is a no-op (never created). `checkReadiness()` returns true when `brand_id` is set.

**Actions:** `get-info`.

### `iap-oauth-client`

**Definition fields:**
- `brand_id` (string, required) — usually from `connection-target("brand") entity-state get-member("brand_id")`
- `display_name` (string, required)
- `secret_ref` (string, required) — Monk secret where the OAuth client secret is written

**State fields:** `client_name` (full resource name), `client_id` (trailing segment), `existing?`.

**Lifecycle:** `create()` lists clients under brand, matches by `displayName`; if found, adopt and call `:resetSecret` + store. If not, POST create, store `secret` from response. `update()` — displayName is immutable; if changed, throw error. `delete()` DELETE unless `existing`.

**Actions:** `get-info`, `reset-secret` (rotates and re-stores), `get-secret` (prints secret name, NOT value).

### `iap-settings`

**Definition fields:** target resolution fields (see table above), plus optional nested settings:
- `access_settings`: `{ cors_settings, oauth_settings, reauth_settings, allowed_domains_settings, gcip_settings, identity_sources }`
- `application_settings`: `{ access_denied_page_settings, cookie_domain, attribute_propagation_settings, csm_settings }`

**State fields:** `resource_name`, `prior_settings?` (snapshot of pre-existing settings, restored on delete if `existing=true`), `existing?`.

**Lifecycle:** `create()` GETs current settings — if any non-empty field present, snapshot as `prior_settings` and set `existing=true`. PATCH with our values + `updateMask` from defined fields. `update()` rebuilds `updateMask` from changed top-level paths. `delete()` restores `prior_settings` if present, else PATCH clearing `accessSettings` and `applicationSettings`.

**Actions:** `get-info`, `show-raw` (prints full GET response).

### `iap-tunnel-dest-group`

**Definition fields:** `name` (identifier, lowercase + dashes), `location` (required), `cidrs?`, `fqdns?`.

**State fields:** `group_name` (full resource name), `existing?`.

**Lifecycle:** standard CRUD. PATCH with `updateMask=cidrs,fqdns` for updates. `checkReadiness()` GET returns 200.

**Actions:** `get-info`, `list-cidrs`.

### `iap-access-policy`

**Definition fields:**
- target resolution fields (same as iap-settings)
- `role` (string, required) — e.g., `roles/iap.httpsResourceAccessor`
- `members` (string[], required) — e.g., `["user:alice@example.com", "serviceAccount:svc@proj.iam.gserviceaccount.com"]`

**State fields:** `resource_name`, `managed_role`, `prior_had_binding: boolean`, `existing?`.

**Lifecycle:** `create()` POST `:getIamPolicy` on target, find/create binding for `role`, set members to definition.members, POST `:setIamPolicy` with etag. Save whether binding existed. `update()` same as create. `delete()` fetch policy, remove the binding entirely (unless `prior_had_binding`, in which case leave original binding — best-effort; we track only ADDED members).

To keep this manageable: store `added_members` in state (members we added that didn't exist before). On delete, remove those members only; leave the rest untouched. If no members remain, drop the binding.

**Actions:** `get-info`, `list-members`, `add-member` (args: `member`), `remove-member` (args: `member`).

### Shared helper: `iap-common.ts`

- `IAP_API_URL` constant
- `resolveProjectNumber(projectId)` — cached Resource Manager lookup
- `buildIapTargetPath(def, projectNumber)` — switch on `target_kind`, return the resource path
- `buildUpdateMask(obj, prefix)` — walk an object, return comma-separated JSON field paths

## Definition field naming

All snake_case per `doc/entity-conventions.md`. Avoid `type` — use `target_kind`.

## Secrets

- `iap-oauth-client.secret_ref` is **written** — requires `permitted-secrets: { <ref>: true }`.
- No read-side secrets needed (GCP builtin handles auth).

## Testing strategy

Stack template creates in dependency order:
1. `iap-brand` — adopts existing brand in test project
2. `iap-oauth-client` — creates under brand, stores secret
3. `iap-tunnel-dest-group` — simple CRUD, region-scoped
4. `iap-access-policy` — binds `roles/iap.httpsResourceAccessor` to a test member on `projects/{PN}/iap_web` (project-wide — always exists)
5. `iap-settings` — **optional/skipped in CI** unless a target resource is pre-provisioned (App Engine default service would work; requires project setup)

Test file exercises: create → ready → actions (reset-secret, add-member, remove-member, list-members) → delete.

## Required IAM permissions

- `iap.settings.get`, `iap.settings.update` (on target)
- `iap.admin` (full) or equivalents: `iap.web.*`, `iap.tunnel.*`
- `clientauthconfig.brands.list`, `clientauthconfig.clients.*`
- `resourcemanager.projects.get` (for project number)

## Progress

- [x] Plan — approved 2026-04-16
- [x] Implement — 5 entities + `iap-common.ts`, compiled clean (31 entities total in gcp package)
- [x] Tests — `test/iap-template.yaml` + `test/iap-integration.test.yaml` (21 test steps)
- [x] Manual testing — tunnel-dest-group full lifecycle; brand error path verified; access-policy blocked on perms
- [x] Integration tests — 10/10 passed (44.7s) covering CI-safe subset (IAP API enable + tunnel-dest-group)
- [ ] PR
- [ ] Merged

## Issues Found

- **IAP API must be explicitly enabled** — `iap.googleapis.com` was not enabled on the test project. Added step 0 to the test template: `enable-iap-api` via `gcp/service-usage`. Also added `iap.googleapis.com` and `clientauthconfig.googleapis.com` to the `GcpApiServiceName` enum in `common.ts`.
- **Bare identifiers in member lists parsed as runnable refs** — `members: [allAuthenticatedUsers]` without quotes triggered "runnable not defined" warning. Fixed by quoting: `members: ["allAuthenticatedUsers"]`. Will note in the entity README.
- **OAuth consent screen prerequisite** — the test GCP project had no OAuth consent screen configured, so `iap-brand` throws cleanly with a pointer to the Cloud Console. Entity behavior is correct; this is a project setup requirement.
- **IAP IAM permissions for access-policy** — the monk cluster service account on the test project lacks `iap.webTypes.getIamPolicy` / `setIamPolicy`. `iap-access-policy` fails with 403 on `getIamPolicy`. Fix: grant `roles/iap.admin` (or narrower IAM policy) to the monk service account. Added to README as a required role.

## Manual test results

| Entity | Create | Ready | Actions | Delete | Notes |
|--------|--------|-------|---------|--------|-------|
| `iap-brand` | — | — | — | — | Error path verified: throws clear remediation message when no brand exists |
| `iap-oauth-client` | ⏭️ | ⏭️ | ⏭️ | ⏭️ | Skipped: requires OAuth consent screen |
| `iap-tunnel-dest-group` | ✅ | ✅ | ✅ (get-info, list-cidrs) | ✅ | Full lifecycle works |
| `iap-access-policy` | ⚠️ | — | — | — | 403 — test project SA needs `roles/iap.admin` |
| `iap-settings` | ⏭️ | ⏭️ | ⏭️ | ⏭️ | Skipped: requires an existing IAP-protected resource target |
