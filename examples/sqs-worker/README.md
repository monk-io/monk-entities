# SQS Worker

A simple TypeScript-based worker that processes messages from an AWS SQS queue in a continuous loop.

## Features

- 🔄 Continuous polling of SQS messages
- 📝 Detailed logging of message payloads and attributes
- ⚙️ Configurable polling settings
- 🐳 Docker support
- 🛡️ Graceful shutdown handling
- 🔧 Environment variable configuration
- ❌ Error handling and resilience

## Quick Start

### Prerequisites

- Node.js 18+ 
- AWS credentials configured (see Authentication Options below)
- Access to an SQS queue

### Authentication Options

This example provides three different authentication patterns:

#### 1. Manual Setup (Basic)
- **File**: `sqs-worker.yaml`
- Requires manual AWS credential setup
- Uses secrets: `aws-access-key-id`, `aws-secret-access-key`
- Good for: Testing, manual credential management

#### 2. Direct Access Keys (Automated)
- **File**: `sqs-worker-direct-access.yaml`
- Automatically creates IAM user with SQS permissions
- Generates and stores access keys in Monk secrets
- Good for: Development, simple production workloads

#### 3. AssumeRole Pattern (Recommended)
- **File**: `sqs-worker-assume-role.yaml`
- Creates minimal IAM user + service role
- Uses temporary credentials via STS AssumeRole
- **Auto-detects** AssumeRole configuration from environment variables
- **Automatic credential rotation** and enhanced security
- Good for: Production, enterprise, multi-account scenarios

## 🔍 **Technical Comparison: Direct Access vs AssumeRole**

### Direct Access Keys Pattern

**Architecture:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SQS Worker    │───▶│   IAM User      │───▶│   SQS Queue     │
│                 │    │ (Full SQS       │    │                 │
│ Long-lived keys │    │  Permissions)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Characteristics:**
- ✅ **Simple setup**: Single IAM user with direct permissions
- ✅ **Immediate access**: No additional API calls required  
- ❌ **Long-lived credentials**: Access keys don't rotate automatically
- ❌ **Broader permissions**: User has direct SQS access
- 🔧 **Use case**: Development, simple production environments

**Credential Flow:**
1. IAM user created with SQS permissions policy attached
2. Access keys generated and stored in Monk secrets
3. Worker uses `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
4. Direct API calls to SQS using static credentials

### AssumeRole Pattern (Recommended)

**Architecture:**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SQS Worker    │───▶│ Minimal User    │───▶│ Service Role    │───▶│   SQS Queue     │
│                 │    │(AssumeRole only)│    │(Full SQS perms) │    │                 │
│ Temporary creds │    │                 │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Characteristics:**
- ✅ **Enhanced security**: Temporary, rotating credentials (1-hour sessions)
- ✅ **Least privilege**: Minimal user only has `sts:AssumeRole` permission
- ✅ **Separation of concerns**: Authentication user vs service permissions
- ✅ **Multi-account ready**: Can assume roles across AWS accounts
- ✅ **Audit trail**: Clear distinction between identity and permissions
- 🔧 **Use case**: Production, enterprise, compliance-driven environments

**Credential Flow:**
1. Minimal IAM user created with only `sts:AssumeRole` permission
2. Service role created with precise SQS permissions
3. Worker automatically detects `AWS_ROLE_ARN` configuration
4. Uses minimal user credentials to assume service role
5. Temporary credentials (1-hour sessions) used for SQS operations
6. Automatic credential refresh before expiry

### 🚀 **Enhanced Worker Auto-Detection**

The SQS worker **automatically chooses** the optimal authentication method:

**Priority Order:**
1. **AssumeRole** (if `AWS_ROLE_ARN` + `AWS_ROLE_SESSION_NAME` detected)
2. **Direct credentials** (AWS SDK credential chain)

**AssumeRole Auto-Detection:**
```bash
# Worker detects these environment variables and automatically switches to AssumeRole:
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/SQSWorkerServiceRole
AWS_ROLE_SESSION_NAME=sqs-worker-session
AWS_EXTERNAL_ID=sqs-worker-external-id        # Optional security layer
AWS_ROLE_DURATION=3600                        # Session duration (seconds)
```

**Worker Output Examples:**

*AssumeRole Mode:*
```
🔐 Using AssumeRole authentication
   Role ARN: arn:aws:iam::123456789012:role/SQSWorkerServiceRole
   Session Name: sqs-worker-session
   External ID: sqs-worker-external-id
   Duration: 3600 seconds
```

*Direct Credentials Mode:*
```
🔑 Using direct credentials (AWS SDK credential chain)
```

### 📊 **When to Choose Each Pattern**

| Criteria | Direct Access | AssumeRole | Winner |
|----------|---------------|------------|---------|
| **Setup Complexity** | Simple | Moderate | Direct Access |
| **Security** | Basic | Enterprise | AssumeRole ✅ |
| **Credential Rotation** | Manual | Automatic | AssumeRole ✅ |
| **Multi-Account Support** | Limited | Native | AssumeRole ✅ |
| **Compliance** | Basic | Advanced | AssumeRole ✅ |
| **Development Speed** | Fast | Fast | Tie |
| **Production Ready** | Yes | Yes ✅ | AssumeRole ✅ |
| **Least Privilege** | Basic | Advanced | AssumeRole ✅ |

**Recommendation:**
- **Development/Testing**: Either approach works well
- **Production/Enterprise**: **AssumeRole pattern strongly recommended**

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your SQS queue URL and settings
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
   docker build -t sqs-worker .
   ```

2. **Run with environment variables:**
   ```bash
   docker run -e SQS_QUEUE_URL="https://sqs.us-east-1.amazonaws.com/123456789012/test-queue" \
              -e AWS_REGION="us-east-1" \
              -e AWS_ACCESS_KEY_ID="your_key" \
              -e AWS_SECRET_ACCESS_KEY="your_secret" \
              sqs-worker
   ```

3. **Run with env file:**
   ```bash
   docker run --env-file .env sqs-worker
   ```

### Docker Compose (Optional)

Create a `docker-compose.yml`:

```yaml
version: '3.8'
services:
  sqs-worker:
    build: .
    environment:
      - SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/test-queue
      - AWS_REGION=us-east-1
      - MAX_MESSAGES=10
    restart: unless-stopped
```

Run with: `docker-compose up`

## Configuration

Configure the worker using environment variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SQS_QUEUE_URL` | Full URL of the SQS queue | - | ✅ |
| `AWS_REGION` | AWS region | `us-east-1` | ❌ |
| `MAX_MESSAGES` | Maximum messages per poll | `10` | ❌ |
| `WAIT_TIME_SECONDS` | Long polling wait time | `20` | ❌ |
| `VISIBILITY_TIMEOUT_SECONDS` | Message visibility timeout | `30` | ❌ |
| `POLLING_INTERVAL_MS` | Delay between polls | `1000` | ❌ |

## AWS Credentials

The worker supports multiple authentication methods and **automatically detects** the optimal approach:

### Direct Credentials
1. **IAM Roles** (recommended for production)
2. **Environment variables:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. **AWS credentials file** (`~/.aws/credentials`)
4. **Instance metadata** (for EC2)

### AssumeRole Credentials (Auto-Detected)

When these environment variables are present, the worker **automatically uses AssumeRole**:

| Variable | Description | Example |
|----------|-------------|---------|
| `AWS_ROLE_ARN` | ARN of the role to assume | `arn:aws:iam::123456789012:role/SQSWorkerRole` |
| `AWS_ROLE_SESSION_NAME` | Session name for the assumed role | `sqs-worker-session` |
| `AWS_EXTERNAL_ID` | External ID for role assumption (optional) | `sqs-worker-external-id` |
| `AWS_ROLE_DURATION` | Session duration in seconds | `3600` (1 hour) |

**Priority Order:**
1. ✅ **AssumeRole** (if `AWS_ROLE_ARN` + `AWS_ROLE_SESSION_NAME` are set)
2. ✅ **Direct credentials** (AWS SDK credential chain)

The worker automatically refreshes temporary credentials before they expire.

## Message Processing

The worker will:

1. Poll the SQS queue continuously
2. Receive up to `MAX_MESSAGES` messages per poll
3. Log detailed information about each message:
   - Message ID and receipt handle
   - Message body (parsed as JSON if possible)
   - Message attributes
   - System attributes
4. Simulate processing work (random delay)
5. Delete successfully processed messages
6. Handle errors gracefully

### Example Output

```
🚀 SQS Worker started
📍 Queue URL: https://sqs.us-east-1.amazonaws.com/123456789012/test-queue
🌍 Region: us-east-1
⏱️  Polling interval: 1000ms
----------------------------------------
📨 Received 2 message(s)
📋 Processing message:
   Message ID: 12345678-1234-1234-1234-123456789012
   Receipt Handle: AQEBwJnKyrHigUMZj6rYigCg...
   📄 Payload (JSON): {
     "orderId": "12345",
     "customerId": "user123",
     "amount": 99.99
   }
   ✅ Message processed and deleted successfully
----------------------------------------
```

## Monitoring and Health

- The worker logs all activities with emojis for easy reading
- Graceful shutdown on `SIGINT` and `SIGTERM`
- Health check endpoint available in Docker (optional)

## Stopping the Worker

- **Local:** Press `Ctrl+C`
- **Docker:** `docker stop <container_id>`
- **Docker Compose:** `docker-compose down`

## Testing

### Send Test Messages

You can send test messages to your queue using AWS CLI:

```bash
# Send a simple message
aws sqs send-message \
  --queue-url "https://sqs.us-east-1.amazonaws.com/123456789012/test-queue" \
  --message-body '{"test": "Hello from SQS!"}'

# Send a message with attributes
aws sqs send-message \
  --queue-url "https://sqs.us-east-1.amazonaws.com/123456789012/test-queue" \
  --message-body '{"orderId": "12345", "amount": 99.99}' \
  --message-attributes 'Priority={StringValue="high",DataType="String"}'
```

### Integration with Monk

This worker can be used to test SQS queues created with Monk entities:

1. Create a queue using the `aws-sqs/sqs-queue` entity
2. Note the queue URL from the output
3. Configure the worker with that URL
4. Send test messages and observe processing

### Monk Stack Deployment

#### Option 1: Manual Setup (Basic)
```bash
# Set up credentials manually first
monk set secret aws-access-key-id "your-access-key-id"
monk set secret aws-secret-access-key "your-secret-access-key"

# Deploy the basic stack
monk load sqs-worker.yaml
monk run sqs-example/example-stack
```

#### Option 2: Direct Access Keys (Automated)
```bash
# Load and deploy the direct access stack
monk load sqs-worker-direct-access.yaml
monk run sqs-example-direct/direct-access-stack

# ✨ What gets created:
# - SQS Queue: test-sqs-queue-direct
# - IAM Policy: SQSWorkerDirectAccessPolicy (full SQS permissions)
# - IAM User: sqs-worker-direct-user (policy attached)
# - Access Keys: Generated and stored in Monk secrets
# - Worker: Uses static AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY

# Check IAM user details and credentials
monk do sqs-example-direct/sqs-worker-user/get-user-info
monk do sqs-example-direct/sqs-worker-user/get-credentials
```

**Expected Worker Output:**
```
🔑 Using direct credentials (AWS SDK credential chain)
📍 Queue URL: https://sqs.us-east-1.amazonaws.com/123456789012/test-sqs-queue-direct
🌍 Region: us-east-1
```

#### Option 3: AssumeRole Pattern (Recommended)
```bash
# Load and deploy the secure AssumeRole stack
monk load sqs-worker-assume-role.yaml
monk run sqs-example-assume-role/assume-role-stack

# ✨ What gets created:
# - SQS Queue: test-sqs-queue-assume-role
# - IAM Policy: SQSAssumeRolePolicy (only sts:AssumeRole permission)
# - IAM Policy: SQSWorkerServicePolicy (full SQS permissions)
# - Minimal User: sqs-assume-role-user (AssumeRole policy attached)
# - Service Role: SQSWorkerServiceRole (SQS policy attached)
# - Access Keys: Generated for minimal user
# - Worker: Auto-detects AssumeRole config, uses temporary credentials

# Check user and role details
monk do sqs-example-assume-role/sqs-assume-user/get-user-info
monk do sqs-example-assume-role/sqs-worker-service-role/get-role-info
```

**Expected Worker Output:**
```
🔐 Using AssumeRole authentication
   Role ARN: arn:aws:iam::123456789012:role/SQSWorkerServiceRole
   Session Name: sqs-worker-session
   External ID: sqs-worker-external-id
   Duration: 3600 seconds
📍 Queue URL: https://sqs.us-east-1.amazonaws.com/123456789012/test-sqs-queue-assume-role
🌍 Region: us-east-1
```

#### Common Operations
```bash
# Check status
monk describe <namespace>/sqs-worker

# View worker logs
monk logs <namespace>/sqs-worker

# Clean up (automatically removes created IAM resources)
monk delete <namespace>/<stack-name>
```

The automated stacks will:
1. Create an SQS queue with optimized settings
2. Set up IAM users, policies, and roles automatically
3. Generate and securely store credentials
4. Deploy the worker with proper authentication
5. Clean up all resources when deleted

## 🔒 **Security Considerations**

### Direct Access Keys - Security Profile

**Advantages:**
- ✅ **Simplicity**: Single set of credentials to manage
- ✅ **No API dependencies**: No additional STS calls required
- ✅ **Predictable**: Same permissions every time

**Security Considerations:**
- ⚠️ **Long-lived credentials**: Access keys don't expire automatically
- ⚠️ **Credential exposure**: Keys stored as environment variables 
- ⚠️ **Broader attack surface**: Direct SQS permissions on user
- ⚠️ **Harder to audit**: User identity and service permissions combined

**Best Practices:**
- 🔐 Rotate access keys regularly (manual process)
- 🔒 Use least privilege - restrict SQS permissions to specific queues
- 📊 Monitor access key usage via CloudTrail
- 🚫 Never log or expose access keys in application code

### AssumeRole Pattern - Security Profile

**Advantages:**
- ✅ **Temporary credentials**: 1-hour sessions that expire automatically
- ✅ **Separation of concerns**: Identity separate from service permissions
- ✅ **Least privilege**: Minimal user can only assume roles
- ✅ **Enhanced auditing**: Clear distinction between who and what
- ✅ **Cross-account ready**: Can assume roles in different accounts
- ✅ **External ID**: Additional security layer prevents confused deputy attacks

**Security Considerations:**
- ✅ **Automatic rotation**: Credentials refresh every hour
- ✅ **Limited blast radius**: If credentials compromised, limited time/scope
- ✅ **Better compliance**: Meets enterprise security requirements
- ✅ **Audit trail**: CloudTrail shows both AssumeRole and service calls

**Best Practices:**
- 🔐 Use External ID for additional security
- 🔒 Set minimum session duration needed (1-12 hours)
- 📊 Monitor AssumeRole calls via CloudTrail
- 🚫 Restrict which roles can be assumed

### 🛡️ **Production Recommendations**

| Environment | Recommended Pattern | Reasoning |
|-------------|-------------------|-----------|
| **Development** | Either approach | Simplicity vs learning |
| **Testing/Staging** | AssumeRole preferred | Practice production patterns |
| **Production** | **AssumeRole required** | Security, compliance, auditing |
| **Enterprise** | **AssumeRole required** | Regulatory requirements |
| **Multi-account** | **AssumeRole required** | Cross-account capabilities |

### 🔍 **Compliance Considerations**

**Direct Access Keys:**
- ❌ May not meet SOC 2 Type II requirements
- ❌ Manual rotation required for compliance
- ⚠️ Limited audit trail capabilities

**AssumeRole Pattern:**
- ✅ Meets SOC 2, ISO 27001, PCI DSS requirements
- ✅ Automatic credential rotation
- ✅ Enhanced audit trail and monitoring
- ✅ Principle of least privilege implementation

## 🛠️ **Troubleshooting Authentication**

### Direct Access Keys Issues

**❌ "Access Denied" errors:**
```bash
# Check if IAM user has proper permissions
monk do sqs-example-direct/sqs-worker-user/get-user-info

# Verify policy attachment
aws iam list-attached-user-policies --user-name sqs-worker-direct-user

# Test credentials manually
aws sts get-caller-identity
```

**❌ "Invalid security token" errors:**
- Access key might be deactivated or deleted
- Check Monk secrets: `monk get secret aws-access-key-id`
- Regenerate keys: `monk do sqs-example-direct/sqs-worker-user/regenerate-access-keys`

### AssumeRole Issues

**❌ Worker shows "Using direct credentials" instead of AssumeRole:**
```bash
# Verify environment variables are set correctly
monk describe sqs-example-assume-role/sqs-worker | grep -i aws_role

# Should show:
# AWS_ROLE_ARN: arn:aws:iam::123456789012:role/SQSWorkerServiceRole
# AWS_ROLE_SESSION_NAME: sqs-worker-session
```

**❌ "AccessDenied: User cannot assume role":**
```bash
# Check if minimal user can assume the role
aws sts assume-role \
  --role-arn "arn:aws:iam::123456789012:role/SQSWorkerServiceRole" \
  --role-session-name "test-session" \
  --external-id "sqs-worker-external-id"

# Verify trust policy allows the user
monk do sqs-example-assume-role/sqs-worker-service-role/get-role-info
```

**❌ "Access Denied during SQS operations with AssumeRole":**
- Service role might not have SQS permissions
- Check role policy attachment: `monk do sqs-example-assume-role/sqs-worker-service-role/get-role-info`
- Verify SQS queue ARN matches policy resource

### Worker Auto-Detection Debug

**Check which authentication method is active:**
```bash
# View worker logs to see authentication method
monk logs sqs-example-assume-role/sqs-worker | head -10

# Look for either:
# 🔐 Using AssumeRole authentication    <- AssumeRole mode
# 🔑 Using direct credentials          <- Direct credentials mode
```

## 📋 **Quick Reference Guide**

### Decision Matrix

**Choose Direct Access Keys if:**
- ✅ Development or simple production environment
- ✅ Single AWS account setup
- ✅ No compliance requirements for credential rotation
- ✅ Team familiar with traditional AWS access keys

**Choose AssumeRole if:**
- ✅ Production or enterprise environment
- ✅ Compliance requirements (SOC 2, ISO 27001, etc.)
- ✅ Multi-account AWS setup
- ✅ Need automatic credential rotation
- ✅ Want separation between identity and permissions

### Environment Variables Quick Reference

**Direct Access Keys Pattern:**
```bash
# Set by the IAM user entity automatically:
AWS_ACCESS_KEY_ID=AKIAI44QH8DHBEXAMPLE
AWS_SECRET_ACCESS_KEY=je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY
AWS_REGION=us-east-1
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/test-sqs-queue-direct
```

**AssumeRole Pattern:**
```bash
# For minimal user (base credentials):
AWS_ACCESS_KEY_ID=AKIAI44QH8DHBEXAMPLE
AWS_SECRET_ACCESS_KEY=je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY

# For role assumption (auto-detected by worker):
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/SQSWorkerServiceRole
AWS_ROLE_SESSION_NAME=sqs-worker-session
AWS_EXTERNAL_ID=sqs-worker-external-id
AWS_ROLE_DURATION=3600

# Common settings:
AWS_REGION=us-east-1
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/test-sqs-queue-assume-role
```

### File Structure Reference

```
examples/sqs-worker/
├── src/
│   └── worker.ts              # Enhanced with AssumeRole auto-detection
├── sqs-worker.yaml            # Manual setup (basic)
├── sqs-worker-direct-access.yaml    # Direct access keys (automated)
├── sqs-worker-assume-role.yaml      # AssumeRole pattern (recommended)
├── package.json               # Updated with STS/credential-provider deps
└── README.md                  # This comprehensive guide
```

## Troubleshooting

### Common Issues

1. **"SQS_QUEUE_URL environment variable is required"**
   - Make sure you've set the `SQS_QUEUE_URL` environment variable

2. **"Access Denied" errors**
   - Verify your AWS credentials
   - Ensure your IAM user/role has SQS permissions

3. **"Queue does not exist"**
   - Verify the queue URL is correct
   - Ensure you're using the correct AWS region

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:*:your-queue-name"
    }
  ]
}
```

## Development

### Project Structure

```
sqs-worker/
├── src/
│   └── worker.ts          # Main worker implementation
├── dist/                  # Compiled JavaScript (generated)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── Dockerfile            # Docker image definition
├── .env.example          # Environment variables template
└── README.md             # This file
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see the main project for details. 