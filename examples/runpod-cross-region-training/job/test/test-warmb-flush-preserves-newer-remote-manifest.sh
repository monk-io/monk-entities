#!/bin/bash
# Regression test for the manifest half of architecture review Finding 11 (2026-08-19).
# Finding 11's flush-orphans fix must not reintroduce Finding 10 (the manifest has no
# monotonicity guarantee): if warm-b's own volume holds an OLDER local manifest than what's
# already in R2 — e.g. this volume ran an earlier, now-superseded attempt — pushing that
# stale manifest would roll R2's commit point backward. Seeds R2 with a newer manifest
# (step=140) than the local one (step=20), then confirms the flush pushes the stranded
# checkpoint FILE (safe, additive) but leaves R2's manifest alone, and that warm-b still
# ends up on step 140 after its normal pull. Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-warmb-flush-preserves-newer-remote-manifest.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
. "$JOB_DIR/test/lib.sh"

mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t" \
  "$SCRATCH/workspace/data/t-dataset" "$SCRATCH/workspace/runs/t/ckpt"

DS_CONTENT="fake-dataset-shard-content-flush-monotonic-test"
printf '%s' "$DS_CONTENT" > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"
printf '%s' "$DS_CONTENT" > "$SCRATCH/workspace/data/t-dataset/shard-00.bin"
DH=$(compute_dataset_hash "$SCRATCH/workspace" "/workspace/data/t-dataset" "$IMAGE" "$JOB_DIR")

# R2 already holds the current, newer commit point (step 140) — written by a run
# elsewhere while this volume was stranded.
NEW_CKPT_CONTENT="current-checkpoint-bytes"
printf '%s' "$NEW_CKPT_CONTENT" > "$SCRATCH/fr2-runs/t/step-000140.bin"
NEW_CKH=$(printf '%s' "$NEW_CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/fr2-runs/t/manifest.json" <<JSON
{"step":140,"checkpoint":"step-000140.bin","dataset_sha256":"$DH","checkpoint_sha256":"$NEW_CKH"}
JSON

# This volume's own local state is stale: an older manifest and checkpoint from a run
# that R2 has since moved past.
OLD_CKPT_CONTENT="stranded-older-checkpoint-bytes"
printf '%s' "$OLD_CKPT_CONTENT" > "$SCRATCH/workspace/runs/t/ckpt/step-000020.bin"
OLD_CKH=$(printf '%s' "$OLD_CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/workspace/runs/t/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$DH","checkpoint_sha256":"$OLD_CKH"}
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
  echo "FAIL: expected the stranded checkpoint FILE to still be pushed — checkpoint files are additive and safe"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q "RESULT: flush_manifest .*kept R2's manifest (step=140)"; then
  echo "FAIL: expected flush_manifest to keep R2's newer manifest rather than overwrite it with the stale local one"
  exit 1
fi
REMOTE_STEP=$(tr -d ' \n' < "$SCRATCH/fr2-runs/t/manifest.json" \
  | sed -n 's/.*"step":\([0-9]*\).*/\1/p')
if [ "$REMOTE_STEP" != "140" ]; then
  echo "FAIL: R2's manifest was rolled backward — expected step=140 on R2 after the run, got step=$REMOTE_STEP"
  exit 1
fi
if [ ! -f "$SCRATCH/fr2-runs/t/step-000020.bin" ]; then
  echo "FAIL: the stranded checkpoint file itself should still have reached R2 even though the manifest didn't"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: manifest .*step=140'; then
  echo "FAIL: warm-b's own normal pull should still land on R2's current manifest (step=140), not the stale local one"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: checkpointB_integrity .*OK'; then
  echo "FAIL: expected checkpointB_integrity OK against the current (step=140) checkpoint after warm-b's pull"
  exit 1
fi
echo "PASS"
