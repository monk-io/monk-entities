#!/bin/bash
# Regression test for the BWLIMIT lever (2026-08-20, sync/GPU contention mitigation): a
# bandwidth cap has a real cost even with no contention (unlike ionice/nice, which are free
# when idle), so it must default to off and only apply when a caller explicitly sets it.
#
# Extracts and evaluates sync-to-path.sh's own BWLIMIT/RC construction lines (the same
# "reuse the live definition" pattern lib.sh uses for dataset_hash()) rather than
# reimplementing the logic or racing a real container's short-lived rclone child process —
# a Docker-timing test here would be fragile and risks leaking an orphaned container.
# Run from repo root:
#   bash examples/runpod-cross-region-training/job/test/test-sync-bwlimit-opt-in.sh
set -euo pipefail

JOB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$JOB_DIR/sync-to-path.sh"

extract_and_eval(){
  local bwlimit_env="$1"
  bash -c "
    BWLIMIT='$bwlimit_env'
    $(grep -A1 '^BWLIMIT=\${BWLIMIT:-}' "$SCRIPT")
    $(grep '^RC=(rclone' "$SCRIPT")
    $(grep -- '--bwlimit' "$SCRIPT" | grep -v '^#')
    echo \"\${RC[@]}\"
  "
}

if ! grep -q '^BWLIMIT=\${BWLIMIT:-}' "$SCRIPT"; then
  echo "FAIL: could not find BWLIMIT default line in sync-to-path.sh — did its shape change?"
  exit 1
fi

UNSET_RC=$(extract_and_eval "")
SET_RC=$(extract_and_eval "8K")

echo "BWLIMIT unset -> RC=[$UNSET_RC]"
echo "BWLIMIT=8K    -> RC=[$SET_RC]"

if echo "$UNSET_RC" | grep -q -- '--bwlimit'; then
  echo "FAIL: --bwlimit appeared with BWLIMIT unset — should default to no cap"
  exit 1
fi
if ! echo "$SET_RC" | grep -q -- '--bwlimit 8K'; then
  echo "FAIL: expected '--bwlimit 8K' in RC when BWLIMIT=8K — the opt-in flag never applied"
  exit 1
fi
echo "PASS"
