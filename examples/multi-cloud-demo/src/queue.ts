import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { ServiceBusClient, ServiceBusReceiver, ServiceBusSender } from '@azure/service-bus';
import { v1 as PubSubV1 } from '@google-cloud/pubsub';
import { config } from './config';
import { TaskMessage } from './types';
import { getPool, claimPendingTask } from './db';

export interface QueueMessage {
  taskId: string;
  title: string;
  payload: string;
  receiptHandle?: string;  // SQS
}

export interface Queue {
  send(message: TaskMessage): Promise<void>;
  receive(): Promise<QueueMessage | null>;
  ack(message: QueueMessage): Promise<void>;
  checkConnection(): Promise<boolean>;
}

// --- SQS implementation ---

class SQSQueue implements Queue {
  private client: SQSClient;

  constructor() {
    this.client = new SQSClient({
      region: config.queue.sqsRegion,
      credentials: config.queue.awsAccessKey ? {
        accessKeyId: config.queue.awsAccessKey,
        secretAccessKey: config.queue.awsSecretKey,
      } : undefined,
    });
  }

  async send(message: TaskMessage): Promise<void> {
    await this.client.send(new SendMessageCommand({
      QueueUrl: config.queue.sqsUrl,
      MessageBody: JSON.stringify(message),
    }));
  }

  async receive(): Promise<QueueMessage | null> {
    const result = await this.client.send(new ReceiveMessageCommand({
      QueueUrl: config.queue.sqsUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 5,
    }));
    const msg = result.Messages?.[0];
    if (!msg?.Body) return null;
    const body = JSON.parse(msg.Body) as TaskMessage;
    return { ...body, receiptHandle: msg.ReceiptHandle };
  }

  async ack(message: QueueMessage): Promise<void> {
    if (!message.receiptHandle) return;
    await this.client.send(new DeleteMessageCommand({
      QueueUrl: config.queue.sqsUrl,
      ReceiptHandle: message.receiptHandle,
    }));
  }

  async checkConnection(): Promise<boolean> {
    try {
      await this.client.send(new ReceiveMessageCommand({
        QueueUrl: config.queue.sqsUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 0,
      }));
      return true;
    } catch {
      return false;
    }
  }
}

// --- DB polling implementation (DigitalOcean / no native queue) ---

class DbPollingQueue implements Queue {
  async send(_message: TaskMessage): Promise<void> {
    // Tasks are inserted directly into DB by the API layer;
    // db queue type reads directly from the tasks table
  }

  async receive(): Promise<QueueMessage | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const task = await claimPendingTask(client);
      await client.query('COMMIT');
      if (!task) return null;
      return { taskId: task.id, title: task.title, payload: task.payload };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async ack(_message: QueueMessage): Promise<void> {
    // Status is already updated to 'processing' by claimPendingTask;
    // final status update happens in the worker after processing
  }

  async checkConnection(): Promise<boolean> {
    try {
      await getPool().query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}

// --- GCP Pub/Sub implementation ---

class PubSubQueue implements Queue {
  private publisher: PubSubV1.PublisherClient;
  private subscriber: PubSubV1.SubscriberClient;
  private topicName: string;
  private subscriptionName: string;

  constructor() {
    const credJson = config.queue.gcpCredentialsJson;
    const credentials = credJson ? JSON.parse(credJson) : undefined;
    this.publisher = new PubSubV1.PublisherClient({ credentials });
    this.subscriber = new PubSubV1.SubscriberClient({ credentials });
    this.topicName = config.queue.pubsubTopic;
    this.subscriptionName = config.queue.pubsubSubscription;
  }

  async send(message: TaskMessage): Promise<void> {
    await this.publisher.publish({
      topic: this.topicName,
      messages: [{ data: Buffer.from(JSON.stringify(message)) }],
    });
  }

  async receive(): Promise<QueueMessage | null> {
    const [response] = await this.subscriber.pull({
      subscription: this.subscriptionName,
      maxMessages: 1,
    });
    const msgs = response.receivedMessages;
    if (!msgs?.length) return null;
    const msg = msgs[0];
    const data = Buffer.from(msg.message!.data as Uint8Array).toString('utf-8');
    const body = JSON.parse(data) as TaskMessage;
    return { ...body, receiptHandle: msg.ackId! };
  }

  async ack(message: QueueMessage): Promise<void> {
    if (!message.receiptHandle) return;
    await this.subscriber.acknowledge({
      subscription: this.subscriptionName,
      ackIds: [message.receiptHandle],
    });
  }

  async checkConnection(): Promise<boolean> {
    try {
      // Pull with maxMessages: 1; empty result is acceptable — just proves auth works
      await this.subscriber.pull({ subscription: this.subscriptionName, maxMessages: 1 });
      return true;
    } catch (err) {
      console.warn('PubSub checkConnection failed:', (err as Error).message);
      return false;
    }
  }
}

// --- ServiceBus improved ack ---
// Simple wrapper that tracks received messages for proper ack
class ServiceBusQueueV2 implements Queue {
  private client: ServiceBusClient;
  private sender: ServiceBusSender | null = null;
  private receiver: ServiceBusReceiver | null = null;
  private pendingMessages: Map<string, import('@azure/service-bus').ServiceBusReceivedMessage> = new Map();

  constructor() {
    this.client = new ServiceBusClient(config.queue.serviceBusConnectionString);
  }

  private getSender(): ServiceBusSender {
    if (!this.sender) {
      this.sender = this.client.createSender(config.queue.serviceBusQueueName);
    }
    return this.sender;
  }

  private getReceiver(): ServiceBusReceiver {
    if (!this.receiver) {
      this.receiver = this.client.createReceiver(config.queue.serviceBusQueueName);
    }
    return this.receiver;
  }

  async send(message: TaskMessage): Promise<void> {
    await this.getSender().sendMessages({ body: message });
  }

  async receive(): Promise<QueueMessage | null> {
    const messages = await this.getReceiver().receiveMessages(1, { maxWaitTimeInMs: 5000 });
    if (messages.length === 0) return null;
    const msg = messages[0];
    const body = msg.body as TaskMessage;
    if (msg.lockToken) {
      this.pendingMessages.set(msg.lockToken, msg);
    }
    return { ...body, receiptHandle: msg.lockToken };
  }

  async ack(message: QueueMessage): Promise<void> {
    const lockToken = message.receiptHandle;
    if (!lockToken) return;
    const sbMsg = this.pendingMessages.get(lockToken);
    if (sbMsg) {
      await this.getReceiver().completeMessage(sbMsg);
      this.pendingMessages.delete(lockToken);
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const msgs = await this.getReceiver().receiveMessages(0, { maxWaitTimeInMs: 1000 });
      void msgs;
      return true;
    } catch {
      return false;
    }
  }
}

export function createQueue(): Queue {
  switch (config.queue.type) {
    case 'sqs':
      return new SQSQueue();
    case 'servicebus':
      return new ServiceBusQueueV2();
    case 'db':
      return new DbPollingQueue();
    case 'pubsub':
      return new PubSubQueue();
    default:
      throw new Error(`Unknown queue type: ${config.queue.type}`);
  }
}
