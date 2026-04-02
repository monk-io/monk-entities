# Cloud Run API with Cloud SQL

REST API deployed on Google Cloud Run, backed by a Cloud SQL PostgreSQL database. Demonstrates how to wire Cloud Run and Cloud SQL entities into a deployable stack with automatic credential management.

## Architecture

```
Cloud Run Service (api-service)
    |
    |-- env_vars: DB_HOST, DB_PASSWORD, etc.
    |
Cloud SQL Instance (postgres)
    |-- Database (app-database)
    |-- User (app-user) → password stored in Monk secret
```

**Entity composition chain:**
1. `gcp/service-usage` enables `sqladmin.googleapis.com` + `run.googleapis.com`
2. `gcp/cloud-sql-instance` provisions PostgreSQL with public IP
3. `gcp/cloud-sql-database` creates `appdb` database
4. `gcp/cloud-sql-user` creates `apiuser` with auto-generated password (stored in Monk secret)
5. `gcp/cloud-run-service` deploys the API container, wiring DB connection info from entity state

## Prerequisites

- Node.js 18+ and npm
- Docker
- Azure CLI (for container registry push)
- GCP provider configured: `monk cluster provider add -p gcp`
- GCP project with billing enabled

## Quick Start

### 1. Build and Push Docker Image

```bash
cd examples/gcp-cloudrun-api

npm install
npm run build

docker build -t gcr.io/<your-project>/gcp-cloudrun-api:latest .

gcloud auth configure-docker
docker push gcr.io/<your-project>/gcp-cloudrun-api:latest
```

### 2. Deploy with Monk

```bash
# Load entities
monk load dist/gcp/MANIFEST

# Load and deploy
monk load examples/gcp-cloudrun-api/gcp-cloudrun-api.yaml
monk run -t TAG gcp-cloudrun-api/example-stack
```

### 3. Verify

```bash
# Check status
monk ps

# Get the Cloud Run service URL
monk do gcp-cloudrun-api/api-service/get-info

# Test the API (use the URL from get-info output)
curl https://<service-url>/health
curl https://<service-url>/tasks
curl -X POST https://<service-url>/tasks -d '{"title":"Hello from Monk"}' -H 'Content-Type: application/json'
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service info and available endpoints |
| GET | `/health` | Health check (verifies DB connection) |
| GET | `/tasks` | List all tasks |
| POST | `/tasks` | Create a task (`{"title": "..."}`) |
| PATCH | `/tasks/:id` | Toggle task completion |
| DELETE | `/tasks/:id` | Delete a task |

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `DB_HOST` | Cloud SQL instance IP | entity-state `address` |
| `DB_PORT` | PostgreSQL port | static `5432` |
| `DB_NAME` | Database name | static `appdb` |
| `DB_USER` | Database username | static `apiuser` |
| `DB_PASSWORD` | Database password | Monk secret |
| `DB_SSL` | Enable SSL connections | static `true` |
| `PORT` | HTTP server port | Cloud Run default `8080` |

## Local Development

```bash
cp env.example .env
# Edit .env with local PostgreSQL credentials

npm install
npm run dev
```

## Cleanup

```bash
monk delete --force gcp-cloudrun-api/example-stack
```
