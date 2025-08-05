# Use Node.js LTS Alpine image for smaller size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    bash \
    curl

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev deps for building)
RUN npm install && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S worker -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R worker:nodejs /app

# Switch to non-root user
USER worker

# Health check - simple process check for the worker
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD pgrep -f "node.*worker" || exit 1

# Start the worker
CMD ["npm", "start"] 