# AWS Integrated Demo: Lambda + DynamoDB + RDS

This project demonstrates how AWS Lambda, DynamoDB, and RDS work together in a comprehensive todo management system. The architecture showcases real-world patterns for building scalable serverless applications with multiple database types.

## Architecture Overview

The demo implements a todo management system with the following components:

- **AWS RDS (PostgreSQL)**: Stores user profiles and authentication data
- **AWS DynamoDB**: Stores todo items with fast read/write performance
- **AWS Lambda**: Serverless API that orchestrates data between both databases
- **Demo Client**: Interactive client that demonstrates the integrated functionality

## System Design

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Demo Client   │───▶│  Lambda API     │───▶│  RDS (Users)    │
│   (Container)   │    │  (Handler)      │    │  PostgreSQL     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ DynamoDB (Todos)│
                       │   NoSQL Store   │
                       └─────────────────┘
```

### Data Model

**RDS (PostgreSQL) - User Profiles:**
- User authentication and profile information
- Structured data with ACID compliance
- User ID serves as foreign key for todos

**DynamoDB - Todo Items:**
- High-performance todo item storage
- Schema-less design for flexible todo attributes
- Indexed by user_id for efficient user-specific queries

## Features Demonstrated

1. **Cross-Database Operations**: Lambda functions that read/write to both RDS and DynamoDB
2. **Data Consistency**: Proper handling of transactions across different database types
3. **Error Handling**: Robust error handling and rollback strategies
4. **Security**: IAM roles and policies for secure database access
5. **Performance**: Optimized queries and connection pooling
6. **Monitoring**: CloudWatch integration for observability

## API Endpoints

The Lambda function exposes the following endpoints:

- `GET /health` - Health check for both databases
- `POST /users` - Create a new user (RDS)
- `GET /users/{id}` - Get user profile (RDS)
- `POST /users/{id}/todos` - Create todo for user (DynamoDB)
- `GET /users/{id}/todos` - Get all todos for user (DynamoDB)
- `PUT /todos/{id}` - Update specific todo (DynamoDB)
- `DELETE /todos/{id}` - Delete specific todo (DynamoDB)
- `GET /dashboard/{id}` - Get user dashboard (RDS + DynamoDB)

## Project Structure

```
aws-integrated-demo/
├── README.md                    # This file
├── MANIFEST                     # Monk manifest
├── aws-integrated-demo.yaml     # Main stack definition
├── lambda-code/                 # Lambda function source
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Main Lambda handler
│   │   ├── database/
│   │   │   ├── rds.js          # RDS connection and queries
│   │   │   └── dynamodb.js     # DynamoDB operations
│   │   └── utils/
│   │       ├── response.js     # HTTP response utilities
│   │       └── validation.js   # Input validation
│   └── README.md
└── demo-client/                 # Demo client application
    ├── package.json
    ├── src/
    │   └── client.ts           # Interactive demo client
    └── README.md
```

## Quick Start

1. **Deploy the infrastructure:**
   ```bash
   sudo /home/ivan/Work/monk/dist/monk load aws-integrated-demo/aws-integrated-demo.yaml
   sudo /home/ivan/Work/monk/dist/monk run aws-integrated-demo/demo-stack
   ```

2. **Monitor the deployment:**
   ```bash
   sudo /home/ivan/Work/monk/dist/monk logs aws-integrated-demo/demo-client
   ```

3. **Test the API:**
   The demo client will automatically interact with the Lambda API to demonstrate all features.

## Environment Variables

The Lambda function uses these environment variables:

- `RDS_HOST`: RDS endpoint address
- `RDS_PORT`: RDS port (5432 for PostgreSQL)
- `RDS_DATABASE`: Database name
- `RDS_USERNAME`: Database username
- `RDS_PASSWORD`: Database password
- `DYNAMODB_TABLE_NAME`: DynamoDB table name
- `AWS_REGION`: AWS region

## Testing Strategy

1. **Unit Tests**: Individual function testing for database operations
2. **Integration Tests**: End-to-end API testing
3. **Load Tests**: Performance testing with concurrent users
4. **Error Tests**: Network failures and database unavailability scenarios

## Best Practices Demonstrated

1. **Connection Pooling**: Efficient RDS connection management
2. **Error Handling**: Graceful degradation and proper error responses
3. **Security**: Least privilege IAM policies
4. **Monitoring**: CloudWatch metrics and logging
5. **Code Organization**: Clean separation of concerns
6. **Configuration**: Environment-based configuration management

## Scaling Considerations

- **Lambda Concurrency**: Auto-scaling based on demand
- **RDS Scaling**: Read replicas for read-heavy workloads
- **DynamoDB Scaling**: On-demand billing for variable workloads
- **Connection Limits**: Proper connection pooling to prevent exhaustion

## Cost Optimization

- **Pay-per-request**: DynamoDB and Lambda only charge for actual usage
- **RDS Instance Sizing**: Right-sized instance for workload
- **Data Lifecycle**: Archive old todos to reduce storage costs

## Security Features

- **IAM Roles**: Service-specific permissions
- **VPC Security Groups**: Network-level security
- **Encryption**: At-rest and in-transit encryption
- **Secret Management**: Secure credential storage
