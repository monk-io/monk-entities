# gcp-cloudrun-job

Provisions a [Cloud Run Job](https://cloud.google.com/run/docs/create-jobs) — a
container that runs to completion (batch processing) rather than serving HTTP
traffic. The example uses Google's public sample job image, so no Docker build
or registry push is required.

## What this demonstrates

| Concept | How |
|---|---|
| Cloud Run Job vs Service | `defines: gcp/cloud-run-job` runs a container to completion; `cloud-run-service` serves long-running HTTP |
| Parallel task fan-out | `task_count: 4` + `parallelism: 2` runs 4 tasks, 2 at a time |
| Per-task resource limits | `cpu: "1"`, `memory: 512Mi`, `timeout_seconds: 300` |
| Retries | `max_retries: 3` — failed tasks are re-attempted |
| Custom service account | `service_account: <- connection-target("sa") entity-state get-member("email")` — least-privilege identity per job |
| API enablement | `gcp/service-usage` enables `run.googleapis.com` and `iam.googleapis.com` before the job is created |
| Wiring across entities | `service-account.email` flows into the job's `service_account` field at runtime |

## Architecture

```
gcp/service-usage  ──►  enables run.googleapis.com, iam.googleapis.com
                              │
                              ▼
gcp/service-account  ──►  cloudrun-job-runner@<project>.iam.gserviceaccount.com
   (roles: logging.logWriter, monitoring.metricWriter)
                              │
                              ▼
gcp/cloud-run-job   ──►  Container: us-docker.pkg.dev/cloudrun/container/job:latest
   (4 tasks × parallelism 2)   ↳ runs as cloudrun-job-runner
```

Cloud Run Jobs are **not** invoked automatically on create — you must call the
`execute` action to run them (or attach Cloud Scheduler / Cloud Tasks /
Eventarc to trigger executions on a schedule or event).

## Prerequisites

- Monk daemon running with GCP provider configured:
  ```bash
  sudo monk cluster provider add -p gcp
  ```
- IAM permissions on the GCP project (see
  [`src/gcp/INTEGRATION.mdx`](../../src/gcp/INTEGRATION.mdx) — quick-start is
  `roles/owner`; least-privilege is):
  - `roles/run.admin`
  - `roles/iam.serviceAccountAdmin`
  - `roles/serviceusage.serviceUsageAdmin`
  - `roles/iam.serviceAccountUser` (to let the job run as `cloudrun-job-runner`)

## Deploy

```bash
# 1. Compile entities (if not already)
INPUT_DIR=./src/gcp/ OUTPUT_DIR=./dist/gcp/ ./monkec.sh compile

# 2. Load entities + example
sudo monk load dist/gcp/MANIFEST
sudo monk load examples/gcp-cloudrun-job/gcp-cloudrun-job.yaml

# 3. Deploy to a cloud node (replace TAG with your node tag, or -l for local)
sudo monk run -t TAG gcp-cloudrun-job/stack
```

Wait for all three entities to reach `true true` in `sudo monk ps`.

## Run the job

The job is **created but not executed** by `monk run`. Trigger an execution:

```bash
# Run with the default config (4 tasks, parallelism 2)
sudo monk do gcp-cloudrun-job/batch-job/execute

# Override task count and per-task env vars for a single execution
sudo monk do gcp-cloudrun-job/batch-job/execute \
  task_count=10 \
  env='{"SLEEP_MS":"2000","FAIL_RATE":"0.2"}'

# List recent executions and their status
sudo monk do gcp-cloudrun-job/batch-job/get-executions

# Inspect job configuration
sudo monk do gcp-cloudrun-job/batch-job/get-info

# See cost based on Cloud Monitoring metrics from the last 30 days
sudo monk do gcp-cloudrun-job/batch-job/get-cost-estimate
```

You can also tail task logs in the GCP console under **Cloud Run → Jobs →
monk-demo-batch → Executions**.

## Customize

To use your own workload, replace the `image:` field in
`gcp-cloudrun-job.yaml`:

```yaml
batch-job:
  defines: gcp/cloud-run-job
  image: us-central1-docker.pkg.dev/MY-PROJECT/MY-REPO/MY-IMAGE:v1
  command: ["python"]                # optional: override container entrypoint
  container_args: ["process.py"]     # optional: override CMD
  env_vars:
    BATCH_SIZE: "1000"
    OUTPUT_BUCKET: my-bucket
```

The image must be in a registry the GCP project can pull from — typically
[Artifact Registry](https://cloud.google.com/artifact-registry) (use
`gcp/artifact-registry-repository` to provision one) or `gcr.io/<project>/`.

For least-privilege roles needed by **your** workload (BigQuery? Pub/Sub? GCS?),
update the `roles:` list under `job-sa`.

## Cleanup

```bash
sudo monk delete --force gcp-cloudrun-job/stack
```

This deletes the job, the service account, and the API enablement record. It
does **not** disable the APIs themselves (other resources in the project may
depend on them).
