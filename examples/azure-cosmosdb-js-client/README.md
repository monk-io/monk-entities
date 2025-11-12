# Azure Cosmos DB JavaScript Client

A comprehensive TypeScript client application for Azure Cosmos DB demonstrating CRUD operations, connection string construction, and integration with MonkEC infrastructure.

## 🏗️ Architecture

This client supports three authentication methods:
1. **Constructed Connection String** (Recommended) - Built from `COSMOS_DB_ENDPOINT` + `COSMOS_DB_PRIMARY_KEY`
2. **Pre-built Connection String** - Using `COSMOS_DB_CONNECTION_STRING` 
3. **Azure AD Authentication** - Using `DefaultAzureCredential` with proper RBAC

## 📋 Prerequisites

- **Node.js** 18+ and npm
- **Docker** (for containerization)
- **Azure CLI** (for registry authentication)
- **TypeScript** (installed as dev dependency)

## 🚀 Development Setup

### 1. Install Dependencies

```bash
# Install all dependencies (including dev dependencies)
npm install
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp env.example .env

# Edit .env with your Azure Cosmos DB details
nano .env
```

**Environment Configuration Options:**

```bash
# Option 1: Constructed Connection String (RECOMMENDED)
COSMOS_DB_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_DB_PRIMARY_KEY=your-primary-key-here
COSMOS_DB_DATABASE_ID=your-database-name
COSMOS_DB_CONTAINER_ID=your-container-name

# Option 2: Pre-built Connection String
# COSMOS_DB_CONNECTION_STRING=AccountEndpoint=https://...;AccountKey=...;

# Option 3: Azure AD Authentication
# COSMOS_DB_ENDPOINT=https://your-account.documents.azure.com:443/
# AZURE_CLIENT_ID=your-client-id
# AZURE_CLIENT_SECRET=your-client-secret
# AZURE_TENANT_ID=your-tenant-id
```

### 3. Run in Development Mode

```bash
# Run with ts-node for development
npm run dev
```

## 🔨 Building the Application

### Build TypeScript Source Code

```bash
# Compile TypeScript to JavaScript
npm run build
```

This creates compiled JavaScript files in the `dist/` directory.

```bash
# Run the compiled JavaScript
npm start
```

### Clean Build Artifacts

```bash
# Remove compiled files
npm run clean
```

## 🐳 Docker Build Process

### 1. Build Docker Image

```bash
# Build the Docker image locally
docker build -t monkimages.azurecr.io/azure-cosmosdb-js-client:latest .
```

**Docker Build Process:**
- **Stage 1 (Builder)**: Installs all dependencies, compiles TypeScript
- **Stage 2 (Production)**: Installs only runtime dependencies, copies compiled code
- **Security**: Runs as non-root user (`cosmosdb`)
- **Optimization**: Multi-stage build for smaller final image

### 2. Test Docker Image Locally

```bash
# Run the container locally with environment file
docker run --env-file .env monkimages.azurecr.io/azure-cosmosdb-js-client:latest
```

### 3. Azure Container Registry Authentication

```bash
# Login to Azure
az login

# Login to Azure Container Registry
az acr login --name monkimages
```

### 4. Push Image to Registry

```bash
# Push the image to Azure Container Registry
docker push monkimages.azurecr.io/azure-cosmosdb-js-client:latest
```

## 📦 Complete Build & Push Workflow

Here's the complete workflow to build and deploy:

```bash
# 1. Ensure dependencies are installed
npm install

# 2. Build TypeScript (optional - Docker will do this)
npm run build

# 3. Build Docker image
docker build -t monkimages.azurecr.io/azure-cosmosdb-js-client:latest .

# 4. Authenticate with Azure Container Registry
az login
az acr login --name monkimages

# 5. Push image to registry
docker push monkimages.azurecr.io/azure-cosmosdb-js-client:latest
```

## 🎯 MonkEC Integration

### Using with MonkEC Orchestration

The client integrates seamlessly with MonkEC infrastructure:

```yaml
# azure-cosmosdb-client.yaml
cosmosdb-js-client:
  defines: runnable
  variables:
    cosmos_db_endpoint:
      env: COSMOS_DB_ENDPOINT
      value: <- connection-target("cosmos-account") entity-state get-member("document_endpoint")
      type: string
    
    cosmos_db_primary_key:
      env: COSMOS_DB_PRIMARY_KEY
      value: <- secret("cosmos-db-primary-key")
      type: string
```

### Deploy with MonkEC

```bash
# Load the MonkEC templates
monk load azure-cosmosdb-client.yaml

# Run the complete stack (Account + Database + Container + Client)
monk run azure-cosmosdb-client-example/example-stack
```

## 🔧 Configuration Details

### Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `COSMOS_DB_ENDPOINT` | Cosmos DB account endpoint | Yes* | `https://account.documents.azure.com:443/` |
| `COSMOS_DB_PRIMARY_KEY` | Primary access key | Yes* | `base64-encoded-key` |
| `COSMOS_DB_CONNECTION_STRING` | Complete connection string | Yes* | `AccountEndpoint=...;AccountKey=...;` |
| `COSMOS_DB_DATABASE_ID` | Database name | Yes | `ecommerce` |
| `COSMOS_DB_CONTAINER_ID` | Container name | Yes | `products` |
| `OPERATION_INTERVAL_MS` | Delay between operations | No | `3000` |
| `MAX_OPERATIONS` | Max operations to run | No | `50` |

*Either provide `COSMOS_DB_CONNECTION_STRING` OR (`COSMOS_DB_ENDPOINT` + `COSMOS_DB_PRIMARY_KEY`) OR (`COSMOS_DB_ENDPOINT` for Azure AD)

### Authentication Priority

The client uses this authentication priority:

1. **Pre-built Connection String** (`COSMOS_DB_CONNECTION_STRING`)
2. **Constructed Connection String** (`COSMOS_DB_ENDPOINT` + `COSMOS_DB_PRIMARY_KEY`)
3. **Azure AD Authentication** (`COSMOS_DB_ENDPOINT` only with `DefaultAzureCredential`)

## 🔍 Troubleshooting

### Build Issues

**Problem**: `npm ci` fails with package-lock.json error
```bash
# Solution: Regenerate package-lock.json
rm package-lock.json
npm install
```

**Problem**: TypeScript compilation errors
```bash
# Solution: Check TypeScript configuration
npx tsc --noEmit
```

### Docker Build Issues  

**Problem**: npm install fails in Docker
```bash
# Solution: Ensure package-lock.json exists
npm install  # Generate package-lock.json locally
docker build --no-cache -t image-name .
```

**Problem**: Permission denied in container
```bash
# Solution: Check user permissions in Dockerfile
# The app runs as non-root user 'cosmosdb'
```

### Runtime Issues

**Problem**: Connection refused or authentication failed
```bash
# Solution: Verify environment variables
echo $COSMOS_DB_ENDPOINT
echo $COSMOS_DB_DATABASE_ID

# Check if account exists and is accessible
az cosmosdb show --name account-name --resource-group rg-name
```

## 🧪 Testing

### Local Development Testing

```bash
# Run with test configuration
npm run dev
```

### Docker Testing

```bash
# Test Docker image locally
docker run --env-file .env monkimages.azurecr.io/azure-cosmosdb-js-client:latest
```

### MonkEC Testing

```bash
# Test with MonkEC orchestration
monk run azure-cosmosdb-client-example/cosmosdb-js-client
```

## 📊 Operations Demonstrated

The client demonstrates these Cosmos DB operations:

- **CREATE**: Creating products with auto-generated data
- **READ**: Retrieving products by ID  
- **UPDATE**: Modifying product properties using patch operations
- **QUERY**: SQL-like queries with parameters
- **DELETE**: Removing products
- **BATCH**: Creating multiple products efficiently

## 🎛️ Client Configuration

### Operation Control

- **Interval**: Time between operation cycles (default: 3000ms)
- **Max Operations**: Limit total operations (0 = unlimited)
- **Graceful Shutdown**: Responds to SIGINT/SIGTERM signals

### Container Information

The client displays:
- Container partition key configuration
- Indexing policy settings
- Request charge (RU) consumption for each operation

## 📝 Logs and Monitoring

The client provides detailed logging:

```
🚀 Azure Cosmos DB Client starting...
🔧 Using constructed connection string from endpoint + primary key
📍 Endpoint: https://account.documents.azure.com:443/
🔑 Primary Key: [provided]
🎯 Starting Azure Cosmos DB operations demonstration...
📊 CONTAINER Information:
   Container ID: products
   Partition Key: {"paths":["/id"],"kind":"Hash"}
📝 CREATE Operation:
   Creating product: Premium Widget ($42.99)
   ✅ Product created successfully
   📊 Request Charge: 7.05 RUs
```

## 🔒 Security Notes

- **Secrets**: Access keys are managed via MonkEC secrets
- **Non-root**: Docker container runs as non-root user
- **Environment**: Sensitive data via environment variables only
- **Azure AD**: Supports modern authentication for enterprise scenarios

---

**Built with ❤️ for MonkEC Azure Cosmos DB integration**
