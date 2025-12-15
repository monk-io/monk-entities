# GCP Firestore Client Example

This example demonstrates a complete Firestore setup with:

1. **API Enablement** - Enables Firestore and IAM APIs
2. **Firestore Database** - Creates a database in Native mode
3. **Service Account** - Creates SA with Firestore access role
4. **Service Account Key** - Generates key stored in secrets
5. **Client Application** - Node.js app performing CRUD operations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     gcp-firestore-demo                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │ enable-apis  │  Enables:                                     │
│  │ (service-    │  - firestore.googleapis.com                   │
│  │  usage)      │  - iam.googleapis.com                         │
│  └──────┬───────┘                                               │
│         │                                                       │
│    ┌────┴────┐                                                  │
│    │         │                                                  │
│    ▼         ▼                                                  │
│  ┌─────────────┐  ┌──────────────┐                              │
│  │ firestore-db│  │ firestore-sa │  roles/datastore.user        │
│  │ (firestore) │  │ (service-    │                              │
│  │             │  │  account)    │                              │
│  │  nam5 (US)  │  └──────┬───────┘                              │
│  │  Native     │         │                                      │
│  └──────┬──────┘         │                                      │
│         │                ▼                                      │
│         │         ┌──────────────┐                              │
│         │         │ firestore-key│  Key → firestore-sa-key      │
│         │         │ (service-    │  (Monk secret)               │
│         │         │  account-key)│                              │
│         │         └──────┬───────┘                              │
│         │                │                                      │
│         └────────┬───────┘                                      │
│                  │                                              │
│                  ▼                                              │
│  ┌──────────────────────┐                                       │
│  │   firestore-client   │  Node.js application                  │
│  │     (runnable)       │  - Uses SA key from secret            │
│  │                      │  - Creates demo-users collection      │
│  │                      │  - CRUD operations                    │
│  └──────────────────────┘                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Entity Composition

### Database to Client Connection

```yaml
# Database provides database_id in state
firestore-db:
  defines: gcp/firestore
  services:
    database:
      protocol: custom

# Service account key stores credentials in secret
firestore-key:
  defines: gcp/service-account-key
  secret: firestore-sa-key
  permitted-secrets:
    firestore-sa-key: true

# Client reads secret and database state via connections
firestore-client:
  permitted-secrets:
    firestore-sa-key: true
  variables:
    database_id:
      value: <- connection-target("database") entity-state get-member("database_id")
    sa_key:
      value: <- secret("firestore-sa-key")
```

## Prerequisites

1. **GCP Provider** - Configure GCP provider in Monk:
   ```bash
   monk cloud add gcp
   ```

2. **Permissions** - Service account needs:
   - `roles/datastore.owner` (to create database)
   - `roles/iam.serviceAccountAdmin` (to create SA)
   - `roles/serviceusage.serviceUsageAdmin` (to enable APIs)

3. **No Existing Database** - Default database must not exist, or use custom `database_id`

## Usage

### Load and Run

```bash
# Load the stack
monk load examples/gcp-firestore-client/stack.yaml

# Run the entire stack
monk run gcp-firestore-demo/firestore-app

# Or run individual components
monk run gcp-firestore-demo/enable-apis
monk run gcp-firestore-demo/firestore-db
monk run gcp-firestore-demo/firestore-sa
monk run gcp-firestore-demo/firestore-key
monk run gcp-firestore-demo/firestore-client
```

### Monitor Progress

```bash
# Check status of all components
monk describe gcp-firestore-demo/firestore-app

# View database state
monk describe gcp-firestore-demo/firestore-db

# View client logs
monk logs gcp-firestore-demo/firestore-client
```

### Cleanup

```bash
# Delete entire stack (will delete GCP resources)
monk delete gcp-firestore-demo/firestore-app
```

## Firestore Features

### Database Types

```yaml
# Native mode (recommended for new projects)
firestore-native:
  defines: gcp/firestore
  type: FIRESTORE_NATIVE
  location: nam5

# Datastore mode (for Datastore compatibility)
firestore-datastore:
  defines: gcp/firestore
  type: DATASTORE_MODE
  location: us-central1
```

### Locations

**Multi-region (highest availability):**
- `nam5` - United States
- `eur3` - Europe

**Regional (lower latency, lower cost):**
- `us-central1`, `us-east1`, `europe-west1`, etc.

### Point-in-Time Recovery

```yaml
firestore-db:
  defines: gcp/firestore
  point_in_time_recovery: ENABLED  # Enables 7-day recovery
```

### Delete Protection

```yaml
firestore-db:
  defines: gcp/firestore
  delete_protection: DELETE_PROTECTION_ENABLED
```

### Custom Database ID

```yaml
# Non-default database (requires Firestore pricing plan)
custom-db:
  defines: gcp/firestore
  database_id: my-custom-db
  location: us-central1
```

## Client Application Details

The example client performs these operations:

```javascript
// CREATE - Add documents to collection
const docRef = await usersCollection.add({
  name: 'Alice',
  email: 'alice@example.com',
  age: 30
});

// READ - Get all documents
const snapshot = await usersCollection.get();

// QUERY - Filter and order
const results = await usersCollection
  .where('age', '>=', 30)
  .orderBy('age')
  .get();

// UPDATE - Modify document
await docRef.update({ age: 31 });

// DELETE - Remove documents
await batch.delete(docRef);
```

## Important Notes

### Default Database Limitation

- Only one `(default)` database per project
- If default exists, use custom `database_id`
- Custom databases require Blaze (pay-as-you-go) plan

### Service Account Key Security

The example stores SA key in Monk secrets. In production:
- Rotate keys periodically
- Use Workload Identity where possible
- Limit key permissions to minimum required

### Costs

Firestore pricing:
- Document reads: $0.06 per 100,000
- Document writes: $0.18 per 100,000
- Storage: $0.18 per GB/month
- Free tier: 50K reads, 20K writes, 1GB storage per day

## Troubleshooting

### Database Creation Fails

1. **Database exists**: Use custom `database_id` or delete existing:
   ```bash
   gcloud firestore databases delete --database="(default)"
   ```

2. **Location not available**: Choose different location

3. **API not enabled**: Ensure firestore.googleapis.com is enabled

### Client Can't Connect

1. Verify service account key was created:
   ```bash
   monk secret get firestore-sa-key
   ```

2. Check service account has correct role:
   ```bash
   monk describe gcp-firestore-demo/firestore-sa
   ```

3. Verify database is ready:
   ```bash
   monk describe gcp-firestore-demo/firestore-db
   ```

### Permission Denied

Ensure service account has `roles/datastore.user` role:
```yaml
firestore-sa:
  defines: gcp/service-account
  roles:
    - roles/datastore.user      # Read/write
    # Or for full access:
    # - roles/datastore.owner
```
