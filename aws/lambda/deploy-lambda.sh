#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate required environment variables
validate_env() {
    local required_vars=(
        "AWS_ACCESS_KEY_ID"
        "AWS_SECRET_ACCESS_KEY"
        "AWS_DEFAULT_REGION"
        "LAMBDA_FUNCTION_NAME"
        "LAMBDA_RUNTIME"
        "LAMBDA_ROLE"
        "LAMBDA_HANDLER"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi
}

# Check if deployment package exists
check_deployment_package() {
    if [[ ! -f "/deployment/function.zip" ]]; then
        print_error "Deployment package not found at /deployment/function.zip"
        print_error "Please mount your zip file to /deployment/function.zip"
        exit 1
    fi
    print_info "Deployment package found: /deployment/function.zip"
}

# Validate Lambda execution role exists
validate_role() {
    # Extract role name from ARN (format: arn:aws:iam::account:role/role-name)
    local role_name
    role_name=$(echo "$LAMBDA_ROLE" | cut -d'/' -f2)
    
    if [[ -z "$role_name" ]]; then
        print_error "Invalid LAMBDA_ROLE format. Expected ARN format: arn:aws:iam::account:role/role-name"
        exit 1
    fi
    
    print_info "Validating IAM role exists: $role_name"
    
    # Check if role exists
    if ! aws iam get-role --role-name "$role_name" >/dev/null 2>&1; then
        print_error "IAM role '$role_name' does not exist"
        print_error "Please create the role first using the AWS IAM role entity or AWS console"
        print_error "Example: Create role with aws/role entity and pass ARN via LAMBDA_ROLE environment variable"
        exit 1
    fi
    
    print_info "IAM role '$role_name' exists and is ready"
}

# Create lambda function
create_lambda_function() {
    print_info "Creating Lambda function: $LAMBDA_FUNCTION_NAME"
    
    # Build the AWS CLI command
    local cmd=(
        "aws" "lambda" "create-function"
        "--function-name" "$LAMBDA_FUNCTION_NAME"
        "--runtime" "$LAMBDA_RUNTIME"
        "--role" "$LAMBDA_ROLE"
        "--handler" "$LAMBDA_HANDLER"
        "--zip-file" "fileb:///deployment/function.zip"
    )
    
    # Add optional parameters if they exist
    if [[ -n "$LAMBDA_DESCRIPTION" ]]; then
        cmd+=("--description" "$LAMBDA_DESCRIPTION")
    fi
    
    if [[ -n "$LAMBDA_TIMEOUT" ]]; then
        cmd+=("--timeout" "$LAMBDA_TIMEOUT")
    fi
    
    if [[ -n "$LAMBDA_MEMORY_SIZE" ]]; then
        cmd+=("--memory-size" "$LAMBDA_MEMORY_SIZE")
    fi
    
    if [[ -n "$LAMBDA_ENVIRONMENT_VARIABLES" ]]; then
        cmd+=("--environment" "$LAMBDA_ENVIRONMENT_VARIABLES")
    fi
    
    if [[ -n "$LAMBDA_VPC_CONFIG" ]]; then
        cmd+=("--vpc-config" "$LAMBDA_VPC_CONFIG")
    fi
    
    if [[ -n "$LAMBDA_DEAD_LETTER_CONFIG" ]]; then
        cmd+=("--dead-letter-config" "$LAMBDA_DEAD_LETTER_CONFIG")
    fi
    
    if [[ -n "$LAMBDA_TRACING_CONFIG" ]]; then
        cmd+=("--tracing-config" "$LAMBDA_TRACING_CONFIG")
    fi
    
    if [[ -n "$LAMBDA_TAGS" ]]; then
        cmd+=("--tags" "$LAMBDA_TAGS")
    fi
    
    if [[ -n "$LAMBDA_LAYERS" ]]; then
        cmd+=("--layers" "$LAMBDA_LAYERS")
    fi
    
    if [[ -n "$LAMBDA_FILE_SYSTEM_CONFIGS" ]]; then
        cmd+=("--file-system-configs" "$LAMBDA_FILE_SYSTEM_CONFIGS")
    fi
    
    if [[ -n "$LAMBDA_IMAGE_CONFIG" ]]; then
        cmd+=("--image-config" "$LAMBDA_IMAGE_CONFIG")
    fi
    
    if [[ -n "$LAMBDA_CODE_SIGNING_CONFIG_ARN" ]]; then
        cmd+=("--code-signing-config-arn" "$LAMBDA_CODE_SIGNING_CONFIG_ARN")
    fi
    
    if [[ -n "$LAMBDA_ARCHITECTURES" ]]; then
        cmd+=("--architectures" "$LAMBDA_ARCHITECTURES")
    fi
    
    if [[ -n "$LAMBDA_EPHEMERAL_STORAGE" ]]; then
        cmd+=("--ephemeral-storage" "$LAMBDA_EPHEMERAL_STORAGE")
    fi
    
    if [[ -n "$LAMBDA_LOGGING_CONFIG" ]]; then
        cmd+=("--logging-config" "$LAMBDA_LOGGING_CONFIG")
    fi
    
    # Execute the command
    print_info "Executing: ${cmd[*]}"
    
    if "${cmd[@]}"; then
        print_info "Lambda function '$LAMBDA_FUNCTION_NAME' created successfully!"
        
        # Get function info
        print_info "Function details:"
        aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --query 'Configuration.{FunctionName:FunctionName,Runtime:Runtime,State:State,LastModified:LastModified}' --output table
        
        exit 0
    else
        print_error "Failed to create Lambda function '$LAMBDA_FUNCTION_NAME'"
        exit 1
    fi
}

# Main execution
main() {
    print_info "Starting Lambda deployment process..."
    
    # Validate environment variables
    validate_env
    
    # Check deployment package
    check_deployment_package
    
    # Validate Lambda execution role exists
    validate_role
    
    # Create lambda function
    create_lambda_function
}

# Execute main function
main "$@" 