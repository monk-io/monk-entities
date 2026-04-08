# GCP Cloud Tasks Demo

Provisions a Cloud Tasks queue with rate limiting and retry policies, then runs a TypeScript client that creates HTTP tasks and monitors the queue.

## Architecture

```
                          Cloud Tasks Queue
                     (rate limited, retry policy)
                              |
  TypeScript Client --------->|-------> httpbin.org/post
  (creates tasks,             |         (receives task dispatches)
   monitors queue)            |
```

**How it works:**
1. MonkEC provisions a Cloud Tasks queue with 10 dispatches/sec rate limit and 3 retry attempts
2. A service account with `cloudtasks.enqueuer` role is created for authentication
3. The client app creates HTTP POST tasks targeting httpbin.org
4. Cloud Tasks dispatches each task with rate limiting and automatic retries on failure

## Prerequisites

- Node.js 18+ and npm
- Docker
- Azure CLI (for container registry authentication)
- GCP credentials configured: `monk cluster provider add -p gcp`

## Quick Start

### 1. Build and Push Docker Image

```bash
cd examples/gcp-cloud-tasks

npm install
npm run build

docker build -t monkimages.azurecr.io/gcp-cloud-tasks:latest .

az login
az acr login --name monkimages
docker push monkimages.azurecr.io/gcp-cloud-tasks:latest
```

### 2. Deploy with Monk

```bash
# Load the GCP entity package
monk load dist/gcp/MANIFEST

# Load and deploy
monk load examples/gcp-cloud-tasks/gcp-cloud-tasks.yaml
monk run -t TAG gcp-cloud-tasks/demo-stack

# Monitor
monk ps
monk logs -f gcp-cloud-tasks/tasks-client
```

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `QUEUE_NAME` | Full queue resource name | entity-state `queue_name` |
| `GCP_PROJECT` | GCP project ID | YAML config |
| `QUEUE_LOCATION` | Queue region | YAML config |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | SA credentials JSON | secret `cloud-tasks-sa-key` |
| `TARGET_URL` | HTTP target for tasks | YAML config |
| `OPERATION_INTERVAL_MS` | Delay between operations | YAML config |
| `MAX_OPERATIONS` | Stop after N operations (0=unlimited) | YAML config |

## Key Wiring Patterns

### Queue name from entity state
```yaml
queue_name:
  env: QUEUE_NAME
  value: <- connection-target("queue") entity-state get-member("queue_name")
```
The client receives the full queue resource name (e.g., `projects/my-project/locations/us-central1/queues/demo-task-queue`) at deploy time.

### Service account key from secret
```yaml
sa_credentials:
  env: GOOGLE_APPLICATION_CREDENTIALS_JSON
  value: <- secret("cloud-tasks-sa-key")
```
The SA key entity generates a key and stores it as a Monk secret. The client container reads it as an environment variable.

## Queue Management

```bash
# View queue status
monk do gcp-cloud-tasks/task-queue/get-info

# Pause task dispatch
monk do gcp-cloud-tasks/task-queue/pause

# Resume dispatch
monk do gcp-cloud-tasks/task-queue/resume

# Purge all tasks
monk do gcp-cloud-tasks/task-queue/purge-tasks

# Create a task manually
monk do gcp-cloud-tasks/task-queue/create-task url="https://httpbin.org/post" method="POST" body='{"hello":"world"}'

# Cost estimate
monk do gcp-cloud-tasks/task-queue/get-cost-estimate
```

## Local Development

```bash
cp env.example .env
# Edit .env with your GCP project and queue details
npm run dev
```

## Cleanup

```bash
monk delete --force gcp-cloud-tasks/demo-stack
```
