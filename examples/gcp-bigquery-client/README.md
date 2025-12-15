# GCP BigQuery with Service Account Example

This example demonstrates a complete GCP BigQuery setup with service account authentication:

1. **API Enablement** - Enables BigQuery and IAM APIs
2. **BigQuery Dataset** - Dataset with pre-defined table schemas
3. **Service Account** - Account with BigQuery editor and job user roles
4. **Service Account Key** - JSON credentials stored in secret
5. **Client Application** - Container that queries and inserts data

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     gcp-bigquery-demo                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │ enable-apis  │  Enables bigquery.googleapis.com              │
│  │ (service-    │  and iam.googleapis.com                       │
│  │  usage)      │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│    ┌────┴────┐                                                  │
│    │         │                                                  │
│    ▼         ▼                                                  │
│  ┌──────────────────┐  ┌─────────────┐                          │
│  │ analytics-dataset│  │ analytics-sa│  Service Account:        │
│  │ (big-query)      │  │ (service-   │  demo-bigquery-app       │
│  │                  │  │  account)   │                          │
│  │ Tables:          │  └──────┬──────┘  Roles:                  │
│  │ - events         │         │         - bigquery.dataEditor   │
│  │ - users          │         │         - bigquery.jobUser      │
│  │ - metrics        │         ▼                                 │
│  └────────┬─────────┘  ┌──────────────────┐                     │
│           │            │ analytics-sa-key │  Creates JSON key   │
│           │            │ (service-        │  → stored in        │
│           │            │  account-key)    │  "demo-bq-creds"    │
│           │            └────────┬─────────┘                     │
│           │                     │                               │
│           └──────────┬──────────┘                               │
│                      │                                          │
│                      ▼                                          │
│  ┌───────────────────────────────────────┐                      │
│  │            bq-client                  │                      │
│  │           (runnable)                  │                      │
│  │                                       │                      │
│  │  - Uses credentials from secret       │                      │
│  │  - Creates sample data in tables      │                      │
│  │  - Runs analytical queries            │                      │
│  │  - Continuous insert/query loop       │                      │
│  └───────────────────────────────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Dataset Schema

The example creates a dataset with three tables:

### events
| Column | Type | Mode | Description |
|--------|------|------|-------------|
| event_id | STRING | REQUIRED | Unique event identifier |
| event_type | STRING | REQUIRED | Type of event |
| user_id | STRING | NULLABLE | User who triggered the event |
| timestamp | TIMESTAMP | REQUIRED | When the event occurred |
| properties | JSON | NULLABLE | Event properties as JSON |
| session_id | STRING | NULLABLE | Session identifier |

### users
| Column | Type | Mode | Description |
|--------|------|------|-------------|
| user_id | STRING | REQUIRED | Unique user identifier |
| email | STRING | NULLABLE | User email address |
| created_at | TIMESTAMP | REQUIRED | Account creation time |
| last_seen | TIMESTAMP | NULLABLE | Last activity timestamp |
| metadata | JSON | NULLABLE | Additional user metadata |

### metrics
| Column | Type | Mode | Description |
|--------|------|------|-------------|
| date | DATE | REQUIRED | Metric date |
| metric_name | STRING | REQUIRED | Name of the metric |
| value | FLOAT64 | REQUIRED | Metric value |
| dimensions | JSON | NULLABLE | Metric dimensions |

## Entity Composition

### Dataset State Fields

The `big-query` entity exposes:
- `state.dataset_id` - Dataset ID for queries
- `state.dataset_reference` - Full reference (project:dataset)
- `state.project` - GCP project ID
- `state.location` - Dataset location
- `state.self_link` - Full resource URL

### Connection Flow

```yaml
# Dataset provides state for queries
analytics-dataset:
  defines: gcp/big-query
  dataset: monk_demo_analytics
  tables: |
    [{"name": "events", "schema": [...]}]

# Service account provides unique_id for key creation
analytics-sa:
  defines: gcp/service-account
  roles:
    - roles/bigquery.dataEditor
    - roles/bigquery.jobUser

# Key writes credentials to secret
analytics-sa-key:
  defines: gcp/service-account-key
  service_account_id: <- connection-target("sa") entity-state get-member("unique_id")
  secret: demo-bq-credentials
  permitted-secrets:
    demo-bq-credentials: true

# Client composes query parameters from dataset state
bq-client:
  variables:
    dataset_id:
      value: <- connection-target("dataset") entity-state get-member("dataset_id")
    project_id:
      value: <- connection-target("dataset") entity-state get-member("project")
    gcp_credentials:
      value: <- secret("demo-bq-credentials")
```

## Prerequisites

1. **GCP Provider** - Configure GCP provider in Monk:
   ```bash
   monk cloud add gcp
   ```

2. **Permissions** - Service account needs:
   - `roles/bigquery.admin`
   - `roles/iam.serviceAccountAdmin`
   - `roles/iam.serviceAccountKeyAdmin`
   - `roles/serviceusage.serviceUsageAdmin`

3. **Billing** - Project must have billing enabled (BigQuery has usage costs)

## Usage

### Load and Run

```bash
# Load the stack
monk load examples/gcp-bigquery-client/stack.yaml

# Run the entire stack
monk run gcp-bigquery-demo/bigquery-app
```

### Monitor Progress

```bash
# Check status of all components
monk describe gcp-bigquery-demo/bigquery-app

# View client logs (watch queries running)
monk logs gcp-bigquery-demo/bq-client -f

# Check dataset details
monk describe gcp-bigquery-demo/analytics-dataset

# Run custom action to get dataset info
monk do gcp-bigquery-demo/analytics-dataset/get
```

### Manual Queries

You can also run queries manually:

```bash
# List tables
monk do gcp-bigquery-demo/analytics-dataset/list-tables

# Get table info
monk do gcp-bigquery-demo/analytics-dataset/get-table name=events
```

### Cleanup

```bash
# Delete entire stack
monk delete gcp-bigquery-demo/bigquery-app
```

## Important Notes

### Secrets

The `analytics-sa-key` entity writes credentials to `demo-bq-credentials`:
```yaml
permitted-secrets:
  demo-bq-credentials: true
```

### BigQuery Costs

BigQuery pricing includes:
- **Storage**: $0.02/GB/month (first 10GB free)
- **Queries**: $5/TB scanned (first 1TB/month free)

This demo uses minimal data, but be aware of costs for production use.

### Table Schemas

Tables are defined inline in the `tables` field as JSON:
```yaml
tables: |
  [
    {
      "name": "events",
      "schema": [
        {"name": "event_id", "type": "STRING", "mode": "REQUIRED"},
        ...
      ]
    }
  ]
```

Supported types: STRING, BYTES, INTEGER, FLOAT64, BOOLEAN, TIMESTAMP, DATE, TIME, DATETIME, JSON, GEOGRAPHY, NUMERIC, BIGNUMERIC

### Query Examples

The client runs these queries:

1. **Recent users with plan info**:
   ```sql
   SELECT user_id, email, JSON_VALUE(metadata, '$.plan') as plan
   FROM `project.dataset.users`
   ```

2. **Events aggregation**:
   ```sql
   SELECT event_type, COUNT(*) as count
   FROM `project.dataset.events`
   GROUP BY event_type
   ```

3. **Daily metrics**:
   ```sql
   SELECT metric_name, SUM(value)
   FROM `project.dataset.metrics`
   WHERE date = CURRENT_DATE()
   GROUP BY metric_name
   ```

## Troubleshooting

### Dataset Creation Fails

1. **API not enabled**: Check enable-apis status
2. **Dataset already exists**: BigQuery will adopt existing datasets

### Query Fails

1. **Permission denied**: Wait 60s for IAM propagation
2. **Table not found**: Check table creation in dataset
3. **Invalid SQL**: BigQuery uses Standard SQL by default

### Service Account Key Fails

1. **Quota exceeded**: Max 10 keys per service account
2. **Permission denied**: Need IAM admin permissions

### Client Can't Connect

1. **Credentials invalid**: Verify secret was written:
   ```bash
   monk secret get demo-bq-credentials
   ```

2. **Wrong project**: Check project ID in entity state:
   ```bash
   monk describe gcp-bigquery-demo/analytics-dataset
   ```
