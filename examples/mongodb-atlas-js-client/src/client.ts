import { MongoClient, Db, Collection } from 'mongodb';
import * as dotenv from 'dotenv';

dotenv.config();

interface DemoEvent {
  event: string;
  source: string;
  sequence: number;
  createdAt: string;
}

/**
 * Builds an authenticated mongodb+srv:// URI from the SRV connection string
 * (provided by the mongodb-atlas/cluster entity) plus the username/password
 * (from the mongodb-atlas/user entity + its password secret).
 */
function buildConnectionUri(): string {
  const explicit = process.env.MONGODB_URI;
  if (explicit) return explicit;

  const srv = process.env.MONGODB_CONNECTION_STRING;
  const username = process.env.MONGODB_USERNAME;
  const password = process.env.MONGODB_PASSWORD;

  if (!srv) {
    throw new Error('MONGODB_CONNECTION_STRING (SRV) or MONGODB_URI is required');
  }
  if (!username || !password) {
    throw new Error('MONGODB_USERNAME and MONGODB_PASSWORD are required');
  }

  // Inject credentials after the scheme: mongodb+srv://user:pass@host/...
  const creds = `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  if (srv.startsWith('mongodb+srv://')) {
    return srv.replace('mongodb+srv://', `mongodb+srv://${creds}`);
  }
  if (srv.startsWith('mongodb://')) {
    return srv.replace('mongodb://', `mongodb://${creds}`);
  }
  throw new Error(`Unsupported connection string scheme: ${srv}`);
}

class AtlasDemoClient {
  private client: MongoClient;
  private db!: Db;
  private collection!: Collection<DemoEvent>;
  private readonly dbName: string;
  private readonly collectionName: string;
  private operationCount = 0;
  private readonly maxOperations: number;
  private readonly operationInterval: number;
  private isShuttingDown = false;

  constructor() {
    const uri = buildConnectionUri();
    this.dbName = process.env.MONGODB_DATABASE || 'monkdemo';
    this.collectionName = process.env.MONGODB_COLLECTION || 'events';
    this.maxOperations = parseInt(process.env.MAX_OPERATIONS || '0', 10);
    this.operationInterval = parseInt(process.env.OPERATION_INTERVAL_MS || '5000', 10);

    // Redact credentials before logging the target.
    const safeUri = uri.replace(/\/\/[^@]*@/, '//***:***@');
    console.log(`MongoDB Atlas demo client starting`);
    console.log(`  Target: ${safeUri}`);
    console.log(`  Database/Collection: ${this.dbName}.${this.collectionName}`);

    this.client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    this.setupGracefulShutdown();
  }

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      console.log('\nGraceful shutdown initiated...');
      this.isShuttingDown = true;
      try {
        await this.client.close();
      } catch {
        /* ignore */
      }
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  private async demonstrateOperations(): Promise<void> {
    // CREATE — insert an event document
    const doc: DemoEvent = {
      event: 'demo.tick',
      source: 'mongodb-atlas-js-client',
      sequence: this.operationCount,
      createdAt: new Date().toISOString(),
    };
    const insert = await this.collection.insertOne(doc);
    console.log(`  inserted _id=${insert.insertedId}`);

    // READ — fetch it back
    const found = await this.collection.findOne({ _id: insert.insertedId });
    console.log(`  read back: event=${found?.event} sequence=${found?.sequence}`);

    // QUERY — count total documents
    const total = await this.collection.countDocuments();
    console.log(`  total documents in ${this.collectionName}: ${total}`);
  }

  public async start(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db(this.dbName);
    this.collection = this.db.collection<DemoEvent>(this.collectionName);

    const ping = await this.db.command({ ping: 1 });
    console.log(`Connected to MongoDB Atlas successfully! (ping ok=${ping.ok})`);

    const runOperation = async () => {
      if (this.isShuttingDown) return;
      this.operationCount++;
      console.log(`\nOperation #${this.operationCount}`);
      try {
        await this.demonstrateOperations();
      } catch (error) {
        console.error('  operation failed:', error instanceof Error ? error.message : error);
      }

      if (this.maxOperations > 0 && this.operationCount >= this.maxOperations) {
        console.log(`Reached max operations (${this.maxOperations}). Done.`);
        await this.client.close();
        process.exit(0);
      }
      if (!this.isShuttingDown) {
        setTimeout(runOperation, this.operationInterval);
      }
    };
    await runOperation();
  }
}

async function main() {
  try {
    const client = new AtlasDemoClient();
    await client.start();
  } catch (error) {
    console.error('Failed to start:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch(console.error);
}
