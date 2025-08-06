# Use the official Node.js 18 Alpine image as base
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Install system dependencies for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies and TypeScript files to reduce image size
RUN npm ci --only=production && \
    rm -rf src/ tsconfig.json && \
    npm cache clean --force

# Create non-root user for security
RUN addgroup -g 1001 -S rdsuser && \
    adduser -S rdsuser -u 1001 -G rdsuser

# Create logs directory with proper permissions
RUN mkdir -p /app/logs && \
    chown -R rdsuser:rdsuser /app

# Switch to non-root user
USER rdsuser

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('RDS Client is running')" || exit 1

# Command to run the application
CMD ["npm", "start"] 