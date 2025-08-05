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
- AWS credentials configured (IAM role, environment variables, or AWS CLI)
- Access to an SQS queue

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

The worker supports multiple ways to provide AWS credentials:

1. **IAM Roles** (recommended for production)
2. **Environment variables:** `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
3. **AWS credentials file** (`~/.aws/credentials`)
4. **Instance metadata** (for EC2)

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