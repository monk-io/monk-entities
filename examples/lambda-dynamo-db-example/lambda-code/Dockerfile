# Multi-stage build for AWS Lambda Container Images
FROM public.ecr.aws/lambda/nodejs:20 AS lambda

# Copy package.json first for better layer caching
COPY package.json ${LAMBDA_TASK_ROOT}/

# Install production dependencies only
WORKDIR ${LAMBDA_TASK_ROOT}
RUN npm install --omit=dev --ignore-scripts

# Copy function source code
COPY src/ ${LAMBDA_TASK_ROOT}/src/

# Ensure proper permissions for Lambda runtime
RUN chmod -R 755 ${LAMBDA_TASK_ROOT}

# Set the CMD to your handler (Lambda entry point)
# This can be overridden in the Lambda function configuration
CMD [ "src/index.handler" ]

# Alternative stage for local development and testing
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (including dev dependencies for testing)
RUN npm install

# Copy source code
COPY src/ ./src/

# Create non-root user for security in development
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the application directory
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port for local development server (if adding one)
EXPOSE 3000

# Development entry point (for local testing)
CMD ["node", "src/index.js"]

# Production stage - optimized for AWS Lambda
FROM lambda AS production

# Copy only the essential files for production
COPY package.json ${LAMBDA_TASK_ROOT}/
COPY src/ ${LAMBDA_TASK_ROOT}/src/

# Install production dependencies with optimizations
WORKDIR ${LAMBDA_TASK_ROOT}
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

# Remove unnecessary files to reduce image size
RUN rm -rf /var/cache/apk/* /tmp/* /var/tmp/* ~/.npm

# Set proper permissions
RUN chmod -R 755 ${LAMBDA_TASK_ROOT}

# Set the function handler
CMD [ "src/index.handler" ]

# Default stage for AWS Lambda deployment
FROM production AS default 