# Clerk — Implementation Summary

## Entities

| Entity | Actions | Description |
|--------|---------|-------------|
| `clerk/credentials` | — | Validates API key, derives mode (test/live), exposes secret_ref |
| `clerk/organization` | get-info, get-cost-estimate, costs | CRUD for multi-tenant organizations |
| `clerk/jwt-template` | get-info | CRUD for custom JWT token templates |
| `clerk/domain` | get-info | CRUD for custom/satellite domains |
| `clerk/o-auth-application` | get-info, rotate-secret | CRUD for OAuth apps, stores client secret |

## Files Created
- `src/clerk/clerk-base.ts` — abstract base class with shared HTTP client and auth
- `src/clerk/credentials.ts` — credentials validation entity
- `src/clerk/organization.ts` — organization management entity
- `src/clerk/jwt-template.ts` — JWT template entity
- `src/clerk/domain.ts` — custom domain entity
- `src/clerk/oauth-application.ts` — OAuth application entity
- `src/clerk/MANIFEST` — package manifest
- `src/clerk/README.md` — documentation
- `src/clerk/example.yaml` — full stack example with consumer wiring
- `src/clerk/test/env.example` — test credentials template
- `src/clerk/test/stack-template.yaml` — test stack with 4 entities + consumer
- `src/clerk/test/stack-integration.test.yaml` — automated integration test

## Test Results
- Manual: 4/5 entities pass full lifecycle (organization requires Clerk dashboard feature flag)
- Integration: 10/10 steps passed (55s)

## Issues Fixed During Development
- Clerk API requires `claims` as a JSON object, not string — use `Record<string, any>`
- Clerk API requires `is_satellite` to be mandatory for domain creation
- GET `/domains/{id}` returns 405 — use list+filter approach
- Organization API requires feature to be enabled in Clerk dashboard
- Actions need `@action()` decorator with camelCase method names
- MANIFEST LOAD order must put `clerk-base.yaml` before dependent entities
- Organization slug comparison must guard against `undefined`
- Organization `POST /organizations` requires `created_by` (user ID) parameter

## PR
- URL: https://github.com/monk-io/monk-entities/pull/178
- Linear: ENG-149
