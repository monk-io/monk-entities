# RunPod Cross-Region Training Handoff

Demonstrates a training run that starts on a GPU pod in one RunPod region and resumes
on a GPU pod in a different region — without re-pulling bulk data from origin storage —
using this repo's own `runpod-pod` and `runpod-network-volume` entities.

This is the same handoff already validated live, end to end, with raw scripts before
these entities existed: EU-RO-1 → US-IL-1, three phases, ~$0.03. See
`monk/doc/internal/runpod-hybrid-architecture-2026-08.md` (sibling repo) for the full
measurement writeup this example reproduces. **What's different here:** the original
validation launched pods directly against RunPod's **v1** API so it could pass the job
as a `dockerStartCmd` array. This package's `runpod-pod` entity is **v2-only** — v2's
`args` field is a single string, and a real multi-line command sent through it silently
crash-loops (measured — no diagnostics, just repeated restarts). So instead of passing
the job script as pod arguments, it's baked into a small custom image (`job/`), and the
pod is driven entirely by `env` vars (`ROLE`, bucket names, R2 credentials). The image
has three scripts, split so the general (reusable) parts don't carry this demo's
test-specific assertions: `entrypoint.sh` (the `ENTRYPOINT`, dispatches on `ROLE`, and
owns everything specific to validating this example — hash checks, `RESULT`-formatted
output); `sync-to-external-storage.sh`, launched by it in the background on the GPU
roles to watch the checkpoint directory and upload new files + advance the manifest;
and `warm-from-external-storage.sh`, called by the CPU warmer role to pull the
manifest and download the dataset + checkpoint it references — read-only, no manifest
writes. Both helpers take their config via `env` vars and know nothing about training;
a real job image could reuse them unchanged behind a real training/inference command.
Functionally identical to the original validation; just built the way this
package's entities actually support it.

**Status: run live end to end, 2026-08-18, through these entities.** All three phases
completed with the expected `phase_complete` / `CACHE_HIT_*` / `volumeB_integrity OK`
lines (see "Run sequence" below for the actual captured output), and the account was
verified at zero pods and zero volumes afterward. Two things worth knowing before you
run it yourself:
- **GPU/CPU stock is genuinely this volatile.** Getting through all three phases meant
  retrying with a different `gpu_type_id`/`cpu_flavor_id` several times — every ID this
  package's own architecture doc listed as "confirmed working" hit "no instances
  available" at least once during this run. Budget for that; it's not a sign anything
  is broken.
- **The pod runtime appears to shadow its own `rclone` ahead of the image's.** The job
  image installs rclone 1.75.0 at build time, but pods reported `rclone v1.58.1` (with
  a "Cloudflare provider not known" warning that rclone tolerated gracefully — copies
  still succeeded via generic S3-compatible signing). Not fatal here, but if you extend
  this job image and need a specific rclone feature or provider string, don't assume
  your `Dockerfile`'s version is what actually runs.

## Architecture

```
region EU-RO-1                                    region US-IL-1
┌───────────────────────┐                         ┌──────────────────┐
│ gpu-pod-eu-ro-1        │-- checkpoints+manifest->│ R2 (source of    │
│ warms volume-eu-ro-1   │                         │ truth)           │
│ from R2, trains,       │<-- dataset (once) ------│                  │
│ checkpoints to         │                         └────────┬─────────┘
│ volume-eu-ro-1 + R2    │                                  │
└───────────────────────┘                          reads manifest, warms
                                                     volume-us-il-1 from R2
                                                              │
                                                     ┌────────▼──────────────┐
                                                     │ warmer-pod-us-il-1     │
                                                     │ ($0.06/hr)             │
                                                     │ warms volume-us-il-1,  │
                                                     │ verifies, exits        │
                                                     └────────┬──────────────┘
                                                              │ volume-us-il-1 now warm
                                                     ┌────────▼──────────────┐
                                                     │ gpu-pod-us-il-1        │
                                                     │ reads dataset +        │
                                                     │ checkpoint FROM        │
                                                     │ volume-us-il-1 (cache  │
                                                     │ hit, no R2 pull),      │
                                                     │ resumes training       │
                                                     └────────────────────────┘
```

**Why R2 stays the source of truth, not the volume:** a network volume is
datacenter-pinned — it can't serve a run resuming somewhere else. Checkpoints go to the
volume **and** to R2, never only to the volume. The manifest write on R2 is the commit
point: only after R2 has the checkpoint object does the manifest advance to point at it.

**Why this is three separate `monk run` invocations, not one stack:** the handoff is
inherently sequential across *time* — gpu-pod-eu-ro-1 must finish writing its checkpoint and
manifest before the warmer starts, and the warmer must finish before gpu-pod-us-il-1 starts.
Monk's `depends: wait-for` only waits for an entity to become *ready* (the pod exists
and is running), not for a training job running inside it to reach a particular step.
So this example is driven by hand through three phases, mirroring how the original
validation used two separate scripts (`e2e.sh`, `e2e-b.sh`) run one after another, not
a single parallel launch.

## Prerequisites

- A RunPod API key in the `runpod-api-token` secret (existing convention for this
  package — see `../../src/runpod/README.md`)
- A Cloudflare R2 bucket, and an access key pair for it in secrets `r2-access-key-id`
  and `r2-secret-access-key`. R2 tokens are bucket-scoped, not prefix-scoped, so this
  example uses **two buckets** — one for the dataset (read side), one for
  checkpoints/manifest (write side) — rather than one bucket with two prefixes.
- Docker, and somewhere to push an image RunPod can pull from. **RunPod's registry
  auth only supports Docker Hub and ECR credentials** (confirmed against the console —
  not Azure ACR or arbitrary registries), and only a *public* image needs no RunPod-side
  setup at all. A private Docker Hub/ECR image needs a pull credential registered
  manually in the RunPod console (`registry_id:` on each pod) — this package's
  `runpod-container-registry-auth` entity isn't implemented yet, so that step isn't
  automated here.
- `runpod/runpod-pod` and `runpod/runpod-network-volume` compiled and loaded:
  `sudo monk load dist/runpod/MANIFEST`

## Setup

This example's own live run used:
- R2 endpoint `https://810d603ced5fdba93e42f9f5bb640b91.eu.r2.cloudflarestorage.com`
  (EU jurisdiction — fixed permanently at bucket creation)
- Buckets `monk-training-data` (dataset) and `monk-training-runs` (checkpoints/manifest)
- Job image at `imanachyn/runpod-hybrid-job:latest` — public Docker Hub, no
  `registry_id:` needed
- Experiment prefix `exp-entities-e2e-01` (fresh, to avoid the older `exp-mvp-01` /
  `exp-e2e-01` / `mvp-dataset` objects already in those buckets from the raw-script
  validation)

`monk-entities.yaml` already has these values filled in. If you're pointing at your own
R2 account/bucket/image instead, replace them there.

### 1. Build and push the job image

```bash
cd examples/runpod-cross-region-training/job
docker build -t <your-dockerhub-user>/runpod-hybrid-job:latest .
docker push <your-dockerhub-user>/runpod-hybrid-job:latest
```

The Docker Hub repo must already exist (create it at hub.docker.com first) — this
account's push did not auto-create it.

### 2. Configure secrets

```bash
sudo monk secrets add -g runpod-api-token=<your-runpod-api-key>
sudo monk secrets add -g r2-access-key-id=<your-r2-access-key-id>
sudo monk secrets add -g r2-secret-access-key=<your-r2-secret-access-key>
```

### 3. Phase 0 — seed the dataset

The demo needs *something* in the data bucket to warm from, under the
`<EXP>-dataset` prefix (e.g. `exp-entities-e2e-01-dataset`) so it doesn't collide with
any older objects already in that bucket:

```bash
dd if=/dev/urandom of=/tmp/shard-00.bin bs=1M count=8
rclone copyto /tmp/shard-00.bin r2:monk-training-data/exp-entities-e2e-01-dataset/shard-00.bin \
  --s3-provider Cloudflare --s3-endpoint https://810d603ced5fdba93e42f9f5bb640b91.eu.r2.cloudflarestorage.com \
  --s3-access-key-id <your-r2-access-key-id> --s3-secret-access-key <your-r2-secret-access-key> \
  --s3-region auto
```

### 4. Load the stack

```bash
sudo monk load examples/runpod-cross-region-training/monk-entities.yaml
```

## Run sequence

Each phase: run its pod, watch for `phase_complete` in the log, then delete it before
starting the next phase. **Don't leave a finished pod running** — the job image parks
with `sleep infinity` after finishing precisely so a slow operator doesn't get an
extra billed run from RunPod's restart-on-exit behavior, but it's still billing while
parked.

**On "no instances available" (HTTP 400) or "failed to create pod" (HTTP 500):** this
is regional stock, not a config error — see the architecture doc §6.2 and the note
above. `monk delete --force` the failed instance, edit `gpu_type_id` (or
`cpu_flavor_id`) to the next alternate listed in that entity's comment in
`monk-entities.yaml`, `monk load` again, and retry `monk run`.

### Phase 1 — gpu-pod-eu-ro-1 (EU-RO-1)

```bash
sudo monk run -l runpod-cross-region-training/volume-eu-ro-1
sudo monk run -l runpod-cross-region-training/gpu-pod-eu-ro-1
```

Watch the log (see "Verify" below) for — this is the actual output from this example's
own live run:

```
### --- warm volume A from R2 (first use) ---
RESULT: volA_warm_from_r2              9.9 MiB in 1.2s (8 MB/s)
RESULT: dataset_sha256                 d675c1914b754689…
### --- train, checkpoint to VOLUME, upload to R2 in background ---
TRAIN: ckpt at step 20
SYNC: step-000020.bin + manifest -> R2
TRAIN: ckpt at step 40
SYNC: step-000040.bin + manifest -> R2
TRAIN: ckpt at step 60
SYNC: step-000060.bin + manifest -> R2
SYNC: drained
RESULT: volA_holds                     step-000020.bin step-000040.bin step-000060.bin
RESULT: phase_complete                 gpu-a reached step 60 — confirm the RESULT lines above, then delete this pod
```

Then:

```bash
sudo monk delete --force runpod-cross-region-training/gpu-pod-eu-ro-1
```

### Phase 2 — warmer-pod-us-il-1 (US-IL-1)

```bash
sudo monk run -l runpod-cross-region-training/volume-us-il-1
sudo monk run -l runpod-cross-region-training/warmer-pod-us-il-1
```

Watch for:

```
RESULT: manifest                       step=60 ckpt=exp-entities-e2e-01/ckpt/step-000060.bin
### --- warm volume B: dataset ---
### --- warm volume B: latest checkpoint ---
RESULT: warm_took                      9s
RESULT: volumeB_integrity              OK matches manifest
RESULT: volumeB_after                  data=1 ckpt=[step-000060.bin ]
RESULT: phase_complete                 warm-b done — confirm integrity OK above, then delete this pod
```

If instead you see `manifest MISSING`, phase 1 didn't finish (or its checkpoint upload
failed) — check gpu-pod-eu-ro-1's log before continuing.

Then:

```bash
sudo monk delete --force runpod-cross-region-training/warmer-pod-us-il-1
```

### Phase 3 — gpu-pod-us-il-1 (US-IL-1)

```bash
sudo monk run -l runpod-cross-region-training/gpu-pod-us-il-1
```

This is the decisive step — confirm both cache-hit lines, which mean the Illinois GPU
never touched R2 for the dataset or the checkpoint it resumed from:

```
### --- read dataset FROM VOLUME (no R2 pull) ---
RESULT: volume_read_rate               9.9 MiB in 0.04s (263 MB/s)
RESULT: CACHE_HIT_dataset              YES — volume data matches manifest, no R2 pull needed
### --- resume from checkpoint ON THE VOLUME ---
RESULT: CACHE_HIT_checkpoint           YES — 8388710 bytes, read locally
RESULT: ckpt_header                    exp=exp-entities-e2e-01 step=60 data=d675c1914b75468990484511b218e9adbdc1ce324f7
### --- continue training past step 60 ---
SYNC: step 80 -> R2
SYNC: step 100 -> R2
RESULT: phase_complete                 gpu-b reached step 100 — confirm CACHE_HIT lines above, then delete this pod
```

Then:

```bash
sudo monk delete --force runpod-cross-region-training/gpu-pod-us-il-1
```

## Re-running a phase (one-time-job semantics)

Each pod is meant to be a one-shot job: do its work, then idle until deleted. If a
phase failed (e.g. the GPU/CPU stock retry loop above) or you just want to re-run it
without deleting and recreating the entity, **`sudo monk restart
<namespace>/<pod-entity>`** does a real stop-then-start power-cycle of the underlying
RunPod pod — confirmed live (2026-08-18): `startedAt` advances to a fresh timestamp
while `createdAt` stays put, i.e. RunPod actually reboots the container, which re-runs
`entrypoint.sh` from scratch with whatever `ROLE`/env it was created with. This is
generic Monk behavior (`stop()`/`start()` are already implemented on `runpod-pod`),
not something specific to this example.

This is different from `monk do <pod-entity>/restart`, which maps to RunPod's own
in-place `restart` action (same container, no reboot) rather than Monk's stop+start —
prefer `monk restart` when you actually want a fresh run, since a reboot is what
re-executes the entrypoint.

Two things to know before relying on this:
- The container disk is wiped on any restart (RunPod's own semantics); the network
  volume is not, so `warm-b`'s re-download just overwrites what's already there —
  harmless. `gpu-a`/`gpu-b` restarting means the toy training loop starts over from
  step 1/`$((MS+1))` again, so a restarted `gpu-a` will overwrite the manifest with
  the same steps rather than resuming past them — fine for this demo, but not what
  you'd want from a restart in a real training job.
- It still restarts the *whole* container, including whatever "training" is
  in-flight — there's no way to restart just the sync sidecar on its own (see the
  "No mid-run exec" limitation below); a phase-level restart is the finest granularity
  RunPod's API offers.

## Verify

The job image has no way to expose logs through the entity — `GET /pods/{id}/logs` is
an SSE stream that this package doesn't wrap (see `../../src/runpod/SUMMARY.md`).
Instead, the entrypoint script tees everything to a log file under the volume and also
mirrors it to R2, so it's readable without SSH:

```bash
rclone cat r2:monk-training-runs/exp-entities-e2e-01/logs/gpu-a.log \
  --s3-provider Cloudflare --s3-endpoint https://810d603ced5fdba93e42f9f5bb640b91.eu.r2.cloudflarestorage.com \
  --s3-access-key-id <your-r2-access-key-id> --s3-secret-access-key <your-r2-secret-access-key> \
  --s3-region auto
```

Swap `gpu-a` for `warm-b` / `gpu-b` for the other phases. `gpu-a` and `gpu-b`'s logs
update continuously while their pod runs (each launches `sync-to-external-storage.sh`
in the background, which mirrors the log every ~3s alongside uploading checkpoints);
`warm-b` only writes its log to R2 once, at the very end, so a 404 on that one just
means the phase hasn't finished yet — retry in a few seconds rather than assuming
something's wrong.

Alternatively, `monk describe` shows `state.ssh_command` once a pod exposes port
`22/tcp` (this example's pods don't, to keep the image minimal) — or use the RunPod
console's own log viewer for the pod by ID.

You can also sanity-check a pod's live state without logs, while it's still running:

```bash
sudo monk do runpod-cross-region-training/gpu-pod-eu-ro-1/get-info
```

## Cleanup

After phase 3 is confirmed and `gpu-pod-us-il-1` is already deleted, tear down what's left
in one command:

```bash
sudo monk delete --force runpod-cross-region-training/stack
```

Then verify nothing is still billing — this is a habit worth keeping for any RunPod
work, since an adopted-by-name or otherwise-missed pod bills hourly until someone
notices:

```bash
curl -s -H "Authorization: Bearer <your-runpod-api-key>" https://api.runpod.io/v2/pods
curl -s -H "Authorization: Bearer <your-runpod-api-key>" https://api.runpod.io/v2/network-volumes
```

Both should return empty lists.

## Cost

Two 10 GB STANDARD volumes for the duration of the run, a warmer pod for well under a
minute, and two short GPU pods for well under a minute each of an 8 MB dataset — all
well under $1 total, in the same ballpark as the original validation's $0.03. Actual
rates from this example's own live run: gpu-pod-eu-ro-1 (NVIDIA L4) at $0.49/hr, and both
the warmer substitute and gpu-pod-us-il-1 (NVIDIA RTX 6000 Ada Generation) at $0.84/hr — a
few minutes of pod time at those rates is a few cents. GPU/CPU stock fluctuates
independently per region and by the minute (measured repeatedly during this run — see
the note near the top of this README); if pod creation fails with "no instances
available" or "failed to create pod", try the next alternate listed in that pod's
comment in `monk-entities.yaml`, or check `GET /v2/catalog/gpus` / `GET /v2/catalog/cpus`.

## Known limitations of this example

- **No registry automation, and registry choice is constrained.** RunPod's registry
  auth only accepts Docker Hub and ECR credentials — not Azure ACR or arbitrary
  registries (confirmed against the console). A private Docker Hub/ECR image needs a
  pull credential set up by hand in the RunPod console; this package doesn't implement
  `runpod-container-registry-auth` yet. This example uses a public Docker Hub image to
  skip that step entirely.
- **`env` is API-readable.** RunPod returns a pod's `env` in full to any holder of the
  account's API key. The R2 credentials in this example's `env` blocks are fine for a
  throwaway demo bucket; production should use scoped per-bucket R2 tokens or
  presigned URLs instead (see the hybrid architecture doc, §8).
- **Adoption-by-name.** If a pod with the same `name:` already exists in your account,
  the entity adopts it instead of creating a new one, and by default refuses to
  terminate it on delete (to avoid an accidental billing leak — see
  `../../src/runpod/pod.ts`). This example uses names unlikely to collide
  (`monk-hybrid-*`); if you do get an unexpected adoption, `monk do .../force-terminate`
  or `allow_destructive_delete: true` clears it.
- **No mid-run exec.** Checked directly against RunPod's v2 OpenAPI spec
  (`https://api.runpod.io/v2/openapi.json`): a pod's only lifecycle transitions are
  `start`/`stop`/`restart`/`terminate` via `POST /pods/{id}/action`, and there is no
  exec, command, or signal endpoint of any kind. There's no way to trigger "just
  re-run the sync" inside an already-running pod — the finest granularity available
  is restarting the whole container (see "Re-running a phase" above), which re-runs
  `entrypoint.sh` from scratch.
