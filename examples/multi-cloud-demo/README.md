# Multi-Cloud Demo

A task manager application that deploys across AWS, Azure, or DigitalOcean using the same Docker image. Demonstrates how MonkEC entities from multiple providers wire together into a real production stack.

## Architecture

```
POST /tasks → API → DB (create row) → Queue (enqueue)
                                        ↓
                              Worker → Queue (receive)
                                     → DB (update status)
                                     → Storage (upload result)
```

**AWS stack** (primary, verified):
- RDS PostgreSQL (`aws-rds/rds-instance`) — task storage
- SQS (`aws-sqs/sqs-queue`) — task queue
- S3 (`aws-s3/s3-bucket`) — result storage
- `api` runnable (MODE=api) + `worker` runnable (MODE=worker)

**Azure variant** (same image, swap YAML):
- PostgreSQL Flexible Server + Database + Access List
- Service Bus Namespace + Queue
- Storage Account
- Single `app` runnable (MODE=both, required for access-list IP resolution)

**DigitalOcean variant** (same image, swap YAML):
- Managed PostgreSQL (`digitalocean-database/database`)
- Spaces bucket (`digitalocean-spaces/spaces-bucket`)
- `api` runnable (MODE=api) + `worker` runnable (MODE=worker, QUEUE_TYPE=db)
- No native queue — worker uses `SELECT FOR UPDATE SKIP LOCKED` on the DB

## Verified

- TypeScript compiles cleanly
- Docker image builds and pushes: `monkimages.azurecr.io/multi-cloud-demo:latest`
- All three YAML templates load without errors (`monk load`)

## Prerequisites

- MonkEC entity packages loaded:
  ```bash
  # AWS stack
  sudo monk load dist/aws-rds/MANIFEST dist/aws-sqs/MANIFEST dist/aws-s3/MANIFEST

  # Azure stack
  sudo monk load dist/azure-postgresql/MANIFEST dist/azure-servicebus/MANIFEST dist/azure-storage-account/MANIFEST

  # DigitalOcean stack
  sudo monk load dist/digitalocean-database/MANIFEST dist/digitalocean-spaces/MANIFEST
  ```

- Monk cluster connected with cloud provider configured:
  ```bash
  # AWS
  sudo monk cluster provider add --provider AWS --access-key <KEY> --secret-key <SECRET>

  # Azure
  sudo monk cluster provider add --provider Azure --azure-sdk-auth <creds.json>

  # DigitalOcean
  sudo monk cluster provider add --provider Digitalocean --digitalocean-token <TOKEN>
  ```

## Deploy AWS Stack

### 1. Set secrets

```bash
sudo monk secrets add -g aws-access-key-id=<your-access-key>
sudo monk secrets add -g aws-secret-access-key=<your-secret-key>
sudo monk secrets add -g rds-master-password=<your-db-password>
```

### 2. Load and deploy

```bash
sudo monk load examples/multi-cloud-demo/aws-stack.yaml
sudo monk run -l mcd-aws/stack
```

### 3. Monitor

```bash
sudo monk ps
sudo monk logs -f mcd-aws/api
sudo monk logs -f mcd-aws/worker
```

### 4. Test

```bash
# Get the API address
sudo monk ps  # note the port binding

# Create a task
curl -X POST http://localhost:3000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"title":"test","payload":"hello world"}'

# List tasks
curl http://localhost:3000/tasks

# Health check
curl http://localhost:3000/health
```

### 5. Clean up

```bash
sudo monk delete --force mcd-aws/stack
```

## Deploy Azure Variant

```bash
# Edit azure-stack.yaml: replace "your-subscription-id" and "your-resource-group"

sudo monk secrets add -g azure-pg-password=<your-pg-password>

sudo monk load examples/multi-cloud-demo/azure-stack.yaml
sudo monk run -l mcd-azure/stack
```

The `pg-access-list` entity automatically reads the app node's public IP via
`runnable-peers-public-ips("mcd-azure/app")` and adds it as a firewall rule on the PostgreSQL server.

## Deploy DigitalOcean Variant

```bash
# Create Spaces access keys at DigitalOcean → API → Spaces keys
sudo monk secrets add -g do-spaces-access-key=<your-spaces-key>
sudo monk secrets add -g do-spaces-secret-key=<your-spaces-secret>

sudo monk load examples/multi-cloud-demo/do-stack.yaml
sudo monk run -l mcd-do/stack
```

The DigitalOcean stack uses `QUEUE_TYPE=db` — the worker polls the tasks table using
`SELECT ... FOR UPDATE SKIP LOCKED` so no separate message queue is needed.

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `MODE` | `api` \| `worker` \| `both` | Stack YAML |
| `DB_HOST` | PostgreSQL hostname | entity-state |
| `DB_PORT` | PostgreSQL port | entity-state |
| `DB_NAME` | Database name | entity definition |
| `DB_USER` | DB username | entity-state |
| `DB_PASSWORD` | DB password | monk secret |
| `QUEUE_TYPE` | `sqs` \| `servicebus` \| `db` | Stack YAML |
| `SQS_QUEUE_URL` | SQS queue URL | entity-state |
| `SERVICEBUS_CONNECTION_STRING` | Service Bus conn string | monk secret |
| `STORAGE_TYPE` | `s3` \| `azure-blob` \| `spaces` | Stack YAML |
| `STORAGE_BUCKET` | Bucket name | entity definition/state |
| `STORAGE_REGION` | Region | entity definition/state |
| `STORAGE_ENDPOINT` | Custom endpoint (Spaces) | entity-state |
| `STORAGE_ACCESS_KEY` | Storage access key | monk secret |

## Local Development

```bash
cp env.example .env
# Edit .env — set QUEUE_TYPE=db, MODE=both, and local DB credentials
npm install
npm run dev
```

## Build Docker Image

```bash
npm install
npm run build

docker build -t monkimages.azurecr.io/multi-cloud-demo:latest .
az acr login --name monkimages
docker push monkimages.azurecr.io/multi-cloud-demo:latest
```

## Key Wiring Patterns

### 1. Indirect secret reference (Azure password pattern)
```yaml
pg_password_secret:
  value: <- connection-target("pg-server") entity get-member("administrator_password_secret_ref")
  type: string
db_password:
  env: DB_PASSWORD
  value: <- secret($pg_password_secret)
  type: string
```
The entity stores the secret *name* in its definition; you dereference it dynamically.

### 2. Access-list with dynamic IP
```yaml
allowed_cidr_blocks: <- runnable-peers-public-ips("mcd-azure/app")
```
Single runnable required — using two runnables would need two separate access-list entries
(one per `runnable-peers-public-ips()` call).

### 3. DB-based queue (DigitalOcean)
The `DbPollingQueue` implementation uses PostgreSQL advisory locking:
```sql
SELECT * FROM tasks WHERE status = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
```
Safe for concurrent workers without a message queue.

### 4. Provider-agnostic abstractions
```typescript
// queue.ts: createQueue() returns Queue interface
// storage.ts: createStorage() returns Storage interface
// QUEUE_TYPE and STORAGE_TYPE env vars select the implementation
```
