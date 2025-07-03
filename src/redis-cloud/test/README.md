# Redis Cloud Entity Testing

This directory contains tests for the Redis Cloud TypeScript entities, including both entity-based testing and runnable-based testing for deployment scenarios covering Essentials (free tier) and Pro (paid tier) subscriptions.

## Prerequisites

1. **Redis Cloud Account**: You need a Redis Cloud account with API access
2. **API Key Pair**: Create user key and account key in Redis Cloud console
3. **Test Environment**: Ensure you have a test environment to avoid affecting production

## Setup

### 1. Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

```bash
# Required: Your Redis Cloud API User Key
# Get your keys from: https://app.redislabs.com/#/admin/settings/access_control/api_keys
REDIS_CLOUD_USER_KEY=your-actual-redis-cloud-user-key-here

# Required: Your Redis Cloud API Account Key
REDIS_CLOUD_ACCOUNT_KEY=your-actual-redis-cloud-account-key-here

# Optional: Test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=540000
```

### 2. Create Test Secrets

```bash
# Store your Redis Cloud API keys as global secrets
monk secret set -g redis-cloud-user-key "your-actual-redis-cloud-user-key-here"
monk secret set -g redis-cloud-account-key "your-actual-redis-cloud-account-key-here"
```

## Running Tests

### Basic Testing

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/redis-cloud/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

### Targeted Testing

```bash
# Test only Essentials tier
sudo INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --test-file stack-integration.test.yaml --group dev-essentials-stack

# Test only Pro tier
sudo INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --test-file stack-integration.test.yaml --group dev-pro-stack

# Test specific database
sudo INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --test-file stack-integration.test.yaml --runnable dev-essentials-database
```

### Test Modes

```bash
# Watch mode for development
sudo INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --watch

# Run tests with custom timeout
sudo TEST_TIMEOUT=600000 INPUT_DIR=./src/redis-cloud/ ./monkec.sh test

# Run tests with debug output
sudo MONKEC_VERBOSE=true INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --verbose
```

## Test Architecture

The Redis Cloud testing follows a hybrid approach:

### 1. Entity-Based Testing
- **Subscription Entity**: Tests subscription creation and management for both Essentials and Pro tiers
- **Database Entities**: Tests database creation, configuration, and management

### 2. Runnable-Based Testing
- **Connection Tests**: Tests actual Redis connectivity using redis-cli
- **Operation Testing**: Tests Redis commands and database functionality
- **Endpoint Validation**: Tests both public and private endpoints

## Test Files

### 1. Stack Integration Test (`stack-integration.test.yaml`)

Tests the complete lifecycle of Redis Cloud subscriptions and databases:
- Subscription creation for both Essentials and Pro tiers
- Database creation with different configurations
- Connection testing with actual Redis operations
- Custom actions and state management
- Resource cleanup

## Test Structure

Each test file follows this structure:

```yaml
name: Test Name
description: Test description
timeout: 540000

secrets:
  redis-cloud-account-key: "$REDIS_CLOUD_ACCOUNT_KEY"
  redis-cloud-user-key: "$REDIS_CLOUD_USER_KEY"

setup:
  - name: Load compiled entities
    action: load
    target: dist/input/redis-cloud/MANIFEST
    expect:
      exitCode: 0

  - name: Load test stack template
    action: load
    target: stack-template.yaml
    expect:
      exitCode: 0

tests:
  # Entity Tests
  - name: Create and start entity
    action: run
    target: test-namespace/test-entity
    expect:
      exitCode: 0

  - name: Wait for entity to be ready
    action: wait
    target: test-namespace/test-entity
    waitFor:
      condition: ready
      timeout: 300000

  # Connection Tests
  - name: Wait for connection test to complete
    action: wait
    target: test-namespace/connection-test
    waitFor:
      condition: exited
      timeout: 150000

  - name: Check connection test logs
    action: logs
    target: test-namespace/connection-test
    expect:
      exitCode: 0
      contains:
        - "Connected to Redis Cloud successfully!"

cleanup:
  - name: Delete test entities
    action: delete
    target: test-namespace/test-stack
    expect:
      exitCode: 0
```

## Test Templates

### Stack Template (`stack-template.yaml`)

The stack template includes:

1. **Subscription Entities**: Creates both Essentials and Pro subscriptions
2. **Database Entities**: Creates databases on both subscription types
3. **Connection Tests**: Tests Redis connectivity and operations
4. **Process Groups**: Organizes tests by tier and complete stacks

```yaml
namespace: redis-test-stack

# Essentials Subscription - Free tier
dev-essentials-subscription:
  defines: redis-cloud/subscription
  name: monkec-dev-essentials
  subscription_type: essentials
  provider: AWS
  region: us-east-1
  account_key_secret: redis-cloud-account-key
  user_key_secret: redis-cloud-user-key
  permitted-secrets:
    redis-cloud-account-key: true
    redis-cloud-user-key: true

# Essentials Database
dev-essentials-database:
  defines: redis-cloud/essentials-database
  name: monkec-dev-essentials
  subscription_id: <- connection-target("subscription") entity-state get-member("id")
  account_key_secret: redis-cloud-account-key
  user_key_secret: redis-cloud-user-key
  permitted-secrets:
    redis-cloud-account-key: true
    redis-cloud-user-key: true
  connections:
    subscription:
      runnable: redis-test-stack/dev-essentials-subscription
      service: data

# Process groups for organized testing
dev-essentials-stack:
  defines: process-group
  runnable-list:
    - redis-test-stack/dev-essentials-subscription
    - redis-test-stack/dev-essentials-database
    - redis-test-stack/dev-essentials-connection-test
```

## What Gets Tested

### 1. Subscription Entity
- ✅ Subscription creation for Essentials and Pro tiers
- ✅ Subscription state management
- ✅ Provider and region configuration
- ✅ Subscription cleanup

### 2. Database Entities
- ✅ Database creation with different configurations
- ✅ Memory and performance settings
- ✅ Security and networking configuration
- ✅ Database state management

### 3. Connection Testing
- ✅ Redis connectivity establishment
- ✅ Authentication and authorization
- ✅ Basic Redis operations (SET/GET/TTL)
- ✅ Info commands and monitoring
- ✅ Connection cleanup

## Expected Test Output

When running the integration test, you should see:

```
✅ Subscription creation successful
✅ Subscription ready state achieved
✅ Database creation successful
✅ Database ready state achieved
✅ Connected to Redis Cloud successfully!
✅ Redis operations completed successfully
✅ Connection test completed
✅ Cleanup completed
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```
Error: 401 Unauthorized - Invalid API credentials
```
**Solution:**
- Verify `REDIS_CLOUD_USER_KEY` and `REDIS_CLOUD_ACCOUNT_KEY` are correctly set in `.env` file
- Ensure both keys are from the same API key pair in Redis Cloud console
- Check that API keys have sufficient permissions for subscription and database management

#### 2. Subscription Creation Failures
```
Error: 402 Payment Required - Credit card required for Pro subscription
```
**Solution:**
- Pro subscriptions require valid payment method
- Add credit card to Redis Cloud account before testing Pro tier
- Use only Essentials tests if no payment method available

#### 3. Regional Availability Issues
```
Error: 400 Bad Request - Region not available for subscription type
```
**Solution:**
- Some regions may not support Essentials tier
- Try different AWS region (us-west-2, eu-west-1)
- Check Redis Cloud documentation for region availability

#### 4. Timeout During Database Creation
```
Error: Timeout waiting for database to become ready
```
**Solution:**
- Increase `TEST_TIMEOUT` environment variable
- Some regions have slower provisioning times
- Check Redis Cloud console for database status

#### 5. Connection Test Failures
```
Error: Could not connect to Redis instance
```
**Solution:**
- Verify database is in "active" status
- Check if source IP restrictions are properly configured (0.0.0.0/0 for tests)
- Ensure password authentication is working
- Verify endpoint connectivity from test environment

### Debug Mode

Run tests with verbose output to see detailed logs:

```bash
sudo MONKEC_VERBOSE=true INPUT_DIR=./src/redis-cloud/ ./monkec.sh test --verbose
```

### Manual Testing

You can also test components manually:

```bash
# Test just the subscription entity
monk run redis-test-stack/dev-essentials-subscription

# Test just the database
monk run redis-test-stack/dev-essentials-database

# Check subscription status
monk describe redis-test-stack/dev-essentials-subscription
```

## Redis Cloud Specific Considerations

### Cost Management
- **Essentials databases** are free but have limitations (30MB, single-zone)
- **Pro databases** incur charges immediately upon creation
- Tests use minimal configurations to reduce costs
- Cleanup runs automatically to prevent ongoing charges

### Regional Considerations
- Tests default to `us-east-1` for consistent availability
- Some features may not be available in all regions
- Essentials tier has limited regional options

### Database Types and Features
- **Essentials**: Basic Redis, no persistence, no replication, limited modules
- **Pro**: Full Redis feature set, persistence options, replication, all modules

### Security and Networking
- Tests use `0.0.0.0/0` source IP for convenience (not recommended for production)
- TLS is available but disabled in tests for simplicity
- Connection tests validate both public and private endpoints where applicable

## Expected Test Duration
- **Essentials stack**: ~5-8 minutes
- **Pro stack**: ~8-12 minutes
- **Full suite**: ~15-20 minutes
- **Cleanup**: ~2-3 minutes per stack

Timing varies by region and Redis Cloud platform load.

## Best Practices

1. **Use Test Environment**: Always test in a separate Redis Cloud account
2. **Clean Up**: Ensure tests clean up after themselves to avoid charges
3. **Unique Names**: Use unique database names to avoid conflicts
4. **Timeouts**: Set appropriate timeouts for provisioning operations
5. **Secrets**: Never commit real API keys to version control

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Include proper cleanup in the test
3. Add documentation for new test scenarios
4. Ensure tests are idempotent and can be run multiple times
5. Use descriptive test names and expectations 