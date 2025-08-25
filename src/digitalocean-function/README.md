# DigitalOcean App Platform Functions Entity

**Production Ready ✅**

Deploy and manage DigitalOcean Functions as components within App Platform apps using Monk orchestration. This entity provides complete lifecycle management for serverless functions with automatic GitHub integration, environment variable handling, and comprehensive monitoring.

## Status

**Production Ready ✅** - Fully tested and ready for production use

## Architecture

- **`base.ts`** - Abstract base class with DigitalOcean App Platform API integration
- **`common.ts`** - Utility functions, validation, and parameter building
- **`function.ts`** - Concrete function component implementation with full lifecycle management

## Key Features

- 🚀 **Serverless Functions** - Deploy functions without managing infrastructure
- 🔗 **GitHub Integration** - Automatic deployment from GitHub repositories
- 🌍 **Multi-Region Support** - Deploy to any DigitalOcean region
- 🔒 **Secure Secret Management** - Automatic secret generation and reference handling
- 📊 **Built-in Monitoring** - Deployment status, logs, and alerts
- 🔄 **Auto-Scaling** - Automatic scaling based on demand
- 🌐 **Custom Domains** - Support for custom domain configuration
- 📝 **Log Forwarding** - Integration with Datadog and Logtail
- 🎯 **Multiple Runtimes** - Support for Node.js, Python, Go, PHP, and Ruby

## Quick Start

### 1. Set Up DigitalOcean API Token

```bash
# Get API token from https://cloud.digitalocean.com/account/api/tokens
monk secret set do-api-token "your_digitalocean_api_token_here"
```

### 2. Basic Function Deployment

```yaml
my-nodejs-function:
  defines: do-function/function
  app_name: my-app
  component_name: hello-function
  github_repo: https://github.com/digitalocean/sample-functions-nodejs-helloworld
  github_branch: main
  region: nyc1
  api_token_secret_ref: do-api-token
```

### 3. Deploy

```bash
monk run my-nodejs-function
```

## Configuration Reference

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `app_name` | Name of the App Platform app | `my-app` |
| `component_name` | Name of the function component | `api-function` |
| `github_repo` | GitHub repository URL | `https://github.com/user/repo` |
| `api_token_secret_ref` | Secret reference for DO API token | `do-api-token` |

### Optional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `github_branch` | `main` | Git branch to deploy |
| `source_dir` | `/` | Source directory in repository |
| `region` | `nyc` | DigitalOcean region |
| `environment_slug` | `node-js` | Runtime environment |
| `instance_count` | `1` | Number of instances (1-10) |
| `instance_size_slug` | `basic-xxs` | Instance size |
| `cpu_kind` | `shared` | CPU type (`shared` or `dedicated`) |
| `github_deploy_on_push` | `true` | Auto-deploy on GitHub push |

### Supported Regions

- `nyc1`, `nyc3` - New York
- `sfo1`, `sfo2`, `sfo3` - San Francisco  
- `ams2`, `ams3` - Amsterdam
- `sgp1` - Singapore
- `lon1` - London
- `fra1` - Frankfurt
- `tor1` - Toronto
- `blr1` - Bangalore
- `syd1` - Sydney

### Supported Runtimes

- `node-js` - Node.js (recommended)
- `python` - Python
- `go` - Go
- `php` - PHP
- `ruby` - Ruby
- `static-site` - Static sites

### Instance Sizes

- `basic-xxs` - 0.25 vCPU, 0.5 GB RAM
- `basic-xs` - 0.5 vCPU, 1 GB RAM
- `basic-s` - 1 vCPU, 2 GB RAM
- `basic-m` - 2 vCPU, 4 GB RAM
- `professional-xs` - 1 vCPU, 2 GB RAM (dedicated)
- `professional-s` - 2 vCPU, 4 GB RAM (dedicated)
- `professional-m` - 4 vCPU, 8 GB RAM (dedicated)
- `professional-l` - 8 vCPU, 16 GB RAM (dedicated)
- `professional-xl` - 16 vCPU, 32 GB RAM (dedicated)

## Security

### Automatic Secret Management

The entity automatically handles secret generation and management:

```yaml
my-secure-function:
  defines: do-function/function
  app_name: secure-app
  component_name: api-function
  github_repo: https://github.com/user/secure-api
  api_token_secret_ref: do-api-token
  envs:
    - key: DATABASE_URL
      value: secret("database-url")  # Secure secret reference
      scope: RUN_TIME
      type: SECRET
    - key: JWT_SECRET
      value: secret("jwt-secret")
      scope: RUN_TIME
      type: SECRET
```

### No Plain Text Secrets

❌ **Never use plain text secrets:**
```yaml
# DON'T DO THIS
envs:
  - key: API_KEY
    value: "plain-text-secret"  # SECURITY RISK!
```

✅ **Always use secret references:**
```yaml
# DO THIS INSTEAD
envs:
  - key: API_KEY
    value: secret("api-key-secret")
    type: SECRET
```

## Custom Actions

### get-function-info

Get comprehensive function information:

```bash
monk do my-function get-function-info
```

**Output includes:**
- App and component details
- Deployment status
- Environment configuration
- GitHub integration settings
- Environment variables (secrets hidden)
- Active deployment information

### get-connection-info

Get function URLs and connection details:

```bash
monk do my-function get-connection-info
```

**Output includes:**
- Live function URL
- Test commands (curl examples)
- Custom domains
- Function routes
- Management console links

### get-logs

Retrieve deployment and runtime logs:

```bash
monk do my-function get-logs
```

**Features:**
- Deployment logs
- Runtime logs
- Error messages
- Build output

### redeploy

Trigger a new deployment:

```bash
monk do my-function redeploy
```

**Use cases:**
- Force rebuild after code changes
- Recover from failed deployments
- Apply configuration updates

## Advanced Configuration

### Environment Variables

```yaml
production-api:
  defines: do-function/function
  app_name: prod-api
  component_name: api-function
  github_repo: https://github.com/company/api
  api_token_secret_ref: do-api-token
  envs:
    - key: NODE_ENV
      value: production
      scope: RUN_AND_BUILD_TIME
      type: GENERAL
    - key: DATABASE_URL
      value: secret("prod-database-url")
      scope: RUN_TIME
      type: SECRET
    - key: REDIS_URL
      value: secret("prod-redis-url")
      scope: RUN_TIME
      type: SECRET
```

### Custom Domains

```yaml
custom-domain-function:
  defines: do-function/function
  app_name: api-service
  component_name: main-api
  github_repo: https://github.com/company/api
  api_token_secret_ref: do-api-token
  domains:
    - domain: api.company.com
      type: PRIMARY
      zone: company.com
      minimum_tls_version: "1.2"
    - domain: api-v2.company.com
      type: ALIAS
      zone: company.com
```

### Custom Routes

```yaml
multi-route-function:
  defines: do-function/function
  app_name: api-gateway
  component_name: gateway-function
  github_repo: https://github.com/company/gateway
  api_token_secret_ref: do-api-token
  routes:
    - path: /api/v1
      preserve_path_prefix: true
    - path: /health
      preserve_path_prefix: false
    - path: /metrics
      preserve_path_prefix: false
```

### Log Forwarding

#### Datadog Integration

```yaml
datadog-monitored-function:
  defines: do-function/function
  app_name: monitored-app
  component_name: api-function
  github_repo: https://github.com/company/api
  api_token_secret_ref: do-api-token
  log_destinations:
    - name: datadog-logs
      datadog:
        endpoint: https://http-intake.logs.datadoghq.com
        api_key_secret_ref: datadog-api-key
```

#### Logtail Integration

```yaml
logtail-monitored-function:
  defines: do-function/function
  app_name: logged-app
  component_name: api-function
  github_repo: https://github.com/company/api
  api_token_secret_ref: do-api-token
  log_destinations:
    - name: logtail-logs
      logtail:
        token_secret_ref: logtail-token
```

### Alerts Configuration

```yaml
production-function-with-alerts:
  defines: do-function/function
  app_name: critical-service
  component_name: main-function
  github_repo: https://github.com/company/critical-service
  api_token_secret_ref: do-api-token
  alerts:
    - rule: DEPLOYMENT_FAILED
      disabled: false
    - rule: FUNCTIONS_ERROR_RATE_PER_MINUTE
      disabled: false
    - rule: FUNCTIONS_AVERAGE_DURATION_MS
      disabled: false
```

### High-Performance Configuration

```yaml
high-performance-function:
  defines: do-function/function
  app_name: high-perf-app
  component_name: compute-function
  github_repo: https://github.com/company/compute-service
  api_token_secret_ref: do-api-token
  region: fra1
  environment_slug: go
  instance_count: 5
  instance_size_slug: professional-l
  cpu_kind: dedicated
  build_command: go build -ldflags="-s -w" -o main .
  run_command: ./main
```

## Multi-Environment Deployment

```yaml
# Development environment
dev-api:
  defines: do-function/function
  app_name: myapp-dev
  component_name: api-function
  github_repo: https://github.com/company/api
  github_branch: develop
  region: nyc1
  instance_count: 1
  instance_size_slug: basic-xxs
  api_token_secret_ref: do-api-token
  envs:
    - key: NODE_ENV
      value: development
      scope: RUN_AND_BUILD_TIME
      type: GENERAL

# Staging environment
staging-api:
  defines: do-function/function
  app_name: myapp-staging
  component_name: api-function
  github_repo: https://github.com/company/api
  github_branch: staging
  region: sfo3
  instance_count: 2
  instance_size_slug: basic-s
  api_token_secret_ref: do-api-token
  envs:
    - key: NODE_ENV
      value: staging
      scope: RUN_AND_BUILD_TIME
      type: GENERAL

# Production environment
production-api:
  defines: do-function/function
  app_name: myapp-production
  component_name: api-function
  github_repo: https://github.com/company/api
  github_branch: main
  region: fra1
  instance_count: 5
  instance_size_slug: professional-s
  cpu_kind: dedicated
  api_token_secret_ref: do-api-token
  domains:
    - domain: api.company.com
      type: PRIMARY
      zone: company.com
  alerts:
    - rule: DEPLOYMENT_FAILED
    - rule: FUNCTIONS_ERROR_RATE_PER_MINUTE
  envs:
    - key: NODE_ENV
      value: production
      scope: RUN_AND_BUILD_TIME
      type: GENERAL

# Deploy all environments
multi-env-deployment:
  defines: process-group
  runnable-list:
    - dev-api
    - staging-api
    - production-api
```

## Function Project Structure

Your GitHub repository should follow the [DigitalOcean Functions project structure](https://docs.digitalocean.com/products/functions/how-to/structure-projects/):

```
your-function-repo/
├── project.yml              # Function configuration
└── packages/
    └── sample/              # Package name
        └── hello/           # Function name
            ├── index.js     # Function code
            └── package.json # Dependencies (Node.js)
```

### Example `project.yml`

```yaml
packages:
  - name: sample
    functions:
      - name: hello
        runtime: nodejs:default
```

### Example Function Code (`index.js`)

```javascript
function main(args) {
    const name = args.name || 'World';
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { message: `Hello, ${name}!` }
    };
}

exports.main = main;
```

## Required DigitalOcean Permissions

Your DigitalOcean API token needs the following permissions:

- **App Platform**: Full access
  - Create, read, update, delete apps
  - Manage deployments
  - Access logs
- **Domains**: Read access (if using custom domains)
- **Account**: Read access (for region validation)

## Troubleshooting

### Common Issues

1. **Deployment Failures**
   ```
   Error: Deployment failed with status ERROR
   ```
   - Check GitHub repository accessibility
   - Verify project.yml structure
   - Review build logs via `get-logs` action
   - Ensure all dependencies are properly specified

2. **GitHub Integration Issues**
   ```
   Error: Repository not found or not accessible
   ```
   - Verify repository URL format
   - Ensure repository is public or accessible
   - Check GitHub permissions

3. **Environment Variable Issues**
   ```
   Error: Failed to resolve secret reference
   ```
   - Verify secret exists: `monk secret get secret-name`
   - Check secret reference format: `secret("secret-name")`
   - Ensure secret scope is appropriate

4. **Domain Configuration Issues**
   ```
   Error: Domain validation failed
   ```
   - Verify domain ownership
   - Check DNS configuration
   - Ensure domain zone is correct

### Debug Commands

```bash
# Check function status
monk do my-function get-function-info

# View deployment logs
monk do my-function get-logs

# Test function endpoint
monk do my-function get-connection-info

# Trigger redeploy
monk do my-function redeploy

# Check entity state
monk inspect my-function
```

## Performance Considerations

### Scaling

- **Instance Count**: Scale horizontally (1-10 instances)
- **Instance Size**: Scale vertically (basic-xxs to professional-xl)
- **CPU Type**: Use dedicated CPUs for consistent performance
- **Region**: Choose regions close to your users

### Optimization Tips

1. **Cold Start Reduction**
   - Use smaller instance sizes for faster cold starts
   - Implement proper connection pooling
   - Minimize dependency loading

2. **Memory Management**
   - Monitor memory usage via logs
   - Choose appropriate instance sizes
   - Implement efficient data structures

3. **Build Optimization**
   - Use custom build commands for optimization
   - Minimize bundle sizes
   - Leverage build caching

## Testing

### Integration Tests

```bash
# Build the entity
./build.sh do-function

# Run all tests
sudo INPUT_DIR=./src/do-function/ ./monkec.sh test

# Run specific test
sudo INPUT_DIR=./src/do-function/ ./monkec.sh test --test-case test-basic-nodejs-function
```

### Test Coverage

- ✅ Function creation and deployment
- ✅ Environment variable handling
- ✅ Secret reference resolution
- ✅ Custom domains and routes
- ✅ Log forwarding configuration
- ✅ All custom actions
- ✅ Update operations
- ✅ Pre-existing resource detection
- ✅ Error handling and edge cases

## Pricing

DigitalOcean App Platform Functions pricing:

- **Basic Tier**: $5/month for basic-xxs instances
- **Professional Tier**: $12/month for professional-xs instances
- **Bandwidth**: $0.01/GB for outbound data transfer
- **Build Minutes**: Included in tier pricing

See [DigitalOcean App Platform Pricing](https://www.digitalocean.com/pricing/app-platform) for current rates.

## Limitations

- **Maximum Instances**: 10 per function component
- **Maximum Memory**: 32 GB (professional-xl)
- **Request Timeout**: 900 seconds (15 minutes)
- **Build Timeout**: 30 minutes
- **Repository Size**: 2 GB maximum
- **Environment Variables**: 100 per function

## Related Documentation

- [DigitalOcean Functions Documentation](https://docs.digitalocean.com/products/functions/)
- [App Platform Functions Guide](https://docs.digitalocean.com/products/functions/how-to/deploy-to-app-platform/)
- [Functions Project Structure](https://docs.digitalocean.com/products/functions/how-to/structure-projects/)
- [App Platform API Reference](https://docs.digitalocean.com/reference/api/api-reference/#tag/Apps)

## Support

For issues and questions:

1. Check the troubleshooting section above
2. Review DigitalOcean documentation
3. Check DigitalOcean status page
4. Contact DigitalOcean support for platform issues

## License

This entity is part of the Monk orchestrator platform.
