# Redis Cloud TypeScript Entities

This directory contains the TypeScript implementation of Redis Cloud entities for the MonkeC platform. These entities provide programmatic access to Redis Cloud resources through the Redis Cloud API v1.

## Overview

The Redis Cloud entities provide programmatic access to Redis Cloud resources through the Redis Cloud API. The implementation follows the MonkeC entity pattern with clear separation between immutable configuration (Definition) and mutable runtime state (State).

## Entities

### Subscription Entity

The `Subscription` entity manages Redis Cloud subscriptions, which are the containers for Redis databases.

**Key Features:**
- Support for both Essentials and Pro subscription types
- Automatic plan selection based on requirements
- Payment method configuration
- Multi-cloud provider support (AWS, GCP, Azure)

**Definition Properties:**
- `secret_ref` - Secret reference containing Redis Cloud API credentials
- `subscription_type` - Type of subscription ("essentials" or "pro")
- `name` - Subscription name
- `provider` - Cloud provider ("AWS", "GCP", or "AZURE")
- `region` - Cloud provider region
- `redis_flex` - Whether Redis Flex is enabled
- `size` - Subscription size in GB
- `availability` - Availability configuration
- Support flags for various features (persistence, backups, replication, etc.)
- Payment method configuration

### Database Entity

The `Database` entity manages individual Redis databases within subscriptions.

**Key Features:**
- Comprehensive configuration options for Redis databases
- Support for both Redis and Memcached protocols
- Automatic password generation
- High availability and clustering support
- Backup and persistence configuration
- Module and alert configuration

**Definition Properties:**
- `secret_ref` - Secret reference containing Redis Cloud API credentials
- `subscription_id` - ID of the subscription to create database in
- `name` - Database name
- `protocol` - Database protocol ("redis" or "memcached")
- `memory_limit_in_mb` - Memory limit in MB
- `high_availability` - Enable high availability
- `data_persistence` - Enable data persistence
- Security configuration (SSL certificates, IP restrictions)
- Alert configuration for monitoring

## Usage Example

```yaml
namespace: redis-cloud

subscription:
  type: redis-cloud/subscription
  with:
    secret_ref: "redis-cloud-auth"
    subscription_type: essentials
    name: "my-redis-subscription"
    provider: AWS
    region: "us-west-2" 
    redis_flex: true
    size: 1
    availability: "Single-zone"
    support_data_persistence: true
    support_instant_and_daily_backups: false
    support_replication: false
    support_clustering: false
    support_ssl: true
    payment_method: "credit-card"

database:
  type: redis-cloud/database
  with:
    secret_ref: "redis-cloud-auth"
    name: "my-redis-db"
    subscription_id: "<- get-from=subscription get=id"
    protocol: redis
    memory_limit_in_mb: 256
    high_availability: false
    data_persistence: true
    enable_alerts: true
    alerts:
      memory_usage_threshold: 80
      throughput_threshold: 1000
```

## Authentication

Both entities require Redis Cloud API credentials stored as secrets. The credentials consist of:

1. **Access Key** - Your Redis Cloud access key
2. **Secret Key** - Your Redis Cloud secret key

These should be stored as separate secrets with the naming pattern `{secret_ref}_access_key` and `{secret_ref}_secret_key`:

```bash
monk secrets add -g redis-cloud-auth_access_key="your-access-key"
monk secrets add -g redis-cloud-auth_secret_key="your-secret-key"
```

## Architecture

The implementation follows the MongoDB Atlas and Neon entity patterns:

### Files Structure
- `common.ts` - Shared constants, types, and helper functions
- `base.ts` - Base class with common Redis Cloud functionality  
- `subscription.ts` - Subscription entity implementation
- `database.ts` - Database entity implementation
- `example.yaml` - Usage example
- `MANIFEST` - MonkeC load manifest

### Base Class Pattern
All entities extend `RedisCloudEntity` which provides:
- Authentication and HTTP client setup
- Common API request handling
- Task waiting functionality
- Error handling and resource management

### Schema Generation
The entities use TypeScript interfaces that are automatically converted to YAML schemas by the MonkeC compiler, providing:
- Type-safe configuration
- Automatic validation
- IDE support with IntelliSense

## API Compatibility

The entities are compatible with Redis Cloud API v1 and support both Essentials and Pro subscription types. The implementation handles:

- Basic authentication with access/secret key pairs
- Task-based async operations with proper polling
- Error handling and retry logic
- Resource existence checking and state management

## Migration from YAML/JS Entities

The TypeScript entities replace the original YAML/JavaScript versions with several improvements:

### Key Changes
1. **Unified Authentication**: Single `secret_ref` instead of separate account/user key secrets
2. **Type Safety**: Compile-time type checking for all configuration options
3. **Better Structure**: Clear base class hierarchy following established patterns
4. **Enhanced Validation**: Comprehensive field validation with JSDoc annotations

### Migration Steps
1. Update secret storage to use the new naming pattern (`{secret_ref}_access_key`, `{secret_ref}_secret_key`)
2. Replace `account_key_secret` and `user_key_secret` with single `secret_ref` field
3. Update field names to match new schema (e.g., `dataset_size_in_gb` → `memory_limit_in_mb`)
4. Use the new entity type references (`redis-cloud/subscription`, `redis-cloud/database`)

## Development

The entities follow MonkeC best practices:
- Extend the common `RedisCloudEntity` base class
- Implement required lifecycle methods (`create`, `update`, `delete`, `checkReadiness`)
- Use proper TypeScript types with comprehensive JSDoc annotations
- Follow established patterns from other entity implementations (MongoDB Atlas, Neon) 