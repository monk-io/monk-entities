# Auth0 Integration Plan

## Overview

Port the existing legacy Auth0 integration (`auth0/` — raw JS runnables loaded via
`auth0/auth0-applications.yaml`, MANIFEST `monk-auth0`) to a proper MonkEC TypeScript
package at `src/auth0/`, following this repo's standard entity conventions.

- **Module**: `src/auth0/`
- **MANIFEST REPO**: `auth0` (just the package name)
- **API base URL**: `https://{domain}/api/v2` (per-tenant; `domain` is a required Definition field, e.g. `your-tenant.auth0.com`)
- **API version**: Management API v2
- **Auth**: OAuth2 client_credentials grant against `https://{domain}/oauth/token`, audience `https://{domain}/api/v2/`, using an Auth0 **Machine-to-Machine application's** client ID/secret (not a single static API key like Clerk/WorkOS). The resulting Bearer token is used for all Management API calls.
- **Default secrets**: `auth0-management-client-id`, `auth0-management-client-secret` (M2M app credentials — see "Auth vs. Clerk/WorkOS" below)

The legacy package already covers two resources — `application` (OAuth client) and
`resource-server` (API) — plus a `rotate-secret` action I just added to the legacy
`application` entity. This plan carries both resources and that action over to the
new TS package, correcting a few things the legacy code got wrong or left dead along
the way (see Risks and Gotchas).

## Auth vs. Clerk/WorkOS (why no simple `credentials` entity)

Clerk and WorkOS authenticate with a single static secret key read straight from
Monk secrets. Auth0's Management API instead requires exchanging M2M client
credentials for a short-lived Bearer token (`POST /oauth/token`), per tenant
domain. This means:

- The base class's `before()` must fetch a token (not just read a secret) before
  building the `HttpClient`.
- There is no cheap "validate credentials" read the way Clerk's `/instance` or
  WorkOS's org list works — the token exchange itself is the validation. A
  `credentials` entity would just do the same token fetch with no extra output, so
  **this plan does not add one** (skips the pattern used in Clerk/WorkOS
  `credentials.ts`). Each entity fetches its own token in `before()`; if we see
  redundant token fetches across many entities in the same stack later, this can
  be revisited (e.g. a shared token-cache keyed by domain+client_id).

## Entities

### Application (Auth0 Client)

- **File**: `application.ts`
- **Class**: `Application`
- **API endpoints** (all under `https://{domain}/api/v2`):
  - Create: `POST /clients` → client object incl. `client_id`, `client_secret`
  - Read: `GET /clients/{id}`
  - Update: `PATCH /clients/{id}`
  - Delete: `DELETE /clients/{id}`
  - List (existence check by name): `GET /clients?fields=client_id,name`
  - Rotate secret: `POST /clients/{id}/rotate-secret` → client object with new `client_secret`
- **Definition fields**:
  - `domain: string` — tenant domain (base entity)
  - `management_client_id_ref?: string` — secret name for M2M client ID (default `auth0-management-client-id`)
  - `management_client_secret_ref?: string` — secret name for M2M client secret (default `auth0-management-client-secret`)
  - `name: string` — application name
  - `app_type?: string` — enum: native/spa/regular_web/non_interactive (default `regular_web`)
  - `callback_urls?: string[]` — maps to Auth0's `callbacks`
  - `allowed_logout_urls?: string[]`
  - `allowed_origins?: string[]`
  - `web_origins?: string[]`
  - `grant_types?: string[]`
  - `logo_uri?: string`
  - `cross_origin_authentication?: boolean`
  - `token_endpoint_auth_method?: string` — enum: none/client_secret_post/client_secret_basic
  - `client_secret_ref?: string` — Monk secret name to store the client secret (default `auth0-client-secret`)
- **State fields**:
  - `client_id?: string`
  - `client_secret_secret?: string` — name of the Monk secret holding the current client secret (composition pointer, mirrors Clerk's `client_secret_secret`)
  - `name?: string`, `app_type?: string`, `callback_urls?: string[]`, etc. — echoed config for composition
  - `existing?: boolean`
- **Readiness**: `checkReadiness()` returns `Boolean(state.client_id)` — matches legacy's cheap check (legacy separately pinged `/.well-known/openid-configuration`, which validates the *tenant domain*, not the client; that's redundant with the token fetch already required in `before()`, so it's dropped — see Gotchas).
- **Custom actions**:
  - `get-info` — `GET /clients/{id}`, prints JSON
  - `patch(args: Args)` — targeted field update from action args (string key/value pairs), for runtime-computed values a static Definition can't express (e.g. a dependent runnable's own domain — see legacy `example.yaml`'s `start` hook). Mirrors legacy `patchApplication`.
  - `rotate-secret` — `POST /clients/{id}/rotate-secret`, then `secret.set(client_secret_ref, result.client_secret)` and update `state.client_secret_secret`. Same pattern as `src/clerk/oauth-application.ts` and `src/gcp/iap-oauth-client.ts`.
  - `get-cost-estimate` / `costs` — static $0 non-estimate with an explanatory note (see "Cost actions — decision" below); no API calls.
- **Required permissions** (Auth0 M2M app scopes, grant on the Auth0 Management API "resource server" in the Auth0 dashboard):
  - `read:clients`, `create:clients`, `update:clients`, `delete:clients`
  - `update:client_keys` (required specifically for `rotate-secret`; note the endpoint **cannot** be used on clients configured with Private Key JWT auth)
- **Cost estimation**: see "Cost actions — decision" below (implemented as a static non-estimate, not a real pricing lookup).
- **Notes**:
  - Reserved-name conflict: legacy YAML already avoided `type`/`description` by using `app-type`; keep `app_type` in the TS port (not `type`).
  - Auth0 client secrets are stored in a Monk secret (`client_secret_ref`) rather than left in plain state, unlike the legacy JS which put `client_secret` directly into state. This is a deliberate improvement to match `doc/entity-conventions.md` and the Clerk OAuth-application pattern — flagging as a behavior change from the legacy package, not a straight port.

### ResourceServer (Auth0 API)

- **File**: `resource-server.ts`
- **Class**: `ResourceServer`
- **API endpoints**:
  - Create: `POST /resource-servers` → object incl. `id`, `identifier`
  - Read: `GET /resource-servers/{id}`
  - Update: `PATCH /resource-servers/{id}`
  - Delete: `DELETE /resource-servers/{id}`
  - List (existence check by identifier): `GET /resource-servers`
- **Definition fields**:
  - `domain`, `management_client_id_ref`, `management_client_secret_ref` (base entity, shared with Application)
  - `name: string`
  - `identifier: string` — the API audience URI (legacy called this `audience`; renamed to match Auth0's actual field name — see Gotchas)
  - `scopes?: { value: string, scope_description?: string }[]`
- **State fields**: `resource_server_id?: string`, `identifier?: string`, `name?: string`, `existing?: boolean`
- **Readiness**: `Boolean(state.resource_server_id)`
- **Custom actions**:
  - `get-info` (`GET /resource-servers/{id}`)
  - `get-cost-estimate` / `costs` — static $0 non-estimate with an explanatory note (see "Cost actions — decision" below); no API calls.
- **Required permissions**: `read:resource_servers`, `create:resource_servers`, `update:resource_servers`, `delete:resource_servers`
- **Cost estimation**: see "Cost actions — decision" below (implemented as a static non-estimate, not a real pricing lookup).
- **Notes**:
  - Legacy schema required a `client-id` field on `resource-server` that was never actually sent to the Auth0 API (resource servers don't have a client ID of their own — that's an application concept). **Dropped** in the port; flagging here so it's an intentional removal, not an oversight.
  - Legacy `updateResourceServer` only ever PATCHed `name` and `scopes`, even though other fields (`signing_alg`, `token_lifetime`, etc.) exist on the Auth0 resource-server object. This plan keeps parity with legacy scope (name + scopes) rather than expanding the surface; can be extended later if needed.
  - Unlike legacy (which sent `scopes` as bare strings — invalid against Auth0's actual `{value, description}` object shape), this implementation sends proper `{value, description}` objects, fixing a real bug. Reading `scopes` off the Definition needs a `collectArray()` workaround for a Monk runtime limitation — see Issues Found.

## Shared base: `auth0-base.ts`

```ts
export interface Auth0EntityDefinition {
  domain: string;                          // tenant domain, e.g. your-tenant.auth0.com
  management_client_id_ref?: string;       // default: auth0-management-client-id
  management_client_secret_ref?: string;   // default: auth0-management-client-secret
}

export interface Auth0EntityState {
  existing?: boolean;
}

export abstract class Auth0Entity<D extends Auth0EntityDefinition, S extends Auth0EntityState>
  extends MonkEntity<D, S> {
  protected httpClient!: HttpClient;

  protected override before(): void {
    // 1. secret.get() both management_client_*_ref values (fall back to defaults)
    // 2. POST https://{domain}/oauth/token (client_credentials grant, audience https://{domain}/api/v2/)
    // 3. build HttpClient({ baseUrl: `https://${domain}/api/v2`, headers: { Authorization: `Bearer ${token}` }, ... })
  }

  protected makeRequest(method: string, path: string, body?: Record<string, any>): any {
    // same wrap-and-throw pattern as ClerkEntity.makeRequest / WorkosEntity equivalent
  }
}
```

## Implementation Order

1. `auth0-base.ts` — token exchange + HttpClient + `makeRequest` helper
2. `application.ts` — most complete resource, exercises secret storage + rotate-secret
3. `resource-server.ts` — simpler CRUD, no secrets

## Cost actions — decision

Auth0 billing is **per-tenant subscription tier** (Free / Essential / Professional /
Enterprise), priced by MAU (monthly active users) bands across the whole tenant —
not per-application or per-resource-server usage. There's no meaningful way to
attribute a dollar cost to a single `application` or `resource-server` entity the
way `get-cost-estimate`/`costs` do for e.g. an RDS instance.

**Decision: implement both actions on both entities anyway**, to satisfy the
`doc/cost-estimation.md` convention that every billable entity exposes them, but
have them report $0 with an explicit note rather than a guessed number:

- `get-cost-estimate` — human-readable output stating: "Auth0 billing is tenant-wide
  (MAU-based subscription tier), not attributable to this individual
  application/resource-server. No per-entity cost estimate is available."
- `costs` — standard JSON shape from `doc/cost-estimation.md`, with
  `amount: "0"` and an `error`/`note` field carrying the same explanation, e.g.:
  ```json
  { "type": "auth0/application", "costs": { "month": { "amount": "0", "currency": "USD", "error": "Auth0 billing is tenant-wide, not per-entity" } } }
  ```

No live pricing API call is involved — this is a static, honest non-estimate, not a
hardcoded pricing table.

## Risks and Gotchas

- **Reserved property names**: avoid `type`/`description` at the top level — already handled by using `app_type` (legacy convention, kept).
- **`identifier` vs `audience` rename**: legacy `resource-server` Definition called the audience URI `audience`; Auth0's actual API field is `identifier`. Renaming for clarity/correctness — update anything that referenced the legacy `audience` property name.
- **Dead fields dropped**: legacy `application.default-scopes` and `resource-server.client-id` were declared in the schema but never sent to the Auth0 API in the JS implementation. Not carried over.
- **`update:client_keys` scope**: rotate-secret needs a scope beyond the base `update:clients` — must be called out in the M2M app's API authorization in Auth0, or rotation will 403.
- **Rate limits**: 2 req/s (burst 10) on free/trial tenants, 15 req/s (burst 50) on paid tenants — relevant for integration tests hitting `create → wait → action → delete` back to back across two entities; keep test suites modest in step count.
- **Token lifetime**: M2M tokens are typically valid ~24h; since each Monk action invocation is a fresh process, `before()` re-fetching a token every call is correct (no stale-token risk) but means every single action costs one extra `/oauth/token` call — acceptable at this scale, not worth caching.
- **Private Key JWT clients**: `rotate-secret` 400s if the client's `token_endpoint_auth_method` is set to a Private Key JWT config; not a concern here since this Definition doesn't expose that auth method as an option (only none/client_secret_post/client_secret_basic), but worth a code comment.

## Test Plan

- Credentials needed (`.env` in `src/auth0/test/`): an Auth0 M2M application's
  client ID/secret, authorized for the Auth0 Management API with the scopes listed
  above, plus the tenant `domain`.
- Expected test flow:
  1. `application`: create → wait ready → `get-info` → `rotate-secret` (assert
     `client_secret_secret`'s value changed) → `patch` (change `web_origins`) →
     delete
  2. `resource-server`: create → wait ready → `get-info` → delete
- No dependency between the two test entities (independent resources); can run in
  parallel test steps.
- Estimated readiness time: near-instant for both (Management API writes are
  synchronous, no async provisioning) — same as legacy's immediate `ready: true`.

## Progress

- [x] Plan
- [x] Implement — 2 entities (`Application`, `ResourceServer`), 6 files (`auth0-base.ts`, `common.ts`, `application.ts`, `resource-server.ts`, `MANIFEST`, `README.md`, `example.yaml`), compiled clean
- [x] Tests — `stack-template.yaml` + `stack-integration.test.yaml` written
- [x] Manual testing — both entities create/ready/actions/delete pass against a real tenant (monk-demo.us.auth0.com)
- [x] Integration tests — 19/19 steps passed via monkec's native Deno test-runner against the real tenant (~20s)
- [ ] PR
- [ ] Merged

## Issues Found

- The local Podman VM (`monk`, applehv, Rosetta disabled) segfaults esbuild when running the Docker-based `./monkec.sh compile` on this Apple Silicon host, for any package (reproduced with the pre-existing `clerk` package too, not specific to this one). Worked around by compiling with a sibling `monkec` checkout directly via Deno (`deno task compile <path> --out <path>` from the monkec repo root — its compiler expects the input path relative to its own cwd, so a temporary symlink under `monkec/input/` pointing at `src/auth0` was needed, then removed after). Root MANIFEST `dist/auth0` wiring deliberately left undone — see "Migration note" below for the naming collision with legacy `auth0/`.
- Two earlier crashed Docker-based compile attempts left stray generated `.d.ts` files directly inside `src/auth0/` (and a stray `build/` dir at the repo root); both were cleaned up before the successful compile.
- The local `monkd` also runs inside a Podman VM (not natively on the host), reached over an SSH-tunneled socket per `~/.monk/remote.json`. The `monk` CLI itself needed a fresh `monk login` (RBAC on this daemon) before any command worked — unrelated to `sudo`, which this daemon setup doesn't need at all.
- **Platform limitation, not an auth0-specific bug**: Monk's runtime does not reconstruct array-of-**object** Definition fields into a real array inside the compiled entity — they arrive as flattened `scopes!0`, `scopes!1`, ... keys on `this.definition` instead of `this.definition.scopes` being an array, so `this.definition.scopes` silently reads as `undefined`. Arrays of primitives (strings/numbers/booleans) are unaffected — confirmed via debug logging that `callback_urls: string[]` on `Application` reconstructs correctly while `scopes: {value, description}[]` on `ResourceServer` did not.
  - This is an established, already-solved problem elsewhere in the repo: `src/gcp/cloud-armor-security-policy.ts` has a `collectArray<T>(obj, key)` helper with the exact same explanation in its own comment, also used by `src/aws-cloudfront/distribution.ts` (`extractArrayFromIndexedFields`) and `src/azure-cosmosdb/{access-list,database-account}.ts`. Adopted the same helper here (`collectArray()` in `common.ts`), which lets `resource-server.scopes` stay a proper `{value, scope_description}[]` — no capability lost, unlike an earlier draft of this fix that flattened it to `string[]`.
  - A follow-up repo-wide audit (prompted by an initial, partly-mistaken report against `src/mongodb-atlas/user.ts`'s `roles` field — that field turned out to live on `UserState`, populated live from an API response within a single call, and is never read back in `checkReadiness()`/`delete()`, so it isn't actually broken) found this pattern genuinely affecting Definition fields in at least a dozen other packages, two of which (`aws-s3/bucket.ts` CORS/lifecycle rules, `gcp/memorystore-redis.ts` maintenance window) are exercised by their own test templates and therefore likely already silently broken in production. Not in scope for this PR — tracked separately.

## Migration note

Once this package is implemented, tested, and merged, the legacy `auth0/` directory
(raw JS runnables) should be considered superseded. Recommend a follow-up task to
either delete it or mark it clearly deprecated in its README pointing at
`src/auth0/` — not part of this plan's scope, but flagging so it doesn't linger as
a second, drifting implementation.
