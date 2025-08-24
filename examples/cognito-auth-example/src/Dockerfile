# Multi-stage build for React frontend
FROM node:18-alpine AS builder

# Build arguments for React environment variables
ARG REACT_APP_REGION=us-east-1
ARG REACT_APP_USER_POOL_ID
ARG REACT_APP_CLIENT_ID
ARG REACT_APP_DOMAIN
ARG REACT_APP_IDENTITY_POOL_ID
ARG REACT_APP_API_BASE_URL

# Set environment variables for build
ENV REACT_APP_REGION=$REACT_APP_REGION
ENV REACT_APP_USER_POOL_ID=$REACT_APP_USER_POOL_ID
ENV REACT_APP_CLIENT_ID=$REACT_APP_CLIENT_ID
ENV REACT_APP_DOMAIN=$REACT_APP_DOMAIN
ENV REACT_APP_IDENTITY_POOL_ID=$REACT_APP_IDENTITY_POOL_ID
ENV REACT_APP_API_BASE_URL=$REACT_APP_API_BASE_URL

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built application from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create nginx user and set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
