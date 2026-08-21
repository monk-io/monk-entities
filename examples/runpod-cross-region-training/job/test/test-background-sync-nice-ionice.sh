#!/bin/bash
# Regression test for the sync/GPU resource-contention mitigation (2026-08-20): start_sync()
# now launches sync-to-path.sh under `ionice -c3` (idle I/O class) and a low `nice` value, so
# the background upload only gets CPU/disk I/O when the training process doesn't need it.
# Async upload only decoupled the *blocking* dependency (training never waits on the PUT);
# it never decoupled *resource* usage on a single-container pod, which is what this fixes.
#
# Verifies against the real image + a detached container (not `docker run --rm ... | grep`,
# which can't inspect a still-running process) that the backgrounded sync-to-path.sh process
# actually has nice=19 and ionice=idle applied — not just that the sync still completes.
# Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-background-sync-nice-ionice.sh
set -uo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=${IMAGE:-imanachyn/runpod-hybrid-job:latest}
SCRATCH=$(mktemp -d)
cleanup(){ docker rm -f "$CID" >/dev/null 2>&1; rm -rf "$SCRATCH"; }
trap cleanup EXIT

mkdir -p "$SCRATCH/fr2-data/t-dataset" "$SCRATCH/fr2-runs/t" "$SCRATCH/workspace"
printf 'fake-dataset-content' > "$SCRATCH/fr2-data/t-dataset/shard-00.bin"

CID=$(docker run -d \
  --user "$(id -u):$(id -g)" \
  -v "$SCRATCH/fr2-data":/fr2-data \
  -v "$SCRATCH/fr2-runs":/fr2-runs \
  -v "$SCRATCH/workspace":/workspace \
  -v "$JOB_DIR/entrypoint.sh":/usr/local/bin/entrypoint.sh:ro \
  -v "$JOB_DIR/sync-to-path.sh":/usr/local/bin/sync-to-path.sh:ro \
  -e ROLE=gpu-a -e EXP=t -e DATA_BUCKET=/fr2-data -e RUNS_BUCKET=/fr2-runs \
  -e RCLONE_CONFIG_R2_TYPE=local \
  --entrypoint bash "$IMAGE" \
  -c 'timeout 30 /usr/local/bin/entrypoint.sh')

# Poll (not a fixed sleep) for the backgrounded sync-to-path.sh process to appear, and read
# its pid/nice/ionice in ONE exec call — splitting discovery and inspection into two separate
# `docker exec` calls is racy: short-lived helper processes from the discovery call itself can
# reuse the pid by the time a second call reads it.
RESULT=""
for i in $(seq 1 20); do
  RESULT=$(docker exec "$CID" sh -c '
    for p in /proc/[0-9]*; do
      cmd=$(tr "\0" " " < "$p/cmdline" 2>/dev/null)
      if [ "$cmd" = "/bin/bash /usr/local/bin/sync-to-path.sh " ] || [ "$cmd" = "/bin/bash /usr/local/bin/sync-to-path.sh" ]; then
        pid=$(basename "$p")
        echo "pid=$pid"
        echo "nice=$(awk "{print \$19}" "$p/stat")"
        ionice -p "$pid"
        exit 0
      fi
    done
    exit 1
  ' 2>/dev/null)
  [ -n "$RESULT" ] && break
  sleep 1
done

echo "$RESULT"

if [ -z "$RESULT" ]; then
  echo "FAIL: never found a running sync-to-path.sh process to inspect"
  exit 1
fi
if ! echo "$RESULT" | grep -q "^nice=19$"; then
  echo "FAIL: expected nice=19 on the backgrounded sync-to-path.sh process"
  exit 1
fi
if ! echo "$RESULT" | grep -qi "idle"; then
  echo "FAIL: expected ionice class 'idle' on the backgrounded sync-to-path.sh process"
  exit 1
fi
echo "PASS"
