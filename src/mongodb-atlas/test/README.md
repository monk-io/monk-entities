# MongoDB Atlas Entity Test Examples

This directory contains test configurations and examples for the MongoDB Atlas entity.

## Files

- **`stack-integration.test.yaml`** - Comprehensive functional test configuration for MongoDB Atlas stack deployment
- **`stack-template.yaml`** - Stack template with MongoDB Atlas project, cluster, user, and connection testing
- **`env.example`** - Example environment variables file

## Environment Configuration

### Using .env File (Recommended)

The testing framework automatically loads environment variables from a `.env` file in the test directory. This is the recommended approach for managing test secrets.

1. **Copy the example file:**
   ```bash
   cp examples/mongodb-atlas/test/env.example examples/mongodb-atlas/test/.env
   ```

2. **Edit the .env file with your actual values:**
   ```bash
   # Required: MongoDB Atlas API Token
   MONGODB_ATLAS_TOKEN=your-actual-mongodb-atlas-token
   
   # Optional: Test configuration
   MONKEC_VERBOSE=true
   ```

3. **The .env file is automatically loaded** when running tests:
   ```bash
   sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml
   ```

### Environment Variables

#### Required Variables

- `MONGODB_ATLAS_TOKEN` - Your MongoDB Atlas API token (starts with `mdb_`)

#### Optional Variables

- `MONKEC_VERBOSE` - Set to `true` to enable verbose output
- `TEST_TIMEOUT` - Custom timeout for tests (default: 540000ms)

### Alternative: Environment Variables

You can also set environment variables directly in your shell:

```bash
export MONGODB_ATLAS_TOKEN="mdb_your_service_account_token_here"
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

## Quick Start

### 1. Compile the Entity

First, compile the MongoDB Atlas module:

```bash
INPUT_DIR=./src/mongodb-atlas/ OUTPUT_DIR=./dist/mongodb-atlas/ ./monkec.sh compile
```

### 2. Load the Entity

Load the compiled entity into Monk:

```bash
cd dist/examples/mongodb-atlas
monk load MANIFEST
```

### 3. Set Up Environment

Configure your MongoDB Atlas credentials using `.env` file (recommended):

```bash
# Copy and edit the environment file
cp examples/mongodb-atlas/test/env.example examples/mongodb-atlas/test/.env
# Edit .env file with your actual MongoDB Atlas token
```

Or set environment variables directly:

```bash
export MONGODB_ATLAS_TOKEN="mdb_your_service_account_token_here"
```

### 4. Run Functional Tests

Use the wrapper to execute comprehensive functional tests:

```bash
# Run with automatic .env loading
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml

# Run with verbose output
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml --verbose

# Run with custom environment
MONGODB_ATLAS_TOKEN="your-token" sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml
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
   - Verify `MONGODB_ATLAS_TOKEN` is set in `.env` file or environment

2. **Environment File Issues**
   - Ensure `.env` file is in the `test/` directory
   - Check file permissions and syntax
   - Verify no extra spaces around `=` in variable assignments

3. **Cluster Creation Timeout**
   - MongoDB Atlas clusters can take 5-10 minutes to deploy
   - Check MongoDB Atlas console for status
   - Increase timeout values if needed

4. **Connection Issues**
   - Verify IP access list includes your IP range
   - Check cluster is in IDLE state before connecting
   - Validate connection strings in entity state

### Debug Commands

```bash
# Enable verbose mode in .env file
echo "MONKEC_VERBOSE=true" >> src/mongodb-atlas/test/.env

# Run with verbose output
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml --verbose

# Check entity state
monk describe mongodb-test-stack/dev-cluster

# View detailed logs
monk logs mongodb-test-stack/dev-cluster --follow

# Decode error messages
echo "base64_error_string" | monk decode-err
```

## Best Practices

### Environment Management

- **Use .env files** - Keep secrets out of version control
- **Include .env in .gitignore** - Never commit actual secrets
- **Provide examples** - Include `env.example` files
- **Document requirements** - Clearly list required variables

### Test Development

- Use descriptive test names
- Include proper error handling
- Test both success and failure scenarios
- Validate resource cleanup

## Next Steps

After successful testing:

1. Customize configurations for your use case
2. Update instance sizes and regions as needed
3. Configure proper IP access lists for security
4. Integrate with your applications using connection strings

For more detailed documentation, see the main [README.md](../README.md) file. 