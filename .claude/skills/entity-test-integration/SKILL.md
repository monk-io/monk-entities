---
name: entity-test-integration
description: Run automated integration tests for a MonkEC entity using the monkec test framework. Debug and fix any test failures. Use after /entity-test passes manual testing, or independently to validate an entity.
argument-hint: "[package] [options] - e.g., 'neon' or 'azure-postgresql --test-file test/custom.test.yaml' — package = module dir under src/"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(*), Agent
---

# Integration Test Runner

Run the monkec automated test framework against a compiled entity. Debug and fix failures.

## User prompt

$ARGUMENTS

---

## Configuration

Parse from user prompt:
- `<package>` — the module name under `src/`
- `--test-file <path>` — optional specific test file (default: runs all tests in `test/`)
- `--verbose` — always enabled by default for debugging

## Step 1: Verify test files exist

```bash
ls src/<package>/test/
```

Required files:
- `stack-template.yaml` — entity instances for testing
- `stack-integration.test.yaml` — test definition
- `.env` or `env.example` — credentials

If `.env` doesn't exist but `env.example` does, warn the user they need to create `.env` with real credentials:
```bash
cat src/<package>/test/env.example
```

## Step 2: Review test definition

Read `src/<package>/test/stack-integration.test.yaml` to understand:
- What entities are being tested
- What actions are tested
- Timeout values
- Expected outcomes

## Step 3: Run tests

```bash
sudo INPUT_DIR=./src/<package>/ ./monkec.sh test --verbose
```

If a specific test file was requested:
```bash
sudo INPUT_DIR=./src/<package>/ ./monkec.sh test --verbose --test-file test/<filename>
```

## Step 4: Analyze results

If tests pass, report success and move on.

If tests fail, analyze the output:

### Common test failures

**"Failed to list issues: Sort must be provided"**
- Not a test issue — this is a linear-cli config error. Ignore.

**Setup failure: "Load compiled entity" fails**
- Entity not compiled. Run:
  ```bash
  INPUT_DIR=./src/<package>/ OUTPUT_DIR=./dist/<package>/ ./monkec.sh compile
  ```

**Setup failure: "Load template" fails**
- Template syntax error. Read and fix `stack-template.yaml`.
- Check `defines:` matches compiled entity name exactly.

**Test failure: "run" exits non-zero**
- Entity `create()` method threw an error.
- Read the error output, check the entity source code, fix the issue.

**Test failure: "wait ready" times out**
- `checkReadiness()` never returns `true`.
- Check what status the API actually returns vs what the code expects.
- May need to increase timeout in the test YAML.

**Test failure: "do" action not found or fails**
- Action name mismatch between test YAML and `@action()` decorator.
- Or the action itself throws an error.

**Cleanup failure: "delete" fails**
- Entity `delete()` threw an error.
- May leave orphaned resources on the provider — warn the user.

## Step 5: Fix and retry

For each failure:

1. **Identify root cause** from the test output
2. **Read the relevant source code** — entity method that failed
3. **Apply the fix** — edit the source file
4. **Recompile**:
   ```bash
   INPUT_DIR=./src/<package>/ OUTPUT_DIR=./dist/<package>/ ./monkec.sh compile
   ```
5. **Re-run tests**:
   ```bash
   sudo INPUT_DIR=./src/<package>/ ./monkec.sh test --verbose
   ```

Repeat until all tests pass. Reference `.claude/skills/entity-new/rules.md` for common pitfalls.

## Step 6: Improve test coverage (optional)

If the user requests it, or if the test suite is minimal, suggest additions:
- Test multiple entities in dependency order
- Test update cycles (modify definition, re-run)
- Test error scenarios (invalid credentials, missing resources)
- Add assertions on output content (`expect.output`)

## Done

Report to the user:
- Test results (pass/fail per test step)
- Any fixes applied
- Test coverage summary
- Remaining manual verification needed (if any)
