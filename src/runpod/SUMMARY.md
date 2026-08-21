# RunPod — Implementation Summary

GPU cloud entities for the Monk platform, built on RunPod **REST API v2**
(`https://api.runpod.io/v2`, Bearer auth, default secret `runpod-api-token`).

## Entities

| Entity | Actions | Description |
|--------|---------|-------------|
| `runpod/runpod-pod` | `restart`, `get-info`, `get-console-url`, `get-cost-estimate`, `costs` (+ `start`/`stop` via Monk builtins) | Persistent GPU or CPU container instance. Billed hourly while running. |
| `runpod/runpod-network-volume` | `get-info`, `get-cost-estimate`, `costs` | Persistent, data-center-scoped storage that survives pod termination. |
| `runpod/runpod-template` | `get-info` | Reusable container configuration. Not billable, so no cost actions. |

Pod power control rides Monk's **builtin** `start`/`stop` actions rather than custom ones:
`MonkEntity` dispatches builtins to the `start()`/`stop()` lifecycle hooks *before* consulting
registered `@action` methods (`src/monkec/base.ts:127-135`), so a custom `@action("start")`
would be silently shadowed. Both overrides are status-guarded.

**Deferred to a later PR:** `runpod-serverless-endpoint` and `runpod-container-registry-auth`.
Research for both is preserved in `PLAN.md` → "Deferred entity notes".

## Files Created

- `src/runpod/common.ts` — base URL, secret helper, `toApiBody()` snake→camel mapper,
  `extractList()` envelope unwrapper, catalog types, size validation
- `src/runpod/runpod-base.ts` — `RunpodEntity<D,S>`: HttpClient, error-surfacing `makeRequest()`,
  adoption/delete helpers, catalog + billing helpers for the cost actions
- `src/runpod/pod.ts` — `RunpodPod`
- `src/runpod/network-volume.ts` — `RunpodNetworkVolume`
- `src/runpod/template.ts` — `RunpodTemplate`
- `src/runpod/MANIFEST`, `README.md`, `example.yaml`, `PLAN.md`
- `src/runpod/test/stack-template.yaml`, `test/stack-integration.test.yaml`, `test/env.example`

**Modified:** `build.sh` (module list), root `MANIFEST` (`dist/runpod`), and
`src/monkec/http-client.ts` — see "Shared infrastructure fix" below.

## Test Results

**Manual (Phase 4) — passed against a live RunPod account.** Real resources created,
exercised, and destroyed:

| Resource | ID | Result |
|---|---|---|
| Template | `rba9ofnwlr` | created; `get-info` returned the full object |
| Network volume | `86f7bj3hfm` | 10 GB STANDARD in EU-RO-1; both cost actions degraded gracefully to `amount: "0"` + `error` (no billing history yet), as designed |
| CPU pod | `fto3o8y1r77snf` | `RUNNING`; volume mounted at `/runpod-volume` through the `connection-target` wiring; `$0.06/hr` — exactly the catalog prediction (`cpu3c` @ $0.03/vCPU × 2 vCPU); `costs` → `$43.80/mo`; `restart` → 200 with `startedAt` advanced; `monk stop` → `EXITED` |

Lifecycle hooks: `stop` → pod `EXITED`; `start` dispatched by `monk run` on a stopped instance,
with the guard correctly attempting a start on the `EXITED` pod.

Readiness convergence was watched directly: the runtime published ports ~5s after create, state
then filled with `ports` (http 19123→60566, tcp 22→49221) and
`ssh_command: ssh root@213.173.111.110 -p 49221`, and `monk ps` flipped to Ready/Live true.

**Post-teardown audit: 0 pods, 0 volumes, 0 templates left on the account — no leaked billable
resources.**

**One operational limit found:** starting a stopped pod can fail with
`400 "There are not enough free vcpu on the host machine to start this pod."` A stopped pod stays
bound to its host, so stop/start is opportunistic cost saving, not a reliable pause button —
documented in the README.

**Not covered:** no **GPU** pod was provisioned (CPU only, deliberately, to keep test cost near
zero), so GPU capacity handling and the GPU catalog rate path are exercised only through the
cost-action fallback logic, not a live GPU create. `update()` / `PATCH` was likewise never
triggered, since the definition hash never changed between runs.

Compile clean (3 entities, 2 modules); `tsc --noEmit` reports 0 errors in `src/runpod/`.

**Shared `http-client.ts` change:** both branches are runtime-exercised through RunPod (bodyless
GET/DELETE and body-carrying POST/PATCH all succeeded). A second provider could **not** be
runtime-tested — `runpod-api-token` is the only credential configured in this cluster. What was
verified instead: `cloudflare` recompiles cleanly (14 entities) and packages consume the client
via `require("monkec/http-client")` rather than bundling it, so the fix reaches them through
`dist/monkec`.

**Integration (Phase 5):** suite updated to match live reality; not yet run end to end.

## Shared infrastructure fix

`src/monkec/http-client.ts` always included `body` in the object handed to the `http` builtin,
even when `prepareBody()` had returned `undefined` to mean "send nothing". The Goja runtime
marshals `body: undefined` into the **literal string `"undefined"`**, so every bodyless GET and
DELETE sent a 9-byte body. Lenient APIs ignore it; RunPod's spec validator rejects it outright
(`422 "GET request body for '/v2/templates' is not declared"`), and `http-client.ts` explicitly
sets `body = undefined` for DELETE, so no caller-side workaround existed. The fix omits the key
when undefined — a latent bug affecting every package, not a RunPod workaround.

## Issues Fixed During Development

Doc-summary fetches were wrong on several load-bearing details; the authoritative source was the
OpenAPI spec fetched to disk and read with a script that resolves `allOf`/`$ref` chains.

1. **`monkec/http-client` sent `"undefined"` as a body** on bodyless GET/DELETE — see above.
2. **Pod action path is `/v2/pods/{id}/action`, singular** — the plural `/actions` 404s.
3. **`interruptible` (spot) does not exist in v2** — zero occurrences in the spec. Removed from
   the Definition, README, and test plan.
4. **`locked` is PATCH-only** — `unevaluatedProperties: false` means sending it at create 422s
   the entire request.
5. **Volumes attach via `mounts.network[] = {volumeId, path}`**, not a flat `networkVolumeId`;
   mutually exclusive with `mounts.persistent = {size, path}`, and `path` has no default.
6. **`mounts` must not be treated as an opaque map.** It was in `OPAQUE_KEYS`, so its nested
   `volume_id` was never camelCased → `422 additional properties 'volume_id' not allowed`.
7. **Template schema was largely invented** — no `containerDiskInGb`, `volumeInGb`,
   `dockerEntrypoint`, or `readme`. Rewrote against `CreateTemplateRequest`; `startJupyter` and
   `startSsh` default **true** on templates.
8. **List envelopes are per-resource** (`pods`, `networkVolumes`, `templates`, `gpus`, `cpus`,
   `dataCenters`, `records`) — replaced guessed key probing with `extractList()`.
9. **Billing records use `totalAmount`**, not `cost`/`amount`, and there is one record *per
   resource per bucket* — so bucket count ≠ record count. Added `countBillingBuckets()`.
10. **Pod state fields `publicIp`/`portMappings`/`machineId` don't exist in v2** (they were v1),
    so three advertised composition handles would have stayed permanently empty. Replaced with
    `runtime.ports[]`, `ssh.direct.command`, and the singular `dataCenterId`.
11. **`status: RUNNING` does not mean reachable** — a pod reports RUNNING while `runtime` is
    still `null` (no ports, no SSH). Readiness now also waits for `runtime.ports` when the
    definition requested ports.
12. **`cost` is not 0 on a stopped pod**, despite the spec saying "0.0 when EXITED or
    TERMINATED" — a live EXITED pod still reported `0.06`. The "would bill at" caveat is now
    keyed off `status`, not off `cost` being zero, so a stopped pod isn't reported as billing.
13. **`get-logs` is not implementable** with monkec's HttpClient: `GET /v2/pods/{id}/logs` is a
    Server-Sent Events stream that never closes, and the action hung until killed. Removed
    rather than shipped.
14. **Catalog IDs**: CPU flavors are short group names (`cpu3c`), not size-suffixed slugs;
    `vcpuCount` ≥ 2 and must be a power of two; CPU is priced **per vCPU**, so the count is a
    multiplier (unlike GPUs, already per unit).
15. **Not every data center offers network volumes**, and those that do offer only certain tiers
    — `EU-RO-1` is STANDARD-only, so the original example pairing it with `HIGH_PERFORMANCE`
    would have been rejected.
16. **Entity names come from class names** via camel→kebab: `RunPodPod` compiled to
    `run-pod-pod`, so classes are spelled `RunpodPod`/`RunpodNetworkVolume`/`RunpodTemplate`.
17. **Invalid image tags** — `runpod/base:0.4.0-cpu` and the shortened pytorch tag don't exist.
    Verified real tags from `GET /v2/catalog/templates`.
18. **`start()` was a silent no-op on a real lifecycle path.** Monk dispatches the builtin
    `start` where `create()` has not run (`monk run` against an instance it already considers
    created, e.g. one left `stopped`). The hook printed "Pod not created yet", monk reported
    "✔ Started", and **no pod existed**. `start()` now creates if missing, mirroring `update()`.
19. **`monk start` is not a CLI verb** and `start` is not callable via `monk do` ("Not found
    action start") — the builtin is dispatched only by the lifecycle, via `monk run`. Worth
    knowing before trying to test it.

## Workflow gotchas worth remembering

- **A failed or existing entity instance keeps its old compiled code and definition.**
  `monk load dist/<pkg>/MANIFEST` is not enough after a recompile — `monk delete --force` the
  instance first, or you will debug an error that no longer exists in the source. This cost
  several confusing cycles where the request body kept showing fields already deleted.
- **`monkec compile` never cleans `OUTPUT_DIR`**, so a renamed class leaves stale artifacts that
  get merged into the MANIFEST. `rm -rf dist/<pkg>` before recompiling.
- **The MANIFEST `LOAD` order must be re-fixed after every compile** (base/common last by
  default) — `rules.md` rule 13.
- Reading the OpenAPI spec locally with an `allOf`/`$ref`-resolving script beat every
  summarized doc fetch, and would have prevented most of the defects above.

## PR

- URL: not yet created (work is uncommitted; belongs on a `feat/runpod-entities` branch —
  the working tree is currently on `feat/mongodb-atlas-ip-access-list`)
- Linear: none linked
