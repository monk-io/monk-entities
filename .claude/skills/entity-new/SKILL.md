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

!`ls -1 /home/ivan/Work/monk-entities/src/`

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

### Phase 3: Write Tests (`/entity-write-tests`)

1. Analyze entity source code — extract entities, actions, definitions, dependencies
2. Generate `test/stack-template.yaml` with realistic test instances and dependency wiring
3. Generate `test/stack-integration.test.yaml` with full lifecycle + action coverage
4. Generate `test/env.example` with required credentials

### Phase 4: Manual Testing (`/entity-test`)

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

After all phases pass, report:
- Files created
- Entities implemented with their actions
- Test results (manual + integration)
- PR URL and status
- Linear issues updated
