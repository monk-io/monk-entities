# RunPod `runpod-placement` Entity — Plan

Addendum to the merged `runpod` package (`PLAN.md`, `SUMMARY.md`) and last week's
`PLAN-datacenter-availability.md` addition. Adds a **new entity** — `runpod/runpod-placement`
— whose sole job is to resolve "which datacenter has real stock for what I need" once, at
create time, and expose the answer in `state` for `runpod-network-volume` and `runpod-pod`
to consume via the standard `connection-target(...) entity-state get-member(...)` wiring
this repo already uses everywhere else.

## Motivation

`POST /v2/pods`'s `dataCenterIds` is documented as *"Preferred data centers for placement.
Omit or pass an empty array to let the scheduler choose"* — so a **pod with no volume**
already supports "don't pick a region for me" today, no new code needed.

The gap is volume-backed pods: `CreateNetworkVolumeRequest.dataCenter` is **required** and
immutable (confirmed in the spec — no auto-pick), and the volume must exist before the pod,
so its datacenter is a one-shot, unfixable choice made with no pod-level stock signal. This
was flagged and explicitly deferred in the original `PLAN.md` ("a cheap probe pod doesn't
reliably predict GPU availability... volumes can't be attached to a pod after creation").
Last week's `get-datacenter-availability` action removed the missing signal
(`PLAN-datacenter-availability.md`); this plan turns that signal into an upstream entity
so the choice is made once, correctly, before anything immutable is created.

## Design: a fourth entity, not logic bolted onto the volume

Discussed and rejected: adding a "resolve my own datacenter" hint field directly to
`RunpodNetworkVolume`. Rejected because it only helps the volume — a pod-only stack that
still wants a *visible, inspectable* choice (rather than RunPod's opaque scheduler pick)
gets nothing, and keeping already-shipped, tested CRUD entities untouched is safer than
extending them. A separate entity's `state.data_center` can feed **both**
`runpod-network-volume.data_center` and `runpod-pod.data_center_ids` from one source,
keeping them consistent by construction instead of the current test template's manual
"pod copies the volume's chosen DC" pattern.

**This does not contradict last week's "don't add a fourth entity" call** on
`get-datacenter-availability` — that was a stateless *inspection* action with no decision
to remember. This entity's whole purpose is to make one decision and freeze it in `state`,
which is exactly what `connection-target(...) entity-state get-member(...)` wiring is for
in this codebase (see `template_id` → pod, `network_volume_id`/`data_center` → pod).

**Verified this wiring pattern already works for a *required* target field**, not just
optional ones (every existing `runpod-pod`/`runpod-network-volume` field wired from a
connection is `?`-optional; `runpod-network-volume.data_center` will be the first required
one in this package). Precedent: `src/neon/branch.ts:14` — `project_id: string` (required,
no `?`) — is wired in `src/neon/test/stack-template.yaml:20` via exactly
`<- connection-target("project") entity-state get-member("id")` plus `depends.wait-for`,
already shipped and tested. No new risk here.

## Precedent check: virtual entity, no remote resource

Searched the repo for a "create() computes from read-only API calls, delete() is a no-op"
entity shape before committing to it. Findings:
- `src/monkec/base.ts:328` — `delete()` defaults to a no-op if never overridden.
- **Closest precedent**: `src/stripe/credentials.ts`, `src/clerk/credentials.ts`,
  `src/workos/credentials.ts`. Each does a real read-only `GET` in `create()` purely to
  validate a key and populate `state`, `update()` just re-runs `create()`, and `delete()`
  is `cli.output("<Provider> credentials entity has no remote resources to delete")` —
  no HTTP call. `checkReadiness()` is `Boolean(this.state?.<field>)`.
- No entity in the repo does exactly "resolve once and freeze" — the credentials trio
  re-validates on every `update()`, which is safe for them (no downstream immutable
  resource depends on the exact value staying constant) and **wrong for this entity**
  (a volume created against a resolved datacenter cannot move, so re-resolving on update
  would silently orphan the decision a volume already committed to). `update()` here
  deliberately deviates from the credentials pattern: it must be a no-op once resolved.

## API detail (live-confirmed 2026-08-25/26)

- `GET /v2/catalog/gpus/{id}?include=AVAILABILITY&product=...&cloud=...&count=...` and the
  CPU equivalent — already implemented as `gpuAvailability()`/`cpuAvailability()` in
  `runpod-base.ts` (last week's addition). Reused as-is, no changes needed.
- `GET /v2/catalog/datacenters?networkVolumeTypes=STANDARD` (no `include`) — live-confirmed
  to return the plain datacenter list filtered by volume-tier support, independent of any
  GPU/CPU context: 18 datacenters currently support `STANDARD` (`AP-JP-1`, `CA-MTL-3/4`,
  `EU-NL-1`, `EU-RO-1`, `EUR-IS-1/3/4/5`, `EUR-NO-1`, `US-CO-1`, `US-IL-1`, `US-KS-2`,
  `US-MO-2`, `US-NC-2`, `US-NE-1`, `US-TX-3`, `US-WA-1`). This is the join key for
  volume-tier compatibility — a **separate call**, not a parameter on the GPU/CPU
  availability endpoints.
- **Checked and rejected using `/catalog/datacenters?include=GPU_AVAILABILITY` directly**
  for the volume-tier join: live-verified today that its (undocumented) default context
  exactly matches `product=POD&cloud=SECURE&count=1` on the per-GPU endpoint — but that
  match is not part of the documented contract, and the endpoint accepts no
  `product`/`cloud`/`count` parameters at all. Relying on an unstated default to save one
  HTTP call is a bad trade against correctness for `cloud=COMMUNITY` or `count>1` requests.
  **Decision: always do the two-call client-side join** (scoped GPU/CPU availability +
  plain datacenter list filtered by `networkVolumeTypes`), never the combined-include
  shortcut. **This holds for GPU.** For CPU, see the next point — the situation inverted
  during implementation.
- **Not adding**: `CpuVCPUCountFilter` (`vcpuCount`, must be a power of two) exists on
  `/catalog/cpus` but `cpuAvailability()` doesn't expose it yet. Out of scope here — vCPU
  count doesn't meaningfully change the capacity signal for the flavors this package
  targets. Add it to `cpuAvailability()` later if a real case needs it.

**Update from implementation (2026-08-31): `cpuAvailability()` no longer calls the
per-flavor endpoint.** Live-confirmed reproducibly during manual testing:
`GET /v2/catalog/cpus/{id}?include=AVAILABILITY&product=POD` returns
`"availability":"NONE"` with no `dataCenters` for **every** CPU flavor, while
`GET /v2/catalog/datacenters?include=CPU_AVAILABILITY` shows real, non-empty stock for the
same flavors at the same moment (reproduced three times; `vcpuCount` doesn't fix it; GPU's
equivalent endpoints still agree perfectly, checked side by side). This is an upstream
v2-beta bug in the CPU per-flavor endpoint specifically, not a request-construction issue
or stock volatility. `cpuAvailability()` was rewritten to derive its result from
`catalogDatacenters(undefined, undefined, "CPU_AVAILABILITY")` instead — the very endpoint
this section argued against relying on for GPU, now the *only* correct source for CPU. The
"don't rely on an undocumented default" argument above still holds for GPU (kept on the
per-flavor endpoint, unaffected); it doesn't apply to CPU because the alternative source
(the per-flavor endpoint) is outright wrong there, not merely relying on an implicit
default. `gpuAvailability()` is untouched.

## Entity: `RunpodPlacement`

- **File**: `src/runpod/placement.ts`
- **Class**: `RunpodPlacement`
- **Compiles to**: `runpod/runpod-placement`
- **No remote resource, no cost actions** — same rationale as `RunpodTemplate` ("config
  only and cost nothing on its own"): this entity costs nothing and creates nothing
  billable, it only reads the catalog.

### Definition

```ts
export interface RunpodPlacementDefinition extends RunpodEntityDefinition {
    /** GPU catalog ID to resolve placement for, e.g. `NVIDIA GeForce RTX 4090`. Exactly one of gpu_type_id/cpu_flavor_id is required. */
    gpu_type_id?: string;
    /** CPU flavor ID to resolve placement for, e.g. `cpu3c`. Exactly one of gpu_type_id/cpu_flavor_id is required. */
    cpu_flavor_id?: string;
    /** Availability product context. Defaults to POD. */
    product?: "POD" | "CLUSTER" | "SERVERLESS";
    /** Cloud tier for the availability query. Omitted lets the API default to SECURE. Ignored for CPU (not accepted by the CPU availability filter). */
    cloud?: "SECURE" | "COMMUNITY";
    /** GPU count for the availability query. Omitted lets the API default to 1. Ignored for CPU. */
    count?: number;
    /** When set, only datacenters supporting this network volume tier are considered — set this whenever the resolved datacenter will host a network volume. */
    volume_type?: "STANDARD" | "HIGH_PERFORMANCE";
    /** Optional allow-list. When set, only these datacenters are considered (still ranked by live availability, never assumed available). */
    candidate_data_center_ids?: string[];
}
```

No `name` field, unlike the other three entities — there is nothing to adopt by name (no
remote resource), so it would exist purely for log cosmetics. `getEntityName()` returns
`` `RunPod placement (${gpu_type_id ?? cpu_flavor_id ?? "unresolved"})` `` instead.

### State

```ts
export interface RunpodPlacementState extends RunpodEntityState {
    /** Resolved datacenter ID. Wire runpod-network-volume's data_center and runpod-pod's data_center_ids from this. */
    data_center?: string;
    data_center_name?: string;
    /** The resolved datacenter's stock level for the requested resource. Never NONE — a NONE-only result set fails create() instead of being chosen. */
    availability?: "LOW" | "MEDIUM" | "HIGH";
    /** Every candidate considered, ranked, for get-info visibility and debugging. */
    candidates?: { id: string; name?: string; availability: "NONE" | "LOW" | "MEDIUM" | "HIGH" }[];
}
```

### Lifecycle

```ts
override create(): void {
    if (this.state.data_center) {
        cli.output(`Placement already resolved to ${this.state.data_center}; resolution is frozen once made.`);
        return;
    }

    const gpuTypeId = this.definition.gpu_type_id;
    const cpuFlavorId = this.definition.cpu_flavor_id;
    if (!gpuTypeId && !cpuFlavorId) {
        throw new Error("runpod-placement needs exactly one of gpu_type_id or cpu_flavor_id.");
    }

    const product = this.definition.product || "POD";
    const result = gpuTypeId
        ? this.gpuAvailability(gpuTypeId, product, this.definition.cloud, this.definition.count)
        : this.cpuAvailability(cpuFlavorId!, product);
    if (!result) {
        throw new Error(`No catalog entry found for ${gpuTypeId ?? cpuFlavorId} (product=${product}).`);
    }

    let candidates = (result.dataCenters ?? []).slice();

    if (this.definition.volume_type) {
        const compatible = this.catalogDatacenters(this.definition.volume_type);
        const compatibleIds = new Set(compatible.map((dc) => dc.id));
        candidates = candidates.filter((c) => compatibleIds.has(c.id));
    }
    if (this.definition.candidate_data_center_ids?.length) {
        const allow = new Set(this.definition.candidate_data_center_ids);
        candidates = candidates.filter((c) => allow.has(c.id));
    }

    const ranked = rankByAvailability(candidates).filter((c) => c.availability !== "NONE");
    this.state.candidates = ranked;

    if (ranked.length === 0) {
        throw new Error(
            `No datacenter has ${gpuTypeId ?? cpuFlavorId} available` +
            (this.definition.volume_type ? ` with ${this.definition.volume_type} volume support` : "") +
            (this.definition.candidate_data_center_ids ? ` within [${this.definition.candidate_data_center_ids.join(", ")}]` : "") +
            ". Try again later, widen candidate_data_center_ids, or drop volume_type."
        );
    }

    const chosen = ranked[0];
    this.state.data_center = chosen.id;
    this.state.data_center_name = chosen.name;
    this.state.availability = chosen.availability;
    cli.output(`✅ Resolved placement: ${chosen.id} (${chosen.availability})`);
}

override update(): void {
    if (this.state.data_center) {
        cli.output(
            `Placement already resolved to ${this.state.data_center}; definition changes are ignored. ` +
            `Delete and recreate this entity to re-resolve.`
        );
        return;
    }
    this.create();
}

override delete(): void {
    cli.output("RunPod placement entity has no remote resources to delete; clearing resolution.");
    this.state.data_center = undefined;
    this.state.data_center_name = undefined;
    this.state.availability = undefined;
    this.state.candidates = undefined;
}

override checkReadiness(): boolean {
    return Boolean(this.state.data_center);
}
```

### Action

```ts
@action("get-info")
getInfo(_args?: Args): void {
    if (!this.state.data_center) {
        cli.output("Placement not resolved yet");
        return;
    }
    cli.output(`=== Placement ===`);
    cli.output(`Resolved: ${this.state.data_center} (${this.state.data_center_name ?? ""}) — ${this.state.availability}`);
    cli.output("Candidates considered:");
    for (const c of this.state.candidates ?? []) {
        cli.output(`  ${c.id} — ${c.availability}`);
    }
}
```

Unlike every other `get-info` in this package, this one reads local `state` only — there
is no remote resource to re-fetch from. Worth a one-line doc comment on the method saying
so, since it looks unusual next to `template.ts`/`pod.ts`'s `get-info`.

## Shared changes (`common.ts`, `runpod-base.ts`)

- **`common.ts`**: add `CatalogDatacenter` interface mirroring the `DataCenter` API schema
  (`id`, `name`, `region`, `globalNetwork`, `networkVolumeTypes`, `compliance`,
  `gpuAvailability?`, `cpuAvailability?` — both `CatalogAvailability[]`, reusing the type
  added last week). Add exported `rankByAvailability<T extends { availability: string }>(list: T[]): T[]`
  — extracts the `HIGH/MEDIUM/LOW/NONE` sort currently inlined in
  `template.ts`'s `getDatacenterAvailability()`, so both call sites share one
  implementation instead of two copies of the same rank table.
- **`runpod-base.ts`**: add `protected catalogDatacenters(networkVolumeTypes?: VolumeType, regions?: string[]): CatalogDatacenter[]`
  — `GET /catalog/datacenters` with those as query params when set. **Must hardcode
  `extractList(response, "dataCenters")`**, not `listKeyForPath("/catalog/datacenters")` —
  this is the exact mismatch flagged and left unfixed in `PLAN-datacenter-availability.md`
  (`listKeyForPath` computes `"datacenters"`, the real key is `"dataCenters"`); this is the
  first code path that actually calls it, so fix it here rather than leaving a second
  latent trap. Same try/catch-and-log-null-on-failure shape as `catalogGpus()`.
- **`template.ts`**: update `getDatacenterAvailability()` to call the new
  `rankByAvailability()` helper instead of its inlined sort — pure dedup, no behavior
  change.

## What does NOT change

`pod.ts` and `network-volume.ts` need **zero code changes**. Their existing fields already
support this:
- `runpod-network-volume.data_center: string` ← `<- connection-target("placement") entity-state get-member("data_center")`
- `runpod-pod.data_center_ids?: string[]` ← `data_center_ids: [<- connection-target("placement") entity-state get-member("data_center")]`

This is purely additive at the template-wiring level, which is the strongest argument for
this design over bolting logic into `RunpodNetworkVolume`.

## Registration

`runpod` is already a registered package in `build.sh` and the root `MANIFEST` (one
directory, `dist/runpod/`, already holds all of this package's compiled entities) — adding
`placement.ts` needs **no changes to `build.sh` or the root `MANIFEST`**, only a recompile.
`dist/runpod/MANIFEST`'s internal `LOAD` line is regenerated by `monkec compile`; re-check
load order per the usual post-compile step (base/common before entities).

## Risks and gotchas

- **Idempotency is the load-bearing property.** If `create()` ever re-resolved on a
  redeploy, a stack with an already-created volume in `EU-RO-1` could get a placement
  entity that decides `US-TX-3` is now better and hand that to a *new* pod, while the
  volume is stuck in `EU-RO-1` — silently breaking the pairing. `update()` must stay a
  strict no-op once `state.data_center` is set; there is no server-side guard against this
  the way RunPod's own API rejects an immutable field change, so it's enforced purely in
  our own code and worth a test asserting update-after-resolve doesn't change `state`.
- **Availability is a snapshot, and for CPU the gap is not a narrow race — it can be a
  systemic, simultaneous mismatch.** Live-confirmed 2026-08-31 during integration testing:
  `cpu3c` catalog availability read `HIGH` in `EU-RO-1`, `US-KS-2`, `US-MD-1`, `US-MO-1`,
  and `US-MO-2` at once, yet a **hand-built `POST /v2/pods` request bypassing this
  package's code entirely** was rejected with *"There are no longer any instances
  available"* in **all four datacenters tested** (`EU-RO-1`, `US-KS-2`, `US-MD-1`,
  `US-MO-1`; `US-MO-2` untested but same pattern expected) — a 100% catalog/reality
  mismatch across every CPU candidate simultaneously, not one unlucky datacenter losing
  stock between resolution and creation. The same account successfully created CPU pods
  in `EU-RO-1` and `EUR-IS-1` earlier the same session, ruling out an account-level or
  billing block — this is RunPod's v2-beta CPU catalog being untrustworthy as a *creation*
  signal, on top of the separate per-flavor-endpoint bug fixed above. **This bounds what
  `runpod-placement` can promise for CPU**: a resolved datacenter is the *best available
  candidate by the catalog's own account*, not a guarantee that `runpod-pod`'s subsequent
  `create()` will succeed there. GPU availability has not shown this failure mode (the
  per-flavor and datacenters-view endpoints agree for GPU, unlike CPU) but has not been
  creation-tested to the same depth either — treat the same caveat as provisional for GPU
  until it is.
- **Empty result is a real outcome, not a bug** — all candidates filtered out (by
  volume-tier or allow-list) or all `NONE` is expected occasionally, not a defect. The
  error message must show which constraints emptied the list, per the sketch above.
- **This still doesn't handle a GPU that becomes unavailable between placement resolution
  and pod creation.** Retrying pod creation against a second-choice datacenter is a
  separate, larger feature (would need the pod to consult `state.candidates`, not just
  `state.data_center`) and is out of scope for this plan.

## Test plan

**Do not touch the existing `stack-template.yaml`/`stack-integration.test.yaml` chain.**
Availability is a live snapshot (see Risks above) — wiring the already-green, 28-step,
real-billable-resource suite's `test-volume`/`test-pod` onto a live catalog resolution
would put a nondeterministic dependency on the critical path of a suite that fail-fasts
(a single failed step already skips everything after it, as seen when the stale
`get-console-url` assertion aborted 6 steps early). A bad catalog snapshot at test time
must not be able to burn the existing suite.

Instead, add a **new, independent test pair** — the convention this repo already uses for
a separate integration within one package (`entity-write-tests`'s feature-prefixed pairs):
`test/placement-template.yaml` + `test/placement-integration.test.yaml`.

- `placement-template.yaml`: `test-placement` (`cpu_flavor_id: cpu3c`,
  `volume_type: STANDARD`, matching the existing suite's own flavor/tier so the resolution
  space is one already known to be broad — 18 datacenters support `STANDARD`), plus a
  `test-volume`/`test-pod` pair wired from it via
  `<- connection-target("placement") entity-state get-member("data_center")` and
  `depends.wait-for` — this is the real composition proof the feature exists for, isolated
  so its live-data dependency can't affect the other suite's pass/fail.
- Integration test steps: create placement → wait ready → `get-info` (assert it prints a
  resolved datacenter from the confirmed-`STANDARD`-capable set) → create volume → create
  pod (both wired from placement) → assert both land in the same datacenter placement
  resolved to → normal teardown (pod → volume → placement → template, reverse dependency
  order).
- New step: call `update` on the placement entity after it's resolved, then `describe` it,
  asserting `state.data_center` is unchanged — covers the freeze guarantee directly.
- New step (separate, isolated instance in the same file): a placement definition with an
  unsatisfiable `candidate_data_center_ids` (e.g., a real DC ID known not to support the
  requested resource) asserting `create()` fails with the "no datacenter has..." message.
  No volume/pod needed for this instance — a failed `create()` proves the validation path.
