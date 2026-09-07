# RunPod `get-datacenter-availability` Action — Plan

Small addendum to the merged `runpod` package (see `PLAN.md`, `SUMMARY.md`). Adds one
read-only action exposing RunPod REST API v2's new capacity-discovery endpoints, so an
operator or automation can check real per-datacenter GPU/CPU stock before creating a pod
in a specific region — the signal that was missing when dynamic region selection was
discussed and deferred during the original implementation (see `PLAN.md`'s "Deferred
entity notes" / the cross-region example's handoff). The action lives on `RunpodTemplate`
specifically so it's queryable before any pod exists — see "Design decision" below.

## API detail (live-confirmed 2026-08-25)

- `GET /v2/catalog/gpus/{id}?include=AVAILABILITY&product=POD|CLUSTER|SERVERLESS&cloud=SECURE|COMMUNITY&count=<n>[&countryCodes=..]`
  → adds `dataCenters: [{id, name, availability: NONE|LOW|MEDIUM|HIGH}]` to the GPU object.
  `product` is **required** with `include=AVAILABILITY` (400 otherwise) — there's no
  default because the same GPU can be scarce for pods and plentiful for serverless.
- `GET /v2/catalog/cpus/{id}?include=AVAILABILITY&product=POD|CLUSTER|SERVERLESS` → same
  shape, confirmed live for `cpu3c` **at the time this was written.** Later finding
  (2026-08-31, see `PLAN-placement-resolver.md`): this endpoint reproducibly returns
  `"availability":"NONE"` with no `dataCenters` for every CPU flavor regardless of real
  stock — an upstream v2-beta bug, not volatility (GPU's equivalent endpoint is
  unaffected). `runpod-base.ts`'s `cpuAvailability()` no longer calls this endpoint; it
  derives the same shape from `catalogDatacenters(..., "CPU_AVAILABILITY")` instead. The
  `get-datacenter-availability` action's CPU branch picked up the fix automatically since
  it only calls the shared helper.
- `GET /v2/catalog/datacenters?include=GPU_AVAILABILITY|CPU_AVAILABILITY[&regions=&networkVolumeTypes=&compliance=&globalNetwork=]`
  → the inverse view, one datacenter per entry with its own `gpuAvailability`/`cpuAvailability`
  arrays. Confirmed live.
- Full spec: `https://api.runpod.io/v2/openapi.json` (fetchable unauthenticated).

## Design decision: host on `RunpodTemplate`, not `RunpodPod` or a new entity

MonkEC actions (`@action`) are dispatched on an already-loaded entity instance — there is
no "call an action with no entity" mode in this framework, and no precedent anywhere in
this repo for a stateless/catalog-only entity (checked: every `*-base.ts` in the repo
defines no `@action`s; every action lives on a concrete leaf entity). Per `PLAN.md`'s own
call: *"`/v2/catalog/*` ... are read-only data sources consumed by cost actions, not
managed resources"* — that verdict applies here too. So this is an action on an existing
entity, not a fourth `runpod-*` entity.

**Verified, not assumed:** `monk do` requires the target entity to already be in
**running** state before it will dispatch any action — confirmed by reading
`SearchEntityFromNS` in the monk daemon
(`/home/ivan/Work/monk/pkg/base/templates/entities.go:420-445`): it looks the entity up by
querying `descriptors.RunningEntity` in the namespace state and returns
`"{{entity}} not found in running state" … "entity may not be running or may have been
stopped"` if it isn't. There is no pre-create dispatch path. This directly decides where
the action can live, because the whole point is querying capacity **before** committing to
a pod:

**Rejected: `RunpodPod`.** A pod must already exist and be running before `get-info` or any
other action can be called on it (same running-state gate). Hosting the "should I create a
pod here?" query on the pod itself is backwards — it requires paying for and running a pod
just to ask whether a pod would fit. Also the entity most exposed to this: the very first
pod of a stack has nothing to query yet.

**Chosen: `RunpodTemplate`.** Non-billable (`PLAN.md`'s entity table), and already the
first entity created in the normal stack topology per `PLAN.md` Decision 2: *"a template
defines the container config ... a pod consumes both"* — so in the ordinary workflow a
running template instance already exists before any pod is created, at zero extra cost.
Calling `get-datacenter-availability` on it gives real pre-pod-creation data for free,
without inventing a fourth entity. Trade-off: `RunpodTemplateDefinition` has no
`gpu_type_id`/`cpu_flavor_id`/`cloud` fields to default from (unlike `RunpodPod`), so every
call passes those as explicit args — acceptable, since Definition defaults are a
convenience, not a requirement, and the action needs to work for any GPU/CPU type anyway,
not just whatever one pod happens to be configured with.

**Rejected: `RunpodNetworkVolume`.** Volumes only care about `networkVolumeTypes` per
datacenter (static, already visible via plain `catalog/datacenters`), not GPU/CPU stock.
Out of scope here.

**Shared logic goes in `runpod-base.ts`** as a protected helper (mirroring
`catalogGpus()`/`catalogGpu()`), not duplicated in `template.ts`, so `pod.ts` or
`network-volume.ts` can expose the same action later without re-deriving the HTTP call —
e.g. a running pod re-checking availability before a manual migration decision is a
legitimate later use of the same helper, just not the cold-start case this plan targets.

## Implementation

### `common.ts`

Add types (mirroring `CatalogGpu`/`CatalogCpu`):

```ts
export interface CatalogAvailability {
    id: string;
    name?: string;
    availability: "NONE" | "LOW" | "MEDIUM" | "HIGH";
}
```

`CatalogGpu`/`CatalogCpu` each get an optional `availability?: "NONE"|"LOW"|"MEDIUM"|"HIGH"`
and `dataCenters?: CatalogAvailability[]` field (present only when the caller passed
`include=AVAILABILITY`).

**Gotcha to fix while touching this file:** `listKeyForPath("/catalog/datacenters")`
computes `"datacenters"` (no hyphen to split on), but the real envelope key is
`"dataCenters"` (confirmed live: `{"dataCenters":[...]}`). If a future `datacenters`
list-helper uses the auto-derived key it will throw the "ambiguous list response" error
`extractList` raises for a mismatch, not silently misbehave — but it's still worth adding
an explicit case, the same way `catalogGpus()`/`catalogCpus()` already hardcode `"gpus"`/
`"cpus"` instead of trusting the auto-derived key.

### `runpod-base.ts`

```ts
/**
 * Per-datacenter stock for one GPU type, from `GET /v2/catalog/gpus/{id}?include=AVAILABILITY`.
 * Returns null on failure or on an unknown GPU type ID (404) so the caller can report
 * "unavailable" instead of crashing an inspection action.
 */
protected gpuAvailability(
    gpuTypeId: string,
    product: "POD" | "CLUSTER" | "SERVERLESS",
    cloud?: "SECURE" | "COMMUNITY",
    count?: number,
): CatalogGpu | null {
    try {
        const query: Record<string, string> = { include: "AVAILABILITY", product };
        if (cloud) query.cloud = cloud;
        if (count) query.count = String(count);
        return this.makeRequest("GET", `/catalog/gpus/${encodeURIComponent(gpuTypeId)}`, undefined, query) as CatalogGpu;
    } catch (error) {
        if (this.isNotFound(error)) return null;
        cli.output(`⚠️  Could not fetch GPU availability: ${(error as Error).message}`);
        return null;
    }
}

/** Same as gpuAvailability() but for a CPU flavor, via GET /v2/catalog/cpus/{id}. */
protected cpuAvailability(
    cpuFlavorId: string,
    product: "POD" | "CLUSTER" | "SERVERLESS",
): CatalogCpu | null {
    // mirrors gpuAvailability(), no cloud/count params (not accepted by CpuProductFilter)
}
```

`makeRequest` already accepts a `query` param (used today for `billingHistory`'s
`lastN`/`bucketSize`) — no signature change needed there.

### `template.ts`

```ts
@action("get-datacenter-availability")
getDatacenterAvailability(args?: Args): void {
    const gpuTypeId = args?.gpu_type_id;
    const cpuFlavorId = args?.cpu_flavor_id;
    const product = (args?.product as "POD" | "CLUSTER" | "SERVERLESS") || "POD";
    const cloud = args?.cloud as "SECURE" | "COMMUNITY" | undefined;
    const count = args?.count ? parseInt(args.count, 10) : undefined;

    if (!gpuTypeId && !cpuFlavorId) {
        throw new Error(
            "get-datacenter-availability needs a GPU or CPU type: pass gpu_type_id=... " +
            "or cpu_flavor_id=... as an action argument, e.g. " +
            "monk do <path>/get-datacenter-availability -- gpu_type_id=\"NVIDIA GeForce RTX 4090\""
        );
    }

    const result = gpuTypeId
        ? this.gpuAvailability(gpuTypeId, product, cloud, count)
        : this.cpuAvailability(cpuFlavorId!, product);

    if (!result) {
        cli.output(`No catalog entry found for ${gpuTypeId ?? cpuFlavorId} (product=${product}).`);
        return;
    }

    cli.output(`=== Datacenter Availability: ${result.name ?? result.id} (product=${product}) ===`);
    cli.output(`Overall: ${(result as any).availability ?? "unknown"}`);
    cli.output(`Snapshot only — not a reservation; stock can change before a pod create() actually lands.`);

    const dataCenters = (result as any).dataCenters as { id: string; name?: string; availability: string }[] | undefined;
    if (!dataCenters || dataCenters.length === 0) {
        cli.output("No datacenter breakdown returned (likely sold out everywhere in this context).");
        return;
    }
    const rank: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, NONE: 0 };
    const sorted = dataCenters.slice().sort((a, b) => (rank[b.availability] ?? -1) - (rank[a.availability] ?? -1));
    for (const dc of sorted) {
        cli.output(`  ${dc.id} — ${dc.availability}`);
    }
}
```

`.sort()` and `.slice()` on arrays have direct precedent elsewhere in this repo (e.g.
`aws-s3/bucket.ts:1281`, `aws-rds/instance.ts:669`) so they're safe in this runtime;
`String.prototype.padEnd` has zero precedent anywhere in `src/`, so the column output uses
plain `" — "` concatenation instead of padding, rather than relying on an unverified
runtime feature.

Output is human-readable only (`cli.output`), matching `get-info`/`get-console-url` — no
JSON twin, since (unlike `costs`) nothing downstream consumes this as a billing payload.

**Args accepted**, all via `Args` (`Record<string, string>` per `monkec/base.d.ts`, so
`count` arrives as a string and needs `parseInt`): `gpu_type_id` or `cpu_flavor_id` (one
required — no Definition field to default from on `RunpodTemplate`), `product` (default
`POD`), `cloud` (optional, no default — omitted from the query entirely when unset, which
the API defaults to `SECURE` per the spec), `count` (optional, API defaults to 1).

**Not adding:** `countryCodes` / `regions` filtering — no current use case needs it, and
per this repo's "don't add unrequested features" rule it's trivial to add later as one
more optional arg without touching the shape above.

## Risks and gotchas

- **v2 beta**: same accepted risk as the rest of the package (`PLAN.md` Decision 1) — the
  shape of `include=AVAILABILITY` could change before GA. Confined to `runpod-base.ts`
  like everything else.
- **`product` is mandatory with `include=AVAILABILITY`** — a 400 if omitted. The action
  must always send it (defaulted to `POD`), never leave it to the API's judgment.
- **Availability is a snapshot, not a reservation** — `HIGH` now doesn't guarantee a
  create() moments later succeeds. The action's output says this explicitly (see sketch
  above) so it isn't read as a capacity guarantee (mirrors the "RunPod GPU/CPU stock is
  genuinely volatile" note from the cross-region example's live testing).
- **This does not by itself implement dynamic region selection** — it's the read-only
  primitive. Wiring pod `create()` to try candidate `data_center_ids` in
  availability-ranked order is a separate, larger change (touches `pod.ts`'s create/adopt
  flow, and would need to read this data itself rather than via a `monk do` round-trip) and
  is explicitly out of scope for this plan.
- **`monk do` requires a running entity** (verified above) — the action is unusable until
  the template has actually been `monk run`. That's a one-time, non-billable cost, but it
  means "check availability with literally nothing deployed yet" still needs one running
  template instance, not zero infrastructure.

## Test plan

- Extend `test/stack-integration.test.yaml`: after the **template** entity is created and
  ready (before the pod step), run `get-datacenter-availability -- gpu_type_id="<test GPU
  type>"`. Assert the output contains the header line
  (`=== Datacenter Availability:`) and the command exits non-error — do **not** assert a
  non-empty datacenter list, since stock is volatile and the GPU can legitimately be sold
  out everywhere at test time (documented above); asserting on that would flake.
- Add a second call with `cpu_flavor_id="cpu3c"` instead, to exercise the CPU branch.
- Add a call with neither arg set, asserting it throws/errors with the "needs a GPU or CPU
  type" message, to cover the validation path.
- No new credentials or entities needed — reuses the existing `runpod-template` test
  fixture, called earlier in the sequence than it currently is (right after it's ready,
  rather than only being consumed by the pod's `template_id`).
- Manual test: `sudo monk do runpod-example/template-1/get-datacenter-availability -- gpu_type_id="NVIDIA GeForce RTX 4090"`
  against the live account (token already configured); cross-check the printed
  availability against the curl output already captured this session.
