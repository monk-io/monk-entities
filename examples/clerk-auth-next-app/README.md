# Clerk Auth Next.js App

Next.js application with Clerk authentication, managed by MonkEC. Demonstrates how the `clerk/credentials` entity wires API keys into a real application with sign-in, sign-up, and protected pages.

## Architecture

```
User Browser
    |
    v
Next.js App (port 3000)
    |
    +-- Public routes: /, /sign-in, /sign-up
    |
    +-- Protected routes: /protected (requires auth)
    |
    +-- Clerk middleware (session management)
    |
    v
Clerk API (auth backend)
    ^
    |
MonkEC clerk/credentials entity
    (validates key, exposes publishable_key + secret_ref)
```

**How it works:**
1. MonkEC `clerk/credentials` entity validates the Clerk API key and exposes the publishable key and secret ref
2. The Next.js app receives `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` as environment variables
3. Clerk middleware protects routes — unauthenticated users are redirected to sign-in
4. Clerk's `<SignIn />` and `<SignUp />` components handle the authentication UI
5. Authenticated users can access the protected dashboard showing their profile

## Prerequisites

- Node.js 20+ and npm
- Docker
- Azure CLI (for registry auth)
- A Clerk account with an application created at https://dashboard.clerk.com
- MonkEC clerk entity loaded: `monk load dist/clerk/MANIFEST`

## Quick Start

### 1. Build and Push Docker Image

```bash
cd examples/clerk-auth-next-app

# Install dependencies and build
npm install
npm run build

# Build Docker image
docker build -t monkimages.azurecr.io/clerk-auth-next-app:latest .

# Push to registry
az acr login --name monkimages
docker push monkimages.azurecr.io/clerk-auth-next-app:latest
```

### 2. Configure Secrets

```bash
# Add your Clerk secret key
monk secrets add clerk-secret-key sk_test_your-secret-key
```

### 3. Deploy with Monk

Edit `clerk-auth-next-app.yaml` and replace `publishable_key` with your actual key from the Clerk dashboard.

```bash
# Load entity package
monk load dist/clerk/MANIFEST

# Load and deploy
monk load examples/clerk-auth-next-app/clerk-auth-next-app.yaml
monk run -t TAG clerk-auth-next-app/stack

# Monitor
monk ps
monk logs -f clerk-auth-next-app/nextjs-app
```

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key for client SDK | `entity-state get-member("publishable_key")` |
| `CLERK_SECRET_KEY` | Clerk secret key for server operations | `secret($clerk_secret_ref)` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in page path | Static: `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Sign-up page path | Static: `/sign-up` |

## Local Development

```bash
cp env.example .env.local
# Edit .env.local with your Clerk keys from https://dashboard.clerk.com
npm install
npm run dev
```

Visit http://localhost:3000

## Key Wiring Patterns

### Clerk credentials to app

```yaml
connections:
  clerk:
    runnable: clerk-auth-next-app/clerk-creds
    service: data

variables:
  clerk_secret_ref:
    value: <- connection-target("clerk") entity get-member("secret_ref")
    type: string
  CLERK_SECRET_KEY:
    env: CLERK_SECRET_KEY
    value: <- secret($clerk_secret_ref)
    type: string
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
    env: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    value: <- connection-target("clerk") entity-state get-member("publishable_key")
    type: string
```

The secret key is read via `secret()` (never exposed in state), while the publishable key comes from entity state (safe for client-side use).

## Cleanup

```bash
monk delete --force clerk-auth-next-app/stack
```
