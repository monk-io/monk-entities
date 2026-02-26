# Azure Storage Account for MonkEC

This package provides MonkEC entities for managing Azure Storage Account resources with comprehensive support for storage accounts and blob containers.

## Overview

Azure Storage is a Microsoft-managed service providing cloud storage that is highly available, secure, durable, scalable, and redundant. This package supports:

- **StorageAccount**: Manages Azure Storage Accounts with support for various SKUs, access tiers, and network configurations
- **BlobContainer**: Manages blob containers within storage accounts with access control and metadata support

## Prerequisites

- Azure subscription with appropriate permissions to create Storage resources
- Azure credentials configured (through Azure CLI, service principal, or managed identity)
- Monk CLI installed and configured

## Installation

From the `azure-storage-account` directory:

```bash
INPUT_DIR=./src/azure-storage-account/ OUTPUT_DIR=./dist/azure-storage-account/ ./monkec.sh compile
cd dist/azure-storage-account/ && monk load MANIFEST
```

## Entities

### StorageAccount

Manages Azure Storage Accounts with full lifecycle support using the Azure Management API.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subscription_id` | string | Yes | Azure subscription ID |
| `resource_group_name` | string | Yes | Azure resource group name |
| `account_name` | string | Yes | Storage account name (3-24 chars, lowercase alphanumeric only) |
| `location` | string | Yes | Azure region for the storage account |
| `sku` | SkuConfig | Yes | Storage account SKU configuration |
| `account_kind` | string | No | Account type: "StorageV2", "Storage", "BlobStorage", "BlockBlobStorage", "FileStorage" (default: "StorageV2") |
| `access_tier` | string | No | Access tier: "Hot", "Cool", "Premium" (default: "Hot") |
| `enable_hns` | boolean | No | Enable hierarchical namespace for Data Lake Storage Gen2 (default: false) |
| `minimum_tls_version` | string | No | Minimum TLS version: "TLS1_0", "TLS1_1", "TLS1_2" (default: "TLS1_2") |
| `allow_blob_public_access` | boolean | No | Allow public access to blobs (default: false) |
| `allow_shared_key_access` | boolean | No | Allow shared key access (default: true) |
| `https_only` | boolean | No | Enable HTTPS traffic only (default: true) |
| `network_rule_set` | NetworkRuleSet | No | Network firewall configuration |
| `encryption` | EncryptionConfig | No | Encryption configuration |
| `tags` | object | No | Resource tags |
| `create_when_missing` | boolean | No | Create resource if it doesn't exist (default: true) |
| `primary_key_secret_ref` | string | No | Secret name to store primary access key |
| `secondary_key_secret_ref` | string | No | Secret name to store secondary access key |
| `connection_string_secret_ref` | string | No | Secret name to store connection string |

#### SkuConfig

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | SKU name: "Standard_LRS", "Standard_GRS", "Standard_RAGRS", "Standard_ZRS", "Premium_LRS", "Premium_ZRS", "Standard_GZRS", "Standard_RAGZRS" |

#### NetworkRuleSet

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `default_action` | string | No | Default action: "Allow", "Deny" (default: "Allow") |
| `bypass` | string | No | Bypass options for Azure services (default: "AzureServices") |
| `ip_rules` | IpRule[] | No | IP address rules for firewall |
| `virtual_network_rules` | VirtualNetworkRule[] | No | Virtual network rules |

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `account_name` | string | Storage account name |
| `primary_blob_endpoint` | string | Primary blob service endpoint URL |
| `primary_file_endpoint` | string | Primary file service endpoint URL |
| `primary_queue_endpoint` | string | Primary queue service endpoint URL |
| `primary_table_endpoint` | string | Primary table service endpoint URL |
| `primary_dfs_endpoint` | string | Primary Data Lake Storage endpoint URL |
| `primary_web_endpoint` | string | Primary web endpoint URL |
| `location` | string | Storage account location |
| `provisioning_state` | string | Current provisioning state |
| `existing` | boolean | Whether the resource existed before entity management |

#### Actions

| Action | Description |
|--------|-------------|
| `get-info` | Get detailed information about the storage account |
| `regenerate-key` | Regenerate storage account access keys |
| `list-containers` | List blob containers in the storage account |

### BlobContainer

Manages blob containers within Azure Storage Accounts.

#### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `subscription_id` | string | Yes | Azure subscription ID |
| `resource_group_name` | string | Yes | Azure resource group name |
| `storage_account_name` | string | Yes | Name of the parent storage account |
| `container_name` | string | Yes | Blob container name (3-63 chars, lowercase, alphanumeric and hyphens) |
| `public_access` | string | No | Public access level: "None", "Blob", "Container" (default: "None") |
| `default_encryption_scope` | string | No | Default encryption scope for the container |
| `deny_encryption_scope_override` | boolean | No | Deny encryption scope override (default: false) |
| `enable_immutable_storage_with_versioning` | boolean | No | Enable immutable storage with versioning (default: false) |
| `metadata` | object | No | Container metadata as key-value pairs |
| `create_when_missing` | boolean | No | Create resource if it doesn't exist (default: true) |

#### State Properties

| Property | Type | Description |
|----------|------|-------------|
| `container_name` | string | Container name |
| `storage_account_name` | string | Parent storage account name |
| `etag` | string | Container ETag |
| `last_modified` | string | Last modified time |
| `lease_state` | string | Lease state of the container |
| `public_access` | string | Public access level |
| `has_immutability_policy` | boolean | Whether the container has immutability policy |
| `has_legal_hold` | boolean | Whether the container has legal hold |
| `existing` | boolean | Whether the resource existed before entity management |

#### Actions

| Action | Description |
|--------|-------------|
| `get-info` | Get detailed information about the blob container |
| `set-legal-hold` | Set legal hold on the container |

## Examples

### Basic Storage Account Setup

```yaml
namespace: my-app

storage:
  defines: azure-storage-account/storage-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  account_name: "mystorageaccount123"
  location: "East US"
  sku:
    name: "Standard_LRS"
  account_kind: "StorageV2"
  access_tier: "Hot"
  https_only: true
  minimum_tls_version: "TLS1_2"
  tags:
    Environment: "Development"
```

### Storage Account with Blob Container

```yaml
namespace: my-app

storage:
  defines: azure-storage-account/storage-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  account_name: "mystorageaccount123"
  location: "East US"
  sku:
    name: "Standard_LRS"
  tags:
    Environment: "Development"

app-data:
  defines: azure-storage-account/blob-container
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  storage_account_name: "mystorageaccount123"
  container_name: "app-data"
  public_access: "None"
  metadata:
    purpose: "application-data"
  depends:
    wait-for:
      runnables:
        - my-app/storage
```

### Production Setup with Geo-Redundancy and Secrets

```yaml
namespace: production

storage:
  defines: azure-storage-account/storage-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "production-rg"
  account_name: "prodstorageha123"
  location: "East US"
  sku:
    name: "Standard_GRS"
  account_kind: "StorageV2"
  access_tier: "Hot"
  https_only: true
  minimum_tls_version: "TLS1_2"
  allow_blob_public_access: false
  primary_key_secret_ref: "storage-primary-key"
  connection_string_secret_ref: "storage-connection-string"
  tags:
    Environment: "Production"
  permitted-secrets:
    storage-primary-key: true
    storage-connection-string: true
```

### Data Lake Storage Gen2

```yaml
namespace: analytics

datalake:
  defines: azure-storage-account/storage-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "analytics-rg"
  account_name: "mydatalakestorage"
  location: "Central US"
  sku:
    name: "Standard_LRS"
  account_kind: "StorageV2"
  enable_hns: true
  https_only: true
  tags:
    Purpose: "DataLake"
```

### Storage with Network Rules

```yaml
namespace: secure

storage:
  defines: azure-storage-account/storage-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "secure-rg"
  account_name: "securestorage123"
  location: "East US"
  sku:
    name: "Standard_ZRS"
  https_only: true
  allow_blob_public_access: false
  network_rule_set:
    default_action: "Deny"
    bypass: "AzureServices"
    ip_rules:
      - value: "203.0.113.0/24"
        action: "Allow"
  tags:
    Security: "Restricted"
```

### Application Using Storage

```yaml
namespace: my-app

storage:
  defines: azure-storage-account/storage-account
  subscription_id: "12345678-1234-1234-1234-123456789012"
  resource_group_name: "my-resource-group"
  account_name: "mystorageaccount123"
  location: "East US"
  sku:
    name: "Standard_LRS"

app:
  defines: runnable
  containers:
    api:
      image: node:18-alpine
      bash: |
        echo "Blob Endpoint: $BLOB_ENDPOINT"
        # Your application logic here
        sleep 3600
  depends:
    wait-for:
      runnables:
        - my-app/storage
  connections:
    storage:
      runnable: my-app/storage
      service: data
  variables:
    BLOB_ENDPOINT:
      type: string
      env: BLOB_ENDPOINT
      value: <- connection-target("storage") entity-state get-member("primary_blob_endpoint")
```

## Authentication

This entity uses Azure credentials that should be configured through one of these methods:

1. **Azure CLI**: Run `az login` to authenticate
2. **Service Principal**: Set environment variables:
   - `AZURE_CLIENT_ID`
   - `AZURE_CLIENT_SECRET`
   - `AZURE_TENANT_ID`
3. **Managed Identity**: When running on Azure resources with managed identity enabled

## Storage Account SKUs

| SKU | Description | Use Case |
|-----|-------------|----------|
| Standard_LRS | Locally redundant storage | Development, non-critical data |
| Standard_GRS | Geo-redundant storage | Production, disaster recovery |
| Standard_RAGRS | Read-access geo-redundant | Production with read access to secondary |
| Standard_ZRS | Zone-redundant storage | High availability within region |
| Premium_LRS | Premium locally redundant | High-performance workloads |
| Premium_ZRS | Premium zone-redundant | High-performance with zone redundancy |
| Standard_GZRS | Geo-zone-redundant | Maximum durability |
| Standard_RAGZRS | Read-access geo-zone-redundant | Maximum durability with read access |

## Access Tiers

| Tier | Description | Use Case |
|------|-------------|----------|
| Hot | Optimized for frequent access | Active data, frequently accessed |
| Cool | Optimized for infrequent access | Backup, short-term archive |
| Premium | Premium performance | High-throughput, low-latency |

## Testing

Run the integration tests:

```bash
sudo INPUT_DIR=./src/azure-storage-account/ ./monkec.sh test --verbose
```

Make sure to configure your Azure credentials before running tests.

## Troubleshooting

### Common Issues

**StorageAccount Entity:**
1. **Account Name Conflicts**: Storage account names must be globally unique (3-24 chars, lowercase alphanumeric only)
2. **Authentication Errors**: Ensure Azure credentials are properly configured
3. **Resource Group Not Found**: Verify the resource group exists in the specified subscription
4. **SKU Restrictions**: Some SKUs are not available in all regions

**BlobContainer Entity:**
1. **Container Name Invalid**: Container names must be 3-63 chars, lowercase, alphanumeric and hyphens
2. **Storage Account Not Found**: Verify the storage account exists and is accessible
3. **Public Access Denied**: Check if the storage account allows public blob access

### Debugging

Enable detailed monitoring:

```bash
# Check entity status
monk describe my-app/storage
monk describe my-app/container

# View logs
monk logs -f my-app/storage

# Test connectivity
monk shell my-app/storage
```

## API References

- [Azure Storage Management API](https://learn.microsoft.com/en-us/rest/api/storagerp/)
- [Azure Blob Storage API](https://learn.microsoft.com/en-us/rest/api/storageservices/blob-service-rest-api)
- [Storage Account Overview](https://learn.microsoft.com/en-us/azure/storage/common/storage-account-overview)

## Contributing

This entity follows the MonkEC conventions for Azure resources. When contributing:

1. Use snake_case for definition properties
2. Use kebab-case for entity names and actions
3. Include comprehensive JSDoc documentation
4. Add integration tests for new functionality
5. Update examples and documentation

## License

This project is part of the MonkEC ecosystem. See the main project license for details.
