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
. "$JOB_DIR/test/lib.sh"

mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t"
DS_CONTENT="fake-dataset-shard-content-12345"
printf '%s' "$DS_CONTENT" > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"
# The manifest's dataset_sha256 is what dataset_hash() will compute once this content is
# warmed into $DATA_DIR ($V/data/$EXP-dataset) — not a raw content hash (dataset_hash()
# combines per-file hashes including their paths, so it differs from hashing the bytes
# directly, even for one file).
mkdir -p "$SCRATCH/expected/data/t-dataset"
printf '%s' "$DS_CONTENT" > "$SCRATCH/expected/data/t-dataset/shard-00.bin"
DH=$(compute_dataset_hash "$SCRATCH/expected" "/workspace/data/t-dataset" "$IMAGE" "$JOB_DIR")
CKPT_CONTENT="fake-checkpoint-bytes-67890"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/fr2-runs/t/step-000020.bin"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/fr2-runs/t/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$DH","checkpoint_sha256":"$CKH"}
JSON

# /workspace starts empty, so the dataset is a clean cache miss. (The checkpoint will also
# miss here — that's Task 2's concern; this test only asserts on the dataset side.) Bind
# mounted (not left as the container's own ephemeral root-owned layer) so --user below can
# actually mkdir into it — the container's bare "/" is root-owned, non-writable to --user.
mkdir -p "$SCRATCH/workspace"
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
