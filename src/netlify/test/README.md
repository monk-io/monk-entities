# Netlify Entity Testing

This directory contains tests for the Netlify TypeScript entities, including both entity-based testing and runnable-based testing for deployment scenarios.

## Prerequisites

1. **Netlify Account**: You need a Netlify account with API access
2. **Personal Access Token**: Create a personal access token in Netlify
3. **Test Environment**: Ensure you have a test environment to avoid affecting production

## Setup

### 1. Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

```bash
# Required: Your Netlify Personal Access Token
NETLIFY_API_TOKEN=your-actual-netlify-api-token-here

# Test configuration
TEST_SITE_NAME=test-site-123
TEST_CUSTOM_DOMAIN=test.example.com
TEST_TEAM_SLUG=your-team-slug

# Optional: Test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=300000
```

### 2. Create Test Secrets

```bash
# Store your Netlify API token as a global secret
monk secret set -g netlify-api-token "your-actual-netlify-api-token-here"
monk secret set -g default-netlify-pat "your-actual-netlify-api-token-here"
```

## Running Tests

### Basic Testing

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --test-file test/site-integration.test.yaml
```

### Test Modes

```bash
# Watch mode for development
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --watch

# Run tests with custom timeout
sudo TEST_TIMEOUT=600000 INPUT_DIR=./src/netlify/ ./monkec.sh test

# Run tests with debug output
sudo MONKEC_VERBOSE=true INPUT_DIR=./src/netlify/ ./monkec.sh test --verbose
```

## Test Architecture

The Netlify testing follows a hybrid approach:

### 1. Entity-Based Testing
- **Site Entity**: Tests site creation, management, and custom actions
- **Deploy Entity**: Tests deployment management via API
- **Form Entity**: Tests form management and submission handling

### 2. Runnable-Based Testing
- **Deploy Runnables**: Tests actual deployment using the `netlify/deploy` runnable
- **Frontend Build**: Tests complete frontend build and deploy workflow
- **Connection Testing**: Tests entity connections and data flow

## Test Files

### 1. Site Integration Test (`site-integration.test.yaml`)

Tests the complete lifecycle of a Netlify site:
- Site creation with custom domain
- Site configuration updates
- Custom actions (get-site, list-deploys)
- Site deletion and cleanup

### 2. Deploy Integration Test (`deploy-integration.test.yaml`)

Tests deployment management:
- Deployment creation (production and draft)
- Deployment status checking
- Custom actions (cancel, retry, lock/unlock)
- Deployment cleanup

### 3. Form Integration Test (`form-integration.test.yaml`)

Tests form management:
- Form discovery and management
- Submission listing and management
- Spam/ham marking
- Form cleanup

### 4. Stack Integration Test (`stack-integration.test.yaml`)

Tests a complete stack with multiple entities and runnables:
- Site creation
- Deployment to the site (both entity and runnable approaches)
- Form management
- Frontend build and deploy workflow
- Connection testing
- Complete cleanup

## Test Structure

Each test file follows this structure:

```yaml
name: Test Name
description: Test description
timeout: 300000

secrets:
  global:
    netlify-api-token: "$NETLIFY_API_TOKEN"
    default-netlify-pat: "$NETLIFY_API_TOKEN"

setup:
  - name: Load compiled entity
    action: load
    target: dist/netlify/MANIFEST
    expect:
      exitCode: 0

  - name: Load entity template
    action: load
    target: test/stack-template.yaml
    expect:
      exitCode: 0

tests:
  # Entity Tests
  - name: Create and start entity
    action: run
    target: test-namespace/test-entity
    expect:
      exitCode: 0
      output:
        - "Started test-namespace/test-entity"

  - name: Wait for entity to be ready
    action: wait
    target: test-namespace/test-entity
    waitFor:
      condition: ready
      timeout: 60000

  - name: Test custom action
    action: action
    target: test-namespace/test-entity
    actionName: get-entity
    expect:
      exitCode: 0

  # Runnable Tests
  - name: Start runnable
    action: run
    target: test-namespace/test-runnable
    expect:
      exitCode: 0

  - name: Wait for runnable to complete
    action: wait
    target: test-namespace/test-runnable
    waitFor:
      condition: stopped
      timeout: 120000

cleanup:
  - name: Delete entity
    action: delete
    target: test-namespace/test-entity
    expect:
      exitCode: 0
```

## Test Templates

### Site Template (`stack-template.yaml`)

```yaml
namespace: netlify-test

test-site:
  defines: netlify/site
  secret_ref: netlify-api-token
  name: test-site-123
  custom_domain: test.example.com
  force_ssl: true
  permitted-secrets:
    netlify-api-token: true
  services:
    data:
      protocol: custom
```

### Deploy Template (`deploy-template.yaml`)

```yaml
namespace: netlify-test

test-deploy:
  defines: netlify/deploy
  secret_ref: netlify-api-token
  site_id: test-site-id
  dir: ./test-dist
  draft: true
  permitted-secrets:
    netlify-api-token: true
  services:
    data:
      protocol: custom
```

### Form Template (`form-template.yaml`)

```yaml
namespace: netlify-test

test-form:
  defines: netlify/form
  secret_ref: netlify-api-token
  site_id: test-site-id
  name: test-contact-form
  permitted-secrets:
    netlify-api-token: true
  services:
    data:
      protocol: custom
```

### Runnable Templates

#### Deploy Runnable
```yaml
test-deploy-runnable:
  defines: runnable
  inherits: netlify/deploy
  permitted-secrets:
    default-netlify-pat: true
  connections:
    site:
      runnable: netlify-test/test-site
      service: data
  variables:
    site-id: <- connection-target("site") entity-state get-member("id")
    deploy-dir: /home/node/app/test-dist
    pre-deploy: |
      echo "Pre-deploy script for test deployment"
```

#### Frontend Deploy Runnable
```yaml
test-frontend-deploy:
  defines: runnable
  inherits: netlify/deploy
  permitted-secrets:
    default-netlify-pat: true
  connections:
    site:
      runnable: netlify-test/test-site
      service: data
  variables:
    site-id: <- connection-target("site") entity-state get-member("id")
    deploy-dir: /home/node/app/build
    pre-deploy: |
      echo "Building test frontend..."
      mkdir -p build
      echo "<html><body><h1>Test Site</h1></body></html>" > build/index.html
```

#### Connection Test Runnable
```yaml
test-connection:
  defines: runnable
  permitted-secrets:
    netlify-api-token: true
  connections:
    site:
      runnable: netlify-test/test-site
      service: data
    deploy:
      runnable: netlify-test/test-deploy
      service: data
  variables:
    site_id:
      env: SITE_ID
      value: <- connection-target("site") entity-state get-member("id")
      type: string
  containers:
    connection-test:
      image: curlimages/curl:latest
      restart: no
      bash: |
        echo "Testing Netlify connections..."
        echo "Site ID: $SITE_ID"
```

## Testing Approaches

### 1. Entity-Only Testing
For testing just the API entities:
```bash
# Test only entity functionality
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --test-file test/entity-only.test.yaml
```

### 2. Runnable-Only Testing
For testing deployment workflows:
```bash
# Test only runnable functionality
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --test-file test/runnable-only.test.yaml
```

### 3. Full Integration Testing
For testing complete workflows:
```bash
# Test both entities and runnables together
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

## Best Practices

### 1. Test Isolation

- Use unique names for test resources to avoid conflicts
- **Avoid custom domains in tests** - they can cause conflicts with existing sites
- Clean up all test resources in the cleanup phase
- Use separate test environments when possible

### 2. Error Handling

- Test both success and failure scenarios
- Verify error messages and status codes
- Test rate limiting and API errors

### 3. Resource Management

- Always clean up test resources
- Use appropriate timeouts for operations
- Monitor resource usage during tests

### 4. Environment Variables

- Use environment variables for sensitive data
- Provide clear examples in env.example
- Document all required variables

### 5. Runnable Testing

- Test both entity and runnable approaches
- Verify deployment workflows end-to-end
- Test connection between entities and runnables

## Troubleshooting

### Common Test Issues

1. **Authentication Failed**
   - Verify NETLIFY_API_TOKEN is set correctly
   - Check token permissions and expiration
   - Ensure token is stored in Monk secrets

2. **Resource Conflicts**
   - Use unique test names with timestamps
   - Clean up previous test runs
   - Check for existing resources with same names
   - **Use unique site names** - Netlify site names must be globally unique

3. **Timeout Issues**
   - Increase TEST_TIMEOUT for slow operations
   - Check network connectivity to Netlify API
   - Monitor API rate limits

4. **Runnable Failures**
   - Check if `netlify/deploy` runnable is available
   - Verify container images and dependencies
   - Check pre-deploy script syntax

5. **Test Failures**
   - Enable verbose output for debugging
   - Check entity logs for detailed error messages
   - Verify test environment setup

### Debug Commands

```bash
# Check entity state
monk describe netlify-test/test-site

# View entity logs
monk logs netlify-test/test-site

# Test specific actions manually
monk do netlify-test/test-site/get-site

# Check runnable status
monk describe netlify-test/test-deploy-runnable

# View runnable logs
monk logs netlify-test/test-deploy-runnable

# Check secrets
monk secret list

# Verify environment
echo $NETLIFY_API_TOKEN
```

## Continuous Integration

For CI/CD environments:

1. **Environment Setup**: Set NETLIFY_API_TOKEN as a CI secret
2. **Test Execution**: Run tests in isolated environments
3. **Resource Cleanup**: Ensure cleanup runs even on test failures
4. **Reporting**: Collect test results and logs for analysis

Example CI configuration:

```yaml
# .github/workflows/test-netlify.yml
name: Test Netlify Entities

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up environment
        run: |
          echo "NETLIFY_API_TOKEN=${{ secrets.NETLIFY_API_TOKEN }}" >> $GITHUB_ENV
          echo "TEST_SITE_NAME=test-$(date +%s)" >> $GITHUB_ENV
      
      - name: Run tests
        run: |
          sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --verbose
      
      - name: Cleanup on failure
        if: failure()
        run: |
          # Additional cleanup steps
          echo "Tests failed, performing cleanup..."
``` 