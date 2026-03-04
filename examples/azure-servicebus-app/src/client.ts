import {
  ServiceBusClient,
  ServiceBusMessage,
  ServiceBusSender,
  ServiceBusReceiver,
  ServiceBusReceivedMessage,
} from "@azure/service-bus";
import * as dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONNECTION_STRING = process.env.SERVICEBUS_CONNECTION_STRING;
const TOPIC_NAME = process.env.TOPIC_NAME || "order-events";
const QUEUE_NAME = process.env.QUEUE_NAME || "commands";
const OPERATION_INTERVAL = parseInt(process.env.OPERATION_INTERVAL_MS || "5000", 10);
const MAX_OPERATIONS = parseInt(process.env.MAX_OPERATIONS || "0", 10);

if (!CONNECTION_STRING) {
  console.error("❌ SERVICEBUS_CONNECTION_STRING environment variable is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EVENT_TYPES = [
  "OrderCreated",
  "OrderUpdated",
  "OrderCancelled",
  "PaymentReceived",
  "PaymentFailed",
  "RefundProcessed",
] as const;

const COMMAND_TYPES = [
  "ProcessOrder",
  "SendNotification",
  "UpdateInventory",
  "GenerateReport",
] as const;

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomOrderId(): string {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Service Bus Client Application
// ---------------------------------------------------------------------------

class ServiceBusApp {
  private client: ServiceBusClient;
  private topicSender: ServiceBusSender;
  private queueSender: ServiceBusSender;
  private operationCount = 0;
  private isShuttingDown = false;

  constructor() {
    console.log("🚀 Azure Service Bus App starting...");
    console.log(`📡 Topic: ${TOPIC_NAME}`);
    console.log(`📬 Queue: ${QUEUE_NAME}`);
    console.log(`⏱️  Interval: ${OPERATION_INTERVAL}ms`);
    console.log(`🔄 Max operations: ${MAX_OPERATIONS > 0 ? MAX_OPERATIONS : "unlimited"}`);
    console.log("----------------------------------------");

    this.client = new ServiceBusClient(CONNECTION_STRING!);
    this.topicSender = this.client.createSender(TOPIC_NAME);
    this.queueSender = this.client.createSender(QUEUE_NAME);

    this.setupGracefulShutdown();
  }

  // -----------------------------------------------------------------------
  // Graceful shutdown
  // -----------------------------------------------------------------------

  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      console.log("\n🛑 Shutting down gracefully...");
      try {
        await this.topicSender.close();
        await this.queueSender.close();
        await this.client.close();
        console.log("✅ All connections closed.");
      } catch (err) {
        console.error("⚠️  Error during shutdown:", err instanceof Error ? err.message : err);
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  // -----------------------------------------------------------------------
  // 1. Publish events to topic (pub/sub pattern)
  // -----------------------------------------------------------------------

  private async publishOrderEvent(): Promise<void> {
    const eventType = randomItem(EVENT_TYPES);
    const orderId = randomOrderId();
    const priority = eventType.includes("Failed") || eventType.includes("Cancelled") ? "high" : "normal";

    const message: ServiceBusMessage = {
      body: {
        eventType,
        orderId,
        priority,
        amount: Math.round(Math.random() * 500 * 100) / 100,
        timestamp: new Date().toISOString(),
      },
      subject: eventType,
      applicationProperties: {
        eventType,
        priority,
        source: "servicebus-app",
      },
      contentType: "application/json",
      messageId: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    };

    await this.topicSender.sendMessages(message);

    console.log(`   📤 Topic → ${eventType}`);
    console.log(`      Order: ${orderId} | Priority: ${priority}`);
  }

  // -----------------------------------------------------------------------
  // 2. Send command to queue (point-to-point pattern)
  // -----------------------------------------------------------------------

  private async sendCommand(): Promise<void> {
    const commandType = randomItem(COMMAND_TYPES);
    const orderId = randomOrderId();

    const message: ServiceBusMessage = {
      body: {
        commandType,
        orderId,
        payload: { requestedBy: "servicebus-app", timestamp: new Date().toISOString() },
      },
      subject: commandType,
      applicationProperties: {
        commandType,
      },
      contentType: "application/json",
      messageId: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    };

    await this.queueSender.sendMessages(message);

    console.log(`   📬 Queue → ${commandType}`);
    console.log(`      Order: ${orderId}`);
  }

  // -----------------------------------------------------------------------
  // 3. Peek at subscription messages (demonstrate fan-out)
  // -----------------------------------------------------------------------

  private async peekSubscription(subscriptionName: string, label: string): Promise<number> {
    let receiver: ServiceBusReceiver | undefined;
    try {
      receiver = this.client.createReceiver(TOPIC_NAME, subscriptionName, {
        receiveMode: "peekLock",
      });

      const peeked: ServiceBusReceivedMessage[] = await receiver.peekMessages(10);
      console.log(`   👁️  ${label}: ${peeked.length} message(s) pending`);

      for (const msg of peeked.slice(0, 3)) {
        const body = msg.body as Record<string, unknown>;
        console.log(`      • ${body.eventType || body.commandType || "unknown"} (${msg.messageId})`);
      }
      if (peeked.length > 3) {
        console.log(`      ... and ${peeked.length - 3} more`);
      }

      return peeked.length;
    } catch (err) {
      console.error(`   ⚠️  Could not peek ${label}:`, err instanceof Error ? err.message : err);
      return 0;
    } finally {
      if (receiver) await receiver.close();
    }
  }

  // -----------------------------------------------------------------------
  // 4. Receive and process messages from the command queue
  // -----------------------------------------------------------------------

  private async processCommands(): Promise<void> {
    let receiver: ServiceBusReceiver | undefined;
    try {
      receiver = this.client.createReceiver(QUEUE_NAME, { receiveMode: "peekLock" });
      const messages = await receiver.receiveMessages(5, { maxWaitTimeInMs: 3000 });

      if (messages.length === 0) {
        console.log("   📭 Queue: no commands to process");
        return;
      }

      console.log(`   📥 Queue: processing ${messages.length} command(s)`);
      for (const msg of messages) {
        const body = msg.body as Record<string, unknown>;
        console.log(`      ✅ Processed: ${body.commandType} (${msg.messageId})`);
        await receiver.completeMessage(msg);
      }
    } catch (err) {
      console.error("   ⚠️  Error processing commands:", err instanceof Error ? err.message : err);
    } finally {
      if (receiver) await receiver.close();
    }
  }

  // -----------------------------------------------------------------------
  // 5. Send a batch of events (batch pattern)
  // -----------------------------------------------------------------------

  private async sendEventBatch(): Promise<void> {
    const batch = await this.topicSender.createMessageBatch();
    let count = 0;

    for (let i = 0; i < 5; i++) {
      const eventType = randomItem(EVENT_TYPES);
      const msg: ServiceBusMessage = {
        body: {
          eventType,
          orderId: randomOrderId(),
          amount: Math.round(Math.random() * 500 * 100) / 100,
          timestamp: new Date().toISOString(),
        },
        subject: eventType,
        applicationProperties: { eventType, source: "batch" },
        contentType: "application/json",
      };

      if (batch.tryAddMessage(msg)) {
        count++;
      } else {
        break;
      }
    }

    await this.topicSender.sendMessages(batch);
    console.log(`   📦 Batch: sent ${count} events to topic`);
  }

  // -----------------------------------------------------------------------
  // Main operation cycle
  // -----------------------------------------------------------------------

  private async runCycle(): Promise<void> {
    this.operationCount++;
    console.log(`\n🔄 Cycle #${this.operationCount}`);
    console.log("========================================");

    // Publish individual events
    console.log("\n📡 Publishing events to topic...");
    await this.publishOrderEvent();
    await this.publishOrderEvent();

    // Send commands to queue
    console.log("\n📬 Sending commands to queue...");
    await this.sendCommand();

    // Send a batch
    console.log("\n📦 Sending event batch...");
    await this.sendEventBatch();

    // Peek at subscriptions
    console.log("\n👁️  Peeking at subscriptions...");
    await this.peekSubscription("order-processor", "Order Processor");
    await this.peekSubscription("payment-handler", "Payment Handler");
    await this.peekSubscription("audit-logger", "Audit Logger");

    // Process commands from queue
    console.log("\n📥 Processing commands...");
    await this.processCommands();

    console.log("\n----------------------------------------");
    console.log(`✅ Cycle #${this.operationCount} completed`);
  }

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------

  public async start(): Promise<void> {
    console.log("🎯 Starting Service Bus messaging demonstration...\n");

    const loop = async () => {
      if (this.isShuttingDown) return;

      try {
        await this.runCycle();
      } catch (err) {
        console.error("❌ Cycle error:", err instanceof Error ? err.message : err);
      }

      if (MAX_OPERATIONS > 0 && this.operationCount >= MAX_OPERATIONS) {
        console.log(`\n🏁 Reached max operations (${MAX_OPERATIONS}). Done.`);
        await this.topicSender.close();
        await this.queueSender.close();
        await this.client.close();
        process.exit(0);
      }

      if (!this.isShuttingDown) {
        setTimeout(loop, OPERATION_INTERVAL);
      }
    };

    await loop();
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  try {
    const app = new ServiceBusApp();
    await app.start();
  } catch (err) {
    console.error("💥 Fatal:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

if (require.main === module) {
  main().catch(console.error);
}
