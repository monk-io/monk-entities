# RunPod Integration — Plan

Provider: [RunPod](https://runpod.io) — GPU cloud (persistent Pods, autoscaling Serverless
endpoints, network storage).

## Progress

- [x] Plan — approved 2026-08-17. Scope: `runpod-pod`, `runpod-network-volume`,
      `runpod-template` on REST API v2 (beta risk accepted).
      **Deferred to a later PR:** `runpod-serverless-endpoint`,
      `runpod-container-registry-auth`.
- [x] Implement — 3 entities, 8 files. `monkec compile` clean; `tsc --noEmit` reports 0 errors
      in `src/runpod/` (the single project-wide error is pre-existing in `hetzner-storage-box`).
- [x] Tests written — `test/stack-template.yaml`, `test/stack-integration.test.yaml`,
      `test/env.example`. 21 steps: template → volume → pod, cost actions, restart, stop,
      asserted teardown.
- [x] Manual testing — **passed against a live RunPod account.** All three entities created,
      exercised, and destroyed across several cycles; zero leaked resources. Found and fixed 19
      real defects (see "Findings from live API testing" below and `SUMMARY.md`).
- [ ] Integration tests — suite updated to match live reality; not yet run end to end
- [ ] PR
- [ ] Merged

---

## Decision 1: API version — REST API v2

| | v1 | v2 |
|---|---|---|
| Base URL | `https://rest.runpod.io/v1` | `https://api.runpod.io/v2` |
| Status | **maintenance mode**, deprecation announced | **public beta**, actively developed |
| Schema | flat camelCase (`imageName`, `gpuTypeIds`, `gpuCount`) | nested objects (`gpu:{id,count}`, `cpu:{id,vcpuCount}`, `scaling:{...}`) |
| Catalog | — | `GET /v2/catalog/gpus` with live `price:{secure,community,serverless}` |
| Billing | limited | `GET /v2/billing/{pods,serverless,network-volumes}` with bucketed history |

**Chosen: v2.** RunPod's own docs state verbatim: *"REST API v1 is in maintenance mode and is
no longer being actively developed. For new integrations, use REST API v2."*

**Accepted risk:** v2 carries the warning *"The REST API v2 is currently in beta. Endpoints and
behavior may change before general availability."* Mitigation — all paths, auth, and field
mapping are centralized in `runpod-base.ts`, so a breaking upstream change is a one-file fix
rather than a sweep across five entities.

Auth (confirmed from the OpenAPI `securitySchemes`): `Authorization: Bearer <api_key>`.
Default secret name: `runpod-api-token`.

## Decision 2: Entity scope — 3 entities (approved)

| Entity | Resource | Billable | Paths |
|---|---|---|---|
| `runpod/runpod-pod` | Persistent GPU/CPU instance | yes | `GET|POST /v2/pods`, `GET|PATCH|DELETE /v2/pods/{id}`, `POST /v2/pods/{id}/action` |
| `runpod/runpod-network-volume` | Persistent DC-scoped storage | yes | `GET|POST /v2/network-volumes`, `GET|PATCH|DELETE /v2/network-volumes/{id}` |
| `runpod/runpod-template` | Reusable Pod config | no | `GET|POST /v2/templates`, `GET|PATCH|DELETE /v2/templates/{id}` |

The three compose into one coherent stack: a **template** defines the container config, a
**network volume** provides persistent storage, and a **pod** consumes both.

**Deferred to a later PR** (explicitly out of scope here):

- `runpod-serverless-endpoint` — `/v2/serverless`. The largest single entity (discriminated
  `scaling` union, worker pools, `LOAD_BALANCER` ⇒ `REQUEST_COUNT` constraint) and the one most
  exposed to v2 beta churn. Research notes are preserved in "Deferred entity notes" below so a
  follow-up PR does not repeat the API archaeology.
- `runpod-container-registry-auth` — `/v2/registries`. Consequence for this PR: the pod's
  `registry_id` stays a plain optional string rather than a wired connection.

**Not entities:** `/v2/catalog/*` and `/v2/billing/*` are read-only data sources consumed by
the cost actions, not managed resources. `/v2/account/ssh-keys` is account-level config, out
of scope.

## Decision 3: Reserved-name mapping

RunPod v2 uses `type` as a field name in several places. Monk reserves `type` (`rules.md:27`),
so the Definition uses a prefixed name and `runpod-base.ts` translates on the way out:

| Definition (snake_case) | Request body (camelCase) | Values |
|---|---|---|
| `volume_type` | `type` | `STANDARD` \| `HIGH_PERFORMANCE` |
| `endpoint_type` *(deferred)* | `type` | `QUEUE` \| `LOAD_BALANCER` |
| `scaling_type` *(deferred)* | `scaling.type` | `QUEUE_DELAY` \| `REQUEST_COUNT` |

`description` is also reserved and is never used as a property name in any Definition or State.

## Decision 4: `runpod-base.ts` owns the mapping layer

v2 is nested camelCase; Monk Definitions are flat-ish snake_case. Rather than each entity
hand-rolling conversions, the base class provides:

- `RunPodEntity<D, S>` — HttpClient built in `before()` with `baseUrl`, Bearer header,
  `stringifyJson: true`
- `request<T>(method, path, body?)` — single call site; parses and surfaces `response.body` on
  non-2xx so capacity/quota errors are legible (`rules.md:49`)
- `toApi(obj)` / `fromApi(obj)` — snake_case ↔ camelCase, recursive, leaves `env` maps alone
- `catalogGpus()` / `billingFor(resource, opts)` — shared cost helpers
- `export { action } from "monkec/base"` (`rules.md:13`)

Nested objects (`gpu`, `cpu`, `scaling`, `env`, `mounts`) are passed as **objects**, never
manually stringified (`rules.md:37`).

## Entity detail

> ⚠️ The field lists below are the **as-built** definitions, corrected against the live API.
> The originally planned shapes (which included `interruptible`, `public_ip`, `port_mappings`,
> `machine_id`, `container_disk_in_gb`, `docker_entrypoint`, `is_serverless`, `readme`, and a
> `get-logs` action) were wrong — see "Findings from live API testing" for each correction.

### `runpod-pod`

Definition: `name`, `image`, `gpu_type_id` + `gpu_count` **or** `cpu_flavor_id` + `vcpu_count`,
`cloud`, `disk`, `args`, `ports[]`, `env{}`, `network_volume_id` + `network_volume_path`
**or** `persistent_disk_size` + `persistent_disk_path`, `template_id`, `registry_id`,
`data_center_ids[]`, `allowed_cuda_versions[]`, `min_cuda_version`, `start_jupyter`,
`start_ssh`, `locked`, `global_networking`, `secret_ref?`, `allow_destructive_delete?`.

State: `id`, `name`, `pod_status`, `ports[]`, `ssh_command`, `cost_per_hr`, `data_center`,
`available_actions[]`, `gpu_type_id`, `created_at`, `existing`.

Readiness: poll `GET /v2/pods/{id}` until status `RUNNING` **and**, when the definition asked
for ports, until `runtime.ports` is published — RUNNING arrives before the runtime block exists,
so a pod can be "running" with no ports and no SSH. Fail loudly on `ERROR`. GPU capacity is not
guaranteed, so `attempts` is generous (~60 × 10s).

Liveness deliberately does **not** delegate to readiness: a pod stopped on purpose is not dead,
so only a terminated or vanished pod is not live.

Update: `PATCH` handles `name`, `image`, `args`, `disk`, `ports`, `env`, `registry`,
`globalNetworking`, `locked`, `mounts`, `templateId`. GPU type, vCPU count, data center, and
volume attachment are **immutable** — the entity logs that they were ignored rather than
silently recreating a billable instance.

Actions: `restart`, `force-terminate`, `get-info`, `get-cost-estimate`, `costs`.

Power control rides Monk's **builtin** `start`/`stop` actions rather than custom ones —
`MonkEntity` dispatches those to the `start()`/`stop()` lifecycle hooks before consulting
registered `@action` methods (`src/monkec/base.ts:127-135`), so a custom `@action("start")`
would be shadowed. Both are status-guarded, and `start()` creates the pod if none exists (Monk
dispatches `start` on paths where `create()` never ran).

Delete is a **correctness requirement, not cleanup**: an un-terminated pod bills indefinitely,
and RunPod restarts a pod whose command exits. An adopted pod is therefore terminated only on
an explicit `allow_destructive_delete: true`; otherwise teardown prints an unmissable banner
naming the pod and its hourly rate, and `force-terminate` is the one-command escape hatch.

### `runpod-network-volume`

Definition: `name`, `size` (10–4096 GB), `data_center` (**required**), `volume_type?`,
`allow_destructive_delete?`.

State: `id`, `name`, `size`, `data_center`, `volume_type`, `existing`.

Update: `PATCH` accepts `name` and `size` only, and **size can only grow** — a shrink request
throws with a clear message rather than being silently dropped.

Not every data center offers network volumes, and those that do offer only certain tiers
(`networkVolumeTypes` per DC) — `EU-RO-1` is STANDARD-only, for example.

Actions: `get-info`, `get-cost-estimate`, `costs`.

### `runpod-template`

Reusable container config consumed by pods via `template_id`. Straightforward CRUD with a full
`PATCH`. Not billable — a template on its own costs nothing — so it gets **no** cost actions.

Definition: `name`, `image`, `disk`, `args`, `env{}`, `ports[]`, `registry`, `category`,
`persistent_disk_size` + `persistent_disk_path`, `allowed_cuda_versions[]`, `serverless`,
`public`, `start_jupyter`, `start_ssh`, `secret_ref?`.

`start_jupyter` and `start_ssh` default to **true** upstream for templates (false for pods).
Templates accept only a host-local persistent mount; a `network` mount is rejected.

State: `id`, `name`, `image`, `existing`.

Actions: `get-info`.

## Cost estimation

Live rates only — no hardcoded tables (`rules.md:176`). Applies to pod and network volume;
`runpod-template` is not billable.

| Entity | Rate source | Method |
|---|---|---|
| Pod | `cost` on the pod response — *"Current cost in USD per hour (0.0 when EXITED or TERMINATED)"*; `GET /v2/catalog/gpus` `price.{secure,community}` as cross-check | `cost × 730` for monthly; when stopped, use catalog rate and label it "if running" |
| Network volume | **No live rate exists** — verified: neither `NetworkVolume` nor `GET /v2/catalog/datacenters` returns a price | derive $/GB/mo from `GET /v2/billing/network-volumes?lastN=30&bucketSize=day`; if the volume is too new for history, emit `amount: "0"` with an `error` note per `rules.md:161` |

`costs` and `get-cost-estimate` share one private calculator per entity so the two cannot drift
(`rules.md:53`).

## Testing hazards (RunPod-specific)

1. **Real GPUs bill by the hour.** Integration tests default to a **CPU pod**
   (`cpu_flavor_id` + `vcpu_count`) — the cheapest thing that still exercises the full
   lifecycle. GPU coverage is one short-lived test on the cheapest catalog GPU.
2. **Teardown must be bulletproof.** A leaked pod bills until someone notices, and RunPod
   restarts a pod whose command exits — so a skipped terminate can also re-run the job. Delete
   is verified in the suite, tolerates an already-gone resource (404), and refuses to silently
   abandon an adopted pod (see the delete semantics under `runpod-pod` above).
3. **Never reuse a pod name across concurrent stacks.** Adoption matches on name, so a
   collision hands one stack a pod another stack owns — and teardown will then decline to
   terminate it. (There is no spot/`interruptible` option to worry about: v2 removed it.)
4. **Network volumes are datacenter-scoped.** A pod can only attach a volume in its own DC, so
   the test template pins `data_center_ids` to the volume's `data_center` explicitly instead of
   relying on `dataCenterPriority: availability`.
5. **Capacity is not guaranteed.** A create can fail purely because the requested GPU is sold
   out. The error body is surfaced verbatim so this is distinguishable from a real bug.
6. **Test template needs a `connections:` block** for volume → pod wiring, plus
   `services: { data: { protocol: custom } }` on the volume (`rules.md:52`).

## Findings from live API testing (Phase 4)

Every open item is now settled against the real API. The authoritative source turned out to be
the OpenAPI spec fetched to disk (`curl https://api.runpod.io/v2/openapi.json`) and read with a
script that resolves `allOf`/`$ref` chains — **summarized doc fetches were wrong on several
load-bearing details** and cost two failed create attempts.

### Corrections the live API forced

| Assumption | Reality |
|---|---|
| `POST /v2/pods/{id}/action` | **`/action`, singular** — the plural path 404s |
| Pod has `interruptible` (spot) | **Does not exist in v2 at all** (0 occurrences in the spec) — removed from the Definition |
| `locked` accepted at create | **PATCH-only.** `unevaluatedProperties: false` means sending it 422s the whole create |
| Volume attaches via `networkVolumeId` | **`mounts.network[]` = `{volumeId, path}`**, mutually exclusive with `mounts.persistent` = `{size, path}`; `path` has no default |
| Template takes `containerDiskInGb`, `volumeInGb`, `dockerEntrypoint`, `readme` | None exist. Template = `BaseContainerConfig` (`args`/`disk`/`env`/`image`/`ports`) + `registry`, `category`, `mounts.persistent`, `serverless`, `public`, `startJupyter`, `startSsh` |
| `startJupyter`/`startSsh` default false | **Default true on templates**, false on pods |
| List envelopes are `data`/`items` | Named per resource: `pods`, `networkVolumes`, `templates`, `gpus`, `cpus`, `dataCenters`, `records`. Handled generically by `extractList()` taking the first array-valued property |
| Billing records carry `cost`/`amount` | **`totalAmount`**, plus per-component fields. One record *per resource per bucket*, so bucket count ≠ record count |
| Pod exposes `publicIp`, `portMappings`, `machineId` | **None exist in v2** — those were v1. Connection info is `runtime.ports[]` (`{ip,private,public,type}`) and `ssh.direct.command`; placement is the singular `dataCenterId` |
| GPU catalog `maxCount` is a number | Object: `{secure, community}` |
| CPU flavor IDs look like `cpu3c-2-4` | Short group names: `cpu3c`, `cpu3g`, `cpu3m`, `cpu5c`, `cpu5g`, `cpu5m`. `vcpuCount` ≥ 2 and must be a power of two |
| CPU priced per instance | **Per vCPU** (`securePerVcpu`) — the count is a multiplier, unlike GPUs whose price is already per unit |

### Behaviors worth knowing

- **`status: RUNNING` does not mean reachable.** A pod reports RUNNING while `runtime` is still
  `null` — no ports, no SSH. Readiness therefore also waits for `runtime.ports` whenever the
  definition asked for ports (a port-less pod has no runtime block to wait for).
- **`get-logs` is impossible with monkec's HttpClient.** `GET /v2/pods/{id}/logs` is a
  **Server-Sent Events** stream that never closes; the action hung until killed. Removed rather
  than shipped — the flagged "a green `exitCode: 0` is not proof" turned out to be the real bug.
- **Not every data center offers network volumes**, and those that do offer only certain tiers
  (`networkVolumeTypes` per DC). `EU-RO-1` is STANDARD-only, so the original example pairing it
  with `HIGH_PERFORMANCE` would have been rejected.
- Pod responses advertise `actions: ["stop","restart","terminate"]` — the currently-valid
  transitions, surfaced as `state.available_actions`.
- Status enum confirmed exactly as planned: `PROVISIONING | STARTING | RUNNING | EXITED | ERROR
  | TERMINATED`, in the field `status`.

### Verified working end to end

Real resources created and destroyed against a live account:

- `runpod-template` → `rba9ofnwlr`; `get-info` returns the full object
- `runpod-network-volume` → `86f7bj3hfm` (10 GB STANDARD, EU-RO-1); both cost actions degrade
  gracefully to `amount: "0"` + `error` on a volume with no billing history, exactly as designed
- `runpod-pod` → CPU pod, `RUNNING`, **volume mounted at `/runpod-volume` via the
  `connection-target` wiring**, billing `$0.06/hr` — matching the catalog prediction exactly
  (`cpu3c` at $0.03/vCPU × 2 vCPU). `costs` → `$43.80/mo`, `get-cost-estimate` agrees, sourced
  from the live `cost` field
- `restart` → HTTP 200, `startedAt` advanced
- `delete` → pod terminated, billing stopped

## Blockers before Phase 4

1. **`monk` is not in `$PATH`** — need the binary path.
2. **API key secret** — `sudo monk secrets add -g runpod-api-token=<key>`.

---

## Deferred entity notes

Research already done for the two out-of-scope entities, kept so a follow-up PR does not repeat
the API archaeology. Verified against `https://api.runpod.io/v2/openapi.json`.

### `runpod-serverless-endpoint` — `/v2/serverless`

Paths: `GET|POST /v2/serverless`, `GET|PATCH|DELETE /v2/serverless/{id}`,
`GET /v2/serverless/{id}/workers`, `/releases`, `/logs`.

Create body — required: `name`, `type` (`QUEUE` | `LOAD_BALANCER`), `scaling`; plus `image`
unless `templateId` is given. Optional: `args`, `disk` (≥1 GB), `env{}`, `ports[]`, `registry`,
`templateId`, `gpu`, `cpu[]`, `workers`, `dataCenterIds[]`, `networkVolumes[]`, `timeout`,
`flashboot`, `allowedCudaVersions[]`.

`scaling` is a discriminated union:
- `{type: "QUEUE_DELAY", queueDelay: number ≥ 0.5}`
- `{type: "REQUEST_COUNT", requestCount: integer ≥ 1}`

Constraint: `LOAD_BALANCER` **requires** `REQUEST_COUNT`. Validate in `create()` before the call.

Spec defaults: `workers {min: 0, max: 3, idleTimeout: 10}`, `timeout 300000` ms,
`flashboot "OFF"`.

Response adds `requestUrls` (the composition handle) and `createdAt`. Worker status enum:
`RUNNING | IDLE | INITIALIZING | THROTTLED | UNHEALTHY`.

Readiness must **not** wait for a live worker — `workers.min: 0` means zero workers at create
time is the correct steady state.

Cost: `GET /v2/catalog/gpus` `price.serverless` × `workers.min` gives the floor;
`GET /v2/billing/serverless?lastN=30&bucketSize=day` gives actuals. A fixed estimate alone
would mislead, because scale-to-zero means the floor is often $0.

Naming: needs `endpoint_type` and `scaling_type` per the reserved-name table above.

### `runpod-container-registry-auth` — `/v2/registries`

Paths: `GET|POST /v2/registries`, `DELETE /v2/registries/{id}`. **No `PATCH`** — a credential
change is delete + recreate, and the entity should say so rather than silently no-op. Reads the
registry password from a `*_secret_ref`; writes no secret back. Not billable.
