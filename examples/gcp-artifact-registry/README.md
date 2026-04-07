# GCP Artifact Registry

Provisions a standard Docker repository for container images and a remote npm repository that mirrors npmjs.org. Demonstrates multi-format repository management with different repository modes.

## Architecture

```
                 gcp-artifact-registry
                 =====================

  enable-apis (gcp/service-usage)
       |
       +---> docker-repo (gcp/artifact-registry-repository)
       |         mode: STANDARD_REPOSITORY
       |         format: DOCKER
       |         -> Push/pull container images
       |
       +---> npm-mirror (gcp/artifact-registry-repository)
                 mode: REMOTE_REPOSITORY
                 format: NPM
                 upstream: NPMJS
                 -> Caches npm packages from npmjs.org
```

**How it works:**
1. `enable-apis` activates the Artifact Registry API in your GCP project
2. `docker-repo` creates a standard Docker repository — push your app images here
3. `npm-mirror` creates a remote npm repository that proxies and caches packages from npmjs.org

## Prerequisites

- Monk cluster with GCP provider configured:
  ```bash
  monk cluster provider add -p gcp
  ```
- GCP service account with these roles:
  - `roles/artifactregistry.admin` — create and manage repositories
  - `roles/serviceusage.serviceUsageAdmin` — enable APIs

## Deploy

```bash
# Load the GCP entity package
monk load dist/gcp/MANIFEST

# Load the example stack
monk load examples/gcp-artifact-registry/gcp-artifact-registry.yaml

# Deploy to a cloud node (replace TAG with your node's tag)
monk run -t TAG gcp-artifact-registry/stack
```

## Verify

### Check stack status

```bash
monk ps
```

All three entities should show `true true` for ready/live.

### Inspect repositories

```bash
# Docker repository details
monk do gcp-artifact-registry/docker-repo/get-info

# npm mirror details
monk do gcp-artifact-registry/npm-mirror/get-info

# List packages (empty for new repos)
monk do gcp-artifact-registry/docker-repo/list-packages

# Cost estimate
monk do gcp-artifact-registry/docker-repo/get-cost-estimate
```

### Push a Docker image

After deployment, authenticate and push images to the Docker repository:

```bash
# Authenticate Docker to the registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Tag and push an image
docker tag myapp:latest us-central1-docker.pkg.dev/YOUR_PROJECT/app-docker/myapp:latest
docker push us-central1-docker.pkg.dev/YOUR_PROJECT/app-docker/myapp:latest

# Verify
monk do gcp-artifact-registry/docker-repo/list-packages
```

### Use the npm mirror

Configure npm or yarn to use the mirror:

```bash
# .npmrc
@your-scope:registry=https://us-central1-npm.pkg.dev/YOUR_PROJECT/npm-mirror/
//us-central1-npm.pkg.dev/YOUR_PROJECT/npm-mirror/:always-auth=true

# Install packages through the mirror
npm install express
```

## Key Wiring Patterns

### 1. API enablement dependency

```yaml
docker-repo:
  defines: gcp/artifact-registry-repository
  depends:
    wait-for:
      runnables:
        - gcp-artifact-registry/enable-apis
      timeout: 300
```

All repositories wait for the API to be enabled before attempting creation. The 300-second timeout accommodates the occasional delay in API propagation.

### 2. Remote repository with public upstream

```yaml
npm-mirror:
  defines: gcp/artifact-registry-repository
  mode: REMOTE_REPOSITORY
  remote_upstream: NPMJS
  repo_format: NPM
```

Remote repositories proxy and cache packages from a public upstream. Supported upstream/format combinations: `DOCKER_HUB`/DOCKER, `MAVEN_CENTRAL`/MAVEN, `NPMJS`/NPM, `PYPI`/PYTHON.

### 3. Using registry URI in other entities

The `registry_uri` state field can be referenced by other entities:

```yaml
my-cloud-run-service:
  defines: gcp/cloud-run-service
  image: <- connection-target("registry") entity-state get-member("registry_uri") concat("/myapp:latest")
  connections:
    registry:
      runnable: gcp-artifact-registry/docker-repo
      service: data
```

## Customization

**Change region:** Update `location` on both repositories. Multi-region locations (`us`, `europe`, `asia`) are also supported.

**Add Maven repository:**
```yaml
maven-repo:
  defines: gcp/artifact-registry-repository
  name: maven-releases
  location: us-central1
  repo_format: MAVEN
  maven_version_policy: RELEASE
  labels:
    environment: example
```

**Enable immutable tags (production):**
```yaml
docker-repo:
  docker_immutable_tags: true
```

**Add CMEK encryption:**
```yaml
docker-repo:
  kms_key_name: projects/my-project/locations/us-central1/keyRings/my-ring/cryptoKeys/my-key
```

## Cleanup

```bash
monk delete --force gcp-artifact-registry/stack
```
