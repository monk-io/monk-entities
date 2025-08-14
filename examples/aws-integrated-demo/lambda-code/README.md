# AWS Integrated Demo - Lambda Function

This Lambda function demonstrates the integration of AWS Lambda with both PostgreSQL RDS and DynamoDB, providing a comprehensive todo management API.

## Architecture

The Lambda function orchestrates data between two databases:
- **PostgreSQL RDS**: Stores user profiles and authentication data
- **DynamoDB**: Stores todo items with high performance and flexible schema

## Function Structure

```
src/
├── index.js                 # Main Lambda handler
├── database/
│   ├── rds.js              # PostgreSQL RDS operations
│   └── dynamodb.js         # DynamoDB operations
└── utils/
    ├── response.js         # HTTP response utilities
    └── validation.js       # Input validation
```

## API Endpoints

### Health Check
- `GET /health` - Check health of both databases

### User Management (RDS)
- `POST /users` - Create a new user
- `GET /users` - List all users (with pagination)
- `GET /users/{id}` - Get specific user by ID

### Todo Management (DynamoDB)
- `POST /users/{id}/todos` - Create todo for specific user
- `GET /users/{id}/todos` - Get all todos for specific user
- `GET /todos/{id}` - Get specific todo by ID
- `PUT /todos/{id}` - Update specific todo
- `DELETE /todos/{id}` - Delete specific todo

### Integrated Endpoints
- `GET /dashboard/{id}` - Get user dashboard (combines RDS + DynamoDB data)
- `GET /demo` - Run comprehensive demo of all functionality

## Environment Variables

The function requires these environment variables:

### RDS Configuration
```bash
RDS_HOST=your-rds-endpoint
RDS_PORT=5432
RDS_DATABASE=your-database-name
RDS_USERNAME=your-username
RDS_PASSWORD_SECRET=your-secret-name
```

### DynamoDB Configuration
```bash
DYNAMODB_TABLE_NAME=your-table-name
DYNAMODB_USER_INDEX=UserTodosIndex
```

### General Configuration
```bash
AWS_REGION=us-east-1
NODE_ENV=production
LOG_LEVEL=info
```

## Data Models

### User (RDS - PostgreSQL)
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    department VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Todo (DynamoDB)
```json
{
    "id": "uuid",
    "user_id": "uuid",
    "title": "string",
    "description": "string",
    "status": "pending|in_progress|completed|cancelled",
    "priority": "low|medium|high|urgent",
    "due_date": "ISO8601 date string",
    "created_at": "ISO8601 date string",
    "updated_at": "ISO8601 date string"
}
```

## Key Features

### Cross-Database Operations
- Create user in RDS, then create todos in DynamoDB
- Dashboard endpoint combines data from both databases
- Proper error handling for cross-database consistency

### Connection Management
- PostgreSQL connection pooling for efficient RDS usage
- DynamoDB Document Client for simplified operations
- Proper connection cleanup and error handling

### Security
- Input validation and sanitization
- SQL injection prevention through parameterized queries
- Proper error message handling (no sensitive data exposure)

### Performance
- Parallel database operations where possible
- Connection pooling to minimize cold start impact
- Efficient DynamoDB queries using GSI

### Monitoring
- Structured JSON logging
- Request/response tracking
- Database operation metrics
- Error tracking and alerting

## Usage Examples

### Create User and Todo
```bash
# Create user
curl -X POST https://your-api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "department": "Engineering"
  }'

# Create todo for user
curl -X POST https://your-api/users/{user-id}/todos \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete AWS integration",
    "description": "Integrate Lambda with RDS and DynamoDB",
    "status": "pending",
    "priority": "high",
    "due_date": "2024-12-31T23:59:59.000Z"
  }'
```

### Get Dashboard
```bash
curl https://your-api/dashboard/{user-id}
```

Returns:
```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "department": "Engineering"
  },
  "todoStats": {
    "total": 5,
    "pending": 2,
    "in_progress": 1,
    "completed": 2,
    "overdue": 0
  },
  "recentTodos": [...]
}
```

## Error Handling

The function provides comprehensive error handling:

### Validation Errors (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "validationErrors": ["Email is required"],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Not Found Errors (404)
```json
{
  "success": false,
  "error": "User not found",
  "resourceId": "user-uuid",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Server Errors (500)
```json
{
  "success": false,
  "error": "Internal server error",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Dependencies

```json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.450.0",
    "@aws-sdk/lib-dynamodb": "^3.450.0",
    "@aws-sdk/client-secrets-manager": "^3.450.0",
    "pg": "^8.11.3",
    "uuid": "^9.0.1"
  }
}
```

## Testing

### Local Testing
```bash
npm install
node src/index.js
```

### Integration Testing
The `/demo` endpoint provides a comprehensive test of all functionality:
1. Creates a demo user in RDS
2. Creates demo todos in DynamoDB
3. Demonstrates cross-database queries
4. Shows update and delete operations

### Health Checks
Use the `/health` endpoint to verify both database connections:
```bash
curl https://your-api/health
```

## Performance Considerations

### Cold Starts
- Connection pools are initialized lazily
- Secrets are cached to reduce API calls
- Database connections are reused across invocations

### Database Optimization
- RDS: Connection pooling, prepared statements, proper indexing
- DynamoDB: GSI for user queries, efficient key design, batch operations

### Memory Usage
- Function configured with 512MB for database connections
- Connection pools sized appropriately for Lambda limits

## Security Best Practices

1. **Database Access**: Use IAM roles instead of hardcoded credentials
2. **Input Validation**: All inputs are validated and sanitized
3. **Error Messages**: Don't expose internal details in production
4. **Connection Security**: Use SSL/TLS for database connections
5. **Secrets Management**: RDS password stored in AWS Secrets Manager

## Monitoring and Logging

### CloudWatch Metrics
- Function duration and memory usage
- Database connection counts
- Error rates and types

### Structured Logging
All logs are in JSON format with:
- Timestamp and request ID
- Function name and version
- Operation details and outcomes
- Error details and stack traces

### Alerting
Set up CloudWatch alarms for:
- Function errors and timeouts
- Database connection failures
- High response times
