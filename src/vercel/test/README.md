# Vercel Entity Testing

This directory contains tests for the Vercel TypeScript entities, including both entity-based testing and runnable-based testing for deployment scenarios.

## Prerequisites

1. **Vercel Account**: You need a Vercel account with API access
2. **Personal Access Token**: Create a personal access token in Vercel
3. **Test Environment**: Ensure you have a test environment to avoid affecting production

## Setup

### 1. Environment Variables

Copy the example environment file and fill in your values:

```bash
cp env.example .env
```

Edit `.env` with your actual values:

```bash
# Required: Your Vercel Personal Access Token
# Get your token from: https://vercel.com/account/tokens
VERCEL_TOKEN=your-actual-vercel-token-here

# Optional: Team ID for testing team-specific operations
TEAM_ID=your-team-id-here

# Optional: Test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=300000
```

### 2. Create Test Secrets

```bash
# Store your Vercel API token as a global secret
monk secret set -g vercel-token "your-actual-vercel-token-here"
monk secret set -g default-vercel-token "your-actual-vercel-token-here"
```

## Running Tests

### Basic Testing

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/vercel/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/vercel/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/vercel/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

### Test Modes

```bash
# Watch mode for development
sudo INPUT_DIR=./src/vercel/ ./monkec.sh test --watch

# Run tests with custom timeout
sudo TEST_TIMEOUT=600000 INPUT_DIR=./src/vercel/ ./monkec.sh test

# Run tests with debug output
sudo MONKEC_VERBOSE=true INPUT_DIR=./src/vercel/ ./monkec.sh test --verbose
```

## Test Architecture

The Vercel testing follows a hybrid approach:

### 1. Entity-Based Testing
- **Project Entity**: Tests project creation, management, and custom actions
- **Deploy Entity**: Tests deployment management via API

### 2. Runnable-Based Testing
- **Deploy Runnables**: Tests actual deployment using the `vercel/deploy` runnable
- **Simple File Deployment**: Tests deployment of a basic HTML file
- **Connection Testing**: Tests entity connections and data flow

## Test Files

### 1. Stack Integration Test (`stack-integration.test.yaml`)

Tests the complete lifecycle of a Vercel project and deployment:
- Project creation with static framework
- Deployment of a simple HTML file
- Custom actions (get-project, list-deployments)
- Connection testing
- Project deletion and cleanup

## Test Structure

Each test file follows this structure:

```yaml
name: Test Name
description: Test description
timeout: 300000

secrets:
  global:
    vercel-token: "$VERCEL_TOKEN"

setup:
  - name: Load compiled entity
    action: load
    target: dist/vercel/MANIFEST
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

### Stack Template (`stack-template.yaml`)

The stack template includes:

1. **Project Entity**: Creates a test Vercel project
2. **Deploy Runnable**: Deploys a simple HTML file to the project
3. **Connection Test**: Tests API connectivity and project access

```yaml
namespace: vercel-test

# Test project entity
project:
  defines: vercel/project
  name: monkec-test-project-123
  framework: static
  secret_ref: vercel-token
  permitted-secrets:
    vercel-token: true
  services:
    data:
      protocol: custom

# Test deployment runnable
deploy:
  defines: runnable
  inherits: vercel/deploy
  permitted-secrets:
    vercel-token: true

  depends:
    wait-for:
      runnables:
        - vercel-test/project

  connections:
    project:
      runnable: vercel-test/project
      service: data

  variables:
    project: <- connection-target("project") entity-state get-member("name")
    deploy-dir: /home/node/app
    source_path: frontend
    environment: production
    pre-deploy: |
      echo "📦 Creating simple HTML file..."
      cd $DEPLOY_DIR
      echo '<html><body><h1>Hello from Vercel!</h1><p>Deployed via Monk</p></body></html>' > index.html
      echo "✅ Simple file created"

  containers:
    deploy:
      paths:
        - blobs://frontend:/home/node/app

stack:
  defines: process-group
  runnable-list:
    - vercel-test/project
    - vercel-test/deploy
```

## What Gets Tested

### 1. Project Entity
- ✅ Project creation with static framework
- ✅ Project state management
- ✅ Custom actions (get-project, list-deployments)
- ✅ Project cleanup

### 2. Deployment Runnable
- ✅ Deployment using existing Docker image
- ✅ Simple file creation and deployment
- ✅ Environment variable handling
- ✅ Pre-deploy script execution
- ✅ Deployment completion verification

### 3. Connection Testing
- ✅ Entity connection establishment
- ✅ API token authentication
- ✅ Project data retrieval
- ✅ Connection cleanup

## Expected Test Output

When running the integration test, you should see:

```
✅ Project creation successful
✅ Project ready state achieved
✅ Custom actions working
✅ Deployment started
✅ Simple HTML file created
✅ Deployment completed successfully
✅ Connection test completed successfully
✅ Cleanup completed
```

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Ensure your Vercel token is valid and has the correct permissions
   - Check that the token is properly set as a global secret

2. **Deployment Timeouts**
   - Vercel deployments can take time, especially for the first deployment
   - Increase the timeout in the test configuration if needed

3. **Project Name Conflicts**
   - The test uses a unique project name, but conflicts can occur
   - Change the project name in `stack-template.yaml` if needed

4. **Docker Image Issues**
   - Ensure the `monkimages.azurecr.io/example-vercel-build:latest` image is accessible
   - Check that the image has the Vercel CLI installed

### Debug Mode

Run tests with verbose output to see detailed logs:

```bash
sudo MONKEC_VERBOSE=true INPUT_DIR=./src/vercel/ ./monkec.sh test --verbose
```

### Manual Testing

You can also test components manually:

```bash
# Test just the project entity
monk run test/stack-template.yaml

# Test just the deployment
monk run vercel-test/deploy

# Check project status
monk do vercel-test/project/get-project
```

## Best Practices

1. **Use Test Environment**: Always test in a separate Vercel account or team
2. **Clean Up**: Ensure tests clean up after themselves
3. **Unique Names**: Use unique project names to avoid conflicts
4. **Timeouts**: Set appropriate timeouts for deployment operations
5. **Secrets**: Never commit real tokens to version control

## Contributing

When adding new tests:

1. Follow the existing test structure
2. Include proper cleanup in the test
3. Add documentation for new test scenarios
4. Ensure tests are idempotent and can be run multiple times
5. Use descriptive test names and expectations 