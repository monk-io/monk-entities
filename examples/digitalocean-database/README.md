# DigitalOcean Database Example

This example demonstrates how to wire a client application to a DigitalOcean managed PostgreSQL database using Monk entity state composition.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                        my-infra                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────┐                                  │
│  │  my-postgres-db    │  DigitalOcean Managed PostgreSQL │
│  │  (digitalocean-    │  - PostgreSQL 16                 │
│  │   database/        │  - Single node (db-s-1vcpu-1gb)  │
│  │   database)        │  - Region: nyc1                  │
│  └─────────┬──────────┘                                  │
│            │                                             │
│            │  connection-target("database")               │
│            │  entity-state get-member("connection_*")     │
│            │                                             │
│            ▼                                             │
│  ┌────────────────────┐                                  │
│  │      my-app        │  Client application              │
│  │    (runnable)      │  - Reads host, port, user,       │
│  │                    │    password, database from state  │
│  └────────────────────┘                                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Entity Composition

The client reads connection details directly from the database entity state:

```yaml
my-app:
  variables:
    db-host:
      value: <- connection-target("database") entity-state get-member("connection_host")
    db-port:
      value: <- connection-target("database") entity-state get-member("connection_port")
    db-user:
      value: <- connection-target("database") entity-state get-member("connection_user")
    db-password:
      value: <- connection-target("database") entity-state get-member("connection_password")
    db-name:
      value: <- connection-target("database") entity-state get-member("connection_database")
  connections:
    database:
      runnable: my-infra/my-postgres-db
      service: data
```

### Available State Fields

| Field | Description |
|-------|-------------|
| `connection_host` | Database hostname |
| `connection_port` | Database port |
| `connection_user` | Database user |
| `connection_password` | Database password |
| `connection_database` | Default database name |
| `connection_uri` | Full connection URI |
| `connection_ssl` | Whether SSL is enabled |

## Prerequisites

1. **DigitalOcean Provider** — configure once, all DO entities use it automatically:
   ```bash
   monk c provider digitalocean --token="dop_v1_your-token"
   ```

2. **Load entity package**:
   ```bash
   monk load dist/digitalocean-database/MANIFEST
   ```

## Usage

### Load and Run

```bash
# Load the example stack
monk load examples/digitalocean-database/MANIFEST

# Run
monk update my-infra/my-postgres-db
```

### Monitor

```bash
# Check status
monk describe my-infra/my-postgres-db

# Get database connection info
monk do my-infra/my-postgres-db/getConnectionInfo
```

### Cleanup

```bash
monk delete --force my-infra/my-postgres-db
```

## Costs

This example creates a real DigitalOcean managed database cluster:
- `db-s-1vcpu-1gb` — ~$15/month

Delete the stack when done to avoid charges.

## Troubleshooting

### Provider Not Configured

```
no provider creds for digitalocean
```

Fix: `monk c provider digitalocean --token="dop_v1_your-token"`

### Client Can't Connect

1. Verify the database is online:
   ```bash
   monk describe my-infra/my-postgres-db
   ```
2. Check connection details:
   ```bash
   monk do my-infra/my-postgres-db/getConnectionInfo
   ```
