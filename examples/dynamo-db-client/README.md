# DynamoDB Client

A comprehensive TypeScript-based client that demonstrates CRUD operations with AWS DynamoDB, designed to work with the Monk DynamoDB entity.

## Features

- 🔄 Continuous demonstration of DynamoDB operations
- 📝 Comprehensive CRUD operations (Create, Read, Update, Delete)
- 🎲 Random data generation for realistic testing
- 📊 Operation metrics and capacity consumption logging
- 🐳 Docker support with multi-stage builds
- 🛡️ Graceful shutdown handling
- 🔧 Environment variable configuration
- ❌ Robust error handling and resilience
- 🏗️ Integration with Monk DynamoDB entity

## Quick Start

### Prerequisites

- Node.js 18+ 
- AWS credentials configured (IAM role, environment variables, or AWS CLI)
- Access to a DynamoDB table (or use the provided Monk configuration)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your DynamoDB table name and settings
   ```

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Build and run:**
   ```bash
   npm run build
   npm start
   ```

### Docker Usage

1. **Build the Docker image:**
   ```bash
   docker build -t dynamodb-client:latest .
   ```

2. **Run with Docker Compose:**
   ```bash
   # Set environment variables in .env file
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f dynamodb-client
   ```

### Monk Orchestrator Usage

The preferred way to run this example is using the Monk orchestrator with the integrated DynamoDB entity:

1. **Load the DynamoDB entity:**
   ```bash
   monk load ./dist/aws-dynamo-db/MANIFEST
   ```

2. **Load the example configuration:**
   ```bash
   monk load examples/dynamo-db-client/dynamo-db-client.yaml
   ```

3. **Run the complete stack:**
   ```bash
   # This creates the DynamoDB table and starts the client
   monk run dynamodb-example/example-stack
   ```

4. **Monitor the operations:**
   ```bash
   monk logs -f dynamodb-example/dynamo-db-client
   ```

5. **Clean up:**
   ```bash
   monk purge dynamodb-example/example-stack
   ```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DYNAMODB_TABLE_NAME` | Yes | - | Name of the DynamoDB table to interact with |
| `AWS_REGION` | No | `us-east-1` | AWS region for DynamoDB operations |
| `OPERATION_INTERVAL_MS` | No | `3000` | Interval between operations in milliseconds |
| `MAX_OPERATIONS` | No | - | Maximum number of operations before stopping (infinite if not set) |
| `AWS_ACCESS_KEY_ID` | No | - | AWS access key (use IAM roles in production) |
| `AWS_SECRET_ACCESS_KEY` | No | - | AWS secret key (use IAM roles in production) |

### Example .env file

```bash
# DynamoDB Configuration
DYNAMODB_TABLE_NAME=users-table
AWS_REGION=us-east-1

# Client Configuration
OPERATION_INTERVAL_MS=3000
MAX_OPERATIONS=100

# AWS Credentials (if not using IAM roles)
# AWS_ACCESS_KEY_ID=your_access_key
# AWS_SECRET_ACCESS_KEY=your_secret_key
```

## Operations Demonstrated

### 1. PUT ITEM
Creates new user records with random data:
- **Operation**: `PutItem` with condition to prevent overwrites
- **Data**: Generates users with id, name, email, age, department, timestamps
- **Features**: Conditional writes, capacity consumption tracking

### 2. GET ITEM
Retrieves existing user records:
- **Operation**: `GetItem` with projection expressions
- **Features**: Attribute selection, handling of reserved words (`name`)
- **Metrics**: Consumed capacity units tracking

### 3. UPDATE ITEM
Modifies existing user records:
- **Operation**: `UpdateItem` with expressions
- **Features**: Atomic updates, return values, timestamp updates
- **Use Case**: Age increment, department changes

### 4. QUERY/SCAN
Searches for users by criteria:
- **Operation**: `Scan` with filter expressions (Query demo for GSI scenarios)
- **Features**: Filtered scans, pagination support, count operations
- **Use Case**: Find users by department

### 5. DELETE ITEM
Removes user records:
- **Operation**: `DeleteItem` with return values
- **Features**: Conditional deletes, returning deleted attributes
- **Safety**: Confirms deletion success

### 6. BATCH OPERATIONS
Demonstrates bulk operations:
- **Operation**: Multiple `PutItem` calls (shows pattern for `BatchWriteItem`)
- **Features**: Concurrent operations, batch processing patterns
- **Use Case**: Bulk data loading

## Data Model

The client works with a `User` data model:

```typescript
interface User {
  id: string;           // Primary key (hash key)
  name: string;         // Full name
  email: string;        // Email address
  age: number;          // Age in years
  department?: string;  // Department (optional)
  createdAt: string;    // ISO timestamp
  updatedAt: string;    // ISO timestamp
}
```

### Table Schema

When using the Monk DynamoDB entity, the table is created with:
- **Hash Key**: `id` (String)
- **Billing Mode**: Pay-per-request
- **Point-in-time Recovery**: Enabled
- **Tags**: Environment, application, and ownership tags

## AWS Permissions

The application requires the following IAM permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/users-table",
        "arn:aws:dynamodb:*:*:table/users-table/index/*"
      ]
    }
  ]
}
```

## Example Output

```
🚀 DynamoDB Client started
📍 Table Name: users-table
🌍 Region: us-east-1
⏱️  Operation interval: 3000ms
🔄 Max operations: 100
----------------------------------------

📝 PUT ITEM Operation:
   Creating user: Alice Smith (abc12345@example.com)
   ✅ Item created successfully
   📊 Consumed Capacity: 1
----------------------------------------

📖 GET ITEM Operation:
   Retrieving user: user-1640995200000-abc123
   ✅ Item retrieved successfully:
      Name: Alice Smith
      Email: abc12345@example.com
      Age: 28
      Department: Engineering
      Created: 2023-12-31T15:30:00.000Z
   📊 Consumed Capacity: 0.5
----------------------------------------

📝 UPDATE ITEM Operation:
   Updating user: user-1640995200000-abc123
   ✅ Item updated successfully:
      New Age: 29
      New Department: Marketing
      Updated At: 2023-12-31T15:33:00.000Z
   📊 Consumed Capacity: 1
----------------------------------------
```

## Advanced Usage

### Production Deployment

1. **Use IAM Roles**: Configure IAM roles instead of access keys
2. **Resource Limits**: Set appropriate memory and CPU limits
3. **Health Checks**: Implement application-level health checks
4. **Monitoring**: Add CloudWatch metrics and alarms
5. **Error Handling**: Implement retry logic and dead letter queues

### Customization

The client can be easily customized for your specific use case:

1. **Data Model**: Modify the `User` interface and generation methods
2. **Operations**: Add/remove operations in the `demonstrateOperations` method
3. **Timing**: Adjust operation intervals and patterns
4. **Metrics**: Add custom metrics and logging

### Integration Testing

Use this client to:
- **Load Test**: Generate sustained load against DynamoDB tables
- **Feature Testing**: Verify table configurations and performance
- **Cost Analysis**: Monitor consumed capacity and costs
- **Operational Validation**: Ensure proper table setup and access

## Troubleshooting

### Common Issues

**Access Denied Errors**
- Verify IAM permissions include all required DynamoDB actions
- Check table ARN matches your specific table and region
- Ensure AWS credentials are properly configured

**Table Not Found**
- Verify the table name matches exactly (case-sensitive)
- Ensure the table exists in the specified region
- Check the table is in ACTIVE status

**Throttling Errors**
- Reduce operation frequency by increasing `OPERATION_INTERVAL_MS`
- Consider using provisioned capacity for predictable workloads
- Implement exponential backoff for retries

**Connection Timeouts**
- Check network connectivity to AWS
- Verify region configuration
- Ensure security groups allow outbound HTTPS traffic

### Monitoring

**Application Logs**
- All operations log their results and capacity consumption
- Errors include full AWS error details for debugging
- Use structured logging for production monitoring

**AWS CloudWatch**
- Monitor table metrics: consumed capacity, throttling, errors
- Set up alarms for unusual patterns
- Track application metrics for operational insights

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│                 │    │                  │    │                 │
│  Monk DynamoDB  │────│  DynamoDB Client │────│  AWS DynamoDB   │
│     Entity      │    │   Application    │    │     Service     │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        │                        │                        │
    Creates &              Performs CRUD              Stores &
    Manages               Operations                 Serves Data
    Table                                              
```

### Component Responsibilities

- **Monk Entity**: Infrastructure management, table lifecycle
- **Client Application**: Business logic, data operations, demonstrations
- **DynamoDB Service**: Data persistence, scaling, performance

## Best Practices Demonstrated

1. **Connection Management**: Proper AWS SDK client initialization
2. **Error Handling**: Comprehensive error catching and logging
3. **Resource Cleanup**: Graceful shutdown handling
4. **Security**: IAM roles preferred over access keys
5. **Monitoring**: Capacity consumption and operation tracking
6. **Performance**: Efficient data access patterns
7. **Scalability**: Pay-per-request billing for variable workloads

## Contributing

When extending this example:

1. **Follow TypeScript best practices**
2. **Add comprehensive error handling**
3. **Include operation logging and metrics**
4. **Test with various data scenarios**
5. **Update documentation for new features**
6. **Maintain Docker and Monk configurations**

## Version History

- **v1.0.0**: Initial release with comprehensive CRUD demonstrations
- Full integration with Monk DynamoDB entity
- Docker and Monk orchestrator support
- Production-ready configuration and security practices 