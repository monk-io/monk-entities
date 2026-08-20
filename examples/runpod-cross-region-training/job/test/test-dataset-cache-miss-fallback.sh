#!/bin/bash
# Regression test for architecture review Finding 1 (2026-08-19): before this fix, gpu-b
# silently trained from an empty/wrong dataset on a cache miss instead of pulling the
# manifest-named data from R2. Exercises entrypoint.sh's gpu-b role against a
# local-filesystem fake R2 (RCLONE_CONFIG_R2_TYPE=local) — no network, no credentials, no
# RunPod pod. Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-dataset-cache-miss-fallback.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t"
DS_CONTENT="fake-dataset-shard-content-12345"
printf '%s' "$DS_CONTENT" > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"
DH=$(printf '%s' "$DS_CONTENT" | sha256sum | cut -d' ' -f1)
CKPT_CONTENT="fake-checkpoint-bytes-67890"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/fr2-runs/t/step-000020.bin"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/fr2-runs/t/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$DH","checkpoint_sha256":"$CKH"}
JSON

# /workspace starts empty, so the dataset is a clean cache miss. (The checkpoint will also
# miss here — that's Task 2's concern; this test only asserts on the dataset side.)
OUTPUT=$(docker run --rm \
  -v "$SCRATCH/fr2-data":/fr2-data \
  -v "$SCRATCH/fr2-runs":/fr2-runs \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -e ROLE=gpu-b -e EXP=t -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e BACKGROUND_SYNC=false -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" \
  -c 'timeout 5 /usr/local/bin/entrypoint.sh' 2>&1) || true

echo "$OUTPUT" | grep -E "RESULT:|SYNC:" || true

if ! echo "$OUTPUT" | grep -q 'RESULT: CACHE_HIT_dataset .*NO'; then
  echo "FAIL: expected a dataset cache miss to be reported"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: dataset_fallback .*OK'; then
  echo "FAIL: expected a dataset_fallback OK line — on a cache miss, gpu-b must pull the" \
       "dataset from R2 and re-verify, not just log the miss and continue training"
  exit 1
fi
echo "PASS"
