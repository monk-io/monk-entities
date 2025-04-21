#!/bin/bash

podman rmi monkimages.azurecr.io/netlify-build:18
podman manifest create monkimages.azurecr.io/netlify-build:18
podman build --build-arg NODE_VERSION=18 --platform linux/amd64,linux/arm64 --manifest monkimages.azurecr.io/netlify-build:18 .
podman manifest push monkimages.azurecr.io/netlify-build:18

podman rmi monkimages.azurecr.io/netlify-build:20
podman manifest create monkimages.azurecr.io/netlify-build:20
podman build --build-arg NODE_VERSION=20 --platform linux/amd64,linux/arm64 --manifest monkimages.azurecr.io/netlify-build:20 .
podman manifest push monkimages.azurecr.io/netlify-build:20

podman rmi monkimages.azurecr.io/netlify-build:22
podman manifest create monkimages.azurecr.io/netlify-build:22
podman build --build-arg NODE_VERSION=22 --platform linux/amd64,linux/arm64 --manifest monkimages.azurecr.io/netlify-build:22 .
podman manifest push monkimages.azurecr.io/netlify-build:22

podman rmi monkimages.azurecr.io/netlify-build:23
podman manifest create monkimages.azurecr.io/netlify-build:23
podman build --build-arg NODE_VERSION=23 --platform linux/amd64,linux/arm64 --manifest monkimages.azurecr.io/netlify-build:23 .
podman manifest push monkimages.azurecr.io/netlify-build:23
