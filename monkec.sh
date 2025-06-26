#!/bin/sh
# Wrapper for running MonkEC Docker image for compile/test

MONKEC_IMAGE="${MONKEC_IMAGE:-monkimages.azurecr.io/monkec:main}"
MONK_SOCKET="${MONK_SOCKET:-/var/lib/monkd/monkd.sock}"
MONK_TOKEN_FOLDER="${MONK_TOKEN_FOLDER:-$HOME/.monk/}"

# Environment variables for input and output paths
INPUT_DIR="${INPUT_DIR:-.}"
OUTPUT_DIR="${OUTPUT_DIR:-./dist}"

HELP_MSG="\nMonkEC CLI Wrapper\n\nUsage:\n  ./monkec.sh compile\n  ./monkec.sh test\n\nEnvironment Variables:\n  INPUT_DIR     Source directory to compile/test (default: .)\n  OUTPUT_DIR    Output directory for compiled files (default: ./dist)\n  MONKEC_IMAGE  Override the Docker image to use (default: $MONKEC_IMAGE)\n  MONK_SOCKET   Monk socket path for testing (default: $MONK_SOCKET)\n  MONK_TOKEN_FOLDER Monk token folder for testing (default: $MONK_TOKEN_FOLDER)\n\nExamples:\n  INPUT_DIR=./examples/demo-module OUTPUT_DIR=./output ./monkec.sh compile\n  INPUT_DIR=./examples/demo-module ./monkec.sh test --verbose\n\nThis script runs the MonkEC Docker image with INPUT_DIR and OUTPUT_DIR mounted as volumes.\n"

if [ $# -eq 0 ] || [ "$1" = "help" ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
  printf "%b" "$HELP_MSG"
  exit 0
fi

# Get absolute paths
INPUT_DIR_ABS="$(cd "$INPUT_DIR" && pwd)"
OUTPUT_DIR_ABS="$(cd "$(dirname "$OUTPUT_DIR")" && pwd)/$(basename "$OUTPUT_DIR")"
# PROJECT_ROOT="$(pwd)"
# Can be used if you need to mount the project root to test in docker
#      -v "$PROJECT_ROOT:/monkec" \

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR_ABS"

# Use basename of INPUT_DIR for target directory
BASENAME="$(basename "$INPUT_DIR_ABS")"

if [ "$1" = "test" ]; then
  # For test, we need to mount the socket and token
  # on linux we may also need to use sudo ./monkec.sh to access the socket
  exec podman run --rm \
    -v "$INPUT_DIR_ABS:/monkec/input/$BASENAME" \
    -v "$OUTPUT_DIR_ABS:/monkec/output/" \
    -v "$MONK_SOCKET:/root/.monk/monkd.sock" \
    -v "$MONK_TOKEN_FOLDER:/root/.monk/" \
    -e INPUT_DIR="/monkec/input/$BASENAME" \
    -e OUTPUT_DIR="/monkec/output/" \
    -w "/monkec" \
    "$MONKEC_IMAGE" "$@"
else
  # For compile command and others
  # you can go inside the container with ./.monkec.sh sh
  exec podman run -ti --rm \
    -v "$INPUT_DIR_ABS:/monkec/input/$BASENAME" \
    -v "$OUTPUT_DIR_ABS:/monkec/output/" \
    -e INPUT_DIR="/monkec/input/$BASENAME" \
    -e OUTPUT_DIR="/monkec/output/" \
    -w "/monkec" \
    "$MONKEC_IMAGE" "$@"
fi