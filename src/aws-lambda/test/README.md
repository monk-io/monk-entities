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
# Optional: Test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=540000
```

## Running Tests

### Basic Testing

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/aws-lambda/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/raws-lambda/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/aws-lambda/ ./monkec.sh test --test-file stack-integration.test.yaml
```