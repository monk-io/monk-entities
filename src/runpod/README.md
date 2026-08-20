# RunPod

Monk entities for managing [RunPod](https://runpod.io) GPU cloud resources — persistent pods,
network volumes, and reusable templates.

## Entities

| Entity | Description | Billable |
|--------|-------------|----------|
| `runpod/runpod-pod` | Persistent GPU or CPU container instance | yes — hourly while running |
| `runpod/runpod-network-volume` | Persistent storage, mountable by pods in the same data center | yes — per GB/month |
| `runpod/runpod-template` | Reusable container configuration | no |

## API version

This package targets **REST API v2** (`https://api.runpod.io/v2`). RunPod's documentation
states that *"REST API v1 is in maintenance mode and is no longer being actively developed.
For new integrations, use REST API v2."*

v2 is in public beta — *"endpoints and behavior may change before general availability."* All
paths, auth, and field-name mapping are centralized in `runpod-base.ts` and `common.ts`, so an
upstream change is a one-file fix.

## Prerequisites

A RunPod API key, created in the RunPod console under **Settings → API Keys**, stored as a
Monk secret:

```bash
sudo monk secrets add -g runpod-api-token=<your-api-key>
```

All entities default to the secret name `runpod-api-token`; override per instance with
`secret_ref`.

## Required Permissions

RunPod does not offer scoped or read-only API keys — a key grants full read/write access to
the account. The API calls these entities make are:

| Entity | Calls |
|--------|-------|
| `runpod-pod` | `GET/POST /v2/pods`, `GET/PATCH/DELETE /v2/pods/{id}`, `POST /v2/pods/{id}/action`, `GET /v2/catalog/gpus`, `GET /v2/catalog/cpus`, `GET /v2/billing/pods` |
| `runpod-network-volume` | `GET/POST /v2/network-volumes`, `GET/PATCH/DELETE /v2/network-volumes/{id}`, `GET /v2/billing/network-volumes` |
| `runpod-template` | `GET/POST /v2/templates`, `GET/PATCH/DELETE /v2/templates/{id}` |

The `catalog` and `billing` reads exist only to serve the cost actions.

## `runpod-pod` Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Pod name; also used to adopt a pre-existing pod |
| `image` | string | yes* | Container image. \*Optional if `template_id` is set |
| `gpu_type_id` | string | yes* | GPU catalog ID from `GET /v2/catalog/gpus`. \*Required for GPU pods. **Immutable** |
| `gpu_count` | number | no | GPUs to attach (minimum 1, default 1) |
| `cpu_flavor_id` | string | yes* | CPU flavor ID from `GET /v2/catalog/cpus`, e.g. `cpu3c`. \*Required for CPU pods. **Immutable** |
| `vcpu_count` | number | yes* | \*Required with `cpu_flavor_id`. Minimum 2, must be a power of two. **Immutable** |
| `cloud` | `SECURE` \| `COMMUNITY` | no | Cloud tier; defaults to SECURE (RunPod-owned hardware) |
| `disk` | number | no | Ephemeral container disk in GB; wiped on restart |
| `args` | string | no | Container entrypoint arguments |
| `ports` | string[] | no | `port/protocol`, e.g. `["8888/http", "22/tcp"]` |
| `env` | map | no | Environment variables. **Readable via the API — see the secrets warning below** |
| `network_volume_id` | string | no | Volume to mount; must live in one of `data_center_ids`. **Immutable** |
| `network_volume_path` | string | no | Mount path for the volume; defaults to `/runpod-volume` |
| `persistent_disk_size` | number | no | Host-local disk in GB (min 10). Mutually exclusive with `network_volume_id`; rejected on CPU pods |
| `persistent_disk_path` | string | no | Mount path for the host-local disk; defaults to `/workspace` |
| `template_id` | string | no | Template to inherit container config from |
| `registry_id` | string | no | Container registry credential ID for private images |
| `data_center_ids` | string[] | no | Preferred data centers |
| `allowed_cuda_versions` | string[] | no | e.g. `["12.8"]`. CPU pods ignore this |
| `min_cuda_version` | string | no | Minimum CUDA version as `major.minor` |
| `start_jupyter` | boolean | no | Inject a generated `JUPYTER_PASSWORD`; expose `8888/http` to reach it |
| `start_ssh` | boolean | no | Inject `PUBLIC_KEY` from the account's SSH keys; needs `22/tcp` |
| `locked` | boolean | no | Prevent stop/reset. **Applied on update only** — RunPod rejects it at create time |
| `global_networking` | boolean | no | Limited availability |
| `secret_ref` | string | no | Defaults to `runpod-api-token` |
| `allow_destructive_delete` | boolean | no | Set `false` to make `delete()` refuse. Defaults to true |

Exactly one of `gpu_type_id` or `cpu_flavor_id` must be set — the API accepts one compute
family, never both. There is **no spot/interruptible option**: v2 dropped it entirely, so
every pod runs on reserved capacity.

**Storage is one mount kind per pod.** `network_volume_id` (durable, survives termination,
data-center scoped) and `persistent_disk_size` (host-local, lost with the host, disallowed on
CPU pods) are mutually exclusive — RunPod rejects a pod that requests both.

`PATCH` only accepts `name`, `image`, `args`, `disk`, `ports`, `env`, `registry`, `locked`,
`global_networking`, and `template_id`. Changes to GPU type, vCPU count, data center, or
volume attachment are **logged and ignored** rather than triggering a destroy-and-recreate of
a billable instance.

## `runpod-network-volume` Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Volume name; also used for adoption |
| `size` | number | yes | 10–4096 GB. Can grow, never shrink |
| `data_center` | string | yes | Data center ID. **Immutable** |
| `volume_type` | `STANDARD` \| `HIGH_PERFORMANCE` | no | Omit for the data center default |
| `secret_ref` | string | no | Defaults to `runpod-api-token` |
| `allow_destructive_delete` | boolean | no | Set `false` to protect the data. Defaults to true |

A shrink request throws rather than being silently dropped. Volumes are **data-center scoped**:
a pod can only mount a volume located in its own data center.

## `runpod-template` Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Template name; also used for adoption |
| `image` | string | yes | Container image |
| `disk` | number | no | Ephemeral container disk in GB |
| `args` | string | no | Container entrypoint arguments |
| `env` | map | no | Environment variables. **Readable via the API — see the secrets warning below** |
| `ports` | string[] | no | `port/protocol` |
| `registry` | string | no | Container registry credential ID for private images |
| `category` | `CPU` \| `NVIDIA` \| `AMD` | no | Console grouping only; no effect on hardware or billing. Defaults to NVIDIA |
| `persistent_disk_size` | number | no | Host-local persistent storage in GB (min 10). Requires `persistent_disk_path` |
| `persistent_disk_path` | string | no | Mount path, e.g. `/workspace`. Required alongside the size — there is no default |
| `allowed_cuda_versions` | string[] | no | e.g. `["12.8"]`. CPU pods ignore this |
| `serverless` | boolean | no | Mark as a serverless template rather than a pod template |
| `public` | boolean | no | Publish the template publicly |
| `start_jupyter` | boolean | no | Inject a generated `JUPYTER_PASSWORD`. **RunPod defaults this to true** for templates |
| `start_ssh` | boolean | no | Inject `PUBLIC_KEY` from the account's SSH keys. **RunPod defaults this to true** |
| `secret_ref` | string | no | Defaults to `runpod-api-token` |

Templates accept only a **host-local** persistent mount — a network volume is attached on the
pod, not the template, and passing one here is rejected. `persistent_disk_size` and
`persistent_disk_path` must be given together; a partial mount is rejected.


## Do not put secrets in `env`

**RunPod returns `env` in full from `GET /v2/pods/{id}` and `GET /v2/templates/{id}`.** Anything
placed there is readable by every holder of the RunPod API key — and RunPod has no scoped or
read-only keys, so that is everyone with any access to the account. It is also persisted in the
template or pod object rather than being consumed once at boot.

Concretely, `env` is the wrong place for R2/S3 credentials, registry passwords, dataset tokens,
or checkpoint-bucket keys, even though it is the most convenient place to put them. Options that
do not expose the value through the API:

- Mount credentials from a **network volume** the job reads at startup, keeping them out of the
  pod and template objects entirely.
- Use `registry_id` (a container registry credential ID) for private image pulls instead of
  embedding a registry password in `env`.
- Have the job fetch short-lived credentials at runtime from your own secret store, passing only
  a non-secret identifier through `env`.

This entity cannot fix the exposure — the field is part of the pod/template API, readable by
anyone holding the account's API key regardless of Monk — so treat anything in `env` as public
to the account. `get-info` redacts `env` values (keys only) before printing, closing the one
leak this entity *can* control: its own documented sanity-check workflow dumping them to
whatever captures Monk's job output.

## Actions

| Entity | Action | Description |
|--------|--------|-------------|
| `runpod-pod` | `restart` | Restart the pod |
| `runpod-pod` | `force-terminate` | Terminate the pod regardless of how it was acquired — the escape hatch for an adopted pod teardown declined to remove |
| `runpod-pod` | `get-info` | Full pod detail as JSON, `env` values redacted (keys kept) |
| `runpod-pod` | `get-console-url` | RunPod console URL for this pod (for logs — see "No log action" below) |
| `runpod-pod` | `get-cost-estimate` | Human-readable monthly cost breakdown |
| `runpod-pod` | `costs` | Monthly cost as billing JSON |
| `runpod-network-volume` | `get-info` | Volume detail as JSON |
| `runpod-network-volume` | `get-cost-estimate` | Human-readable monthly cost breakdown |
| `runpod-network-volume` | `costs` | Monthly cost as billing JSON |
| `runpod-template` | `get-info` | Template detail as JSON |

### Pod power control uses Monk lifecycle commands

`start` and `stop` are Monk **builtin** actions, so pod power control maps onto them directly
rather than being exposed as custom actions:

```bash
sudo monk do runpod-example/trainer/stop     # power off — stops compute billing
sudo monk do runpod-example/trainer/start    # power back on
sudo monk do runpod-example/trainer/restart  # custom action
```

Both are guarded on the pod's current status, so starting a running pod or stopping a stopped
one is a no-op instead of an API error. Terminating a pod is `monk delete` — exposing
`terminate` as an action too would duplicate the lifecycle. `start` is dispatched by the
lifecycle (`monk run`), not callable via `monk do`; it also creates the pod if none exists yet.

> ⚠️ **Stopping a pod does not reserve its hardware.** A stopped pod stays bound to its host
> machine, and starting it again fails if that host no longer has free capacity — observed live
> as `400 "There are not enough free vcpu on the host machine to start this pod."` Treat
> stop/start as opportunistic cost saving, not a reliable pause button: if the workload must
> come back, delete and recreate (mounting a network volume so the data survives) instead.

### No log action

`GET /v2/pods/{id}/logs` is a **Server-Sent Events stream** that stays open indefinitely.
monkec's `HttpClient` is request/response, so an action wrapping it never returns and hangs the
lifecycle job (verified against a live pod). Use `runpodctl` or the RunPod console for logs —
`get-console-url` builds that console link for you (pure string construction, no API call, so
it can't hang) rather than trying to consume the stream. If the job image itself can cooperate,
having it tee its own log to a file and mirror that elsewhere (object storage, etc.) works too —
see `examples/runpod-cross-region-training` for that pattern.

## Cost estimation

| Entity | Rate source |
|--------|-------------|
| `runpod-pod` | The pod's live `cost` field (USD/hr). It reads `0.0` when the pod is stopped, so a stopped pod falls back to `GET /v2/catalog/gpus` pricing, clearly labeled as the rate it *would* bill at. Trailing-30-day actuals come from `GET /v2/billing/pods`. |
| `runpod-network-volume` | RunPod exposes **no** storage rate through the API — neither the volume resource nor `GET /v2/catalog/datacenters` returns a price. Cost is derived from `GET /v2/billing/network-volumes` history. A volume with no history yet reports `0` with an explanatory `error` field. |

Estimates exclude network egress, savings plans, and account credits.

## Cost and safety notes

- **Pods bill hourly on real hardware.** A leaked pod keeps billing until someone notices;
  `delete()` is idempotent and tolerates an already-terminated pod.
- **`interruptible: true` pods can be reclaimed without notice.** Cheaper, but unsuitable for
  anything that must stay up — including test runs.
- **GPU capacity is not guaranteed.** A create can fail purely because the requested GPU is
  sold out; the API error body is surfaced verbatim so this is distinguishable from a bug.
- **Deleting a network volume destroys its data.** Set `allow_destructive_delete: false` to
  require a deliberate change before teardown can remove it.

## Related docs

- [`doc/new-entity-guide.md`](../../doc/new-entity-guide.md)
- [`doc/testing.md`](../../doc/testing.md)
- [`doc/monk-cli.md`](../../doc/monk-cli.md)
