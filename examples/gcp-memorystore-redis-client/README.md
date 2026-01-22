# GCP Memorystore for Redis Client Example

This example demonstrates a complete GCP Memorystore for Redis setup with a client application:

1. **API Enablement** - Enables Redis and Compute APIs
2. **Memorystore Instance** - Redis 7.0 with RDB persistence
3. **Client Application** - Container demonstrating Redis operations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      gcp-redis-demo                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │ enable-apis  │  Enables redis.googleapis.com                 │
│  │ (service-    │  and compute.googleapis.com                   │
│  │  usage)      │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              redis-cache                               │     │
│  │          (memorystore-redis)                           │     │
│  │                                                        │     │
│  │  Instance: monk-demo-redis                             │     │
│  │  Tier: BASIC (single node)                             │     │
│  │  Memory: 1GB                                           │     │
│  │  Version: Redis 7.0                                    │     │
│  │  Persistence: RDB snapshots every 12 hours             │     │
│  │                                                        │     │
│  │  State exports:                                        │     │
│  │    - host: 10.x.x.x (private IP)                       │     │
│  │    - port: 6379                                        │     │
│  └────────────────────┬───────────────────────────────────┘     │
│                       │                                         │
│                       ▼                                         │
│  ┌────────────────────────────────────────────────────────┐     │
│  │             redis-client                               │     │
│  │             (runnable)                                 │     │
│  │                                                        │     │
│  │  - Connects via host:port from state                   │     │
│  │  - Demonstrates all Redis data types                   │     │
│  │  - Strings, Hashes, Lists, Sets, Sorted Sets           │     │
│  │  - Pub/Sub messaging                                   │     │
│  │  - Continuous monitoring loop                          │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Entity Composition

### Connecting to Redis Instance

```yaml
# Redis instance exposes state: host, port, status, etc.
redis-cache:
  defines: gcp/memorystore-redis
  name: monk-demo-redis
  tier: BASIC
  memory_size_gb: 1

# Client connects to entity and reads state
redis-client:
  connections:
    redis:
      runnable: gcp-redis-demo/redis-cache
      service: data
  variables:
    redis_host:
      value: <- connection-target("redis") entity-state get-member("host")
    redis_port:
      value: <- connection-target("redis") entity-state get-member("port")
```

### State Fields

The `memorystore-redis` entity exposes:
- `state.id` - Full resource name
- `state.host` - Private IP address for connections
- `state.port` - Redis port (default 6379)
- `state.status` - Instance state (READY, CREATING, etc.)
- `state.read_endpoint` - Read replica endpoint (if replicas enabled)
- `state.persistence_iam_identity` - Service account for export/import

## Prerequisites

1. **GCP Provider** - Configure GCP provider in Monk:
   ```bash
   monk cloud add gcp
   ```

2. **Permissions** - Service account needs:
   - `roles/redis.admin`
   - `roles/serviceusage.serviceUsageAdmin`

3. **Network Access** - Memorystore instances are VPC-only:
   - Client must run in the same VPC
   - Or have VPC peering/VPN configured
   - Default VPC works for testing

## Usage

### Load and Run

```bash
# Load the stack
monk load examples/gcp-memorystore-redis-client/stack.yaml

# Run the entire stack
monk run gcp-redis-demo/redis-app
```

**Note:** Redis instance creation takes 10-15 minutes. Be patient!

### Monitor Progress

```bash
# Check status of all components
monk describe gcp-redis-demo/redis-app

# Check Redis instance status
monk describe gcp-redis-demo/redis-cache

# View client logs (watch Redis operations)
monk logs gcp-redis-demo/redis-client -f
```

### Using Backup Actions

The `memorystore-redis` entity supports export/import operations:

```bash
# Get backup configuration and guidance
monk do gcp-redis-demo/redis-cache get-backup-info

# Export snapshot to Cloud Storage
monk do gcp-redis-demo/redis-cache create-snapshot \
  output_uri="gs://your-bucket/backups/redis-backup.rdb"

# List export/import operations
monk do gcp-redis-demo/redis-cache list-snapshots

# Restore from snapshot (OVERWRITES existing data!)
monk do gcp-redis-demo/redis-cache restore \
  source_uri="gs://your-bucket/backups/redis-backup.rdb"

# Check operation status
monk do gcp-redis-demo/redis-cache get-restore-status \
  operation_name="projects/.../operations/..."
```

### Cleanup

```bash
# Delete entire stack
monk delete gcp-redis-demo/redis-app
```

## Configuration Options

### Tier Selection

| Tier | Features | Use Case |
|------|----------|----------|
| `BASIC` | Single node, no HA | Development, testing, non-critical caching |
| `STANDARD_HA` | Replica with automatic failover | Production, mission-critical applications |

### Memory Sizing

| Memory | Typical Use |
|--------|-------------|
| 1 GB | Development, small caches |
| 4-16 GB | Medium applications |
| 32+ GB | Large-scale caching, session stores |

### Persistence Options

```yaml
persistence_config:
  persistence_mode: RDB  # or DISABLED
  rdb_snapshot_period: TWELVE_HOURS  # ONE_HOUR, SIX_HOURS, TWENTY_FOUR_HOURS
```

### Redis Configuration

Common `redis_configs` options:
```yaml
redis_configs:
  maxmemory-policy: volatile-lru  # Eviction policy
  notify-keyspace-events: Ex      # Enable keyspace notifications
  activedefrag: "yes"             # Active defragmentation
```

## Important Notes

### Network Requirements

⚠️ **Memorystore instances are only accessible from within the VPC.**

The client application must run in an environment that can reach the instance:
- GCE VM in the same VPC
- GKE cluster in the same VPC
- Cloud Run with VPC connector
- App Engine with VPC access

### Authentication

By default, this example has `auth_enabled: false` for simplicity.

For production:
```yaml
redis-cache:
  auth_enabled: true
  transit_encryption_mode: SERVER_AUTHENTICATION
```

When AUTH is enabled, you must retrieve the auth string:
```bash
gcloud redis instances get-auth-string monk-demo-redis --region=us-central1
```

### High Availability

For production workloads, use STANDARD_HA tier:
```yaml
redis-cache:
  tier: STANDARD_HA
  # Optional: read replicas for read-heavy workloads
  read_replicas_mode: READ_REPLICAS_ENABLED
  replica_count: 2
```

### Export/Import for Backups

Memorystore doesn't have traditional backups. Use export/import instead:

1. **Grant Storage Access**: The instance's service account needs write access to the GCS bucket
2. **Export**: Creates an RDB file in Cloud Storage
3. **Import**: Restores from an RDB file (OVERWRITES all data)

```bash
# Get the service account that needs bucket access
monk describe gcp-redis-demo/redis-cache | grep persistence_iam_identity

# Grant access to bucket
gsutil iam ch serviceAccount:SERVICE_ACCOUNT:objectAdmin gs://your-bucket
```

## Troubleshooting

### Instance Creation Fails

1. **API not enabled**: Check enable-apis status:
   ```bash
   monk describe gcp-redis-demo/enable-apis
   ```

2. **Quota exceeded**: Check Memorystore quotas in GCP Console

3. **Region not supported**: Verify region supports Memorystore

### Client Can't Connect

1. **Network isolation**: Memorystore is VPC-only. Client must be in same VPC.

2. **Firewall rules**: Ensure port 6379 is allowed in VPC firewall.

3. **Instance not ready**: Check instance status:
   ```bash
   monk describe gcp-redis-demo/redis-cache
   ```

4. **Wrong host**: Verify host is populated in state:
   ```bash
   monk describe gcp-redis-demo/redis-cache | grep host
   ```

### Slow Performance

1. **Check memory**: Instance may need more RAM
   ```bash
   redis-cli -h HOST INFO memory
   ```

2. **Check connections**: Too many clients
   ```bash
   redis-cli -h HOST INFO clients
   ```

3. **Check latency**: Network issues
   ```bash
   redis-cli -h HOST --latency
   ```

## Redis Operations Demonstrated

The client demonstrates:

| Operation | Redis Command | Use Case |
|-----------|---------------|----------|
| String GET/SET | `SET`, `GET`, `SETEX` | Simple key-value, caching |
| Counters | `INCR`, `DECR` | Page views, rate limiting |
| Hashes | `HSET`, `HGET`, `HGETALL` | User profiles, objects |
| Lists | `RPUSH`, `LPOP`, `LRANGE` | Task queues, feeds |
| Sets | `SADD`, `SMEMBERS`, `SINTER` | Tags, unique items |
| Sorted Sets | `ZADD`, `ZRANGE`, `ZRANK` | Leaderboards, rankings |
| Pub/Sub | `PUBLISH`, `SUBSCRIBE` | Real-time messaging |

## Further Reading

- [Memorystore for Redis Documentation](https://cloud.google.com/memorystore/docs/redis)
- [Redis Configuration Parameters](https://cloud.google.com/memorystore/docs/redis/supported-redis-configurations)
- [Memorystore Networking](https://cloud.google.com/memorystore/docs/redis/networking)
- [Export and Import](https://cloud.google.com/memorystore/docs/redis/import-export-overview)
