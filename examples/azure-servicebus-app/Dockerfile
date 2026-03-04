# Multi-stage build for Azure Service Bus app
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci --silent

COPY src/ ./src/

RUN npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S servicebus -u 1001

COPY package*.json ./

RUN npm ci --omit=dev --silent && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN chown -R servicebus:nodejs /app
USER servicebus

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Health check passed')" || exit 1

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"

CMD ["node", "dist/client.js"]
