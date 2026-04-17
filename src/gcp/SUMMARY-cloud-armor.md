# GCP Cloud Armor — Implementation Summary

## Entities

| Entity | Actions | Description |
|--------|---------|-------------|
| `gcp/cloud-armor-security-policy` | get-info, list-rules, add-rule, update-rule, remove-rule, set-default-action, attach-backend-service, detach-backend-service, get-cost-estimate, costs | Global Cloud Armor security policy (type `CLOUD_ARMOR`) with inline rules, reconciliation via per-rule endpoints, and backend-service attach/detach |

## Files Created

- `src/gcp/cloud-armor-security-policy.ts` — entity implementation (~1050 lines)
- `src/gcp/test/stack-template-cloud-armor.yaml` — test stack with 3 rules + adaptive protection
- `src/gcp/test/stack-integration-cloud-armor.test.yaml` — 17 integration test steps
- `src/gcp/PLAN-cloud-armor.md` — design plan and issue log
- `src/gcp/SUMMARY-cloud-armor.md` — this file

## Files Modified

- `src/gcp/common.ts` — added `CLOUD_ARMOR_DEFAULT_PRIORITY` constant, `CloudArmorRuleAction`, `CloudArmorDdosProtection`, `CloudArmorJsonParsing`, `CloudArmorLogLevel` type aliases
- `src/gcp/README.md` — appended Cloud Armor section with example, actions table, permissions, and limitations

## Test Results

- **Manual**: full lifecycle verified against the live GCP API — create with 3 rules + default `deny(403)` → list-rules → add/update/remove rule → set-default-action → cost estimate ($9/month) → delete. Attach/detach-backend-service actions smoke-tested but not in automated suite (need a real backend service).
- **Integration (`monkec test`)**: 17/17 steps passed (214.86 s). Covers create, readiness, 8 action calls, 2 negative cases (rejecting default-priority for add/remove), cost estimation, delete.

## Issues Fixed During Development

- **MonkEC array flattening**: runtime exposes array-of-objects and nested arrays as indexed keys (e.g. `rules!0`, `src_ip_ranges!0`) rather than JS arrays. Added `collectArray<T>(obj, key)` helper and used it for every array field (`rules`, `src_ip_ranges`, `user_ip_request_headers`, `request_headers_to_add`).
- **Single-POST create was unreliable**: GCP would accept a policy POST with rules inline but silently drop them. Switched to a two-phase flow: POST empty shell → patchRule default → addRule per user rule.
- **Default rule action**: GCP auto-creates the default rule with action `allow`, not `deny(403)` as assumed. Removed the skip condition so `default_action` in the definition is always applied.
- **TS DeepReadonly mismatch**: `this.definition.rules` is `DeepReadonlyObject<CloudArmorRule>` and is not assignable to the mutable `CloudArmorRule` parameter of the encoders. Added targeted `as unknown as CloudArmorRule` casts at two call sites.
- **CEL region code validation**: `origin.region_code == 'XX'` is rejected by GCP because `XX` is not a valid country code. Changed the test rule to use `'CN'`.
- **MANIFEST LOAD order**: compiler emits modules in arbitrary order, often placing `gcp-base.yaml` / `common.yaml` / `iap-common.yaml` after entities that depend on them. Re-ordered manually after every compile.

## PR

- URL: _pending_
- Linear: _(not linked — no issue identified yet)_
