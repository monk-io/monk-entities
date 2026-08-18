#!/bin/bash
# Generic external-storage sync sidecar. Watches a checkpoint directory for new
# step-*.bin files, uploads each one to object storage, advances a run manifest, and
# mirrors a log file to the same storage — decoupled from whatever the "main" workload
# actually is. Meant to be launched in the background (`&`) alongside a real training
# process, not embedded inside it: the workload only has to write checkpoints
# atomically (write to a temp name, then rename) into CKPT_DIR and, on completion,
# create DRAIN_FILE so this script can flush and exit instead of being killed mid-sync.
#
# Protocol matches the hybrid architecture doc: checkpoint upload, THEN manifest
# write — the manifest write is the commit point, so a reader never sees a manifest
# pointing at a checkpoint object that isn't there yet.
set -uo pipefail

: "${RUNS_BUCKET:?RUNS_BUCKET env var required}"
: "${EXP:?EXP env var required}"
: "${DATASET_SHA256:?DATASET_SHA256 env var required}"
: "${CKPT_DIR:?CKPT_DIR env var required}"
LOG_FILE=${LOG_FILE:-}
DRAIN_FILE=${DRAIN_FILE:-/tmp/drain}
SYNC_INTERVAL=${SYNC_INTERVAL:-3}

RC=(rclone --s3-no-check-bucket --retries 3 --contimeout 20s --timeout 90s)

log(){
  if [ -n "$LOG_FILE" ]; then echo "$1" | tee -a "$LOG_FILE"; else echo "$1"; fi
}
sync_log(){
  [ -n "$LOG_FILE" ] && "${RC[@]}" copyto "$LOG_FILE" "r2:$RUNS_BUCKET/$EXP/logs/$(basename "$LOG_FILE")" 2>/dev/null
  return 0
}

P=""
while true; do
  L=$(ls -1 "$CKPT_DIR"/step-*.bin 2>/dev/null | sort -V | tail -1)
  if [ -n "$L" ] && [ "$L" != "$P" ]; then
    st=$(basename "$L" .bin); st=${st#step-}
    if "${RC[@]}" copyto "$L" "r2:$RUNS_BUCKET/$EXP/ckpt/$(basename "$L")" \
        --s3-upload-concurrency 8 --s3-chunk-size 16M 2>/dev/null; then
      MJSON="/tmp/manifest-$$.json"
      jq -n --arg s "$st" --arg k "$EXP/ckpt/$(basename "$L")" --arg d "$DATASET_SHA256" \
        '{step:($s|tonumber),checkpoint:$k,dataset_sha256:$d}' > "$MJSON"
      "${RC[@]}" copyto "$MJSON" "r2:$RUNS_BUCKET/$EXP/manifest.json" 2>/dev/null \
        && log "SYNC: $(basename "$L") + manifest -> R2"
      rm -f "$MJSON"
      P="$L"
    fi
  fi
  if [ -f "$DRAIN_FILE" ]; then
    log "SYNC: drained"
    sync_log
    exit 0
  fi
  sync_log
  sleep "$SYNC_INTERVAL"
done
