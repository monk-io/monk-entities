# Cloudflare Entity Package

Cloudflare DNS zone management using MonkEC conventions.

## Entities

### `cloudflare-dns-zone`

Manages a Cloudflare DNS zone (create if missing, detect existing, wait until active).

Definition (snake_case):

```ts
interface CloudflareDNSZoneDefinition {
  secret_ref?: string; // optional; defaults to cloudflare-api-token
  name: string;        // zone name, e.g., example.com
  zone_type?: "full" | "partial"; // default: full
  account_id?: string; // optional account id for creation
  // Records are created by default when missing. No opt-out flag.
}
```

State:

```ts
interface CloudflareDNSZoneState {
  id?: string;        // zone id
  status?: string;    // pending | active
  existing?: boolean; // pre-existing flag
}
```

Actions (kebab-case):
- `get-info`: prints zone information
- `list-zones`: lists zones in the account

Readiness: waits until zone `status` is `active` (or `pending` during tests).

Deletion policy:
- Zone deletion is disabled by design (failsafe). The entity's delete() is a no-op.

### `cloudflare-dns-record`

Manages a DNS record in a zone. Note: property name `type` is reserved by schema validators; use `record_type` in Definition.

Definition (snake_case):

```ts
interface CloudflareDNSRecordDefinition {
  secret_ref?: string; // optional; defaults to cloudflare-api-token
  zone_id?: string;    // or provide zone_name
  zone_name?: string;  // used to resolve zone_id
  record_type: string; // e.g., A, AAAA, CNAME, TXT
  name: string;        // record name
  content?: string;    // record content
  ttl?: number;        // seconds, 1 for auto
  proxied?: boolean;
  priority?: number;
  data?: any;          // complex types
}
```

### `cloudflare-tunnel`

Creates a Cloudflare Tunnel and stores its token in a Monk secret for cloudflared.

Definition (snake_case):

```ts
interface CloudflareTunnelDefinition {
  secret_ref?: string;       // optional; defaults to cloudflare-api-token
  account_id: string;        // Cloudflare account ID
  name: string;              // tunnel name
  config_src?: "cloudflare" | "local"; // default: cloudflare
  token_secret_ref?: string; // defaults to cloudflare-tunnel-token
}
```

State:

```ts
interface CloudflareTunnelState {
  id?: string;            // tunnel id
  status?: string;        // inactive | healthy | etc
  tunnel_domain?: string; // <tunnel-id>.cfargotunnel.com
  token_secret_ref?: string; // secret name containing the token
}
```

### `cloudflare-tunnel-application`

Publishes an application through a tunnel and creates a DNS record.

Definition (snake_case):

```ts
interface CloudflareTunnelApplicationDefinition {
  secret_ref?: string; // optional; defaults to cloudflare-api-token
  account_id: string;
  tunnel_id: string;
  hostname: string;    // app.example.com
  service: string;     // http://localhost:8001
  zone_id?: string;    // or zone_name
  zone_name?: string;
  proxied?: boolean;   // default: true
  origin_request?: any;
  catch_all_service?: string; // default: http_status:404
}
```

### `cloudflare-workers-script`

Reserves a Worker name as a Cloudflare resource. Detects-then-stubs: if a script with the given name already exists in the account, it is adopted; if not, a tiny stub is uploaded so the resource exists and other entities/runnables can wire to it. Real code is then deployed via `cloudflare/wrangler-deploy`, which overwrites the stub.

Definition (snake_case):

```ts
interface CloudflareWorkersScriptDefinition {
  secret_ref?: string;              // optional; defaults to cloudflare-api-token
  account_id: string;
  name: string;                     // canonical Worker script name
  compatibility_date?: string;      // for the initial stub; wrangler-deploy sets the real value
  allow_destructive_delete?: boolean; // default false; delete() is a no-op unless true
}
```

State: `{ id?: string; created_on?: string; modified_on?: string; etag?: string; existing?: boolean }`.

Actions: `get-info`, `force-delete`.

Token scope: `Workers Scripts: Edit` on the account. Adopted scripts (`state.existing = true`) are skipped by `delete()` and `force-delete`. Adopted scripts (uploaded by something else, e.g. wrangler in CI) are the common case in production — Monk owns the *resource*, wrangler owns the *content*.

Why a stub? CF's script-upload API doesn't have an "empty Worker" endpoint — every PUT needs a body. The stub is a service-worker that returns 503 with the message `monk: pending wrangler-deploy`, intended to be overwritten on the first `wrangler deploy`.

### `cloudflare-workers-route`

Maps a URL pattern on a zone to a Worker script. Adopts existing routes by `(pattern, script_name)`.

Definition (snake_case):

```ts
interface CloudflareWorkersRouteDefinition {
  secret_ref?: string;       // optional; defaults to cloudflare-api-token
  zone_id: string;           // Cloudflare zone ID
  route_pattern: string;     // e.g., "api.example.com/*" — quote in YAML
  script_name: string;       // Worker script name to bind
}
```

State: `{ id?: string; existing?: boolean }`.

Actions: `get-info`.

Token scope: `Workers Routes: Edit` on the zone. Adopted routes (`state.existing = true`) are skipped by `delete()`; fresh routes are destroyed.

Note: the field is named `route_pattern`, not `pattern`, because `pattern` is a reserved JSON Schema keyword.

## Runnables

### `cloudflare/wrangler-deploy`

Companion runnable that uploads a Worker bundle via the `wrangler` CLI. Mirrors the `vercel/deploy` / `netlify/deploy` pattern: the operator packs source into a Monk blob, the runnable mounts it, generates `wrangler.toml` from JSON-encoded inputs, runs `wrangler deploy`, then pushes secrets.

Inherit it from a runnable in your stack and pass variables:

```yaml
deploy:
  defines: runnable
  inherits: cloudflare/wrangler-deploy
  permitted-secrets:
    cloudflare-api-token: true
    cloudflare-account-id: true
  variables:
    source-path:        { type: string, value: my-worker-blob }
    script-name:        { type: string, value: my-worker }
    worker-main:        { type: string, value: src/index.js }
    compatibility-date: { type: string, value: "2025-04-01" }
    routes-json:        { type: string, value: '[{"pattern":"example.com/api/*","zone_name":"example.com"}]' }
    bindings-json:      { type: string, value: '{"r2":[{"name":"ASSETS","bucket_name":"my-bucket"}],"vars":{"APP_ENV":"production"}}' }
    secrets-json:       { type: string, value: '{}' }     # JSON map of NAME→VALUE, fully resolved at template time
    pre-deploy:         { type: string, value: "npm ci && npm run build" }
```

`routes-json`, `bindings-json`, `secrets-json` are JSON strings (composable via Monk template expressions). When `routes-json` is non-empty the runnable sets `workers_dev = false` and adds `[[routes]]` blocks to `wrangler.toml`, so an account without a registered workers.dev subdomain can still deploy.

Combine with the `cloudflare-workers-route` entity when you want routes managed declaratively outside the wrangler config (e.g. dynamic per-tenant routes added after deploy).

Pack a blob: `monk blobs store --name my-worker-blob /path/to/bundled-worker`.

Variable names are kebab-case (`source-path`, `script-name`, `pre-deploy`, etc.) per the runnable convention. Env-mapped variables map to `SCREAMING_SNAKE` env vars inside the container (`source-path` → `SOURCE_PATH` if it had an `env:` mapping; here it's only used by Monk's path interpolation).

## Secrets

- Default secret name: `cloudflare-api-token`
- Grant with `permitted-secrets` in templates
- Cloudflare account ID is the account tag/UUID from the dashboard URL: `/accounts/<ACCOUNT_ID>`
- Create a Cloudflare API token with account tunnel edit and DNS edit permissions
- Tunnel token secret (`cloudflare-tunnel-token`) is created by the tunnel entity and is distinct from the API token

## Example template

```yaml
namespace: cloudflare-test

my-zone:
  defines: cloudflare/cloudflare-dns-zone
  name: example.com
  permitted-secrets:
    cloudflare-api-token: true

# my-record:
#   defines: cloudflare/cloudflare-dns-record
#   zone_name: example.com
#   record_type: A
#   name: www
#   content: 203.0.113.10
#   ttl: 120
```

For a standalone file, see `src/cloudflare/example-record.yaml`.

Tunnel + cloudflared example (save as example-tunnel.yaml):

```yaml
namespace: cloudflare-tunnel-example

app:
  defines: runnable
  containers:
    app:
      image: nginx:latest
  services:
    http:
      container: app
      port: 80
      protocol: tcp

tunnel:
  defines: cloudflare/cloudflare-tunnel
  account_id: <- secret("cloudflare-account-id")
  name: "example-tunnel"
  token_secret_ref: cloudflare-tunnel-token
  permitted-secrets:
    cloudflare-api-token: true
    cloudflare-tunnel-token: true
    cloudflare-account-id: true
  services:
    data:
      protocol: custom

# cloudflare-tunnel-token is created by the tunnel entity on first run

tunnel-app:
  defines: cloudflare/cloudflare-tunnel-application
  account_id: <- secret("cloudflare-account-id")
  tunnel_id: <- connection-target("tunnel") entity-state get-member("id")
  zone_name: example.com
  hostname: app.example.com # use "@" for apex domain
  service: http://app:80
  permitted-secrets:
    cloudflare-api-token: true
  connections:
    tunnel:
      runnable: cloudflare-tunnel-example/tunnel
      service: data
  depends:
    wait-for:
      runnables:
        - cloudflare-tunnel-example/tunnel
      timeout: 60

cloudflared:
  defines: runnable
  inherits: cloudflare/cloudflared
  permitted-secrets:
    cloudflare-tunnel-token: true
  variables:
    token_secret_ref:
      type: string
      value: cloudflare-tunnel-token
  connections:
    app:
      runnable: cloudflare-tunnel-example/app
      service: http
  depends:
    wait-for:
      runnables:
        - cloudflare-tunnel-example/tunnel
        - cloudflare-tunnel-example/app
      timeout: 60

stack:
  defines: group
  members:
    - cloudflare-tunnel-example/app
    - cloudflare-tunnel-example/tunnel
    - cloudflare-tunnel-example/tunnel-app
    - cloudflare-tunnel-example/cloudflared
```

## Testing

Use `.env` under `src/cloudflare/test/` or export variables. Example mapping in test `secrets` section.

Commands:

```bash
INPUT_DIR=./src/cloudflare/ OUTPUT_DIR=./dist/cloudflare/ ./monkec.sh compile
sudo INPUT_DIR=./src/cloudflare/ ./monkec.sh test
```
