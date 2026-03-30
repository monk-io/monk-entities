---
name: entity-example
description: Create real-world usage examples for a MonkEC entity package. Generates a complete runnable example — YAML stack wiring entities to real workloads, optionally with application source code, Dockerfile, and README. Use when the user wants to demonstrate how an entity works in practice.
argument-hint: "[package] [scenario] - e.g., 'aws-sqs worker app' or 'aws-route53 nginx ingress'"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(*), Agent
---

# Create Entity Usage Example

Generate a complete, runnable usage example for a MonkEC entity package. The example should demonstrate **real-world wiring** — how the entity integrates into a deployable stack, not just how to call its cloud API.

## User prompt

$ARGUMENTS

---

## Existing integrations

!`ls -1 src/`

## Existing examples

!`ls -1 examples/`

---

## Step 1: Understand the entity

Read the entity source code in `src/<package>/`:
- **All `.ts` files** — understand Definition interfaces (what fields are available), State interfaces (what runtime values are exposed), and actions
- **`example.yaml`** — see the entity author's basic usage examples
- **`README.md`** — understand capabilities, required permissions, services exposed
- **`MANIFEST`** — get the exact `defines:` paths (format: `<package>/<entity-class>`)

For each entity in the package, note:
- Required vs optional Definition fields
- State fields available via `entity-state get-member()` (these are what dependent entities/runnables consume)
- Services declared (if any) — these determine the `service:` value in connection blocks
- Actions available — useful for comments showing post-deploy operations

Also read `doc/entity-conventions.md` for naming patterns.

## Step 2: Study existing examples for patterns

Read 2-3 examples from `examples/` that are similar in complexity or provider. Read their full directory contents: YAML, source code, Dockerfile, package.json, README.

**Pattern reference by category:**
- **Cloud resource + client app**: `sqs-worker`, `azure-cosmosdb-js-client`, `dynamo-db-client` — entity provisions infrastructure, TypeScript client app consumes it
- **Multi-tier cloud architecture**: `lambda-dynamo-db-example` — multiple entities wired in a dependency chain (table -> policy -> role -> function -> API gateway)
- **SaaS + app integration**: `supabase-auth-next-app` — SaaS entity + runnable with secrets
- **Messaging patterns**: `azure-servicebus-app`, `azure-eventhubs-app` — event-driven architectures
- **Infrastructure wiring**: `route53-nginx-demo` — entities wired to stock containers via ingress, no custom app code needed

Focus on:
- How `connection-target()` wires runtime values between entities
- How `variables:` map entity state to container environment variables
- How `ingress-routes` expose services through Traefik for HTTP routing
- How `service-public-ip()` resolves runtime IPs for networking entities
- Application code patterns — how the client connects to the provisioned resource
- Dockerfile multi-stage build conventions
- README structure with build/push/deploy instructions

## Step 3: Design the example

Choose a scenario that best demonstrates the entity's real-world usage. Prioritize:

1. **Wiring over management** — show how the entity plugs into a stack, not how to call its API with an SDK client
2. **Practical over minimal** — show a realistic use case, not just the entity in isolation
3. **Integration over standalone** — wire the entity to at least one consumer (runnable, another entity, or both)
4. **Fully runnable** — the example must work end-to-end with `monk load` + `monk run`
5. **Minimal complexity** — use stock images with inline content when the example is about infrastructure wiring; only add custom app code when the entity's value is best shown through application-level interaction

### Architecture patterns (pick the best fit):

**Pattern A: Entity + Client Application**
Best for: databases, queues, caches, storage, auth services — where the value is in the application consuming the resource
```
Entity (provisions resource) -> TypeScript Client (CRUD/operations demo)
```
Requires: TypeScript app, Dockerfile, Docker build/push

**Pattern B: Multi-entity pipeline**
Best for: AWS services that compose (IAM + Lambda + DynamoDB, S3 + CloudFront)
```
Foundation entity -> Supporting entity -> ... -> Consumer entity/app
```

**Pattern C: Entity variants**
Best for: entities with significantly different configurations (MySQL vs PostgreSQL, FIFO vs Standard queue)
```
Variant A entity + client -> Variant B entity + client
```

**Pattern D: SaaS + Application**
Best for: third-party services (Supabase, Stripe, Neon)
```
SaaS entity (provisions project/resource) -> App (consumes API keys + URLs)
```

**Pattern E: Infrastructure wiring (YAML-only)**
Best for: networking, DNS, CDN, load balancing, ingress — where the value is in how the entity wires into infrastructure
```
Stock container (e.g., nginx:alpine) -> Monk ingress (Traefik) -> Entity (DNS/CDN/networking)
```
No custom app code needed. Uses stock images with `files:` block for inline content. Single YAML file + README.

**When to use Pattern E vs Pattern A:**
- If the entity provisions infrastructure that *other things connect to* (DNS records, CDN distributions, load balancers, networking) → Pattern E
- If the entity provisions a resource that *applications interact with* (databases, queues, storage, auth) → Pattern A

### Naming conventions:
- Example directory: kebab-case describing the scenario (e.g., `sqs-worker`, `rds-client`, `route53-nginx-demo`)
- Namespace: same as directory name
- Entity instances: descriptive names (e.g., `users-table`, `api-queue`, `dns-zone`, `nginx`)
- Docker image (if needed): `monkimages.azurecr.io/<example-name>:latest`

## Step 4: Create the example directory and all files

Create `examples/<example-name>/` with the appropriate files for the chosen pattern.

### For Pattern E (infrastructure wiring, YAML-only):

Only two files needed:

#### YAML stack template — `<example-name>.yaml`

```yaml
# <Title>
# <1-2 sentence description of what this example demonstrates>
# Flow: <describe the traffic/data flow>
#
# Prerequisites: <list any required setup, e.g., monk plugins enable ingress>

namespace: <example-name>

# === Application ===

# <Description of the workload>
<workload>:
  defines: runnable
  containers:
    <container-name>:
      image: <stock-image>  # e.g., nginx:alpine
  files:
    <file-name>:
      container: <container-name>
      path: <path-in-container>
      mode: 0644
      contents: |
        <inline content>
  services:
    <service-name>:
      container: <container-name>
      port: <port>
      protocol: tcp
      ingress-routes:
        <route-name>:
          host: <hostname>

# === Infrastructure ===

# <Description of entity's role>
<entity-instance>:
  defines: <package>/<entity-class>
  <field>: <value>
  tags:
    Environment: example
    Owner: monk-example
  services:
    <service-name>:
      protocol: custom

# <Description of dependent entity>
<dependent-entity>:
  defines: <package>/<entity-class>
  depends:
    wait-for:
      runnables:
        - <namespace>/<entity-instance>
      timeout: 120
  connections:
    <connection-name>:
      runnable: <namespace>/<entity-instance>
      service: <service-name>
  <field>: <- connection-target("<connection-name>") entity-state get-member("<state-field>")

# === Deploy Everything ===

stack:
  defines: group
  members:
    - <namespace>/<workload>
    - <namespace>/<entity-instance>
    - <namespace>/<dependent-entity>
```

#### README — `README.md`

Write a detailed README with these sections:

```markdown
# <Example Name>

<1-2 sentence description of what this demonstrates and why it matters>

## Architecture

<ASCII diagram showing the traffic/data flow>

**How it works:**
1. <Step-by-step explanation of the flow>

## Prerequisites

- <Required cluster setup>
- <Required plugins: e.g., monk plugins enable ingress>
- <Required credentials: e.g., monk cluster providers>
- <Required IAM permissions (list specific ones)>

## Deploy

\```bash
# Load the entity package
monk load dist/<package>/MANIFEST

# Load the example stack
monk load examples/<example-name>/<example-name>.yaml

# Deploy to a cloud node (replace TAG with your node's tag)
monk run -t TAG <namespace>/stack
\```

## Verify

### Check stack status
\```bash
monk ps
\```

### Inspect resources
\```bash
monk do <namespace>/<entity>/action-name
\```

### Verify end-to-end
<Specific verification commands, e.g., dig for DNS, curl for HTTP>

## Key Wiring Patterns

### 1. <Pattern name>
\```yaml
<relevant YAML snippet>
\```
<Explanation of what this pattern does and why>

### 2. <Pattern name>
...

## Customization

<How to adapt the example for real use>

## Cleanup

\```bash
monk delete --force <namespace>/stack
\```
```

### For Patterns A-D (with custom application code):

Create the full set of files:

#### 4a. TypeScript application — `src/client.ts`

Write a TypeScript client that demonstrates real interactions with the provisioned resource. Follow this structure:

```typescript
import * as dotenv from 'dotenv';
// Import the appropriate SDK for the cloud service

dotenv.config();

// Configuration from environment variables (mapped from entity state in YAML)
const config = {
  // Read from env vars that YAML template maps from entity state
  endpoint: process.env.ENDPOINT_URL || '',
  // ... other config
};

class ExampleClient {
  private isShuttingDown = false;
  private operationCount = 0;
  private maxOperations: number;
  private operationInterval: number;

  constructor() {
    // Validate required config
    // Initialize SDK client
    // Log startup info
    this.setupGracefulShutdown();
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      console.log('\nGraceful shutdown initiated...');
      this.isShuttingDown = true;
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  // Demonstrate key operations (CRUD, list, query, etc.)
  private async demonstrateOperations(): Promise<void> {
    // CREATE - create a test resource/record
    // READ - read it back
    // UPDATE - modify it
    // LIST/QUERY - search/list resources
    // DELETE - clean up
    // Log each operation with clear output
  }

  public async start(): Promise<void> {
    console.log('Starting operations demonstration...\n');
    const runOperation = async () => {
      if (this.isShuttingDown) return;
      this.operationCount++;
      console.log(`\nOperation #${this.operationCount}`);
      await this.demonstrateOperations();
      if (this.maxOperations > 0 && this.operationCount >= this.maxOperations) {
        console.log(`Reached max operations (${this.maxOperations}). Done.`);
        process.exit(0);
      }
      if (!this.isShuttingDown) {
        setTimeout(runOperation, this.operationInterval);
      }
    };
    await runOperation();
  }
}

async function main() {
  try {
    const client = new ExampleClient();
    await client.start();
  } catch (error) {
    console.error('Failed to start:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch(console.error);
}
```

**Application code rules:**
- Use the official SDK for the cloud/SaaS service (AWS SDK v3, Azure SDK, GCP client libraries, etc.)
- Read all configuration from environment variables (these get wired from entity state in YAML)
- Log operations clearly so users can see what's happening
- Include graceful shutdown (SIGINT/SIGTERM)
- Demonstrate the most common operations for the service
- Handle errors gracefully with informative messages
- Support configurable operation interval and max operations via env vars

#### 4b. Package configuration — `package.json`

```json
{
  "name": "<example-name>",
  "version": "1.0.0",
  "description": "<Description> client for MonkEC integration demo",
  "main": "dist/client.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/client.js",
    "dev": "ts-node src/client.ts",
    "clean": "rm -rf dist"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    // Cloud SDK packages
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "ts-node": "^10.9.0",
    "typescript": "^5.0.0"
  }
}
```

#### 4c. TypeScript configuration — `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 4d. Dockerfile — multi-stage production build

```dockerfile
# Multi-stage build for <example-name>
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --silent

# Copy source code
COPY src/ ./src/

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --silent && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R appuser:nodejs /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/client.js"]
```

**Dockerfile rules:**
- Always use multi-stage build (builder + production)
- Base image: `node:18-alpine` (or `node:20-alpine` for newer SDKs)
- Create and use a non-root user
- Install dev deps only in builder stage
- `npm ci --omit=dev` in production stage
- Include HEALTHCHECK
- Set `NODE_ENV=production`

#### 4e. Environment template — `env.example`

```bash
# <Example Name> - Local Development Configuration
# Copy to .env and fill in real values: cp env.example .env

# These are automatically provided by MonkEC when using the full stack.
# Only needed for local development/testing outside monk.

# For cloud builtins (AWS/Azure/GCP):
# Credentials are configured through monk cluster providers
# <SERVICE>_ENDPOINT=https://...
# <SERVICE>_REGION=us-east-1

# For API-token based services:
# <SERVICE>_API_TOKEN=your-token-here

# Client configuration (optional)
OPERATION_INTERVAL_MS=3000
MAX_OPERATIONS=50
```

#### 4f. Git ignore — `.gitignore`

```
node_modules/
dist/
.env
*.js
*.d.ts
*.js.map
!tsconfig.json
```

#### 4g. YAML stack template — `<example-name>.yaml`

```yaml
# <Title>
# <1-2 sentence description of what this example demonstrates>

namespace: <example-name>

# === <Section: Infrastructure> ===

# <Description of this entity's role>
<entity-instance>:
  defines: <package>/<entity-class>
  # <Explain key configuration choices>
  <field>: <value>
  tags:
    Environment: example
    Owner: monk-example

# === <Section: Client Application> ===

# <Description of the application>
<app-instance>:
  defines: runnable
  permitted-secrets:
    <secret-name>: true
  connections:
    <connection-name>:
      runnable: <namespace>/<entity-instance>
      service: <service-name>
  depends:
    wait-for:
      runnables:
        - <namespace>/<entity-instance>
      timeout: <appropriate-timeout>
  variables:
    # <Explain what this variable provides>
    <var-name>:
      env: <ENV_VAR_NAME>
      value: <- connection-target("<connection-name>") entity-state get-member("<state-field>")
      type: string
  containers:
    app:
      image: monkimages.azurecr.io/<example-name>:latest
      ports:
        - "<host>:<container>"

# === Deploy Everything ===

# Deploy: monk load <example-name>.yaml && monk run -l <namespace>/example-stack
example-stack:
  defines: group
  members:
    - <namespace>/<entity-instance>
    - <namespace>/<app-instance>
```

#### 4h. README — `README.md`

Write a README with these sections. Keep it practical and focused:

```markdown
# <Example Name>

<1-2 sentence description>

## Architecture

<Brief description of components and how they connect>

## Prerequisites

- Node.js 18+ and npm
- Docker
- Azure CLI (for registry authentication)
- MonkEC entities loaded: `<package>`

## Quick Start

### 1. Build and Push Docker Image

\```bash
# Install dependencies and build
npm install
npm run build

# Build Docker image
docker build -t monkimages.azurecr.io/<example-name>:latest .

# Authenticate and push to registry
az login
az acr login --name monkimages
docker push monkimages.azurecr.io/<example-name>:latest
\```

### 2. Deploy with Monk

\```bash
# Load the entity package
monk load dist/<package>/MANIFEST

# Load and deploy the example stack
monk load examples/<example-name>/<example-name>.yaml
monk run -t TAG <namespace>/example-stack

# Monitor
monk ps
monk logs -f <namespace>/<app-instance>
\```

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `VAR_NAME` | Description | entity-state / secret / config |

## Local Development

\```bash
cp env.example .env
# Edit .env with your values
npm run dev
\```
```

## YAML rules (all patterns)

1. **Use `connection-target()` for all cross-entity references** — never hardcode IDs, ARNs, URLs
2. **Use `entity-state get-member()` for runtime values** and `entity get-member()` for definition values
3. **Use `service-public-ip("system/traefik", "web")` for ingress IP** — when entities need the cluster's public ingress address (DNS records, CDN origins, etc.)
4. **Use `ingress-routes` for HTTP services** — prefer ingress over published ports; containers can migrate between nodes without breaking routing
5. **Include meaningful comments** — explain key choices and customization options
6. **Always include a group** for single-command deployment
7. **Tags** — add `Environment: example`, `Owner: monk-example`
8. **Service names** — use `service: default` unless entity defines named services
9. **For cloud builtins** (aws-*, azure-*, gcp*) — do NOT add `permitted-secrets` on entity instances
10. **For SaaS/API entities** — include `permitted-secrets` and `secret_ref` fields
11. **Image** — use `monkimages.azurecr.io/<example-name>:latest` for custom apps, stock images for Pattern E
12. **Do not reference `templates/local/` paths** — use package entity paths directly
13. **Deploy to cloud nodes** — use `monk run -t TAG` for cloud deployment, `-l` only for local testing
14. **Variable names must be snake_case** — e.g., `next_public_clerk_publishable_key`, NOT `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. The `env:` field maps the snake_case variable to the uppercase env var the app expects. Example: `clerk_secret_key: { env: CLERK_SECRET_KEY, value: ..., type: string }`
15. **Never hardcode credentials in YAML** — Use `<- secret("secret-name")` for all keys, tokens, and passwords. Even "publishable" keys should come from secrets so the YAML is portable and safe to commit.

## Monk ingress reference

When the example needs HTTP routing (web apps, APIs, DNS pointing to services):

### Enabling ingress
```bash
monk plugins enable ingress
```

### Exposing services via ingress
```yaml
services:
  http:
    container: web
    port: 80
    protocol: tcp
    ingress-routes:
      web:
        host: www.example.com      # host-based routing
      api:
        path-prefix: /api           # path-based routing
```

### Getting the ingress public IP
For entities that need the cluster's public-facing IP (DNS records, CDN origins):
```yaml
record_values:
  - <- service-public-ip("system/traefik", "web")
```

### Inline file content
For stock images that need custom content (nginx, httpd, etc.):
```yaml
files:
  index:
    container: web
    path: /usr/share/nginx/html/index.html
    mode: 0644
    contents: |
      <html><body><h1>Hello from Monk!</h1></body></html>
```

## Step 5: Build (Pattern A-D only)

```bash
cd examples/<example-name>
npm install
npm run build
```

Fix any TypeScript compilation errors. The code must compile cleanly.

## Step 6: Build and push Docker image (Pattern A-D only)

```bash
# Build the Docker image
cd examples/<example-name>
docker build -t monkimages.azurecr.io/<example-name>:latest .
```

If the build fails, fix the Dockerfile or source code and retry.

Then push to the registry:

```bash
# Authenticate (user may need to run az login first)
az acr login --name monkimages

# Push
docker push monkimages.azurecr.io/<example-name>:latest
```

If `az acr login` fails, ask the user to run `az login` first, then retry.

## Step 7: Validate

After creating all files, verify:
1. All `defines:` paths match actual compiled entity names (check `dist/<package>/` or MANIFEST)
2. All `connection-target()` references use correct state field names (check State interface in source)
3. All `service:` values match services declared by the entity
4. Namespace is consistent throughout the YAML file
5. Group members list all entities in the file
6. No reserved property names (`description`, `type`) used as entity fields
7. No `permitted-secrets` on cloud builtin entities (aws/azure/gcp)
8. For Pattern A-D: TypeScript compiles cleanly, Docker image builds and pushes
9. For Pattern E: YAML is self-contained, no external images needed beyond stock
10. Environment variables in YAML match what the application reads from `process.env`
11. `ingress-routes` host values match any DNS records being created
12. `service-public-ip()` references use fully qualified paths (e.g., `"system/traefik", "web"`)
13. All variable names are snake_case (not UPPER_CASE) — `env:` field maps to the uppercase name
14. No hardcoded credentials — all keys/tokens use `<- secret("name")`

## Done

Report to the user:
- Files created (list all)
- Pattern used (A-E) and why
- For Pattern A-D: Docker image built and pushed: `monkimages.azurecr.io/<example-name>:latest`
- How to deploy: `monk load dist/<package>/MANIFEST && monk load examples/<name>/<name>.yaml && monk run -t TAG <namespace>/stack`
- Any prerequisites (plugins to enable, secrets to configure, cloud credentials needed)
