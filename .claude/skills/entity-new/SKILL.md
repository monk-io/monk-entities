---
name: entity-new
description: End-to-end workflow for creating a new MonkEC entity integration — from planning through PR ready for merge. Orchestrates /entity-plan, /entity-implement, /entity-write-tests, /entity-test, /entity-test-integration, /pr-create, /pr-watch, and /pr-fix. Use when the user wants the full pipeline.
argument-hint: "[package] [entity-types] - e.g., 'stripe invoice, charge, customer' — package = module dir under src/"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(*), Agent, WebSearch, WebFetch
---

# New Entity Integration — Full Pipeline

This is the orchestrator skill. It chains the individual skills in sequence. Each phase can also be run independently.

## User prompt

$ARGUMENTS

---

## Existing Integrations

!`ls -1 src/`

---

## Monk Binary

Before any monk commands, detect the monk binary path:
```bash
which monk 2>/dev/null || ls /usr/local/bin/monk 2>/dev/null || echo "not found"
```
If `monk` is not in PATH, **ask the user** for the monk binary path. Store it and use it for all subsequent `sudo <monk-path> ...` commands throughout the pipeline.

---

## Progress Tracking

Throughout the pipeline, maintain `src/<package>/PLAN.md` as a living progress document. Update it after each phase completes:

- After Phase 1: the plan itself (entities, API details, design decisions)
- After Phase 2: mark implementation done, note files created, any deviations from plan
- After Phase 3: mark tests written, note test coverage
- After Phase 4: mark manual testing done, note issues found and fixed
- After Phase 5: mark integration tests done, note pass/fail results
- After Phase 6+: add PR URL, CI status, review feedback addressed

Use a `## Progress` section with checkboxes:
```markdown
## Progress

- [x] Plan — approved 2026-03-26
- [x] Implement — 3 entities, 8 files, compiled clean
- [x] Tests — 23 test steps covering full lifecycle
- [x] Manual testing — all entities pass create/ready/actions/delete
- [x] Integration tests — 23/23 passed (173s)
- [x] PR — #175, CI green, 12 Bugbot issues fixed
- [ ] Merged
```

When issues are found and fixed during testing or PR review, append them to a `## Issues Found` section so future work on this package has context:
```markdown
## Issues Found

- Route 53 API returns XML, not JSON — need manual XML parsing
- `example.com` is reserved by AWS — use `monk-test-<package>.io` for test domains
- Change propagation takes 20-30s — poll with GetChange API
```

---

## Pipeline

### Phase 1: Plan (`/entity-plan`)

**Check for existing plan:** Look for `src/<package>/PLAN.md`.

If no plan exists, do the research and planning inline:

1. Identify provider, resource types, API style
2. Search the web for API documentation — endpoints, auth, async patterns, error formats, resource states
3. Study 1-2 similar existing integrations matching the API style
4. For AWS/Azure/GCP, read builtin type definitions in `lib/src/builtins/`
5. Read project conventions: `doc/entity-conventions.md`, `doc/scaffold.md`, `doc/common-issues.md`
6. Present the plan to the user and wait for approval

If a plan already exists, read it and confirm with the user before proceeding.

### Phase 2: Implement (`/entity-implement`)

1. Read shared references:
   - `.claude/skills/entity-new/rules.md` — critical rules
   - `.claude/skills/entity-new/templates.md` — code scaffolds
2. Create all source files under `src/<package>/`:
   - `common.ts`, `<package>-base.ts`, entity classes, MANIFEST, README, example.yaml
3. Register in `build.sh` and root `MANIFEST`
4. Compile until clean:
   ```bash
   INPUT_DIR=./src/<package>/ OUTPUT_DIR=./dist/<package>/ ./monkec.sh compile
   ```
5. **Fix MANIFEST LOAD order** — After compilation, check `dist/<package>/MANIFEST` and ensure `*-base.yaml` comes first in the LOAD line. The compiler generates arbitrary order, often placing the base module after entities that depend on it. This must be re-checked after every recompile.

### Phase 3: Write Tests (`/entity-write-tests`)

1. Analyze entity source code — extract entities, actions, definitions, dependencies
2. Generate `test/stack-template.yaml` with realistic test instances and dependency wiring
3. Generate `test/stack-integration.test.yaml` with full lifecycle + action coverage
4. Generate `test/env.example` with required credentials

### Phase 4: Manual Testing (`/entity-test`)

**Before running entities**, check that required cloud provider credentials are configured:
```bash
sudo monk cluster providers
```
For cloud packages (aws-*, azure-*, gcp*, digitalocean-*), the relevant provider must be listed. If missing, **stop and ask the user** to add credentials:
```bash
sudo monk cluster provider add -p <provider>   # e.g., aws, azure, gcp, digitalocean
```
Do NOT search for credentials files or environment variables — the user must configure them in the monk cluster.

Once credentials are confirmed:
1. Load and run against monk daemon:
   ```bash
   sudo monk load dist/<package>/MANIFEST
   sudo monk load src/<package>/test/stack-template.yaml
   sudo monk run -l <namespace>/<entity-name>
   ```
2. Verify readiness, test actions, test deletion
3. Debug and fix any issues (recompile + reload + retry)
4. Repeat until full lifecycle passes: create → ready → actions → update → delete

### Phase 5: Integration Tests (`/entity-test-integration`)

1. Run automated test suite:
   ```bash
   sudo INPUT_DIR=./src/<package>/ ./monkec.sh test --verbose
   ```
2. Fix failures and re-run until all tests pass

### Phase 6: Commit and Create PR (`/pr-create`)

1. Commit all changes with a descriptive message
2. Create a GitHub PR linked to the Linear issue(s)
3. Update Linear issue status to "In Review"

### Phase 7: Wait for CI (`/pr-watch`)

1. Poll CI checks until they complete
2. If CI fails → go to Phase 8
3. If CI passes and no review comments → done, report PR is ready to merge

### Phase 8: Fix PR Issues (`/pr-fix`)

1. Read CI failures and/or review comments
2. Fix the code, commit, push
3. Reply to review comments
4. Go back to Phase 7 (watch for new CI run)

Repeat Phase 7 ↔ Phase 8 until CI passes and reviews are approved.

---

## Done

After all phases pass:

### 1. Update PLAN.md with final status
Mark all phases complete, add the PR URL, and finalize the Issues Found section.

### 2. Write summary to `src/<package>/SUMMARY.md`
Create a concise summary of what was built:

```markdown
# <Package> — Implementation Summary

## Entities

| Entity | Actions | Description |
|--------|---------|-------------|
| `<package>/<entity>` | action1, action2, ... | What it manages |

## Files Created
- `src/<package>/...` (list all source files)

## Test Results
- Manual: <pass/fail summary>
- Integration: <N/N steps passed, duration>

## Issues Fixed During Development
- <issue 1 — brief description>
- <issue 2>

## PR
- URL: <PR link>
- Linear: <issue IDs>
```

### 3. Report to the user
- Entities implemented with their actions
- Test results (manual + integration)
- PR URL and status
- Linear issues updated
