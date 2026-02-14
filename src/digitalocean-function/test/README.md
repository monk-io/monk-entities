# DigitalOcean App Platform Functions Entity Testing

This directory contains tests for the DigitalOcean App Platform Functions TypeScript entity, including comprehensive integration testing for function deployment, lifecycle management, and custom actions.

## Prerequisites

1. **DigitalOcean Account**: You need a DigitalOcean account with App Platform access
2. **API Token**: Create a Personal Access Token with read/write permissions
3. **Test Environment**: Ensure you have a test environment to avoid affecting production

## Setup

### Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

```bash
# Required: Your DigitalOcean API Token
# Get from: https://cloud.digitalocean.com/account/api/tokens
DO_API_TOKEN=your_digitalocean_api_token_here

# Optional: Test secret for environment variable testing
TEST_SECRET=test-secret-value

# Optional: Test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=900000
```

## Running Tests

### Basic Testing

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/do-function/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/do-function/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/do-function/ ./monkec.sh test --test-file stack-integration.test.yaml
```

### Advanced Testing

```bash
# Run with custom timeout
sudo INPUT_DIR=./src/do-function/ ./monkec.sh test --timeout 1200000

# Run with debug mode
DEBUG_MODE=true sudo INPUT_DIR=./src/do-function/ ./monkec.sh test --verbose
```

## Test Structure

### Test Files

- **`stack-template.yaml`** - Entity instance definitions for testing
- **`stack-integration.test.yaml`** - Main integration test cases
- **`env.example`** - Environment variables template
- **`.env`** - Your actual environment variables (not committed)
- **`README.md`** - This documentation

### Test Coverage

The integration tests verify:

1. **Node.js Function Deployment**
   - Create and deploy Node.js function using sample repository
   - Wait for deployment readiness (3-5 minutes)
   - Test all custom actions: `info`, `url`, `logs`, `deploy`
   - Verify proper cleanup and resource management

2. **Python Function with Environment Variables**
   - Deploy Python function with custom environment variables
   - Test secret reference handling
   - Test update operations
   - Verify route configuration

3. **Error Handling**
   - Test actions on non-existent functions
   - Verify proper error messages and exit codes

### Entity Instances

The tests create these entity instances:

- **`test-instances/test-nodejs-function`**
  - App: `test-nodejs-app`
  - Component: `test-hello-function`
  - Runtime: Node.js
  - Region: nyc1
  - Repository: DigitalOcean sample Node.js function

- **`test-instances/test-python-function`**
  - App: `test-python-app`
  - Component: `test-api-function`
  - Runtime: Python
  - Region: sfo3
  - Repository: DigitalOcean sample Python function
  - Custom routes and environment variables

## Expected Test Duration

- **Complete test suite**: 15-20 minutes
- **Function deployment**: 3-5 minutes each
- **Readiness checks**: 30-60 seconds
- **Action execution**: 1-5 seconds each
- **Cleanup**: 30-60 seconds each

## Troubleshooting

### Common Issues

1. **Missing Environment Variables**
   ```
   Error: Environment variable DO_API_TOKEN not found
   ```
   - Ensure `.env` file exists with required variables
   - Check `env.example` for required format

2. **API Token Issues**
   ```
   Error: DigitalOcean API error: 401 - Unauthorized
   ```
   - Verify API token is correct and has read/write permissions
   - Check token hasn't expired
   - Ensure token has App Platform access

3. **Deployment Timeouts**
   ```
   Error: Timeout waiting for readiness
   ```
   - App Platform deployments can take 5+ minutes
   - Check DigitalOcean status page
   - Verify region availability
   - Increase timeout if needed

4. **Resource Limits**
   ```
   Error: Resource limit exceeded
   ```
   - Check DigitalOcean account limits
   - Clean up existing test apps manually
   - Ensure proper test cleanup

### Debug Mode

Enable verbose logging:

```bash
# Set in .env file
MONKEC_VERBOSE=true

# Or run with verbose flag
sudo INPUT_DIR=./src/do-function/ ./monkec.sh test --verbose
```

### Manual Cleanup

If tests fail and leave resources behind:

```bash
# List apps
doctl apps list --access-token $DO_API_TOKEN

# Delete specific app
doctl apps delete app_id --access-token $DO_API_TOKEN --force

# Delete all test apps (be careful!)
doctl apps list --format ID,Name --no-header --access-token $DO_API_TOKEN | \
  grep "test-" | awk '{print $1}' | \
  xargs -I {} doctl apps delete {} --access-token $DO_API_TOKEN --force
```

## Security Notes

- Tests use separate API tokens and secrets
- No production resources are affected
- Test apps use `test-` prefix for identification
- Auto-deploy is disabled for test functions
- All test resources are cleaned up automatically
- `.env` file is gitignored to prevent token leakage

## Performance Benchmarks

Expected performance metrics:

- **Function creation**: 3-5 minutes
- **Readiness check**: 30-60 seconds
- **Action execution**: 1-5 seconds
- **Update operation**: 3-5 minutes
- **Deletion**: 30-60 seconds

## Contributing

When adding new tests:

1. Follow the Monk testing framework format
2. Use descriptive test names and descriptions
3. Include proper cleanup in all test scenarios
4. Test both success and error conditions
5. Update this README with new test descriptions
6. Ensure tests are idempotent and can run multiple times

## Test Repositories

The tests use these public DigitalOcean sample repositories:

- **Node.js**: [sample-functions-nodejs-helloworld](https://github.com/digitalocean/sample-functions-nodejs-helloworld)
- **Python**: [sample-functions-python-helloworld](https://github.com/digitalocean/sample-functions-python-helloworld)

These repositories contain properly structured Functions projects that deploy successfully on App Platform.