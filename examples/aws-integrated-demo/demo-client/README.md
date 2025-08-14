# AWS Integrated Demo Client

This TypeScript client demonstrates the integrated AWS Lambda + DynamoDB + RDS functionality by automatically testing all API endpoints and showcasing real-world usage patterns.

## Features

The demo client performs the following operations:

### 🏥 Health Checks
- Tests Lambda function availability
- Verifies RDS PostgreSQL connectivity
- Validates DynamoDB table access
- Reports overall system health

### 👥 User Management (RDS)
- Creates multiple demo users with different departments
- Lists users with pagination
- Retrieves individual user profiles
- Demonstrates PostgreSQL operations

### 📝 Todo Management (DynamoDB)
- Creates todos for each user with various priorities and statuses
- Retrieves user-specific todo lists
- Updates todo items (status, priority)
- Demonstrates DynamoDB GSI queries

### 📊 Integrated Dashboard
- Combines user data from RDS with todo statistics from DynamoDB
- Shows comprehensive user activity overview
- Demonstrates cross-database data aggregation

### 🔄 Continuous Monitoring
- Performs periodic health checks
- Shows live database statistics
- Simulates random user activity
- Monitors system performance

## Configuration

The client is configured via environment variables:

### Required Variables
```bash
# Lambda Configuration
LAMBDA_FUNCTION_NAME=integrated-api-function
LAMBDA_FUNCTION_ARN=arn:aws:lambda:region:account:function:function-name

# RDS Configuration
RDS_ENDPOINT=your-rds-endpoint.region.rds.amazonaws.com
RDS_PORT=5432
RDS_DATABASE=todousers
RDS_USERNAME=todouser
RDS_PASSWORD=your-password

# DynamoDB Configuration
DYNAMODB_TABLE_NAME=demo-todos-table
DYNAMODB_TABLE_ARN=arn:aws:dynamodb:region:account:table/table-name

# AWS Configuration
AWS_REGION=us-east-1
```

### Optional Variables
```bash
# Demo Configuration
DEMO_USERS_COUNT=5              # Number of users to create
DEMO_TODOS_PER_USER=3           # Todos per user
OPERATION_INTERVAL_MS=5000      # Monitoring interval

# Logging
NODE_ENV=production
LOG_LEVEL=info
```

## Usage

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm install
npm run build
npm start
```

## Demo Flow

### 1. Initialization
```
🚀 AWS Integrated Demo Client Starting...
📊 Configuration validation
🔌 Database connectivity tests
```

### 2. Health Checks
```
🏥 Health Check
   ✅ Lambda function responsive
   ✅ RDS connection established
   ✅ DynamoDB table accessible
```

### 3. User Creation
```
👥 User Management Demo
   ✅ Created user: Demo User 1 (demo.user.1@example.com)
   ✅ Created user: Demo User 2 (demo.user.2@example.com)
   ✅ Retrieved 5 users
```

### 4. Todo Management
```
📝 Todo Management Demo
   ✅ Created todo: Complete AWS integration - Demo User 1
   ✅ Created todo: Write documentation - Demo User 1
   ✅ Updated todo status to: completed
```

### 5. Dashboard Integration
```
📊 Dashboard Integration Demo
   ✅ Dashboard for Demo User 1:
      Department: Engineering
      Total todos: 3
      Pending: 2, Completed: 1, Overdue: 0
```

### 6. Continuous Monitoring
```
🔄 Starting Continuous Monitoring
   📊 Monitoring Cycle 1
      👥 Total users (RDS): 5
      📝 Total todos (DynamoDB): 15
      🎲 Random operations performed
```

## API Endpoints Tested

The client tests all available Lambda endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | System health check |
| POST | `/users` | Create new user |
| GET | `/users` | List users with pagination |
| GET | `/users/{id}` | Get specific user |
| POST | `/users/{id}/todos` | Create todo for user |
| GET | `/users/{id}/todos` | Get user's todos |
| GET | `/todos/{id}` | Get specific todo |
| PUT | `/todos/{id}` | Update todo |
| DELETE | `/todos/{id}` | Delete todo |
| GET | `/dashboard/{id}` | User dashboard |
| GET | `/demo` | Comprehensive demo |

## Output Example

```
🚀 AWS Integrated Demo Client Starting...
================================================
📊 Configuration:
   Lambda Function: integrated-api-function
   RDS Endpoint: demo-users-db.xyz.us-east-1.rds.amazonaws.com:5432
   RDS Database: todousers
   DynamoDB Table: demo-todos-table
   AWS Region: us-east-1
   Demo Users: 5
   Todos per User: 3
================================================

🎯 Running Comprehensive Demo
================================================

🏥 Health Check
----------------
✅ Health check passed
   Status: healthy
   RDS: fulfilled
   DynamoDB: fulfilled

🔌 Database Connectivity Tests
-------------------------------
Testing RDS connection...
✅ RDS connection successful
   Current time: 2024-01-01T12:00:00.000Z
   Version: PostgreSQL 15.4

Testing DynamoDB connection...
✅ DynamoDB connection successful
   Table: demo-todos-table
   Item count: 0

👥 User Management Demo
------------------------
Creating 5 demo users...
✅ Created user: Demo User 1 (demo.user.1@example.com)
✅ Created user: Demo User 2 (demo.user.2@example.com)
✅ Created user: Demo User 3 (demo.user.3@example.com)
✅ Created user: Demo User 4 (demo.user.4@example.com)
✅ Created user: Demo User 5 (demo.user.5@example.com)

Listing all users...
✅ Retrieved 5 users
   1. Demo User 1 (Engineering)
   2. Demo User 2 (Marketing)
   3. Demo User 3 (Sales)

Getting specific user: a1b2c3d4-e5f6-7890-abcd-ef1234567890
✅ Retrieved user: Demo User 1

📝 Todo Management Demo
------------------------
Creating todos for users...
✅ Created todo: Complete AWS integration - Demo User 1
✅ Created todo: Write documentation - Demo User 1
✅ Created todo: Review code changes - Demo User 1
[... continues for all users ...]

Getting todos for user: Demo User 1
✅ Retrieved 3 todos
   1. Complete AWS integration - Demo User 1 (in_progress)
   2. Write documentation - Demo User 1 (pending)
   3. Review code changes - Demo User 1 (pending)

Updating todo: Complete AWS integration - Demo User 1
✅ Updated todo status to: completed

📊 Dashboard Integration Demo
------------------------------
Getting dashboard for: Demo User 1
✅ Dashboard for Demo User 1:
   Department: Engineering
   Total todos: 3
   Pending: 2
   In Progress: 0
   Completed: 1
   Overdue: 0
   Recent todos:
     1. Complete AWS integration - Demo User 1 (completed)
     2. Write documentation - Demo User 1 (pending)

Getting dashboard for: Demo User 2
✅ Dashboard for Demo User 2:
   Department: Marketing
   Total todos: 3
   Pending: 3
   In Progress: 0
   Completed: 0
   Overdue: 0

📈 Performance & Analytics Demo
--------------------------------
Running Lambda demo endpoint...
✅ Lambda demo completed successfully
   Operations performed: 5
   1. CREATE_USER: ✅
   2. CREATE_TODOS: ✅
   3. GET_DASHBOARD: ✅
   4. UPDATE_TODO: ✅

Demo Statistics:
   Users created: 5
   Todos created: 15
   Total Lambda invocations: ~35

✅ Comprehensive Demo Completed Successfully!

🔄 Starting Continuous Monitoring
-----------------------------------

📊 Monitoring Cycle 1
🏥 Health Check
----------------
✅ Health check passed
   Status: healthy
   RDS: fulfilled
   DynamoDB: fulfilled
   👥 Total users (RDS): 5
   📝 Total todos (DynamoDB): 15

📊 Monitoring Cycle 2
🏥 Health Check
----------------
✅ Health check passed
   Status: healthy
   RDS: fulfilled
   DynamoDB: fulfilled
   👥 Total users (RDS): 5
   📝 Total todos (DynamoDB): 15
   🎲 Performing random operations...
   📊 Dashboard check for Demo User 3: 3 todos
   📝 Todo check: Review code changes - Demo User 2 (pending)
```

## Error Handling

The client includes comprehensive error handling:

- **Connection Failures**: Graceful degradation and retry logic
- **API Errors**: Detailed error reporting with status codes
- **Data Validation**: Input validation before API calls
- **Timeout Handling**: Configurable timeouts for operations
- **Graceful Shutdown**: Clean resource cleanup on termination

## Dependencies

```json
{
  "dependencies": {
    "@aws-sdk/client-lambda": "^3.450.0",
    "@aws-sdk/client-dynamodb": "^3.450.0",
    "@aws-sdk/lib-dynamodb": "^3.450.0",
    "pg": "^8.11.3",
    "uuid": "^9.0.1",
    "chalk": "^4.1.2",
    "dotenv": "^16.3.1"
  }
}
```

## Monitoring and Observability

The client provides extensive logging and monitoring:

- **Structured Logging**: JSON-formatted logs for analysis
- **Performance Metrics**: Response times and operation counts
- **Health Monitoring**: Continuous system health checks
- **Activity Simulation**: Realistic user behavior patterns
- **Error Tracking**: Detailed error reporting and recovery

## Production Considerations

- **Credentials**: Uses IAM roles and AWS credentials chain
- **Connection Pooling**: Efficient database connection management
- **Rate Limiting**: Respects API rate limits and quotas
- **Resource Cleanup**: Proper resource disposal and cleanup
- **Signal Handling**: Graceful shutdown on SIGINT/SIGTERM
