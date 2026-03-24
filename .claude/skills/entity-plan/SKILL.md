---
name: entity-plan
description: Research and plan a new MonkEC entity integration. Use when the user wants to plan, scope, or design an integration before implementing it. Produces a structured plan that /entity-new can consume. Use this instead of /entity-new when the user says "plan", "design", "scope", or "research" an integration.
argument-hint: "[package] [entity-types] - e.g., 'stripe invoice, charge, customer' — package = module dir under src/"
allowed-tools: Read, Glob, Grep, Agent, WebSearch, WebFetch, Bash(ls *), Bash(cat *)
---

# Plan a New Entity Integration

Research and produce an implementation plan for a new MonkEC entity integration. This plan can be reviewed, refined, and then passed to `/entity-new` for implementation.

## User prompt

$ARGUMENTS

---

## Existing Integrations

!`ls -1 src/`

---

## Step 1: Identify scope

- Provider name and module directory name (kebab-case)
- Resource types to implement (e.g., project, cluster, database, user)
- API style: REST/JSON, form-urlencoded/XML, or cloud SDK builtin

## Step 2: Research the provider's API

Search the web for the provider's API documentation. For each resource type, identify:
- CRUD endpoints (method, path, request/response shape)
- Authentication method (Bearer token, API key header, OAuth, cloud SDK)
- API version
- Async operations and polling patterns
- Error response format
- Resource states and readiness indicators
- Rate limits or quotas

## Step 3: Study similar existing integrations

Read 1-2 existing integrations matching the API style:
- **REST/JSON**: `src/neon/`, `src/netlify/`, `src/mongodb-atlas/`
- **Azure REST**: `src/azure-cosmosdb/`, `src/azure-postgresql/`
- **AWS SDK**: `src/aws-s3/`, `src/aws-rds/`
- **GCP SDK**: `src/gcp/`

For AWS/Azure/GCP, also read the builtin type definitions in `lib/src/builtins/` (e.g., `azure.d.ts`, `aws.d.ts`, `gcp.d.ts`).

## Step 4: Read project conventions

Skim these for any rules that affect the plan:
- `doc/entity-conventions.md` — reserved property names, naming rules
- `doc/scaffold.md` — canonical template
- `doc/common-issues.md` — known pitfalls

## Step 5: Produce the plan

Output a structured plan in this format. Save it to `src/<package>/PLAN.md` so `/entity-new` can read it:

```markdown
# <Provider> Integration Plan

## Overview
- **Module**: `src/<package>/`
- **MANIFEST REPO**: `<package>` (just the package name, NOT a full URL)
- **API base URL**: `https://...`
- **API version**: `v1` / `2024-01-01`
- **Auth**: Bearer token / API key / cloud SDK builtin
- **Default secret**: `<package>-api-token`

## Entities

### <EntityName>
- **File**: `<entity>.ts`
- **Class**: `<EntityClass>`
- **API endpoints**:
  - Create: `POST /path` → response shape
  - Read: `GET /path/{id}` → response shape
  - Update: `PUT/PATCH /path/{id}` → request shape
  - Delete: `DELETE /path/{id}`
  - List: `GET /path` (if needed for existence check)
- **Definition fields**: `name`, `region`, etc. (with types)
- **State fields**: `id`, `status`, etc.
- **Readiness**: poll `GET /path/{id}`, check `status === "active"`
- **Custom actions**: `get-info`, `list-items`, etc.
- **Cost estimation**: pricing API and usage metrics source for `get-cost-estimate` and `costs` actions (every billable entity needs both). See `doc/cost-estimation.md` for existing patterns per provider.
- **Notes**: any quirks, async patterns, reserved name conflicts

### <EntityName2>
...

## Implementation Order
1. `common.ts` + `<package>-base.ts`
2. Simplest entity first (e.g., Project)
3. Dependent entities next (e.g., Database depends on Project)

## Risks and Gotchas
- List any reserved property name conflicts (`description`, `type`, etc.)
- Async operations that need polling
- Global uniqueness constraints on names
- Rate limits or free tier restrictions for testing

## Test Plan
- Credentials needed (env vars)
- Expected test flow (create → ready → action → delete)
- Estimated readiness time per entity
- Any dependencies between test entities
```

After outputting the plan, tell the user they can:
1. Review and refine it in this conversation
2. Run `/entity-new` with a reference to the plan to implement it
