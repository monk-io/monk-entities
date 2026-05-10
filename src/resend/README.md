# Resend Entity Package

Transactional email via [Resend](https://resend.com). Provisions sending domains, scoped API keys, and webhook subscriptions for delivery events.

## Entities

### `resend-domain`

Registers a sending domain on Resend. On create, Resend returns a set of DNS records (SPF, DKIM, MX, optional Tracking) that must be installed on the zone for verification to complete. This entity does **not** block readiness on `status=verified` — verification depends on out-of-band DNS, so the declarative graph stays usable while propagation happens.

```ts
interface ResendDomainDefinition {
  secret_ref?: string; // defaults to "resend-api-token"
  name: string;        // e.g. "mail.example.com"
  region?: "us-east-1" | "eu-west-1" | "sa-east-1" | "ap-northeast-1";
  custom_return_path?: string;
  open_tracking?: boolean;
  click_tracking?: boolean;
}
```

State exposes `id`, `status`, `region`, and `records[]` (the DNS records you need to install). Adoption matches on `name`. Adopted domains are skipped on delete.

Actions: `get-info`, `get-records`, `verify` (triggers Resend to re-poll DNS).

Wire the records into a `cloudflare-dns-record` entity (or any other DNS provider) to automate verification.

### `resend-api-key`

Provisions a scoped API key. The token is returned by Resend **once** on create and written to a Monk secret. Subsequent reads aren't possible — adopted keys cannot have their token recovered.

```ts
interface ResendApiKeyDefinition {
  secret_ref?: string;             // mgmt key, default "resend-api-token"
  name: string;
  permission?: "full_access" | "sending_access"; // default "sending_access"
  domain_id?: string;              // restrict to one domain (sending_access only)
  token_secret_ref?: string;       // defaults to "resend-api-key-{name}"
}
```

Adoption matches on `name`. Delete revokes the key (skipped if adopted).

Actions: `list-keys`.

### `resend-webhook`

Subscribes a target URL to delivery events. The signing secret is returned once on create and written to a Monk secret.

```ts
interface ResendWebhookDefinition {
  secret_ref?: string;
  endpoint: string;
  events: string[]; // e.g., ["email.sent", "email.bounced", "email.complained"]
  signing_secret_ref?: string; // defaults to "resend-webhook-secret"
}
```

Adoption matches on `endpoint`. Updates via PATCH when events or endpoint change.

Actions: `get-info`.

## Secrets

- Management key (`secret_ref`, default `resend-api-token`) — create at https://resend.com/api-keys with **Full Access** so the entities can create/delete domains, keys, and webhooks.
- Provisioned secrets:
  - `resend-api-key-{name}` (or your `token_secret_ref`) — the scoped sending key, written once by `resend-api-key`.
  - `resend-webhook-secret` (or your `signing_secret_ref`) — webhook signing secret, written once by `resend-webhook`.

## Testing

`src/resend/test/env.example` lists the required vars. Copy to `.env`, fill in `RESEND_API_TOKEN` and `RESEND_TEST_DOMAIN`, and run via the sibling deno runner:

```bash
cd ../monkec && deno task test input/resend --verbose
```
