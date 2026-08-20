#!/bin/bash
# Hybrid cross-region training job, driven entirely by env vars (ROLE selects the phase).
#
# Adapted from the raw validation scripts in the sibling `monk` repo
# (doc/internal/runpod-e2e/e2e.sh and e2e-b.sh) that proved this handoff live across
# EU-RO-1 and US-IL-1. Baked into an image rather than passed through the pod's `args`
# field because v2's `args` is a single string appended to the entrypoint — a real
# multi-line script sent through it silently crash-loops (see the example README).
#
# The checkpoint sync and dataset/checkpoint warm logic live in two generic scripts,
# sync-to-path.sh and warm-from-path.sh — they move a path to/from a remote and,
# optionally, an opaque marker file, with no idea what training is or what a
# "checkpoint" is. This script owns everything specific to that: the manifest's
# {step, checkpoint, dataset_sha256} schema, the step-NNNNNN.bin naming, and the
# hash/cache-hit assertions that validate this demo. A real job image could reuse the
# two generic scripts unchanged behind a real training/inference command; only this
# file would need to change.
#
# Two buckets, not one bucket with two prefixes: R2 tokens used for this are
# bucket-scoped, not prefix-scoped, so a single bucket wouldn't isolate dataset (read)
# traffic from runs (write) traffic.
#
# Protocol (unchanged from the validation): R2 is the source of truth. Checkpoints go
# to the volume AND to R2 — never only to the volume, since a volume is
# datacenter-pinned and can't serve a run that resumes elsewhere. The manifest write is
# the commit point: only after R2 has the checkpoint does the manifest advance.
#
# BACKGROUND_SYNC=false (default true) is an alternative flow for training images that
# can't run a background process alongside the real training command: gpu-a/gpu-b then
# only ever write to the volume, and a separate ROLE=sync-out pod (attached to the same
# volume after this one is deleted) pushes the checkpoint dir + manifest to R2 in one
# shot. See the README's "Alternative: no background process in the GPU pod" section.
# Trade-off: R2 gets no incremental visibility while the GPU pod is running — only once
# the sync-out pod runs, which for a real long job means periodic stop/sync/restart if
# you want mid-run cross-region resumability.
set -uo pipefail

: "${ROLE:?ROLE env var required: gpu-a | warm-b | gpu-b | sync-out}"
EXP=${EXP:-monk-hybrid-demo}
DATA=${DATA_BUCKET:?DATA_BUCKET env var required}
RUNS=${RUNS_BUCKET:?RUNS_BUCKET env var required}
BACKGROUND_SYNC=${BACKGROUND_SYNC:-true}
REMOTE_DATA="r2:$DATA/$EXP-dataset"
REMOTE_RUNS="r2:$RUNS/$EXP"

V=/workspace
# Keyed by the same $EXP-dataset identity as REMOTE_DATA, not a bare shared directory:
# two experiments sharing one region's volume (the scenario the hybrid's shared-cache
# economics depend on — see §2 of the hybrid architecture doc) would otherwise union
# their datasets into one directory that matches neither manifest (architecture review
# finding 6, 2026-08-19).
DATA_DIR="$V/data/$EXP-dataset"
CK="$V/runs/$EXP/ckpt"
LOGDIR="$V/runs/$EXP/logs"
mkdir -p "$DATA_DIR" "$CK" "$LOGDIR"
LOG="$LOGDIR/$ROLE.log"
DRAIN="/tmp/drain-$ROLE"
# On the volume, not /tmp: a sync-out pod attaching after this one is deleted needs to
# read whatever gpu-a/gpu-b last wrote here, and /tmp doesn't survive pod deletion.
MANIFEST_FILE="$V/runs/$EXP/manifest.json"

say(){ echo "### $*" | tee -a "$LOG"; }
res(){ printf 'RESULT: %-30s %s\n' "$1" "$2" | tee -a "$LOG"; }

PHASE_T0=$(date +%s.%N)
say "ROLE=$ROLE exp=$EXP dc=${RUNPOD_DC_ID:-?} $(date -u +%FT%TZ)"
res "rclone" "$(rclone version | head -1)"
RC=(rclone --s3-no-check-bucket --retries 3 --contimeout 20s --timeout 90s)

# Log survives the pod: mirrored to R2 so the operator can read it without SSH.
sync_log(){
  local err
  if ! err=$("${RC[@]}" copyto "$LOG" "$REMOTE_RUNS/logs/$ROLE.log" 2>&1); then
    echo "SYNC: FAILED log mirror -> $REMOTE_RUNS/logs/$ROLE.log: $err" >&2
  fi
}

# This demo's manifest schema — sync-to-path.sh/warm-from-path.sh don't know this
# shape exists; they just move MANIFEST_FILE's bytes as an opaque marker. Written to a
# temp name and renamed into place — same atomicity the checkpoint files themselves
# use — so the sync sidecar's own timer-driven read of this file (running
# concurrently in the background) never catches a half-written manifest.
write_manifest(){
  local tmp="$MANIFEST_FILE.tmp"
  jq -n --arg s "$1" --arg k "$2" --arg d "$3" --arg h "$4" \
    '{step:($s|tonumber),checkpoint:$k,dataset_sha256:$d,checkpoint_sha256:$h}' > "$tmp"
  mv "$tmp" "$MANIFEST_FILE"
}
# Flatten before parsing: pretty-printed JSON's `"step": 60` (with a space) reads as the
# space rather than the value under a naive pattern — an already-hit false negative.
get(){ tr -d ' \n' < "$MANIFEST_FILE" | sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" | head -1; }

# Launches sync-to-path.sh in the background for the current checkpoint dir + manifest.
# Sets $SYNC_PID. Assumes write_manifest has already been called at least once.
start_sync(){
  LOCAL_PATH="$CK" REMOTE="$REMOTE_RUNS" MARKER_FILE="$MANIFEST_FILE" MARKER_NAME=manifest.json \
    LOG_FILE="$LOG" DRAIN_FILE="$DRAIN" SYNC_INTERVAL=3 \
    /usr/local/bin/sync-to-path.sh &
  SYNC_PID=$!
}

case "$ROLE" in

# ─────────────────────────────────────────────── region A, GPU: warm, train, checkpoint
gpu-a)
  if command -v nvidia-smi >/dev/null 2>&1; then
    res "gpu" "$(nvidia-smi -L | head -1)"
  else
    res "gpu" "none visible (this demo does not use CUDA)"
  fi

  say "--- warm volume A from R2 (first use) ---"
  t0=$(date +%s.%N)
  if ! REMOTE="$REMOTE_DATA" LOCAL_PATH="$DATA_DIR" /usr/local/bin/warm-from-path.sh 2>&1 | tail -2 | tee -a "$LOG"; then
    res "dataset" "FAILED to warm from R2"
    sync_log; exec sleep infinity
  fi
  t1=$(date +%s.%N)
  B=$(du -sb "$DATA_DIR" | cut -f1)
  awk -v b="$B" -v a="$t0" -v c="$t1" \
    'BEGIN{d=c-a; if(d<=0)d=0.001; printf "RESULT: %-30s %.1f MiB in %.1fs (%.0f MB/s)\n","volA_warm_from_r2",b/1048576,d,(b/1048576)/d}' \
    | tee -a "$LOG"
  DH=$(cat "$DATA_DIR"/* | sha256sum | cut -d' ' -f1)
  res "dataset_sha256" "${DH:0:16}…"

  if [ "$BACKGROUND_SYNC" = "true" ]; then
    say "--- train, checkpoint to VOLUME; sync-to-path.sh uploads in the background ---"
  else
    say "--- train, checkpoint to VOLUME only; R2 push deferred to a separate sync-out pod ---"
  fi
  # Prime the manifest before the sidecar starts so its first tick has something to
  # upload once a checkpoint exists.
  write_manifest 0 "" "$DH" ""
  [ "$BACKGROUND_SYNC" = "true" ] && start_sync

  # This loop stands in for the real training command. It only has to write
  # checkpoints atomically into $CK and keep the manifest current — the sidecar
  # above (if running) handles everything else.
  for s in $(seq 1 60); do
    sleep 0.3
    if (( s % 20 == 0 )); then
      CKPT_NAME="step-$(printf '%06d' "$s").bin"
      { echo "exp=$EXP step=$s data=$DH"; head -c 8388608 /dev/zero; } > "$CK/.tmp"
      sync; mv "$CK/.tmp" "$CK/$CKPT_NAME"
      LAST_CKPT_AT=$(date +%s.%N)
      CKH=$(sha256sum "$CK/$CKPT_NAME" | cut -d' ' -f1)
      write_manifest "$s" "$CKPT_NAME" "$DH" "$CKH"
      echo "TRAIN: ckpt at step $s" | tee -a "$LOG"
    fi
  done
  if [ "$BACKGROUND_SYNC" = "true" ]; then
    touch "$DRAIN"; wait "$SYNC_PID"
    # Write-to-R2-visible lag for the last checkpoint: how far behind is the backup,
    # not just "did the sync loop eventually catch up" — the number that matters for a
    # real job deciding how tolerant it can be of a mid-run region failure.
    awk -v a="$LAST_CKPT_AT" -v c="$(date +%s.%N)" \
      'BEGIN{printf "RESULT: %-30s %.1fs\n","sync_lag_last_checkpoint",c-a}' | tee -a "$LOG"
  fi
  res "volA_holds" "$(ls "$CK" | tr '\n' ' ')"
  if [ "$BACKGROUND_SYNC" = "true" ]; then
    res "phase_complete" "gpu-a reached step 60 — confirm the RESULT lines above, then delete this pod"
  else
    res "phase_complete" "gpu-a reached step 60 (R2 push deferred) — delete this pod, then run sync-out to push to R2"
  fi
  ;;

# ─────────────────────────────────────────────── region B, CPU: warm the cache
warm-b)
  res "nproc" "$(nproc)"

  # The download side (fetch dataset, checkpoint dir, and manifest) lives in
  # warm-from-path.sh — generic enough for any warmer. What's left here is specific
  # to validating this demo: comparing the downloaded dataset's hash against what
  # the manifest claims.
  t0=$(date +%s.%N)
  say "--- warm volume B: dataset ---"
  td0=$(date +%s.%N)
  if ! REMOTE="$REMOTE_DATA" LOCAL_PATH="$DATA_DIR" /usr/local/bin/warm-from-path.sh 2>&1 | tee -a "$LOG"; then
    res "dataset" "FAILED to warm from R2"
    sync_log; exec sleep infinity
  fi
  td1=$(date +%s.%N)
  awk -v b="$(du -sb "$DATA_DIR" | cut -f1)" -v a="$td0" -v c="$td1" \
    'BEGIN{d=c-a; if(d<=0)d=0.001; printf "RESULT: %-30s %.1f MiB in %.1fs (%.0f MB/s)\n","dataset_warm_took",b/1048576,d,(b/1048576)/d}' \
    | tee -a "$LOG"

  say "--- warm volume B: checkpoint + manifest ---"
  tc0=$(date +%s.%N)
  if ! REMOTE="$REMOTE_RUNS" MARKER_FILE="$MANIFEST_FILE" MARKER_NAME=manifest.json \
      /usr/local/bin/warm-from-path.sh 2>&1 | tee -a "$LOG"; then
    res "manifest" "MISSING — run the gpu-a phase first"
    sync_log; exec sleep infinity
  fi
  MS=$(get step); MC=$(get checkpoint); MD=$(get dataset_sha256); MCH=$(get checkpoint_sha256)
  # Pull only the checkpoint the manifest names, not the whole run's history — a run with
  # several retained checkpoints would otherwise warm every one of them just to use the
  # latest (architecture review finding 2, 2026-08-19).
  if ! REMOTE="$REMOTE_RUNS/$(basename "$MC")" LOCAL_PATH="$CK" /usr/local/bin/warm-from-path.sh 2>&1 | tee -a "$LOG"; then
    res "checkpoint" "FAILED to warm $MC from R2"
    sync_log; exec sleep infinity
  fi
  tc1=$(date +%s.%N)
  awk -v b="$(du -sb "$CK" | cut -f1)" -v a="$tc0" -v c="$tc1" \
    'BEGIN{d=c-a; if(d<=0)d=0.001; printf "RESULT: %-30s %.1f MiB in %.1fs (%.0f MB/s)\n","checkpoint_warm_took",b/1048576,d,(b/1048576)/d}' \
    | tee -a "$LOG"
  t1=$(date +%s.%N)
  res "manifest" "step=$MS ckpt=$MC"
  awk -v a="$t0" -v c="$t1" 'BEGIN{printf "RESULT: %-30s %.1fs\n","warm_took",c-a}' | tee -a "$LOG"

  GH=$(cat "$DATA_DIR"/* | sha256sum | cut -d' ' -f1)
  if [ "$GH" = "$MD" ]; then res "volumeB_integrity" "OK matches manifest"; else res "volumeB_integrity" "MISMATCH"; fi
  CKF="$CK/$(basename "$MC")"
  if [ -f "$CKF" ] && [ "$(sha256sum "$CKF" | cut -d' ' -f1)" = "$MCH" ]; then
    res "checkpointB_integrity" "OK matches manifest"
  else
    res "checkpointB_integrity" "MISMATCH"
  fi
  res "volumeB_after" "data=$(ls "$DATA_DIR" | wc -l) ckpt=[$(ls "$CK" | tr '\n' ' ')]"
  res "phase_complete" "warm-b done — confirm integrity OK above, then delete this pod"
  ;;

# ─────────────────────────────────────────────── region B, GPU: resume from local cache
gpu-b)
  if command -v nvidia-smi >/dev/null 2>&1; then
    res "gpu" "$(nvidia-smi -L | head -1)"
  else
    res "gpu" "none visible (this demo does not use CUDA)"
  fi
  if ! REMOTE="$REMOTE_RUNS" MARKER_FILE="$MANIFEST_FILE" MARKER_NAME=manifest.json \
      /usr/local/bin/warm-from-path.sh 2>&1 | tee -a "$LOG"; then
    res "manifest" "MISSING — run the gpu-a and warm-b phases first"
    sync_log; exec sleep infinity
  fi
  MS=$(get step); MC=$(get checkpoint); MD=$(get dataset_sha256); MCH=$(get checkpoint_sha256)
  res "manifest_says" "step=$MS ckpt=$MC"

  say "--- read dataset FROM VOLUME (no R2 pull) ---"
  res "volume_dataset_files" "$(ls "$DATA_DIR" 2>/dev/null | wc -l)"
  t0=$(date +%s.%N); GH=$(cat "$DATA_DIR"/* | sha256sum | cut -d' ' -f1); t1=$(date +%s.%N)
  B=$(du -sb "$DATA_DIR" | cut -f1)
  awk -v b="$B" -v a="$t0" -v c="$t1" \
    'BEGIN{d=c-a; if(d<=0)d=0.001; printf "RESULT: %-30s %.1f MiB in %.2fs (%.0f MB/s)\n","volume_read_rate",b/1048576,d,(b/1048576)/d}' \
    | tee -a "$LOG"
  if [ "$GH" = "$MD" ]; then
    res "CACHE_HIT_dataset" "YES — volume data matches manifest, no R2 pull needed"
  else
    res "CACHE_HIT_dataset" "NO — stale cache ($GH vs $MD), pulling from R2"
    if ! REMOTE="$REMOTE_DATA" LOCAL_PATH="$DATA_DIR" /usr/local/bin/warm-from-path.sh 2>&1 | tee -a "$LOG"; then
      res "dataset_fallback" "FAILED to warm from R2"
      sync_log; exec sleep infinity
    fi
    GH=$(cat "$DATA_DIR"/* | sha256sum | cut -d' ' -f1)
    if [ "$GH" = "$MD" ]; then
      res "dataset_fallback" "OK — R2 pull now matches manifest"
    else
      res "dataset_fallback" "FAILED — R2 pull still does not match manifest ($GH vs $MD)"
      sync_log; exec sleep infinity
    fi
  fi

  say "--- resume from checkpoint ON THE VOLUME ---"
  CKF="$CK/$(basename "$MC")"
  if [ -f "$CKF" ] && [ "$(sha256sum "$CKF" | cut -d' ' -f1)" = "$MCH" ]; then
    res "CACHE_HIT_checkpoint" "YES — $(stat -c%s "$CKF") bytes, hash verified, read locally"
    res "ckpt_header" "$(head -c 80 "$CKF" | tr -d '\0')"
  else
    res "CACHE_HIT_checkpoint" "NO — missing or hash mismatch, pulling from R2"
    if ! REMOTE="$REMOTE_RUNS/$(basename "$MC")" LOCAL_PATH="$CK" /usr/local/bin/warm-from-path.sh 2>&1 | tee -a "$LOG"; then
      res "checkpoint_fallback" "FAILED to warm from R2"
      sync_log; exec sleep infinity
    fi
    if [ -f "$CKF" ] && [ "$(sha256sum "$CKF" | cut -d' ' -f1)" = "$MCH" ]; then
      res "checkpoint_fallback" "OK — R2 pull now matches manifest"
    else
      res "checkpoint_fallback" "FAILED — R2 pull still does not match manifest hash"
      sync_log; exec sleep infinity
    fi
  fi

  if [ "$BACKGROUND_SYNC" = "true" ]; then
    say "--- continue training past step $MS; sync-to-path.sh uploads in the background ---"
  else
    say "--- continue training past step $MS, VOLUME only; R2 push deferred to a separate sync-out pod ---"
  fi
  [ "$BACKGROUND_SYNC" = "true" ] && start_sync

  for s in $(seq $((MS + 1)) $((MS + 40))); do
    sleep 0.3
    if (( s % 20 == 0 )); then
      CKPT_NAME="step-$(printf '%06d' "$s").bin"
      { echo "exp=$EXP step=$s data=$GH"; head -c 8388608 /dev/zero; } > "$CK/.tmp"
      sync; mv "$CK/.tmp" "$CK/$CKPT_NAME"
      LAST_CKPT_AT=$(date +%s.%N)
      CKH=$(sha256sum "$CK/$CKPT_NAME" | cut -d' ' -f1)
      write_manifest "$s" "$CKPT_NAME" "$GH" "$CKH"
      echo "TRAIN: ckpt at step $s" | tee -a "$LOG"
    fi
  done
  if [ "$BACKGROUND_SYNC" = "true" ]; then
    touch "$DRAIN"; wait "$SYNC_PID"
    awk -v a="$LAST_CKPT_AT" -v c="$(date +%s.%N)" \
      'BEGIN{printf "RESULT: %-30s %.1fs\n","sync_lag_last_checkpoint",c-a}' | tee -a "$LOG"
    res "phase_complete" "gpu-b reached step $((MS + 40)) — confirm CACHE_HIT lines above, then delete this pod"
  else
    res "phase_complete" "gpu-b reached step $((MS + 40)) (R2 push deferred) — delete this pod, then run sync-out to push to R2"
  fi
  ;;

# ─────────────────────────────────────── generic, CPU: one-shot outbound push (no training)
# The "universal CPU pod, pick a direction" counterpart to warm-b: attaches to the SAME
# volume a gpu-a/gpu-b pod (run with BACKGROUND_SYNC=false) just wrote to, then pushes
# whatever's there to R2 in one shot and exits — no watch-loop needed. Pre-touching
# $DRAIN before calling sync-to-path.sh turns its normal watch-loop into exactly that:
# one real sync pass, one confirmatory pass (same drain-race-closing behavior the
# background sidecar relies on), then exit.
sync-out)
  say "--- push volume's checkpoint dir + manifest to R2 (one-shot) ---"
  if [ ! -f "$MANIFEST_FILE" ]; then
    res "manifest" "MISSING on volume — run gpu-a/gpu-b with BACKGROUND_SYNC=false first"
    sync_log; exec sleep infinity
  fi
  touch "$DRAIN"
  LOCAL_PATH="$CK" REMOTE="$REMOTE_RUNS" MARKER_FILE="$MANIFEST_FILE" MARKER_NAME=manifest.json \
    LOG_FILE="$LOG" DRAIN_FILE="$DRAIN" /usr/local/bin/sync-to-path.sh
  res "synced" "$(ls "$CK" | tr '\n' ' ')"
  res "phase_complete" "sync-out pushed $(ls "$CK" | wc -l) checkpoint(s) + manifest to R2 — delete this pod"
  ;;

*)
  res "error" "unknown ROLE=$ROLE"
  ;;
esac

awk -v a="$PHASE_T0" -v c="$(date +%s.%N)" \
  'BEGIN{printf "RESULT: %-30s %.1fs\n","phase_wall_clock",c-a}' | tee -a "$LOG"
sync_log
# A pod whose command exits gets restarted by RunPod and re-runs the job (measured — see
# the hybrid architecture doc). Park here instead of exiting, so a slow operator doesn't
# accidentally get a second, billed run before issuing the delete.
say "=== $ROLE complete — pod is now idling. Delete it once you've confirmed success above. ==="
exec sleep infinity
