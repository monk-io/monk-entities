#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Validate required environment variables
if [ -z "$DO_API_TOKEN" ]; then
    error "DO_API_TOKEN environment variable is required"
    exit 1
fi

if [ -z "$FUNCTION_NAME" ]; then
    error "FUNCTION_NAME environment variable is required"
    exit 1
fi

# Check if this is a delete operation
if [ "$DELETE_FUNCTION" = "true" ]; then
    log "Delete mode enabled - will delete function: $FUNCTION_NAME"
fi

# Set up doctl configuration directory
log "Setting up DigitalOcean authentication..."
mkdir -p /root/.config/doctl
export DIGITALOCEAN_ACCESS_TOKEN="$DO_API_TOKEN"

# Initialize doctl authentication
log "Initializing doctl authentication..."
doctl auth init --access-token "$DO_API_TOKEN"

# Install serverless extension with retry logic
log "Installing doctl serverless extension..."
MAX_RETRIES=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if doctl serverless install; then
        log "Serverless extension installed successfully"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
            warn "Installation failed, retrying in 5 seconds... (attempt $RETRY_COUNT/$MAX_RETRIES)"
            sleep 5
        else
            error "Failed to install serverless extension after $MAX_RETRIES attempts"
            exit 1
        fi
    fi
done

# Check if functions directory exists and has content
if [ ! -d "$PROJECT_PATH" ] || [ -z "$(ls -A $PROJECT_PATH)" ]; then
    error "Functions directory $PROJECT_PATH does not exist or is empty"
    error "Please mount your function code to $PROJECT_PATH"
    exit 1
fi

log "Function code directory: $PROJECT_PATH"
log "Contents:"
ls -la "$PROJECT_PATH"

# List available namespaces first
log "Checking available namespaces..."
doctl serverless namespaces list --access-token "$DO_API_TOKEN"

# Create or connect to namespace
log "Setting up namespace: $NAMESPACE_NAME"
NAMESPACE_EXISTS=$(doctl serverless namespaces list --access-token "$DO_API_TOKEN" --format Label --no-header | grep -x "$NAMESPACE_NAME" || echo "")

if [ -n "$NAMESPACE_EXISTS" ]; then
    log "Namespace $NAMESPACE_NAME already exists"
else
    log "Creating namespace: $NAMESPACE_NAME"
    doctl serverless namespaces create --label "$NAMESPACE_NAME" --region nyc1 --access-token "$DO_API_TOKEN"
fi

# Connect to the namespace (change to writable directory first)
log "Connecting to namespace: $NAMESPACE_NAME"
cd /tmp
doctl serverless connect "$NAMESPACE_NAME" --access-token "$DO_API_TOKEN"

# Handle delete operation
if [ "$DELETE_FUNCTION" = "true" ]; then
    log "Deleting function: $FUNCTION_NAME"
    
    # Check if function exists first
    if doctl serverless functions list --access-token "$DO_API_TOKEN" | grep -q "$FUNCTION_NAME"; then
        log "Function $FUNCTION_NAME found, proceeding with deletion..."
        
        # Delete the function
        if doctl serverless functions delete "$FUNCTION_NAME" --access-token "$DO_API_TOKEN" --force; then
            success "Function $FUNCTION_NAME deleted successfully!"
        else
            error "Failed to delete function $FUNCTION_NAME"
            exit 1
        fi
    else
        warn "Function $FUNCTION_NAME not found in namespace $NAMESPACE_NAME"
        log "Available functions:"
        doctl serverless functions list --access-token "$DO_API_TOKEN"
    fi
    
    # Run post-delete script if provided
    if [ -n "$POST_DELETE" ]; then
        log "Running post-delete script..."
        eval "$POST_DELETE"
    fi
    
    success "Delete operation completed!"
    exit 0
fi

# Check if this is a project.yml based deployment or single function
if [ -f "$PROJECT_PATH/project.yml" ]; then
    log "Found project.yml - deploying entire project"
    # Create a writable copy of the project
    WORK_DIR="/tmp/project-deploy"
    mkdir -p "$WORK_DIR"
    cp -r "$PROJECT_PATH"/* "$WORK_DIR/"
    cd "$WORK_DIR"
    
    # Use remote build for all deployments to avoid npm/build issues
    log "Using remote build for reliable deployment"
    doctl serverless deploy . --remote-build --access-token "$DO_API_TOKEN"
else
    log "No project.yml found - deploying as single function"
    
    # Create a temporary working directory for deployment
    WORK_DIR="/tmp/function-deploy"
    mkdir -p "$WORK_DIR"
    cd "$WORK_DIR"
    
    # Create proper directory structure for DigitalOcean Functions
    mkdir -p "packages/default/$FUNCTION_NAME"
    cp -r "$PROJECT_PATH"/* "packages/default/$FUNCTION_NAME/"
    
    # Detect main file (index.js, main.py, hello.js, etc.)
    MAIN_FILE="index.js"
    if [ -f "packages/default/$FUNCTION_NAME/main.py" ]; then
        MAIN_FILE="main.py"
    elif [ -f "packages/default/$FUNCTION_NAME/hello.js" ]; then
        MAIN_FILE="hello.js"
    elif [ -f "packages/default/$FUNCTION_NAME/$FUNCTION_NAME.js" ]; then
        MAIN_FILE="$FUNCTION_NAME.js"
    fi
    
    # Create a project.yml for single function deployment (correct DigitalOcean format)

    cat > project.yml << EOF
packages:
  - name: default
    functions:
      - name: $FUNCTION_NAME
        runtime: $RUNTIME
        main: $MAIN_FILE
        limits:
          memory: $MEMORY
          timeout: ${TIMEOUT}000
EOF

    # Add environment variables if provided
    if [ -n "$ENVIRONMENT_VARS" ]; then
        log "Adding environment variables: $ENVIRONMENT_VARS"
        # Parse JSON environment variables and add to project.yml
        echo "$ENVIRONMENT_VARS" | jq -r 'to_entries[] | "          \(.key): \(.value)"' >> temp_env.txt
        if [ -s temp_env.txt ]; then
            sed -i '/environment: {}/r temp_env.txt' project.yml
            sed -i 's/environment: {}/environment:/' project.yml
        fi
        rm -f temp_env.txt
    fi
    
    log "Generated project.yml:"
    cat project.yml
    
    # Deploy the function with remote build for Node.js functions
    log "Deploying function: $FUNCTION_NAME"
    # Use remote build for all deployments to avoid npm/build issues
    log "Using remote build for reliable deployment"
    doctl serverless deploy . --remote-build --access-token "$DO_API_TOKEN"
fi

# Get function info
log "Getting function information..."
doctl serverless functions list --access-token "$DO_API_TOKEN"

# Get function URL if available
log "Function URLs:"
doctl serverless functions get "$FUNCTION_NAME" --url --access-token "$DO_API_TOKEN" 2>/dev/null || warn "Could not retrieve function URL"

success "Deployment completed successfully!"

# Run post-deploy script if provided
if [ -n "$POST_DEPLOY" ]; then
    log "Running post-deploy script..."
    eval "$POST_DEPLOY"
fi

# If DEPLOY_ONLY is false, keep container running for debugging
if [ "$DEPLOY_ONLY" != "true" ]; then
    log "Container will stay running for debugging. Set DEPLOY_ONLY=true to exit after deployment."
    log "Available commands:"
    log "  doctl serverless functions list"
    log "  doctl serverless functions get $FUNCTION_NAME"
    log "  doctl serverless functions invoke $FUNCTION_NAME"
    log "  doctl serverless functions logs $FUNCTION_NAME"
    
    # Keep container running
    tail -f /dev/null
fi
