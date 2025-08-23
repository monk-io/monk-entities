#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

log "🗑️ DigitalOcean Functions Delete Script"

# Validate required environment variables
if [ -z "$DO_API_TOKEN" ]; then
    error "DO_API_TOKEN environment variable is required"
    exit 1
fi

if [ -z "$FUNCTION_NAME" ]; then
    error "FUNCTION_NAME environment variable is required"
    exit 1
fi

log "Function to delete: $FUNCTION_NAME"
log "Namespace: ${NAMESPACE_NAME:-default}"

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

# Set default namespace if not provided
NAMESPACE_NAME=${NAMESPACE_NAME:-default}

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

# Delete the function
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
    exit 1
fi

# Run post-delete script if provided
if [ -n "$POST_DELETE" ]; then
    log "Running post-delete script..."
    eval "$POST_DELETE"
fi

success "Delete operation completed!"

# Show remaining functions
log "Remaining functions in namespace $NAMESPACE_NAME:"
doctl serverless functions list --access-token "$DO_API_TOKEN"
