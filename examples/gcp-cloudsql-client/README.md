# GCP Cloud SQL Client Example

This example demonstrates a complete GCP Cloud SQL setup with:

1. **API Enablement** - Enables Cloud SQL and IAM APIs
2. **Cloud SQL Instance** - PostgreSQL 15 instance
3. **Database** - Application database within the instance
4. **Database User** - User with auto-generated password stored in secrets
5. **Client Application** - Container that connects and performs CRUD operations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     gcp-cloudsql-demo                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │ enable-apis  │  Enables sqladmin.googleapis.com              │
│  │ (service-    │  and iam.googleapis.com                       │
│  │  usage)      │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────┐                                           │
│  │ postgres-instance│  Cloud SQL PostgreSQL 15                  │
│  │ (cloud-sql-      │  - db-f1-micro tier                       │
│  │  instance)       │  - Public IP (demo only)                  │
│  └────────┬─────────┘  - Backups enabled                        │
│           │                                                     │
│     ┌─────┴─────┐                                               │
│     │           │                                               │
│     ▼           ▼                                               │
│  ┌─────────┐ ┌─────────┐                                        │
│  │app-     │ │app-user │  User: appuser                         │
│  │database │ │(cloud-  │  Password: auto-generated              │
│  │(cloud-  │ │sql-user)│  → stored in "demo-db-password"        │
│  │sql-     │ └────┬────┘                                        │
│  │database)│      │                                             │
│  └────┬────┘      │                                             │
│       │           │                                             │
│       └─────┬─────┘                                             │
│             │                                                   │
│             ▼                                                   │
│  ┌──────────────────┐                                           │
│  │    db-client     │  Node.js application                      │
│  │   (runnable)     │  - Connects via state.address:port        │
│  │                  │  - Uses secret for password               │
│  │                  │  - Performs CRUD operations               │
│  └──────────────────┘                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Entity Composition

### Connection Flow

```yaml
# Instance provides: state.address, state.port, state.connection_name
postgres-instance:
  defines: gcp/cloud-sql-instance
  services:
    instance:
      address: <- entity-state get-member("address")
      port: <- entity-state get-member("port")

# Database gets instance name from connection
app-database:
  defines: gcp/cloud-sql-database
  instance: <- connection-target("instance") entity get-member("name")
  connections:
    instance:
      runnable: gcp-cloudsql-demo/postgres-instance

# User gets instance name, writes password to secret
app-user:
  defines: gcp/cloud-sql-user
  instance: <- connection-target("instance") entity get-member("name")
  password_secret: demo-db-password
  permitted-secrets:
    demo-db-password: true  # REQUIRED!

# Client composes connection string from all entities
db-client:
  variables:
    db_host:
      value: <- connection-target("db-instance") entity-state get-member("address")
    db_password:
      value: <- secret("demo-db-password")
```

## Prerequisites

1. **GCP Provider** - Configure GCP provider in Monk:
   ```bash
   monk cloud add gcp
   ```

2. **Permissions** - Service account needs:
   - `roles/cloudsql.admin`
   - `roles/serviceusage.serviceUsageAdmin`

3. **Billing** - Project must have billing enabled

## Usage

### Load and Run

```bash
# Load the stack
monk load examples/gcp-cloudsql-client/stack.yaml

# Run the entire stack
monk run gcp-cloudsql-demo/cloudsql-app

# Or run individual components
monk run gcp-cloudsql-demo/enable-apis
monk run gcp-cloudsql-demo/postgres-instance
monk run gcp-cloudsql-demo/app-database
monk run gcp-cloudsql-demo/app-user
monk run gcp-cloudsql-demo/db-client
```

### Monitor Progress

```bash
# Check status of all components
monk describe gcp-cloudsql-demo/cloudsql-app

# View client logs
monk logs gcp-cloudsql-demo/db-client

# Check instance state
monk describe gcp-cloudsql-demo/postgres-instance
```

### Cleanup

```bash
# Delete entire stack (will delete GCP resources)
monk delete gcp-cloudsql-demo/cloudsql-app
```

## Important Notes

### Secrets

The `app-user` entity **writes** a password to the `demo-db-password` secret. This requires:

```yaml
permitted-secrets:
  demo-db-password: true
```

Without this, the entity will fail with a permission error.

### Costs

This example creates real GCP resources that incur costs:
- Cloud SQL instance: ~$10-15/month for db-f1-micro
- Storage: $0.17/GB/month

### Security

This demo uses `allow_all: true` for public access. In production:
- Use private IP with VPC
- Use Cloud SQL Proxy for secure connections
- Restrict IP ranges in authorized networks

### Timeouts

Cloud SQL instance creation can take 5-10 minutes. The stack uses appropriate timeouts:
- API enablement: 300s
- Instance creation: 900s (15 minutes)

## Troubleshooting

### Instance Creation Fails

1. Check API is enabled:
   ```bash
   monk describe gcp-cloudsql-demo/enable-apis
   ```

2. Verify permissions in GCP Console

3. Check instance name isn't already taken (must be unique globally)

### Client Can't Connect

1. Verify instance has public IP:
   ```bash
   monk describe gcp-cloudsql-demo/postgres-instance
   ```

2. Check authorized networks include 0.0.0.0/0 (for demo)

3. Verify password secret exists:
   ```bash
   monk secret get demo-db-password
   ```

### Database Operations Fail

1. Check user was created:
   ```bash
   monk describe gcp-cloudsql-demo/app-user
   ```

2. Verify database exists:
   ```bash
   monk describe gcp-cloudsql-demo/app-database
   ```
