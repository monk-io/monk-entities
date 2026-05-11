import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { BlobServiceClient } from '@azure/storage-blob';
import { config } from './config';

export interface Storage {
  upload(key: string, content: string): Promise<string>;
  download(key: string): Promise<string>;
  checkConnection(): Promise<boolean>;
}

// --- S3 / Spaces implementation ---

class S3Storage implements Storage {
  private client: S3Client;

  constructor() {
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: config.storage.region,
      credentials: config.storage.accessKey ? {
        accessKeyId: config.storage.accessKey,
        secretAccessKey: config.storage.secretKey,
      } : undefined,
    };
    // Custom endpoint for Spaces / MinIO
    if (config.storage.endpoint) {
      clientConfig.endpoint = config.storage.endpoint;
      clientConfig.forcePathStyle = config.storage.forcePathStyle;
    }
    this.client = new S3Client(clientConfig);
  }

  async upload(key: string, content: string): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
      Body: content,
      ContentType: 'application/json',
    }));
    return key;
  }

  async download(key: string): Promise<string> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: config.storage.bucket,
      Key: key,
    }));
    const stream = result.Body;
    if (!stream) throw new Error(`Object not found: ${key}`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.client.send(new GetObjectCommand({
        Bucket: config.storage.bucket,
        Key: '__health_check__',
      }));
      return true;
    } catch (err: unknown) {
      const code = (err as { Code?: string; name?: string })?.Code
        ?? (err as { name?: string })?.name ?? '';
      // NoSuchKey means the bucket exists and we have access
      return code === 'NoSuchKey' || code === 'NotFound';
    }
  }
}

// --- Azure Blob Storage implementation ---

class AzureBlobStorage implements Storage {
  private client: BlobServiceClient;
  private containerName: string;

  constructor() {
    this.client = BlobServiceClient.fromConnectionString(
      config.storage.azureConnectionString
    );
    this.containerName = config.storage.azureContainerName;
  }

  private async ensureContainer(): Promise<void> {
    const container = this.client.getContainerClient(this.containerName);
    await container.createIfNotExists();
  }

  async upload(key: string, content: string): Promise<string> {
    await this.ensureContainer();
    const container = this.client.getContainerClient(this.containerName);
    const blob = container.getBlockBlobClient(key);
    await blob.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: 'application/json' },
    });
    return key;
  }

  async download(key: string): Promise<string> {
    const container = this.client.getContainerClient(this.containerName);
    const blob = container.getBlockBlobClient(key);
    const response = await blob.download();
    const stream = response.readableStreamBody;
    if (!stream) throw new Error(`Blob not found: ${key}`);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  async checkConnection(): Promise<boolean> {
    try {
      const container = this.client.getContainerClient(this.containerName);
      await container.getProperties();
      return true;
    } catch (err: unknown) {
      const code = (err as { statusCode?: number })?.statusCode;
      // 404 = container doesn't exist yet, but connection is fine
      return code === 404;
    }
  }
}

export function createStorage(): Storage {
  switch (config.storage.type) {
    case 's3':
    case 'spaces':
      return new S3Storage();
    case 'azure-blob':
      return new AzureBlobStorage();
    default:
      throw new Error(`Unknown storage type: ${config.storage.type}`);
  }
}
