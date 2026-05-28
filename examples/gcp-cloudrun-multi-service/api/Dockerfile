# API service for GCP Cloud Run multi-service demo
FROM node:22-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S apiuser -u 1001
COPY package.json index.js ./
RUN npm install --omit=dev --silent && npm cache clean --force && \
    chown -R apiuser:nodejs /app
USER apiuser
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1
CMD ["node", "index.js"]
