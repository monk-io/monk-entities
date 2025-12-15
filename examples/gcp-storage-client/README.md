# GCP Cloud Storage with Service Account Example

This example demonstrates a complete GCP Cloud Storage setup with service account authentication:

1. **API Enablement** - Enables Storage and IAM APIs
2. **Cloud Storage Bucket** - Versioned bucket with lifecycle rules
3. **Service Account** - Account with storage admin role
4. **Service Account Key** - JSON credentials stored in secret
5. **Client Application** - Container that uploads/downloads files

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     gcp-storage-demo                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │ enable-apis  │  Enables storage.googleapis.com               │
│  │ (service-    │  and iam.googleapis.com                       │
│  │  usage)      │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│    ┌────┴────┐                                                  │
│    │         │                                                  │
│    ▼         ▼                                                  │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │ data-bucket │  │ storage-sa  │  Service Account:             │
│  │ (cloud-     │  │ (service-   │  demo-storage-app             │
│  │  storage)   │  │  account)   │  Roles: storage.objectAdmin   │
│  │             │  └──────┬──────┘                               │
│  │ gs://monk-  │         │                                      │
│  │ demo-       │         ▼                                      │
│  │ storage-    │  ┌──────────────────┐                          │
│  │ bucket      │  │ storage-sa-key   │  Creates JSON key        │
│  └──────┬──────┘  │ (service-        │  → stored in             │
│         │         │  account-key)    │  "demo-gcs-credentials"  │
│         │         └────────┬─────────┘                          │
│         │                  │                                    │
│         └────────┬─────────┘                                    │
│                  │                                              │
│                  ▼                                              │
│  ┌───────────────────────────────────┐                          │
│  │           gcs-client              │                          │
│  │          (runnable)               │                          │
│  │                                   │                          │
│  │  - Uses credentials from secret   │                          │
│  │  - Uploads files to bucket        │                          │
│  │  - Lists and downloads files      │                          │
│  │  - Continuous operation loop      │                          │
│  └───────────────────────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Entity Composition

### Service Account Key Flow

```yaml
# Service account provides: state.email, state.unique_id
storage-sa:
  defines: gcp/service-account
  roles:
    - roles/storage.objectAdmin
  services:
    service-account:
      protocol: custom

# Key uses unique_id from service account, writes credentials to secret
storage-sa-key:
  defines: gcp/service-account-key
  service_account_id: <- connection-target("sa") entity-state get-member("unique_id")
  secret: demo-gcs-credentials
  permitted-secrets:
    demo-gcs-credentials: true  # REQUIRED!
  connections:
    sa:
      runnable: gcp-storage-demo/storage-sa

# Client uses bucket name from state, credentials from secret
gcs-client:
  variables:
    bucket_name:
      value: <- connection-target("bucket") entity-state get-member("name")
    gcp_credentials:
      value: <- secret("demo-gcs-credentials")
```

### Bucket State Fields

The `cloud-storage` entity exposes:
- `state.name` - Bucket name for SDK operations
- `state.gs_uri` - GCS URI (gs://bucket-name)
- `state.location` - Bucket location
- `state.self_link` - Full resource URL

## Prerequisites

1. **GCP Provider** - Configure GCP provider in Monk:
   ```bash
   monk cloud add gcp
   ```

2. **Permissions** - Service account needs:
   - `roles/storage.admin`
   - `roles/iam.serviceAccountAdmin`
   - `roles/iam.serviceAccountKeyAdmin`
   - `roles/serviceusage.serviceUsageAdmin`

3. **Unique Bucket Name** - Edit `stack.yaml` to use a unique bucket name
   (bucket names must be globally unique across all of GCP)

## Usage

### Update Bucket Name

Before running, edit `stack.yaml` and change the bucket name to something unique:

```yaml
data-bucket:
  defines: gcp/cloud-storage
  name: your-unique-bucket-name-here  # Must be globally unique!
```

### Load and Run

```bash
# Load the stack
monk load examples/gcp-storage-client/stack.yaml

# Run the entire stack
monk run gcp-storage-demo/storage-app
```

### Monitor Progress

```bash
# Check status of all components
monk describe gcp-storage-demo/storage-app

# View client logs (watch file uploads)
monk logs gcp-storage-demo/gcs-client -f

# Check bucket details
monk describe gcp-storage-demo/data-bucket
```

### Cleanup

```bash
# Delete entire stack
# Note: Bucket must be empty to delete, or use force delete
monk delete gcp-storage-demo/storage-app
```

## Important Notes

### Secrets

Two entities write secrets in this example:

1. **storage-sa-key** writes credentials to `demo-gcs-credentials`:
   ```yaml
   permitted-secrets:
     demo-gcs-credentials: true
   ```

2. The client must also have permission to **read** the secret:
   ```yaml
   permitted-secrets:
     demo-gcs-credentials: true
   ```

### Bucket Names

GCS bucket names must be:
- Globally unique across all of GCP
- 3-63 characters long
- Start and end with a letter or number
- Contain only lowercase letters, numbers, hyphens, and underscores

### Security Considerations

This example uses project-level `roles/storage.objectAdmin`. In production:
- Use bucket-level IAM for least privilege
- Consider using Workload Identity instead of service account keys
- Rotate keys regularly
- Use `public_access_prevention: enforced` (already set)

### Lifecycle Rules

The bucket is configured with automatic lifecycle transitions:
- After 30 days: Move to NEARLINE (cheaper, 30-day minimum storage)
- After 90 days: Move to COLDLINE (cheaper still, 90-day minimum)
- After 365 days: Delete automatically

## Troubleshooting

### Bucket Creation Fails

1. **Name already taken**: Change to a unique bucket name
2. **API not enabled**: Check enable-apis status:
   ```bash
   monk describe gcp-storage-demo/enable-apis
   ```

### Service Account Key Fails

1. **Permission denied**: Ensure IAM admin permissions
2. **Quota exceeded**: Check service account key quotas (max 10 keys per SA)

### Client Can't Access Bucket

1. **Credentials invalid**: Check secret was written:
   ```bash
   monk secret get demo-gcs-credentials
   ```

2. **IAM propagation delay**: Wait 60 seconds for IAM changes to propagate

3. **Wrong bucket name**: Verify bucket state:
   ```bash
   monk describe gcp-storage-demo/data-bucket
   ```

### Bucket Not Empty on Delete

If bucket has files, you may need to empty it first:
```bash
gsutil -m rm -r gs://your-bucket-name/**
```
