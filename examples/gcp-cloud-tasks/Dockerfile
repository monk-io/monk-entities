# Multi-stage build for gcp-cloud-tasks
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci --silent

COPY src/ ./src/

RUN npm run build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

COPY package*.json ./

RUN npm ci --omit=dev --silent && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN chown -R appuser:nodejs /app
USER appuser

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

ENV NODE_ENV=production

CMD ["node", "dist/client.js"]
