#!/bin/bash
# Regression guard for the Task 1/2 fallback fix: (a) an already-warm cache must NOT trigger
# a fallback pull at all, and (b) a fallback that also fails (object missing from R2 too)
# must park the pod, never fall through to training. Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-cache-hit-and-hard-miss-safety.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
. "$JOB_DIR/test/lib.sh"

DS_CONTENT="fake-dataset-shard-content-12345"
CKPT_CONTENT="fake-checkpoint-bytes-67890"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)

# --- Case A: everything already warm on the volume -> no fallback should fire ---
mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t" "$SCRATCH/ws-warm/data/t-dataset" \
  "$SCRATCH/ws-warm/runs/t/ckpt"
printf '%s' "$DS_CONTENT" > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/fr2-runs/t/step-000020.bin"
# Keyed by EXP=t, matching DATA_DIR="$V/data/$EXP-dataset" in entrypoint.sh.
printf '%s' "$DS_CONTENT" > "$SCRATCH/ws-warm/data/t-dataset/shard-00.bin"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/ws-warm/runs/t/ckpt/step-000020.bin"
# The manifest's dataset_sha256 is what dataset_hash() computes for the warmed directory,
# not a raw content hash (see lib.sh) — computed from the already-seeded ws-warm content
# above, so both case A and case B (which reuses this same manifest) get a real,
# non-vacuous cache hit on the dataset side.
DH=$(compute_dataset_hash "$SCRATCH/ws-warm" "/workspace/data/t-dataset" "$IMAGE" "$JOB_DIR")
cat > "$SCRATCH/fr2-runs/t/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$DH","checkpoint_sha256":"$CKH"}
JSON

OUT_A=$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/fr2-data":/fr2-data -v "$SCRATCH/fr2-runs":/fr2-runs \
  -v "$SCRATCH/ws-warm":/workspace \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -e ROLE=gpu-b -e EXP=t -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e BACKGROUND_SYNC=false -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" -c 'timeout 5 /usr/local/bin/entrypoint.sh' 2>&1) || true

if echo "$OUT_A" | grep -qE 'dataset_fallback|checkpoint_fallback'; then
  echo "FAIL (case A): a fallback line appeared even though the cache already matched the manifest"
  echo "$OUT_A" | grep -E "RESULT:"
  exit 1
fi
if ! echo "$OUT_A" | grep -q 'RESULT: CACHE_HIT_dataset .*YES'; then
  echo "FAIL (case A): expected dataset cache hit"; exit 1
fi
if ! echo "$OUT_A" | grep -q 'RESULT: CACHE_HIT_checkpoint .*YES'; then
  echo "FAIL (case A): expected checkpoint cache hit"; exit 1
fi
echo "PASS (case A: warm cache never triggers a fallback)"

# --- Case B: checkpoint missing from the volume AND from R2 -> must park, not train ---
mkdir -p "$SCRATCH/fr2-runs-hard/t" "$SCRATCH/ws-hard/data/t-dataset"
cp "$SCRATCH/fr2-runs/t/manifest.json" "$SCRATCH/fr2-runs-hard/t/manifest.json"
printf '%s' "$DS_CONTENT" > "$SCRATCH/ws-hard/data/t-dataset/shard-00.bin"
# Deliberately do NOT create step-000020.bin under fr2-runs-hard/t -> the object is
# genuinely absent from "R2" too, so the fallback pull itself must fail.

OUT_B=$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/fr2-data":/fr2-data -v "$SCRATCH/fr2-runs-hard":/fr2-runs \
  -v "$SCRATCH/ws-hard":/workspace \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -e ROLE=gpu-b -e EXP=t -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e BACKGROUND_SYNC=false -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" -c 'timeout 5 /usr/local/bin/entrypoint.sh; echo "EXIT=$?"' 2>&1) || true

if ! echo "$OUT_B" | grep -q 'RESULT: checkpoint_fallback .*FAILED'; then
  echo "FAIL (case B): expected checkpoint_fallback FAILED when the object is missing from R2 too"
  echo "$OUT_B" | grep -E "RESULT:"
  exit 1
fi
if echo "$OUT_B" | grep -q "TRAIN: ckpt at step"; then
  echo "FAIL (case B): training proceeded despite an unrecoverable checkpoint cache miss"
  exit 1
fi
if ! echo "$OUT_B" | grep -q "EXIT=124"; then
  echo "FAIL (case B): expected the pod to park (exec sleep infinity, killed by timeout=124)," \
       "not exit some other way"
  exit 1
fi
echo "PASS (case B: unrecoverable miss parks the pod instead of training)"
