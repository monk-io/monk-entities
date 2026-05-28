# gcp-cloudrun-multi-service

A production-ready Cloud Run demo showing how multiple Cloud Run **services** and a Cloud Run **job** compose into a single deployable stack — wired together through Monk entity state.

## What this demonstrates

| Capability | Where |
|---|---|
| **Service-to-service URL wiring** | `frontend.env_vars.API_URL ← api.state.url` via `entity-state get-member("url")` |
| **Different scaling profiles** | `api` (1 CPU, conc 80) vs `frontend` (1 CPU, conc 80) — documented side-by-side in YAML |
| **Scale-to-zero** | Both services: `min_instances: 0` (cost-efficient for bursty traffic) |
| **Cloud Run Job** | `batch-export-job` — reads tasks from Postgres, writes CSV to GCS, exits cleanly |
| **Pre-built Docker images** | All three runtimes use Artifact Registry images; `api/`, `frontend/`, `job/` each have a `Dockerfile` |
| **Shared service account** | `app-sa` with least-privilege roles; all three runtimes use it |
| **Auto-generated DB password** | `password_secret: cloudrun-multi-db-password` → stored in Monk secret |
| **Cloud SQL + GCS wiring** | `DB_HOST ← postgres.state.address`, `BUCKET_NAME ← exports-bucket.state.name` |

## Architecture

```
   Browser
     │
     ▼
┌─────────────────────────────────────────────┐
│  Frontend (Cloud Run service)               │  *.run.app
│  Node.js · 1 CPU · 256Mi · scale-to-zero   │
│  serves SPA — API_URL embedded at deploy    │
└──────────────────┬──────────────────────────┘
                   │ browser XHR
                   ▼
┌─────────────────────────────────────────────┐
│  API (Cloud Run service)                    │  *.run.app
│  Express · 1 CPU · 512Mi · scale-to-zero   │
│  /api/tasks  CRUD                           │
│  /api/health                                │
│  /api/exports  list + quick CSV export      │
└──┬──────────────────────────────────────────┘
   │                        │
   ▼                        ▼
Cloud SQL Postgres     Cloud Storage
  (taskdb)              (exports bucket)
   ▲                        ▲
   │                        │
┌──┴────────────────────────┴────────────────┐
│  Batch Export Job (Cloud Run Job)          │
│  node:20-alpine · 1 CPU · 512Mi · on-demand│
│  reads all tasks → writes CSV to GCS       │
└────────────────────────────────────────────┘
```

**Key wiring**: The frontend Cloud Run service receives `API_URL` from the API service's `state.url` — a URL that doesn't exist until the API is provisioned. MonkEC resolves this at deploy time via `connection-target("api") entity-state get-member("url")`.

## Prerequisites

- A monk daemon with GCP provider configured:
  ```bash
  sudo monk cluster provider add -p gcp
  ```
- GCP IAM roles (least-privilege set; `roles/owner` works for dev):
  - `roles/serviceusage.serviceUsageAdmin`
  - `roles/iam.serviceAccountAdmin`, `roles/iam.serviceAccountUser`
  - `roles/cloudsql.admin`
  - `roles/run.admin`
  - `roles/storage.admin`
  - `roles/cloudbuild.builds.editor`
  - `roles/artifactregistry.admin`
- Docker + access to `monkimages.azurecr.io` (for the job image)

## Step 1 — Build and push all images

All three services (API, frontend, job) require Docker images in Artifact Registry. Cloud Run only accepts images from `gcr.io`, `docker.pkg.dev`, or `docker.io`.

```bash
PROJECT_ID=your-gcp-project-id
REGION=us-central1
AR_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy"

# Create Artifact Registry repo if it doesn't exist
gcloud artifacts repositories create cloud-run-source-deploy \
  --repository-format=docker --location=${REGION} --project=${PROJECT_ID} 2>/dev/null || true

# Authenticate Docker to Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

cd examples/gcp-cloudrun-multi-service

# Build and push all three images
docker build -t ${AR_REPO}/gcp-cloudrun-multi-service-api:latest api/
docker push ${AR_REPO}/gcp-cloudrun-multi-service-api:latest

docker build -t ${AR_REPO}/gcp-cloudrun-multi-service-frontend:latest frontend/
docker push ${AR_REPO}/gcp-cloudrun-multi-service-frontend:latest

docker build -t ${AR_REPO}/gcp-cloudrun-multi-service-job:latest job/
docker push ${AR_REPO}/gcp-cloudrun-multi-service-job:latest
```

Then update the three `image:` fields in `gcp-cloudrun-multi-service.yaml` to use your project ID instead of `monk-tests`.

## Step 2 — Deploy

```bash
# 1. Compile entity package (first run or after entity changes)
INPUT_DIR=./src/gcp/ OUTPUT_DIR=./dist/gcp/ ./monkec.sh compile

# 2. Load entity package + example
sudo monk load dist/gcp/MANIFEST
sudo monk load examples/gcp-cloudrun-multi-service/MANIFEST

# 3. Deploy to a cloud node (replace TAG with your node's tag)
sudo monk run -t TAG gcp-cloudrun-multi-service/stack

# Watch progress
sudo monk ps
```

**Expected timing (clean project):**
- `enable-apis` — ~1 min
- `app-sa`, `exports-bucket` — < 1 min each
- `postgres` (Cloud SQL) — **8–15 min** (longest step)
- `task-database`, `task-db-user` — ~30 s each
- `api`, `frontend` (Cloud Run pre-built image deploy) — ~1–2 min each
- `batch-export-job` — < 1 min (just registers the job definition)

## Step 3 — Verify

### Check all entities are ready
```bash
sudo monk ps
# All should show: true true
```

### Get the frontend URL
```bash
sudo monk describe local/gcp-cloudrun-multi-service/frontend | grep -A1 '"url"'
# Open https://<frontend-url> in your browser
```

### Health check
```bash
# Get API URL
sudo monk describe local/gcp-cloudrun-multi-service/api | grep -A1 '"url"'

# Check DB connectivity
curl https://<api-url>/api/health
# {"ok":true,"db":"connected","bucket":"monk-cloudrun-multi-exports-1"}
```

### Smoke test the API
```bash
API_URL=https://<api-url>

# Create tasks
curl -X POST -H 'Content-Type: application/json' \
  -d '{"title":"Deploy Cloud Run demo"}' $API_URL/api/tasks

curl -X POST -H 'Content-Type: application/json' \
  -d '{"title":"Test batch export job"}' $API_URL/api/tasks

# List tasks
curl $API_URL/api/tasks

# Quick export via API (writes CSV to GCS directly from the API service)
curl -X POST $API_URL/api/exports
# {"file":"exports/tasks-2024-01-15T...csv","rows":2}

# List exports in GCS
curl $API_URL/api/exports
```

### Run the batch export job
```bash
# Trigger the Cloud Run Job (reads DB → writes CSV to GCS)
sudo monk do gcp-cloudrun-multi-service/batch-export-job/execute

# Monitor recent executions
sudo monk do gcp-cloudrun-multi-service/batch-export-job/get-executions

# Check cost estimate
sudo monk do gcp-cloudrun-multi-service/batch-export-job/get-cost-estimate
```

### Service info
```bash
# Get API service details (URL, revision, scaling)
sudo monk do gcp-cloudrun-multi-service/api/get-info

# List frontend revisions
sudo monk do gcp-cloudrun-multi-service/frontend/get-revisions
```

## Key wiring patterns

### 1. Service-to-service URL wiring
```yaml
frontend:
  defines: gcp/cloud-run-service
  env_vars:
    API_URL: <- connection-target("api") entity-state get-member("url")
  connections:
    api:
      runnable: gcp-cloudrun-multi-service/api
      service: api
```
The frontend Cloud Run service receives the API's HTTPS endpoint (`*.run.app`) from entity state — resolved at deploy time, never hardcoded.

### 2. Scaling profiles side-by-side
```yaml
# API — I/O-bound, can handle many concurrent requests
api:
  cpu: "1"
  memory: 512Mi
  min_instances: 0    # scale to zero between requests
  max_instances: 5    # cap spend during spikes
  concurrency: 80     # Cloud Run default — good for async I/O

# Frontend — lightweight HTML server, less CPU needed
frontend:
  cpu: "0.5"
  memory: 256Mi
  min_instances: 0
  max_instances: 3
  concurrency: 100    # higher — serving static content is cheaper per request
```

### 3. Cloud Run Job vs Service
```yaml
# Service: long-running HTTP server
api:
  defines: gcp/cloud-run-service
  port: 8080
  min_instances: 0
  max_instances: 5

# Job: runs to completion, no HTTP port, on-demand
batch-export-job:
  defines: gcp/cloud-run-job
  # No port, no min/max_instances — different paradigm
  task_count: 1
  max_retries: 1
  timeout_seconds: 300
```

### 4. Shared service account
```yaml
app-sa:
  defines: gcp/service-account
  roles:
    - roles/cloudsql.client      # DB access
    - roles/storage.objectAdmin  # GCS access
    - roles/run.invoker          # call other Cloud Run services
    - roles/logging.logWriter    # structured logs

# Both services and the job reference it:
api:
  service_account: <- connection-target("sa") entity-state get-member("email")
```

## Docker images

All three services use pre-built Docker images in Artifact Registry. Cloud Run only accepts images from `gcr.io`, `docker.pkg.dev`, or `docker.io`. Each directory (`api/`, `frontend/`, `job/`) has a `Dockerfile`.

The YAML `image:` fields reference `monk-tests` as the GCP project — replace with your own project ID before deploying to a different project. See [Step 1](#step-1--build-and-push-all-images) for full push instructions.

## Customize

| Want to… | Edit |
|---|---|
| Use a different region | `*.location` and `postgres.region` |
| Change instance/bucket names | `postgres.name`, `exports-bucket.name` (bucket names globally unique) |
| Always-warm API (no cold starts) | `api.min_instances: 1` |
| Higher concurrency limit | `api.concurrency: 1000` + `api.cpu: "4"` |
| Run multiple export tasks in parallel | `batch-export-job.task_count: N`, `batch-export-job.parallelism: M` |
| Restrict API to internal traffic only | `api.ingress: INGRESS_TRAFFIC_INTERNAL_AND_CLOUD_LOAD_BALANCING` + remove `allow_unauthenticated` |

## Cleanup

```bash
sudo monk delete --force local/gcp-cloudrun-multi-service/stack
```

Cloud SQL deletion takes ~1–2 min and the instance name cannot be reused for ~1 week. If exports exist in the bucket, delete them first or the bucket deletion will fail.
