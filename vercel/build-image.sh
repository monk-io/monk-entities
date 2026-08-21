#!/bin/bash
set -euo pipefail

IMAGE=monkimages.azurecr.io/vercel-build
VERSIONS=(18 20 22 24 26)

for version in "${VERSIONS[@]}"; do
  tag="$IMAGE:$version"

  podman rmi "$tag" 2>/dev/null || true
  podman manifest rm "$tag" 2>/dev/null || true
  podman manifest create "$tag"
  podman build --build-arg NODE_VERSION="$version" --platform linux/amd64,linux/arm64 --manifest "$tag" .

  count=$(podman manifest inspect "$tag" | grep -c '"platform"')
  if [ "$count" -eq 0 ]; then
    echo "refusing to push $tag: local manifest has zero platform entries" >&2
    exit 1
  fi

  podman manifest push "$tag"
done
