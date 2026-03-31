# WorkOS Entity Integration Plan

## Overview
WorkOS is a B2B identity platform (SSO, Directory Sync, User Management, RBAC). REST API at `https://api.workos.com`, Bearer token auth, JSON bodies, cursor-based pagination.

## Entities

| Entity | Actions | Description |
|--------|---------|-------------|
| `workos/credentials` | — | Validates API key, exposes mode (test/production) |
| `workos/organization` | get-info, get-cost-estimate, costs | B2B multi-tenant organizations |
| `workos/connection` | get-info, get-cost-estimate, costs | SSO connections (adopt-only) |
| `workos/role` | get-info | RBAC roles with permissions |
| `workos/user` | get-info | User management |

## API Details
- Base URL: `https://api.workos.com`
- Auth: `Authorization: Bearer sk_test_...` or `sk_production_...`
- Pagination: cursor-based (`limit`, `before`, `after`)
- Error format: `{ message, code, errors[] }`
- Rate limit: 600 req/min per API key

## Design Decisions
- Modeled after clerk integration (closest analog)
- `connection_provider` instead of `type` (reserved word)
- `role_description` instead of `description` (reserved word)
- User search by email (exact match filter available)
- Connection is adopt-only (WorkOS API does not support creating SSO connections)
- Roles use `/authorization/roles` API with slug-based identification and PATCH for updates
- Permissions set separately via `PUT /authorization/roles/{slug}/permissions`

## Progress

- [x] Plan — approved 2026-03-31
- [x] Implement — 5 entities, 10 files, compiled clean
- [x] Tests — 19 test steps covering full lifecycle + actions
- [x] Manual testing — all entities pass create/ready/actions/delete
- [x] Integration tests — 19/19 passed (27s)
- [ ] PR
- [ ] Merged

## Issues Found

- `POST /connections` returns 404 — connections can only be created via WorkOS Dashboard/Admin Portal, not API
- `POST /roles` returns 404 — correct path is `POST /authorization/roles`
- Roles identified by slug in URL, not ID; update uses PATCH not PUT
- Permissions must be set separately via `PUT /authorization/roles/{slug}/permissions`
