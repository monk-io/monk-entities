# DigitalOcean Container Registry Entity for Monk

This directory contains a TypeScript entity for managing DigitalOcean Container Registry (DOCR) in the Monk orchestrator.

## Features

- **Complete Lifecycle Management**: Create, update, delete, and manage DigitalOcean container registries
- **Provider Integration**: Automatic authentication using DigitalOcean provider (no manual secrets required)
- **Subscription Tier Support**: Support for both Basic and Professional subscription tiers
- **Storage Management**: Configure storage quotas for Professional tier registries
- **Repository Management**: List repositories and manage Docker images
- **Custom Actions**: Built-in actions for registry operations (credentials, garbage collection, storage usage)
- **Error Handling**: Robust error handling with detailed error messages
- **Readiness Checks**: Automatic monitoring of registry status

## Supported Subscription Tiers

- **Basic**: Free tier with unlimited public repositories and 1 private repository
- **Professional**: Paid tier with unlimited private repositories and configurable storage quota

## Supported Regions

- `ams3` - Amsterdam 3
- `blr1` - Bangalore 1
- `fra1` - Frankfurt 1
- `lon1` - London 1
- `nyc1` - New York 1
- `nyc3` - New York 3
- `sfo3` - San Francisco 3
- `sgp1` - Singapore 1
- `tor1` - Toronto 1
- `syd1` - Sydney 1

## Configuration

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Registry name (3-63 chars, alphanumeric and hyphens) |
| `region` | string | DigitalOcean region where registry will be created |
| `subscription_tier` | string | Subscription tier (basic or professional) |

### Optional Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `storage_quota_bytes` | number | Storage quota in bytes (Professional tier only) | - |

## State

The entity maintains the following runtime state:

- `name` - Registry name
- `region` - Registry region
- `subscription_tier` - Current subscription tier
- `storage_quota_bytes` - Storage quota (if set)
- `storage_usage_bytes` - Current storage usage
- `server_url` - Registry endpoint URL
- `created_at` - Creation timestamp
- `existing` - Whether registry existed before entity creation
- `username` - Email of the user

## Authentication

Uses DigitalOcean provider for authentication. The provider should be configured with:

1. A DigitalOcean API token with Container Registry permissions
2. Token stored in Provider Store
3. Provider configuration in your Monk setup

## Example Usage

### Basic Registry

```yaml
namespace: my-app
my-registry:
  defines: digitalocean-container-registry/registry
  name: my-docker-registry
  region: nyc1
  subscription_tier: basic
```

### Professional Registry with Storage Quota

```yaml
namespace: my-app
my-pro-registry:
  defines: digitalocean-container-registry/registry
  name: my-pro-registry
  region: sfo3
  subscription_tier: professional
  storage_quota_bytes: 107374182400  # 100 GB
```

### Usage in Stack

```bash
# Deploy the registry
monk run my-app/my-registry

# Use custom actions
monk do my-app/my-registry/get-registry
monk do my-app/my-registry/list-repositories
monk do my-app/my-registry/get-docker-credentials
monk do my-app/my-registry/get-storage-usage
monk do my-app/my-registry/run-garbage-collection --type=untagged_manifests_only

# Clean up
monk purge my-app/my-registry
```

## Custom Actions

### Registry Information

- `get-registry` - Get current registry information
- `get-storage-usage` - Get storage usage statistics

### Repository Management

- `list-repositories` - List all repositories in the registry

### Docker Integration

- `get-docker-credentials` - Get Docker login credentials for the registry

### Maintenance

- `run-garbage-collection` - Run garbage collection to clean up unused images
  - `--type=untagged_manifests_only` (default)
  - `--type=unreferenced_blobs_only`
  - `--type=unreferenced_blobs_and_manifests`

## API Reference

This entity uses the DigitalOcean API v2:
- **Get Registry**: `GET /v2/registry`
- **Create Registry**: `POST /v2/registry`
- **Update Registry**: `PATCH /v2/registry`
- **Delete Registry**: `DELETE /v2/registry`
- **List Repositories**: `GET /v2/registry/repositories`
- **Get Docker Credentials**: `GET /v2/registry/docker-credentials`
- **Run Garbage Collection**: `POST /v2/registry/garbage-collection`

## Build and Development

```bash
# Build the module
./build.sh digitalocean-container-registry

# Load into Monk
monk load dist/digitalocean-container-registry/MANIFEST

# Run tests (if available)
cd src/digitalocean-container-registry/test
monk run stack-integration.test.yaml
```

## Limitations

- DigitalOcean allows only one container registry per account
- Storage quota can only be set for Professional tier
- Region cannot be changed after registry creation
- Registry name cannot be changed after creation

## Docker Usage Example

After creating a registry, you can use it with Docker:

```bash
# Get Docker credentials
monk do my-app/my-registry/get-docker-credentials

# Login to registry
docker login registry.digitalocean.com

# Tag and push an image
docker tag my-app:latest registry.digitalocean.com/my-registry/my-app:latest
docker push registry.digitalocean.com/my-registry/my-app:latest

# Pull an image
docker pull registry.digitalocean.com/my-registry/my-app:latest
```

## Troubleshooting

### Common Issues

1. **"Registry already exists" error**: This is handled automatically - the entity will connect to existing registries
2. **Authentication errors**: Ensure DigitalOcean provider is properly configured with valid API token
3. **Storage quota errors**: Storage quota can only be set for Professional tier registries
4. **Region errors**: Ensure you're using a supported DigitalOcean region
