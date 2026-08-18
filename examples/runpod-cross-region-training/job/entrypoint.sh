#!/bin/bash
# Hybrid cross-region training job, driven entirely by env vars (ROLE selects the phase).
#
# Adapted from the raw validation scripts in the sibling `monk` repo
# (doc/internal/runpod-e2e/e2e.sh and e2e-b.sh) that proved this handoff live across
# EU-RO-1 and US-IL-1. Baked into an image rather than passed through the pod's `args`
# field because v2's `args` is a single string appended to the entrypoint — a real
# multi-line script sent through it silently crash-loops (see the example README).
#
# The checkpoint-upload-and-manifest logic lives in a separate script,
# sync-to-external-storage.sh, launched in the background here rather than embedded
# inline. That's what lets a real training command replace the toy training loop below
# without also having to reimplement the sync protocol — the sidecar only needs
# checkpoints written atomically into CKPT_DIR and a drain-file signal on completion.
#
# Two buckets, not one bucket with two prefixes: R2 tokens used for this are
# bucket-scoped, not prefix-scoped, so a single bucket wouldn't isolate dataset (read)
# traffic from runs (write) traffic.
#
# Protocol (unchanged from the validation): R2 is the source of truth. Checkpoints go
# to the volume AND to R2 — never only to the volume, since a volume is
# datacenter-pinned and can't serve a run that resumes elsewhere. The manifest write is
# the commit point: only after R2 has the checkpoint does the manifest advance.
set -uo pipefail

: "${ROLE:?ROLE env var required: gpu-a | warm-b | gpu-b}"
EXP=${EXP:-monk-hybrid-demo}
DATA=${DATA_BUCKET:?DATA_BUCKET env var required}
RUNS=${RUNS_BUCKET:?RUNS_BUCKET env var required}

V=/workspace
CK="$V/runs/$EXP/ckpt"
LOGDIR="$V/runs/$EXP/logs"
mkdir -p "$V/data" "$CK" "$LOGDIR"
LOG="$LOGDIR/$ROLE.log"
DRAIN="/tmp/drain-$ROLE"

say(){ echo "### $*" | tee -a "$LOG"; }
res(){ printf 'RESULT: %-30s %s\n' "$1" "$2" | tee -a "$LOG"; }

say "ROLE=$ROLE exp=$EXP dc=${RUNPOD_DC_ID:-?} $(date -u +%FT%TZ)"
res "rclone" "$(rclone version | head -1)"
RC=(rclone --s3-no-check-bucket --retries 3 --contimeout 20s --timeout 90s)

# Log survives the pod: mirrored to R2 so the operator can read it without SSH.
sync_log(){ "${RC[@]}" copyto "$LOG" "r2:$RUNS/$EXP/logs/$ROLE.log" 2>/dev/null; }

# Launches sync-to-external-storage.sh in the background for the current CKPT_DIR/log,
# using $1 as the dataset hash to embed in manifest writes. Sets $SYNC_PID.
start_sync(){
  RUNS_BUCKET="$RUNS" EXP="$EXP" DATASET_SHA256="$1" CKPT_DIR="$CK" LOG_FILE="$LOG" \
    DRAIN_FILE="$DRAIN" SYNC_INTERVAL=3 \
    /usr/local/bin/sync-to-external-storage.sh &
  SYNC_PID=$!
}

pull_manifest(){ "${RC[@]}" copyto "r2:$RUNS/$EXP/manifest.json" /tmp/m.json 2>/dev/null; }
# Flatten before parsing: pretty-printed JSON's `"step": 60` (with a space) reads as the
# space rather than the value under a naive pattern — an already-hit false negative.
get(){ tr -d ' \n' < /tmp/m.json | sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" | head -1; }

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
  "${RC[@]}" copy "r2:$DATA/$EXP-dataset" "$V/data" --transfers 16 2>&1 | tail -2 | tee -a "$LOG"
  t1=$(date +%s.%N)
  B=$(du -sb "$V/data" | cut -f1)
  awk -v b="$B" -v a="$t0" -v c="$t1" \
    'BEGIN{d=c-a; if(d<=0)d=0.001; printf "RESULT: %-30s %.1f MiB in %.1fs (%.0f MB/s)\n","volA_warm_from_r2",b/1048576,d,(b/1048576)/d}' \
    | tee -a "$LOG"
  DH=$(cat "$V"/data/* | sha256sum | cut -d' ' -f1)
  res "dataset_sha256" "${DH:0:16}…"

  say "--- train, checkpoint to VOLUME; sync-to-external-storage.sh uploads in the background ---"
  start_sync "$DH"

  # This loop stands in for the real training command. It only has to write
  # checkpoints atomically into $CK — the sidecar above handles everything else.
  for s in $(seq 1 60); do
    sleep 0.3
    if (( s % 20 == 0 )); then
      { echo "exp=$EXP step=$s data=$DH"; head -c 8388608 /dev/zero; } > "$CK/.tmp"
      sync; mv "$CK/.tmp" "$CK/step-$(printf '%06d' "$s").bin"
      echo "TRAIN: ckpt at step $s" | tee -a "$LOG"
    fi
  done
  touch "$DRAIN"; wait "$SYNC_PID"
  res "volA_holds" "$(ls "$CK" | tr '\n' ' ')"
  res "phase_complete" "gpu-a reached step 60 — confirm the RESULT lines above, then delete this pod"
  ;;

# ─────────────────────────────────────────────── region B, CPU: warm the cache
warm-b)
  res "nproc" "$(nproc)"

  # The download side (pull manifest, fetch dataset + checkpoint) lives in
  # warm-from-external-storage.sh — generic enough for any warmer. What's left here
  # is specific to validating this demo: comparing the downloaded dataset's hash
  # against what the manifest claims.
  t0=$(date +%s)
  if ! DATA_BUCKET="$DATA" RUNS_BUCKET="$RUNS" EXP="$EXP" DATA_DIR="$V/data" CKPT_DIR="$CK" \
      MANIFEST_FILE=/tmp/m.json /usr/local/bin/warm-from-external-storage.sh 2>&1 | tee -a "$LOG"; then
    res "manifest" "MISSING — run the gpu-a phase first"
    sync_log; exec sleep infinity
  fi
  t1=$(date +%s)
  MS=$(get step); MC=$(get checkpoint); MD=$(get dataset_sha256)
  res "manifest" "step=$MS ckpt=$MC"
  res "warm_took" "$((t1 - t0))s"

  GH=$(cat "$V"/data/* | sha256sum | cut -d' ' -f1)
  if [ "$GH" = "$MD" ]; then res "volumeB_integrity" "OK matches manifest"; else res "volumeB_integrity" "MISMATCH"; fi
  res "volumeB_after" "data=$(ls "$V/data" | wc -l) ckpt=[$(ls "$CK" | tr '\n' ' ')]"
  res "phase_complete" "warm-b done — confirm integrity OK above, then delete this pod"
  ;;

# ─────────────────────────────────────────────── region B, GPU: resume from local cache
gpu-b)
  if command -v nvidia-smi >/dev/null 2>&1; then
    res "gpu" "$(nvidia-smi -L | head -1)"
  else
    res "gpu" "none visible (this demo does not use CUDA)"
  fi
  if ! pull_manifest; then
    res "manifest" "MISSING — run the gpu-a and warm-b phases first"
    sync_log; exec sleep infinity
  fi
  MS=$(get step); MC=$(get checkpoint); MD=$(get dataset_sha256)
  res "manifest_says" "step=$MS ckpt=$MC"

  say "--- read dataset FROM VOLUME (no R2 pull) ---"
  res "volume_dataset_files" "$(ls "$V/data" 2>/dev/null | wc -l)"
  t0=$(date +%s.%N); GH=$(cat "$V"/data/* | sha256sum | cut -d' ' -f1); t1=$(date +%s.%N)
  B=$(du -sb "$V/data" | cut -f1)
  awk -v b="$B" -v a="$t0" -v c="$t1" \
    'BEGIN{d=c-a; if(d<=0)d=0.001; printf "RESULT: %-30s %.1f MiB in %.2fs (%.0f MB/s)\n","volume_read_rate",b/1048576,d,(b/1048576)/d}' \
    | tee -a "$LOG"
  if [ "$GH" = "$MD" ]; then
    res "CACHE_HIT_dataset" "YES — volume data matches manifest, no R2 pull needed"
  else
    res "CACHE_HIT_dataset" "NO — stale cache ($GH vs $MD)"
  fi

  say "--- resume from checkpoint ON THE VOLUME ---"
  CKF="$CK/$(basename "$MC")"
  if [ -f "$CKF" ]; then
    res "CACHE_HIT_checkpoint" "YES — $(stat -c%s "$CKF") bytes, read locally"
    res "ckpt_header" "$(head -c 80 "$CKF" | tr -d '\0')"
  else
    res "CACHE_HIT_checkpoint" "NO — not on volume, would need R2"
  fi

  say "--- continue training past step $MS; sync-to-external-storage.sh uploads in the background ---"
  start_sync "$GH"

  for s in $(seq $((MS + 1)) $((MS + 40))); do
    sleep 0.3
    if (( s % 20 == 0 )); then
      { echo "exp=$EXP step=$s data=$GH"; head -c 8388608 /dev/zero; } > "$CK/.tmp"
      sync; mv "$CK/.tmp" "$CK/step-$(printf '%06d' "$s").bin"
      echo "TRAIN: ckpt at step $s" | tee -a "$LOG"
    fi
  done
  touch "$DRAIN"; wait "$SYNC_PID"
  res "phase_complete" "gpu-b reached step $((MS + 40)) — confirm CACHE_HIT lines above, then delete this pod"
  ;;

*)
  res "error" "unknown ROLE=$ROLE"
  ;;
esac

sync_log
# A pod whose command exits gets restarted by RunPod and re-runs the job (measured — see
# the hybrid architecture doc). Park here instead of exiting, so a slow operator doesn't
# accidentally get a second, billed run before issuing the delete.
say "=== $ROLE complete — pod is now idling. Delete it once you've confirmed success above. ==="
exec sleep infinity
