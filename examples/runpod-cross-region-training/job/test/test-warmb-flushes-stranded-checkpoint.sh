#!/bin/bash
# Regression test for architecture review Finding 11 (2026-08-19): before this fix, warm-b
# only ever pulled from R2 — nothing detected or recovered a checkpoint stranded on a
# volume whose background sync never reached R2 (e.g. a region outage, or gpu-a run with
# BACKGROUND_SYNC=false and sync-out never run). Simulates that: seeds /workspace with a
# local checkpoint + manifest, R2's runs bucket empty, then confirms warm-b's flush step
# pushes both to R2 before doing its normal warm pull. Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-warmb-flushes-stranded-checkpoint.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
. "$JOB_DIR/test/lib.sh"

mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t" \
  "$SCRATCH/workspace/data/t-dataset" "$SCRATCH/workspace/runs/t/ckpt"

DS_CONTENT="fake-dataset-shard-content-flush-test"
printf '%s' "$DS_CONTENT" > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"
# Pre-seed /workspace/data/t-dataset with the SAME content: warm-b unconditionally
# re-pulls the dataset from R2 regardless of what's already local, so this only needs to
# make the manifest's dataset_sha256 correct — it isn't a cache-hit check like gpu-b's.
printf '%s' "$DS_CONTENT" > "$SCRATCH/workspace/data/t-dataset/shard-00.bin"
DH=$(compute_dataset_hash "$SCRATCH/workspace" "/workspace/data/t-dataset" "$IMAGE" "$JOB_DIR")

# The stranded checkpoint: present on the volume, absent from R2 (fr2-runs/t is empty).
CKPT_CONTENT="stranded-checkpoint-bytes"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/workspace/runs/t/ckpt/step-000020.bin"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/workspace/runs/t/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$DH","checkpoint_sha256":"$CKH"}
JSON

OUTPUT=$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/fr2-data":/fr2-data \
  -v "$SCRATCH/fr2-runs":/fr2-runs \
  -v "$SCRATCH/workspace":/workspace \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -e ROLE=warm-b -e EXP=t -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" \
  -c 'timeout 10 /usr/local/bin/entrypoint.sh' 2>&1) || true

echo "$OUTPUT" | grep -E "RESULT:|SYNC:" || true

if ! echo "$OUTPUT" | grep -q 'RESULT: flush_orphans .*pushed 1 local checkpoint'; then
  echo "FAIL: expected flush_orphans to report pushing the stranded checkpoint"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: flush_manifest .*published local manifest (step=20)'; then
  echo "FAIL: expected flush_manifest to publish the local manifest — R2 had none, so local is trivially ahead"
  exit 1
fi
if [ ! -f "$SCRATCH/fr2-runs/t/step-000020.bin" ]; then
  echo "FAIL: the stranded checkpoint never reached R2"
  exit 1
fi
if [ ! -f "$SCRATCH/fr2-runs/t/manifest.json" ]; then
  echo "FAIL: the local manifest never reached R2"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: volumeB_integrity .*OK'; then
  echo "FAIL: expected volumeB_integrity OK — the flushed-then-repulled dataset should match the manifest"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: checkpointB_integrity .*OK'; then
  echo "FAIL: expected checkpointB_integrity OK for the checkpoint warm-b just flushed and re-pulled"
  exit 1
fi
echo "PASS"
