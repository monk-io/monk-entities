# Redis Cloud TypeScript Entities

This directory contains the TypeScript implementation of Redis Cloud entities for the MonkeC platform. These entities provide programmatic access to Redis Cloud resources through the Redis Cloud API v1.

## Overview

The Redis Cloud entities provide programmatic access to Redis Cloud resources through the Redis Cloud API. The implementation follows the MonkeC entity pattern with clear separation between immutable configuration (Definition) and mutable runtime state (State).

**Key Features**:
- Type-safe Redis Cloud API integration
- Separate entities for Essentials and Pro subscription tiers
- Automatic task waiting for async operations
- Comprehensive error handling and logging
- Support for all Redis Cloud features

## Entities

### Subscription Entity

The `Subscription` entity manages Redis Cloud subscriptions, which are containers for Redis databases.

**Features:**
- Support for both Essentials and Pro subscription types
- Automatic plan selection based on requirements
- Payment method configuration (credit card or marketplace)
- Multi-cloud provider support (AWS, GCP, Azure)
- Flexible sizing and availability options

### Database Entities

Redis Cloud databases have different capabilities based on subscription type, so we provide separate entities:

#### EssentialsDatabase Entity

API-compliant database entity for **Essentials subscriptions** matching the Redis Cloud API schema.

**Key Features:**
- Protocol support: Redis, Memcached, or Stack (advanced Redis capabilities)
- Flexible memory configuration: `dataset_size_in_gb` or `memory_limit_in_gb`
- Pay-as-you-go features: OSS Cluster API, database clustering, sharding
- Data persistence options: AOF (every 1 sec/write) or snapshots (hourly, 6h, 12h)
- Advanced security: TLS/SSL with client certificates, IP restrictions
- Backup support: Periodic backup to custom storage paths
- Replication and clustering support
- Redis modules and version selection
- Comprehensive alerting system

**Use Cases:**
- Development and testing environments
- Pay-as-you-go Redis deployments
- Small to medium production applications
- Advanced Redis features (when using 'stack' protocol)

#### ProDatabase Entity

Full-featured database entity for **Pro subscriptions** with advanced Redis capabilities.

**Key Features:**
- Memory limits up to 50GB+
- High availability and replication
- Multi-zone deployment
- Redis clustering and sharding
- Redis modules (RedisJSON, RediSearch, RedisTimeSeries, RedisBloom, RedisGraph)
- Advanced backup configurations
- Client SSL certificates
- Comprehensive alerting (memory, throughput, connections, latency)

**Use Cases:**
- Production applications
- High-availability requirements
- Advanced Redis features (search, JSON, time series)
- Large-scale deployments
- Enterprise applications

## Configuration

### Authentication

All entities use a unified authentication approach through a secret reference:

```yaml
secret_ref: "redis-cloud-auth"
```

The secret should contain:
```json
{
  "access_key": "your_redis_cloud_access_key",
  "secret_key": "your_redis_cloud_secret_key"
}
```

### Basic Usage

#### Essentials Setup
```yaml
# Create Essentials subscription
essentials-subscription:
  type: redis-cloud/subscription
  with:
    secret_ref: "redis-cloud-auth"
    subscription_type: essentials
    name: "my-essentials-subscription"
    provider: AWS
    region: "us-west-2"

# Create Essentials database
essentials-db:
  type: redis-cloud/essentials-database
  with:
    secret_ref: "redis-cloud-auth"
    name: "my-essentials-db"
    subscription_id: "<- get-from=essentials-subscription get=id"
    protocol: redis
    memory_limit_in_mb: 256
    data_persistence: true
    enable_tls: true
```

#### Pro Setup
```yaml
# Create Pro subscription
pro-subscription:
  type: redis-cloud/subscription
  with:
    secret_ref: "redis-cloud-auth"
    subscription_type: pro
    name: "my-pro-subscription"
    provider: AWS
    region: "us-west-2"

# Create Pro database with advanced features
pro-db:
  type: redis-cloud/pro-database
  with:
    secret_ref: "redis-cloud-auth"
    name: "my-pro-db"
    subscription_id: "<- get-from=pro-subscription get=id"
    protocol: redis
    memory_limit_in_mb: 2048
    high_availability: true
    clustering: true
    shard_count: 3
    modules:
      - RedisJSON
      - RediSearch
    backup_config:
      interval_hours: 12
      retention_count: 3
```

## Entity Comparison

| Feature | Essentials | Pro |
|---------|------------|-----|
| **Memory Limit** | Up to 30GB | Up to 50GB+ |
| **High Availability** | ❌ | ✅ |
| **Clustering** | ❌ | ✅ |
| **Redis Modules** | ❌ | ✅ |
| **Multi-zone** | ❌ | ✅ |
| **Advanced Backups** | ❌ | ✅ |
| **SSL Certificates** | ❌ | ✅ |
| **TLS Support** | ✅ | ✅ |
| **Basic Alerts** | ✅ | ✅ |
| **Advanced Alerts** | ❌ | ✅ |

## API Documentation

### Subscription Entity

```typescript
interface SubscriptionDefinition {
  secret_ref: string;
  subscription_type: "essentials" | "pro";
  name: string;
  provider: "AWS" | "GCP" | "AZURE";
  region: string;
  // ... additional configuration
}
```

### EssentialsDatabase Entity

```typescript
interface EssentialsDatabaseDefinition {
  secret_ref: string;
  name: string; // Max 40 chars, letters/digits/hyphens only
  subscription_id: string;
  protocol?: "redis" | "memcached" | "stack"; // Default: "stack"
  
  // Memory configuration (choose one)
  dataset_size_in_gb?: number; // Recommended for Pay-as-you-go
  memory_limit_in_gb?: number; // Deprecated
  
  // Redis configuration
  redis_version?: string;
  resp_version?: "resp2" | "resp3";
  
  // Pay-as-you-go features
  support_oss_cluster_api?: boolean;
  enable_database_clustering?: boolean;
  number_of_shards?: number;
  regex_rules?: string[]; // For clustering
  
  // Data management
  data_persistence?: "none" | "aof-every-1-second" | "aof-every-write" | 
                    "snapshot-every-1-hour" | "snapshot-every-6-hours" | "snapshot-every-12-hours";
  data_eviction_policy?: "allkeys-lru" | "allkeys-lfu" | "allkeys-random" | 
                        "volatile-lru" | "volatile-lfu" | "volatile-random" | "volatile-ttl" | "noeviction";
  replication?: boolean;
  periodic_backup_path?: string;
  
  // Security
  enable_tls?: boolean;
  client_tls_certificates?: Array<{name?: string; certificate: string}>;
  source_ips?: string[]; // CIDR blocks
  
  // Advanced features
  replica?: {uris?: string[]; encryptionInTransit?: boolean};
  modules?: Array<{name: string; parameters?: Record<string, any>}>;
  alerts?: Array<{name: string; value: number}>;
  
  // Authentication
  password?: string; // Or auto-generated 32-char password
  password_secret?: string; // Alternative to password
}
```

### ProDatabase Entity

```typescript
interface ProDatabaseDefinition {
  secret_ref: string;
  name: string;
  subscription_id: string;
  protocol: "redis" | "memcached";
  memory_limit_in_mb: number; // max 51200
  high_availability?: boolean;
  clustering?: boolean;
  shard_count?: number;
  modules?: Array<"RedisJSON" | "RediSearch" | "RedisTimeSeries" | "RedisBloom" | "RedisGraph">;
  backup_config?: {
    interval_hours?: number;
    storage_path?: string;
    retention_count?: number;
  };
  alerts?: {
    memory_usage_threshold?: number;
    throughput_threshold?: number;
    connection_limit_threshold?: number;
    latency_threshold?: number;
  };
}
```

## Error Handling

All entities include comprehensive error handling:
- API authentication failures
- Resource creation/update failures
- Network connectivity issues
- Task timeout handling
- Resource not found scenarios

## Supported Redis Cloud Features

### Essentials Tier
- ✅ Basic Redis database creation
- ✅ Memory management and eviction policies
- ✅ Data persistence (AOF)
- ✅ TLS encryption
- ✅ IP source restrictions
- ✅ Basic monitoring and alerts

### Pro Tier
- ✅ All Essentials features
- ✅ High availability and replication
- ✅ Redis clustering and sharding
- ✅ Redis modules (JSON, Search, TimeSeries, Bloom, Graph)
- ✅ Multi-zone deployment
- ✅ Advanced backup configurations
- ✅ Client SSL certificates
- ✅ Advanced monitoring and alerts

## Development

### Building
```bash
bash build.sh redis-cloud
```

### File Structure
```
src/redis-cloud/
├── base.ts                    # Base classes and interfaces
├── common.ts                  # Shared utilities and constants
├── subscription.ts            # Subscription entity
├── essentials-database.ts     # Essentials database entity
├── pro-database.ts           # Pro database entity
├── MANIFEST                  # MonkeC load manifest
├── example.yaml              # Usage examples
└── README.md                 # This file
```

The entities are compiled to `dist/redis-cloud/` with generated YAML schemas and JavaScript sync files. 