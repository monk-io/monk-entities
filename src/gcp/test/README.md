# GCP Entities Test Suite

This directory contains integration tests for the GCP entity package.

## Prerequisites

1. **GCP Project**: You need a GCP project with billing enabled
2. **Authentication**: Configure GCP credentials:
   ```bash
   gcloud auth application-default login
   ```
3. **APIs Enabled**: The test suite will enable required APIs, but you may need:
   - Cloud Resource Manager API
   - Service Usage API

## Setup

1. Copy the environment template:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` with your GCP project ID:
   ```bash
   GCP_PROJECT_ID=your-project-id
   ```

## Running Tests

From the repository root:

```bash
# Run all tests with verbose output
sudo INPUT_DIR=./src/gcp/ ./monkec.sh test --verbose

# Run with specific test file
sudo INPUT_DIR=./src/gcp/ ./monkec.sh test --test-file test/stack-integration.test.yaml

# Watch mode for development
sudo INPUT_DIR=./src/gcp/ ./monkec.sh test --watch
```

## Test Structure

### stack-template.yaml

Defines the test resources that will be created:
- `test-enable-apis`: Enables required GCP APIs
- `test-sql-instance`: Cloud SQL PostgreSQL instance
- `test-sql-database`: Database within the instance
- `test-sql-user`: Database user with auto-generated password
- `test-bigquery`: BigQuery dataset
- `test-storage`: Cloud Storage bucket
- `test-service-account`: Service account with viewer role
- `test-service-account-key`: Key for the service account

### stack-integration.test.yaml

Defines the test sequence:
1. **Setup**: Load entity package and stack template
2. **Tests**: Create and verify each resource type
3. **Cleanup**: Delete all created resources in reverse order

## Test Duration

The full test suite takes approximately 10-15 minutes due to Cloud SQL instance creation time.

- Service Usage: ~1-2 minutes
- BigQuery: ~30 seconds
- Cloud Storage: ~30 seconds
- Service Account: ~30 seconds
- Cloud SQL Instance: ~8-10 minutes
- Cloud SQL Database/User: ~1 minute each

## Resource Naming

Test resources use predictable names for easier debugging:
- `test-postgres-instance`
- `test_database`
- `test_user`
- `test_dataset`
- `gcp-test-bucket-monkec-unique`
- `test-monkec-sa`

**Note**: The bucket name must be globally unique. Modify it in `stack-template.yaml` if needed.

## Cleanup

The test suite automatically cleans up resources. If cleanup fails:

```bash
# Manual cleanup via gcloud
gcloud sql instances delete test-postgres-instance --quiet
gcloud bigquery datasets delete test_dataset --delete-contents --quiet
gsutil rb gs://gcp-test-bucket-monkec-unique
gcloud iam service-accounts delete test-monkec-sa@PROJECT.iam.gserviceaccount.com --quiet
```

## Troubleshooting

### API Not Enabled

If you see "API not enabled" errors:
```bash
gcloud services enable sqladmin.googleapis.com
gcloud services enable bigquery.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable iam.googleapis.com
```

### Permission Denied

Ensure your account has sufficient permissions:
- Cloud SQL Admin
- BigQuery Admin
- Storage Admin
- Service Account Admin
- Project IAM Admin (for role bindings)

### Timeout Errors

Cloud SQL instance creation can take up to 10 minutes. If tests timeout:
1. Check GCP Console for instance status
2. Increase timeout in test file
3. Run tests with `--verbose` for detailed logs

### Resource Already Exists

If resources from a failed test run still exist:
1. Use manual cleanup commands above
2. Or modify resource names in `stack-template.yaml`
