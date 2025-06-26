# Neon Entities

This directory contains entities for managing Neon serverless Postgres resources. It provides functionality to create and manage projects, branches, computes, and database roles.

## Architecture

The Neon entities follow a common architecture pattern with shared base classes and utilities:

### Base Classes and Utilities

- **`neon-base.ts`**: Contains the `NeonEntity` base class that provides common functionality:
  - Authentication via API key from secrets
  - HTTP client setup with proper headers
  - Standardized error handling
  - Operation waiting utilities
  - Resource existence checking
  - Deletion with existing resource checks

- **`common.ts`**: Contains shared utilities and interfaces:
  - API key retrieval function
  - Common response interfaces
  - Helper functions for validation and formatting

### Entity Inheritance

All Neon entities extend the `NeonEntity` base class and inherit:
- Standard authentication and HTTP client setup
- Common error handling patterns
- Operation waiting functionality
- Resource management utilities

This architecture reduces code duplication and ensures consistent behavior across all Neon entities.

## Entities

### Project Entity (`neon/project`)

Manages a Neon serverless Postgres project.

```yaml
my-project:
  defines: neon/project
  secret_ref: neon-api-key
  name: my-neon-project
  region: aws-us-east-2
  permitted-secrets:
    neon-api-key: true
```

**Configuration:**
- `secret_ref`: Secret name containing the Neon API key
- `name`: (optional) Project name
- `region`: (optional) AWS region, defaults to aws-us-east-2

**State:**
- `id`: Project ID
- `name`: Project name
- `region`: Project region
- `status`: Project status
- `createdAt`: Creation timestamp
- `lastUpdated`: Last update timestamp

**Actions:**
- `getProject`: Get current project info
- `listBranches`: List all branches in the project
- `createBranch`: Create a new branch

### Branch Entity (`neon/branch`)

Manages a branch within a Neon project.

```yaml
dev-branch:
  defines: neon/branch
  secret_ref: neon-api-key
  projectId: project-id-123456
  name: dev
  permitted-secrets:
    neon-api-key: true
```

**Configuration:**
- `secret_ref`: Secret name containing the Neon API key
- `projectId`: Project ID this branch belongs to
- `name`: (optional) Branch name
- `parentId`: (optional) Parent branch ID
- `parentLsn`: (optional) Point-in-time LSN to branch from

**State:**
- `id`: Branch ID
- `name`: Branch name
- `currentState`: Branch state
- `parentId`: Parent branch ID
- `parentLsn`: Parent LSN
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp
- `logicalSize`: Logical size in MB
- `physicalSize`: Physical size in MB

**Actions:**
- `getBranch`: Get current branch info

### Compute Entity (`neon/compute`)

Manages compute resources for a Neon branch. A compute is required to connect to a branch from applications.

```yaml
dev-compute:
  defines: neon/compute
  secret_ref: neon-api-key
  projectId: project-id-123456
  branchId: branch-id-123456
  type: read_write
  minCu: 1
  maxCu: 2
  poolerEnabled: true
  permitted-secrets:
    neon-api-key: true
```

**Configuration:**
- `secret_ref`: Secret name containing the Neon API key
- `projectId`: Project ID this compute belongs to
- `branchId`: Branch ID this compute belongs to
- `type`: (optional) Compute type - "read_write" or "read_only", defaults to "read_write"
- `minCu`: (optional) Minimum compute units for autoscaling, defaults to 1
- `maxCu`: (optional) Maximum compute units for autoscaling, defaults to 1
- `poolerEnabled`: (optional) Enable connection pooling, defaults to false
- `poolerMode`: (optional) Pooler mode - "transaction" or "session", defaults to "transaction"

**State:**
- `id`: Compute ID
- `host`: Compute hostname for connections
- `proxyHost`: Proxy hostname for connections
- `currentState`: Current compute state
- `pendingState`: Pending state if transitioning
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp
- `lastActive`: Last active timestamp
- `disabled`: Whether compute is disabled

**Actions:**
- `getCompute`: Get current compute info
- `restart`: Restart the compute

### Role Entity (`neon/role`)

Manages database roles within a Neon branch.

```yaml
app-user:
  defines: neon/role
  secret_ref: neon-api-key
  projectId: project-id-123456
  branchId: branch-id-123456
  name: app_user
  canLogin: true
  permitted-secrets:
    neon-api-key: true
```

**Configuration:**
- `secret_ref`: Secret name containing the Neon API key
- `projectId`: Project ID this role belongs to
- `branchId`: Branch ID this role belongs to
- `name`: Role name
- `canLogin`: (optional) Whether the role can login, defaults to true

**State:**
- `name`: Role name
- `password`: Generated password
- `protected`: Whether role is protected
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

**Actions:**
- `resetPassword`: Reset the role's password

## Usage Example

Here's a complete example that creates a project with a development branch, compute, and an application user:

```yaml
namespace: examples

my-neon-project:
  defines: neon/project
  secret_ref: neon-api-key
  name: my-neon-project
  region: aws-us-east-2
  permitted-secrets:
    neon-api-key: true
  services:
    data:
      protocol: custom

dev-branch:
  defines: neon/branch
  secret_ref: neon-api-key
  projectId: <- connection-target("project") entity-state get-member("id")
  name: dev
  permitted-secrets:
    neon-api-key: true
  services:
    data:
      protocol: custom
  connections:
    project:
      runnable: examples/my-neon-project
      service: data
  depends:
    wait-for:
      runnables:
        - examples/my-neon-project
      timeout: 60

dev-compute:
  defines: neon/compute
  secret_ref: neon-api-key
  projectId: <- connection-target("project") entity-state get-member("id")
  branchId: <- connection-target("branch") entity-state get-member("id")
  type: read_write
  minCu: 1
  maxCu: 2
  poolerEnabled: true
  permitted-secrets:
    neon-api-key: true
  services:
    data:
      protocol: custom
  connections:
    project:
      runnable: examples/my-neon-project
      service: data
    branch:
      runnable: examples/dev-branch
      service: data
  depends:
    wait-for:
      runnables:
        - examples/my-neon-project
        - examples/dev-branch
      timeout: 60

app-user:
  defines: neon/role
  secret_ref: neon-api-key
  projectId: <- connection-target("project") entity-state get-member("id")
  branchId: <- connection-target("branch") entity-state get-member("id")
  name: app_user
  permitted-secrets:
    neon-api-key: true
  services:
    data:
      protocol: custom
  connections:
    project:
      runnable: examples/my-neon-project
      service: data
    branch:
      runnable: examples/dev-branch
      service: data
  depends:
    wait-for:
      runnables:
        - examples/my-neon-project
        - examples/dev-branch
      timeout: 60

stack:
  defines: process-group
  runnable-list:
    - examples/my-neon-project
    - examples/dev-branch
    - examples/dev-compute
    - examples/app-user
```

## Notes

1. Each branch can have one primary (read-write) compute and multiple read replica (read-only) computes
2. Compute resources are automatically scaled to zero after 5 minutes of inactivity
3. The Free Plan supports computes with up to 2 vCPUs and 8 GB of RAM
4. Roles created through the role entity are automatically granted membership in the `neon_superuser` role
5. Password requirements:
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, and special characters
   - Avoid sequential patterns and common words
   - No character should repeat more than twice consecutively
6. Reserved role names that cannot be used:
   - Any name starting with `pg_`
   - `neon_superuser`
   - `cloud_admin`
   - `zenith_admin`
   - `public`
   - `none`

## Prerequisites

1. A Neon account
2. A Neon API key stored in secrets as `neon-api-key`

## API Documentation

For more information about the Neon API, visit:
https://docs.neon.tech/reference/api-reference 