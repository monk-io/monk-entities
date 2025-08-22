# DigitalOcean Domains Entity for Monk

A comprehensive TypeScript entity for managing DigitalOcean domains in the Monk orchestrator.

## Features

- **Complete Domain Lifecycle Management**: Create, update, delete, and manage DigitalOcean domains
- **Automatic Connection to Existing Domains**: If a domain already exists, the entity connects to it instead of throwing an error
- **Provider-based Authentication**: Uses DigitalOcean provider for secure API authentication
- **Custom Actions**: Built-in actions for domain and DNS record management
- **Error Handling**: Robust error handling with detailed error messages
- **Readiness Checks**: Built-in health checks to monitor domain status

## Installation

1. Ensure you have the Monk CLI and Monkec compiler installed
2. Load the entity manifest:
   ```bash
   monk load ./dist/digitalocean-domains/MANIFEST
   ```

## Quick Start

### Basic Domain Definition

```yaml
namespace: my-app
my-domain:
  defines: digitalocean-domains/domain
  name: example.com
  ttl: 3600
```

### Domain with Initial A Record

```yaml
namespace: my-app
my-domain-with-ip:
  defines: digitalocean-domains/domain
  name: example.com
  ip_address: 192.168.1.100
  ttl: 1800
```

### Usage in Stack

```bash
# Deploy the domain
monk run my-app/my-domain

# Use custom actions
monk do my-app/my-domain/info
monk do my-app/my-domain/records
monk do my-app/my-domain/add-a-record --name=www --ip=192.168.1.100
monk do my-app/my-domain/add-cname-record --name=blog --target=example.com
monk do my-app/my-domain/list-all-domains

# Clean up
monk purge my-app/my-domain
```

## Configuration

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Domain name (e.g., example.com) |

### Optional Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `ip_address` | string | IP address for the domain's A record | - |
| `ttl` | number | TTL for DNS records in seconds | 1800 |

## State

The entity maintains the following state:

| Property | Type | Description |
|----------|------|-------------|
| `existing` | boolean | Whether the domain exists |
| `name` | string | Domain name |
| `ttl` | number | Domain TTL |
| `zone_file` | string | Zone file content |

## Custom Actions

The entity provides several custom actions for domain management:

### info
Display comprehensive domain information including TTL and zone file.

```bash
monk do my-app/my-domain/info
```

**Output includes:**
- Domain name
- TTL (Time To Live)
- Complete zone file content

### records
List all DNS records for the domain.

```bash
monk do my-app/my-domain/records
```

**Output includes:**
- Record type (A, CNAME, NS, SOA, etc.)
- Record name
- Record data/target
- TTL for each record

### add-a-record
Add an A record to the domain.

```bash
monk do my-app/my-domain/add-a-record --name=www --ip=192.168.1.100 --ttl=3600
```

**Parameters:**
- `--name` (required): Record name (e.g., www, api, @)
- `--ip` (required): IP address to point to
- `--ttl` (optional): TTL in seconds (default: 1800)

### add-cname-record
Add a CNAME record to the domain.

```bash
monk do my-app/my-domain/add-cname-record --name=blog --target=example.com --ttl=3600
```

**Parameters:**
- `--name` (required): Record name (e.g., blog, www)
- `--target` (required): Target domain or hostname
- `--ttl` (optional): TTL in seconds (default: 1800)

### list-all-domains
List all domains in your DigitalOcean account.

```bash
monk do my-app/my-domain/list-all-domains
```

**Output includes:**
- All domain names in the account
- TTL for each domain

## Authentication

Requires DigitalOcean provider to be configured with API token. The provider handles authentication automatically.

To configure the provider:
1. Go to DigitalOcean Control Panel → API → Tokens/Keys
2. Generate New Token with read/write permissions
3. Configure the provider in your Monk setup

## Error Handling

The entity includes comprehensive error handling:

- **Existing Domain Detection**: Automatically connects to existing domains instead of failing
- **API Error Handling**: Proper handling of DigitalOcean API errors
- **Validation**: Input validation for domain names and parameters
- **Graceful Degradation**: Continues operation even if some API calls fail

## Lifecycle Methods

- **create()**: Creates domain or connects to existing one
- **update()**: Updates domain configuration (limited by DigitalOcean API)
- **delete()**: Removes domain from DigitalOcean account
- **checkReadiness()**: Verifies domain exists and is accessible

## API Reference

This entity uses the DigitalOcean API v2:
- **List Domains**: `GET /v2/domains`
- **Create Domain**: `POST /v2/domains`
- **Get Domain**: `GET /v2/domains/{domain_name}`
- **Delete Domain**: `DELETE /v2/domains/{domain_name}`
- **List DNS Records**: `GET /v2/domains/{domain_name}/records`
- **Create DNS Record**: `POST /v2/domains/{domain_name}/records`

## Build and Development

```bash
# Build the module
./build.sh digitalocean-domains

# Load into Monk
monk load dist/digitalocean-domains/MANIFEST

# Run tests (if available)
cd src/digitalocean-domains/test
monk run stack-integration.test.yaml
```

## Example Configurations

### Simple Domain
```yaml
namespace: my-app
simple-domain:
  defines: digitalocean-domains/domain
  name: example.com
```

### Domain with A Record
```yaml
namespace: my-app
domain-with-ip:
  defines: digitalocean-domains/domain
  name: example.com
  ip_address: 192.168.1.100
  ttl: 3600
```

### Multiple Domains Stack
```yaml
namespace: my-app

main-domain:
  defines: digitalocean-domains/domain
  name: example.com
  ip_address: 192.168.1.100

api-domain:
  defines: digitalocean-domains/domain
  name: api.example.com
  ip_address: 192.168.1.101
```

## Troubleshooting

### Common Issues

1. **"Domain already exists" error**: This is handled automatically - the entity will connect to existing domains
2. **Authentication errors**: Ensure DigitalOcean provider is properly configured
3. **DNS propagation**: Changes may take time to propagate globally
4. **Rate limiting**: DigitalOcean API has rate limits - the entity includes appropriate error handling

### Debug Mode

Enable debug output by checking Monk logs:
```bash
monk logs -f my-app/my-domain
```

## Notes

- Domain updates are limited by DigitalOcean API capabilities
- The entity automatically detects and connects to existing domains
- TTL and zone file information is retrieved and stored in state
- DNS record management is done through custom actions
- All actions include proper error handling and user feedback