# DigitalOcean Database Entity for Monk

This directory contains a TypeScript entity for managing DigitalOcean Database clusters in the Monk orchestrator.

## Features

- **Complete Lifecycle Management**: Create, update, delete, and manage DigitalOcean database clusters
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
| `secret_ref` | string | Secret reference for DigitalOcean API token |
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

## Usage Examples

### Basic PostgreSQL Database

```yaml
namespace: my-app

my-postgres:
  defines: digitalocean-database/database
  secret_ref: digitalocean-api-key
  name: my-postgres-db
  engine: pg
  version: "16"
  num_nodes: 1
  region: nyc1
  size: db-s-1vcpu-1gb
  permitted-secrets:
    digitalocean-api-key: true
```

### High-Availability MySQL Cluster

```yaml
namespace: my-app

my-mysql-cluster:
  defines: digitalocean-database/database
  secret_ref: digitalocean-api-key
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
  permitted-secrets:
    digitalocean-api-key: true
```

### Redis Cache

```yaml
namespace: my-app

my-redis:
  defines: digitalocean-database/database
  secret_ref: digitalocean-api-key
  name: app-cache
  engine: redis
  version: "7"
  num_nodes: 1
  region: fra1
  size: db-s-2vcpu-4gb
  db_config:
    redis_maxmemory_policy: "allkeys-lru"
  permitted-secrets:
    digitalocean-api-key: true
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

You need a DigitalOcean API token with database management permissions. Store it as a secret:

```bash
monk secrets add -g digitalocean-api-key=""
```

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

## Troubleshooting

### Common Issues

1. **Authentication Error**: Verify your DigitalOcean API token is correct and has sufficient permissions
2. **Region Not Available**: Check that your chosen region supports the database engine you want to use
3. **Size Not Supported**: Verify the size slug is valid for your chosen engine and region
4. **Cluster Creation Timeout**: Database clusters can take 5-10 minutes to create, especially for larger sizes

### Debugging

Enable debug output to see detailed API requests and responses:

```bash
export MONK_DEBUG=1
monk run my-app/my-postgres
```

This will show all HTTP requests made to the DigitalOcean API, helping you diagnose configuration or authentication issues.
