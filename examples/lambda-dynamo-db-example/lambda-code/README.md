# AWS Lambda + DynamoDB Example

![Production Ready](https://img.shields.io/badge/status-production%20ready-green.svg)

This example demonstrates a complete serverless application using AWS Lambda and DynamoDB with the Monk orchestrator framework. The Lambda function provides a RESTful API for user management with full CRUD operations backed by DynamoDB.

## 🏗️ Architecture

### Components

1. **DynamoDB Table** (`users-table`)
   - Primary key: `id` (String)
   - Pay-per-request billing mode
   - Point-in-time recovery enabled

2. **Lambda Function** (`lambda-dynamo-function`)
   - Node.js 20.x runtime
   - RESTful API with CRUD operations
   - Automatic DynamoDB integration via environment variables

3. **IAM Infrastructure**
   - Custom IAM policy with DynamoDB permissions
   - Lambda execution role with policy attachment
   - CloudWatch Logs access

### Data Flow

```
API Gateway/Client → Lambda Function → DynamoDB Table
                                  ↓
                            CloudWatch Logs
```

## 🚀 Quick Start

### Deploy with Monk

1. **Deploy the complete stack:**
   ```bash
   monk run lambda-dynamo-example/example-stack
   ```

2. **Check deployment status:**
   ```bash
   monk describe lambda-dynamo-example/lambda-dynamo-function
   ```

3. **Test the Lambda function:**
   ```bash
   
   # Invoke the function directly
   monk do lambda-dynamo-example/lambda-dynamo-function/invoke 
   ```

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Test locally** (requires AWS credentials):
   ```bash
   node src/index.js
   ```

## 📡 API Endpoints

The Lambda function provides the following RESTful endpoints:

### Health Check
- **GET** `/health`
  - Returns service health and table connectivity status

### CRUD Operations

#### Create User
- **POST** `/users`
- **Body:**
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "age": 30,
    "department": "Engineering"
  }
  ```

#### Get User
- **GET** `/users/{id}`
- Returns user details by ID

#### Update User
- **PUT** `/users/{id}`
- **Body:**
  ```json
  {
    "name": "Jane Doe",
    "age": 31,
    "department": "Marketing"
  }
  ```

#### Delete User
- **DELETE** `/users/{id}`
- Removes user by ID

#### List Users
- **GET** `/users?limit=10&department=Engineering`
- Query parameters:
  - `limit`: Number of users to return (default: 10)
  - `department`: Filter by department

### Demo Endpoint
- **GET** `/` (root)
  - Demonstrates all CRUD operations in sequence
  - Creates, reads, updates, lists, and deletes a test user

## 🧪 Testing

### Using AWS CLI (after deployment)

```bash
# Get the Lambda function ARN
FUNCTION_ARN=$(monk do lambda-dynamo-example/lambda-dynamo-function get-function-info | grep FunctionArn)

# Test health check
aws lambda invoke \
  --function-name lambda-dynamo-function \
  --payload '{"httpMethod":"GET","path":"/health"}' \
  response.json && cat response.json

# Test full demo
aws lambda invoke \
  --function-name lambda-dynamo-function \
  --payload '{"httpMethod":"GET","path":"/"}' \
  demo-response.json && cat demo-response.json

# Create a user
aws lambda invoke \
  --function-name lambda-dynamo-function \
  --payload '{
    "httpMethod":"POST",
    "path":"/users",
    "body":"{\"name\":\"Test User\",\"email\":\"test@example.com\",\"age\":25}"
  }' \
  create-response.json && cat create-response.json
```

### Using curl (with API Gateway)

```bash
# Health check
curl -X GET https://your-api-gateway-url/health

# Create user
curl -X POST https://your-api-gateway-url/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Smith","email":"alice@example.com","age":28,"department":"Marketing"}'

# Get user
curl -X GET https://your-api-gateway-url/users/user-123

# List users
curl -X GET "https://your-api-gateway-url/users?limit=5&department=Engineering"

# Update user
curl -X PUT https://your-api-gateway-url/users/user-123 \
  -H "Content-Type: application/json" \
  -d '{"age":29,"department":"DevOps"}'

# Delete user
curl -X DELETE https://your-api-gateway-url/users/user-123
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DYNAMODB_TABLE_NAME` | DynamoDB table name | Set by Monk entity |
| `AWS_REGION` | AWS region | `us-east-1` |
| `NODE_ENV` | Node.js environment | `production` |
| `LOG_LEVEL` | Logging level | `info` |

### DynamoDB Table Schema

```json
{
  "id": "string (primary key)",
  "name": "string",
  "email": "string", 
  "age": "number",
  "department": "string",
  "createdAt": "string (ISO date)",
  "updatedAt": "string (ISO date)"
}
```

## 📊 Monitoring

### CloudWatch Logs
- Function logs: `/aws/lambda/lambda-dynamo-function`
- Monitor API requests, errors, and performance metrics

### DynamoDB Metrics
- Table capacity utilization
- Read/write request metrics
- Error rates and throttling

### Lambda Metrics
- Invocation count and duration
- Error rates and dead letter queues
- Memory utilization

## 🔐 Security

### IAM Permissions
The Lambda function has minimal required permissions:
- DynamoDB: `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Scan`, `Query`
- CloudWatch: `CreateLogGroup`, `CreateLogStream`, `PutLogEvents`

### Data Protection
- All data is encrypted at rest in DynamoDB
- In-transit encryption via HTTPS
- No sensitive data logged in CloudWatch

## 🚨 Error Handling

The function implements comprehensive error handling:

- **400 Bad Request**: Invalid input data
- **404 Not Found**: User or endpoint not found
- **409 Conflict**: User already exists
- **500 Internal Server Error**: DynamoDB or system errors
- **503 Service Unavailable**: Health check failures

## 📈 Performance

### Optimization Features
- Pay-per-request billing for variable workloads
- Connection pooling for DynamoDB client
- Efficient query patterns and projections
- Conditional writes to prevent conflicts

### Scaling
- Lambda automatically scales based on demand
- DynamoDB auto-scales read/write capacity
- No infrastructure management required

## 🛠️ Development

### Project Structure
```
lambda-dynamo-db-example/
├── src/
│   └── index.js              # Main Lambda function
├── lambda-dynamo-db-example.yaml  # Monk configuration
├── package.json              # Node.js dependencies
├── env.example              # Environment variables template
└── README.md               # This file
```

### Adding New Features
1. Extend the Lambda function in `src/index.js`
2. Update IAM permissions if needed in the YAML config
3. Test locally before deployment
4. Update this README with new endpoints

## 🐛 Troubleshooting

### Common Issues

1. **Function timeout**: Increase timeout in YAML config
2. **Permission denied**: Verify IAM policy and role attachment
3. **Table not found**: Ensure DynamoDB table is created first
4. **Memory issues**: Increase memory allocation

### Debug Commands
```bash
# Check function logs
monk logs lambda-dynamo-example/lambda-dynamo-function

# Verify table status
monk do lambda-dynamo-example/users-table/get-table-info

# Test IAM permissions
monk do lambda-dynamo-example/lambda-execution-role/get-role-info
```

## 📚 Related Examples

- [DynamoDB Client Example](../dynamo-db-client/) - Standalone DynamoDB operations
- [SQS Worker Example](../sqs-worker/) - Event-driven processing
- [RDS Client Example](../rds-client/) - Relational database operations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Test your changes thoroughly
4. Update documentation
5. Submit a pull request

---

This example demonstrates the power of combining AWS Lambda and DynamoDB for serverless applications with the Monk orchestrator framework, providing automatic infrastructure provisioning, security configuration, and operational best practices. 