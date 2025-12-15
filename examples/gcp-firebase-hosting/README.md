# GCP Firebase Hosting Example

This example demonstrates Firebase Hosting with:

1. **API Enablement** - Enables Firebase Hosting API
2. **Hosting Site** - Creates a Firebase Hosting site ({site}.web.app)
3. **Preview Channel** - Creates a preview channel for staging
4. **Deployer** - Container that deploys content using Firebase CLI (builder pattern)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  gcp-firebase-hosting-demo                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │ enable-apis  │  Enables:                                     │
│  │ (service-    │  - firebasehosting.googleapis.com             │
│  │  usage)      │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────┐                                           │
│  │  hosting-site    │  Firebase Hosting Site                    │
│  │ (firebase-       │  - monk-demo-site.web.app                 │
│  │  hosting-site)   │  - monk-demo-site.firebaseapp.com         │
│  └────────┬─────────┘                                           │
│           │                                                     │
│           │ state.site_id                                       │
│           ▼                                                     │
│  ┌──────────────────┐                                           │
│  │ preview-channel  │  Preview Channel                          │
│  │ (firebase-       │  - preview--monk-demo-site.web.app        │
│  │  hosting-channel)│  - TTL: 7 days                            │
│  └────────┬─────────┘  - Retains 3 releases                     │
│           │                                                     │
│           │ state.url                                           │
│           ▼                                                     │
│  ┌──────────────────┐                                           │
│  │   deploy-site    │  Builder Container                        │
│  │   (runnable)     │  - Mounts blob://site-content             │
│  │                  │  - Runs firebase deploy                   │
│  └──────────────────┘  - Deploys to preview channel             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Site Content

Before running, create a blob with your site content:

**Create directory structure:**
```
my-site/
├── firebase.json
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

**`firebase.json`:**
```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

**Upload as blob:**
```bash
monk blob upload site-content ./my-site/
```

> Note: If no blob is provided, the deployer creates a sample site.

## Prerequisites

1. **GCP Provider** - Configure GCP provider in Monk:
   ```bash
   monk cloud add gcp
   ```

2. **Firebase Project** - Your GCP project should have Firebase enabled:
   ```bash
   # In GCP Console or via Firebase CLI
   firebase projects:addfirebase YOUR_PROJECT_ID
   ```

3. **Permissions** - Service account needs:
   - `roles/firebasehosting.admin`
   - `roles/serviceusage.serviceUsageAdmin`

## Usage

### Load and Run

```bash
# Load the stack
monk load examples/gcp-firebase-hosting/stack.yaml

# Upload site content (optional - sample will be created if missing)
monk blob upload site-content ./my-site/

# Run the entire stack
monk run gcp-firebase-hosting-demo/hosting-app

# Or run individual components
monk run gcp-firebase-hosting-demo/enable-apis
monk run gcp-firebase-hosting-demo/hosting-site
monk run gcp-firebase-hosting-demo/preview-channel
monk run gcp-firebase-hosting-demo/deploy-site
```

### Monitor Progress

```bash
# Check status of all components
monk describe gcp-firebase-hosting-demo/hosting-app

# Get site URLs
monk describe gcp-firebase-hosting-demo/hosting-site
monk describe gcp-firebase-hosting-demo/preview-channel

# View deployment logs
monk logs gcp-firebase-hosting-demo/deploy-site
```

### Access Your Site

```bash
# Production URL (from site state)
SITE_URL=$(monk describe gcp-firebase-hosting-demo/hosting-site -o json | jq -r '.state.default_url')
echo "Production: $SITE_URL"

# Preview URL (from channel state)
PREVIEW_URL=$(monk describe gcp-firebase-hosting-demo/preview-channel -o json | jq -r '.state.url')
echo "Preview: $PREVIEW_URL"
```

### Cleanup

```bash
# Delete entire stack
monk delete gcp-firebase-hosting-demo/hosting-app
```

## Entity Composition

### Site to Channel Connection

```yaml
# Site provides site_id in state
hosting-site:
  defines: gcp/firebase-hosting-site
  name: my-site
  services:
    site:
      address: <- entity-state get-member("default_url")

# Channel references site via connection
preview-channel:
  defines: gcp/firebase-hosting-channel
  site: <- connection-target("site") entity-state get-member("site_id")
  connections:
    site:
      runnable: namespace/hosting-site
      service: site
```

### Builder Pattern

The deployer uses the builder pattern - a runnable container that:
1. Mounts site content from a blob
2. Runs Firebase CLI to deploy
3. Outputs the deployment result

```yaml
deploy-site:
  defines: runnable
  containers:
    deployer:
      image: node:20-slim
      paths:
        - <- `blobs://site-content:/app/site`
      bash: |
        npm install -g firebase-tools
        firebase deploy --only hosting
```

## Firebase Hosting Features

### Preview Channels

Preview channels provide:
- Unique URLs for each channel (preview--site.web.app)
- Automatic expiration (TTL)
- Release history retention
- Easy rollback

```yaml
preview-channel:
  defines: gcp/firebase-hosting-channel
  name: feature-xyz
  site: my-site
  ttl: "86400s"           # Expires in 24 hours
  retained_release_count: 5
```

### Multiple Channels

```yaml
# Staging channel
staging:
  defines: gcp/firebase-hosting-channel
  name: staging
  site: my-site
  ttl: "604800s"  # 7 days

# Feature branch channel
feature-auth:
  defines: gcp/firebase-hosting-channel
  name: feature-auth
  site: my-site
  ttl: "86400s"  # 1 day
```

### Custom Domains

Custom domains are configured in Firebase Console or via API after site creation.

## Important Notes

### Site Names

- Must be globally unique across all Firebase projects
- Will be used in URLs: `{name}.web.app`, `{name}.firebaseapp.com`
- Use descriptive prefixes to avoid conflicts

### Channel TTL

Preview channels can auto-expire:
- `ttl: "86400s"` - 24 hours
- `ttl: "604800s"` - 7 days
- No TTL - channel persists until deleted

### Costs

Firebase Hosting has generous free tier:
- 10 GB storage
- 360 MB/day bandwidth
- Free SSL certificates

## Troubleshooting

### Site Creation Fails

1. Check site name is unique globally
2. Verify Firebase is enabled for the project
3. Check permissions

### Deployment Fails

1. Verify blob was uploaded:
   ```bash
   monk blob list
   ```

2. Check firebase.json is valid JSON

3. View deployment logs:
   ```bash
   monk logs gcp-firebase-hosting-demo/deploy-site
   ```

### Channel Not Accessible

1. Verify site exists and is ready
2. Check channel URL format: `{channel}--{site}.web.app`
3. Wait a few minutes for DNS propagation
