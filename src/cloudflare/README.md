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

## Secrets

- Default secret name: `cloudflare-api-token`
- Grant with `permitted-secrets` in templates
- Cloudflare account ID is the account tag/UUID from the dashboard URL: `/accounts/<ACCOUNT_ID>`
- Create a Cloudflare API token with account tunnel edit and DNS edit permissions

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
  hostname: app.example.com
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
  permitted-secrets:
    cloudflare-tunnel-token: true
  variables:
    CLOUDFLARED_TOKEN:
      type: string
      env: CLOUDFLARED_TOKEN
      value: <- secret("cloudflare-tunnel-token")
  containers:
    cloudflared:
      image: cloudflare/cloudflared:latest
      restart: always
      command: tunnel --no-autoupdate run --token ${CLOUDFLARED_TOKEN}
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
