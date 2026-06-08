# MongoDB Atlas + Node.js client

Provisions a MongoDB Atlas project, an M0 (free-tier) cluster, and a database
user, then runs a Node.js application that connects with the official `mongodb`
driver and performs insert / read / count operations on a loop. Demonstrates how
the `mongodb-atlas` entities wire their runtime state (connection string,
username, password) into a real application.

## Architecture

```
mongodb-atlas/project  ──┐
                         ├─► mongodb-atlas/cluster ──(connection_srv)──┐
                         │                                             ├─► Node client app
                         └─► mongodb-atlas/user ──(username/password)──┘
```

**How it works:**
1. `atlas-project` creates an Atlas project (group) in your organization.
2. `atlas-cluster` provisions an M0 cluster in that project and exposes
   `state.connection_srv` (the `mongodb+srv://` string).
3. `atlas-user` creates a `readWriteAnyDatabase` database user and stores its generated
   password in the `mongodb-app-password` secret.
4. `atlas-client` reads the SRV string + username (from entity state/definition)
   and the password (from the secret), builds an authenticated URI, and runs a
   continuous insert/read/count demo against `monkdemo.events`.

## Prerequisites

- Node.js 18+ and npm (to build the image)
- Docker + access to `monkimages.azurecr.io`
- A MonkEC cluster/daemon
- MongoDB Atlas **service-account** credentials (Org Settings → Access Manager →
  Service Accounts), stored as a Monk secret in `clientId:clientSecret` form
- Your Atlas **organization name** (set `organization:` in the YAML)

## Setup

```bash
# Atlas service-account credentials (format: clientId:clientSecret)
monk secrets add -g mongodb-atlas-token="your_client_id:your_client_secret"
```

> The database user password is generated automatically into the
> `mongodb-app-password` secret on first deploy; you don't need to set it.

## Build and push the image

```bash
cd examples/mongodb-atlas-js-client
npm install
npm run build

docker build -t monkimages.azurecr.io/mongodb-atlas-js-client:latest .
az acr login --name monkimages
docker push monkimages.azurecr.io/mongodb-atlas-js-client:latest
```

## Deploy

```bash
# Load the entity package
monk load dist/mongodb-atlas/MANIFEST

# Load and deploy the example stack
monk load examples/mongodb-atlas-js-client/mongodb-atlas-js-client.yaml
monk run -l mongodb-atlas-js-client/stack   # or: monk run -t TAG mongodb-atlas-js-client/stack

# Monitor
monk ps
monk logs -f mongodb-atlas-js-client/atlas-client
```

Expected client output:
```
Connected to MongoDB Atlas successfully! (ping ok=1)
Operation #1
  inserted _id=...
  read back: event=demo.tick sequence=1
  total documents in events: 1
```

## Environment Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `MONGODB_CONNECTION_STRING` | SRV connection string (no creds) | `atlas-cluster` state `connection_srv` |
| `MONGODB_USERNAME` | Database username | `atlas-user` definition `name` |
| `MONGODB_PASSWORD` | Database password | secret `mongodb-app-password` |
| `MONGODB_URI` | Full pre-authenticated URI (optional; overrides the three above) | — |
| `MONGODB_DATABASE` | Target database (default `monkdemo`) | YAML variable |
| `MONGODB_COLLECTION` | Target collection (default `events`) | YAML variable |
| `OPERATION_INTERVAL_MS` | Delay between operations (default 5000) | YAML variable |
| `MAX_OPERATIONS` | Stop after N operations (`0` = run forever) | YAML variable |

## Key wiring patterns

### 1. Cluster connection string via entity state
```yaml
mongodb_connection_string:
  env: MONGODB_CONNECTION_STRING
  value: <- connection-target("cluster") entity-state get-member("connection_srv")
  type: string
```
The cluster only populates `connection_srv` once it reaches `IDLE`, so the app's
`depends.wait-for` on `atlas-cluster` guarantees the value is present.

### 2. Username from definition, password from secret
```yaml
mongodb_username:
  value: <- connection-target("user") entity get-member("name")
mongodb_password:
  value: <- secret("mongodb-app-password")
```
The username is a definition value (`entity get-member`); the password is read
from the secret the `user` entity generated. The app assembles the authenticated
URI in code, keeping credentials out of the YAML.

## Customization

- **Paid tiers:** change `instance_size` to `FLEX` (Flex cluster) or `M10`+
  (dedicated). M0 is free.
- **Lock down access:** replace `allow_ips: [0.0.0.0/0]` with your real CIDRs.
- **Run once:** set `MAX_OPERATIONS` > 0 to make the client exit after N ops.

## Local development

```bash
cp env.example .env
# Fill in MONGODB_CONNECTION_STRING + MONGODB_USERNAME + MONGODB_PASSWORD
npm run dev
```

## Cleanup

```bash
monk delete --force mongodb-atlas-js-client/stack
```
