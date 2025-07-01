# Redis Cloud Test Suite

This directory contains comprehensive integration tests for Redis Cloud entities in MonkeC, covering both Essentials (free tier) and Pro (paid tier) subscriptions with real Redis Cloud deployments.

## Quick Start

1. **Copy environment template:**
   ```bash
   cp src/redis-cloud/test/env.example src/redis-cloud/test/.env
   ```

2. **Configure credentials:**
   ```bash
   # Edit .env file with your actual Redis Cloud credentials
   REDIS_CLOUD_USER_KEY=your-actual-redis-cloud-user-key
   REDIS_CLOUD_ACCOUNT_KEY=your-actual-redis-cloud-account-key
   ```

3. **Run tests:**
   ```bash
   # Test everything
   deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml
   
   # Test specific tier
   deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml --group dev-essentials-stack
   ```

## Required Configuration

### Environment Variables
- `REDIS_CLOUD_USER_KEY` - Your Redis Cloud API user key
- `REDIS_CLOUD_ACCOUNT_KEY` - Your Redis Cloud API account key

### Getting Redis Cloud API Keys
1. Login to [Redis Cloud Console](https://app.redislabs.com/)
2. Go to **Settings** → **Access Control** → **API Keys**
3. Create a new API key pair or use existing keys
4. Copy both the **User Key** and **Account Key**

## Test Environment Setup

### Using Environment File (Recommended)
```bash
# Create .env file in test directory
export REDIS_CLOUD_USER_KEY="your_redis_cloud_user_key_here"
export REDIS_CLOUD_ACCOUNT_KEY="your_redis_cloud_account_key_here"

# Load environment
source .env

# Run tests
deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml
```

### Using Inline Environment Variables
```bash
# For shell environments that don't support .env
REDIS_CLOUD_USER_KEY="your_user_key" \
REDIS_CLOUD_ACCOUNT_KEY="your_account_key" \
deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml
```

### Direct Environment Variable Export
```bash
# Export to current shell session
export REDIS_CLOUD_USER_KEY="your_redis_cloud_user_key_here"
export REDIS_CLOUD_ACCOUNT_KEY="your_redis_cloud_account_key_here"

# Run tests
deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml
```

## Test Structure

### Stack Components

#### Subscription Entities
- **dev-essentials-subscription** - Free tier subscription (AWS us-east-1)
- **dev-pro-subscription** - Paid tier subscription (AWS us-east-1)

#### Database Entities  
- **dev-essentials-database** - Basic Redis database on free tier
- **dev-pro-database** - Advanced Redis database on paid tier

#### Connection Tests
- **dev-essentials-connection-test** - Validates Essentials database connectivity
- **dev-pro-connection-test** - Validates Pro database connectivity and features

#### Process Groups
- **dev-essentials-stack** - Essentials tier complete stack
- **dev-pro-stack** - Pro tier complete stack  
- **dev-stack** - Full test suite (both tiers)

### Test Execution Flow

1. **Deployment Phase**
   - Creates subscriptions in parallel
   - Waits for subscription readiness (up to 5 minutes)
   - Creates databases in parallel
   - Waits for database readiness (up to 10 minutes)

2. **Validation Phase**  
   - Runs connection tests using redis-cli
   - Performs Redis operations (SET/GET/TTL/INFO)
   - Validates endpoints and authentication
   - Tests Redis-specific features per tier

3. **Cleanup Phase**
   - Automatically removes test databases
   - Removes test subscriptions
   - Reports cleanup status

## Targeted Test Commands

### Test Individual Components
```bash
# Test only Essentials tier
deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml --group dev-essentials-stack

# Test only Pro tier  
deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml --group dev-pro-stack

# Test specific database
deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml --runnable dev-essentials-database
```

### Environment-Specific Testing
```bash
# Verbose output
MONKEC_VERBOSE=true deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml

# Extended timeout for slow regions
TEST_TIMEOUT=600000 deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml

# Test with specific credentials inline
REDIS_CLOUD_USER_KEY="user_key" REDIS_CLOUD_ACCOUNT_KEY="account_key" deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml
```

## Troubleshooting

### Common Issues

#### Authentication Errors
```
Error: 401 Unauthorized - Invalid API credentials
```
**Solution:** 
- Verify `REDIS_CLOUD_USER_KEY` and `REDIS_CLOUD_ACCOUNT_KEY` are correctly set in `.env` file or environment
- Ensure both keys are from the same API key pair in Redis Cloud console
- Check that API keys have sufficient permissions for subscription and database management

#### Subscription Creation Failures
```
Error: 402 Payment Required - Credit card required for Pro subscription
```
**Solution:** 
- Pro subscriptions require valid payment method
- Add credit card to Redis Cloud account before testing Pro tier
- Use only Essentials tests if no payment method available

#### Regional Availability Issues
```
Error: 400 Bad Request - Region not available for subscription type
```
**Solution:**
- Some regions may not support Essentials tier
- Try different AWS region (us-west-2, eu-west-1)
- Check Redis Cloud documentation for region availability

#### Timeout During Database Creation
```
Error: Timeout waiting for database to become ready
```
**Solution:**
- Increase `TEST_TIMEOUT` environment variable
- Some regions have slower provisioning times
- Check Redis Cloud console for database status

#### Connection Test Failures
```
Error: Could not connect to Redis instance
```
**Solution:**
- Verify database is in "active" status
- Check if source IP restrictions are properly configured (0.0.0.0/0 for tests)
- Ensure password authentication is working
- Verify endpoint connectivity from test environment

### Debugging Steps

1. **Check Environment Configuration**
   ```bash
   echo "User Key: $REDIS_CLOUD_USER_KEY"
   echo "Account Key: $REDIS_CLOUD_ACCOUNT_KEY"  
   ```

2. **Verify Redis Cloud Account Status**
   - Login to Redis Cloud console
   - Check subscription limits and quotas
   - Verify API key permissions
   - Check account billing status (for Pro tests)

3. **Test Individual Components**
   ```bash
   # Test subscription creation only
   deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml --runnable dev-essentials-subscription
   
   # Test database creation only (after subscription exists)
   deno task test examples/redis-cloud --test-file test/stack-integration.test.yaml --runnable dev-essentials-database
   ```

4. **Manual Connection Testing**
   ```bash
   # Get database details from MonkeC state
   # Then test connection manually
   redis-cli -h <endpoint> -p <port> -a <password> ping
   ```

## Redis Cloud Specific Considerations

### Cost Management
- **Essentials databases** are free but have limitations (30MB, single-zone)
- **Pro databases** incur charges immediately upon creation
- Tests use minimal configurations to reduce costs
- Cleanup runs automatically to prevent ongoing charges

### Regional Considerations  
- Tests default to `us-east-1` for consistent availability
- Some features may not be available in all regions
- Essentials tier has limited regional options

### Database Types and Features
- **Essentials**: Basic Redis, no persistence, no replication, limited modules
- **Pro**: Full Redis feature set, persistence options, replication, all modules

### Security and Networking
- Tests use `0.0.0.0/0` source IP for convenience (not recommended for production)
- TLS is available but disabled in tests for simplicity
- Connection tests validate both public and private endpoints where applicable

### Monitoring and Alerts
- Pro tests include alert configuration examples
- Connection tests validate Redis INFO commands for monitoring
- Backup and persistence features tested where supported

## Expected Test Duration
- **Essentials stack**: ~5-8 minutes
- **Pro stack**: ~8-12 minutes  
- **Full suite**: ~15-20 minutes
- **Cleanup**: ~2-3 minutes per stack

Timing varies by region and Redis Cloud platform load. 