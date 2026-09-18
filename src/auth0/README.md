# Auth0

Monk entities for managing Auth0 applications (OAuth clients) and resource servers
(APIs) via the Auth0 Management API.

## Entities

| Entity | Description |
|--------|-------------|
| `auth0/application` | An Auth0 application (Client) — create, update, rotate its secret |
| `auth0/resource-server` | An Auth0 resource server (API) — create, update |

## Prerequisites

Create a Machine-to-Machine application in your Auth0 tenant, authorized for the
**Auth0 Management API**, and grant it the scopes listed below. Store its client
ID and client secret as Monk secrets (default names: `auth0-management-client-id`,
`auth0-management-client-secret`), and reference them from each entity via
`management_client_id_ref` / `management_client_secret_ref` if you use different
names.

## Required Permissions

Grant the Management API M2M application these scopes:

- `read:clients`, `create:clients`, `update:clients`, `delete:clients`
- `update:client_keys` — required specifically for the `rotate-secret` action; this
  endpoint cannot be used on a client configured with the Private Key JWT
  authentication method
- `read:resource_servers`, `create:resource_servers`, `update:resource_servers`, `delete:resource_servers`

## Rate limits

Auth0's Management API is limited to 2 req/s (burst 10) on free/trial tenants, and
15 req/s (burst 50) on paid tenants. Management API access tokens are cached in
Monk secrets (per tenant domain + M2M credentials) to avoid re-authenticating on
every action call.

## `auth0/application` Configuration

| Field | Type | Required | Description |
|-------|------|----------|--------------|
| `domain` | string | yes | Auth0 tenant domain, e.g. `your-tenant.us.auth0.com` |
| `management_client_id_ref` | string | no | Secret name for the M2M client ID (default: `auth0-management-client-id`) |
| `management_client_secret_ref` | string | no | Secret name for the M2M client secret (default: `auth0-management-client-secret`) |
| `name` | string | yes | Application name |
| `app_type` | string | no | `native`, `spa`, `regular_web`, `non_interactive`, ... (default: `regular_web`) |
| `callback_urls` | string[] | no | Callback URLs (maps to Auth0's `callbacks`) |
| `grant_types` | string[] | no | e.g. `authorization_code`, `refresh_token`, `client_credentials` |
| `allowed_logout_urls` | string[] | no | Allowed logout redirect URLs |
| `allowed_origins` | string[] | no | Allowed CORS origins |
| `web_origins` | string[] | no | Allowed web origins for the token endpoint |
| `logo_uri` | string | no | Application logo URL |
| `cross_origin_authentication` | boolean | no | Enable cross-origin authentication |
| `token_endpoint_auth_method` | string | no | `none`, `client_secret_post`, `client_secret_basic` |
| `client_secret_ref` | string | no | Secret name to store the client secret (default: `auth0-client-secret`) |

### Actions

| Action | Description |
|--------|-------------|
| `get-info` | Print the current application configuration |
| `patch` | Update specific fields at runtime from action args, without changing the Definition |
| `rotate-secret` | Rotate the client secret and store the new value in `client_secret_ref` |
| `get-cost-estimate` / `costs` | See "Cost estimation" below |

## `auth0/resource-server` Configuration

| Field | Type | Required | Description |
|-------|------|----------|--------------|
| `domain`, `management_client_id_ref`, `management_client_secret_ref` | — | see above | Shared with `application` |
| `name` | string | yes | Friendly name |
| `identifier` | string | yes | API audience URI. Immutable once set. |
| `scopes` | `{ value, scope_description? }[]` | no | Scopes exposed by this API |

### Actions

| Action | Description |
|--------|-------------|
| `get-info` | Print the current resource server configuration |
| `get-cost-estimate` / `costs` | See "Cost estimation" below |

### A platform note on `scopes`

Monk's runtime doesn't reconstruct array-of-**object** Definition fields into a
real array at entity runtime the normal way — they arrive as flattened `scopes!0`,
`scopes!1`, ... keys on the definition object instead of `definition.scopes` being
an array. Arrays of plain strings/numbers/booleans (like `callback_urls` above)
are unaffected. `resource-server.ts` works around this with a small `collectArray()`
helper (in `common.ts`) that reads either form — the same technique already used
elsewhere in this repo, e.g. `src/gcp/cloud-armor-security-policy.ts`.

## Cost estimation

Auth0 bills per tenant (MAU-based subscription tier), not per application or
resource server, so there's no meaningful per-entity dollar figure. `get-cost-estimate`
and `costs` are implemented to satisfy this repo's convention that every billable
entity exposes them, but they report a static `$0` with a note explaining why,
rather than a guessed number.

## Consuming an Application's secret in a runnable

```yaml
backend:
  defines: runnable
  connections:
    auth0app:
      runnable: auth0-example/app
      service: data
  variables:
    auth0_client_secret_ref:
      type: string
      value: <- connection-target("auth0app") entity-state get-member("client_secret_secret")
    AUTH0_CLIENT_ID:
      env: AUTH0_CLIENT_ID
      type: string
      value: <- connection-target("auth0app") entity-state get-member("client_id")
    AUTH0_CLIENT_SECRET:
      env: AUTH0_CLIENT_SECRET
      type: string
      value: <- secret($auth0_client_secret_ref)
```

See [example.yaml](example.yaml) for a full working example.

## Migrating from the legacy `auth0/` package

This package supersedes the raw-runnable entities under the top-level `auth0/`
directory. Notable differences from the legacy package:

- The client secret is stored in a Monk secret (`client_secret_ref`) instead of
  being left in plain entity state.
- `create()` adopts an existing application/resource server with a matching
  name/identifier instead of always creating a duplicate.
- `resource-server.scopes` now sends the `{value, description}` object shape
  Auth0's API actually requires (the legacy package sent plain strings).
- `resource-server`'s unused `client-id` field and `application`'s unused
  `default-scopes` field (declared in the legacy schema but never sent to the
  Auth0 API) were dropped. `application.grant_types` (also declared but unused
  in the legacy package) is now properly wired to the API.
- The audience field on `resource-server` was renamed `audience` → `identifier`
  to match Auth0's actual API field name.
