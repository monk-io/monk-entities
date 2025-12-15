# GCP Cloud Functions Gen 2 Example

This example demonstrates deploying and invoking a Cloud Functions Gen 2 function with:

1. **API Enablement** - Enables Cloud Functions, Cloud Build, Cloud Run, Artifact Registry APIs
2. **Service Account** - Creates invoker service account with appropriate roles
3. **Cloud Function** - HTTP-triggered Node.js function
4. **Client** - Container that invokes the function

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   gcp-cloudfunction-demo                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │ enable-apis  │  Enables:                                     │
│  │ (service-    │  - cloudfunctions.googleapis.com              │
│  │  usage)      │  - cloudbuild.googleapis.com                  │
│  └──────┬───────┘  - run.googleapis.com                         │
│         │          - artifactregistry.googleapis.com            │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │ function-sa  │  Service account with:                        │
│  │ (service-    │  - roles/cloudfunctions.invoker               │
│  │  account)    │  - roles/run.invoker                          │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────┐                                           │
│  │  hello-function  │  Cloud Function Gen 2                     │
│  │ (cloud-function) │  - HTTP trigger                           │
│  │                  │  - Node.js 20 runtime                     │
│  │                  │  - 256Mi memory                           │
│  └────────┬─────────┘  - Returns greeting                       │
│           │                                                     │
│           │ state.url                                           │
│           ▼                                                     │
│  ┌──────────────────┐                                           │
│  │ function-client  │  Curl container that:                     │
│  │   (runnable)     │  - GETs function URL                      │
│  │                  │  - POSTs JSON body                        │
│  └──────────────────┘  - Tests the function                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Function Code

Before running, create a blob with the function source code:

**Create `function-code/index.js`:**
```javascript
exports.helloWorld = (req, res) => {
  const name = req.query.name || req.body?.name || 'World';
  res.send(`Hello, ${name}! From Cloud Functions Gen 2`);
};
```

**Create `function-code/package.json`:**
```json
{
  "name": "hello-function",
  "version": "1.0.0",
  "main": "index.js"
}
```

**Upload as blob:**
```bash
monk blob upload hello-function-code ./function-code/
```

## Prerequisites

1. **GCP Provider** - Configure GCP provider in Monk:
   ```bash
   monk cloud add gcp
   ```

2. **Permissions** - Service account needs:
   - `roles/cloudfunctions.admin`
   - `roles/iam.serviceAccountAdmin`
   - `roles/serviceusage.serviceUsageAdmin`
   - `roles/storage.admin` (for uploading function code)

3. **Billing** - Project must have billing enabled

## Usage

### Load and Run

```bash
# Load the stack
monk load examples/gcp-cloudfunction-client/stack.yaml

# Upload function code blob first
monk blob upload hello-function-code ./function-code/

# Run the entire stack
monk run gcp-cloudfunction-demo/function-app

# Or run individual components
monk run gcp-cloudfunction-demo/enable-apis
monk run gcp-cloudfunction-demo/function-sa
monk run gcp-cloudfunction-demo/hello-function
monk run gcp-cloudfunction-demo/function-client
```

### Monitor Progress

```bash
# Check status of all components
monk describe gcp-cloudfunction-demo/function-app

# View function state (includes URL)
monk describe gcp-cloudfunction-demo/hello-function

# View client logs
monk logs gcp-cloudfunction-demo/function-client
```

### Test Function Directly

```bash
# Get function URL from state
FUNCTION_URL=$(monk describe gcp-cloudfunction-demo/hello-function -o json | jq -r '.state.url')

# Invoke the function
curl "$FUNCTION_URL"
curl "$FUNCTION_URL?name=Monk"
curl -X POST "$FUNCTION_URL" -H "Content-Type: application/json" -d '{"name":"Test"}'
```

### Cleanup

```bash
# Delete entire stack (will delete GCP resources)
monk delete gcp-cloudfunction-demo/function-app
```

## Cloud Function Features

### Trigger Types

This example uses HTTP trigger. Cloud Functions Gen 2 also supports:

```yaml
# Pub/Sub trigger
event_trigger:
  event_type: google.cloud.pubsub.topic.v1.messagePublished
  pubsub_topic: projects/my-project/topics/my-topic

# Cloud Storage trigger
event_trigger:
  event_type: google.cloud.storage.object.v1.finalized
  event_filters:
    bucket: my-bucket

# Firestore trigger
event_trigger:
  event_type: google.cloud.firestore.document.v1.written
  event_filters_path_pattern:
    document: users/{userId}
```

### Service Configuration

```yaml
service:
  available_memory: 512Mi      # 128Mi to 32Gi
  timeout_seconds: 300         # 1 to 3600
  max_instance_count: 100      # Auto-scaling limit
  min_instance_count: 1        # Reduce cold starts
  available_cpu: "1"           # CPU allocation
  max_instance_request_concurrency: 80  # Requests per instance
  ingress_settings: ALLOW_INTERNAL_ONLY  # Network access
  vpc_connector: projects/p/locations/l/connectors/c  # VPC access
```

### Build Configuration

```yaml
build:
  runtime: python311           # nodejs20, python311, go122, java21, etc.
  entry_point: my_handler      # Function to invoke
  environment_variables:
    BUILD_VAR: value
  docker_repository: projects/p/locations/l/repositories/r
```

## Important Notes

### Deployment Time

Cloud Function deployment can take 2-5 minutes as it:
1. Uploads source code to GCS
2. Builds container image with Cloud Build
3. Deploys to Cloud Run

### Costs

This example creates real GCP resources:
- Cloud Function invocations: First 2M/month free, then $0.40/million
- Cloud Build: First 120 min/day free
- Artifact Registry: $0.10/GB/month

### Security

This demo uses `ALLOW_ALL` ingress for public access. In production:
- Use `ALLOW_INTERNAL_ONLY` for internal services
- Use `ALLOW_INTERNAL_AND_GCLB` with Cloud Load Balancing
- Add IAM bindings for authenticated invocation

## Troubleshooting

### Function Deployment Fails

1. Check APIs are enabled:
   ```bash
   monk describe gcp-cloudfunction-demo/enable-apis
   ```

2. Verify blob was uploaded:
   ```bash
   monk blob list
   ```

3. Check Cloud Build logs in GCP Console

### Function Returns 403

1. Check function has `ALLOW_ALL` ingress or proper IAM bindings
2. For authenticated functions, ensure invoker has `roles/cloudfunctions.invoker`

### Cold Start Issues

Set `min_instance_count: 1` to keep at least one instance warm (incurs costs)
