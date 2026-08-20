#!/bin/bash
# Regression test for architecture review Finding 1 (2026-08-19), checkpoint half: before
# this fix, gpu-b silently resumed training from step 0 on a checkpoint cache miss instead
# of pulling the manifest-named checkpoint from R2. Isolates the checkpoint path by seeding
# /workspace with a dataset that already matches the manifest (a clean dataset cache HIT),
# so only the checkpoint fallback (this task) is exercised. Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-checkpoint-cache-miss-fallback.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
. "$JOB_DIR/test/lib.sh"

mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t" "$SCRATCH/workspace/data/t-dataset"
DS_CONTENT="fake-dataset-shard-content-12345"
printf '%s' "$DS_CONTENT" > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"
# Pre-seed /workspace/data/t-dataset (keyed by EXP=t, matching DATA_DIR in entrypoint.sh)
# with the SAME content so the dataset check is a cache HIT — isolates this test to the
# checkpoint fallback path. The manifest's dataset_sha256 is what dataset_hash() computes
# for this directory, not a raw content hash (see lib.sh).
printf '%s' "$DS_CONTENT" > "$SCRATCH/workspace/data/t-dataset/shard-00.bin"
DH=$(compute_dataset_hash "$SCRATCH/workspace" "/workspace/data/t-dataset" "$IMAGE" "$JOB_DIR")
CKPT_CONTENT="fake-checkpoint-bytes-67890"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/fr2-runs/t/step-000020.bin"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/fr2-runs/t/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$DH","checkpoint_sha256":"$CKH"}
JSON
# No ckpt/ dir under /workspace at all -> the checkpoint is a clean cache miss.

OUTPUT=$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/fr2-data":/fr2-data \
  -v "$SCRATCH/fr2-runs":/fr2-runs \
  -v "$SCRATCH/workspace":/workspace \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -e ROLE=gpu-b -e EXP=t -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e BACKGROUND_SYNC=false -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" \
  -c 'timeout 5 /usr/local/bin/entrypoint.sh' 2>&1) || true

echo "$OUTPUT" | grep -E "RESULT:|SYNC:" || true

if ! echo "$OUTPUT" | grep -q 'RESULT: CACHE_HIT_dataset .*YES'; then
  echo "FAIL: test setup bug — dataset should have been a cache hit, isolating the checkpoint path"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: CACHE_HIT_checkpoint .*NO'; then
  echo "FAIL: expected a checkpoint cache miss to be reported"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: checkpoint_fallback .*OK'; then
  echo "FAIL: expected a checkpoint_fallback OK line — on a cache miss, gpu-b must pull the" \
       "manifest-named checkpoint from R2 and re-verify, not resume from step 0 silently"
  exit 1
fi
echo "PASS"
