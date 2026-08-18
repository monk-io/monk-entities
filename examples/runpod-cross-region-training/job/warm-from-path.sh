#!/bin/bash
# Generic path-warm helper, the read-side counterpart to sync-to-path.sh. Pulls
# whichever of LOCAL_PATH (a directory) and MARKER_FILE (a single object) the caller
# asks for from REMOTE — either, or both. Read-only: no writes back to REMOTE. Knows
# nothing about what it's pulling; the marker's bytes are handed back to the caller
# unparsed at MARKER_FILE for it to interpret however it likes.
set -uo pipefail

: "${REMOTE:?REMOTE env var required}"
LOCAL_PATH=${LOCAL_PATH:-}
MARKER_FILE=${MARKER_FILE:-}
MARKER_NAME=${MARKER_NAME:-.sync-marker}

if [ -z "$LOCAL_PATH" ] && [ -z "$MARKER_FILE" ]; then
  echo "warm-from-path: set LOCAL_PATH and/or MARKER_FILE — nothing to pull" >&2
  exit 1
fi

RC=(rclone --s3-no-check-bucket --retries 3 --contimeout 20s --timeout 90s)

if [ -n "$MARKER_FILE" ]; then
  if ! "${RC[@]}" copyto "$REMOTE/$MARKER_NAME" "$MARKER_FILE" 2>/dev/null; then
    echo "warm-from-path: marker $REMOTE/$MARKER_NAME not found" >&2
    exit 1
  fi
fi

if [ -n "$LOCAL_PATH" ]; then
  mkdir -p "$LOCAL_PATH"
  if ! "${RC[@]}" copy "$REMOTE" "$LOCAL_PATH" --transfers 16 --exclude "$MARKER_NAME" --exclude "logs/**"; then
    echo "warm-from-path: copy $REMOTE -> $LOCAL_PATH failed" >&2
    exit 1
  fi
  echo "Warmed $REMOTE to $LOCAL_PATH"
fi
