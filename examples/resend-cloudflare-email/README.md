# Resend + Cloudflare email demo

End-to-end demonstration of provisioning a transactional-email sending domain entirely through Monk. Wires together five entity types and a one-shot runnable to deliver a real email:

```
cloudflare-dns-zone  (adopt thisbetterbe.online)
        │
        ▼
resend-domain        (POST /domains; returns DKIM/SPF records to install)
        │
        ▼
cloudflare-dns-record × 3  (install the records returned by Resend)
        │
        ▼
resend-api-key       (provision a sending-scoped key; token → Monk secret)
        │
        ▼
send-email runnable  (verify-poll, then POST /emails)
```

## Prerequisites

Set two secrets in Monk before applying:

- `cloudflare-api-token` — Cloudflare API token with `Zone:Read` + `DNS:Edit` on `thisbetterbe.online`.
- `resend-api-token` — Resend **Full Access** key from <https://resend.com/api-keys>.

```bash
monk secret add -g cloudflare-api-token "..."
monk secret add -g resend-api-token "re_..."
```

The entities load the compiled MonkEC bundles first:

```bash
monk load dist/cloudflare/MANIFEST
monk load dist/resend/MANIFEST
monk load examples/resend-cloudflare-email/stack.yaml
```

## Run

```bash
monk run -l monk-email-demo/stack
```

The runnable will:

1. Adopt the existing `thisbetterbe.online` zone.
2. Register `thisbetterbe.online` as a Resend sending domain.
3. Install Resend's three DNS records (DKIM TXT at `resend._domainkey.thisbetterbe.online`, SPF MX at `send.thisbetterbe.online`, SPF TXT at `send.thisbetterbe.online`) on the Cloudflare zone.
4. Provision a sending-scoped API key, writing the token to the `monk-email-demo-sending-key` secret.
5. Trigger Resend domain verification, poll until `status=verified` (~30s–2min after records propagate), then send a hello email from `hello@thisbetterbe.online` to `xnooga@gmail.com`.

Re-trigger sending without re-applying the stack:

```bash
monk run -l monk-email-demo/send-email
```

## Teardown

```bash
monk delete --force monk-email-demo/stack
```

This removes:
- the three Resend DNS records from the Cloudflare zone
- the Resend sending key (revoked at Resend)
- the Resend domain
- the runnable

The Cloudflare zone is **adopted** (`state.existing = true`) and therefore preserved.

## How the wiring works

`resend-domain` exposes `state.records[]` (the full array) **and** scalar fields for each of the three records, so DNS entities can reference them directly without array indexing:

| State field             | Purpose                            |
| ----------------------- | ---------------------------------- |
| `dkim_name`             | `resend._domainkey` (relative)     |
| `dkim_value`            | DKIM public-key TXT value          |
| `spf_mx_name`           | `send` (relative)                  |
| `spf_mx_value`          | `feedback-smtp.us-east-1.amazonses.com` |
| `spf_mx_priority`       | `10`                               |
| `spf_txt_name`          | `send` (relative)                  |
| `spf_txt_value`         | `v=spf1 include:amazonses.com ~all` |

The example computes FQDNs by string-templating: `${... get-member("dkim_name")}.thisbetterbe.online`.
