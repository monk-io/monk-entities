import { Queue, QueueMessage } from './queue';
import { Storage } from './storage';
import { updateTaskStatus } from './db';
import { config } from './config';

export class Worker {
  private running = false;

  constructor(private queue: Queue, private storage: Storage) {}

  start(): void {
    this.running = true;
    console.log('Worker started, polling for tasks...');
    this.poll();
  }

  stop(): void {
    this.running = false;
    console.log('Worker stopping...');
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const message = await this.queue.receive();
        if (message) {
          await this.processMessage(message);
        } else {
          // No message — wait before next poll
          await sleep(config.queue.dbPollIntervalMs);
        }
      } catch (err) {
        console.error('Worker poll error:', err);
        await sleep(5000);
      }
    }
  }

  private async processMessage(message: QueueMessage): Promise<void> {
    const { taskId, title, payload } = message;
    console.log(`Processing task ${taskId}: ${title}`);
    try {
      // Simulate processing
      const result = {
        taskId,
        title,
        processedAt: new Date().toISOString(),
        output: `Processed: ${payload.toUpperCase()}`,
        wordCount: payload.split(/\s+/).length,
      };

      // Upload result to storage
      const storageKey = `tasks/${taskId}/result.json`;
      await this.storage.upload(storageKey, JSON.stringify(result, null, 2));

      // Mark done
      await updateTaskStatus(taskId, 'done', storageKey);
      await this.queue.ack(message);

      console.log(`Task ${taskId} done — result at ${storageKey}`);
    } catch (err) {
      console.error(`Task ${taskId} failed:`, err);
      await updateTaskStatus(taskId, 'failed', (err as Error).message);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
