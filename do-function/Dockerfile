# DigitalOcean Functions Deployment Container
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    jq \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install doctl
RUN curl -sL https://github.com/digitalocean/doctl/releases/download/v1.104.0/doctl-1.104.0-linux-amd64.tar.gz | tar -xzv && \
    mv doctl /usr/local/bin/doctl && \
    chmod +x /usr/local/bin/doctl

# Note: doctl serverless extension will be installed at runtime after authentication

# Create working directory
WORKDIR /app

# Copy deployment and delete scripts
COPY deploy.sh /app/deploy.sh
COPY delete.sh /app/delete.sh
RUN chmod +x /app/deploy.sh /app/delete.sh

# Set environment variables with defaults
# Note: DO_API_TOKEN should be provided at runtime for security
ENV NAMESPACE_NAME="default"
ENV PROJECT_PATH="/functions"
ENV FUNCTION_NAME=""
ENV RUNTIME="python:3.9"
ENV MEMORY="128"
ENV TIMEOUT="30"
ENV ENVIRONMENT_VARS=""
ENV DEPLOY_ONLY="false"
ENV POST_DEPLOY=""
ENV DELETE_FUNCTION="false"
ENV POST_DELETE=""

# Create functions directory
RUN mkdir -p /functions

# Default command
CMD ["/app/deploy.sh"]
