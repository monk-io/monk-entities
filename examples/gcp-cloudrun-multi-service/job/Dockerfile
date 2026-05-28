# Multi-stage build for the Cloud Run Job
# This is the only pre-built image in the demo — Cloud Run Jobs require an image URI,
# so source-deploy via blob_name is not available for jobs.

FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --silent
COPY . .

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S jobuser -u 1001

COPY package.json ./
RUN npm install --omit=dev --silent && npm cache clean --force

COPY --from=builder /app/index.js ./

RUN chown -R jobuser:nodejs /app
USER jobuser

ENV NODE_ENV=production

# Cloud Run Jobs: container must exit with 0 on success
CMD ["node", "index.js"]
