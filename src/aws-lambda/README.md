# AWS Lambda Entity

This entity manages AWS Lambda functions using the AWS REST API. The Lambda code is stored in blobs and deployed using the built-in blob storage system.

## Features

- **Function Lifecycle Management**: Create, update, and delete Lambda functions
- **Blob Integration**: Deploy Lambda code from blob storage with automatic ZIP conversion
- **Configuration Management**: Full support for Lambda configuration options
- **State Tracking**: Comprehensive state management and readiness checks
- **Custom Actions**: Invoke functions, update code, and view logs
- **Error Handling**: Robust error handling with detailed AWS API error messages
- **Type Safety**: Full TypeScript support with comprehensive interfaces

## Entity Types

### LambdaFunction

Manages individual AWS Lambda functions with their code, configuration, and lifecycle.

## Usage

### Basic Function

```yaml
namespace: my-app

my-lambda:
  defines: aws-lambda/function
  region: us-east-1
  blob_name: my-lambda-code
  function_name: my-lambda-function
  runtime: nodejs20.x
  role: arn:aws:iam::123456789012:role/lambda-execution-role
  handler: index.handler
  description: "My Lambda function"
  timeout: 30
  memory_size: 256
```

### Advanced Configuration

```yaml
namespace: my-app

advanced-lambda:
  defines: aws-lambda/function
  region: us-west-2
  blob_name: advanced-lambda-code
  function_name: advanced-lambda-function
  runtime: python3.11
  role: arn:aws:iam::123456789012:role/lambda-execution-role
  handler: app.lambda_handler
  description: "Advanced Lambda with full configuration"
  timeout: 300
  memory_size: 1024
  environment:
    variables:
      ENV: production
      DEBUG: "false"
      DATABASE_URL: "postgresql://..."
  tracing_config:
    mode: Active
  tags:
    Environment: production
    Team: backend
  layers:
    - arn:aws:lambda:us-west-2:123456789012:layer:my-layer:1
  architectures:
    - arm64
  ephemeral_storage:
    size: 1024
  logging_config:
    log_format: JSON
    application_log_level: INFO
    system_log_level: WARN
```

### Container Image Function

```yaml
namespace: my-app

container-lambda:
  defines: aws-lambda/function
  region: eu-west-1
  blob_name: container-lambda-code
  function_name: container-lambda-function
  runtime: nodejs20.x
  role: arn:aws:iam::123456789012:role/lambda-execution-role
  handler: index.handler
  package_type: Image
  image_config:
    entry_point:
      - "/app/index.js"
    command:
      - "handler"
    working_directory: "/app"
```

## Configuration

### Required Fields

- `region`: AWS region for the Lambda function
- `blob_name`: Name of the blob containing the Lambda code
- `function_name`: Name of the Lambda function
- `runtime`: Lambda runtime (see supported runtimes below)
- `role`: IAM role ARN for Lambda execution
- `handler`: Function handler (e.g., `index.handler`)

### Optional Fields

- `description`: Function description
- `timeout`: Function timeout in seconds (1-900, default: 3)
- `memory_size`: Memory allocation in MB (128-10240, default: 128)
- `environment`: Environment variables configuration
- `dead_letter_config`: Dead letter queue configuration
- `kms_key_arn`: KMS key for encryption
- `tracing_config`: X-Ray tracing configuration
- `tags`: Function tags
- `layers`: Lambda layers ARNs
- `file_system_configs`: EFS file system configurations
- `image_config`: Container image configuration
- `code_signing_config_arn`: Code signing configuration
- `architectures`: Function architectures (x86_64, arm64)
- `ephemeral_storage`: Ephemeral storage configuration
- `snap_start`: SnapStart configuration
- `logging_config`: CloudWatch Logs configuration
- `package_type`: Package type (Zip or Image, default: Zip)
- `publish`: Whether to publish a version (default: false)

## Supported Runtimes

### Node.js
- `nodejs18.x`
- `nodejs20.x`

### Python
- `python3.8`
- `python3.9`
- `python3.10`
- `python3.11`
- `python3.12`

### Java
- `java8`
- `java8.al2`
- `java11`
- `java17`
- `java21`

### .NET
- `dotnet6`
- `dotnet8`

### Go
- `go1.x`

### Ruby
- `ruby2.7`
- `ruby3.2`

### Custom
- `provided`
- `provided.al2`
- `provided.al2023`

## Actions

### invoke

Invokes the Lambda function with optional payload and invocation type.

```bash
monk do my-app/my-lambda invoke payload='{"key": "value"}' invocationType=RequestResponse
```

**Parameters:**
- `payload`: JSON payload to send (default: "{}")
- `invocationType`: Invocation type - RequestResponse, Event, or DryRun (default: RequestResponse)

### update-code

Updates the Lambda function code from the blob without changing configuration.

```bash
monk do my-app/my-lambda update-code
```

### get-logs

Displays information about the CloudWatch Log Group for the function.

```bash
monk do my-app/my-lambda get-logs
```

## AWS Credentials

AWS credentials are automatically injected into the built-in `aws` module, so no manual credential configuration is required.

## Blob Storage

The Lambda code must be stored in a blob. The blob should contain a ZIP archive with your Lambda code.

### Creating a Blob

1. Create a ZIP archive of your Lambda code:
   ```bash
   zip -r my-lambda-code.zip index.js package.json node_modules/
   ```

2. Store it as a blob (implementation depends on your blob storage system):
   ```bash
   # Example - actual command may vary
   monk blob put my-lambda-code my-lambda-code.zip
   ```

### Supported Archive Formats

The entity uses the `blobs.zip()` function to convert blob content to ZIP format, so your blob can be in any format supported by the blob system (typically TAR archives that get converted to ZIP).

## State Management

The entity tracks the following state:

- `existing`: Whether the function existed before creation
- `function_name`: The function name
- `function_arn`: The function ARN
- `code_sha256`: SHA256 hash of the function code
- `last_modified`: Last modification timestamp
- `state`: Function state (Pending, Active, Inactive, Failed)
- `state_reason`: Reason for current state
- `runtime`: Function runtime
- `role`: Execution role ARN
- `handler`: Function handler
- `timeout`: Function timeout
- `memory_size`: Memory allocation
- `code_size`: Code package size
- `version`: Function version
- `last_update_status`: Last update status
- `revision_id`: Function revision ID

## Error Handling

The entity provides detailed error messages for common scenarios:

- **Invalid credentials**: Clear message about credential format
- **Function not found**: Handled gracefully during checks
- **Blob not found**: Error if the specified blob doesn't exist
- **AWS API errors**: Detailed error messages from AWS API responses
- **Validation errors**: Client-side validation for configuration parameters

## Readiness Checks

The entity implements comprehensive readiness checks:

- **Frequency**: Every 10 seconds
- **Initial Delay**: 5 seconds
- **Max Attempts**: 30 (5 minutes total)
- **Criteria**: Function state is "Active" and last update status is "Successful"

## Examples

### Simple Node.js Function

```yaml
namespace: hello-world

hello-lambda:
  defines: aws-lambda/function
  region: us-east-1
  blob_name: hello-world-code
  function_name: hello-world
  runtime: nodejs20.x
  role: arn:aws:iam::123456789012:role/lambda-role
  handler: index.handler
  timeout: 10
  memory_size: 128
```

### Python Function with Environment Variables

```yaml
namespace: data-processor

processor-lambda:
  defines: aws-lambda/function
  region: us-west-2
  blob_name: processor-code
  function_name: data-processor
  runtime: python3.11
  role: arn:aws:iam::123456789012:role/processor-role
  handler: app.process_data
  timeout: 120
  memory_size: 512
  environment:
    variables:
      S3_BUCKET: my-data-bucket
      DB_HOST: db.example.com
      LOG_LEVEL: INFO
  tags:
    Project: data-processing
    Environment: production
```

### Java Function with Layers

```yaml
namespace: api

api-lambda:
  defines: aws-lambda/function
  region: eu-central-1
  blob_name: api-code
  function_name: api-handler
  runtime: java21
  role: arn:aws:iam::123456789012:role/api-role
  handler: com.example.ApiHandler::handleRequest
  timeout: 30
  memory_size: 1024
  layers:
    - arn:aws:lambda:eu-central-1:123456789012:layer:aws-lambda-java-libs:2
    - arn:aws:lambda:eu-central-1:123456789012:layer:observability:1
  architectures:
    - arm64
  tracing_config:
    mode: Active
```

## Integration testing

See the `test/` directory for comprehensive integration tests that demonstrate:

- Function creation and lifecycle management
- Code updates from blobs
- Configuration changes
- Custom actions (invoke, get-logs, update-code)
- Error handling scenarios

## Troubleshooting

### Common Issues

1. **Blob not found**: Ensure the blob exists and contains valid ZIP archive
2. **Invalid role**: Verify the IAM role exists and has necessary permissions
3. **Region mismatch**: Ensure the region matches your AWS setup
4. **Timeout errors**: Increase timeout for complex functions
5. **Memory errors**: Increase memory_size for memory-intensive functions

### Debug Tips

- Use `monk describe` to check entity state
- Check CloudWatch Logs for function execution logs
- Verify AWS credentials have necessary Lambda permissions
- Ensure blob contains valid Lambda deployment package

### Required AWS Permissions

The AWS credentials need the following Lambda permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:CreateFunction",
        "lambda:GetFunction",
        "lambda:UpdateFunctionCode",
        "lambda:UpdateFunctionConfiguration",
        "lambda:DeleteFunction",
        "lambda:InvokeFunction",
        "lambda:TagResource",
        "lambda:UntagResource"
      ],
      "Resource": "*"
    }
  ]
}
``` 

## Manual testing

1. Create cluster, add AWS provider

2. Build test lambda code
```
cd ./src/aws-lambda/test/lambda-go-test-code
GOOS=linux GOARCH=amd64 go build -tags lambda.norpc -o bootstrap main.go
```

2. Upload templates

```
monk load ./dist/aws-iam/MANIFEST 
monk load ./dist/aws-lambda/MANIFEST 
monk load ./src/aws-lambda/test/MANIFEST 
```

3. Run the test stack

```
monk run aws-lambda-test/stack
```

### Update lambda code

1. Rebuild code

2. Load template (update blob)
```
monk load ./src/aws-lambda/test/MANIFEST 
```

3. Update lambda function code
```
monk do aws-lambda-test/lambda-go-function/update-code
``

4. Invoke lambda function
```
monk do aws-lambda-test/lambda-function/invoke
monk do aws-lambda-test/lambda-go-function/invoke
```
