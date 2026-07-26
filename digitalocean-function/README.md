# DigitalOcean Functions Deployment

Deploy DigitalOcean Functions using either a Docker container or Monk runnable template. Supports multiple runtimes with automatic authentication, namespace management, and remote builds.

## 📦 **Two Deployment Options**

1. **Docker Container** - Standalone deployment using Docker/Docker Compose
2. **Monk Runnable** - Integrated deployment using Monk orchestration platform

> 💡 **For Monk users**: See [RUNNABLE.md](RUNNABLE.md) for the Monk runnable template documentation.

## 🚀 **Quick Start (Docker)**

### 1. Get Your DigitalOcean API Token

1. Go to [DigitalOcean API Tokens](https://cloud.digitalocean.com/account/api/tokens)
2. Create a new Personal Access Token with read/write permissions
3. Copy the token

### 2. Set Up Environment Variables

```bash
# Copy the example environment file
cp env.example .env

# Edit .env and add your API token
DO_API_TOKEN=your_digitalocean_api_token_here
FUNCTION_NAME=my-awesome-function
```

### 3. Deploy Using Docker Compose

```bash
# Deploy the Python example (recommended - most reliable)
docker-compose up --build

# Or deploy your own function
docker-compose run --rm \
  -v ./my-function:/functions:ro \
  -e FUNCTION_NAME=my-function \
  do-function-deployer
```

### 4. Delete a Function

```bash
# Method 1: Use dedicated delete service (recommended)
docker-compose run --rm delete-function

# Method 2: Delete specific function
docker-compose run --rm \
  -e FUNCTION_NAME=my-function \
  delete-function

# Method 3: Use the original method with DELETE_FUNCTION variable
docker-compose run --rm \
  -e FUNCTION_NAME=my-function \
  -e DELETE_FUNCTION=true \
  do-function-deployer
```

## 🏗️ **Quick Start (Monk Runnable)**

### 1. Set Up Secret

```bash
# Add your DigitalOcean API token to Monk secrets
monk secret set default-do-api-token "your_digitalocean_api_token_here"
```

### 2. Use the Template

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
```

### 3. Deploy

```bash
monk run my-app/deploy-my-function
```

> 📖 **Full Documentation**: See [RUNNABLE.md](RUNNABLE.md) for complete Monk runnable documentation.

## 📋 **Configuration Options**

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DO_API_TOKEN` | ✅ | - | DigitalOcean API token |
| `FUNCTION_NAME` | ✅ | `hello-world` | Name of the function to deploy |
| `NAMESPACE_NAME` | ❌ | `default` | DigitalOcean Functions namespace |
| `RUNTIME` | ❌ | `python:3.9` | Function runtime |
| `MEMORY` | ❌ | `128` | Memory limit in MB |
| `TIMEOUT` | ❌ | `30` | Timeout in seconds |
| `ENVIRONMENT_VARS` | ❌ | - | JSON string of environment variables |
| `DEPLOY_ONLY` | ❌ | `false` | Exit after deployment (true/false) |
| `DELETE_FUNCTION` | ❌ | `false` | Delete function instead of deploying (true/false) |
| `POST_DELETE` | ❌ | - | Script to run after function deletion |

### Supported Runtimes

- ✅ `python:3.9` (recommended - most reliable)
- ✅ `python:3.8` (reliable)
- ✅ `go:default` (reliable - see Go section)
- ✅ `php:8.0` (reliable)
- ⚠️ `nodejs:default` (works with remote build, see Node.js section)

## 🐍 **Python Functions (Recommended)**

Python functions are the most reliable and easiest to deploy.

### Example Python Function

```python
# main.py
def main(args):
    name = args.get('name', 'World')
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': {
            'message': f'Hello, {name}!',
            'timestamp': datetime.now().isoformat()
        }
    }
```

### Deploy Python Function

```bash
docker compose run --rm \
  -e FUNCTION_NAME=my-python-func \
  -e RUNTIME=python:3.9 \
  -v ./my-python-function:/functions:ro \
  do-function-deployer
```

## 🗑️ **Deleting Functions**

### Method 1: Dedicated Delete Service (Recommended)

```bash
# Simple deletion - uses FUNCTION_NAME from .env
docker-compose run --rm delete-function

# Delete specific function
docker-compose run --rm \
  -e FUNCTION_NAME=my-function \
  delete-function

# Delete with post-action
docker-compose run --rm \
  -e FUNCTION_NAME=my-api \
  -e POST_DELETE="curl -X POST https://webhook.site/notify" \
  delete-function
```

### Method 2: Standalone Docker Commands

```bash
# Direct docker run with delete script
docker run --rm \
  -e DO_API_TOKEN="your_token" \
  -e FUNCTION_NAME="function-to-delete" \
  do-function-deployer:latest \
  /app/delete.sh

# With custom namespace and post-delete
docker run --rm \
  -e DO_API_TOKEN="your_token" \
  -e FUNCTION_NAME="old-api" \
  -e NAMESPACE_NAME="production" \
  -e POST_DELETE="echo 'Production API removed'" \
  do-function-deployer:latest \
  /app/delete.sh
```

### Method 3: Using .env File

```bash
# Set up .env for deletion
echo "FUNCTION_NAME=function-to-delete" >> .env
echo "POST_DELETE=echo 'Function deleted successfully'" >> .env

# Run deletion
docker-compose run --rm delete-function
```

### Method 4: Batch Delete Multiple Functions

```bash
# Delete multiple functions
for func in "old-api" "test-function" "deprecated-service"; do
  docker-compose run --rm \
    -e FUNCTION_NAME="$func" \
    delete-function
done
```

## 🚀 **Go Functions**

Go functions use the official DigitalOcean project structure and are compiled remotely.

### Working Go Structure

Use the official DigitalOcean project structure (based on [sample-functions-golang-helloworld](https://github.com/digitalocean/sample-functions-golang-helloworld)):

```
my-go-project/
├── project.yml          # Required project configuration
└── packages/
    └── sample/
        └── hello/
            ├── main.go      # Function code
            └── go.mod       # Go module (optional)
```

**project.yml:**
```yaml
packages:
  - name: sample
    functions:
      - name: hello
        runtime: go:default
```

**main.go:**
```go
package main

import (
    "context"
    "fmt"
)

type Event struct {
    Name string `json:"name"`
}

type Response struct {
    Body string `json:"body"`
}

func Main(ctx context.Context, event Event) Response {
    name := "stranger"
    if event.Name != "" {
        name = event.Name
    }
    return Response{
        Body: fmt.Sprintf("Hello %s!", name),
    }
}
```

### Deploy Go Function

```bash
docker compose run --rm \
  -e FUNCTION_NAME=hello \
  -e RUNTIME=go:default \
  -v ./example-go-project:/functions:ro \
  do-function-deployer
```

## 📦 **Node.js Functions**

Node.js functions require special handling due to npm dependencies.

### Working Node.js Structure

Use the official DigitalOcean project structure:

```
my-nodejs-project/
├── project.yml          # Required project configuration
└── packages/
    └── sample/
        └── hello/
            ├── hello.js     # Function code
            └── package.json # Dependencies (optional)
```

**project.yml:**
```yaml
packages:
  - name: sample
    functions:
      - name: hello
        runtime: nodejs:default
```

**hello.js:**
```javascript
function main(args) {
    let name = 'stranger';
    if (args.name) {
        name = args.name;
    }
    return {
        body: `Hello ${name}!`
    };
}

exports.main = main;
```

### Deploy Node.js Function

```bash
docker compose run --rm \
  -e FUNCTION_NAME=hello \
  -e RUNTIME=nodejs:default \
  -v ./example-nodejs-project:/functions:ro \
  do-function-deployer
```

## 💡 **Usage Examples**

### Basic Deployment

```bash
# Deploy Python function (recommended)
docker compose up --build
```

### Custom Python Function

```bash
docker compose run --rm \
  -e FUNCTION_NAME=my-api \
  -e RUNTIME=python:3.9 \
  -v ./my-api-function:/functions:ro \
  do-function-deployer
```

### Go Function

```bash
docker compose run --rm \
  -e FUNCTION_NAME=hello \
  -e RUNTIME=go:default \
  -v ./my-go-project:/functions:ro \
  do-function-deployer
```

### With Environment Variables

```bash
docker compose run --rm \
  -e FUNCTION_NAME=api-function \
  -e ENVIRONMENT_VARS='{"NODE_ENV":"production","API_KEY":"secret123"}' \
  -v ./my-function:/functions:ro \
  do-function-deployer
```

### Deploy and Exit

```bash
docker compose run --rm \
  -e DEPLOY_ONLY=true \
  -e FUNCTION_NAME=quick-deploy \
  -v ./my-function:/functions:ro \
  do-function-deployer
```

## 🔧 **Debugging**

When `DEPLOY_ONLY=false` (default), the container stays running after deployment:

```bash
# Get container ID
docker ps

# Execute commands in the running container
docker exec -it <container_id> bash

# List functions
docker exec -it <container_id> doctl serverless functions list --access-token $DO_API_TOKEN

# Get function details
docker exec -it <container_id> doctl serverless functions get my-function --access-token $DO_API_TOKEN

# Invoke function
docker exec -it <container_id> doctl serverless functions invoke my-function --access-token $DO_API_TOKEN

# View logs
docker exec -it <container_id> doctl serverless functions logs my-function --access-token $DO_API_TOKEN
```

## 🚨 **Troubleshooting**

### Authentication Issues

```bash
# Verify your token works
docker run --rm \
  -e DO_API_TOKEN=your_token \
  digitalocean/doctl:latest \
  doctl account get
```

### Node.js npm Issues

**Problem**: `npm: command not found` during deployment.

**Solutions**:
1. **Use Python instead** (recommended):
```bash
docker compose run --rm \
  -e RUNTIME=python:3.9 \
  -v ./my-python-function:/functions:ro \
  do-function-deployer
```

2. **Use official Node.js project structure** with `nodejs:default` runtime
3. **Ensure remote build** is enabled (automatic in our container)

### Function Not Found

- Check that `FUNCTION_NAME` matches your function's name
- Ensure your function exports a `main` function
- Verify the runtime matches your code language

### Deployment Failures

- Check function logs: `doctl serverless functions logs <function-name>`
- Verify namespace exists: `doctl serverless namespaces list`
- Check function limits (memory, timeout)

## 📁 **Function Code Structure**

### Single Function (Python - Recommended)

```
my-function/
├── main.py        # Main function file
└── ...           # Other files (optional)
```

### Project Structure (Go)

```
my-go-project/
├── project.yml     # DigitalOcean Functions project configuration
└── packages/
    └── sample/
        └── hello/
            ├── main.go
            └── go.mod
```

### Project Structure (Node.js)

```
my-nodejs-project/
├── project.yml     # DigitalOcean Functions project configuration
└── packages/
    └── sample/
        └── hello/
            ├── hello.js
            └── package.json
```

## 🎯 **Best Practices**

1. **Use Python for reliability** - Most stable runtime
2. **Keep functions small** - Faster deployment and execution
3. **Use environment variables** - For configuration and secrets
4. **Test locally first** - Validate function logic before deployment
5. **Monitor logs** - Use `doctl serverless functions logs` for debugging

## 🔗 **References**

- [DigitalOcean Functions Documentation](https://docs.digitalocean.com/products/functions)
- [Official Node.js Example](https://github.com/digitalocean/sample-functions-nodejs-helloworld)
- [Project Configuration Reference](https://docs.digitalocean.com/products/functions/reference/project-configuration/)

## 📄 **License**

MIT License - see LICENSE file for details.