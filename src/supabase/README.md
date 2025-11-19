# Supabase MonkEC Entities

This module provides MonkEC entities for managing Supabase projects via the Supabase Management API v1.

## Prerequisites

- A Supabase account
- A Supabase Management API token from [your account settings](https://supabase.com/dashboard/account/tokens)

## Entities

### Project (`supabase/project`)

Creates and manages Supabase projects.

#### Configuration

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `name` | string | ✅ | - | Project name (1-256 characters) |
| `db_pass` | string | ❌ | - | Database password (min 8 characters) - if not provided, will be retrieved/generated from secret |
| `db_pass_secret_ref` | string | ❌ | `{project-name}-db-password` | Secret reference for database password |
| `anon_api_key_secret_ref` | string | ❌ | - | Secret reference for anon API key - if provided, key will be fetched and saved |
| `service_role_api_key_secret_ref` | string | ❌ | - | Secret reference for service_role API key - if provided, key will be fetched and saved |
| `organization_id` | string | ✅ | - | Organization ID for the project |
| `desired_instance_size` | string | ❌ | - | Instance size (only available for paid plans) |
| `region_selection` | object | ❌ | `{type: "specific", code: "us-east-1"}` | Region selection (specific region or smart group) |
| `secret_ref` | string | ❌ | `supabase-api-token` | Secret reference for API token |

#### State

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Project ID (primary identifier) |
| `existing` | boolean | Whether the resource pre-existed |

#### Password Management

The database password can be handled in two ways:

1. **Explicit Password**: Provide `db_pass` directly in the definition
2. **Secret-based Password** (Recommended): Omit `db_pass` and let the entity manage the password via secrets
   - If a secret exists at `db_pass_secret_ref` (default: `{project-name}-db-password`), it will be used
   - If no secret exists, a secure password will be generated and saved to the secret
   - This approach ensures passwords are not stored in configuration files

#### Actions

This entity provides basic CRUD operations (create, read, update, delete) without additional custom actions.

## Secrets

### Default Secret Names

- `supabase-api-token`: Supabase Management API token
- `{project-name}-db-password`: Database password for the project (auto-generated if not exists)
- `{custom-name}`: Anon API key (fetched from project if `anon_api_key_secret_ref` is specified)
- `{custom-name}`: Service role API key (fetched from project if `service_role_api_key_secret_ref` is specified)

### Adding Secrets

```bash
# Global secret (recommended)
monk secrets add -g supabase-api-token='your_api_token_here'

# Database password (optional - will be auto-generated if not provided)
monk secrets add -g my-project-db-password='your_db_password_here'

# API keys (automatically fetched and saved when secret references are provided)
# These will be populated automatically by the entity:
# monk secrets add -g my-project-anon-key='auto_fetched_anon_key'
# monk secrets add -g my-project-service-key='auto_fetched_service_role_key'

# Entity-scoped secret
monk secrets add -r namespace/project supabase-api-token='your_api_token_here'
```

## Region Selection

The `region_selection` field supports two types of region targeting:

### Specific Region
Target a specific geographical region:
```yaml
region_selection:
  type: specific
  code: us-east-1  # or eu-west-1, ap-southeast-1, etc.
```

**Available regions include:** `us-east-1`, `us-east-2`, `us-west-1`, `us-west-2`, `ap-east-1`, `ap-southeast-1`, `ap-northeast-1`, `ap-northeast-2`, `ap-southeast-2`, `eu-west-1`, `eu-west-2`, `eu-west-3`, `eu-north-1`, `eu-central-1`, `eu-central-2`, `ca-central-1`, `ap-south-1`, `sa-east-1`

### Smart Group Region
Target a regional group for automatic optimal placement:
```yaml
region_selection:
  type: smartGroup
  code: americas  # or emea, apac
```

**Available smart groups:**
- `americas` - Automatically selects optimal region in North/South America
- `emea` - Automatically selects optimal region in Europe/Middle East/Africa  
- `apac` - Automatically selects optimal region in Asia Pacific

> **Note:** Region codes are not a stable API. Use the `/available-regions` endpoint to get the current list of supported regions and groups.

## Usage Examples

### Basic Project

```yaml
namespace: my-app

project:
  defines: supabase/project
  name: my-application
  organization_id: my-organization
  region_selection:
    type: specific
    code: us-east-1
  secret_ref: supabase-api-token
  db_pass_secret_ref: my-application-db-password
  anon_api_key_secret_ref: my-application-anon-key
  service_role_api_key_secret_ref: my-application-service-key
  permitted-secrets:
    supabase-api-token: true
    my-application-db-password: true
    my-application-anon-key: true
    my-application-service-key: true
```

### Large Instance Project

```yaml
namespace: team-app

project:
  defines: supabase/project
  name: team-application
  organization_id: my-team
  desired_instance_size: large
  region_selection:
    type: specific
    code: eu-west-1
  secret_ref: supabase-api-token
  db_pass_secret_ref: team-application-db-password
  permitted-secrets:
    supabase-api-token: true
    team-application-db-password: true
```

### Smart Group Region Project

```yaml
namespace: global-app

project:
  defines: supabase/project
  name: global-application
  organization_id: global-org
  desired_instance_size: xlarge
  region_selection:
    type: smartGroup
    code: apac  # Automatically selects optimal Asia Pacific region
  secret_ref: supabase-api-token
  db_pass_secret_ref: global-application-db-password
  permitted-secrets:
    supabase-api-token: true
    global-application-db-password: true
```

### Application with Supabase Connection

```yaml
namespace: full-stack-app

# Supabase project
backend:
  defines: supabase/project
  name: fullstack-backend
  organization_id: fullstack-org
  desired_instance_size: medium
  region_selection:
    type: specific
    code: us-west-2
  secret_ref: supabase-api-token
  db_pass_secret_ref: fullstack-backend-db-password
  permitted-secrets:
    supabase-api-token: true
    fullstack-backend-db-password: true

# Frontend application
frontend:
  defines: runnable
  containers:
    app:
      image: node:18-alpine
      bash: |
        echo "Project ID: $SUPABASE_PROJECT_ID"
        # Start your application here
  depends:
    wait-for:
      runnables:
        - full-stack-app/backend
  connections:
    supabase:
      runnable: full-stack-app/backend
      service: data
  variables:
    SUPABASE_PROJECT_ID: <- connection-target("supabase") entity-state get-member("id")
```

## Development

### Build and Test

```bash
# Compile the module
INPUT_DIR=./src/supabase/ OUTPUT_DIR=./dist/supabase/ ./monkec.sh compile

# Run tests (requires API token)
sudo INPUT_DIR=./src/supabase/ ./monkec.sh test --verbose
```

### Environment Setup

1. Copy the example environment file:
   ```bash
   cp src/supabase/test/env.example src/supabase/test/.env
   ```

2. Edit `.env` with your credentials:
   ```bash
   SUPABASE_API_TOKEN=your_supabase_api_token_here
   ```

3. Run the test secrets mapping in your test configuration.

## API Reference

This entity uses the [Supabase Management API v1](https://api.supabase.com/api/v1-json).

## Support

- [Supabase Documentation](https://supabase.com/docs)
- [MonkEC Documentation](../../doc/)
- [Entity Conventions](../../doc/entity-conventions.md)
