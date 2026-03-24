---
name: entity-write-tests
description: Generate integration test files for a MonkEC entity package. Reads the implemented entity source code, extracts entities/actions/definitions, and produces stack-template.yaml, stack-integration.test.yaml, and env.example. Use after /entity-implement when code exists but tests need writing or improving.
argument-hint: "[package] - e.g., 'neon' or 'aws-s3'"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(*), Agent
---

# Write Entity Tests

Generate comprehensive integration test files for an existing MonkEC entity package by analyzing its source code.

## User prompt

$ARGUMENTS

---

## Step 1: Analyze the entity source code

Read all `.ts` files in `src/<package>/`:

For each entity class, extract:
- **Class name** and the `defines` path it compiles to (format: `<package>/<kebab-class-name>`)
- **Definition interface** — all fields with types (these become template properties)
- **Required fields** — fields without `?` optional marker
- **State interface** — fields that get populated at runtime
- **Actions** — all `@action()` decorators with method signatures and `Args` parameters
- **Readiness** — `static readonly readiness` config (period, initialDelay, attempts)
- **Dependencies** — does the entity reference other entities (e.g., project_id from another entity)?
- **Auth pattern** — uses `secret.get()` (needs `permitted-secrets` + `.env`) or cloud builtin (no secrets needed)

**Detect cross-entity references:** Look for Definition fields that reference IDs from other entities in the same package. Common patterns:
- A field named `zone_id`, `project_id`, `cluster_id`, `instance_id`, etc. that matches a State field (`state.zone_id`, `state.id`) of another entity
- A field whose value would come from another entity's state at runtime (not a user-provided value)

For each such field, note which entity provides it and which state field to read. These MUST become `connection-target()` wiring in the template — never hardcode placeholder values like `REPLACE_WITH_ID`.

Also read `PLAN.md` if it exists for additional context — it lists dependencies explicitly.

## Step 2: Study similar test examples

Read 1-2 existing test suites that match the package pattern:

**For reference patterns, read these best examples:**
- **Multi-variant single entity**: `src/aws-s3/test/` (3 bucket configs, comprehensive actions)
- **Multi-entity with dependencies**: `src/gcp/test/` (layered dependencies, reverse cleanup)
- **Simple API-based**: `src/stripe/test/` (clean minimal pattern)
- **Complex connections**: `src/neon/test/` (multi-tier dependencies, connection-target)
- **Long-running resources**: `src/aws-rds/test/` (large timeouts, database engines)

Focus on:
- Template structure (namespace, entity instances, connections, depends)
- Test ordering (deploy → wait → describe → actions → cleanup)
- Timeout values appropriate for the resource type
- How secrets are configured
- Cleanup order (reverse of creation)

## Step 3: Generate test/stack-template.yaml

### Structure

```yaml
namespace: <package>-test

# Tier 1: Foundation entities (no dependencies)
test-<entity1>:
  defines: <package>/<entity-class>
  <required_field>: <test_value>
  <optional_field>: <test_value>
  # For API-token based entities:
  permitted-secrets:
    <package>-api-token: true
  # No services block needed — dependent entities use service: default

# Tier 2: Dependent entities (read state from Tier 1 via connection-target)
test-<entity2>:
  defines: <package>/<entity-class>
  # Read state fields from connected entity
  parent_id: <- connection-target("parent") entity-state get-member("id")
  # Read definition fields from connected entity
  parent_name: <- connection-target("parent") entity get-member("name")
  connections:
    parent:
      runnable: <package>-test/test-<entity1>
      service: default
  depends:
    wait-for:
      runnables:
        - <package>-test/test-<entity1>
      timeout: 120

# Group for deploying everything at once
stack:
  defines: group
  members:
    - <package>-test/test-<entity1>
    - <package>-test/test-<entity2>
```

### Rules for template generation

1. **Use `<package>-test` namespace** — isolates test resources
2. **Realistic test values** — use descriptive names like `test-<package>-<entity>-monk-integration`
3. **Minimal but complete** — include all required fields plus key optional ones that exercise features
4. **Multiple variants** when a single entity has many config options (basic, advanced)
5. **Tags** — always add `Environment: test`, `Owner: integration-test`
6. **Dependencies** — use `connections` + `depends.wait-for` for entity references. Always use `service: default`
7. **`connection-target("name") entity-state get-member("field")`** — read **state** fields (runtime values from `create()`). Use `entity get-member("field")` for **definition** fields (template values)
8. **Never hardcode cross-entity IDs** — if a Definition field like `zone_id`, `project_id`, `cluster_id` references another entity's state, it MUST use `connection-target()`. Never use placeholder values like `REPLACE_WITH_ID` or `placeholder`. If the dependency is within the same package, wire it. If it's an external dependency, document it in a comment.
9. **Group** — define a `stack` group that includes all entities for single-command deploy
9. **Cloud builtins** (aws-*, azure-*, gcp*) — do NOT add `permitted-secrets` (auto-injected)
10. **API-token entities** — add `permitted-secrets` and `secret_ref` field

### Timeout guidelines

| Resource type | Readiness timeout | Examples |
|---|---|---|
| Instant/near-instant | 15,000-30,000ms | S3 buckets, SQS queues, SNS topics |
| Fast provisioning | 60,000-120,000ms | Neon projects, Stripe resources |
| Medium provisioning | 300,000-600,000ms | GCP Cloud SQL, Redis instances |
| Slow provisioning | 900,000-1,500,000ms | RDS instances, Azure PostgreSQL |
| Very slow | 1,500,000-2,400,000ms | CloudFront distributions |

## Step 4: Generate test/stack-integration.test.yaml

### Structure

```yaml
name: "<Package> Integration Test"
description: "Full lifecycle test for <Package> entities"
timeout: <global_timeout>

# Secrets mapping (only for API-token based entities)
secrets:
  global:
    <package>-api-token: "$<PACKAGE>_API_TOKEN"

setup:
  - name: "Load compiled entity"
    action: "load"
    target: "dist/input/<package>/MANIFEST"
    expect:
      exitCode: 0
  - name: "Load test template"
    action: "load"
    target: "stack-template.yaml"
    expect:
      exitCode: 0

tests:
  # === Deployment ===
  - name: "Deploy <entity1>"
    action: "run"
    target: "<package>-test/test-<entity1>"
    args:
      tag: "local"
    expect:
      exitCode: 0

  - name: "Deploy <entity2>"
    action: "run"
    target: "<package>-test/test-<entity2>"
    args:
      tag: "local"
    expect:
      exitCode: 0

  # === Readiness (in dependency order, foundation first) ===
  - name: "Wait for <entity1> readiness"
    action: "wait"
    target: "<package>-test/test-<entity1>"
    waitFor:
      condition: "ready"
      timeout: <appropriate_timeout>

  - name: "Wait for <entity2> readiness"
    action: "wait"
    target: "<package>-test/test-<entity2>"
    waitFor:
      condition: "ready"
      timeout: <appropriate_timeout>

  # === State verification ===
  - name: "Verify <entity1> status"
    action: "describe"
    target: "<package>-test/test-<entity1>"
    expect:
      exitCode: 0

  - name: "Verify all entities running"
    action: "ps"
    expect:
      exitCode: 0

  # === Action testing (per entity) ===
  - name: "Test <action-name> on <entity1>"
    action: "do"
    target: "<package>-test/test-<entity1>/<action-name>"
    expect:
      exitCode: 0

  # For actions with args:
  - name: "Test <action-name> with parameters"
    action: "do"
    target: "<package>-test/test-<entity1>/<action-name>"
    args:
      param1: "value1"
    expect:
      exitCode: 0

  # === Cost estimation (for every billable entity) ===
  - name: "get-cost-estimate on <entity1>"
    action: "do"
    target: "<package>-test/test-<entity1>/get-cost-estimate"
    expect:
      exitCode: 0

  - name: "costs on <entity1>"
    action: "do"
    target: "<package>-test/test-<entity1>/costs"
    expect:
      exitCode: 0

cleanup:
  # Reverse dependency order — deepest dependencies first
  - name: "Delete <entity2>"
    action: "delete"
    target: "<package>-test/test-<entity2>"
    expect:
      exitCode: 0
  - name: "Delete <entity1>"
    action: "delete"
    target: "<package>-test/test-<entity1>"
    expect:
      exitCode: 0
```

### Rules for test generation

1. **Deploy each entity with `run` + `args: tag: "local"`** — the `tag: "local"` arg is required to avoid an interactive tag selection prompt that blocks the test runner. Deploy entities individually, not via group
2. **Wait in dependency order** — foundation entities first, then dependents
3. **Describe after ready** — validates state was captured correctly
4. **ps check** — verify all entities show as running
5. **Test ALL actions** — every `@action()` in the source must have a test step, including `get-cost-estimate` and `costs` for billable entities
6. **Actions with args** — provide realistic test values for `Args` parameters
7. **Cleanup in reverse dependency order** — delete dependents before foundations
8. **Global timeout** — should cover the full test run (sum of all waits + buffer)
   - Simple packages: 300,000ms (5 min)
   - Medium: 600,000-900,000ms (10-15 min)
   - Heavy cloud resources: 1,800,000ms (30 min)
9. **Secrets section** — only for API-token packages, map env vars to secret names
10. **Comment sections** — use `# === Section ===` to organize logically

## Step 5: Generate test/env.example

```bash
# <Package> Integration Test Configuration
# Copy this file to .env and fill in real values

# API credentials (only for non-cloud-builtin packages)
<PACKAGE>_API_TOKEN=your-api-token-here

# Optional test configuration
# MONKEC_VERBOSE=true
# TEST_TIMEOUT=300000
```

For cloud builtin packages (aws-*, azure-*, gcp*, digitalocean-*), the env.example should note that credentials come from `monk cluster providers`:

```bash
# <Package> Integration Test Configuration
# AWS/Azure/GCP credentials are configured through Monk runtime (monk cluster providers)
# No API tokens needed in .env

# Optional test configuration
# MONKEC_VERBOSE=true
# TEST_TIMEOUT=300000
```

## Step 6: Validate generated files

After writing the files, verify:
1. All entity `defines:` paths match compiled entity names
2. All `@action()` names in source have corresponding test steps
3. Dependencies in template match actual entity relationships
4. Cleanup order is reverse of creation order
5. Timeouts are appropriate for the resource types
6. No reserved property names used (description, type)
7. **No hardcoded placeholder IDs** — search the template for strings like `REPLACE_WITH`, `placeholder`, `TODO`, or hardcoded IDs where `connection-target()` should be used. Every cross-entity reference must be wired dynamically.

## Done

Report to the user:
- Test files created
- Entity coverage: which entities and actions are tested
- Dependency chain if applicable
- Suggested next step: `/entity-test <package>` for manual testing or `/entity-test-integration <package>` for automated tests
