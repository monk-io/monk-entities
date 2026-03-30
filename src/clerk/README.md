Clerk Entities for Monk

This module provides Clerk entities for managing authentication and identity resources.

Components

- credentials (entity)
  - Inputs: secret_ref (Clerk secret key secret name), optional publishable_key
  - State: instance_id, mode (test|live), publishable_key, secret_ref
  - Services: data (custom)

- organization (entity)
  - Inputs: name, optional organization_id (adopt), slug, max_allowed_memberships, public/private metadata
  - State: organization_id, name, slug, members_count, existing
  - Actions: get-info, get-cost-estimate, costs

- jwt-template (entity)
  - Inputs: name, optional template_id (adopt), claims, lifetime, clock_skew_in_seconds, signing_algorithm
  - State: template_id, name, existing
  - Actions: get-info

- domain (entity)
  - Inputs: name, optional domain_id (adopt), is_satellite, proxy_url
  - State: domain_id, name, verification_status, existing
  - Actions: get-info

- oauth-application (entity)
  - Inputs: name, callback_url, optional oauth_application_id (adopt), public_client, scopes, client_secret_ref
  - State: oauth_application_id, client_id, name, client_secret_secret, existing
  - Actions: get-info, rotate-secret

Prerequisites

- Clerk account with API access
- Secret key (sk_test_... or sk_live_...) stored in Monk secrets

Required Permissions

- Full Backend API access via secret key

Usage

See example.yaml for a complete stack wiring Clerk entities to a consumer runnable.
