# GCP Identity Platform — Multi-Tenant Auth Setup

Sets up GCP Identity Platform with multi-tenancy, email/password sign-in, MFA, and two identity providers (Google sign-in + custom OIDC) scoped to a tenant.

## Architecture

```
Identity Platform Config (project-level)
  └── Acme Tenant (user isolation)
        ├── Google Sign-In (social login)
        └── Corporate OIDC (enterprise SSO)
```

**How it works:**
1. Enable the Identity Toolkit API via `service-usage`
2. Configure Identity Platform at the project level (email sign-in, MFA, multi-tenancy)
3. Create a tenant ("acme-corp") for user isolation
4. Wire Google sign-in and a custom OIDC provider to the tenant via `connection-target`

## Prerequisites

- GCP project with billing enabled
- GCP credentials configured: `monk cluster provider add -p gcp`
- Required IAM role: `roles/identityplatform.admin`
- (Optional) Google OAuth client credentials from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
- (Optional) OIDC provider credentials from your identity provider

## Deploy

```bash
# Load the GCP entity package
monk load dist/gcp/MANIFEST

# Load the example stack
monk load examples/gcp-identity-platform/gcp-identity-platform.yaml

# Deploy to a cloud node (replace TAG with your node's tag)
monk run -t TAG gcp-identity-platform/stack
```

## Verify

### Check stack status
```bash
monk ps
```

### Inspect the Identity Platform config
```bash
monk do gcp-identity-platform/identity-config/get-config
```

### List tenants
```bash
monk do gcp-identity-platform/acme-tenant/list-tenants
```

### Inspect the OIDC provider
```bash
monk do gcp-identity-platform/corp-oidc/get-info
```

## Key Wiring Patterns

### 1. Tenant-scoped identity providers

Identity providers are scoped to a tenant using `connection-target` to read the tenant ID at runtime:

```yaml
google-signin:
  defines: gcp/identity-platform-default-idp-config
  tenant_id: <- connection-target("tenant") entity-state get-member("tenant_id")
  connections:
    tenant:
      runnable: gcp-identity-platform/acme-tenant
      service: tenant
```

### 2. Dependency chain

Entities deploy in order via `depends.wait-for`: API enabled → config → tenant → providers.

## Customization

- **Add more tenants**: Duplicate the `acme-tenant` block with a different `display_name`
- **Add SAML SSO**: Use `gcp/identity-platform-inbound-saml-config` with IdP certificates and SSO URL
- **Project-level providers**: Omit `tenant_id` to configure providers at project level instead of per-tenant
- **Replace placeholder credentials**: Update `client_id` / `client_secret` with real values from your OAuth/OIDC provider

## Cleanup

```bash
monk delete --force gcp-identity-platform/stack
```
