# MongoDB Atlas Entity Test Examples

This directory contains test configurations and examples for the MongoDB Atlas entity.

## Files

- **`stack-integration.test.yaml`** - Comprehensive functional test configuration for MongoDB Atlas stack deployment
- **`stack-template.yaml`** - Stack template with MongoDB Atlas project, cluster, user, and connection testing

## Quick Start

### 1. Compile the Entity

First, compile the MongoDB Atlas entity:

```bash
cd /path/to/monkec
deno task compile examples/mongodb-atlas mongodb-atlas
```

### 2. Load the Entity

Load the compiled entity into Monk:

```bash
cd dist/examples/mongodb-atlas
monk load MANIFEST
```

### 3. Set Up Secrets

Configure your MongoDB Atlas credentials:

```bash
# Your MongoDB Atlas service account token (starts with mdb_)
monk secret set mongodb-atlas-token "mdb_your_service_account_token_here"

# Password for database users
monk secret set mongodb-user-password "your_secure_password_here"
```

### 4. Run Functional Tests

Use the monkec test runner to execute comprehensive functional tests:

```bash
# Set your MongoDB Atlas token
export MONGODB_ATLAS_TOKEN="mdb_your_service_account_token_here"

# Run the functional tests
deno task test examples/mongodb-atlas

# Run with verbose output
deno task test examples/mongodb-atlas --verbose
```

Alternatively, run the stack manually:

```bash
# Load and run the stack template
monk load examples/mongodb-atlas/test/stack-template.yaml
monk run mongodb-test-stack/dev-stack
```

### 5. Monitor Progress

Check the status of your deployments:

```bash
# Check entity status
monk status mongodb-test-stack/dev-project
monk status mongodb-test-stack/dev-cluster
monk status mongodb-test-stack/dev-user

# View logs
monk logs mongodb-test-stack/dev-cluster
```

### 6. Clean Up

When done testing:

```bash
# Delete the development stack
monk delete --force mongodb-test-stack/dev-stack

# Or delete individual components
monk delete --force mongodb-test-stack/dev-cluster
monk delete --force mongodb-test-stack/dev-user
monk delete --force mongodb-test-stack/dev-project
```

## Configuration Details

### stack-integration.test.yaml

- **Test Framework**: YAML-based functional test configuration
- **Namespace**: `mongodb-test-stack`
- **Timeout**: 9 minutes total test execution
- **Features**: Automated stack deployment, readiness checks, connection testing, and cleanup

### stack-template.yaml

- **Namespace**: `mongodb-test-stack`
- **Instance Size**: M0 (free tier)
- **Provider**: AWS US_EAST_1
- **Features**: Project, cluster, user creation with connection testing container

## Prerequisites

1. **MongoDB Atlas Account**: Active account with API access
2. **Service Account Token**: Created in MongoDB Atlas organization settings
3. **Organization Access**: Token must have access to target organization
4. **Monk Installation**: Monk CLI installed and configured

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify service account token starts with `mdb_`
   - Check organization name in configuration
   - Ensure token has proper permissions

2. **Cluster Creation Timeout**
   - MongoDB Atlas clusters can take 5-10 minutes to deploy
   - Check MongoDB Atlas console for status
   - Increase timeout values if needed

3. **Connection Issues**
   - Verify IP access list includes your IP range
   - Check cluster is in IDLE state before connecting
   - Validate connection strings in entity state

### Debug Commands

```bash
# Check entity state
monk describe mongodb-test-stack/dev-cluster

# View detailed logs
monk logs mongodb-test-stack/dev-cluster --follow

# Decode error messages
echo "base64_error_string" | monk decode-err
```

## Next Steps

After successful testing:

1. Customize configurations for your use case
2. Update instance sizes and regions as needed
3. Configure proper IP access lists for security
4. Integrate with your applications using connection strings

For more detailed documentation, see the main [README.md](../README.md) file. 