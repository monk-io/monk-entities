#!/bin/bash
# Generic path-sync sidecar. Watches LOCAL_PATH, mirrors new/changed files to REMOTE,
# and — only if the caller sets MARKER_FILE — uploads that file's current bytes as a
# completion marker right after the directory sync succeeds. Knows nothing about what
# it's syncing: no filename convention, no fixed schema. Meant to be launched in the
# background (`&`) alongside a real workload, not embedded inside it: the workload
# only has to write into LOCAL_PATH atomically — a dot-prefixed temp name, then rename
# — and, on completion, create DRAIN_FILE so this script can flush and exit instead of
# being killed mid-sync. Dot-prefixed files are excluded from the sync, so a temp file
# caught mid-write is never uploaded under its temporary name.
#
# MARKER_FILE is opaque to this script by design: the caller decides what bytes go in
# it (a timestamp, a hash, a JSON blob describing its own progress) and rewrites it
# whenever it wants that shared with readers. This script only guarantees ordering —
# directory sync commits before the marker does — never the marker's contents.
set -uo pipefail

: "${LOCAL_PATH:?LOCAL_PATH env var required}"
: "${REMOTE:?REMOTE env var required}"
MARKER_FILE=${MARKER_FILE:-}
MARKER_NAME=${MARKER_NAME:-.sync-marker}
LOG_FILE=${LOG_FILE:-}
DRAIN_FILE=${DRAIN_FILE:-/tmp/drain}
SYNC_INTERVAL=${SYNC_INTERVAL:-3}

RC=(rclone --s3-no-check-bucket --retries 3 --contimeout 20s --timeout 90s)

log(){
  if [ -n "$LOG_FILE" ]; then echo "$1" | tee -a "$LOG_FILE"; else echo "$1"; fi
}
sync_log(){
  [ -n "$LOG_FILE" ] && "${RC[@]}" copyto "$LOG_FILE" "$REMOTE/logs/$(basename "$LOG_FILE")" 2>/dev/null
  return 0
}

# LOCAL_PATH's total size (dot-files excluded, same as the copy's own --exclude ".*",
# so a temp file caught mid-write is never counted either), compared against its size
# as of the END of the PREVIOUS pass (not before/after this pass's own copy call — the
# copy doesn't write to LOCAL_PATH, so that comparison is always zero), stands in for
# "bytes actually pushed this pass" without parsing rclone's own (version-dependent —
# see README) transfer stats: this demo's files are only ever added via atomic
# rename, never modified in place, so a size increase can only mean new data landed
# since the last pass.
LAST_SIZE=0
sync_pass(){
  local t0 t1 bytes_now delta
  t0=$(date +%s.%N)
  if "${RC[@]}" copy "$LOCAL_PATH" "$REMOTE" --exclude ".*" \
      --s3-upload-concurrency 8 --s3-chunk-size 16M 2>/dev/null; then
    t1=$(date +%s.%N)
    bytes_now=$(find "$LOCAL_PATH" -type f ! -name '.*' -printf '%s\n' 2>/dev/null \
      | awk '{s+=$1} END{print s+0}')
    delta=$(( bytes_now > LAST_SIZE ? bytes_now - LAST_SIZE : 0 ))
    LAST_SIZE=$bytes_now
    log "$(awk -v b="$delta" -v a="$t0" -v c="$t1" -v l="$LOCAL_PATH" -v r="$REMOTE" 'BEGIN{
      d=c-a; if(d<=0)d=0.001;
      if(b>0) printf "SYNC: %s -> %s (+%.1f MiB in %.1fs, %.0f MB/s)", l, r, b/1048576, d, (b/1048576)/d;
      else printf "SYNC: %s -> %s (no new data, %.1fs)", l, r, d;
    }')"
    if [ -n "$MARKER_FILE" ] && [ -f "$MARKER_FILE" ]; then
      "${RC[@]}" copyto "$MARKER_FILE" "$REMOTE/$MARKER_NAME" 2>/dev/null \
        && log "SYNC: marker -> $REMOTE/$MARKER_NAME"
    fi
  fi
}

while true; do
  sync_pass
  if [ -f "$DRAIN_FILE" ]; then
    # DRAIN_FILE only appears after the writer's last write completes (same process,
    # sequential order) — but it may have landed in the gap between the sync_pass
    # above starting and this check running, so that pass could have missed the
    # writer's final file. One more pass here, now that drain is confirmed, closes
    # that race deterministically instead of leaving it to chance.
    sync_pass
    log "SYNC: drained"
    sync_log
    exit 0
  fi
  sync_log
  sleep "$SYNC_INTERVAL"
done
