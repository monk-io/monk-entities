#!/bin/bash
# Generic external-storage warm helper. Pulls a run manifest, downloads the dataset it
# points at, and downloads the checkpoint it references — read-only, no manifest
# writes, no checkpoint uploads. Counterpart to sync-to-external-storage.sh's write
# side. Leaves the manifest at MANIFEST_FILE so the caller can read step/checkpoint/
# dataset_sha256 back out itself; this script does no verification of what it
# downloaded — that's the caller's job, since what counts as "correct" is specific to
# whatever the caller is actually doing with the data.
set -uo pipefail

: "${DATA_BUCKET:?DATA_BUCKET env var required}"
: "${RUNS_BUCKET:?RUNS_BUCKET env var required}"
: "${EXP:?EXP env var required}"
DATA_DIR=${DATA_DIR:-/workspace/data}
CKPT_DIR=${CKPT_DIR:-/workspace/runs/$EXP/ckpt}
MANIFEST_FILE=${MANIFEST_FILE:-/tmp/m.json}

RC=(rclone --s3-no-check-bucket --retries 3 --contimeout 20s --timeout 90s)
# Flatten before parsing: pretty-printed JSON's `"step": 60` (with a space) reads as
# the space rather than the value under a naive pattern.
get(){ tr -d ' \n' < "$MANIFEST_FILE" | sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" | head -1; }

mkdir -p "$DATA_DIR" "$CKPT_DIR"

if ! "${RC[@]}" copyto "r2:$RUNS_BUCKET/$EXP/manifest.json" "$MANIFEST_FILE" 2>/dev/null; then
  echo "warm-from-external-storage: manifest r2:$RUNS_BUCKET/$EXP/manifest.json not found" >&2
  exit 1
fi

MC=$(get checkpoint)
if [ -z "$MC" ]; then
  echo "warm-from-external-storage: manifest at $MANIFEST_FILE has no 'checkpoint' field" >&2
  exit 1
fi

"${RC[@]}" copy "r2:$DATA_BUCKET/$EXP-dataset" "$DATA_DIR" --transfers 16
echo "Warmed dataset from r2:$DATA_BUCKET/$EXP-dataset to $DATA_DIR"

"${RC[@]}" copyto "r2:$RUNS_BUCKET/$MC" "$CKPT_DIR/$(basename "$MC")"
echo "Warmed checkpoint r2:$RUNS_BUCKET/$MC to $CKPT_DIR/$(basename "$MC")"
