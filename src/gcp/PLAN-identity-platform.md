# GCP Identity Platform — Entity Plan

## Overview

Add Identity Platform entities to the existing `gcp` package. Identity Platform is GCP's CIAM (Customer Identity and Access Management) service for authenticating end-users of applications.

**API**: `https://identitytoolkit.googleapis.com/v2`
**Auth**: GCP OAuth2 (automatic via `gcp` builtin)
**Operations**: All synchronous (no LROs)
**Required API**: `identitytoolkit.googleapis.com`

## Entities

### 1. `gcp/identity-platform-config`

Project-level Identity Platform configuration. This resource always exists once Identity Platform is enabled — there's no create/delete, only read and update.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `authorized_domains` | `string[]` | no | Domains allowed for OAuth redirects |
| `sign_in_email_enabled` | `boolean` | no | Enable email/password sign-in |
| `sign_in_email_password_required` | `boolean` | no | Require password for email sign-in |
| `sign_in_phone_enabled` | `boolean` | no | Enable phone number sign-in |
| `sign_in_anonymous_enabled` | `boolean` | no | Enable anonymous sign-in |
| `allow_duplicate_emails` | `boolean` | no | Allow multiple accounts per email |
| `mfa_state` | `string` | no | MFA state: DISABLED, ENABLED, MANDATORY |
| `mfa_enabled_providers` | `string[]` | no | MFA providers (e.g., PHONE_SMS) |
| `allow_tenants` | `boolean` | no | Enable multi-tenancy |
| `autodetele_anonymous_users` | `boolean` | no | Auto-delete anonymous users |

**State**: `subtype`, `authorized_domains`, sign-in config, MFA config, `client_api_key`

**Actions**: `get-info`, `get-config`

**Lifecycle**:
- `create()` → PATCH config with defined fields (idempotent — config always exists)
- `update()` → PATCH with updateMask
- `delete()` → no-op (can't delete project config)
- `checkReadiness()` → GET config, verify subtype is IDENTITY_PLATFORM

### 2. `gcp/identity-platform-tenant`

Multi-tenant isolation. Each tenant gets its own user pool and IdP configs.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `display_name` | `string` | yes | Human-readable tenant name |
| `allow_password_signup` | `boolean` | no | Allow email/password sign-up |
| `enable_email_link_signin` | `boolean` | no | Enable email link sign-in |
| `enable_anonymous_user` | `boolean` | no | Enable anonymous users |
| `disable_auth` | `boolean` | no | Disable authentication entirely |
| `mfa_state` | `string` | no | MFA state: DISABLED, ENABLED, MANDATORY |
| `mfa_enabled_providers` | `string[]` | no | MFA providers |
| `autodetele_anonymous_users` | `boolean` | no | Auto-delete anonymous users |

**State**: `tenant_id`, `display_name`, `allow_password_signup`, `enable_email_link_signin`, `enable_anonymous_user`, `disable_auth`

**Actions**: `get-info`, `list-tenants`

**Lifecycle**:
- `create()` → POST `/projects/{project}/tenants`
- `update()` → PATCH with updateMask
- `delete()` → DELETE `/projects/{project}/tenants/{tenantId}`
- `checkReadiness()` → GET tenant, verify it exists and `disableAuth !== true`

### 3. `gcp/identity-platform-oauth-idp-config`

Custom OIDC identity provider configuration. Can be project-level or tenant-scoped.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Config ID (e.g., `oidc.my-provider`) |
| `tenant_id` | `string` | no | Tenant ID (omit for project-level) |
| `display_name` | `string` | no | Human-readable name |
| `enabled` | `boolean` | no | Enable this provider |
| `client_id` | `string` | yes | OIDC client ID |
| `issuer` | `string` | yes | OIDC issuer URI |
| `client_secret` | `string` | no | Client secret (for code flow) |
| `response_type_id_token` | `boolean` | no | Use implicit flow (ID token) |
| `response_type_code` | `boolean` | no | Use authorization code flow |

**State**: `resource_name`, `config_id`, `display_name`, `enabled`, `client_id`, `issuer`

**Actions**: `get-info`, `enable`, `disable`

**Lifecycle**:
- `create()` → POST with `?oauthIdpConfigId={name}`
- `update()` → PATCH with updateMask
- `delete()` → DELETE
- `checkReadiness()` → GET config, verify `enabled === true`

### 4. `gcp/identity-platform-default-idp-config`

Built-in social identity providers (Google, Facebook, Apple, GitHub, Microsoft, Twitter, etc.).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idp_id` | `string` | yes | Provider ID (e.g., `google.com`, `facebook.com`, `apple.com`) |
| `tenant_id` | `string` | no | Tenant ID (omit for project-level) |
| `enabled` | `boolean` | no | Enable this provider |
| `client_id` | `string` | yes | OAuth client ID from the provider |
| `client_secret` | `string` | yes | OAuth client secret |
| `apple_team_id` | `string` | no | Apple Developer Team ID (apple.com only) |
| `apple_key_id` | `string` | no | Key ID for Apple private key (apple.com only) |
| `apple_private_key` | `string` | no | Private key for Apple sign-in (apple.com only) |
| `apple_bundle_ids` | `string[]` | no | Apple bundle IDs (apple.com only) |

**State**: `resource_name`, `idp_id`, `enabled`, `client_id`

**Actions**: `get-info`, `enable`, `disable`

**Lifecycle**:
- `create()` → POST with `?idpId={idp_id}`
- `update()` → PATCH with updateMask
- `delete()` → DELETE
- `checkReadiness()` → GET config, verify `enabled === true`

### 5. `gcp/identity-platform-inbound-saml-config`

SAML 2.0 identity provider configuration for enterprise SSO.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | yes | Config ID (e.g., `saml.my-provider`) |
| `tenant_id` | `string` | no | Tenant ID (omit for project-level) |
| `display_name` | `string` | no | Human-readable name |
| `enabled` | `boolean` | no | Enable this provider |
| `idp_entity_id` | `string` | yes | SAML entity ID of the IdP |
| `sso_url` | `string` | yes | IdP SSO URL |
| `sign_request` | `boolean` | no | Sign outbound SAML requests |
| `idp_certificates` | `string[]` | yes | PEM-encoded x509 certificates |
| `sp_entity_id` | `string` | yes | SAML entity ID of the SP |
| `callback_uri` | `string` | yes | Callback URI for SAML responses |

**State**: `resource_name`, `config_id`, `display_name`, `enabled`, `idp_entity_id`, `sp_entity_id`, `sp_certificates`

**Actions**: `get-info`, `enable`, `disable`

**Lifecycle**:
- `create()` → POST with `?inboundSamlConfigId={name}`
- `update()` → PATCH with updateMask
- `delete()` → DELETE
- `checkReadiness()` → GET config, verify `enabled === true`

## Files to Create/Modify

### New files in `src/gcp/`:
- `identity-platform-config.ts`
- `identity-platform-tenant.ts`
- `identity-platform-oauth-idp-config.ts`
- `identity-platform-default-idp-config.ts`
- `identity-platform-inbound-saml-config.ts`

### Modify:
- `src/gcp/common.ts` — add `IDENTITY_TOOLKIT_API_URL`
- `src/gcp/MANIFEST` — add new entity files

### Test files:
- `src/gcp/test/identity-platform-template.yaml`
- `src/gcp/test/identity-platform-integration.test.yaml`

### Example:
- `src/gcp/example/identity-platform-example.yaml`

## Entity Dependencies / Composition

```
identity-platform-config (project-level, standalone)
    └── identity-platform-tenant (depends on config having allow_tenants: true)
            ├── identity-platform-oauth-idp-config (optional tenant_id)
            ├── identity-platform-default-idp-config (optional tenant_id)
            └── identity-platform-inbound-saml-config (optional tenant_id)
```

The IdP config entities can work at project-level (no tenant_id) or tenant-level (with tenant_id wired via connection).

## Cost Estimation

Identity Platform pricing is per-MAU (monthly active users), not per-resource. The entities themselves are free to create — costs come from user authentication volume. Cost actions (`get-cost-estimate`, `costs`) are **not applicable** for these entities since cost depends on runtime usage, not provisioned resources.

## Issues Found

- Identity Platform must be initialized via `initializeAuth` before config PATCH works — GET config returns 404 on uninitialized projects
- Tenant `display_name` has strict validation: 4-20 chars, start with letter, letters/digits/hyphens only (no spaces)
- Compiler generates entity name `identity-platform-o-auth-idp-config` (hyphenating "OAuth") — templates must use this name
- `identitytoolkit.googleapis.com` was missing from `GcpApiServiceName` type — added

## Design Decisions

1. **Same package**: All entities go into the existing `gcp` package rather than a new `gcp-identity-platform` package — consistent with how other GCP services (Cloud SQL, Cloud Run, Pub/Sub) are organized.

2. **Config entity lifecycle**: Since project config can't be created or deleted (it exists once Identity Platform is enabled), `create()` does a PATCH and `delete()` is a no-op.

3. **Dual-level IdP configs**: The three IdP config entities support both project-level and tenant-level via optional `tenant_id` field, matching the API's dual-level resource model.

4. **No secrets needed**: All entities authenticate via the GCP builtin provider — no `permitted-secrets` required. The `default-idp-config` takes `client_secret` as a definition field (from the social provider, not a Monk secret).

5. **No LRO polling**: All Identity Platform API operations are synchronous.

## Progress

- [x] Plan — approved 2026-04-16
- [x] Implement — 5 entities, 7 files, compiled clean (31 entities total)
- [x] Tests — template + integration test with 28 steps covering full lifecycle
- [x] Manual testing — all 5 entities pass create/ready/actions/delete
- [x] Integration tests — 34/34 steps passed (96s)
- [x] PR — #188
- [ ] Merged
