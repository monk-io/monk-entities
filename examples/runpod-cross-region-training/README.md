# RunPod Cross-Region Training Handoff

Demonstrates a training run that starts on a GPU pod in one RunPod region and resumes
on a GPU pod in a different region — without re-pulling bulk data from origin storage —
using this repo's own `runpod-pod` and `runpod-network-volume` entities.

> New here? [QUICKSTART.md](QUICKSTART.md) has the diagram, the flow, and the exact
> commands to run this end to end, without the full detail below.

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
owns everything specific to validating this example — the manifest's
`{step, checkpoint, dataset_sha256, checkpoint_sha256}` schema, the `step-NNNNNN.bin`
naming, and the hash/cache-hit checks (both the dataset *and* the checkpoint's content
are hash-verified before a cache hit is reported, not just checked for existence);
`sync-to-path.sh`, launched by it in the background on the GPU
roles to sync the checkpoint directory to a remote path and, after each sync, upload
an opaque marker file the caller controls; and `warm-from-path.sh`, called by the CPU
warmer role (and by the GPU roles for the initial dataset pull / manifest check) to
pull a directory and/or that same marker back — read-only, no writes. Both helpers
take only a local path and a remote path via `env` vars and know nothing about
training, checkpoints, or manifests — a real job image could reuse them unchanged
behind a real training/inference command; only `entrypoint.sh` would need to change.
Functionally identical to the original validation; just built the way this
package's entities actually support it, and split generically enough to sync any
path, not just this demo's checkpoints.

**Status: run live end to end, 2026-08-18, through these entities, against the job
image built from the *current* `job/` scripts** (the generic `sync-to-path.sh`/
`warm-from-path.sh` split, the drain-race fix, and the checkpoint content-hash
verification below — this status line is re-earned each time those scripts change,
not left standing on a stale claim). All three phases completed with the expected
`phase_complete` / `CACHE_HIT_* — ... hash verified` / `volumeB_integrity OK` /
`checkpointB_integrity OK` lines (see "Run sequence" below for the actual captured
output), and the account was verified at zero pods and zero volumes afterward. Three
things worth knowing before you run it yourself:
- **GPU/CPU stock is genuinely this volatile — sometimes region-wide, not just
  per-type.** This run's region B could not get a single pod in US-IL-1: all 6 CPU
  flavors and 8 different GPU types were rejected there, confirmed via direct API
  probing to not be a config issue (RunPod's own example payload, unrestricted to any
  datacenter, succeeded immediately). Region B ran in **EUR-NO-1** instead — still a
  distinct volume/DC/country from EU-RO-1, so the cross-region sync logic was fully
  exercised, just not the exact EU-RO-1/US-IL-1 pairing shown in the architecture
  diagram below. If US-IL-1 works when you run this, great; if not, this is why.
- **GPU/CPU stock is volatile per-type too.** Even setting aside the region-wide gap
  above, expect to retry with a different `gpu_type_id`/`cpu_flavor_id` a few times —
  every ID this package's own architecture doc listed as "confirmed working" hit "no
  instances available" at least once across this example's live runs. Not a sign
  anything is broken.
- **The pod runtime shadows its own `rclone` ahead of the image's — confirmed, not just
  suspected.** The job image installs rclone 1.75.0 at build time (`docker run --rm
  --entrypoint rclone imanachyn/runpod-hybrid-job:latest version` on the actual pushed
  image reports exactly that), but pods reported `rclone v1.58.1` (with a "Cloudflare
  provider not known" warning that rclone tolerated gracefully — copies still succeeded
  via generic S3-compatible signing). Not fatal here, but if you extend this job image
  and need a specific rclone feature or provider string, don't assume your
  `Dockerfile`'s version is what actually runs. The version is now pinned in the
  `Dockerfile` (`rclone-current-...` floated; two builds months apart could silently
  diverge) — pinning doesn't fix the runtime shadowing, but it does make the image's
  *own* version reproducible.

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

**Same-DC visibility, re-confirmed through these entities (2026-08-18):** a network
volume is visible to any pod attached to it in its own data center, independent of
which pod wrote the data — this isn't specific to `gpu-pod-eu-ro-1` reading its own
writes. Verified directly: `volume-eu-ro-1` was attached to a pod that wrote a marker
file and was then deleted; a second, entirely separate pod entity was attached to the
same `network_volume_id` in the same DC afterward and read the file back with zero R2
involvement (`READ_OK: hello-from-writer-...`). Confirms `network_volume_id` +
`data_center_ids` wiring on `runpod-pod` does what the architecture doc's raw-script
validation (§2) found, not just for this specific package's own container restart
case. A volume attached in a *different* DC than `data_center` is rejected by RunPod's
API at attach time — that restriction is enforced upstream, not something either
entity needs to check itself.

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
- Two Cloudflare R2 buckets — one for the dataset (read side), one for
  checkpoints/manifest (write side); R2 tokens are bucket-scoped, not prefix-scoped,
  so one bucket with two prefixes wouldn't isolate the two traffic directions.
  `monk-entities.yaml` manages bucket creation/adoption declaratively via
  `cloudflare/cloudflare-r2-bucket` (needs secrets `cloudflare-api-token` with
  `Workers R2 Storage:Edit` permission, and `cloudflare-account-id`) — see step 3
  below. That entity can't create the S3-compatible access-key pair the pods actually
  use to read/write objects, though (Cloudflare's API has no endpoint for that); mint
  one by hand in the dashboard and put it in secrets `r2-access-key-id` and
  `r2-secret-access-key`.
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

`monk-entities.yaml` already has these values filled in. The bucket name and endpoint
aren't hardcoded into each pod's `env` — every pod reads `DATA_BUCKET`, `RUNS_BUCKET`,
and `RCLONE_CONFIG_R2_ENDPOINT` from the `bucket-data`/`bucket-runs` entities via
`connection-target(...) entity-state get-member(...)` (live-verified 2026-08-18: ran
the sync-out pod against the real buckets and confirmed all three resolved correctly
in `monk describe`'s installed variables and in the pod's own R2-mirrored log). If
you're pointing at your own R2 account/bucket/image instead, change `account_id` and
`name` on `bucket-data`/`bucket-runs` — every pod picks the new values up
automatically. Only the job image (`image:` on each pod) still needs replacing by hand.

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
sudo monk secrets add -g cloudflare-api-token=<your-cloudflare-api-token>
sudo monk secrets add -g cloudflare-account-id=<your-cloudflare-account-id>
sudo monk secrets add -g r2-access-key-id=<your-r2-access-key-id>
sudo monk secrets add -g r2-secret-access-key=<your-r2-secret-access-key>
```

`cloudflare-api-token` needs `Workers R2 Storage:Edit` permission — it's used by the
bucket entities below, separate from the `r2-access-key-id`/`r2-secret-access-key`
pair the pods use for actual object reads/writes.

### 3. Provision the R2 buckets

```bash
sudo monk load examples/runpod-cross-region-training/monk-entities.yaml
sudo monk run -l runpod-cross-region-training/bucket-data
sudo monk run -l runpod-cross-region-training/bucket-runs
```

Creates `monk-training-data` / `monk-training-runs` if they don't exist yet, or
adopts them (read-only check, no changes) if they do — safe to re-run. Live-verified
against a real, disposable scratch bucket (2026-08-18): create, `get-info`, delete,
and re-create-after-delete (confirming the delete was real, not just local state) all
worked as expected.

### 4. Phase 0 — seed the dataset

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

### 5. Load the stack

Already done as part of step 3 above (`monk load` is idempotent — safe to re-run):

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

Watch the log (see "Verify" below) for — shape matches this example's own live runs,
exact hashes/timings will differ on yours:

```
### --- warm volume A from R2 (first use) ---
RESULT: volA_warm_from_r2              9.9 MiB in 1.2s (8 MB/s)
RESULT: dataset_sha256                 d675c1914b754689…
### --- train, checkpoint to VOLUME; sync-to-path.sh uploads in the background ---
SYNC: /workspace/runs/exp-entities-e2e-01/ckpt -> r2:monk-training-runs/exp-entities-e2e-01 (no new data, 0.4s)
SYNC: marker -> r2:monk-training-runs/exp-entities-e2e-01/manifest.json
TRAIN: ckpt at step 20
SYNC: /workspace/runs/exp-entities-e2e-01/ckpt -> r2:monk-training-runs/exp-entities-e2e-01 (+8.0 MiB in 0.6s, 13 MB/s)
SYNC: marker -> r2:monk-training-runs/exp-entities-e2e-01/manifest.json
TRAIN: ckpt at step 40
SYNC: /workspace/runs/exp-entities-e2e-01/ckpt -> r2:monk-training-runs/exp-entities-e2e-01 (+8.0 MiB in 0.5s, 16 MB/s)
SYNC: marker -> r2:monk-training-runs/exp-entities-e2e-01/manifest.json
TRAIN: ckpt at step 60
SYNC: /workspace/runs/exp-entities-e2e-01/ckpt -> r2:monk-training-runs/exp-entities-e2e-01 (+8.0 MiB in 0.5s, 16 MB/s)
SYNC: marker -> r2:monk-training-runs/exp-entities-e2e-01/manifest.json
SYNC: drained
RESULT: sync_lag_last_checkpoint       0.7s
RESULT: volA_holds                     step-000020.bin step-000040.bin step-000060.bin
RESULT: phase_complete                 gpu-a reached step 60 — confirm the RESULT lines above, then delete this pod
RESULT: phase_wall_clock               21.3s
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
### --- warm volume B: dataset ---
RESULT: dataset_warm_took              9.9 MiB in 1.9s (5 MB/s)
### --- warm volume B: checkpoint + manifest ---
RESULT: checkpoint_warm_took           24.0 MiB in 6.8s (4 MB/s)
RESULT: manifest                       step=60 ckpt=step-000060.bin
RESULT: warm_took                      8.7s
RESULT: volumeB_integrity              OK matches manifest
RESULT: checkpointB_integrity          OK matches manifest
RESULT: volumeB_after                  data=1 ckpt=[step-000020.bin step-000040.bin step-000060.bin ]
RESULT: phase_complete                 warm-b done — confirm integrity OK above, then delete this pod
RESULT: phase_wall_clock               10.1s
```

This capture predates a fix (architecture review finding 2, 2026-08-19):
`warm-b` used to pull every retained checkpoint under the run's R2 prefix, not just the
one the manifest names — `checkpoint_warm_took` above is really "time to warm all three,"
and `volumeB_after` lists all three for the same reason. Fixed now: `warm-b` pulls the
manifest first, then fetches only the single checkpoint it names, so
`ckpt=[step-000060.bin ]` (one file) is the expected output today, and
`checkpoint_warm_took` scales with one checkpoint's size, not the whole run's history.

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
RESULT: CACHE_HIT_checkpoint           YES — 8388710 bytes, hash verified, read locally
RESULT: ckpt_header                    exp=exp-entities-e2e-01 step=60 data=d675c1914b75468990484511b218e9adbdc1ce324f7
### --- continue training past step 60; sync-to-path.sh uploads in the background ---
SYNC: /workspace/runs/exp-entities-e2e-01/ckpt -> r2:monk-training-runs/exp-entities-e2e-01 (+24.0 MiB in 5.1s, 5 MB/s)
SYNC: marker -> r2:monk-training-runs/exp-entities-e2e-01/manifest.json
TRAIN: ckpt at step 80
SYNC: /workspace/runs/exp-entities-e2e-01/ckpt -> r2:monk-training-runs/exp-entities-e2e-01 (+8.0 MiB in 0.6s, 14 MB/s)
SYNC: marker -> r2:monk-training-runs/exp-entities-e2e-01/manifest.json
TRAIN: ckpt at step 100
SYNC: /workspace/runs/exp-entities-e2e-01/ckpt -> r2:monk-training-runs/exp-entities-e2e-01 (+8.0 MiB in 0.5s, 16 MB/s)
SYNC: marker -> r2:monk-training-runs/exp-entities-e2e-01/manifest.json
SYNC: drained
RESULT: sync_lag_last_checkpoint       0.6s
RESULT: phase_complete                 gpu-b reached step 100 — confirm CACHE_HIT lines above, then delete this pod
RESULT: phase_wall_clock               13.4s
```

The first sync pass here reports `+24.0 MiB` — that's every pre-existing checkpoint this
pod's *own* sidecar process hasn't tracked yet (it started fresh when `gpu-pod-us-il-1`
launched), not necessarily 24 MiB freshly transferred over the wire; rclone still skips
objects R2 already has byte-for-byte. Read it as "bytes this sync pass processed," not
literally "bytes newly written to R2."

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

## Alternative: no background process in the GPU pod

The default flow backgrounds `sync-to-path.sh` inside the GPU pod's own `entrypoint.sh`
(`start_sync`, launched with `&`) so checkpoints reach R2 incrementally while training
runs. That requires the training image's entrypoint to be able to fork a background
process alongside the real training command — not every training image or launcher
allows that. This alternative defers the R2 push entirely to a separate CPU pod that
runs *after* the GPU pod is deleted, using the exact "universal CPU pod, pick a
direction" shape described earlier: `warm-b`'s role already *is* the inbound
direction (pull from R2 to volume); `ROLE=sync-out` is the outbound counterpart (push
from volume to R2), selected the same way — one env var.

Validated live, 2026-08-18: `gpu-pod-eu-ro-1-no-sidecar` trained and wrote 3
checkpoints + a manifest to `volume-eu-ro-1` only (confirmed zero objects under
`monk-training-runs/<EXP>/` besides its own mirrored log at that point); after it was
deleted, `sync-out-pod-eu-ro-1` attached to the same volume and pushed all 3
checkpoints + the manifest to R2 in one shot:

```
### --- push volume's checkpoint dir + manifest to R2 (one-shot) ---
SYNC: /workspace/runs/<EXP>/ckpt -> r2:monk-training-runs/<EXP>
SYNC: marker -> r2:monk-training-runs/<EXP>/manifest.json
SYNC: /workspace/runs/<EXP>/ckpt -> r2:monk-training-runs/<EXP>
SYNC: marker -> r2:monk-training-runs/<EXP>/manifest.json
SYNC: drained
RESULT: synced                         step-000020.bin step-000040.bin step-000060.bin
RESULT: phase_complete                 sync-out pushed 3 checkpoint(s) + manifest to R2 — delete this pod
```

**Run it:**
```bash
sudo monk run -l runpod-cross-region-training/volume-eu-ro-1
sudo monk run -l runpod-cross-region-training/gpu-pod-eu-ro-1-no-sidecar
# watch for phase_complete, same as the default flow, then:
sudo monk delete --force runpod-cross-region-training/gpu-pod-eu-ro-1-no-sidecar
sudo monk run -l runpod-cross-region-training/sync-out-pod-eu-ro-1
# watch for phase_complete, then:
sudo monk delete --force runpod-cross-region-training/sync-out-pod-eu-ro-1
```

**How it works, mechanically:**
- `BACKGROUND_SYNC=false` on the pod's `env` (see `gpu-pod-eu-ro-1-no-sidecar` in
  `monk-entities.yaml`) skips `start_sync` entirely — the training loop still writes
  checkpoints and the manifest, just only ever to the volume.
- The manifest itself lives on the volume (`$V/runs/$EXP/manifest.json`), not `/tmp`
  — a separate pod attaching later has no access to the first pod's `/tmp`.
- `ROLE=sync-out` calls `sync-to-path.sh` with `$DRAIN` already touched, which turns
  its normal watch-loop into a clean one-shot: one real sync pass, one confirmatory
  pass (the same drain-race-closing behavior the background sidecar relies on), then
  exit — no code changes needed to that script for this flow.
- Reattaching a *different* pod entity to the same `network_volume_id` after the
  writer pod is **deleted** (not just stopped) is the same mechanism already proven
  live for the same-DC visibility finding elsewhere in this README — reattachment
  after merely *stopping* a pod (leaving the entity around) is untested; use delete.

**The real trade-off, not just an implementation detail:** R2 gets no incremental
visibility while the GPU pod is running — only once `sync-out` runs. For this demo
(training finishes in ~18 seconds) that's irrelevant. For a real, long-running job,
it means no other region can resume mid-run unless you periodically stop the GPU pod,
run `sync-out`, and restart training — an operational cost the default (background
sidecar) flow doesn't have. Pick this flow because your training image can't run a
background process, not because it seems simpler.

## Recovering a stranded checkpoint

The hybrid architecture doc's own durability argument (§4): a network volume is
datacenter-pinned, so if a region goes dark before a checkpoint reaches R2 — a region-wide
outage, or `BACKGROUND_SYNC=false` and nobody happened to run `sync-out` — that checkpoint
is unreachable from anywhere else until *something in that same region* flushes it.
Previously the only way to do that was `ROLE=sync-out`, run by an operator who had to
first notice the stranding by hand (architecture review finding 11, 2026-08-19).

`ROLE=warm-b` now does this automatically as its first step, before pulling anything: if
the volume it attaches to already has local checkpoint files, it pushes them to R2, then
compares its local manifest's `step` against R2's and publishes the local one only if it's
strictly ahead — never backward, so a stale local manifest from an earlier, since-
superseded attempt can't roll R2's commit point back (that would reopen finding 10, the
manifest's monotonicity gap, from the fix meant to close finding 11). Checkpoint *files*
are pushed unconditionally either way — they're additively named (`step-NNNNNN.bin`), so
pushing one R2 already ignores is harmless.

Practically: once a region's capacity returns, run a `warm-b`-style pod (any pod entity
with `ROLE=warm-b` and `network_volume_id` pointed at the affected volume — it doesn't
have to be `warmer-pod-us-il-1` specifically) against it. It self-heals the stranded
checkpoint and warms in the same pass; `sync-out` remains available as a lighter-weight,
explicit push when you already know a checkpoint needs flushing and don't need the warm
side of `warm-b`. This does mean `warm-b`'s R2 token now needs **write** access to the
runs bucket, not just read — it previously never wrote to R2.

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
update continuously while their pod runs (each launches `sync-to-path.sh`
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

## Performance

Every phase prints its own throughput/timing `RESULT:` lines — no separate benchmark
tooling needed. What's measured, and why each one is there:

| Metric | Where | What it tells you |
|--------|-------|--------------------|
| `volA_warm_from_r2` / `dataset_warm_took` | dataset pull (any role) | Cold R2→volume dataset transfer rate |
| `checkpoint_warm_took` | `warm-b` | R2→volume checkpoint-dir transfer rate |
| `volume_read_rate` | `gpu-b` | Local volume read rate — the number that matters for "is the cache actually fast" |
| `SYNC: ... (+X MiB in Ys, Z MB/s)` | any role backgrounding `sync-to-path.sh` | Per-pass volume→R2 upload rate. `(no new data, ...)` passes are idle ticks, not failures |
| `SYNC: FAILED ...` | any role backgrounding `sync-to-path.sh` | A pass's `copy`/`copyto` call failed — the actual rclone error follows on the same line. Previously this failed silently (see the hybrid architecture doc §6.5, "Diagnostics must not be silenced"); its absence used to be the only signal something was wrong |
| `flush_orphans` / `flush_manifest` | `warm-b` | Result of the flush-before-warm pass (see "Recovering a stranded checkpoint"). `nothing local to flush` on a fresh volume is normal; `pushed N local checkpoint(s)` or `published local manifest` means this volume had unsynced state from an earlier attempt |
| `sync_lag_last_checkpoint` | `gpu-a`/`gpu-b` (background flow only) | Wall-clock from "checkpoint written locally" to "confirmed synced to R2" — how far behind the backup can get before you'd lose it to a regional failure |
| `phase_wall_clock` | every role | Total time for that pod, start to `phase_complete` — the number for cost/time budgeting across phases |

Two things worth knowing before you read these as real benchmarks:
- This demo's checkpoints are 8 MiB of zeroed bytes and R2 calls happen from inside
  RunPod's own network, not from an arbitrary training job's real I/O pattern — treat
  the *shape* of these numbers (upload lags behind write, local read beats R2 pull by
  10-100x) as the point, not the exact MB/s figures.
- `SYNC:` lines report bytes *this sync pass processed* on the local side, not bytes
  actually placed on the wire — rclone still skips objects R2 already has unchanged.
  A pod's very first sync pass after attaching to a volume with pre-existing
  checkpoints will report all of them as "new" for that reason (see the Phase 3 log
  above).

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

`bucket-data`/`bucket-runs` are in `stack` too, but `monk delete --force stack` won't
actually remove them: they're adopted, pre-existing buckets (`state.existing = true`),
and `CloudflareR2Bucket.delete()` is unconditionally a no-op on an adopted bucket
regardless of `allow_destructive_delete` — same for the `force-delete` action, which
explicitly refuses adopted buckets too. There's no path to deleting these two through
this entity; use the Cloudflare dashboard/API directly if you actually want the data
gone.

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
  account's API key — including this package's own `get-info` action, which now
  redacts `env` *values* (keys only) before printing, but that only closes the leak
  through Monk's own workflow; the underlying RunPod API still returns everything to
  anyone holding the account's key. The R2 credentials in this example's `env` blocks
  are fine for a throwaway demo bucket; production should use scoped per-bucket R2
  tokens or presigned URLs instead (see the hybrid architecture doc, §8).
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
