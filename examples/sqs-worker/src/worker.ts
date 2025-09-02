import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface WorkerConfig {
  queueUrl: string;
  region: string;
  maxMessages: number;
  waitTimeSeconds: number;
  visibilityTimeoutSeconds: number;
  pollingIntervalMs: number;
}

class SQSWorker {
  private sqsClient: SQSClient;
  private config: WorkerConfig;
  private isRunning: boolean = false;

  constructor(config: WorkerConfig) {
    this.config = config;
    
    // Check if AssumeRole configuration is present
    const roleArn = process.env.AWS_ROLE_ARN;
    const sessionName = process.env.AWS_ROLE_SESSION_NAME;
    const externalId = process.env.AWS_EXTERNAL_ID;
    const durationSeconds = parseInt(process.env.AWS_ROLE_DURATION || '3600');
    
    if (roleArn && sessionName) {
      // Use AssumeRole credentials
      console.log('🔐 Using AssumeRole authentication');
      console.log(`   Role ARN: ${roleArn}`);
      console.log(`   Session Name: ${sessionName}`);
      console.log(`   External ID: ${externalId || 'Not specified'}`);
      console.log(`   Duration: ${durationSeconds} seconds`);
      
      this.sqsClient = new SQSClient({ 
        region: config.region,
        credentials: fromTemporaryCredentials({
          params: {
            RoleArn: roleArn,
            RoleSessionName: sessionName,
            DurationSeconds: durationSeconds,
            ...(externalId && { ExternalId: externalId })
          }
        })
      });
    } else {
      // Use direct credentials (default AWS SDK credential chain)
      console.log('🔑 Using direct credentials (AWS SDK credential chain)');
      this.sqsClient = new SQSClient({ 
        region: config.region,
        // AWS credentials will be automatically picked up from environment or IAM role
      });
    }
  }

  /**
   * Start the worker to continuously poll and process messages
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`🚀 SQS Worker started`);
    console.log(`📍 Queue URL: ${this.config.queueUrl}`);
    console.log(`🌍 Region: ${this.config.region}`);
    console.log(`⏱️  Polling interval: ${this.config.pollingIntervalMs}ms`);
    console.log('----------------------------------------');

    while (this.isRunning) {
      try {
        await this.pollMessages();
        // Wait before next polling cycle
        await this.sleep(this.config.pollingIntervalMs);
      } catch (error) {
        console.error('❌ Error in polling cycle:', error);
        // Continue polling even if there's an error
        await this.sleep(this.config.pollingIntervalMs);
      }
    }
  }

  /**
   * Stop the worker
   */
  stop(): void {
    console.log('🛑 Stopping SQS Worker...');
    this.isRunning = false;
  }

  /**
   * Poll messages from the SQS queue
   */
  private async pollMessages(): Promise<void> {
    const command = new ReceiveMessageCommand({
      QueueUrl: this.config.queueUrl,
      MaxNumberOfMessages: this.config.maxMessages,
      WaitTimeSeconds: this.config.waitTimeSeconds,
      VisibilityTimeout: this.config.visibilityTimeoutSeconds,
      MessageAttributeNames: ['All'],
      AttributeNames: ['All']
    });

    try {
      const response = await this.sqsClient.send(command);
      
      if (response.Messages && response.Messages.length > 0) {
        console.log(`📨 Received ${response.Messages.length} message(s)`);
        
        // Process messages concurrently
        const processPromises = response.Messages.map(message => this.processMessage(message));
        await Promise.all(processPromises);
      } else {
        console.log('📭 No messages received');
      }
    } catch (error) {
      console.error('❌ Error polling messages:', error);
      throw error;
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(message: Message): Promise<void> {
    try {
      console.log('📋 Processing message:');
      console.log(`   Message ID: ${message.MessageId}`);
      console.log(`   Receipt Handle: ${message.ReceiptHandle?.substring(0, 20)}...`);
      
      // Parse and log the message body
      let payload: any;
      try {
        payload = JSON.parse(message.Body || '{}');
        console.log('   📄 Payload (JSON):', JSON.stringify(payload, null, 2));
      } catch (parseError) {
        payload = message.Body;
        console.log('   📄 Payload (Raw):', payload);
      }

      // Log message attributes if present
      if (message.MessageAttributes && Object.keys(message.MessageAttributes).length > 0) {
        console.log('   🏷️  Message Attributes:');
        Object.entries(message.MessageAttributes).forEach(([key, attr]) => {
          console.log(`     ${key}: ${attr.StringValue || attr.BinaryValue} (${attr.DataType})`);
        });
      }

      // Log system attributes if present
      if (message.Attributes && Object.keys(message.Attributes).length > 0) {
        console.log('   ⚙️  System Attributes:');
        Object.entries(message.Attributes).forEach(([key, value]) => {
          console.log(`     ${key}: ${value}`);
        });
      }

      // Simulate message processing
      await this.simulateWork();

      // Delete the message after successful processing
      await this.deleteMessage(message);
      console.log('   ✅ Message processed and deleted successfully');

    } catch (error) {
      console.error(`   ❌ Error processing message ${message.MessageId}:`, error);
      // In a real application, you might want to implement retry logic or send to DLQ
    }
    
    console.log('----------------------------------------');
  }

  /**
   * Delete a processed message from the queue
   */
  private async deleteMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      throw new Error('No receipt handle found for message');
    }

    const deleteCommand = new DeleteMessageCommand({
      QueueUrl: this.config.queueUrl,
      ReceiptHandle: message.ReceiptHandle
    });

    await this.sqsClient.send(deleteCommand);
  }

  /**
   * Simulate work being done on the message
   */
  private async simulateWork(): Promise<void> {
    // Simulate processing time between 100ms to 2s
    const processingTime = Math.random() * 1900 + 100;
    await this.sleep(processingTime);
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Main function to start the worker
 */
async function main() {
  // Configuration - can be overridden by environment variables
  const config: WorkerConfig = {
    queueUrl: process.env.SQS_QUEUE_URL || '',
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    maxMessages: parseInt(process.env.MAX_MESSAGES || '10'),
    waitTimeSeconds: parseInt(process.env.WAIT_TIME_SECONDS || '20'),
    visibilityTimeoutSeconds: parseInt(process.env.VISIBILITY_TIMEOUT_SECONDS || '30'),
    pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '1000')
  };

  // Validate required configuration
  if (!config.queueUrl) {
    console.error('❌ SQS_QUEUE_URL environment variable is required');
    process.exit(1);
  }

  const worker = new SQSWorker(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🔄 Received SIGINT, shutting down gracefully...');
    worker.stop();
    setTimeout(() => {
      console.log('👋 SQS Worker stopped');
      process.exit(0);
    }, 1000);
  });

  process.on('SIGTERM', () => {
    console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
    worker.stop();
    setTimeout(() => {
      console.log('👋 SQS Worker stopped');
      process.exit(0);
    }, 1000);
  });

  // Start the worker
  try {
    await worker.start();
  } catch (error) {
    console.error('❌ Fatal error starting worker:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
} 