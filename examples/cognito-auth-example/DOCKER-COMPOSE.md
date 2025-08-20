# 🐳 Docker Compose Setup

This guide shows how to run the AWS Cognito authentication example using Docker Compose for local development and testing.

## 📋 Prerequisites

1. **Docker & Docker Compose** installed
2. **Existing AWS Cognito Infrastructure** (created via Monk or AWS Console)
3. **AWS Cognito configuration values** (User Pool ID, Client ID, etc.)

## 🚀 Quick Start

### Step 1: Get AWS Cognito Configuration

You need the following values from your existing Cognito setup:

#### **Option A: From Monk (Recommended)**
```bash
# Deploy infrastructure first using Monk
monk load cognito-auth-example.yaml
monk run cognito-auth-example

# Get configuration values
monk describe cognito-auth-example/user-pool
monk describe cognito-auth-example/web-app-client  
monk describe cognito-auth-example/auth-domain
monk describe cognito-auth-example/identity-pool
```

#### **Option B: From AWS Console**
1. **User Pool ID**: AWS Cognito → User Pools → Your Pool → General settings
2. **Client ID**: AWS Cognito → User Pools → Your Pool → App clients
3. **Domain**: AWS Cognito → User Pools → Your Pool → Domain name
4. **Identity Pool ID**: AWS Cognito → Identity Pools → Your Pool

### Step 2: Configure Environment

```bash
# Copy environment template
cp docker.env.example .env

# Edit .env with your actual values
nano .env
```

Example `.env` file:
```bash
AWS_REGION=us-east-1
USER_POOL_ID=us-east-1_AbC123DeF
CLIENT_ID=1a2b3c4d5e6f7g8h9i0j1k2l3m
DOMAIN=my-app-auth-2025
IDENTITY_POOL_ID=us-east-1:12345678-1234-1234-1234-123456789012
```

### Step 3: Run with Docker Compose

```bash
# Build and start all services
docker compose up --build

# Or run in background
docker compose up -d --build

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Step 4: Access Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/public/health

## 🔧 Docker Compose Features

### **Service Architecture**
```yaml
┌─────────────────────────────────────────┐
│              Docker Network             │
│  (cognito-auth-network)                 │
│                                         │
│  ┌─────────────────┐  ┌───────────────┐ │
│  │   web-app       │  │  api-server   │ │
│  │   (Frontend)    │  │  (Backend)    │ │
│  │   Port: 3000    │  │  Port: 3001   │ │
│  │   Nginx + React │  │  Node.js + JWT│ │
│  └─────────────────┘  └───────────────┘ │
└─────────────────────────────────────────┘
```

### **Health Checks**
Both services include health checks:

```bash
# Check service health
docker compose ps

# Manual health check
curl http://localhost:3000/health  # Frontend
curl http://localhost:3001/api/public/health  # Backend
```

### **Service Dependencies**
- **Frontend** waits for **Backend** to be healthy
- **Restart policies** ensure services recover from failures
- **Network isolation** for secure communication

## 🛠️ Development Workflow

### **Development Mode**
```bash
# Build and run
docker compose up --build

# Rebuild specific service
docker compose build web-app
docker compose up web-app

# View service logs
docker compose logs -f api-server
docker compose logs -f web-app
```

### **Debugging**
```bash
# Execute commands in running containers
docker compose exec api-server sh
docker compose exec web-app sh

# Check container resources
docker compose top

# View detailed container info
docker compose ps --services
docker inspect cognito-auth-frontend
docker inspect cognito-auth-api
```

### **Environment Updates**
```bash
# After updating .env file
docker compose down
docker compose up --build
```

## 📊 Service Configuration

### **Frontend Service** (`web-app`)
- **Base Image**: `nginx:alpine`
- **Build Context**: `./src`
- **Port**: `3000`
- **Features**:
  - React build with environment variables
  - Nginx reverse proxy to backend
  - Static file serving with compression
  - Security headers

### **Backend Service** (`api-server`)
- **Base Image**: `node:18-alpine`
- **Build Context**: `./api`
- **Port**: `3001`
- **Features**:
  - JWT token validation
  - Health check endpoint
  - Non-root user security
  - Production dependencies only

## 🔍 Troubleshooting

### **Common Issues**

#### **1. Missing Environment Variables**
```
Error: USER_POOL_ID environment variable is required
```
**Solution**: Ensure all required variables are set in `.env` file

#### **2. Build Failures**
```
Error: Failed to build service 'web-app'
```
**Solution**: Check Docker build context and Dockerfile syntax
```bash
docker compose build --no-cache web-app
```

#### **3. Service Health Check Failures**
```
Error: web-app health check failing
```
**Solution**: Check service logs and network connectivity
```bash
docker compose logs web-app
docker compose exec web-app curl -f http://localhost:3000/health
```

#### **4. Network Connection Issues**
```
Error: Cannot connect to backend API
```
**Solution**: Verify services are on the same network
```bash
docker network ls
docker network inspect cognito-auth-network
```

### **Debug Commands**
```bash
# Check all services status
docker compose ps

# View service logs
docker compose logs --tail=50 api-server
docker compose logs --tail=50 web-app

# Test network connectivity
docker compose exec web-app ping api-server
docker compose exec api-server ping web-app

# Check environment variables
docker compose exec api-server env
docker compose exec web-app env

# Restart specific service
docker compose restart api-server
```

## 🔄 Updates and Maintenance

### **Update Dependencies**
```bash
# Rebuild with latest dependencies
docker compose build --no-cache

# Update base images
docker compose pull
docker compose up --build
```

### **Cleanup**
```bash
# Stop and remove containers
docker compose down

# Remove volumes and networks
docker compose down -v

# Remove images
docker compose down --rmi all

# Full cleanup
docker system prune -a
```

## 🚀 Production Considerations

### **For Production Deployment**
1. **Use environment-specific `.env` files**
2. **Configure proper domain names and HTTPS**
3. **Set up proper logging and monitoring**
4. **Use Docker secrets for sensitive data**
5. **Configure resource limits**

### **Production Docker Compose Example**
```yaml
# docker compose.prod.yml
version: '3.8'
services:
  web-app:
    build: ./src
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
        
  api-server:
    build: ./api
    restart: always
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

## 📚 Additional Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Best Practices](https://docs.docker.com/develop/best-practices/)
- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)

---

**🎉 You now have a complete containerized AWS Cognito authentication system!**

The Docker Compose setup provides a perfect environment for development, testing, and local demonstrations of the Cognito authentication flow.
