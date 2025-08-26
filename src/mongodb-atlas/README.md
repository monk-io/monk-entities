# MongoDB Atlas Entity

A comprehensive MongoDB Atlas entity for the Monk Entity Compiler that provides programmatic management of MongoDB Atlas resources including projects, clusters, and users.

## Overview

This entity allows you to:
- Create and manage MongoDB Atlas projects
- Deploy and configure MongoDB Atlas clusters
- Create and manage database users
- Configure IP access lists
- Retrieve connection strings for applications

## Features

- **Project Management**: Create and manage MongoDB Atlas projects within your organization
- **Cluster Deployment**: Deploy MongoDB clusters with configurable instance sizes and regions
- **User Management**: Create database users with specific roles and permissions
- **IP Access Control**: Configure IP access lists for security
- **Connection String Generation**: Automatically generate connection strings for applications
- **Error Handling**: Comprehensive error handling and logging
- **Resource Cleanup**: Proper resource cleanup on entity deletion

## Prerequisites

1. **MongoDB Atlas Account**: You need a MongoDB Atlas account with API access
2. **Service Account Token**: Create a service account token in MongoDB Atlas
3. **Organization Access**: Ensure your service account has access to the target organization

## Setup

### 1. Create MongoDB Atlas Service Account Token

1. Log in to MongoDB Atlas
2. Go to Organization Settings → Access Manager → Service Accounts
3. Create a new service account with appropriate permissions
4. Generate an API key (service account token)
5. The token should start with `mdb_`

### 2. Store Credentials in Monk Secrets

```bash
# Store your MongoDB Atlas service account token
monk secret set -g mongodb-atlas-token "mdb_your_service_account_token_here"

# Store password for database users (optional)
monk secret set -g mongodb-user-password "your_secure_password_here"
```

## Entity Types

### 1. Project Entity

Creates and manages MongoDB Atlas projects.

**Definition Interface:**
```typescript
interface ProjectDefinition {
  secret_ref: string;      // Secret reference for API token
  name: string;            // Project name
  organization: string;    // Organization name
}
```

**State Interface:**
```typescript
interface ProjectState {
  id?: string;            // Project ID
  name?: string;          // Project name
  existing?: boolean;     // Whether project existed before
}
```

### 2. Cluster Entity

Creates and manages MongoDB Atlas clusters.

**Definition Interface:**
```typescript
interface ClusterDefinition {
  secret_ref: string;           // Secret reference for API token
  name: string;                 // Cluster name
  project_id: string;           // Project ID
  provider: "AWS" | "GCP" | "AZURE";  // Cloud provider
  region: string;               // Cloud region
  instance_size: "M0" | "M2" | "M5" | "M10" | "M20" | "M30" | "M40" | "M50" | "M60" | "M80";
  allow_ips?: string[];         // IP addresses allowed to access
}
```

**State Interface:**
```typescript
interface ClusterState {
  id?: string;                  // Cluster ID
  name?: string;                // Cluster name
  connection_standard?: string; // Standard connection string
  connection_srv?: string;      // SRV connection string
  existing?: boolean;           // Whether cluster existed before
}
```

### 3. User Entity

Creates and manages MongoDB Atlas database users.

**Definition Interface:**
```typescript
interface UserDefinition {
  secret_ref: string;           // Secret reference for API token
  name: string;                 // Username
  project_id: string;           // Project ID
  role: string;                 // Database role
  password_secret_ref: string;  // Secret reference for password
}
```

**State Interface:**
```typescript
interface UserState {
  name?: string;                // Username
  existing?: boolean;           // Whether user existed before
}
```

## Usage Examples

### Basic Example

```yaml
namespace: my-mongodb

# Create a project
my-project:
  defines: mongodb-atlas/project
  name: my-application-project
  organization: my-organization
  secret_ref: mongodb-atlas-token
  permitted-secrets:
    mongodb-atlas-token: true

# Create a cluster
my-cluster:
  defines: mongodb-atlas/cluster
  name: my-application-cluster
  project_id: <- connection-target("project") entity-state get-member("id")
  provider: AWS
  region: US_EAST_1
  instance_size: M0
  secret_ref: mongodb-atlas-token
  allow_ips:
    - 192.168.1.0/24
  connections:
    project:
      runnable: my-mongodb/my-project
      service: data
  depends:
    wait-for:
      runnables:
        - my-mongodb/my-project
      timeout: 120

# Create a user
my-user:
  defines: mongodb-atlas/user
  name: app-user
  role: readWrite
  project_id: <- connection-target("project") entity-state get-member("id")
  secret_ref: mongodb-atlas-token
  password_secret_ref: mongodb-user-password
  connections:
    project:
      runnable: my-mongodb/my-project
      service: data
  depends:
    wait-for:
      runnables:
        - my-mongodb/my-project
      timeout: 120
```

### Application Integration Example

```yaml
# Application that uses MongoDB
my-app:
  defines: runnable
  connections:
    db:
      runnable: my-mongodb/my-cluster
      service: data
    user:
      runnable: my-mongodb/my-user
      service: data
  variables:
    mongodb_connection:
      env: MONGODB_CONNECTION_STRING
      value: <- connection-target("db") entity-state get-member("connection_srv")
      type: string
    mongodb_username:
      env: MONGODB_USERNAME
      value: <- connection-target("user") entity get-member("name")
      type: string
    mongodb_password:
      env: MONGODB_PASSWORD
      value: <- secret("mongodb-user-password")
      type: string
  containers:
    app:
      image: my-app:latest
```

## Testing

### Compilation Test

```bash
# Compile the MongoDB Atlas module
INPUT_DIR=./src/mongodb-atlas/ OUTPUT_DIR=./dist/mongodb-atlas/ ./monkec.sh compile

# Run the comprehensive test suite (example wrapper)
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

### Integration Test

Use the provided test configuration:

```bash
# Deploy the test stack
monk load dist/examples/mongodb-atlas
monk load examples/mongodb-atlas/test/test-mongodb.yaml
monk run mongodb-test/test-stack
```

The test configuration (`test/test-mongodb.yaml`) includes:
- Project creation
- Cluster deployment with M0 (free tier) instance
- User creation with readWrite role
- Connection testing with MongoDB client

## Configuration Options

### Instance Sizes

- **M0**: Free tier (512 MB storage, shared CPU)
- **M2/M5**: Shared clusters
- **M10+**: Dedicated clusters with increasing resources

### Cloud Providers and Regions

**AWS Regions:**
- `US_EAST_1`, `US_WEST_2`, `EU_WEST_1`, `AP_SOUTHEAST_1`, etc.

**GCP Regions:**
- `CENTRAL_US`, `EASTERN_US`, `WESTERN_EUROPE`, etc.

**Azure Regions:**
- `EAST_US_2`, `WEST_EUROPE`, `SOUTHEAST_ASIA`, etc.

### Database Roles

Common roles include:
- `read`: Read-only access
- `readWrite`: Read and write access
- `dbAdmin`: Database administration
- `atlasAdmin`: Full Atlas administration

## Security Best Practices

1. **Use Service Account Tokens**: Always use service account tokens, not personal API keys
2. **Limit IP Access**: Configure `allow_ips` to restrict access to known IP ranges
3. **Strong Passwords**: Use strong, randomly generated passwords for database users
4. **Least Privilege**: Assign minimal required roles to database users
5. **Secret Management**: Store all credentials in Monk secrets, never in configuration files

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify service account token is correct and starts with `mdb_`
   - Check organization access permissions

2. **Project Not Found**
   - Verify organization name is correct
   - Ensure service account has access to the organization

3. **Cluster Creation Timeout**
   - Increase timeout values in depends section
   - Check MongoDB Atlas status page for service issues

4. **Connection Issues**
   - Verify IP access list includes your application's IP range
   - Check that cluster is in IDLE state before connecting

### Debug Mode

Enable debug output by checking the entity logs:

```bash
monk logs mongodb-atlas/cluster
monk logs mongodb-atlas/project
monk logs mongodb-atlas/user
```

## API Rate Limits

MongoDB Atlas API has rate limits:
- 100 requests per minute for most endpoints
- The entity includes automatic token caching to minimize API calls
- Cached tokens are stored in secrets with expiration

## Files

- `base.ts` - Base class with common functionality
- `common.ts` - Shared utilities and authentication
- `cluster.ts` - Cluster entity implementation
- `project.ts` - Project entity implementation
- `user.ts` - User entity implementation
- `test/example.yaml` - Complete example configuration
- `test/test-mongodb.yaml` - Test configuration
- `test/stack.yaml` - Stack configuration
- `test/example-stack.yaml` - Example stack configuration
- `README.md` - This documentation

## Support

For issues and questions:
1. Check the MongoDB Atlas documentation
2. Review the entity logs for error details
3. Verify your API credentials and permissions
4. Test with the provided example configurations in the `test/` directory

## License

This entity is part of the Monk Entity Compiler project.
