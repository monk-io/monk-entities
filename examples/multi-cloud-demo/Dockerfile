FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci --silent

COPY src/ ./src/

RUN npm run build

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

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT||3000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" || exit 1

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/index.js"]
