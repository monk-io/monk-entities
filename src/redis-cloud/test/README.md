# Redis Cloud Entity Testing

This directory contains tests for the Redis Cloud TypeScript entities, including both entity-based testing and runnable-based testing for deployment scenarios covering Essentials (free tier) and Pro (paid tier) subscriptions.

## Prerequisites

1. **Redis Cloud Account**: You need a Redis Cloud account with API access
2. **API Key Pair**: Create user key and account key in Redis Cloud console
3. **Test Environment**: Ensure you have a test environment to avoid affecting production

## Setup

### Environment Variables

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