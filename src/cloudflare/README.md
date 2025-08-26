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
  create_when_missing?: boolean; // skip creation in tests when false
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

## Secrets

- Default secret name: `cloudflare-api-token`
- Grant with `permitted-secrets` in templates

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

## Testing

Use `.env` under `src/cloudflare/test/` or export variables. Example mapping in test `secrets` section.

Commands:

```bash
INPUT_DIR=./src/cloudflare/ OUTPUT_DIR=./dist/cloudflare/ ./monkec.sh compile
sudo INPUT_DIR=./src/cloudflare/ ./monkec.sh test
```
