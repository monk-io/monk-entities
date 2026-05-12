#!/bin/sh
# Wrapper to invoke the local monkec from ../monkec/ against entities in this repo.
# Mirrors monkec.sh's compile/test interface but skips Docker — runs via
# `deno task compile` / `deno task test` from the monkec checkout so source
# changes in ../monkec take effect immediately (no rebuild).
#
# The input is symlinked into ../monkec/input/<basename> to match the relative
# path layout the compiler expects (mirrors what the Docker entrypoint does via
# bind mount).

MONKEC_ROOT="${MONKEC_ROOT:-/Users/nooga/monk/monkec}"

INPUT_DIR="${INPUT_DIR:-.}"
OUTPUT_DIR="${OUTPUT_DIR:-./dist}"

INPUT_DIR_ABS="$(cd "$INPUT_DIR" && pwd)"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR_ABS="$(cd "$OUTPUT_DIR" && pwd)"

BASENAME="$(basename "$INPUT_DIR_ABS")"
LINK="$MONKEC_ROOT/input/$BASENAME"

ensure_link() {
  mkdir -p "$MONKEC_ROOT/input"
  if [ -L "$LINK" ]; then
    existing="$(readlink "$LINK")"
    [ "$existing" = "$INPUT_DIR_ABS" ] || ln -sfn "$INPUT_DIR_ABS" "$LINK"
  elif [ -e "$LINK" ]; then
    echo "Refusing to overwrite non-symlink at $LINK" >&2
    exit 1
  else
    ln -s "$INPUT_DIR_ABS" "$LINK"
  fi
}

case "$1" in
  compile)
    shift
    ensure_link
    cd "$MONKEC_ROOT"
    exec deno task compile "input/$BASENAME" --out "$OUTPUT_DIR_ABS" "$@"
    ;;
  test)
    shift
    ensure_link
    cd "$MONKEC_ROOT"
    exec deno task test "input/$BASENAME" "$@"
    ;;
  ""|help|-h|--help)
    cat <<EOF
Usage: ./monkec-local.sh <compile|test> [extra args]

Env vars:
  MONKEC_ROOT  Path to monkec checkout (default: $MONKEC_ROOT)
  INPUT_DIR    Source directory (default: .)
  OUTPUT_DIR   Output directory for compile (default: ./dist)

Examples:
  INPUT_DIR=./src/neon OUTPUT_DIR=./dist/neon ./monkec-local.sh compile
  INPUT_DIR=./src/neon ./monkec-local.sh test --verbose
EOF
    ;;
  *)
    cd "$MONKEC_ROOT"
    exec deno task compile "$@"
    ;;
esac
