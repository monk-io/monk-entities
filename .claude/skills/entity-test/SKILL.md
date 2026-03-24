---
name: entity-test
description: Manually test a MonkEC entity integration against a live monk daemon. Loads the compiled entity, runs examples, checks readiness, tests actions, and debugs/fixes any issues. Use after /entity-implement or after manual code changes.
argument-hint: "[package] [options] - e.g., 'neon' or 'azure-postgresql --monk-path /usr/local/bin/monk' — package = module dir under src/"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(*), Agent
---

# Manual Entity Testing

Test a compiled MonkEC entity against a running monk daemon. Debug and fix issues found during testing.

## User prompt

$ARGUMENTS

---

## Configuration

**Monk binary**: Use `monk` by default. If the user specifies `--monk-path <path>`, use that path for all monk commands below (e.g., `sudo <path> version`). This is also needed when `sudo monk` fails with "command not found" because monk isn't in root's PATH.

**All monk commands require `sudo`** — the daemon socket (`/var/lib/monkd/monkd.sock`) is root-owned.

Parse from user prompt:
- `<package>` — the module name under `src/` and `dist/`
- `--monk-path <path>` — optional custom monk binary path

## Step 1: Verify prerequisites

```bash
# Check monk daemon is running
sudo monk version
# Check compiled output exists
ls dist/<package>/MANIFEST
```

If `dist/<package>/MANIFEST` doesn't exist, compile first:
```bash
INPUT_DIR=./src/<package>/ OUTPUT_DIR=./dist/<package>/ ./monkec.sh compile
```

**For cloud provider packages (aws-*, azure-*, gcp*, digitalocean-*)**, verify credentials are configured in the daemon:
```bash
sudo monk cluster providers
```
This must show the relevant provider (AWS, Azure, GCP, DigitalOcean). If missing, the user needs to add credentials via `sudo monk cluster provider add` before entities can interact with the cloud API.

**Check for test template:** If `src/<package>/test/stack-template.yaml` doesn't exist, warn the user and suggest running `/entity-write-tests <package>` first, or create a minimal template with one entity instance for manual testing.

## Step 2: Load entity and template

```bash
sudo monk load dist/<package>/MANIFEST
sudo monk load src/<package>/test/stack-template.yaml
```

Read `src/<package>/test/stack-template.yaml` to understand the test namespace and entity names.

## Step 3: Run entities

Start with the simplest/independent entity first. For each entity in the template:

```bash
sudo monk run -l <namespace>/<entity-name>
```

The `-l` (local) flag is required to avoid an interactive tag selection prompt that blocks non-interactive execution.

Wait for readiness:
```bash
sudo monk ps
```

If an entity doesn't become ready within a reasonable time, check its state:
```bash
sudo monk describe <namespace>/<entity-name>
```

## Step 4: Test actions

Read the entity source files to find all `@action()` decorators. Test each one:

```bash
sudo monk do <namespace>/<entity-name>/<action-name>
```

Verify the output makes sense. For `get-info` actions, check the returned data matches the provider's API.

## Step 5: Test update cycle

If the entity supports updates:
```bash
sudo monk update <namespace>/<entity-name>
sudo monk describe <namespace>/<entity-name>
```

## Step 6: Test deletion

```bash
sudo monk delete --force <namespace>/<entity-name>
```

Verify the resource is cleaned up. Check `sudo monk ps` to confirm it's gone.

## Step 7: Debug and fix

When something fails, follow this exact loop:

### 7.1 Diagnose

1. **Read the error output** — monk errors are often base64-encoded:
   ```bash
   echo '<base64-error>' | monk decode-err
   ```

2. **Check entity state** for clues:
   ```bash
   sudo monk describe <namespace>/<entity-name>
   ```

3. **Read the source code** at the failure point — the error trace shows the file and line number (e.g., `at route53Post (node_modules/aws-route53/route53-base:104:13)`)

### 7.2 Fix the code

Edit the source `.ts` file to fix the issue.

### 7.3 Recompile → Reload → Re-apply (all 3 required, in order)

```bash
# Step 1: Recompile
INPUT_DIR=./src/<package>/ OUTPUT_DIR=./dist/<package>/ ./monkec.sh compile

# Step 2: Reload manifest (registers new compiled code in daemon)
sudo monk load dist/<package>/MANIFEST

# Step 3: Reload template (picks up any template changes)
sudo monk load src/<package>/test/stack-template.yaml
```

**All 3 steps are mandatory.** Skipping any one means the daemon runs stale code.

### 7.4 Re-apply to running entity

Choose based on the failure:

**Option A: Update in place** (faster, keeps state — use when the fix is in entity logic, not in create()):
```bash
sudo monk update <namespace>/<entity-name>
```

**Option B: Delete and re-run** (clean slate — use when state is corrupted, create() failed, or you changed Definition fields):
```bash
sudo monk delete --force <namespace>/<entity-name>
sudo monk run -l <namespace>/<entity-name>
```

**Option C: Delete all and start over** (when multiple entities are broken or dependencies are tangled):
```bash
# Delete in reverse dependency order
sudo monk delete --force <namespace>/<dependent-entity>
sudo monk delete --force <namespace>/<foundation-entity>
# Re-run in dependency order
sudo monk run -l <namespace>/<foundation-entity>
# Wait for readiness, then:
sudo monk run -l <namespace>/<dependent-entity>
```

### 7.5 Verify the fix

```bash
sudo monk ps                                         # Check ready/live status
sudo monk describe <namespace>/<entity-name>          # Check state
sudo monk do <namespace>/<entity-name>/<action-name>  # Re-test the failing action
```

### 7.6 Repeat

Loop back to 7.1 if the fix didn't resolve the issue. Typical debug cycles: 1-3 for compilation issues, 2-5 for runtime/API issues.

### Common issues

- **Secret not found** — Check `permitted-secrets` in template, set secret:
  ```bash
  sudo monk secrets add -g <secret-name>='<value>'
  ```
- **API auth failure** — Verify token format, check API endpoint URL
- **Readiness never reached** — Check status values in code match what the API returns. Use `monk describe` to see current state.
- **Action not found** — Verify `@action()` decorator name, recompile and `monk load MANIFEST`
- **Stale code** — Always `sudo monk load MANIFEST` after recompiling
- **"containers is required"** — Use `defines: <package>/<entity-class>` syntax, not `defines: runnable` + `inherits:`
- **403 / AccessDenied from cloud provider** — The credentials in `monk cluster providers` lack required IAM permissions. Read the entity source to identify which API operations are used, and tell the user which permissions to add. This is NOT a code bug.
- **Entity path has full URL** (e.g., `https://github.com/.../entity-name`) — The MANIFEST REPO line uses a URL instead of the package name. Fix: change `REPO` to just the package name (e.g., `aws-route53`), recompile, and reload.
- **Dependent entity needs ID from another entity** — See "Entity Relations" section below.

## Entity Relations

Entities that depend on other entities (e.g., RecordSet needs HostedZone's zone_id) must declare the dependency in the template using `connections`, `depends`, and `connection-target()`.

### Pattern

```yaml
# Foundation entity (no dependencies)
foundation-entity:
  defines: pkg/foundation
  name: my-resource

# Dependent entity — reads state from foundation
dependent-entity:
  defines: pkg/dependent
  # Read state fields from connected entity
  parent_id: <- connection-target("parent") entity-state get-member("id")
  # Read definition fields from connected entity
  parent_name: <- connection-target("parent") entity get-member("name")
  connections:
    parent:
      runnable: ns/foundation-entity
      service: default
  depends:
    wait-for:
      runnables:
        - ns/foundation-entity
      timeout: 120
```

### Key rules

1. **`service: default`** — always use `default` as the service name unless the entity explicitly defines custom services
2. **`connection-target("name")`** — `"name"` must match the key under `connections:`
3. **`entity-state get-member("field")`** — reads from the connected entity's **state** (runtime values set in `create()`)
4. **`entity get-member("field")`** — reads from the connected entity's **definition** (values from the template)
5. **`depends.wait-for`** — ensures the foundation entity is ready before the dependent starts
6. **`timeout`** — seconds to wait for the dependency to become ready
7. **Secrets via connection** — read a secret ref from a connected entity then resolve it:
   ```yaml
   password_ref:
     value: <- connection-target("db") entity get-member("password_secret_ref")
     type: string
   password:
     env: DB_PASSWORD
     value: <- secret($password_ref)
     type: string
   ```

### Real examples
- `examples/rds-client/rds-client.yaml` — RDS instance → client app with full connection wiring
- `src/aws-glue-schema-registry/test/stack-template.yaml` — registry → schema → schema version chain
- `src/gcp/test/stack-template.yaml` — Cloud SQL instance → database → user dependency chain

## Done

Report to the user:
- Which entities were tested
- Full lifecycle results (create/ready/actions/delete)
- Any fixes applied
- Next step: `/entity-test-integration <package>` for automated tests
