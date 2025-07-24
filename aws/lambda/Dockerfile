FROM amazon/aws-cli:latest

# Install jq and shadow-utils for user management
USER root
RUN yum update -y && yum install -y jq shadow-utils && yum clean all

# Create a non-root user for security
RUN useradd -u 1001 lambda-deployer
USER lambda-deployer

# Create working directory
WORKDIR /app

# Copy the deployment script
COPY deploy-lambda.sh /app/deploy-lambda.sh

# Make script executable
USER root
RUN chmod +x /app/deploy-lambda.sh
USER lambda-deployer

# Set default entrypoint
ENTRYPOINT ["/app/deploy-lambda.sh"] 