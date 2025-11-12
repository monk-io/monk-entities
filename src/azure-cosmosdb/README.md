# Azure Cosmos DB for MonkEC

This package provides MonkEC entities for managing Azure Cosmos DB resources with comprehensive support for both infrastructure management and data operations.

## Overview

Azure Cosmos DB is a globally distributed, multi-model database service that enables you to elastically and independently scale throughput and storage across any number of Azure regions worldwide. This package supports:

- **DatabaseAccount**: Manages Azure Cosmos DB database accounts with support for NoSQL, MongoDB, and other APIs (Management Plane)
- **Database**: Manages individual databases within Cosmos DB accounts with throughput provisioning (Data Plane)

## Architecture

This implementation uses a **hybrid HTTP client approach** for optimal Azure integration:

- **Management Plane API**: Uses MonkEC's built-in `cloud/azure` module for account-level operations and authentication
- **Data Plane API**: Uses direct HTTP client with HMAC-SHA256 authentication for database operations

This architecture ensures robust authentication while maintaining precise control over Data Plane requests, providing the best of both worlds for Azure Cosmos DB management.

## Prerequisites

- Azure subscription with appropriate permissions to create Cosmos DB resources
- Azure credentials configured (through Azure CLI, service principal, or managed identity)
- Monk CLI installed and configured

## Installation

From the `azure-cosmosdb` directory:

```bash
INPUT_DIR=./src/azure-cosmosdb/ OUTPUT_DIR=./dist/azure-cosmosdb/ ./monkec.sh compile
cd dist/azure-cosmosdb/ && monk load MANIFEST
```

## Entities

### DatabaseAccount

Manages Azure Cosmos DB database accounts with full lifecycle support using the Azure Management API.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subscription_id` | string | Yes | Azure subscription ID |
| `resource_group_name` | string | Yes | Azure resource group name |
| `account_name` | string | Yes | Cosmos DB account name (3-50 chars, lowercase, alphanumeric and hyphens) |
| `locations` | LocationConfig[] | Yes | Array of georeplication locations |
| `database_account_offer_type` | string | No | The offer type (default: "Standard") |
| `account_kind` | string | No | Database account type: "GlobalDocumentDB", "MongoDB", "Parse" (default: "GlobalDocumentDB") |
| `consistency_policy` | ConsistencyPolicy | No | Consistency policy configuration |
| `enable_automatic_failover` | boolean | No | Enable automatic failover (default: false) |
| `enable_multiple_write_locations` | boolean | No | Enable multiple write locations (default: false) |
| `enable_analytical_storage` | boolean | No | Enable analytical storage (default: false) |
| `public_network_access` | string | No | Public network access: "Enabled", "Disabled", "SecuredByPerimeter" (default: "Enabled") |
| `disable_local_auth` | boolean | No | Disable local authentication (default: false) |
| `location` | string | No | Resource location (defaults to first location in locations array) |
| `tags` | object | No | Resource tags |
| `create_when_missing` | boolean | No | Create resource if it doesn't exist (default: true) |

#### LocationConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `location_name` | string | Yes | Azure region name (e.g., "East US", "West Europe") |
| `failover_priority` | number | Yes | Failover priority (0 for write region, higher numbers for read regions) |
| `is_zone_redundant` | boolean | No | Enable zone redundancy (default: false) |

#### ConsistencyPolicy

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `default_consistency_level` | string | Yes | Consistency level: "Eventual", "ConsistentPrefix", "Session", "BoundedStaleness", "Strong" |
| `max_staleness_prefix` | number | No | Max staleness prefix (required for BoundedStaleness, 1-2147483647) |
| `max_interval_in_seconds` | number | No | Max interval in seconds (required for BoundedStaleness, 5-86400) |

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `account_name` | string | Database account name |
| `document_endpoint` | string | Document endpoint URL |
| `provisioning_state` | string | Current provisioning state |
| `write_locations` | array | Write locations |
| `read_locations` | array | Read locations |
| `existing` | boolean | Whether the resource existed before entity management |

### Database

Manages individual databases within Azure Cosmos DB accounts using the Cosmos DB Data Plane API with HMAC-SHA256 authentication.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subscription_id` | string | Yes | Azure subscription ID |
| `resource_group_name` | string | Yes | Azure resource group name |
| `database_account_name` | string | Yes | Name of the parent Cosmos DB account |
| `database_id` | string | Yes | Unique database identifier (1-255 chars, no special chars) |
| `manual_throughput` | number | No | Manual throughput in RU/s (400-1000000, mutually exclusive with autoscale) |
| `autoscale_settings` | AutoscaleSettings | No | Autoscale configuration (mutually exclusive with manual_throughput) |
| `tags` | object | No | Resource tags |
| `create_when_missing` | boolean | No | Create resource if it doesn't exist (default: true) |

#### AutoscaleSettings

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `max_throughput` | number | Yes | Maximum throughput for autoscale (minimum 4000 RU/s) |

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `database_id` | string | Database identifier |
| `resource_id` | string | Azure resource ID |
| `self_link` | string | Self-reference link |
| `etag` | string | Entity tag for optimistic concurrency |
| `timestamp` | number | Last modification timestamp |
| `collections_path` | string | Collections endpoint path |
| `users_path` | string | Users endpoint path |
| `existing` | boolean | Whether the database existed before entity management |

## Examples

### Complete Cosmos DB Setup (Account + Database)

```yaml
namespace: my-app

# 1. Create the Cosmos DB Account
cosmos-account:
  defines: azure-cosmosdb/database-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  account_name: "my-cosmos-account"
  locations:
    - location_name: "East US"
      failover_priority: 0
      is_zone_redundant: false
  consistency_policy:
    default_consistency_level: "Session"
  tags:
    Environment: "Development"

# 2. Create a Database within the Account
ecommerce-db:
  defines: azure-cosmosdb/database
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  database_account_name: "my-cosmos-account"
  database_id: "ecommerce"
  manual_throughput: 400
  tags:
    Purpose: "ECommerce"
    Environment: "Development"

# 3. Application using the database
app:
  defines: runnable
  containers:
    api:
      image: node:18-alpine
      bash: |
        echo "Cosmos DB Endpoint: $COSMOS_DB_ENDPOINT"
        echo "Database: $DATABASE_ID"
        # Your application logic here
        sleep 3600
  depends:
    wait-for:
      runnables:
        - my-app/cosmos-account
        - my-app/ecommerce-db
  connections:
    cosmos:
      runnable: my-app/cosmos-account
      service: data
    database:
      runnable: my-app/ecommerce-db
      service: data
  variables:
    COSMOS_DB_ENDPOINT:
      type: string
      env: COSMOS_DB_ENDPOINT
      value: <- connection-target("cosmos") entity-state get-member("document_endpoint")
    DATABASE_ID:
      type: string
      env: DATABASE_ID
      value: <- connection-target("database") entity-state get-member("database_id")
```

### Multi-Region High-Availability Setup

```yaml
namespace: production

# High-availability Cosmos DB account
ha-cosmos-account:
  defines: azure-cosmosdb/database-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "production-rg"
  account_name: "prod-cosmos-ha"
  locations:
    - location_name: "East US"
      failover_priority: 0
      is_zone_redundant: true
    - location_name: "West US 2"
      failover_priority: 1
      is_zone_redundant: true
    - location_name: "North Europe"
      failover_priority: 2
      is_zone_redundant: false
  consistency_policy:
    default_consistency_level: "BoundedStaleness"
    max_staleness_prefix: 100000
    max_interval_in_seconds: 300
  enable_automatic_failover: true
  enable_multiple_write_locations: true
  enable_analytical_storage: true
  tags:
    Environment: "Production"
    HighAvailability: "true"

# Production database with autoscale
prod-database:
  defines: azure-cosmosdb/database
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "production-rg"
  database_account_name: "prod-cosmos-ha"
  database_id: "production-data"
  autoscale_settings:
    max_throughput: 20000
  tags:
    Environment: "Production"
    Tier: "Premium"
```

### MongoDB API Configuration

```yaml
namespace: mongodb-app

mongodb-cosmos:
  defines: azure-cosmosdb/database-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "mongodb-rg"
  account_name: "my-mongodb-cosmos"
  account_kind: "MongoDB"
  locations:
    - location_name: "East US"
      failover_priority: 0
  consistency_policy:
    default_consistency_level: "Eventual"
  tags:
    API: "MongoDB"
    Environment: "Development"

mongodb-database:
  defines: azure-cosmosdb/database
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "mongodb-rg"
  database_account_name: "my-mongodb-cosmos"
  database_id: "mongodb-data"
  manual_throughput: 1000
  tags:
    API: "MongoDB"
```

## Authentication

### Azure Credentials

This entity uses Azure credentials that should be configured through one of these methods:

1. **Azure CLI**: Run `az login` to authenticate
2. **Service Principal**: Set environment variables:
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_TENANT_ID`
3. **Managed Identity**: When running on Azure resources with managed identity enabled

### HMAC-SHA256 Authentication

The Database entity implements Azure Cosmos DB's native HMAC-SHA256 authentication for Data Plane operations:

- **Master Key Retrieval**: Automatically fetches account master keys using the Management API
- **Signature Generation**: Implements RFC-compliant HMAC-SHA256 signatures
- **Request Signing**: Each request is cryptographically signed with proper headers
- **Binary Key Handling**: Uses Go runtime for secure base64 key handling

This approach provides:
- ✅ **Secure Authentication**: Cryptographically secure request signing
- ✅ **Azure Compliance**: Follows official Azure Cosmos DB authentication specification
- ✅ **Automatic Key Management**: No manual key configuration required
- ✅ **Production Ready**: Validated against Azure's official examples

## Consistency Levels

Azure Cosmos DB offers five consistency levels:

- **Strong**: Linearizability guarantee - reads return the most recent committed version
- **Bounded Staleness**: Consistent prefix with configurable lag bounds  
- **Session**: Consistent prefix with monotonic read/write guarantees within a session (default)
- **Consistent Prefix**: Updates are returned in order, but may not be the latest
- **Eventual**: No ordering guarantees, but all replicas eventually converge

Choose based on your application's requirements:
- **Strong/Bounded Staleness**: Financial applications, inventory systems
- **Session**: Web applications, user sessions (recommended default)
- **Eventual**: High-scale read-heavy workloads, analytics

## Throughput Management

### Manual Throughput
- Fixed RU/s allocation (400-1,000,000 RU/s)
- Predictable costs
- Suitable for steady workloads

### Autoscale Throughput
- Automatic scaling (minimum 4,000 RU/s)
- Scales based on usage
- Cost-effective for variable workloads

### Best Practices
- Start with manual throughput for predictable workloads
- Use autoscale for development and unpredictable traffic
- Monitor RU consumption and adjust accordingly
- Consider shared vs dedicated database throughput

## Multi-Region Configuration

When configuring multiple regions:

1. **Write Region**: Set `failover_priority: 0` for the primary write region
2. **Read Regions**: Set higher `failover_priority` values (1, 2, 3, etc.) for read regions
3. **Zone Redundancy**: Enable `is_zone_redundant: true` for production workloads
4. **Multiple Writes**: Set `enable_multiple_write_locations: true` for multi-master scenarios
5. **Automatic Failover**: Enable for high availability scenarios

## Testing

Run the integration tests:

```bash
sudo INPUT_DIR=./src/azure-cosmosdb/ ./monkec.sh test --verbose
```

Make sure to configure your Azure credentials before running tests.

## Troubleshooting

### Common Issues

**DatabaseAccount Entity:**
1. **Authentication Errors**: Ensure Azure credentials are properly configured
2. **Resource Group Not Found**: Verify the resource group exists in the specified subscription
3. **Location Constraints**: Some Azure regions may not support all Cosmos DB features
4. **Account Name Conflicts**: Cosmos DB account names must be globally unique

**Database Entity:**
1. **Master Key Access**: Ensure the entity has permissions to access account keys
2. **Account Not Found**: Verify the database account exists and is accessible
3. **Throughput Limits**: Check minimum/maximum throughput requirements
4. **Authentication Failures**: HMAC signature issues are automatically handled

### Debugging

Enable detailed monitoring:

```bash
# Check entity status
monk describe my-app/cosmos-account
monk describe my-app/my-database

# View logs
monk logs -f my-app/cosmos-account
monk logs -f my-app/my-database

# Test connectivity
monk shell my-app/cosmos-account
```

### Performance Optimization

1. **Choose Appropriate Consistency**: Use Session for most applications
2. **Optimize Throughput**: Start conservative, monitor, and adjust
3. **Region Proximity**: Place read regions close to your users
4. **Partition Key Design**: Design effective partition keys for your data model

## API References

- [Azure Cosmos DB Management API](https://learn.microsoft.com/en-us/rest/api/cosmos-db-resource-provider/)
- [Azure Cosmos DB Data Plane API](https://learn.microsoft.com/en-us/rest/api/cosmos-db/)
- [Cosmos DB Authentication](https://docs.microsoft.com/en-us/rest/api/cosmos-db/access-control-on-cosmosdb-resources)

## Contributing

This entity follows the MonkEC conventions for Azure resources. When contributing:

1. Use snake_case for definition properties
2. Use kebab-case for entity names and actions  
3. Include comprehensive JSDoc documentation
4. Add integration tests for new functionality
5. Update examples and documentation
6. Follow the hybrid HTTP client pattern for new Data Plane operations

## License

This project is part of the MonkEC ecosystem. See the main project license for details.