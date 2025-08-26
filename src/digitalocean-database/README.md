# DigitalOcean Database Entity for Monk

This directory contains a TypeScript entity for managing DigitalOcean Database clusters in the Monk orchestrator.

## Features

- **Complete Lifecycle Management**: Create, update, delete, and manage DigitalOcean database clusters
- **Provider Integration**: Automatic authentication using DigitalOcean provider (no manual secrets required)
- **Multiple Database Engines**: Support for PostgreSQL, MySQL, Redis, MongoDB, Kafka, and OpenSearch
- **Flexible Configuration**: Support for different cluster sizes, node counts, and engine-specific settings
- **Custom Actions**: Built-in actions for database management (create/delete databases, get connection info)
- **Error Handling**: Robust error handling with detailed error messages
- **Readiness Checks**: Automatic monitoring of database cluster status

## Supported Database Engines

- **PostgreSQL** (`pg`) - Versions 11, 12, 13, 14, 15, 16
- **MySQL** (`mysql`) - Versions 5.7, 8.0
- **Redis** (`redis`) - Versions 6, 7
- **MongoDB** (`mongodb`) - Versions 4.4, 5.0, 6.0, 7.0
- **Apache Kafka** (`kafka`) - Version 3.5
- **OpenSearch** (`opensearch`) - Versions 1.x, 2.x

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

## Database Sizes

- `db-s-1vcpu-1gb` - 1 vCPU, 1 GB RAM
- `db-s-1vcpu-2gb` - 1 vCPU, 2 GB RAM
- `db-s-2vcpu-4gb` - 2 vCPUs, 4 GB RAM
- `db-s-4vcpu-8gb` - 4 vCPUs, 8 GB RAM
- `db-s-6vcpu-16gb` - 6 vCPUs, 16 GB RAM
- `db-s-8vcpu-32gb` - 8 vCPUs, 32 GB RAM

## Configuration

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Database cluster name (3-63 chars, alphanumeric and hyphens) |
| `engine` | string | Database engine (pg, mysql, redis, mongodb, kafka, opensearch) |
| `num_nodes` | number | Number of nodes in the cluster (1-10) |
| `region` | string | DigitalOcean region |
| `size` | string | Database cluster size |

### Optional Properties

| Property | Type | Description |
|----------|------|-------------|
| `version` | string | Database engine version (uses latest if not specified) |
| `tags` | array | Tags to apply to the database cluster |
| `private_network_uuid` | string | VPC UUID for private networking |
| `db_config` | object | Engine-specific configuration settings |
| `api_token_secret_ref` | string | Custom secret reference for DigitalOcean API token (optional, uses provider by default) |

## Usage Examples

### Basic PostgreSQL Database (with Provider)

```yaml
namespace: my-app

my-postgres:
  defines: digitalocean-database/database
  name: my-postgres-db
  engine: pg
  version: "16"
  num_nodes: 1
  region: nyc1
  size: db-s-1vcpu-1gb
```

### High-Availability MySQL Cluster (with Provider)

```yaml
namespace: my-app

my-mysql-cluster:
  defines: digitalocean-database/database
  name: production-mysql
  engine: mysql
  version: "8.0"
  num_nodes: 3
  region: sfo3
  size: db-s-4vcpu-8gb
  tags:
    - environment:production
    - application:webapp
  db_config:
    sql_mode: "STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO"
    default_time_zone: "UTC"
```

### Redis Cache (with Provider)

```yaml
namespace: my-app

my-redis:
  defines: digitalocean-database/database
  name: app-cache
  engine: redis
  version: "7"
  num_nodes: 1
  region: fra1
  size: db-s-2vcpu-4gb
  db_config:
    redis_maxmemory_policy: "allkeys-lru"
```

### Using Custom API Token Secret (Legacy)

If you prefer to manage API tokens manually instead of using the provider:

```yaml
namespace: my-app

my-postgres-manual:
  defines: digitalocean-database/database
  api_token_secret_ref: my-custom-do-token
  name: my-postgres-manual
  engine: pg
  version: "16"
  num_nodes: 1
  region: nyc1
  size: db-s-1vcpu-1gb
  permitted-secrets:
    my-custom-do-token: true
```

## Custom Actions

### Get Database Information

```bash
monk do my-app/my-postgres/getDatabase
```

### List Databases in Cluster

```bash
monk do my-app/my-postgres/listDatabases
```

### Create a New Database

```bash
monk do my-app/my-postgres/createDatabase --db_name=myapp_prod
```

### Delete a Database

```bash
monk do my-app/my-postgres/deleteDatabase --db_name=myapp_test
```

### Get Connection Information

```bash
monk do my-app/my-postgres/getConnectionInfo
```

## DigitalOcean API Authentication

### Using DigitalOcean Provider (Recommended)

The easiest way to authenticate is using the DigitalOcean provider. Configure it once and all DigitalOcean entities will use it automatically:

```bash
# Configure DigitalOcean provider
monk c provider digitalocean --token="dop_v1_your-digitalocean-api-token-here"
```

No additional secrets or configuration needed! The entity will automatically use the provider for authentication.

### Using Manual Secrets (Legacy)

If you prefer to manage API tokens manually, you can store them as secrets:

```bash
monk secrets add -g digitalocean-api-key="dop_v1_your-digitalocean-api-token-here"
```

Then use the `api_token_secret_ref` property in your entity configuration.

**Note**: Replace `dop_v1_your-digitalocean-api-token-here` with your actual DigitalOcean API token (starts with `dop_v1_`).

The API token should have the following scopes:
- `database:read`
- `database:create`
- `database:delete`

## Lifecycle Operations

### Deployment

```bash
# Deploy a database cluster
monk run my-app/my-postgres

# Check status
monk ps my-app/my-postgres

# Get logs
monk logs my-app/my-postgres
```

### Updates

The entity supports updating:
- Cluster size (scaling up/down)
- Number of nodes
- Tags
- Configuration settings (engine-specific)

```bash
# Apply configuration changes
monk update my-app/my-postgres
```

### Cleanup

```bash
# Delete the database cluster
monk purge my-app/my-postgres
```

## State Information

The entity maintains the following state:

- `id` - Database cluster ID
- `name` - Cluster name
- `engine` - Database engine
- `version` - Engine version
- `status` - Current status (creating, online, etc.)
- `num_nodes` - Number of nodes
- `region` - Deployment region
- `size` - Cluster size
- `connection` - Connection details (URI, host, port, credentials)
- `created_at` - Creation timestamp
- `tags` - Applied tags

## Error Handling

The entity provides comprehensive error handling for:
- Invalid configuration parameters
- API authentication failures
- Network connectivity issues
- Database cluster creation/update failures
- Resource not found errors

## Monitoring and Readiness

The entity includes automatic readiness checks that monitor the database cluster status. It waits for the cluster to reach the "online" status before considering the deployment successful.

Default readiness configuration:
- Initial delay: 5 seconds
- Check interval: 15 seconds
- Maximum attempts: 40 (10 minutes total)

**Performance Note**: The readiness checks have been optimized to avoid CPU-intensive busy wait loops, ensuring efficient resource usage during database status monitoring.

## Troubleshooting

### Common Issues

1. **Provider Not Configured**: If you see "no provider creds for digitalocean", configure the provider with `monk c provider digitalocean --token="your-token"`
2. **Authentication Error**: Verify your DigitalOcean API token is correct and has sufficient permissions
3. **Region Not Available**: Check that your chosen region supports the database engine you want to use
4. **Size Not Supported**: Verify the size slug is valid for your chosen engine and region
5. **Cluster Creation Timeout**: Database clusters can take 5-10 minutes to create, especially for larger sizes

### Debugging

Enable debug output to see detailed API requests and responses:

```bash
export MONK_DEBUG=1
monk run my-app/my-postgres
```

This will show all HTTP requests made to the DigitalOcean API, helping you diagnose configuration or authentication issues.

## Recent Updates

### v2.0 - Provider Integration
- **Provider Support**: Added automatic authentication using DigitalOcean provider
- **Simplified Configuration**: No more manual secret management required
- **Performance Improvements**: Optimized readiness checks to eliminate CPU-intensive busy wait loops
- **Backward Compatibility**: Legacy secret-based authentication still supported via `api_token_secret_ref`

### Migration from v1.x

If you're upgrading from the previous version:

1. **Configure the provider** (recommended):
   ```bash
   monk c provider digitalocean --token="your-digitalocean-token"
   ```

2. **Update your configurations** by removing `secret_ref` and `permitted-secrets`:
   ```yaml
   # Old (v1.x)
   my-db:
     defines: digitalocean-database/database
     secret_ref: digitalocean-api-key
     permitted-secrets:
       digitalocean-api-key: true
     # ... other config
   
   # New (v2.0)
   my-db:
     defines: digitalocean-database/database
     # ... other config (no secrets needed!)
   ```

3. **Deploy as usual**:
   ```bash
   monk run my-app/my-db
   ```
