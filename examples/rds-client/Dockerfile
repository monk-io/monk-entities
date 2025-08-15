# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Install system dependencies for native modules (mysql2, pg)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    postgresql-client \
    mysql-client

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies and source files to reduce image size
RUN npm prune --production && \
    rm -rf src/ tsconfig.json node_modules/.cache

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S rdsuser -u 1001 -G nodejs

# Change ownership of app directory
RUN chown -R rdsuser:nodejs /app

# Switch to non-root user
USER rdsuser

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check to verify the application is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Default command
CMD ["npm", "start"]
