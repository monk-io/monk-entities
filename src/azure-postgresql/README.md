# Azure Database for PostgreSQL for MonkEC

This package provides MonkEC entities for managing Azure Database for PostgreSQL Flexible Server resources.

## Overview

Azure Database for PostgreSQL Flexible Server is a fully managed database service designed to provide more granular control and flexibility over database management functions and configuration settings. This package supports:

- **FlexibleServer**: Manages Azure Database for PostgreSQL Flexible Servers with configurable compute, storage, and networking
- **Database**: Manages individual databases within Flexible Servers
- **FirewallRule**: Manages firewall rules for network access control

## Prerequisites

- Azure subscription with appropriate permissions to create PostgreSQL resources
- Azure credentials configured (through Azure CLI, service principal, or managed identity)
- Monk CLI installed and configured

## Installation

From the `azure-postgresql` directory:

```bash
INPUT_DIR=./src/azure-postgresql/ OUTPUT_DIR=./dist/azure-postgresql/ ./monkec.sh compile
cd dist/azure-postgresql/ && monk load MANIFEST
```

## Entities

### FlexibleServer

Manages Azure Database for PostgreSQL Flexible Servers with full lifecycle support.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subscription_id` | string | Yes | Azure subscription ID |
| `resource_group_name` | string | Yes | Azure resource group name |
| `server_name` | string | Yes | PostgreSQL server name (3-63 chars, lowercase, alphanumeric and hyphens) |
| `location` | string | Yes | Azure region for the server |
| `version` | string | No | PostgreSQL version: "11", "12", "13", "14", "15", "16" (default: "16") |
| `sku` | SkuConfig | No | SKU configuration (compute tier and size) |
| `storage` | StorageConfig | No | Storage configuration |
| `backup` | BackupConfig | No | Backup configuration |
| `high_availability` | HighAvailabilityConfig | No | High availability configuration |
| `network` | NetworkConfig | No | Network configuration |
| `auth_config` | AuthConfig | No | Authentication configuration |
| `administrator_login` | string | No | Administrator login name |
| `administrator_password_secret_ref` | string | No | Secret reference for administrator password |
| `availability_zone` | string | No | Availability zone for the server |
| `tags` | object | No | Resource tags |
| `connection_string_secret_ref` | string | No | Secret reference to store connection string |
| `create_when_missing` | boolean | No | Create resource if it doesn't exist (default: true) |

#### SkuConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | SKU name (e.g., "Standard_B1ms", "Standard_D2s_v3") |
| `tier` | string | No | SKU tier: "Burstable", "GeneralPurpose", "MemoryOptimized" (default: "GeneralPurpose") |

#### StorageConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `storage_size_gb` | number | No | Storage size in GB (32-16384, default: 32) |
| `auto_grow` | string | No | Storage auto grow: "Enabled", "Disabled" (default: "Disabled") |
| `storage_tier` | string | No | Storage tier (P4, P6, P10, etc.) |

#### BackupConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `backup_retention_days` | number | No | Backup retention days (7-35, default: 7) |
| `geo_redundant_backup` | string | No | Geo-redundant backup: "Enabled", "Disabled" (default: "Disabled") |

#### HighAvailabilityConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `mode` | string | No | HA mode: "Disabled", "ZoneRedundant", "SameZone" (default: "Disabled") |
| `standby_availability_zone` | string | No | Standby availability zone |

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `server_name` | string | Server name |
| `fqdn` | string | Fully qualified domain name |
| `server_state` | string | Server state (Ready, Stopped, etc.) |
| `version` | string | PostgreSQL version |
| `administrator_login` | string | Administrator login name |
| `existing` | boolean | Whether the resource existed before entity management |

#### Actions

| Action | Description |
|--------|-------------|
| `get-info` | Get detailed server information |
| `start-server` | Start a stopped server |
| `stop-server` | Stop a running server |
| `restart-server` | Restart the server (optional failover_mode parameter) |
| `get-connection-string` | Get connection string (optional database parameter) |

### Database

Manages individual databases within Azure Database for PostgreSQL Flexible Servers.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subscription_id` | string | Yes | Azure subscription ID |
| `resource_group_name` | string | Yes | Azure resource group name |
| `server_name` | string | Yes | Name of the parent PostgreSQL Flexible Server |
| `database_name` | string | Yes | Database name (1-63 chars, alphanumeric and underscores) |
| `charset` | string | No | Character set (default: "UTF8") |
| `collation` | string | No | Collation (default: "en_US.utf8") |
| `create_when_missing` | boolean | No | Create resource if it doesn't exist (default: true) |

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `database_name` | string | Database name |
| `server_name` | string | Parent server name |
| `charset` | string | Character set |
| `collation` | string | Collation |
| `existing` | boolean | Whether the database existed before entity management |

#### Actions

| Action | Description |
|--------|-------------|
| `get-info` | Get database information |

### FirewallRule

Manages firewall rules for Azure Database for PostgreSQL Flexible Servers.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subscription_id` | string | Yes | Azure subscription ID |
| `resource_group_name` | string | Yes | Azure resource group name |
| `server_name` | string | Yes | Name of the parent PostgreSQL Flexible Server |
| `rule_name` | string | Yes | Firewall rule name |
| `start_ip_address` | string | Yes | Start IP address of the firewall rule range |
| `end_ip_address` | string | Yes | End IP address of the firewall rule range |
| `create_when_missing` | boolean | No | Create resource if it doesn't exist (default: true) |

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `rule_name` | string | Firewall rule name |
| `server_name` | string | Parent server name |
| `start_ip_address` | string | Start IP address |
| `end_ip_address` | string | End IP address |
| `existing` | boolean | Whether the rule existed before entity management |

#### Actions

| Action | Description |
|--------|-------------|
| `get-info` | Get firewall rule information |

## Examples

### Basic PostgreSQL Setup

```yaml
namespace: my-app

# Create the PostgreSQL Flexible Server
postgres-server:
  defines: azure-postgresql/flexible-server
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  server_name: "my-postgres-server"
  location: "East US"
  version: "16"
  sku:
    name: "Standard_B1ms"
    tier: "Burstable"
  storage:
    storage_size_gb: 32
  administrator_login: "pgadmin"
  administrator_password_secret_ref: "postgres-password"
  permitted-secrets:
    postgres-password: true
  services:
    data:
      protocol: custom

# Create a database
app-database:
  defines: azure-postgresql/database
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  server_name: "my-postgres-server"
  database_name: "myapp"
  depends:
    wait-for:
      runnables:
        - my-app/postgres-server
      timeout: 900
  connections:
    server:
      runnable: my-app/postgres-server
      service: data
  services:
    data:
      protocol: custom

# Allow Azure services
allow-azure:
  defines: azure-postgresql/firewall-rule
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  server_name: "my-postgres-server"
  rule_name: "AllowAzureServices"
  start_ip_address: "0.0.0.0"
  end_ip_address: "0.0.0.0"
  depends:
    wait-for:
      runnables:
        - my-app/postgres-server
      timeout: 900
  connections:
    server:
      runnable: my-app/postgres-server
      service: data

# Application using the database
web-app:
  defines: runnable
  containers:
    api:
      image: node:20-alpine
      bash: |
        echo "PostgreSQL Host: $PG_HOST"
        echo "Database: $PG_DATABASE"
        sleep 3600
  depends:
    wait-for:
      runnables:
        - my-app/postgres-server
        - my-app/app-database
  connections:
    postgres:
      runnable: my-app/postgres-server
      service: data
    database:
      runnable: my-app/app-database
      service: data
  variables:
    PG_HOST:
      type: string
      env: PG_HOST
      value: <- connection-target("postgres") entity-state get-member("fqdn")
    PG_DATABASE:
      type: string
      env: PG_DATABASE
      value: <- connection-target("database") entity-state get-member("database_name")
```

### Production Setup with High Availability

```yaml
namespace: production

prod-postgres:
  defines: azure-postgresql/flexible-server
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "production-rg"
  server_name: "prod-postgres-ha"
  location: "East US"
  version: "16"
  sku:
    name: "Standard_D4s_v3"
    tier: "GeneralPurpose"
  storage:
    storage_size_gb: 256
    auto_grow: "Enabled"
  backup:
    backup_retention_days: 35
    geo_redundant_backup: "Enabled"
  high_availability:
    mode: "ZoneRedundant"
    standby_availability_zone: "2"
  availability_zone: "1"
  administrator_login: "pgadmin"
  administrator_password_secret_ref: "prod-postgres-password"
  connection_string_secret_ref: "prod-postgres-connection"
  tags:
    Environment: "Production"
    HighAvailability: "true"
  permitted-secrets:
    prod-postgres-password: true
    prod-postgres-connection: true
  services:
    data:
      protocol: custom
```

## Authentication

This entity uses Azure credentials that should be configured through one of these methods:

1. **Azure CLI**: Run `az login` to authenticate
2. **Service Principal**: Set environment variables:
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_TENANT_ID`
3. **Managed Identity**: When running on Azure resources with managed identity enabled

## SKU Tiers

Azure Database for PostgreSQL Flexible Server offers three compute tiers:

### Burstable
- Best for workloads that don't need full CPU continuously
- SKUs: Standard_B1ms, Standard_B2s, Standard_B2ms, Standard_B4ms, Standard_B8ms, Standard_B12ms, Standard_B16ms, Standard_B20ms

### General Purpose
- Best for most business workloads requiring balanced compute and memory
- SKUs: Standard_D2s_v3, Standard_D4s_v3, Standard_D8s_v3, Standard_D16s_v3, Standard_D32s_v3, Standard_D48s_v3, Standard_D64s_v3

### Memory Optimized
- Best for high-performance database workloads requiring in-memory performance
- SKUs: Standard_E2s_v3, Standard_E4s_v3, Standard_E8s_v3, Standard_E16s_v3, Standard_E32s_v3, Standard_E48s_v3, Standard_E64s_v3

## Testing

Run the integration tests:

```bash
# Set up environment variables
cp src/azure-postgresql/test/env.example src/azure-postgresql/test/.env
# Edit .env with your Azure credentials

# Run tests
sudo INPUT_DIR=./src/azure-postgresql/ ./monkec.sh test --verbose
```

## Troubleshooting

### Common Issues

1. **Server Creation Takes Long**: PostgreSQL Flexible Server creation can take 5-15 minutes. The readiness check will wait for the server to be ready.

2. **Authentication Errors**: Ensure Azure credentials are properly configured via Azure CLI, service principal, or managed identity.

3. **Resource Group Not Found**: Verify the resource group exists in the specified subscription.

4. **Server Name Conflicts**: PostgreSQL server names must be globally unique within Azure.

5. **Password Requirements**: Administrator password must meet Azure's complexity requirements (8+ chars, uppercase, lowercase, number, special char).

### Debugging

```bash
# Check entity status
monk describe my-app/postgres-server

# View logs
monk logs -f my-app/postgres-server

# Get server info
monk do my-app/postgres-server/get-info

# Get connection string
monk do my-app/postgres-server/get-connection-string
```

## API References

- [Azure Database for PostgreSQL Flexible Server REST API](https://learn.microsoft.com/en-us/rest/api/postgresql/)
- [Azure Database for PostgreSQL Documentation](https://learn.microsoft.com/en-us/azure/postgresql/)
- [Flexible Server Overview](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/overview)

## Contributing

This entity follows the MonkEC conventions for Azure resources. When contributing:

1. Use snake_case for definition properties
2. Use kebab-case for entity names and actions
3. Include comprehensive JSDoc documentation
4. Add integration tests for new functionality
5. Update examples and documentation

## License

This project is part of the MonkEC ecosystem. See the main project license for details.
