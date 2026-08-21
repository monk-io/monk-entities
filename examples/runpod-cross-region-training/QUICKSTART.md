# Cross-Region Training — Quickstart

A training run that starts on a GPU in one RunPod region, and resumes on a GPU in a
different region without re-downloading the dataset — using this repo's own
`runpod-pod` and `runpod-network-volume` entities. This doc is the fast path: what it
does, how it fits together, and the exact commands to run it once, end to end. For
the full story (why each design choice was made, troubleshooting, known limitations,
cost breakdown, the no-background-process alternative flow) see [README.md](README.md).

## The idea in one paragraph

A network volume is pinned to one datacenter, so it can't hand data to a pod resuming
in a different region. Cloudflare R2 can. So every checkpoint goes to **both**: the
volume (fast local cache) and R2 (the thing every region can actually reach). A small
JSON manifest on R2 is the pointer to "the current step" — write the checkpoint first,
then advance the manifest, so nothing ever points at a checkpoint that isn't there yet.

## Diagram

```
┌────────────────────────────────┐
│ gpu-pod-eu-ro-1 (EU-RO-1)      │
│ + volume-eu-ro-1               │
│                                │
│ 1. pull dataset from R2        │
│ 2. train, checkpoint to        │
│    volume + R2                 │
└────────────────────────────────┘
                │
      checkpoints + manifest
                ▼
┌────────────────────────────────┐
│ Cloudflare R2                  │
│ (source of truth: dataset,     │
│ checkpoints, manifest)         │
└────────────────────────────────┘
                │
       dataset + checkpoint
                ▼
┌────────────────────────────────┐
│ warmer-pod-us-il-1 (US-IL-1)   │
│ + volume-us-il-1               │
│                                │
│ 3. pull dataset + checkpoint   │
│ 4. warm volume, verify         │
└────────────────────────────────┘
                │
         volume now warm
                ▼
┌────────────────────────────────┐
│ gpu-pod-us-il-1 (US-IL-1)      │
│                                │
│ 5. resume from volume          │
│    (cache hit, no R2 pull)     │
│ 6. continue training, push     │
│    new checkpoints to R2       │
└────────────────────────────────┘
```

## Flow, phase by phase

| # | Pod | What it proves |
|---|-----|-----------------|
| 1 | `gpu-pod-eu-ro-1` (GPU) | Trains, checkpoints to its volume *and* R2, advances the manifest |
| 2 | `warmer-pod-us-il-1` (CPU) | Reads the manifest, warms region B's volume from R2, verifies integrity |
| 3 | `gpu-pod-us-il-1` (GPU) | Resumes training reading **only** from the local volume — the whole point |

Each phase is `monk run` → watch its log for `phase_complete` (see "Checking a
phase's log" right below) → `monk delete --force` it before starting the next. They're
sequential in *time* (phase 2 needs phase 1's checkpoint to exist), not something you
`monk run` as one stack.

## Checking a phase's log

`monk logs` does not work on these pods — RunPod's log endpoint is a stream this
package can't wrap (see README "Verify" for why). The script mirrors its own log to
R2 instead, so this is how you actually see `phase_complete`, `CACHE_HIT_*`, etc.:

```bash
docker run --rm --entrypoint rclone imanachyn/runpod-hybrid-job:latest \
  cat r2:monk-training-runs/<EXP>/logs/<role>.log \
  --s3-provider Cloudflare --s3-endpoint https://810d603ced5fdba93e42f9f5bb640b91.eu.r2.cloudflarestorage.com \
  --s3-access-key-id <your-r2-access-key-id> --s3-secret-access-key <your-r2-secret-access-key> \
  --s3-region auto
```

Swap `<EXP>` for the pod's actual `EXP` env value (`exp-entities-e2e-01` unless you
changed it) and `<role>` for whichever phase you're checking: `gpu-a` (phase 1),
`warm-b` (phase 2), `gpu-b` (phase 3), or `sync-out` (alternative flow, below). Run it
again to refresh — `gpu-a`/`gpu-b` update every ~3s while their pod runs; `warm-b` and
`sync-out` only write once, at the very end, so "not found" just means not done yet.

Prefer a browser? `sudo monk do <entity>/get-console-url` prints a direct link to that
pod's page on RunPod's own console, logs tab included — see README "Verify" for the
full set of options (there are a few, including no-log-content quick status checks).

## Runbook: launch and test from scratch

**Prerequisites** (see README "Prerequisites" for detail):
- Secrets: `runpod-api-token`, `r2-access-key-id`, `r2-secret-access-key`
- A public Docker Hub image built from `job/Dockerfile` (RunPod's registry auth only
  supports Docker Hub/ECR, and only a *public* image needs no extra setup)
- `runpod/runpod-pod` and `runpod/runpod-network-volume` compiled and loaded

```bash
# 0. Build and push the job image
cd examples/runpod-cross-region-training/job
docker build -t <your-dockerhub-user>/runpod-hybrid-job:latest .
docker push <your-dockerhub-user>/runpod-hybrid-job:latest
# then point monk-entities.yaml's `image:` fields at it if not using the example's own

# 1. Secrets
sudo monk secrets add -g runpod-api-token=<your-runpod-api-key>
sudo monk secrets add -g r2-access-key-id=<your-r2-access-key-id>
sudo monk secrets add -g r2-secret-access-key=<your-r2-secret-access-key>

# 2. Seed a small dataset object (R2) — the demo needs *something* to warm from.
#    Endpoint below matches this example's own monk-entities.yaml (fixed at bucket
#    creation); swap it, the bucket names, and EXP if you're using your own R2 setup.
dd if=/dev/urandom of=/tmp/shard-00.bin bs=1M count=8
rclone copyto /tmp/shard-00.bin r2:monk-training-data/exp-entities-e2e-01-dataset/shard-00.bin \
  --s3-provider Cloudflare --s3-endpoint https://810d603ced5fdba93e42f9f5bb640b91.eu.r2.cloudflarestorage.com \
  --s3-access-key-id <your-r2-access-key-id> --s3-secret-access-key <your-r2-secret-access-key> \
  --s3-region auto

# 3. Load entities + the stack
sudo monk load dist/runpod/MANIFEST
sudo monk load examples/runpod-cross-region-training/monk-entities.yaml

# 4. Phase 1 — train in EU-RO-1
sudo monk run -l runpod-cross-region-training/volume-eu-ro-1
sudo monk run -l runpod-cross-region-training/gpu-pod-eu-ro-1
#   ... check logs/gpu-a.log (see "Checking a phase's log" above) for `phase_complete` ...
sudo monk delete --force runpod-cross-region-training/gpu-pod-eu-ro-1

# 5. Phase 2 — warm the cache in US-IL-1
sudo monk run -l runpod-cross-region-training/volume-us-il-1
sudo monk run -l runpod-cross-region-training/warmer-pod-us-il-1
#   ... check logs/warm-b.log for `volumeB_integrity OK` / `phase_complete` ...
sudo monk delete --force runpod-cross-region-training/warmer-pod-us-il-1

# 6. Phase 3 — resume in US-IL-1 (the decisive step)
sudo monk run -l runpod-cross-region-training/gpu-pod-us-il-1
#   ... check logs/gpu-b.log for both CACHE_HIT_* lines reading YES ...
sudo monk delete --force runpod-cross-region-training/gpu-pod-us-il-1

# 7. Teardown + verify zero billing resources remain
sudo monk delete --force runpod-cross-region-training/stack
curl -s -H "Authorization: Bearer <your-runpod-api-key>" https://api.runpod.io/v2/pods
curl -s -H "Authorization: Bearer <your-runpod-api-key>" https://api.runpod.io/v2/network-volumes
```

**If a phase fails with "no instances available"** — that's regional GPU/CPU stock,
not a config error, and it fluctuates minute to minute. Delete the failed pod, try the
next `gpu_type_id`/`cpu_flavor_id` alternate listed in that entity's own comment in
`monk-entities.yaml`, reload, retry.

## Alternative: no background sync process

Use this instead of step 4's `gpu-pod-eu-ro-1` when the training image can't fork a
background upload process alongside the real training command. Same protocol — the
GPU pod still writes the checkpoint + manifest — the only difference is *when* R2 gets
them: here, only after a separate one-shot CPU pod pushes everything at the end,
instead of incrementally while training runs. Live-tested end to end, 2026-08-21.

```bash
sudo monk run -l runpod-cross-region-training/volume-eu-ro-1
sudo monk run -l runpod-cross-region-training/gpu-pod-eu-ro-1-no-sidecar
#   ... training checkpoints to the volume ONLY — no SYNC: lines, no R2 traffic yet ...
#   ... wait for the toy loop to finish (no live log signal without the sidecar;
#       ~20-40s) before deleting ...
sudo monk delete --force runpod-cross-region-training/gpu-pod-eu-ro-1-no-sidecar

sudo monk run -l runpod-cross-region-training/sync-out-pod-eu-ro-1
#   ... check logs/sync-out.log for `phase_complete` — pushed N checkpoint(s) + manifest to R2 ...
sudo monk delete --force runpod-cross-region-training/sync-out-pod-eu-ro-1
```

From here, phases 2-3 (warm region B, resume) run exactly as in the main flow above —
`sync-out` leaves R2 in the same state a background-synced `gpu-pod-eu-ro-1` would
have. The real trade-off: R2 gets zero visibility into progress while training runs,
only once `sync-out` executes — fine for this demo (finishes in seconds), a real
consideration for a long-running job. See README "Alternative: no background process
in the GPU pod" for the full write-up.

## Worth knowing before you dive into the README

- Total cost for one full run: well under $1 (two small volumes for a few minutes,
  three short pods). See README "Cost" for real numbers from a live run.
- Every phase already prints its own timing/throughput (`RESULT:` lines) — dataset and
  checkpoint transfer rates, local volume read speed, sync lag, and total time per
  phase. No separate benchmarking step needed. See README "Performance" for what each
  metric means.
- Full troubleshooting, the exact captured log output for each phase, and every known
  limitation (no live log streaming, `env` being API-readable, adoption-by-name, etc.)
  live in [README.md](README.md) — this doc intentionally stops here.
