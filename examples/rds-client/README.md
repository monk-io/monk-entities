# RDS Client

A comprehensive TypeScript-based client that demonstrates how to connect to and interact with AWS RDS instances (MySQL and PostgreSQL) created by the Monk `aws-rds` entity.

## Features

- 🗄️ **Multi-Engine Support**: Works with both MySQL and PostgreSQL RDS instances
- 🔄 **Complete CRUD Operations**: Create, Read, Update, Delete database records
- 📊 **Connection Pooling**: Efficient database connection management
- 📋 **Table Management**: Automatic table creation and schema inspection
- 🔧 **Environment Configuration**: Flexible configuration via environment variables
- 🐳 **Docker Support**: Containerized deployment with multi-engine support
- 🛡️ **Graceful Shutdown**: Proper connection cleanup and error handling
- 📝 **Comprehensive Logging**: Detailed operation logging and error reporting
- 🎯 **Monk Integration**: Seamless integration with Monk aws-rds entities

## Quick Start

### Prerequisites

- Node.js 18+
- Access to an AWS RDS instance (MySQL or PostgreSQL)
- Database credentials and connection information

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your RDS connection details
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
   docker build -t rds-client .
   ```

2. **Run MySQL client:**
   ```bash
   docker run --rm -v $(pwd):/app \
     -e DB_ENGINE=mysql \
     -e DB_HOST=your-mysql-rds.amazonaws.com \
     -e DB_PORT=3306 \
     -e DB_NAME=mydatabase \
     -e DB_USER=admin \
     -e DB_PASSWORD=yourpassword \
     rds-client
   ```

3. **Run PostgreSQL client:**
   ```bash
   docker run --rm -v $(pwd):/app \
     -e DB_ENGINE=postgresql \
     -e DB_HOST=your-postgres-rds.amazonaws.com \
     -e DB_PORT=5432 \
     -e DB_NAME=mydatabase \
     -e DB_USER=postgres \
     -e DB_PASSWORD=yourpassword \
     rds-client
   ```

### Docker Compose

Run both MySQL and PostgreSQL clients:

```bash
# For MySQL
docker-compose --profile mysql up

# For PostgreSQL
docker-compose --profile postgresql up

# For both
docker-compose --profile mysql --profile postgresql up
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_ENGINE` | Database engine (`mysql` or `postgresql`) | `mysql` | Yes |
| `DB_HOST` | RDS instance endpoint | - | Yes |
| `DB_PORT` | Database port | `3306` (MySQL), `5432` (PostgreSQL) | No |
| `DB_NAME` | Database name | - | Yes |
| `DB_USER` | Database username | - | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `DB_CONNECTION_LIMIT` | Max connections in pool | `10` | No |
| `DB_TIMEOUT` | Connection timeout (ms) | `10000` | No |
| `OPERATION_INTERVAL_MS` | Interval between operations (ms) | `5000` | No |
| `SAMPLE_TABLE_NAME` | Name of demo table | `users` | No |
| `SAMPLE_RECORDS_COUNT` | Number of demo records | `10` | No |

### Example .env file

```bash
# MySQL Configuration
DB_ENGINE=mysql
DB_HOST=my-mysql-rds.c1234567890.us-east-1.rds.amazonaws.com
DB_PORT=3306
DB_NAME=mydatabase
DB_USER=admin
DB_PASSWORD=MySecurePassword123!

# PostgreSQL Configuration
# DB_ENGINE=postgresql
# DB_HOST=my-postgres-rds.c1234567890.us-east-1.rds.amazonaws.com
# DB_PORT=5432
# DB_NAME=mydatabase
# DB_USER=postgres
# DB_PASSWORD=MySecurePassword123!

# Connection Settings
DB_CONNECTION_LIMIT=5
DB_TIMEOUT=15000

# Application Settings
OPERATION_INTERVAL_MS=8000
SAMPLE_TABLE_NAME=demo_users
```

## Monk Integration

The RDS client is designed to work seamlessly with RDS instances created by the Monk `aws-rds` entity using proper Monk connection patterns.

### Connection Architecture

The client uses Monk's connection system to automatically retrieve database information:

```yaml
mysql-client:
  permitted-secrets:
    demo-mysql-db-master-password: true
  connections:
    db:
      runnable: mysql-database
      service: db
  variables:
    mysql_host:
      env: DB_HOST
      value: <- connection-target("db") entity-state get-member("endpoint_address")
    mysql_password:
      env: DB_PASSWORD
      value: <- secret("demo-mysql-db-master-password")
```

### Using with Monk

1. **Load the complete stack:**
   ```bash
   monk load rds-client.yaml
   ```

2. **Run the demo:**
   ```bash
   monk run rds-demo-app
   ```

3. **Check status:**
   ```bash
   monk ps
   ```

4. **View logs:**
   ```bash
   monk logs rds-demo-app/mysql-client
   monk logs rds-demo-app/postgres-client
   ```

### Monk Configuration Features

- **Automatic Dependency Management**: Client waits for RDS instance to be ready
- **Connection Targeting**: Uses `connection-target("db")` to retrieve database information
- **Entity State Access**: Retrieves runtime values like `endpoint_address` and `endpoint_port`
- **Entity Definition Access**: Retrieves configuration values like `master_username` and `db_name`
- **Secure Secret Management**: Uses `permitted-secrets` and `secret()` functions
- **Service Connections**: Defines database services for proper connection handling
- **Environment Isolation**: Separate configurations for different database engines

## Operations Demonstrated

### Database Operations

1. **Connection Management**
   - Establish secure database connections
   - Connection pooling and timeout handling
   - Graceful connection cleanup

2. **Schema Management**
   - Automatic table creation with proper constraints
   - Table structure inspection
   - Engine-specific SQL differences

3. **CRUD Operations**
   - **Create**: Insert new user records
   - **Read**: Query all users and specific users by ID
   - **Update**: Modify existing user information
   - **Delete**: Remove users from the database

4. **Data Operations**
   - Batch record insertion
   - Duplicate handling (unique constraints)
   - Periodic data display
   - Transaction management

### Engine-Specific Features

#### MySQL Features
- InnoDB engine with UTF8MB4 charset
- AUTO_INCREMENT primary keys
- MySQL-specific error handling
- Connection reconnection support

#### PostgreSQL Features
- SERIAL primary keys
- Parameterized queries with $1, $2 syntax
- PostgreSQL-specific data types
- Information schema queries

## Sample Output

```
🚀 RDS Client Demo started
🗄️  Engine: mysql
========================================
🔌 Connecting to MySQL database...
   Host: my-rds.c123.us-east-1.rds.amazonaws.com:3306
   Database: mydatabase
   User: admin
✅ MySQL connection established successfully
✅ Table 'demo_users' created/verified successfully

📋 Table Structure:
┌─────────┬──────────────┬──────┬─────────┬─────────────────────┬───────┐
│ (index) │    Field     │ Type │  Null   │       Default       │ Extra │
├─────────┼──────────────┼──────┼─────────┼─────────────────────┼───────┤
│    0    │     'id'     │ 'int'│   'NO'  │       undefined     │ 'auto_increment' │
│    1    │    'name'    │'varchar(255)'│ 'NO' │   undefined     │   ''  │
│    2    │   'email'    │'varchar(255)'│ 'NO' │   undefined     │   ''  │
│    3    │ 'created_at' │'timestamp'│ 'NO'│'CURRENT_TIMESTAMP'│   ''  │
└─────────┴──────────────┴──────┴─────────┴─────────────────────┴───────┘

🔄 Running demo operations...

➕ Inserting sample users...
✅ User inserted with ID: 1
✅ User inserted with ID: 2
✅ User inserted with ID: 3

📊 Current Users:
┌─────────┬────┬───────────────────┬─────────────────────────────┬─────────────────────┐
│ (index) │ id │       name        │            email            │     created_at      │
├─────────┼────┼───────────────────┼─────────────────────────────┼─────────────────────┤
│    0    │ 3  │ 'Charlie Brown'   │ 'charlie.brown@example.com' │ 2024-01-15T10:30:45.000Z │
│    1    │ 2  │ 'Jane Smith'      │ 'jane.smith@example.com'    │ 2024-01-15T10:30:45.000Z │
│    2    │ 1  │ 'John Doe'        │ 'john.doe@example.com'      │ 2024-01-15T10:30:45.000Z │
└─────────┴────┴───────────────────┴─────────────────────────────┴─────────────────────┘
Total users: 3

📝 Updating user...
Update result: Success

🔍 Getting user by ID...
Found user: {
  id: 1,
  name: 'John Doe Updated',
  email: 'john.doe.updated@example.com',
  created_at: 2024-01-15T10:30:45.000Z
}

🗑️  Deleting user...
Delete result: Success
```

## Architecture

### Class Structure

```
DatabaseClient (Abstract)
├── MySQLClient
└── PostgreSQLClient

RDSClientDemo
├── Connection Management
├── Demo Operations
└── Periodic Monitoring
```

### Key Components

1. **Abstract DatabaseClient**: Common interface for database operations
2. **MySQLClient**: MySQL-specific implementation with mysql2 driver
3. **PostgreSQLClient**: PostgreSQL-specific implementation with pg driver
4. **RDSClientDemo**: Main application orchestrator
5. **Configuration Management**: Environment-based configuration
6. **Error Handling**: Comprehensive error management and recovery

## Error Handling

- **Connection Errors**: Automatic retry and graceful degradation
- **SQL Errors**: Proper error logging and user feedback
- **Constraint Violations**: Duplicate key handling
- **Timeout Handling**: Connection and query timeouts
- **Graceful Shutdown**: Proper cleanup on application termination

## Security Considerations

- **Connection Security**: SSL/TLS support for database connections
- **Environment Variables**: Secure credential management
- **SQL Injection Prevention**: Parameterized queries
- **Connection Limits**: Controlled connection pooling
- **Secret Management**: Integration with Monk's secret system

## Development

### Project Structure

```
examples/rds-client/
├── src/
│   └── client.ts          # Main application code
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── Dockerfile             # Container image definition
├── docker-compose.yml     # Multi-engine deployment
├── rds-client.yaml        # Monk integration configuration
├── env.example            # Environment template
└── README.md              # This documentation
```

### Adding New Features

1. **New Database Engine**: Extend `DatabaseClient` abstract class
2. **New Operations**: Add methods to the client classes
3. **New Configurations**: Update environment variables and interfaces
4. **New Demo Scenarios**: Extend `RDSClientDemo` operations

## Troubleshooting

### Common Issues

1. **Connection Timeout**
   - Check network connectivity to RDS instance
   - Verify security group allows connections
   - Increase `DB_TIMEOUT` value

2. **Authentication Failed**
   - Verify username and password
   - Check RDS instance user permissions
   - Ensure database exists

3. **Table Creation Errors**
   - Verify user has CREATE permissions
   - Check database engine compatibility
   - Review SQL syntax for engine differences

4. **Docker Issues**
   - Ensure proper environment variables
   - Check network connectivity from container
   - Verify image build completed successfully

### Debug Mode

Enable verbose logging by setting:
```bash
NODE_ENV=development
```

## License

MIT License - See LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes and add tests
4. Submit a pull request

## Related

- [AWS RDS Entity Documentation](../../src/aws-rds/README.md)
- [Monk Documentation](https://docs.monk.io)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) 