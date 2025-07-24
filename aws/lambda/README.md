# AWS Lambda Deployment Docker Container

This Docker container provides an easy way to deploy AWS Lambda functions using the AWS CLI. It accepts AWS credentials and Lambda function parameters through environment variables and deploys your function using a mounted zip file.

## Features

- Uses official AWS CLI Docker image
- Validates all required environment variables
- **Validates that Lambda execution roles exist before deployment**
- Supports all AWS Lambda create-function parameters
- Provides colored output for better readability
- Exits cleanly after deployment with appropriate status codes
- Security-focused with non-root user execution

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_ACCESS_KEY_ID` | AWS Access Key ID | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Access Key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_DEFAULT_REGION` | AWS Region | `us-east-1` |
| `LAMBDA_FUNCTION_NAME` | Name of the Lambda function | `my-lambda-function` |
| `LAMBDA_RUNTIME` | Runtime environment | `python3.9`, `nodejs18.x`, `java11`, etc. |
| `LAMBDA_ROLE` | IAM Role ARN for the function | `arn:aws:iam::123456789012:role/lambda-role` |
| `LAMBDA_HANDLER` | Function handler | `index.handler`, `lambda_function.lambda_handler` |

## Optional Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `LAMBDA_DESCRIPTION` | Description of the function | `"My Lambda function"` |
| `LAMBDA_TIMEOUT` | Timeout in seconds (1-900) | `30` |
| `LAMBDA_MEMORY_SIZE` | Memory size in MB (128-10240) | `256` |
| `LAMBDA_ENVIRONMENT_VARIABLES` | Environment variables for function | `'Variables={KEY1=value1,KEY2=value2}'` |
| `LAMBDA_VPC_CONFIG` | VPC configuration | `'SubnetIds=subnet-12345,SecurityGroupIds=sg-67890'` |
| `LAMBDA_DEAD_LETTER_CONFIG` | Dead letter queue config | `'TargetArn=arn:aws:sqs:region:account:queue'` |
| `LAMBDA_TRACING_CONFIG` | X-Ray tracing config | `'Mode=Active'` |
| `LAMBDA_TAGS` | Resource tags | `'Environment=prod,Team=backend'` |
| `LAMBDA_LAYERS` | Layer ARNs | `'arn:aws:lambda:region:account:layer:my-layer:1'` |
| `LAMBDA_ARCHITECTURES` | Instruction set architecture | `'x86_64'` or `'arm64'` |
| `LAMBDA_EPHEMERAL_STORAGE` | Ephemeral storage config | `'Size=1024'` |

## Usage

### 1. Build the Docker Image

```bash
cd aws/lambda
docker build -t lambda-deployer .
```

### 2. Prepare Your Deployment Package

Create a zip file containing your Lambda function code:

```bash
# Example for Python
zip -r function.zip lambda_function.py requirements.txt

# Example for Node.js
zip -r function.zip index.js package.json node_modules/
```

### 3. Deploy the Lambda Function

#### Basic Example

```bash
docker run --rm \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret_key \
  -e AWS_DEFAULT_REGION=us-east-1 \
  -e LAMBDA_FUNCTION_NAME=my-function \
  -e LAMBDA_RUNTIME=python3.9 \
  -e LAMBDA_ROLE=arn:aws:iam::123456789012:role/lambda-execution-role \
  -e LAMBDA_HANDLER=lambda_function.lambda_handler \
  -v /path/to/your/function.zip:/deployment/function.zip \
  lambda-deployer
```

#### Advanced Example with Optional Parameters

```bash
docker run --rm \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  -e AWS_SECRET_ACCESS_KEY=your_secret_key \
  -e AWS_DEFAULT_REGION=us-east-1 \
  -e LAMBDA_FUNCTION_NAME=my-advanced-function \
  -e LAMBDA_RUNTIME=python3.9 \
  -e LAMBDA_ROLE=arn:aws:iam::123456789012:role/lambda-execution-role \
  -e LAMBDA_HANDLER=lambda_function.lambda_handler \
  -e LAMBDA_DESCRIPTION="My advanced Lambda function" \
  -e LAMBDA_TIMEOUT=60 \
  -e LAMBDA_MEMORY_SIZE=512 \
  -e LAMBDA_ENVIRONMENT_VARIABLES='Variables={ENV=production,DEBUG=false}' \
  -e LAMBDA_TAGS='Environment=production,Team=backend' \
  -v /path/to/your/function.zip:/deployment/function.zip \
  lambda-deployer
```

#### Using Environment File

Create a `.env` file:

```bash
# .env file
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=us-east-1
LAMBDA_FUNCTION_NAME=my-function
LAMBDA_RUNTIME=python3.9
LAMBDA_ROLE=arn:aws:iam::123456789012:role/lambda-execution-role
LAMBDA_HANDLER=lambda_function.lambda_handler
LAMBDA_DESCRIPTION=My Lambda function
LAMBDA_TIMEOUT=30
LAMBDA_MEMORY_SIZE=256
```

Then run:

```bash
docker run --rm \
  --env-file .env \
  -v /path/to/your/function.zip:/deployment/function.zip \
  lambda-deployer
```

## Creating Lambda Execution Roles

Before deploying Lambda functions, you need to create an IAM role with appropriate permissions. You can do this using the AWS IAM role entity or the AWS console.

### Using AWS IAM Role Entity

Create a role entity in your monk configuration:

```yaml
lambda-execution-role:
  defines: aws/role
  name: my-lambda-execution-role
  path: /lambda/
  trustedService: lambda.amazonaws.com
  roleDescription: "Lambda execution role for my function"
  connections[override]:
    policy:
      runnable: aws/lambda-basic-policy
      service: policy

lambda-basic-policy:
  defines: aws/policy
  name: lambda-basic-execution-policy
  statement:
    Effect: "Allow"
    Action: 
      - "logs:CreateLogGroup"
      - "logs:CreateLogStream"
      - "logs:PutLogEvents"
    Resource: "arn:aws:logs:*:*:*"

# Deploy Lambda function using the role
my-lambda-deployment:
  defines: runnable
  variables:
    LAMBDA_ROLE:
      value: <- connection-target("role") entity-state get-member("arn")
    # ... other Lambda environment variables
  connections:
    role:
      runnable: aws/lambda-execution-role
      service: role
  containers:
    deployer:
      image: lambda-deployer
      environment:
        - LAMBDA_ROLE=${LAMBDA_ROLE}
        # ... other environment variables
      volumes:
        - ./function.zip:/deployment/function.zip
```

### Using AWS Console/CLI

If you create the role manually, ensure it has:

1. **Trust Policy** allowing Lambda service:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

2. **Basic execution permissions** (attach `AWSLambdaBasicExecutionRole` managed policy or create custom policy)

## Using AWS Session Token (for temporary credentials)

If you're using temporary AWS credentials (e.g., from AWS STS), you can also set:

```bash
-e AWS_SESSION_TOKEN=your_session_token
```

## IAM Role Requirements

Your IAM role specified in `LAMBDA_ROLE` must have the following basic permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

The user/role creating the Lambda function needs permissions like:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "lambda:CreateFunction",
                "lambda:GetFunction",
                "iam:PassRole",
                "iam:GetRole"
            ],
            "Resource": "*"
        }
    ]
}
```

**Note**: The `iam:GetRole` permission is needed to validate that the specified role exists. The container will not create roles - they must be created separately using the AWS IAM role entity or AWS console.

## Output

The container will:

1. Validate all required environment variables
2. Check that the deployment package exists
3. **Validate that the Lambda execution role exists**
4. Create the Lambda function using AWS CLI
5. Display the function details upon successful creation
6. Exit with status code 0 on success, 1 on failure

## Error Handling

The container will exit with appropriate error messages if:

- Required environment variables are missing
- The deployment zip file is not found at `/deployment/function.zip`
- The Lambda execution role doesn't exist (must be created separately)
- The AWS Lambda creation command fails
- AWS credentials are invalid or insufficient

## Security Notes

- The container runs as a non-root user (`lambda-deployer`)
- AWS credentials are passed as environment variables (consider using AWS IAM roles in production)
- The deployment package is mounted read-only

## Troubleshooting

### Common Issues

1. **"Deployment package not found"**
   - Ensure your zip file is mounted to `/deployment/function.zip`
   - Check file permissions

2. **"Missing required environment variables"**
   - Verify all required variables are set
   - Check for typos in variable names

3. **"Access Denied"**
   - Verify AWS credentials are correct
   - Check IAM permissions for both the user and the Lambda execution role

4. **"Role ARN is invalid"**
   - Ensure the IAM role exists and the ARN is correctly formatted
   - Verify the role has the necessary trust policy for Lambda

### Debug Mode

To see more detailed AWS CLI output, you can modify the container to run with AWS CLI debug flags by overriding the entrypoint:

```bash
docker run --rm \
  --entrypoint /bin/bash \
  -e AWS_ACCESS_KEY_ID=your_access_key \
  # ... other env vars ... \
  -v /path/to/your/function.zip:/deployment/function.zip \
  lambda-deployer \
  -c "AWS_CLI_AUTO_PROMPT=on-partial /app/deploy-lambda.sh"
``` 