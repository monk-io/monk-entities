# GCP Cloud Armor — Plan

Adds one entity to the existing `src/gcp/` package: a global Cloud Armor security policy (`type=CLOUD_ARMOR`) with inline rules, a default-rule override, and a backend-service attach/detach action.

Out of scope: edge policies (`CLOUD_ARMOR_EDGE`), regional policies, network edge (`CLOUD_ARMOR_NETWORK`), preconfigured WAF rule helpers, Adaptive Protection tuning beyond simple enable/disable.

## Entity

| Entity | Description |
|--------|-------------|
| `gcp/cloud-armor-security-policy` | Global Cloud Armor security policy with inline rules + attach-to-backend-service action |

## API

- **Base URL:** `https://compute.googleapis.com/compute/v1` (existing `COMPUTE_API_URL`)
- **Auth:** GCP builtin (`gcp.get`/`.post`/`.patch`/`.delete` via `GcpEntity` base)
- **Policy CRUD** (all on `/projects/{project}/global/securityPolicies[/{name}]`):
  - Create: `POST` — body `{name, description?, type:"CLOUD_ARMOR", rules:[...], adaptiveProtectionConfig?, ddosProtectionConfig?, advancedOptionsConfig?}` → returns Operation
  - Get: `GET /{name}`
  - List: `GET`
  - Patch: `PATCH /{name}` — requires `fingerprint`; use only for top-level config fields (NOT rules)
  - Delete: `DELETE /{name}` → Operation
- **Rule ops** (sub-resources on the policy):
  - `POST /{name}/addRule` — body is a SecurityPolicyRule
  - `GET /{name}/getRule?priority={p}`
  - `POST /{name}/patchRule?priority={p}` — body is partial SecurityPolicyRule
  - `POST /{name}/removeRule?priority={p}`
  - Per-rule endpoints do NOT require fingerprint — preferred for rule reconciliation.
- **Attach to backend service:**
  - `POST /projects/{project}/global/backendServices/{be}/setSecurityPolicy` — body `{securityPolicy: "<self_link>"}` (empty string to detach) → Operation
- **Async:** every mutation returns a compute Operation; poll `GET /projects/{project}/global/operations/{opName}` until `status="DONE"`. Same pattern used by `cloud-cdn-backend-service`.

> **patchRule verb uncertainty**: the Python discovery doc uses `POST .../patchRule?priority=`. The HTML reference page implies `PATCH` — historically both have existed. **Implementation will try `POST` first** (what gcloud + client libs use) and fall back to `PATCH` if a 405 comes back. This will be verified in manual testing.

## Definition shape

```ts
interface Rule {
  priority: number;            // 0..2147483646
  action: RuleAction;          // "allow" | "deny(403)" | "deny(404)" | "deny(502)" | "throttle" | "rate_based_ban" | "redirect"
  src_ip_ranges?: string[];    // if set → match.versionedExpr=SRC_IPS_V1
  match_expression?: string;   // CEL expression; mutually exclusive with src_ip_ranges
  rule_description?: string;   // avoids reserved `description`
  preview?: boolean;           // log-only
  rate_limit?: RateLimitOptions;
  redirect?: RedirectOptions;
  header_action?: { request_headers_to_add: Array<{name: string, value: string}> };
}

interface CloudArmorSecurityPolicyDefinition extends GcpEntityDefinition {
  name: string;                        // RFC1035
  policy_description?: string;         // maps to policy.description (avoids reserved word)
  default_action?: "allow" | "deny(403)" | "deny(404)" | "deny(502)";  // default "deny(403)"
  rules?: Rule[];                      // user rules (priority != 2147483647)
  adaptive_protection?: boolean;       // enables layer7DdosDefenseConfig
  ddos_protection?: "STANDARD" | "ADVANCED";   // "ADVANCED" = Enterprise tier
  advanced_options?: {
    json_parsing?: "DISABLED" | "STANDARD" | "STANDARD_WITH_GRAPHQL";
    log_level?: "NORMAL" | "VERBOSE";
    user_ip_request_headers?: string[];
  };
}
```

Why renamed fields: `description` and `type` are reserved in the MonkEC/JSON-schema layer (per `doc/common-issues.md`). We map `policy_description` → policy.`description` and `rule_description` → rule.`description` internally. The policy `type` is always `CLOUD_ARMOR` and not user-configurable.

## State shape

```ts
interface CloudArmorSecurityPolicyState extends GcpEntityState {
  id?: string;              // numeric resource ID
  self_link?: string;       // full URL — used by attach action + for backend-service wiring
  fingerprint?: string;     // refreshed before every PATCH
  attached_backends?: string[]; // self-links of backend services we attached (for costing visibility; not for cleanup)
}
```

## Lifecycle

- **create()**: Call `getPolicy()`. If exists → adopt (set `existing=true`, populate state). If not → POST policy with `rules=[...userRules, defaultRule(default_action, priority=2147483647)]` in one shot. Wait for op. Re-GET, populate state.
- **update()**: 
  1. GET current policy → refresh `fingerprint` and current rule list.
  2. If any top-level config changed (`policy_description`, `adaptive_protection`, `ddos_protection`, `advanced_options`) → PATCH with `updateMask` listing only changed paths.
  3. If `default_action` changed → `patchRule?priority=2147483647` with `{action: ...}`.
  4. Reconcile user rules by priority key:
     - declared ∖ existing → `addRule`
     - existing ∖ declared (skipping 2147483647) → `removeRule`
     - priority in both but content differs → `patchRule`
  5. Operations from per-rule endpoints are waited on sequentially (fast, <10s each).
- **delete()**: If `existing=true` → skip. Else DELETE policy, wait for op. If Cloud Armor rejects with FAILED_PRECONDITION (still attached to a backend service), surface a clear error instructing the user to detach first via the action or out-of-band.
- **checkReadiness()**: GET → true if found.

## Rule encoding

```
user Rule → API SecurityPolicyRule:
  priority, action, description<-rule_description, preview
  if src_ip_ranges:
    match = { versionedExpr: "SRC_IPS_V1", config: { srcIpRanges: [...] } }
  else if match_expression:
    match = { expr: { expression: "..." } }
  else (e.g. default rule):
    match = { versionedExpr: "SRC_IPS_V1", config: { srcIpRanges: ["*"] } }
  rateLimitOptions, redirectOptions, headerAction mapped from snake_case
```

Comparison for "content differs" uses a canonical JSON stringify of the above encoded form, ignoring irrelevant server-added fields (kind, etc.).

## Actions

| Action | Purpose |
|--------|---------|
| `get-info` | Dump full policy JSON (GET) |
| `list-rules` | Pretty-print rules sorted by priority, including default |
| `add-rule` | args: priority, action, src_ip_ranges OR match_expression, rule_description?, preview? — calls addRule |
| `update-rule` | args: priority + any mutable fields — calls patchRule |
| `remove-rule` | args: priority (rejects 2147483647) |
| `set-default-action` | args: action — patchRule on 2147483647 |
| `attach-backend-service` | args: backend_service (name or self_link); resolves to full URL, calls setSecurityPolicy, appends to state.attached_backends |
| `detach-backend-service` | args: backend_service — calls setSecurityPolicy with empty string |
| `get-cost-estimate` | Human-readable cost breakdown |
| `costs` | JSON `{type, costs:{month:{amount,currency}}}` for billing |

## Required permissions

Single `roles/compute.securityAdmin` grants everything needed. For a principle-of-least-privilege custom role, the required IAM permissions are:

```
compute.securityPolicies.create
compute.securityPolicies.get
compute.securityPolicies.list
compute.securityPolicies.update
compute.securityPolicies.delete
compute.securityPolicies.use
compute.securityPolicies.addRule
compute.securityPolicies.getRule
compute.securityPolicies.patchRule
compute.securityPolicies.removeRule
compute.backendServices.get
compute.backendServices.setSecurityPolicy
compute.globalOperations.get
# for cost estimation:
monitoring.timeSeries.list
cloudbilling.services.list
```

## Cost estimation

**Public pricing (Cloud Armor Standard, early 2026):**
- Policy: ~$5/month (per policy, prorated by hour)
- Rule: ~$1/month/rule
- Requests: $0.75/1M (global)

**Implementation:**
- `get-cost-estimate` / `costs` compute: `policies=1, rules=declared.length+1 (default)`, then multiply by published monthly rates.
- Attempt to fetch live pricing from Cloud Billing Catalog API (`GET /v1/services`) by searching for service with `displayName` containing "Cloud Armor". Fall back to published rates on failure (same pattern as `cloud-cdn-backend-service`).
- Request volume: try `loadbalancing.googleapis.com/https/backend_request_count` filtered by any attached backend services. If none attached or metric unavailable, report 0 requests and note limitation.

## Known gotchas

- **Fingerprint required on PATCH** — always GET before PATCH; 412 on stale fingerprint.
- **Priority 2147483647 is reserved** — default rule, cannot be deleted, can only be `patchRule`'d.
- **`type` is immutable** — we hardcode `CLOUD_ARMOR`.
- **Detach uses `{securityPolicy: ""}`** — not DELETE on backend.
- **Adaptive Protection requires Enterprise tier** — setting `adaptive_protection=true` on a Standard project is accepted but ML features stay inactive. Surface a warning, don't fail.
- **Can't delete policy while attached** — surface `FAILED_PRECONDITION` clearly.
- **Reserved property names** — `description` and `type` are JSON-schema reserved (see common-issues.md). Use `policy_description`, `rule_description`; don't expose `type` at all.
- **Per-rule endpoints avoid fingerprint** — prefer them over policy-level PATCH for rule edits.

## Test plan

**Credentials**: GCP service account configured via `sudo monk cluster provider add -p gcp`. No extra secrets beyond standard GCP creds.

**Test flow:**
1. Create policy `monk-test-ca-policy` with 2 rules (priority 1000 deny CIDR, priority 2000 allow CIDR) + `default_action=deny(403)`.
2. `checkReadiness` → ready.
3. `list-rules` → expect 3 rules (1000, 2000, 2147483647).
4. `add-rule` priority=500 allow → `list-rules` shows 4.
5. `update-rule` priority=1000 → preview=true → `get-info` confirms.
6. `set-default-action` → "deny(404)" → confirm.
7. `remove-rule` priority=500 → `list-rules` shows 3.
8. `update()` via redeployment (e.g., add a 3rd rule in template) → reconciliation adds it.
9. Delete entity → policy removed from GCP console.

**Not tested in automated suite** (requires pre-existing backend service):
- `attach-backend-service` / `detach-backend-service`

Covered manually by creating a throwaway backend service via gcloud, attaching, detaching, and cleaning up.

**Expected readiness time:** policy CRUD 5–15s per operation; rule ops <10s each. Total lifecycle ~2 min.

## Files

- `src/gcp/cloud-armor-security-policy.ts` — entity class
- `src/gcp/common.ts` — extend with `CloudArmorRuleAction` type and maybe `CLOUD_ARMOR_DEFAULT_PRIORITY=2147483647` constant
- `src/gcp/test/stack-template-cloud-armor.yaml` — test stack
- `src/gcp/test/stack-integration-cloud-armor.test.yaml` — integration test
- `src/gcp/README.md` — append Cloud Armor section

No `MANIFEST` change (entity auto-registers via compile); no `build.sh` change (the `gcp` package is already built).

## Progress

- [x] Plan — approved 2026-04-17
- [x] Implement — 1 entity (10 actions), common.ts extended, compiled clean (37 entities), MANIFEST LOAD order fixed, README updated
- [x] Tests — stack-template-cloud-armor.yaml + stack-integration-cloud-armor.test.yaml; 15 test steps covering lifecycle, 8 actions, 2 negative cases, cost estimation
- [x] Manual testing — full lifecycle passes: create (3 rules + default-action=deny(403)) → list-rules → add-rule 500 → update-rule 1000 preview → set-default-action deny(404) → remove-rule 500 → get-cost-estimate ($9/month) → costs JSON → delete
- [x] Integration tests — 17/17 steps passed (214.86s) via `./monkec.sh test --test-file stack-integration-cloud-armor.test.yaml`
- [ ] PR
- [ ] Merged

## Issues Found

- TS type-checking error: `DeepReadonlyObject<CloudArmorRule>` (framework wraps `this.definition`) is not assignable where mutable `CloudArmorRule` is expected (rule map insertion, `buildPolicyBody` mapping). Fixed with `as unknown as CloudArmorRule` casts at the two call sites. Accepting looser input types in `encodeRule` was rejected because downstream `string[]` field assignments conflict with `DeepReadonlyArray<string>`.
- Compiler-generated `MANIFEST` LOAD order placed `gcp-base.yaml`, `common.yaml`, `iap-common.yaml` in arbitrary positions among entity YAMLs. Reordered manually so base/common modules come first. Must be re-fixed after every recompile.
- **MonkEC array flattening** (major issue) — The runtime exposes YAML array-of-objects fields as indexed top-level keys `name!0`, `name!1` instead of a JS array on the parent object. This affects both `rules: Rule[]` (top level) and `src_ip_ranges: string[]` / `user_ip_request_headers: string[]` / `request_headers_to_add: Header[]` (nested). Plain scalar fields and nested scalar objects are fine. Added `collectArray<T>(obj, key)` helper that returns the array from either the proper `obj[key]` or the reconstructed `obj[key!0..N]`. This may also affect other gcp entities (`cloud-cdn-backend-service.backends`, `cloud-dns-zone.networks`) whose array paths are never exercised in tests — left them alone for now.
- **GCP creates default rule as `allow`, not `deny(403)`** — Initial code skipped the `patchRule` call when `default_action` matched my hardcoded assumption of "deny(403)". Removed the skip: always patch the default rule to whatever the user declared so final state is deterministic.
- **Single-POST with rules path is broken** — Initially my `create()` POSTed the policy with all rules and default inline; GCP accepted the policy but silently dropped the user rules (only the default survived). Switched to two-phase: POST without rules → patchRule default → addRule per user rule. This matches gcloud's behavior and reliably produces the declared rule set.
- **CEL region code validation** — Cloud Armor rejects CEL expressions with invalid 2-letter region codes; changed test rule from `origin.region_code == 'XX'` to `'CN'` (GCP-valid).
