# WorkOS

Monk entities for managing WorkOS identity and access management resources.

## Entities

| Entity | Description |
|--------|-------------|
| `workos/credentials` | Validates API key and exposes environment info |
| `workos/organization` | B2B multi-tenant organizations |
| `workos/connection` | SSO connections (adopt-only — create via WorkOS Dashboard) |
| `workos/role` | RBAC roles with permissions |
| `workos/user` | User management (create, update, delete users) |

## Prerequisites

- WorkOS account with API key (`sk_test_...` or `sk_production_...`)
- API key stored as a Monk secret (default name: `workos-api-key`)

## Required Permissions

WorkOS uses a single API key that grants access to all resources. No granular IAM scoping is available — the API key has full access to the WorkOS environment it belongs to.

## Credentials Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret_ref` | string | yes | Secret name storing WorkOS API key |
| `client_id` | string | no | WorkOS Client ID for OAuth/SSO flows |

## Organization Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret_ref` | string | yes | Secret name storing WorkOS API key |
| `name` | string | yes | Organization name |
| `organization_id` | string | no | Adopt existing org by ID |
| `domains` | string[] | no | Verified domain names |
| `metadata` | object | no | Arbitrary metadata |

## Connection (SSO) Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret_ref` | string | yes | Secret name storing WorkOS API key |
| `name` | string | yes | Connection name to search for |
| `connection_id` | string | no | Adopt existing connection by ID (preferred) |
| `organization_id` | string | no | Organization ID to filter connection search |

**Note:** Connections cannot be created via the WorkOS API. Create them in the [WorkOS Dashboard](https://dashboard.workos.com) or Admin Portal first, then adopt by `connection_id` or `name`.

## Role Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret_ref` | string | yes | Secret name storing WorkOS API key |
| `name` | string | yes | Role name |
| `role_id` | string | no | Adopt existing role by ID |
| `slug` | string | yes | URL-friendly role slug |
| `role_description` | string | no | Human-readable description |
| `permissions` | string[] | no | Permission slugs for this role |

## User Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret_ref` | string | yes | Secret name storing WorkOS API key |
| `email` | string | yes | User email address |
| `user_id` | string | no | Adopt existing user by ID |
| `first_name` | string | no | User first name |
| `last_name` | string | no | User last name |
| `email_verified` | boolean | no | Whether email is pre-verified |
| `password_secret_ref` | string | no | Secret name storing user password |
| `metadata` | object | no | User metadata |

## Actions

| Entity | Action | Description |
|--------|--------|-------------|
| `workos/organization` | `get-info` | Get organization details |
| `workos/organization` | `get-cost-estimate` | Human-readable cost estimate |
| `workos/organization` | `costs` | JSON cost data for billing |
| `workos/connection` | `get-info` | Get SSO connection details |
| `workos/connection` | `get-cost-estimate` | Human-readable cost estimate |
| `workos/connection` | `costs` | JSON cost data for billing |
| `workos/role` | `get-info` | Get role details |
| `workos/user` | `get-info` | Get user details |
