#!/bin/bash
# Regression test for architecture review Finding 6 (2026-08-19): before this fix, every
# experiment's dataset landed in the same bare $V/data directory, so two experiments
# sharing one region's volume (the whole point of the hybrid's shared-cache economics,
# per §2 of the hybrid architecture doc) would union their datasets into one directory
# that never matches either manifest. Exercises entrypoint.sh's warm-b role against a
# /workspace that already holds a DIFFERENT experiment's warmed dataset, and confirms the
# new experiment's own warm+integrity check isn't corrupted by the other's presence. Run
# from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-dataset-path-keyed-by-experiment.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

# Experiment t2 already warmed its own dataset onto the shared volume, under whatever
# path this version of entrypoint.sh uses for a warmed dataset (t2-dataset/ if keyed,
# bare data/ if not — either way, this file must survive t1's run untouched).
mkdir -p "$SCRATCH/workspace"
T2_CONTENT="dataset-two-content"

# Experiment t1 is the one actually being warmed by this test run.
mkdir -p "$SCRATCH/fr2-data/t1-dataset" "$SCRATCH/fr2-runs/t1"
T1_CONTENT="dataset-one-content"
printf '%s' "$T1_CONTENT" > "$SCRATCH/fr2-data/t1-dataset/shard-00.bin"
DH=$(printf '%s' "$T1_CONTENT" | sha256sum | cut -d' ' -f1)
CKPT_CONTENT="t1-checkpoint-bytes"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/fr2-runs/t1/step-000020.bin"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
cat > "$SCRATCH/fr2-runs/t1/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$DH","checkpoint_sha256":"$CKH"}
JSON

# Pre-seed t2's warmed dataset directly under the flat, unkeyed path this bug produces —
# reproducing "t2 already ran on this shared volume." A fixed entrypoint.sh must key t1
# somewhere else entirely; a buggy one will pull t1's shard into this same directory,
# alongside t2's, and t1's own hash check will then see the union of both files, not just
# its own — a MISMATCH the fix must not produce.
mkdir -p "$SCRATCH/workspace/data"
printf '%s' "$T2_CONTENT" > "$SCRATCH/workspace/data/t2-shard-00.bin"

OUTPUT=$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/fr2-data":/fr2-data \
  -v "$SCRATCH/fr2-runs":/fr2-runs \
  -v "$SCRATCH/workspace":/workspace \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -e ROLE=warm-b -e EXP=t1 -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" \
  -c 'timeout 10 /usr/local/bin/entrypoint.sh' 2>&1) || true

echo "$OUTPUT" | grep -E "RESULT:|SYNC:" || true

if ! echo "$OUTPUT" | grep -q 'RESULT: volumeB_integrity .*OK'; then
  echo "FAIL: t1's own dataset integrity check should pass regardless of t2's leftover data on the shared volume"
  exit 1
fi

# t2's shard must still exist, byte-for-byte, after t1's run -- proves t1 didn't write into
# (or delete/overwrite anything in) whatever directory holds t2's data.
if [ "$(cat "$SCRATCH/workspace/data/t2-shard-00.bin" 2>/dev/null)" != "$T2_CONTENT" ]; then
  echo "FAIL: experiment t2's pre-existing dataset was disturbed by experiment t1's warm"
  exit 1
fi

echo "PASS"
