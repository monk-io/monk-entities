import * as dotenv from 'dotenv';

dotenv.config();

export type QueueType = 'sqs' | 'servicebus' | 'db' | 'pubsub';
export type StorageType = 's3' | 'azure-blob' | 'spaces';
export type Mode = 'api' | 'worker' | 'both';

export const config = {
  // App mode
  mode: (process.env.MODE || 'both') as Mode,
  port: parseInt(process.env.PORT || '3000', 10),

  // Database
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'taskdb',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL !== 'false',
  },

  // Queue
  queue: {
    type: (process.env.QUEUE_TYPE || 'sqs') as QueueType,
    // SQS
    sqsUrl: process.env.SQS_QUEUE_URL || '',
    sqsRegion: process.env.AWS_REGION || 'us-east-1',
    awsAccessKey: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    // Azure Service Bus
    serviceBusConnectionString: process.env.SERVICEBUS_CONNECTION_STRING || '',
    serviceBusQueueName: process.env.SERVICEBUS_QUEUE_NAME || 'tasks',
    // DB polling interval (ms) for db queue type
    dbPollIntervalMs: parseInt(process.env.DB_POLL_INTERVAL_MS || '2000', 10),
    // GCP Pub/Sub
    pubsubTopic: process.env.PUBSUB_TOPIC || '',
    pubsubSubscription: process.env.PUBSUB_SUBSCRIPTION || '',
    gcpCredentialsJson: process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '',
  },

  // Storage
  storage: {
    type: (process.env.STORAGE_TYPE || 's3') as StorageType,
    // S3 / Spaces
    bucket: process.env.STORAGE_BUCKET || '',
    region: process.env.STORAGE_REGION || 'us-east-1',
    endpoint: process.env.STORAGE_ENDPOINT || '',  // for Spaces / MinIO custom endpoint
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',  // required for MinIO
    accessKey: process.env.STORAGE_ACCESS_KEY || process.env.AWS_ACCESS_KEY_ID || '',
    secretKey: process.env.STORAGE_SECRET_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
    // Azure Blob
    azureConnectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    azureContainerName: process.env.AZURE_STORAGE_CONTAINER || 'task-results',
  },
};
