#!/bin/bash
# Regression test for architecture review Finding 5 (2026-08-19), the hard-crash half:
# before this fix, `cat "$DATA_DIR"/* | sha256sum` hit the shell's ARG_MAX with real shard
# counts. Worse than a clean crash: because the hashing pipeline's exit status was never
# checked, the failure was SILENT — it produced the well-known empty-input hash
# (e3b0c442...) instead of erroring or computing a real hash. This test creates 150,000
# tiny files (well past this container's actual ARG_MAX of 2097152 bytes, confirmed via
# `getconf ARG_MAX`) directly under the keyed local dataset path and checks gpu-b's
# cache-hit read of it. Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-dataset-hash-many-shards.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT

mkdir -p "$SCRATCH/fr2-data" "$SCRATCH/fr2-runs/t" "$SCRATCH/workspace/data/t-dataset"

# 150,000 tiny files, created in 100 batched touch calls (not 150,000 individual forks) so
# fixture setup itself stays fast.
cd "$SCRATCH/workspace/data/t-dataset"
for batch in $(seq 0 99); do
  eval touch "shard-${batch}-{00001..01500}.bin"
done
cd - >/dev/null

# The manifest's dataset_sha256 is whatever a correct, ARG_MAX-safe hash function computes
# for this exact fixture — precomputed once, independently, with the same
# find | sort | xargs formula the fix uses, so this test doesn't just check "no crash", it
# checks the hash is actually right. Mounted at the SAME path (/workspace/data/t-dataset)
# the real run below uses — sha256sum's output lines include the file path, so hashing the
# same content through a different mount path produces a different combined hash.
EXPECTED_HASH=$(docker run --rm --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/workspace":/workspace --entrypoint bash "$IMAGE" \
  -c 'find /workspace/data/t-dataset -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d" " -f1')

CKPT_CONTENT="fake-checkpoint-bytes"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/fr2-runs/t/step-000020.bin"
CKH=$(printf '%s' "$CKPT_CONTENT" | sha256sum | cut -d' ' -f1)
mkdir -p "$SCRATCH/workspace/runs/t/ckpt"
printf '%s' "$CKPT_CONTENT" > "$SCRATCH/workspace/runs/t/ckpt/step-000020.bin"
cat > "$SCRATCH/fr2-runs/t/manifest.json" <<JSON
{"step":20,"checkpoint":"step-000020.bin","dataset_sha256":"$EXPECTED_HASH","checkpoint_sha256":"$CKH"}
JSON

OUTPUT=$(docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/fr2-data":/fr2-data \
  -v "$SCRATCH/fr2-runs":/fr2-runs \
  -v "$SCRATCH/workspace":/workspace \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -e ROLE=gpu-b -e EXP=t -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e BACKGROUND_SYNC=false -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" \
  -c 'timeout 30 /usr/local/bin/entrypoint.sh' 2>&1) || true

echo "$OUTPUT" | grep -E "RESULT:|SYNC:|Argument list too long" || true

if echo "$OUTPUT" | grep -qi "argument list too long"; then
  echo "FAIL: dataset hashing hit ARG_MAX with 150,000 shards"
  exit 1
fi
if ! echo "$OUTPUT" | grep -q 'RESULT: CACHE_HIT_dataset .*YES'; then
  echo "FAIL: expected a dataset cache hit — the hash must be computed correctly at this shard count," \
       "not silently collapse to the empty-input hash"
  exit 1
fi
echo "PASS"
