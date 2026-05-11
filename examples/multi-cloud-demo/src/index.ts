import { config } from './config';
import { initSchema } from './db';
import { createQueue } from './queue';
import { createStorage } from './storage';
import { createApp } from './api';
import { Worker } from './worker';

async function main(): Promise<void> {
  console.log(`Starting multi-cloud-demo (mode: ${config.mode})`);

  // Always init DB schema (both api and worker need it)
  await withRetry(() => initSchema(), 'DB schema init');

  const queue = createQueue();
  const storage = createStorage();

  const shutdown = () => {
    console.log('Shutting down...');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  if (config.mode === 'api' || config.mode === 'both') {
    const app = createApp(queue, storage);
    app.listen(config.port, () => {
      console.log(`API listening on port ${config.port}`);
    });
  }

  if (config.mode === 'worker' || config.mode === 'both') {
    const worker = new Worker(queue, storage);
    worker.start();
  }
}

async function withRetry<T>(fn: () => Promise<T>, label: string, retries = 10, delayMs = 3000): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`${label} attempt ${i + 1} failed, retrying in ${delayMs}ms:`, (err as Error).message);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`${label} failed after ${retries} attempts`);
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
