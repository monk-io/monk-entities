Stripe Entities for Monk

This module provides minimal, integration-focused Stripe entities to wire environment variables and webhooks into your runnables.

Components

- credentials (entity)
  - Inputs: secret_ref (Stripe secret key secret name), optional publishable_key
  - State: account_id, mode (test|live), publishable_key, secret_ref
  - Services: data (custom)

- webhook-endpoint (entity)
  - Inputs: destination_url, optional event_types (string[]), description, secret_ref (for auth)
  - State: webhook_endpoint_id, webhook_url, webhook_signing_secret_secret (secret name), existing
  - Services: data (custom)

- product (entity)
  - Inputs: name, optional product_id (adopt), description, metadata, secret_ref
  - State: product_id, name, existing
  - Purpose: create or adopt a Stripe product

- price (entity)
  - Inputs: lookup_key (resolve), or currency+unit_amount(+recurring_interval) to create; optional price_id
  - State: price_id, lookup_key, existing
  - Purpose: resolve or create a price and expose the `price_id`

Usage

See example.yaml for a runnable consuming envs from credentials and webhook secret.



