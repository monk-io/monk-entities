# DigitalOcean Database Entity for Monk

This directory contains a TypeScript entity for managing DigitalOcean Database clusters in the Monk orchestrator.

## Features

- **Complete Lifecycle Management**: Create, update, delete, and manage DigitalOcean database clusters
- **Provider Integration**: Automatic authentication using DigitalOcean provider (no manual secrets required)
- **Multiple Database Engines**: Support for PostgreSQL, MySQL, Valkey, MongoDB, Kafka, and OpenSearch
- **Flexible Configuration**: Support for different cluster sizes, node counts, and additional storage
- **Custom Actions**: Built-in actions for database management (create/delete databases, get connection info)
- **Error Handling**: Robust error handling with detailed error messages
- **Readiness Checks**: Automatic monitoring of database cluster status

## Supported Database Engines

- **PostgreSQL** (`pg`) - Versions 11, 12, 13, 14, 15, 16
- **MySQL** (`mysql`) - Versions 5.7, 8.0
- **Valkey** (`valkey`) - Versions 7, 8 (Note: `redis` is accepted for backwards compatibility and maps to `valkey`)
- **MongoDB** (`mongodb`) - Versions 4.4, 5.0, 6.0, 7.0
- **Apache Kafka** (`kafka`) - Version 3.5
- **OpenSearch** (`opensearch`) - Versions 1.x, 2.x

## Configuration

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Database cluster name (3-63 chars, alphanumeric and hyphens) |
| `engine` | string | Database engine (pg, mysql, valkey, mongodb, kafka, opensearch) |
| `num_nodes` | number | Number of nodes in the cluster (1-10) |
| `region` | string | DigitalOcean region slug (e.g., nyc1, sfo3, fra1) |
| `size` | string | Database cluster size slug (e.g., db-s-1vcpu-1gb, gd-2vcpu-8gb) |

### Optional Properties

| Property | Type | Description |
|----------|------|-------------|
| `version` | string | Database engine version (uses latest if not specified) |
| `tags` | array | Tags to apply to the database cluster |
| `private_network_uuid` | string | VPC UUID for private networking |
| `storage_size_mib` | number | Additional storage in MiB beyond base amount from size |
| `project_id` | string | Project ID to assign the cluster to (defaults to default project) |

### Database Size Families

DigitalOcean offers multiple size slug families:

- **Basic** (`db-s-*`): General purpose — e.g., `db-s-1vcpu-1gb`, `db-s-2vcpu-4gb`, `db-s-4vcpu-8gb`
- **General Purpose** (`gd-*`): Balanced compute/memory — e.g., `gd-2vcpu-8gb`, `gd-4vcpu-16gb`
- **Storage Optimized** (`so1_5-*`): High storage — e.g., `so1_5-2vcpu-16gb`, `so1_5-4vcpu-32gb`

See [DigitalOcean Managed Database Pricing](https://www.digitalocean.com/pricing/managed-databases) for the full list.

## Usage Examples

### Basic PostgreSQL Database

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

### High-Availability MySQL Cluster with Additional Storage

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
  storage_size_mib: 61440
  tags:
    - environment:production
    - application:webapp
```

### Valkey Cache

```yaml
namespace: my-app

my-valkey:
  defines: digitalocean-database/database
  name: app-cache
  engine: valkey
  version: "8"
  num_nodes: 1
  region: fra1
  size: db-s-2vcpu-4gb
```

> **Note**: If you specify `engine: redis`, it will automatically be mapped to `valkey` for backwards compatibility.

## Custom Actions

### Get Database Information

```bash
monk do my-app/my-postgres/get-database
```

### List Databases in Cluster

```bash
monk do my-app/my-postgres/list-databases
```

### Create a New Database

```bash
monk do my-app/my-postgres/create-database --db_name=myapp_prod
```

### Delete a Database

```bash
monk do my-app/my-postgres/delete-database --db_name=myapp_test
```

### Get Connection Information

```bash
monk do my-app/my-postgres/get-connection-info
```

### Resize Cluster

```bash
monk do my-app/my-postgres/resize-cluster --size=db-s-2vcpu-4gb --num_nodes=3 --storage_size_mib=61440
```

### Cost Estimate

```bash
monk do my-app/my-postgres/get-cost-estimate
monk do my-app/my-postgres/costs  # JSON format for billing
```

## Backup & Restore Actions

DigitalOcean managed databases include automatic daily backups with 7-day retention. The following actions allow you to manage and restore from backups.

### Get Backup Information

Shows backup configuration and PITR support status:

```bash
monk do my-app/my-postgres/get-backup-info
```

### List Available Backups

Lists all available backup points:

```bash
monk do my-app/my-postgres/list-backups
```

### Describe a Specific Backup

Get details of a backup by timestamp:

```bash
monk do my-app/my-postgres/describe-backup --backup_created_at=2024-01-15T00:00:00Z
```

### Restore (Fork) from Backup

Create a new cluster from a backup. This **creates a new independent cluster** - it does not restore in-place.

```bash
# Restore from a specific backup
monk do my-app/my-postgres/restore \
  --new_cluster_name=my-restored-db \
  --backup_created_at=2024-01-15T00:00:00Z

# Point-in-time recovery (PostgreSQL and MySQL only)
monk do my-app/my-postgres/restore \
  --new_cluster_name=my-restored-db \
  --restore_time=2024-01-15T14:30:00Z

# With custom size and region
monk do my-app/my-postgres/restore \
  --new_cluster_name=my-restored-db \
  --backup_created_at=2024-01-15T00:00:00Z \
  --size=db-s-2vcpu-4gb \
  --num_nodes=2 \
  --region=nyc3
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `new_cluster_name` | Yes | Name for the new forked cluster |
| `backup_created_at` | Conditional | Backup timestamp (required for non-PITR engines) |
| `restore_time` | No | Point-in-time to restore (ISO 8601, PostgreSQL/MySQL only) |
| `size` | No | Size for new cluster (defaults to source size) |
| `num_nodes` | No | Number of nodes (defaults to 1) |
| `region` | No | Region for new cluster (defaults to source region) |

### Check Restore Status

Monitor the progress of a fork operation:

```bash
monk do my-app/my-postgres/get-restore-status --cluster_id=<new-cluster-id>
```

### Backup Support by Engine

| Engine | Daily Backups | PITR Support | Fork/Restore |
|--------|---------------|--------------|--------------|
| PostgreSQL (`pg`) | Yes | Yes | Yes |
| MySQL (`mysql`) | Yes | Yes | Yes |
| Valkey (`valkey`) | Yes | No | No |
| MongoDB (`mongodb`) | Yes | No | No |
| Kafka (`kafka`) | No | No | No |
| OpenSearch (`opensearch`) | Yes | No | No |

**Important Notes:**
- All DigitalOcean managed databases have automatic daily backups (cannot be disabled)
- Backup retention is fixed at 7 days
- Restore always creates a NEW cluster (no in-place restore)
- The restored cluster is independent and not managed by the source entity
- Point-in-time recovery (PITR) is only available for PostgreSQL and MySQL

## DigitalOcean API Authentication

### Using DigitalOcean Provider (Recommended)

Configure it once and all DigitalOcean entities will use it automatically:

```bash
monk cluster provider add -p digitalocean
```

No additional secrets or configuration needed.

## State Information

The entity maintains the following state:

| Field | Description |
|-------|-------------|
| `id` | Database cluster UUID |
| `name` | Cluster name |
| `engine` | Database engine |
| `version` | Engine version |
| `semantic_version` | Full semantic version (e.g., "16.4") |
| `status` | Current status (creating, online, resizing, migrating, forking) |
| `num_nodes` | Number of nodes |
| `region` | Deployment region |
| `size` | Cluster size slug |
| `storage_size_mib` | Storage in MiB |
| `connection_uri` | Public connection URI |
| `connection_host` | Public hostname |
| `connection_port` | Public port |
| `connection_user` | Database user |
| `connection_password` | Database password |
| `connection_database` | Default database name |
| `connection_ssl` | Whether SSL is enabled |
| `private_connection_uri` | Private connection URI |
| `private_connection_host` | Private hostname |
| `private_connection_port` | Private port |
| `standby_connection_host` | Standby node hostname (multi-node) |
| `standby_connection_port` | Standby node port (multi-node) |
| `created_at` | Creation timestamp |
| `tags` | Applied tags |

## Monitoring and Readiness

The entity includes automatic readiness checks that monitor the database cluster status. It waits for the cluster to reach the "online" status before considering the deployment successful.

Default readiness configuration:
- Initial delay: 5 seconds
- Check interval: 15 seconds
- Maximum attempts: 40 (10 minutes total)
