# gcp-fullstack-demo

A six-tier example application demonstrating how the major GCP entities
compose into a single deployable stack. Built as a reference for AI agents
and humans authoring real GCP integrations on Monk.

## What's in the box

| Component | Entity / Runnable | Source |
|---|---|---|
| Frontend (HTML+JS UI) | `runnable` (nginx:alpine) | inline in `stack.yaml` |
| Backend (REST API) | `gcp/cloud-run-service` | `backend/` (deployed via `blob_name`) |
| Database | `gcp/cloud-sql-instance` + `cloud-sql-database` + `cloud-sql-user` | Postgres 15 |
| Object store | `gcp/cloud-storage` | bucket |
| Serverless function | `gcp/cloud-function` | `function/` (deployed via `blob_name`) |
| Runtime identity | `gcp/service-account` | shared by Cloud Run + Function |
| API enablement | `gcp/service-usage` | enables 8 GCP APIs |

The backend and function ship as **source blobs** (no Docker registry
required) — Cloud Build packages them into managed containers on GCP.

## Architecture

```
   Browser
     │
     ▼
  ┌────────────────────────────┐
  │  nginx (monk runnable)     │  port 8080 on the node
  │  serves index.html with    │
  │  ${BACKEND_URL} injected   │
  └─────────────┬──────────────┘
                │ XHR (CORS-enabled)
                ▼
  ┌────────────────────────────┐
  │  Cloud Run service         │  Express, Node 20
  │   /api/items   (Postgres)  │
  │   /api/files   (GCS)       │
  │   /api/echo    (Function)  │
  └──┬────────┬──────────┬─────┘
     │        │          │
     ▼        ▼          ▼
  Postgres   GCS      Cloud Function
 (Cloud SQL) bucket   (Node 20 HTTP)
```

The Cloud Run service authenticates to Cloud SQL via password (env-injected
from a Monk secret) and to Cloud Storage / the function via the runtime
service account's Application Default Credentials.

## What this demonstrates for the agent

| Pattern | Where in `stack.yaml` |
|---|---|
| Source-deploy (no Docker registry) | `backend.blob_name: backend`, `echo-function.blob_name: function` |
| Cross-entity wiring of runtime URLs | `frontend.variables.backend_url ← cloud-run-service.state.url` |
| Cross-entity wiring of DB host | `backend.env_vars.DB_HOST ← cloud-sql-instance.state.address` |
| Cross-entity wiring of bucket name | `backend.env_vars.BUCKET_NAME ← cloud-storage.state.name` |
| Secret-backed env var | `backend.env_vars.DB_PASSWORD ← <- secret("…")` + `permitted-secrets` |
| Shared runtime identity | Cloud Run + Cloud Function both reference `app-sa.state.email` |
| Auto-generated DB password | `cloud-sql-user.password_secret` writes a random password to a Monk secret |
| `cloud-sql-database` connecting to its instance | `instance: <- connection-target("instance") entity get-member("name")` |
| Inline HTML + envsubst shim | `frontend.files.template` + `/docker-entrypoint.d/40-render.sh` |
| Multi-stage `depends.wait-for` chain | every entity declares the upstream entities it needs ready |

## Prerequisites

- A monk daemon with the GCP provider configured:
  ```bash
  sudo monk cluster provider add -p gcp
  ```
- IAM roles on the GCP project (see `src/gcp/INTEGRATION.mdx` for the full
  least-privilege table). Quick start: `roles/owner`. Least-privilege:
  - `roles/serviceusage.serviceUsageAdmin`
  - `roles/iam.serviceAccountAdmin`, `roles/iam.serviceAccountUser`
  - `roles/cloudsql.admin`, `roles/cloudsql.client`
  - `roles/run.admin`
  - `roles/cloudfunctions.admin`
  - `roles/storage.admin`
  - `roles/cloudbuild.builds.editor` (Cloud Build runs the source builds)
  - `roles/artifactregistry.admin` (Cloud Build pushes built images here)
- A monk node tagged for cloud deployment (the frontend runnable runs there).

## Deploy

```bash
# 1. Compile entities (first run only)
INPUT_DIR=./src/gcp/ OUTPUT_DIR=./dist/gcp/ ./monkec.sh compile

# 2. Load entity package + example
sudo monk load dist/gcp/MANIFEST
sudo monk load examples/gcp-fullstack-demo/MANIFEST

# 3. Run the stack against a cloud node
sudo monk run -t TAG gcp-fullstack-demo/stack

# Watch progress (Cloud SQL alone takes ~10 min)
sudo monk ps
```

Expected timing on a clean project:
- service-usage: ~1 min
- service-account, cloud-storage: <1 min each
- cloud-sql-instance: 8–15 min (longest)
- cloud-sql-database, cloud-sql-user: ~30 s each
- cloud-function: 3–5 min (Cloud Build)
- cloud-run-service: 2–3 min (Cloud Build)
- frontend (nginx): seconds

## Verify

Once `sudo monk ps` shows all entities `true true`:

```bash
# Get the backend URL
sudo monk describe local/gcp-fullstack-demo/backend | grep -A1 '"url"'

# Health check via the backend URL (from your machine)
curl https://<backend-url>/api/health
# {"ok":true,"db":"connected","bucket":"monk-fullstack-demo-uploads-1",...}

# Open the frontend in a browser:
#   http://<your-node-ip>:8080
# You should see three cards (Postgres / Object store / Function) — each
# button hits the backend, which talks to the corresponding GCP service.
```

CLI smoke test:
```bash
# Insert and read a row through the chain Postgres ← backend
curl -X POST -H 'content-type: application/json' \
  -d '{"name":"hello"}' https://<backend-url>/api/items
curl https://<backend-url>/api/items

# Write and list a file through the chain GCS ← backend
curl -X POST https://<backend-url>/api/files/note.txt
curl https://<backend-url>/api/files

# Backend → function → backend roundtrip
curl 'https://<backend-url>/api/echo?text=monk'
# {"function_url":"https://...","request_text":"monk","function_response":"{\"received\":\"monk\",\"upper\":\"MONK\",...}"}
```

## Customize

| Want to… | Edit |
|---|---|
| Change the bucket name | `uploads-bucket.name` (must be globally unique) |
| Change the SQL instance name | `postgres.name` (Cloud SQL blocks reuse for ~1 week after delete) |
| Use a different region | `*.location` and `postgres.region` |
| Use VPC private IP for Cloud SQL | remove `allow_all: true` and add a Serverless VPC connector to `backend` (not currently exposed by `cloud-run-service` — would need an entity extension) |
| Replace the Express API | edit `backend/index.js` and reload the MANIFEST |

## Cleanup

```bash
sudo monk delete --force local/gcp-fullstack-demo/stack
```

Cloud SQL instance deletion takes ~1–2 min. The bucket must be empty before
delete — if you uploaded files via `/api/files/:name`, list them and delete
manually first or use the bucket's `force` flag (see `gcp/cloud-storage`
docs).

## Pre-built image (workaround for source-deploy buildpack issue)

Cloud Run source deploy via `blob_name:` uses Google Cloud Buildpacks. When
the YAML sets `command: ["node", "index.js"]` (required to satisfy the v2 API
"entrypoint must be configured" check), the buildpack-installed
`node_modules` aren't on the resolver path the explicit command runs under,
so the container fails to start with `Cannot find module 'express'`.

**Workaround**: build the backend image yourself, push to Artifact Registry,
and reference it by `image:`.

```bash
# 1. Authenticate Docker to Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# 2. Build the backend image (the Dockerfile in backend/ does npm install)
cd examples/gcp-fullstack-demo
cat > backend/Dockerfile <<'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "index.js"]
EOF
docker build -t us-central1-docker.pkg.dev/<PROJECT>/<REPO>/fullstack-demo-backend:v1 backend/
docker push us-central1-docker.pkg.dev/<PROJECT>/<REPO>/fullstack-demo-backend:v1
```

Then in `stack.yaml`, replace:
```yaml
backend:
  defines: gcp/cloud-run-service
  blob_name: backend
  command: ["node", "index.js"]
```
with:
```yaml
backend:
  defines: gcp/cloud-run-service
  image: us-central1-docker.pkg.dev/<PROJECT>/<REPO>/fullstack-demo-backend:v1
  # No `command:` needed when image has its own CMD
```

`gcp/artifact-registry-repository` can provision the registry; this example
doesn't include it to keep the entity count manageable. The Cloud Function
tier has the same source-deploy mechanism but a shorter dependency surface
(only `@google-cloud/functions-framework`) and works fine via `blob_name`.

## Known limitations

- `allow_all: true` on Cloud SQL exposes 5432 to the public internet for demo
  simplicity. Production deployments should use Cloud SQL Auth Proxy (sidecar
  pattern) or VPC private IP.
- The frontend runs as a monk runnable, so it's reachable on the cloud node's
  IP at port 8080. There's no TLS in front of it. Wrap it with
  `gcp/cloud-cdn-backend-bucket` + Cloud Armor for a real edge.
- Backend connects to Postgres without TLS verification
  (`rejectUnauthorized: false`). Cloud SQL serves a self-signed cert by
  default; use a server CA cert to verify in production.
- Cloud Run source deploy buildpack does not honor Dockerfiles in the source
  archive — it always builds with buildpacks. See "Pre-built image" above
  for the workaround when `npm install` fails to surface deps.
- The runtime service account does **not** include `roles/run.admin` (only
  `roles/run.invoker`), so the entity's `allow_unauthenticated: true` toggle
  emits a 403 warning during deploy. Add `roles/run.admin` to `app-sa.roles`
  if you need the entity to flip public access automatically; otherwise run
  `monk do <ns>/backend/allow-unauthenticated` after granting the perm
  out-of-band.
