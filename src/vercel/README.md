# Vercel Entities for Monk

This module provides TypeScript entities for managing Vercel projects and deployments using the Monk infrastructure framework.

## Components

### 1. Project Entity (`project.ts`)
Manages Vercel projects with full CRUD operations:
- Create, read, update, and delete projects
- Support for framework presets (Next.js, React, Vue, etc.)
- Git repository integration
- Team support
- Environment variables management
- Build configuration

### 2. Deployment Runnable (`deploy.yaml`)
Deploys applications to Vercel using the existing Docker image `monkimages.azurecr.io/example-vercel-build:latest` which has the Vercel CLI pre-installed.

## Usage

### Creating a Vercel Project

```yaml
namespace: my-app

project:
  defines: vercel/project
  name: my-awesome-app
  framework: nextjs
  git_repository: https://github.com/username/my-repo.git
  build_command: npm run build
  output_directory: .next
  permitted-secrets:
    default-vercel-token: true
```

### Deploying to Vercel

```yaml
namespace: my-app

frontend:
  defines: runnable
  inherits: vercel/deploy
  containers:
    deploy:
      paths:
        - blobs://frontend:/home/node/app
  depends:
    wait-for:
      runnables:
        - my-app/project
  connections:
    project:
      runnable: my-app/project
      service: data
  variables:
    project: <- connection-target("project") entity-state get-member("name")
    deploy-dir: /home/node/app
    source_path: frontend
    environment: production
    pre-deploy: |
      echo "📦 Installing dependencies..."
      cd $DEPLOY_DIR
      npm install
      echo "🔨 Building application..."
      npm run build
```

## Configuration

### Project Configuration

The project entity supports the following configuration options:

- **name**: Project name (required)
- **framework**: Framework preset (nextjs, react, vue, etc.)
- **git_repository**: Git repository URL for automatic deployments
- **team_id**: Vercel team ID for team projects
- **build_command**: Custom build command
- **output_directory**: Build output directory
- **install_command**: Custom install command
- **dev_command**: Development server command
- **root_directory**: Root directory for monorepos
- **env**: Environment variables

### Deployment Configuration

The deployment runnable supports:

- **project**: Vercel project ID (automatically retrieved from project entity)
- **deploy-dir**: Directory to deploy from (default: `/home/node/app`)
- **source_path**: Path to source code blob
- **environment**: Deployment environment (production/preview)
- **pre-deploy**: Custom pre-deployment script

## Docker Image

The deployment uses the existing Docker image `monkimages.azurecr.io/example-vercel-build:latest` which includes:
- Node.js runtime
- Vercel CLI pre-installed
- Common build tools

## Authentication

Set up your Vercel API token as a secret:

```bash
monk secret set default-vercel-token your-vercel-token
```

## Examples

See `example.yaml` for complete working examples including:
- Basic project creation
- Production deployment
- Preview deployment
- Custom build configurations

## Testing

Run the integration tests:

```bash
cd test
monk run stack-integration.test.yaml
```

## Best Practices

1. **Use the existing Docker image**: The `monkimages.azurecr.io/example-vercel-build:latest` image is optimized for Vercel deployments
2. **Mount source code as blobs**: Use the `blobs://` protocol to mount your source code
3. **Set up proper dependencies**: Ensure the project exists before deploying
4. **Use pre-deploy scripts**: Handle dependency installation and building in the pre-deploy script
5. **Environment separation**: Use different environments for production and preview deployments 