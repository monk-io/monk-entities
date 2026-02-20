# Azure PostgreSQL Client

A TypeScript-based client that demonstrates how to connect to and interact with Azure Database for PostgreSQL Flexible Server instances created by the Monk `azure-postgresql` entity.

## Features

- 🗄️ **Azure PostgreSQL Support**: Optimized for Azure Database for PostgreSQL Flexible Server
- 🔒 **Automatic VNet Integration**: Entity creates all networking resources automatically
- 🔐 **SSL/TLS Security**: Automatic SSL configuration for Azure PostgreSQL
- 🔄 **Complete CRUD Operations**: Create, Read, Update, Delete database records
- 📊 **Connection Pooling**: Efficient database connection management
- 📋 **Table Management**: Automatic table creation and schema inspection
- 🔧 **Environment Configuration**: Flexible configuration via environment variables
- 🐳 **Docker Support**: Containerized deployment
- 🛡️ **Graceful Shutdown**: Proper connection cleanup and error handling
- 📝 **Comprehensive Logging**: Detailed operation logging and error reporting
- 🎯 **Monk Integration**: Seamless integration with Monk azure-postgresql entities

## Architecture

This example uses **Automatic VNet Integration** for maximum security with minimal configuration:

- **No public IP** - Server is only accessible from within the VNet
- **Auto-created resources** - Entity creates subnet, DNS zone, and DNS link
- **Zone-redundant HA** - High availability across availability zones
- **Geo-redundant backup** - Backups replicated to paired region

```
┌─────────────────────────────────────────────────────────────┐
│                        Azure VNet                           │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   AKS Cluster   │    │  PostgreSQL Delegated Subnet    │ │
│  │  ┌───────────┐  │    │  (auto-created by entity)       │ │
│  │  │  Client   │──┼────┼──┌───────────────────────────┐  │ │
│  │  │  Pod      │  │    │  │  PostgreSQL Flexible      │  │ │
│  │  └───────────┘  │    │  │  Server (Private IP)      │  │ │
│  └─────────────────┘    │  └───────────────────────────┘  │ │
│                         └─────────────────────────────────┘ │
│                                     │                       │
│  ┌──────────────────────────────────┴────────────────────┐  │
│  │              Private DNS Zone (auto-created)          │  │
│  │    *.postgres.database.azure.com → Private IP         │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Azure Resources

1. **Monk-created VNet** - When you deploy Monk nodes to Azure, a VNet is automatically created with the following naming convention:
   ```
   <resource-group><region>-vn
   ```
   **Examples:**
   - Resource group `my-project` in `East US` → VNet name: `my-projecteastus-vn`
   - Resource group `ivan-test` in `West Europe` → VNet name: `ivan-testwesteurope-vn`
   
   You can find your VNet name in the Azure Portal under **Virtual Networks** or by checking the Monk node's resource group.

2. **VNet Address Space** - Monk uses a predefined address space:
   - **VNet address space:** `172.16.0.0/12`
   - **Default node subnet:** `172.16.0.0/16`
   
   When configuring `subnet_address_prefix` for PostgreSQL, choose an IP range within the VNet address space that doesn't overlap with existing subnets. For example:
   - `172.17.0.0/24` ✓
   - `172.18.0.0/24` ✓
   - `172.19.0.0/24` ✓
   - `172.16.x.x/xx` ✗ (conflicts with default node subnet)

3. **Deploy your Monk nodes in the same VNet** - The PostgreSQL client must run on nodes within the same VNet (or a peered VNet)

That's it! The entity automatically creates:
- A delegated subnet for PostgreSQL
- A private DNS zone (`privatelink.postgres.database.azure.com`)
- A DNS zone VNet link

### Local Development

- Node.js 18+
- Access to an Azure Database for PostgreSQL Flexible Server
- Database credentials and connection information

## Quick Start

### Using with Monk (Production)

1. **Load the azure-postgresql entity:**
   ```bash
   cd dist/azure-postgresql && monk load MANIFEST
   ```

2. **Load the client stack:**
   ```bash
   monk load examples/azure-postgresql-client/azure-postgresql-client.yaml
   ```

3. **Add required secrets:**
   ```bash
   monk secrets add -g postgres-admin-password='YourSecurePassword123!'
   ```

4. **Set environment variables:**
   ```bash
   export AZURE_SUBSCRIPTION_ID=your-subscription-id
   export AZURE_RESOURCE_GROUP=your-resource-group
   export AZURE_VNET_NAME=my-vnet                    # Your existing VNet name
   export POSTGRES_SUBNET_PREFIX=10.0.100.0/24      # Address prefix for PostgreSQL subnet
   ```

5. **Run the stack:**
   ```bash
   monk run azure-pg-demo-app
   ```

6. **Check status:**
   ```bash
   monk ps
   monk describe azure-pg-client-demo/postgres-server
   ```

7. **View logs:**
   ```bash
   monk logs azure-pg-client-demo/postgres-client
   ```

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp env.example .env
   # Edit .env with your Azure PostgreSQL connection details
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
   docker build -t azure-postgresql-client .
   ```

2. **Run the client:**
   ```bash
   docker run --rm \
     -e DB_HOST=your-server.postgres.database.azure.com \
     -e DB_PORT=5432 \
     -e DB_NAME=appdb \
     -e DB_USER=pgadmin \
     -e DB_PASSWORD=yourpassword \
     -e DB_SSL_MODE=require \
     azure-postgresql-client
   ```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DB_HOST` | Azure PostgreSQL server FQDN | - | Yes |
| `DB_PORT` | Database port | `5432` | No |
| `DB_NAME` | Database name | `postgres` | No |
| `DB_USER` | Database username | - | Yes |
| `DB_PASSWORD` | Database password | - | Yes |
| `DB_SSL_MODE` | SSL mode (`require`, `verify-full`, `disable`) | `require` | No |
| `DB_CONNECTION_LIMIT` | Max connections in pool | `10` | No |
| `DB_TIMEOUT` | Connection timeout (ms) | `10000` | No |
| `OPERATION_INTERVAL_MS` | Interval between operations (ms) | `10000` | No |
| `SAMPLE_TABLE_NAME` | Name of demo table | `demo_users` | No |

### Monk Environment Variables

| Variable | Description |
|----------|-------------|
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID |
| `AZURE_RESOURCE_GROUP` | Resource group name |
| `AZURE_VNET_NAME` | Name of your existing VNet |
| `POSTGRES_SUBNET_PREFIX` | Address prefix for PostgreSQL subnet (default: `10.0.100.0/24`) |
| `POSTGRES_SERVER_NAME` | Server name (default: `prod-pg-server`) |

## Monk Integration

### Automatic VNet Integration

The key feature is the `vnet_integration` configuration - just provide VNet name and subnet prefix:

```yaml
postgres-server:
  defines: azure-postgresql/flexible-server
  
  # Just provide these two values:
  vnet_integration:
    vnet_name: <- `${azure-vnet-name}`
    subnet_address_prefix: <- `${postgres-subnet-prefix}`
  
  # The entity automatically creates:
  # - Delegated subnet for PostgreSQL
  # - Private DNS zone (privatelink.postgres.database.azure.com)
  # - DNS zone VNet link
```

### Connection Architecture

The client uses Monk's connection system to automatically retrieve database information:

```yaml
postgres-client:
  defines: runnable
  permitted-secrets:
    postgres-admin-password: true
  connections:
    server:
      runnable: azure-pg-client-demo/postgres-server
      service: data
  variables:
    postgres_host:
      env: DB_HOST
      # FQDN resolves to private IP via Private DNS Zone
      value: <- connection-target("server") entity-state get-member("fqdn")
    postgres_user:
      env: DB_USER
      value: <- connection-target("server") entity-state get-member("administrator_login")
    postgres_password:
      env: DB_PASSWORD
      value: <- secret("postgres-admin-password")
```

### Production Configuration

The example includes production-ready settings:

| Feature | Configuration |
|---------|---------------|
| **SKU** | Standard_D2s_v3 (General Purpose) |
| **Storage** | 128 GB with auto-grow |
| **Backup** | 35 days retention, geo-redundant |
| **High Availability** | Zone-redundant |
| **Network** | Private VNet only, no public access |

### Monk Configuration Features

- **Automatic Dependency Management**: Client waits for PostgreSQL server to be ready
- **Connection Targeting**: Uses `connection-target("server")` to retrieve database information
- **Entity State Access**: Retrieves runtime values like `fqdn` and `administrator_login`
- **Entity Definition Access**: Retrieves configuration values like `database_name`
- **Secure Secret Management**: Uses `permitted-secrets` and `secret()` functions
- **Service Connections**: Defines database services for proper connection handling
- **Automatic VNet Integration**: Creates all networking resources automatically

## Operations Demonstrated

### Database Operations

1. **Connection Management**
   - Establish secure SSL database connections
   - Connection pooling and timeout handling
   - Graceful connection cleanup

2. **Schema Management**
   - Automatic table creation with proper constraints
   - Table structure inspection
   - Database creation if not exists

3. **CRUD Operations**
   - **Create**: Insert new user records
   - **Read**: Query all users and specific users by ID
   - **Update**: Modify existing user information
   - **Delete**: Remove users from the database

## Sample Output

```
🚀 Azure PostgreSQL Client Demo started
🗄️  Engine: PostgreSQL (Azure Flexible Server)
========================================
🔌 Connecting to Azure PostgreSQL database...
   Host: prod-pg-server.postgres.database.azure.com:5432
   Database: appdb
   User: pgadmin
   SSL Mode: require
✅ PostgreSQL connection established successfully to database: appdb
📊 Server Version: PostgreSQL 16.11 on x86_64-pc-linux-gnu...
✅ Table 'app_users' created/verified successfully

📋 Table Structure:
┌─────────┬──────────────┬───────────┬─────────────────────────────────┐
│ (index) │ column_name  │ data_type │        column_default           │
├─────────┼──────────────┼───────────┼─────────────────────────────────┤
│    0    │    'id'      │ 'integer' │ 'nextval(''app_users_id_seq'')' │
│    1    │   'name'     │'varchar'  │           null                  │
│    2    │  'email'     │'varchar'  │           null                  │
│    3    │'created_at'  │'timestamp'│     'CURRENT_TIMESTAMP'         │
└─────────┴──────────────┴───────────┴─────────────────────────────────┘

🔄 Running demo operations...
➕ Inserting sample users...
✅ User inserted with ID: 1
✅ User inserted with ID: 2
...
```

## Security Considerations

- **Automatic VNet Integration**: No public IP, traffic stays within Azure backbone
- **Private DNS Zone**: FQDN resolves to private IP only within linked VNets
- **SSL/TLS Required**: Azure PostgreSQL requires SSL connections
- **Environment Variables**: Secure credential management
- **SQL Injection Prevention**: Parameterized queries
- **Connection Limits**: Controlled connection pooling
- **Secret Management**: Integration with Monk's secret system
- **Automatic Cleanup**: VNet resources are cleaned up when server is deleted

## Troubleshooting

### Common Issues

1. **Connection Timeout from outside VNet**
   - **Cause**: Server has no public IP, only accessible from within VNet
   - **Solution**: Deploy client in same VNet or peered VNet

2. **DNS Resolution Failure**
   - **Cause**: Private DNS Zone not linked to client's VNet
   - **Solution**: The entity creates the DNS link automatically; ensure client is in the same VNet

3. **SSL Connection Error**
   - **Cause**: Azure PostgreSQL requires SSL connections
   - **Solution**: Ensure `DB_SSL_MODE=require` is set

4. **Authentication Failed**
   - Verify username format: `username` (not `username@servername`)
   - Check password is correct
   - Ensure user has permissions on the database

5. **Subnet Address Conflict**
   - **Cause**: The subnet address prefix overlaps with existing subnets
   - **Solution**: Choose a different address prefix within the VNet's address space

## Project Structure

```
examples/azure-postgresql-client/
├── src/
│   └── client.ts              # Main application code
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── Dockerfile                 # Container image definition
├── azure-postgresql-client.yaml  # Monk integration configuration
├── env.example                # Environment template
└── README.md                  # This documentation
```

## License

MIT License - See LICENSE file for details.

## Related

- [Azure PostgreSQL Entity Documentation](../../src/azure-postgresql/README.md)
- [Monk Documentation](https://docs.monk.io)
- [Azure Database for PostgreSQL Documentation](https://learn.microsoft.com/en-us/azure/postgresql/)
- [Azure VNet Integration](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-networking-private)
