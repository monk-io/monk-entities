# Multi-stage build for AWS Lambda
FROM public.ecr.aws/lambda/nodejs:20 as lambda

# Copy function code and dependencies
COPY src/ ${LAMBDA_TASK_ROOT}/src/
COPY package.json ${LAMBDA_TASK_ROOT}/

# Install production dependencies
WORKDIR ${LAMBDA_TASK_ROOT}
RUN npm ci --only=production

# Set the CMD to your handler (could also be done as a parameter override outside of the Dockerfile)
CMD [ "src/index.handler" ]

# Alternative stage for local development
FROM node:20-alpine as development

WORKDIR /app

# Copy package files
COPY package.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Expose port for local development server (if adding one)
EXPOSE 3000

# For local development, you might want to run a development server
# CMD ["node", "src/index.js"]

# Default to Lambda runtime for AWS deployment
FROM lambda as default 