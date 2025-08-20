# DigitalOcean Spaces Lifecycle Entity

This module manages DigitalOcean Spaces (S3-compatible): key creation, bucket create/delete, lifecycle.

## Entities

- `digitalocean-spaces/spaces-keys`: Create Spaces keys via `cloud/digitalocean` and save to secrets `do-spaces-access-key` / `do-spaces-secret-key`.
- `digitalocean-spaces/spaces-bucket`: Create/delete Space (bucket) using S3-compatible client with credentials from secrets.
- `digitalocean-spaces/spaces-lifecycle`: Applies lifecycle rules (transitions/expiration) to a Space bucket using S3-compatible API.

## Definition

- `region` (string): Spaces region, e.g. `nyc3`, `ams3`, `sfo3`.
- `bucket_name` (string): Bucket (Space) name.
- `lifecycle_configuration.rules` (array): Lifecycle rules with fields `id`, `status`, optional `filter` (prefix/tags), optional `expiration` (days/date), optional `transitions` (days/date/storage_class).

## State

- `existing` (boolean): Whether the bucket existed before.
- `bucket_name` (string), `region` (string).

## Auth

Spaces is S3-compatible. Provide credentials via environment like standard AWS vars:
- `AWS_ACCESS_KEY_ID` = Spaces access key
- `AWS_SECRET_ACCESS_KEY` = Spaces secret key

## Example

See `src/digitalocean-spaces/example.yaml` for a full example.

## Build

```bash
./build.sh digitalocean-spaces
monk load dist/digitalocean-spaces/MANIFEST
```
