#!/bin/bash
# Regression test for architecture review Finding 2 (2026-08-19): before this fix, warm-b
# pulled the ENTIRE checkpoint history under $REMOTE_RUNS instead of just the checkpoint the
# manifest names. Exercises entrypoint.sh's warm-b role against a local-filesystem fake R2
# (RCLONE_CONFIG_R2_TYPE=local) with three retained checkpoints in "R2", only one of which
# the manifest names as current. Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-warmb-pulls-only-named-checkpoint.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t" "$SCRATCH/workspace"
DS_CONTENT="fake-dataset-shard-content-12345"
printf '%s' "$DS_CONTENT" > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"
DH=$(printf '%s' "$DS_CONTENT" | sha256sum | cut -d' ' -f1)

# Three retained checkpoints in "R2" -- only step-000060.bin is the manifest's current one.
printf 'old-checkpoint-1' > "$SCRATCH/fr2-runs/t/step-000020.bin"
printf 'old-checkpoint-2' > "$SCRATCH/fr2-runs/t/step-000040.bin"
CKPT_CONTENT="latest-checkpoint-bytes"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/fr2-runs/t/step-000060.bin"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/fr2-runs/t/manifest.json" <<JSON
{"step":60,"checkpoint":"step-000060.bin","dataset_sha256":"$DH","checkpoint_sha256":"$CKH"}
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

CK_DIR="$SCRATCH/workspace/runs/t/ckpt"
if [ -f "$CK_DIR/step-000020.bin" ] || [ -f "$CK_DIR/step-000040.bin" ]; then
  echo "FAIL: warm-b pulled old, non-current checkpoints — it should only fetch the one the manifest names"
  ls -la "$CK_DIR"
  exit 1
fi
if [ ! -f "$CK_DIR/step-000060.bin" ]; then
  echo "FAIL: warm-b did not pull the manifest's current checkpoint at all"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: checkpointB_integrity .*OK'; then
  echo "FAIL: expected checkpointB_integrity OK — the pulled checkpoint should still match the manifest hash"
  exit 1
fi
echo "PASS"
