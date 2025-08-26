# Entity Testing Framework

The Monk Entity Compiler includes a comprehensive testing framework for functional testing of entities using the Monk runtime. This framework allows you to test entity lifecycle, custom actions, secrets management, and integration scenarios.

## Quick Start

### Running Tests

```bash
# Using the MonkEC wrapper (recommended)
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test

# Verbose output for debugging
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test --verbose

# Watch mode for development
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test --watch

# Run specific test file
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

### CLI Options

- `--verbose` (`-v`) - Show detailed output including individual step results
- `--watch` (`-w`) - Watch for file changes and automatically re-run tests
- `--test-file PATH` - Run a specific test file
- `--help` (`-h`) - Show help message

## Environment Configuration

### Using .env Files (Recommended)

The testing framework automatically loads environment variables from a `.env` file in the test directory. This is the recommended approach for managing test secrets and configuration.

#### Setup

1. **Create a .env file in your test directory:**
   ```bash
   # examples/demo-person/test/.env
   API_KEY=your-api-key-here
   DB_PASSWORD=your-db-password
   MONKEC_VERBOSE=true
   ```

2. **The .env file is automatically loaded** when running tests:
   ```bash
   sudo INPUT_DIR=./src/<module>/ ./monkec.sh test
   ```

#### Environment File Format

The `.env` file supports standard environment variable format:

```bash
# Comments start with #
API_KEY=your-api-key-here
DB_PASSWORD=your-db-password

# Values can be quoted
COMPLEX_VALUE="value with spaces"

# Optional test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=300000
```

#### Security Best Practices

- **Never commit .env files** - Add `.env` to your `.gitignore`
- **Provide examples** - Include `env.example` files with dummy values
- **Document requirements** - List required environment variables in README

### Alternative: Shell Environment Variables

You can also set environment variables directly in your shell:

```bash
export API_KEY="your-api-key"
export DB_PASSWORD="your-password"
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test
```

## Test Structure

Tests are defined in JSON or YAML files in the `test/` directory of your entity. The framework automatically compiles your entity before running tests.

### Directory Structure

```
src/<module>/
├── *.ts                         # Entity implementation(s)
└── test/
    ├── .env                     # Environment variables (optional)
    ├── env.example              # Example environment file
    ├── stack-template.yaml      # Entity instance template (or example.yaml)
    └── stack-integration.test.yaml  # Test definition
```

## Test Configuration

Each test file is a YAML document with the following structure:

```yaml
name: "Test Name"
description: "Test description"
timeout: 60000  # Optional: Global timeout in milliseconds

setup:
  - name: "Load compiled entity"
    action: "load"
    target: "dist/path/to/MANIFEST"
    expect:
      exitCode: 0

  - name: "Load entity template"
    action: "load"
    target: "path/to/template.yaml"
    expect:
      exitCode: 0

tests:
  - name: "Create and start entity"
    action: "run"
    target: "namespace/entity-name"  # Full entity path
    expect:
      exitCode: 0
      output:
        - "Started namespace/entity-name"

  - name: "Execute action"
    action: "action"
    target: "namespace/entity-name"  # Full entity path
    actionName: "my-action"
    args:
      param1: "value1"
      param2: "value2"
    expect:
      exitCode: 0
      output:
        - "Action completed"

cleanup:
  - name: "Delete entity"
    action: "delete"
    target: "namespace/entity-name"  # Full entity path
    expect:
      exitCode: 0
```

### Test Steps

Each test step requires:

- `name` - Human-readable step name
- `action` - The action to perform
- `target` - The target entity or resource in `namespace/name` format
- `expect` - Expected results

Available actions:

- `load` - Load a MANIFEST or template file
- `run` - Create and start an entity
- `update` - Update entity configuration or execute action
- `stop` - Stop an entity
- `delete` - Delete an entity
- `describe` - Get entity status
- `wait` - Wait for entity condition
- `action` - Execute entity action
- `secret` - Manage secrets

### Secrets Management

Secrets can be configured at the test case level or in individual steps. Environment variables from `.env` files are automatically expanded:

```yaml
# Test case level secrets
secrets:
  global:  # Global scope
    shared-api-key: "$API_KEY"  # Uses API_KEY from .env file
    environment: "$TEST_ENVIRONMENT"
  demo-module/calculator:  # Entity-specific secrets
    api-token: "$API_TOKEN"
    db-password: "$DB_PASSWORD"

# Step level secrets
tests:
  - name: "Add temporary secrets"
    action: "secret"
    secrets:
      global:  # Global scope
        temp-key: "temporary-value"
      demo-module/calculator:  # Entity-specific secrets
        temp-token: "temporary-token"
    expect:
      exitCode: 0
```

The secrets map can have two types of keys:
- `global` - For global secrets (uses `-g` flag)
- `namespace/name` - For entity-specific secrets (uses `-r namespace/name`)

Environment variables in secret values (e.g. `$API_TOKEN`) are automatically expanded from `.env` files or shell environment.

### Wait Conditions

The `wait` action supports waiting for entity states:

```yaml
- name: "Wait for entity"
  action: "wait"
  target: "namespace/entity-name"
  waitFor:
    condition: "ready"  # "ready", "stopped", "running", or "exited"
    timeout: 30000  # Optional: Timeout in milliseconds
```

## Common Test Patterns

### 1. Entity Lifecycle Testing

```yaml
tests:
  - name: "Create and start entity"
    action: "run"
    target: "test-instances/person"
    expect:
      exitCode: 0
      output:
        - "Started"

  - name: "Wait for readiness"
    action: "wait"
    target: "test-instances/person"
    waitFor:
      condition: "ready"
      timeout: 30000

  - name: "Stop entity"
    action: "stop"
    target: "test-instances/person"
    expect:
      exitCode: 0
```

### 2. Custom Action Testing

```yaml
tests:
  - name: "Execute custom action"
    action: "do"
    target: "test-instances/person/say-hello"
    expect:
      exitCode: 0
      output:
        - "Hello"

  - name: "Action with arguments"
    action: "do"
    target: "test-instances/person/say-hello"
    args:
      greeting: "Good morning"
    expect:
      exitCode: 0
      output:
        - "Good morning"
```

### 3. Error Handling Testing

```yaml
tests:
  - name: "Test invalid action"
    action: "do"
    target: "test-instances/person/invalid-action"
    expect:
      exitCode: 1
      output:
        - "Not found action"
```

### 4. State Inspection

```yaml
tests:
  - name: "Check entity status"
    action: "describe"
    target: "test-instances/person"
    expect:
      exitCode: 0
      output:
        - "test-instances/person"
        - "active"

  - name: "List running entities"
    action: "ps"
    expect:
      exitCode: 0
        "output": ["test-instances/person"]
      }
    }
  ]
}
```

## Entity Templates

Entity templates define instances of your compiled entities for testing.

### Template Structure

```yaml
namespace: test-instances

entity-name:
  defines: compiled-namespace/entity-name
  # Entity configuration fields
  field1: value1
  field2: value2
  
  # Secret permissions (if needed)
  permitted-secrets:
    secret-name: true
    another-secret: true
```

### Template Best Practices

1. **Use test-specific namespace** - Avoid conflicts with production entities
2. **Minimal configuration** - Only include fields needed for testing
3. **Clear naming** - Use descriptive names for test instances
4. **Secret permissions** - Only grant access to secrets actually needed

## Complete Example

Here's a complete test file for a person entity:

```json
{
  "name": "Person Entity Integration Test",
  "description": "Complete integration test for Person entity using Monk runtime",
  "template": "person-template.yaml",
  "namespace": "test-instances",
  "entityName": "person",
  "timeout": 60000,
  "secrets": {
    "global": {
      "global-config": "production-mode",
      "shared-api-key": "$SHARED_API_KEY"
    },
    "test-instances/person": {
      "api-token": "$API_TOKEN",
      "db-password": "$DB_PASSWORD"
    }
  },
  "setup": [
    {
      "name": "Load compiled entity",
      "action": "load",
      "target": "dist/examples/demo-person/MANIFEST",
      "expect": {
        "exitCode": 0
      }
    },
    {
      "name": "Load person template",
      "action": "load",
      "target": "person-template.yaml",
      "expect": {
        "exitCode": 0
      }
    }
  ],
  "tests": [
    {
      "name": "Create and start person entity",
      "action": "run",
      "target": "test-instances/person",
      "expect": {
        "exitCode": 0,
        "output": ["Started local/test-instances/person"]
      }
    },
    {
      "name": "Wait for person to be ready",
      "action": "wait",
      "target": "test-instances/person",
      "waitFor": {
        "condition": "ready",
        "timeout": 60000
      }
    },
    {
      "name": "Test custom action",
      "action": "do",
      "target": "test-instances/person/say-hello",
      "expect": {
        "exitCode": 0,
        "output": ["says: \"Hello!\""]
      }
    },
    {
      "name": "Test action with arguments",
      "action": "do",
      "target": "test-instances/person/say-hello",
      "args": {
        "greeting": "Good morning"
      },
      "expect": {
        "exitCode": 0,
        "output": ["says: \"Good morning!\""]
      }
    },
    {
      "name": "Test secrets access",
      "action": "do",
      "target": "test-instances/person/test-secrets",
      "expect": {
        "exitCode": 0,
        "output": ["Testing secret access", "API token:", "Global config:"]
      }
    },
    {
      "name": "Stop person entity",
      "action": "stop",
      "target": "test-instances/person",
      "expect": {
        "exitCode": 0,
        "output": ["Deactivating person"]
      }
    }
  ],
  "cleanup": [
    {
      "name": "Delete person instance",
      "action": "delete",
      "target": "test-instances/person",
      "expect": {
        "exitCode": 0
      }
    }
  ]
}
```

## Debugging Tests

### Verbose Output

Use `--verbose` flag to see detailed step-by-step execution:

```bash
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test --verbose
```

This shows:
- Individual step results and timing
- Secret setup and cleanup details
- Full command output for failed steps

### Common Issues

1. **Entity not ready** - Increase timeout in `waitFor` conditions
2. **Secret access denied** - Check `permitted-secrets` in entity template
3. **Action not found** - Verify action names match entity implementation
4. **Template loading failed** - Check template file paths and syntax

### Test Development Workflow

1. **Start simple** - Begin with basic lifecycle tests
2. **Add actions gradually** - Test one custom action at a time
3. **Use watch mode** - `--watch` flag for rapid iteration
4. **Check verbose output** - Use `--verbose` to debug failures
5. **Verify cleanup** - Ensure entities and secrets are properly cleaned up

## Best Practices

### Test Organization

- **One test file per entity** - Keep tests focused and manageable
- **Descriptive names** - Use clear, descriptive step names
- **Logical grouping** - Group related tests in the same file
- **Comprehensive coverage** - Test happy paths, error cases, and edge cases

### Test Data

- **Use environment variables** - For sensitive or environment-specific data
- **Minimal test data** - Only include data necessary for testing
- **Clean test state** - Each test should start with a clean state

### Performance

- **Reasonable timeouts** - Don't make timeouts too short or too long
- **Efficient cleanup** - Always clean up resources to avoid conflicts
- **Parallel-safe** - Design tests to not interfere with each other

### Maintenance

- **Keep tests updated** - Update tests when entity behavior changes
- **Document test purpose** - Use clear descriptions for complex test scenarios
- **Regular test runs** - Run tests frequently during development

## Stack and Multi-Instance Testing

The framework supports testing complex scenarios with multiple entity instances:

### Stack Testing

Test complete application stacks with multiple interconnected entities:

```bash
# Test production and development environments together
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.json
```

Stack tests demonstrate:
- **Sequential deployment** - Production then development (respecting free tier limits)
- **Entity dependencies** - Proper startup and connection ordering
- **Environment isolation** - Separate configurations and resources
- **Connection testing** - End-to-end connectivity validation
- **Resource management** - Cleanup between environments to respect quotas

### Multi-Instance Testing

Test scaling scenarios with multiple instances of the same entity type:

```bash
# Test multi-tenant deployment
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/multi-instance.test.json
```

Multi-instance tests cover:
- **Tenant isolation** - Each tenant has separate projects and users
- **Sequential cluster testing** - Testing clusters one at a time (free tier limitation)
- **Resource scaling** - Testing with multiple projects and users
- **Independent lifecycle** - Each instance can be managed separately
- **Quota management** - Proper cleanup to respect free tier limits

### Available Test Examples

The framework includes comprehensive test examples:

- **`examples/demo-person/test/`** - Simple entity lifecycle test
- **`examples/mongodb-atlas/test/`** - MongoDB Atlas integration tests
  - `project-integration.test.json` - Single project entity test
  - `cluster-integration.test.json` - Cluster deployment test
  - `stack-integration.test.json` - Sequential stack testing (prod → dev, respecting free tier)
  - `multi-instance.test.json` - Multi-tenant testing with sequential cluster deployment

Each example demonstrates different testing patterns and can serve as templates for your own tests.

## Integration with CI/CD

The testing framework is designed to work well in automated environments:

```bash
# Set required environment variables
export API_TOKEN="test-token"
export DB_PASSWORD="test-password"

# Run tests for a module (exits non-zero on failure)
sudo INPUT_DIR=./src/<module>/ ./monkec.sh test

# Example: run a couple of modules
for module in mongodb-atlas neon; do
  echo "Testing $module..."
  sudo INPUT_DIR=./src/$module/ ./monkec.sh test || exit 1
done
```

The framework provides:
- **Clear exit codes** - 0 for success, non-zero for failure
- **Structured output** - Easy to parse test results
- **Environment variable support** - For configuration and secrets
- **Automatic cleanup** - No manual cleanup required between runs 

# Readiness Checks and the Static Readiness Property

Monk entities can define a readiness check by implementing a non-empty `checkReadiness()` method. If this method is present, the compiler will automatically generate a `checks.readiness` block in the entity's YAML definition.

## Customizing Readiness Parameters

You can customize the readiness check parameters (`period`, `initialDelay`, `attempts`) by adding a static `readiness` property to your entity class:

```ts
import { MonkEntity, ReadinessConfig } from "monkec/base";

export class MyEntity extends MonkEntity<...> {
  static readonly readiness: ReadinessConfig = { period: 10, initialDelay: 2, attempts: 20 };

  checkReadiness(): boolean {
    // ...
  }
}
```

- If the static property is present, its values are used in the generated YAML.
- If the static property is not present, the compiler uses the following defaults:
  - `period: 5`
  - `initialDelay: 2`
  - `attempts: 10`
- If the entity does **not** implement a non-empty `checkReadiness()` method, no readiness block is generated, even if the static property is present.
- If you add the static property but do not implement `checkReadiness()`, the compiler will emit a warning and ignore the readiness config.

## Example YAML Output

```yaml
checks:
  readiness:
    period: 10
    initialDelay: 2
    attempts: 20
```

See also: [Entity authoring utilities](authoring-utilities.md) and [Entity lifecycle](modules.md). 