# Clerk Integration Plan

## Overview
Clerk is an authentication and user management platform. This integration provides entities for managing Clerk resources via the Backend API.

## API Details
- **Base URL**: `https://api.clerk.com/v1`
- **Auth**: Bearer token with secret key (`sk_test_*` / `sk_live_*`)
- **Style**: JSON REST, all synchronous
- **Rate limits**: 1000 req/10s (prod), 100 req/10s (dev)

## Entities

| Entity | Resource | CRUD | Actions |
|--------|----------|------|---------|
| `clerk/credentials` | Instance | Read | - |
| `clerk/organization` | Organizations | Full | get-info, get-cost-estimate, costs |
| `clerk/jwt-template` | JWT Templates | Full | get-info |
| `clerk/domain` | Domains | Full | get-info |
| `clerk/o-auth-application` | OAuth Apps | Full | get-info, rotate-secret |

## Design Decisions
- Credentials pattern mirrors Stripe — validates key, derives mode, exposes secret_ref
- All entities check for existing resources before creating (idempotent)
- Organization entity has cost actions (Clerk bills per MAU)
- OAuth application stores client secret in monk secrets
- No user entity (app-managed data, not infrastructure)
- No webhook entity (configured via dashboard, not REST API)
- Domain entity uses list+filter for get-info (GET /domains/{id} returns 405)

## Progress

- [x] Plan — approved 2026-03-30
- [x] Implement — 5 entities, 11 files, compiled clean
- [x] Tests — 10 test steps covering full lifecycle
- [x] Manual testing — 4 entities pass create/ready/actions/delete (org requires feature flag)
- [x] Integration tests — 10/10 passed (55s)
- [ ] PR
- [ ] Merged

## Issues Found

- Clerk API requires `claims` as a JSON object, not string — use `Record<string, any>` in definition
- Clerk API requires `is_satellite` to be mandatory when creating domains
- GET `/domains/{id}` returns 405 — use list+filter approach instead
- Organization API requires feature to be enabled in Clerk dashboard
- Actions need `@action()` decorator with camelCase method names (not quoted kebab-case)
- Compiler generates `clerk/o-auth-application` from `OAuthApplication` class name (kebab-case)
