import { CloudTasksClient } from '@google-cloud/tasks';
import * as dotenv from 'dotenv';

dotenv.config();

const config = {
  queueName: process.env.QUEUE_NAME || '',
  projectId: process.env.GCP_PROJECT || '',
  location: process.env.QUEUE_LOCATION || 'us-central1',
  targetUrl: process.env.TARGET_URL || 'https://httpbin.org/post',
  operationIntervalMs: parseInt(process.env.OPERATION_INTERVAL_MS || '5000', 10),
  maxOperations: parseInt(process.env.MAX_OPERATIONS || '0', 10),
  credentialsJson: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '',
};

class CloudTasksDemo {
  private client: CloudTasksClient;
  private isShuttingDown = false;
  private operationCount = 0;

  constructor() {
    if (!config.queueName) {
      throw new Error('QUEUE_NAME is required (full resource name: projects/*/locations/*/queues/*)');
    }

    console.log('Cloud Tasks Demo Client');
    console.log('=======================');
    console.log(`  Queue: ${config.queueName}`);
    console.log(`  Target URL: ${config.targetUrl}`);
    console.log(`  Interval: ${config.operationIntervalMs}ms`);
    console.log(`  Max operations: ${config.maxOperations || 'unlimited'}`);
    console.log('');

    // Initialize client with credentials
    if (config.credentialsJson) {
      const creds = JSON.parse(config.credentialsJson);
      this.client = new CloudTasksClient({ credentials: creds, projectId: config.projectId });
    } else {
      this.client = new CloudTasksClient({ projectId: config.projectId });
    }

    this.setupGracefulShutdown();
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      console.log('\nGraceful shutdown initiated...');
      this.isShuttingDown = true;
      setTimeout(() => process.exit(0), 1000);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private async createTask(): Promise<string> {
    const payload = {
      timestamp: new Date().toISOString(),
      operation: this.operationCount,
      message: `Task from Cloud Tasks demo #${this.operationCount}`,
    };

    const [response] = await this.client.createTask({
      parent: config.queueName,
      task: {
        httpRequest: {
          httpMethod: 'POST',
          url: config.targetUrl,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        },
      },
    });

    const taskName = response.name || 'unknown';
    const shortName = taskName.split('/').pop();
    console.log(`  Created task: ${shortName}`);
    return taskName;
  }

  private async listTasks(): Promise<void> {
    const [tasks] = await this.client.listTasks({
      parent: config.queueName,
      pageSize: 10,
    });

    console.log(`  Tasks in queue: ${tasks.length}`);
    for (const task of tasks.slice(0, 5)) {
      const name = task.name?.split('/').pop() || 'unknown';
      const dispatches = task.dispatchCount || 0;
      const responses = task.responseCount || 0;
      console.log(`    - ${name} (dispatches: ${dispatches}, responses: ${responses})`);
    }
    if (tasks.length > 5) {
      console.log(`    ... and ${tasks.length - 5} more`);
    }
  }

  private async getQueueInfo(): Promise<void> {
    const [queue] = await this.client.getQueue({ name: config.queueName });
    console.log(`  Queue state: ${queue.state}`);
    if (queue.rateLimits) {
      console.log(`  Rate: ${queue.rateLimits.maxDispatchesPerSecond}/s, burst: ${queue.rateLimits.maxBurstSize}, concurrent: ${queue.rateLimits.maxConcurrentDispatches}`);
    }
    if (queue.retryConfig) {
      console.log(`  Retry: max ${queue.retryConfig.maxAttempts} attempts, backoff ${queue.retryConfig.minBackoff?.seconds || 0}s-${queue.retryConfig.maxBackoff?.seconds || 0}s`);
    }
  }

  public async start(): Promise<void> {
    console.log('Starting Cloud Tasks demo...\n');

    // Show queue info once at startup
    try {
      await this.getQueueInfo();
      console.log('');
    } catch (err) {
      console.error('Warning: Could not fetch queue info:', (err as Error).message);
    }

    const runOperation = async () => {
      if (this.isShuttingDown) return;

      this.operationCount++;
      console.log(`--- Operation #${this.operationCount} ---`);

      try {
        // Create a task
        await this.createTask();

        // List current tasks
        await this.listTasks();
      } catch (err) {
        console.error(`  Error: ${(err as Error).message}`);
      }

      console.log('');

      if (config.maxOperations > 0 && this.operationCount >= config.maxOperations) {
        console.log(`Reached max operations (${config.maxOperations}). Done.`);
        process.exit(0);
      }

      if (!this.isShuttingDown) {
        setTimeout(runOperation, config.operationIntervalMs);
      }
    };

    await runOperation();
  }
}

async function main() {
  try {
    const demo = new CloudTasksDemo();
    await demo.start();
  } catch (error) {
    console.error('Failed to start:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch(console.error);
}
