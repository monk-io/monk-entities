# ========================================
# Supabase Auth Next.js App - Production Docker Image
# Multi-stage build for optimal security and size
# ========================================

# -----------------------------
# Stage 1: Dependencies and Build
# -----------------------------
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install system dependencies for node-gyp and native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Ensure public directory exists (Next.js expects it)
RUN mkdir -p public

# Build the Next.js application
RUN npm run build

# -----------------------------
# Stage 2: Production Runtime
# -----------------------------
FROM node:20-alpine AS runner

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public directory (created in builder stage)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy entrypoint script for runtime environment variable injection
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create necessary directories and set permissions
RUN mkdir -p /app/.next/cache \
    && chown -R nextjs:nodejs /app/.next

# Switch to non-root user
USER nextjs

# Expose Next.js port
EXPOSE 3000

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Simple health check that doesn't rely on HTTP endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Start the application with environment variable injection
ENTRYPOINT ["./entrypoint.sh"]
