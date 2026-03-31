# WorkOS AuthKit Next.js App

Next.js application with WorkOS AuthKit authentication, managed by MonkEC. Demonstrates how the `workos/credentials` and `workos/organization` entities wire API keys and B2B organizations into a real application with sign-in, sign-up, SSO support, and protected pages.

## Architecture

```
User Browser
    |
    v
Next.js App (port 3000)
    |
    +-- Public routes: /
    |
    +-- Protected routes: /protected (requires auth)
    |
    +-- AuthKit proxy (session management, cookie encryption)
    |
    v
WorkOS AuthKit (hosted auth backend)
    ^
    |
MonkEC workos/credentials entity
    (validates key, exposes client_id + secret_ref)
MonkEC workos/organization entity
    (provisions B2B org for multi-tenant SSO)
```

**How it works:**
1. MonkEC `workos/credentials` entity validates the WorkOS API key and exposes the client ID and secret ref
2. MonkEC `workos/organization` entity provisions a B2B organization for SSO and user management
3. The Next.js app receives `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, and `WORKOS_COOKIE_PASSWORD` as environment variables
4. AuthKit proxy protects routes — unauthenticated users are redirected to WorkOS hosted sign-in
5. Authenticated users can access the protected dashboard showing their profile and organization info

## Prerequisites

- Node.js 20+ and npm
- Docker
- Azure CLI (for registry auth)
- A WorkOS account at https://dashboard.workos.com
- Configure a redirect URI in the WorkOS dashboard: `http://localhost:3000/callback`
- MonkEC workos entity loaded: `monk load dist/workos/MANIFEST`

## Quick Start

### 1. Build and Push Docker Image

```bash
cd examples/workos-authkit-next-app

# Install dependencies and build
npm install
npm run build

# Build Docker image
docker build -t monkimages.azurecr.io/workos-authkit-next-app:latest .

# Push to registry
az acr login --name monkimages
docker push monkimages.azurecr.io/workos-authkit-next-app:latest
```

### 2. Configure Secrets

```bash
# Add your WorkOS API key
monk secrets add -g workos-api-key=sk_test_your-api-key

# Add your WorkOS Client ID
monk secrets add -g workos-client-id=client_your-client-id

# Generate and add a cookie encryption password (must be 32+ characters)
monk secrets add -g workos-cookie-password=$(openssl rand -base64 32)
```

### 3. Deploy with Monk

```bash
# Load entity package
monk load dist/workos/MANIFEST

# Load and deploy
monk load examples/workos-authkit-next-app/workos-authkit-next-app.yaml
monk run -t TAG workos-authkit-next-app/stack

# Monitor
monk ps
monk logs -f workos-authkit-next-app/nextjs-app
```

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `WORKOS_API_KEY` | WorkOS API key for server SDK | `secret($workos_secret_ref)` |
| `WORKOS_CLIENT_ID` | Client ID for AuthKit flow | `entity-state get-member("client_id")` |
| `WORKOS_COOKIE_PASSWORD` | Session cookie encryption key | `secret("workos-cookie-password")` |
| `WORKOS_REDIRECT_URI` | AuthKit callback URL | Static: `http://localhost:3000/callback` |
| `WORKOS_DEFAULT_ORG_ID` | Default organization ID | `entity-state get-member("organization_id")` |
| `WORKOS_MODE` | Environment mode (test/production) | `entity-state get-member("mode")` |

## Local Development

```bash
cp env.example .env.local
# Edit .env.local with your WorkOS keys from https://dashboard.workos.com
npm install
npm run dev
```

Visit http://localhost:3000

## Key Wiring Patterns

### WorkOS credentials to app

```yaml
connections:
  workos:
    runnable: workos-authkit-next-app/workos-creds
    service: data

variables:
  workos_secret_ref:
    value: <- connection-target("workos") entity get-member("secret_ref")
    type: string
  workos_api_key:
    env: WORKOS_API_KEY
    value: <- secret($workos_secret_ref)
    type: string
  workos_client_id:
    env: WORKOS_CLIENT_ID
    value: <- connection-target("workos") entity-state get-member("client_id")
    type: string
```

The API key is read via `secret()` (never exposed in state), while the client ID comes from entity state (safe for client-side use).

### Organization context

```yaml
connections:
  org:
    runnable: workos-authkit-next-app/workos-org
    service: data

variables:
  workos_org_id:
    env: WORKOS_DEFAULT_ORG_ID
    value: <- connection-target("org") entity-state get-member("organization_id")
    type: string
```

## Cleanup

```bash
monk delete --force workos-authkit-next-app/stack
```
