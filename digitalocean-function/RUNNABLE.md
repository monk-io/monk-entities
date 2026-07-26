# DigitalOcean Functions Runnable Template

A Monk runnable template for deploying DigitalOcean Functions with automatic authentication, namespace management, and multi-runtime support.

## 🚀 **Quick Start**

### 1. Set Up Secrets

```bash
# Add your DigitalOcean API token to Monk secrets
monk secret set default-do-api-token "your_digitalocean_api_token_here"
```

### 2. Load the Template

```yaml
# your-app.yaml
namespace: my-app

load:
  - do-functions.yaml

deploy-my-function:
  defines: process-group
  runnable-list:
    - do-functions/deploy
  variables:
    function-name: my-api
    runtime: python:3.9
    namespace-name: production
```

### 3. Deploy

```bash
# Deploy your function
monk run my-app/deploy-my-function
```

## 📋 **Configuration Variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `function-name` | ✅ | `hello-world` | Name of the function to deploy |
| `runtime` | ❌ | `python:3.9` | Function runtime |
| `namespace-name` | ❌ | `default` | DigitalOcean Functions namespace |
| `region` | ❌ | `nyc1` | DigitalOcean region |
| `memory` | ❌ | `128` | Memory limit in MB |
| `timeout` | ❌ | `30` | Timeout in seconds |
| `environment-vars` | ❌ | `{}` | JSON string of environment variables |
| `post-deploy` | ❌ | - | Custom post-deployment script |

## 🎯 **Supported Runtimes**

- ✅ `python:3.9` (recommended)
- ✅ `python:3.8`
- ✅ `go:default`
- ✅ `nodejs:default`
- ✅ `php:8.0`

## 🌍 **Supported Regions**

- `nyc1` (New York 1)
- `nyc3` (New York 3)
- `sfo3` (San Francisco 3)
- `ams3` (Amsterdam 3)
- `sgp1` (Singapore 1)
- `lon1` (London 1)
- `fra1` (Frankfurt 1)
- `tor1` (Toronto 1)
- `blr1` (Bangalore 1)

## 💡 **Usage Examples**

### Python Function

```yaml
deploy-python-api:
  defines: process-group
  runnable-list:
    - do-functions/deploy
  variables:
    function-name: user-api
    runtime: python:3.9
    memory: "256"
    timeout: "60"
    namespace-name: production
    environment-vars: <- `{"DATABASE_URL":"postgresql://...","API_VERSION":"v2"}`
    post-deploy: <- `echo "API deployed! Testing endpoint..." && curl -X GET https://your-function-url`
```

### Go Function

```yaml
deploy-go-service:
  defines: process-group
  runnable-list:
    - do-functions/deploy
  variables:
    function-name: hello
    runtime: go:default
    memory: "128"
    timeout: "30"
    namespace-name: staging
    region: sfo3
    post-deploy: <- `doctl serverless functions invoke sample/hello -p name:Production --access-token $DO_API_TOKEN`
```

### Node.js Function

```yaml
deploy-nodejs-webhook:
  defines: process-group
  runnable-list:
    - do-functions/deploy
  variables:
    function-name: webhook-handler
    runtime: nodejs:default
    memory: "256"
    timeout: "45"
    namespace-name: webhooks
    environment-vars: <- `{"NODE_ENV":"production","WEBHOOK_SECRET":"your-secret"}`
    post-deploy: <- `echo "Webhook handler deployed successfully"`
```

### Multi-Environment Deployment

```yaml
# Deploy to multiple environments
deploy-staging:
  defines: process-group
  runnable-list:
    - do-functions/deploy
  variables:
    function-name: my-app
    runtime: python:3.9
    namespace-name: staging
    region: nyc1
    environment-vars: <- `{"ENV":"staging","DEBUG":"true"}`

deploy-production:
  defines: process-group
  runnable-list:
    - do-functions/deploy
  variables:
    function-name: my-app
    runtime: python:3.9
    namespace-name: production
    region: fra1
    memory: "512"
    timeout: "60"
    environment-vars: <- `{"ENV":"production","DEBUG":"false"}`
```

## 📁 **Function Code Structure**

The runnable expects your function code to be available as a blob. Mount it to `/functions`:

### Single Function (Python)

```yaml
# In your runnable definition
paths:
  - <- `blobs://my-python-function:/functions`
```

```
my-python-function/
├── main.py        # Your function code
└── requirements.txt (optional)
```

### Project Structure (Go/Node.js)

```yaml
# In your runnable definition  
paths:
  - <- `blobs://my-go-project:/functions`
```

```
my-go-project/
├── project.yml
└── packages/
    └── sample/
        └── hello/
            ├── main.go
            └── go.mod
```

## 🔧 **Advanced Configuration**

### Custom Post-Deploy Actions

```yaml
deploy-with-testing:
  defines: process-group
  runnable-list:
    - do-functions/deploy
  variables:
    function-name: api-endpoint
    runtime: python:3.9
    post-deploy: <- `
      echo "Running post-deployment tests..."
      
      # Get function URL
      FUNCTION_URL=$(doctl serverless functions get api-endpoint --url --access-token $DO_API_TOKEN)
      
      # Test the endpoint
      curl -f "$FUNCTION_URL" || exit 1
      
      # Send notification
      echo "✅ Function deployed and tested successfully!"
      
      # Optional: Update monitoring/alerting
      # webhook-notify "Function api-endpoint deployed to production"
    `
```

### Environment-Specific Configuration

```yaml
variables:
  # Use different configurations per environment
  memory: <- `${{ env == "production" ? "512" : "128" }}`
  timeout: <- `${{ env == "production" ? "60" : "30" }}`
  region: <- `${{ env == "production" ? "fra1" : "nyc1" }}`
```

## 🚨 **Troubleshooting**

### Secret Not Found

```bash
# Verify secret exists
monk secret list

# Set the secret
monk secret set default-do-api-token "dop_v1_your_token_here"
```

### Function Deployment Fails

Check the logs for specific error messages:

```bash
# View deployment logs
monk logs my-app/deploy-my-function

# Common issues:
# 1. Invalid runtime format
# 2. Missing function code
# 3. Incorrect project.yml structure
# 4. Network connectivity issues
```

### Namespace Issues

```bash
# List available namespaces
doctl serverless namespaces list --access-token your_token

# Create namespace manually if needed
doctl serverless namespaces create --label my-namespace --region nyc1 --access-token your_token
```

## 🎯 **Best Practices**

1. **Use Secrets**: Always store API tokens in Monk secrets
2. **Environment Variables**: Use `environment-vars` for function configuration
3. **Resource Limits**: Set appropriate `memory` and `timeout` values
4. **Post-Deploy Testing**: Use `post-deploy` scripts to verify deployments
5. **Namespace Organization**: Use different namespaces for different environments
6. **Region Selection**: Choose regions close to your users
7. **Monitoring**: Implement post-deploy health checks

## 🔗 **References**

- [DigitalOcean Functions Documentation](https://docs.digitalocean.com/products/functions)
- [Monk Documentation](https://docs.monk.io)
- [doctl CLI Reference](https://docs.digitalocean.com/reference/doctl/)

## 📄 **License**

MIT License - see LICENSE file for details.
