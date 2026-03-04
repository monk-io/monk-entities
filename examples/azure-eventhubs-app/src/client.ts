import {
  EventHubProducerClient,
  EventHubConsumerClient,
  EventData,
  ReceivedEventData,
  PartitionContext,
  earliestEventPosition,
} from "@azure/event-hubs";
import * as dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONNECTION_STRING = process.env.EVENTHUBS_CONNECTION_STRING;
const TELEMETRY_HUB = process.env.TELEMETRY_HUB_NAME || "telemetry";
const ALERTS_HUB = process.env.ALERTS_HUB_NAME || "alerts";
const CONSUMER_GROUP = process.env.CONSUMER_GROUP || "realtime-dashboard";
const OPERATION_INTERVAL = parseInt(process.env.OPERATION_INTERVAL_MS || "3000", 10);
const MAX_OPERATIONS = parseInt(process.env.MAX_OPERATIONS || "0", 10);

if (!CONNECTION_STRING) {
  console.error("❌ EVENTHUBS_CONNECTION_STRING environment variable is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEVICE_IDS = ["sensor-001", "sensor-002", "sensor-003", "sensor-004", "sensor-005"];
const ALERT_LEVELS = ["warning", "critical", "info"] as const;
const METRIC_TYPES = ["temperature", "humidity", "pressure", "cpu_usage", "memory_usage"] as const;

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

interface TelemetryEvent {
  deviceId: string;
  metricType: string;
  value: number;
  unit: string;
  timestamp: string;
}

interface AlertEvent {
  alertId: string;
  deviceId: string;
  level: string;
  message: string;
  metricType: string;
  threshold: number;
  actualValue: number;
  timestamp: string;
}

function generateTelemetry(): TelemetryEvent {
  const metricType = randomItem(METRIC_TYPES);
  const units: Record<string, [string, number, number]> = {
    temperature: ["°C", 15, 85],
    humidity: ["%", 20, 95],
    pressure: ["hPa", 950, 1050],
    cpu_usage: ["%", 0, 100],
    memory_usage: ["%", 10, 99],
  };
  const [unit, min, max] = units[metricType];
  return {
    deviceId: randomItem(DEVICE_IDS),
    metricType,
    value: randomBetween(min, max),
    unit,
    timestamp: new Date().toISOString(),
  };
}

function generateAlert(): AlertEvent {
  const metricType = randomItem(METRIC_TYPES);
  const level = randomItem(ALERT_LEVELS);
  const threshold = metricType === "temperature" ? 80 : 90;
  const actualValue = randomBetween(threshold, threshold + 20);
  return {
    alertId: `ALT-${Date.now().toString(36).toUpperCase()}`,
    deviceId: randomItem(DEVICE_IDS),
    level,
    message: `${metricType} exceeded threshold on device`,
    metricType,
    threshold,
    actualValue,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Event Hubs Streaming Application
// ---------------------------------------------------------------------------

class EventHubsApp {
  private telemetryProducer: EventHubProducerClient;
  private alertsProducer: EventHubProducerClient;
  private consumer: EventHubConsumerClient | null = null;
  private operationCount = 0;
  private isShuttingDown = false;
  private receivedCount = 0;

  constructor() {
    console.log("🚀 Azure Event Hubs App starting...");
    console.log(`📡 Telemetry Hub: ${TELEMETRY_HUB}`);
    console.log(`🚨 Alerts Hub: ${ALERTS_HUB}`);
    console.log(`👥 Consumer Group: ${CONSUMER_GROUP}`);
    console.log(`⏱️  Interval: ${OPERATION_INTERVAL}ms`);
    console.log(`🔄 Max operations: ${MAX_OPERATIONS > 0 ? MAX_OPERATIONS : "unlimited"}`);
    console.log("----------------------------------------");

    this.telemetryProducer = new EventHubProducerClient(CONNECTION_STRING!, TELEMETRY_HUB);
    this.alertsProducer = new EventHubProducerClient(CONNECTION_STRING!, ALERTS_HUB);

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
        if (this.consumer) await this.consumer.close();
        await this.telemetryProducer.close();
        await this.alertsProducer.close();
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
  // 1. Send telemetry events (high-throughput batch)
  // -----------------------------------------------------------------------

  private async sendTelemetryBatch(): Promise<void> {
    const batch = await this.telemetryProducer.createBatch();
    let count = 0;

    for (let i = 0; i < 10; i++) {
      const telemetry = generateTelemetry();
      const event: EventData = {
        body: telemetry,
        properties: {
          deviceId: telemetry.deviceId,
          metricType: telemetry.metricType,
          source: "eventhubs-app",
        },
      };

      if (batch.tryAdd(event)) {
        count++;
      } else {
        break;
      }
    }

    await this.telemetryProducer.sendBatch(batch);
    console.log(`   📡 Telemetry: sent ${count} events (batch size: ${batch.sizeInBytes} bytes)`);
  }

  // -----------------------------------------------------------------------
  // 2. Send alert events (lower volume, individual sends)
  // -----------------------------------------------------------------------

  private async sendAlerts(): Promise<void> {
    // Only send alerts ~40% of the time to simulate realistic patterns
    if (Math.random() > 0.4) {
      console.log("   🚨 Alerts: no alerts this cycle (all clear)");
      return;
    }

    const alertCount = Math.floor(Math.random() * 3) + 1;
    const batch = await this.alertsProducer.createBatch();
    let count = 0;

    for (let i = 0; i < alertCount; i++) {
      const alert = generateAlert();
      const event: EventData = {
        body: alert,
        properties: {
          alertId: alert.alertId,
          level: alert.level,
          deviceId: alert.deviceId,
        },
      };

      if (batch.tryAdd(event)) {
        count++;
      }
    }

    await this.alertsProducer.sendBatch(batch);

    for (let i = 0; i < count; i++) {
      const alert = generateAlert();
      const levelIcon = alert.level === "critical" ? "🔴" : alert.level === "warning" ? "🟡" : "🔵";
      console.log(`   🚨 Alert: ${levelIcon} ${alert.level} - ${alert.deviceId} (${alert.metricType}: ${alert.actualValue})`);
    }
  }

  // -----------------------------------------------------------------------
  // 3. Send events to specific partitions (partition key routing)
  // -----------------------------------------------------------------------

  private async sendPartitionedEvents(): Promise<void> {
    const batch = await this.telemetryProducer.createBatch({
      partitionKey: randomItem(DEVICE_IDS),
    });

    let count = 0;
    for (let i = 0; i < 5; i++) {
      const telemetry = generateTelemetry();
      const event: EventData = {
        body: telemetry,
        properties: { deviceId: telemetry.deviceId, metricType: telemetry.metricType },
      };
      if (batch.tryAdd(event)) count++;
    }

    await this.telemetryProducer.sendBatch(batch);
    console.log(`   🔀 Partitioned: sent ${count} events with partition key`);
  }

  // -----------------------------------------------------------------------
  // 4. Get Event Hub runtime info (partition details)
  // -----------------------------------------------------------------------

  private async getHubInfo(): Promise<void> {
    const telemetryInfo = await this.telemetryProducer.getEventHubProperties();
    const alertsInfo = await this.alertsProducer.getEventHubProperties();

    console.log(`   📊 Telemetry Hub: ${telemetryInfo.partitionIds.length} partitions [${telemetryInfo.partitionIds.join(", ")}]`);
    console.log(`   📊 Alerts Hub: ${alertsInfo.partitionIds.length} partitions [${alertsInfo.partitionIds.join(", ")}]`);

    // Get partition info for first partition of telemetry hub
    const partitionInfo = await this.telemetryProducer.getPartitionProperties(telemetryInfo.partitionIds[0]);
    console.log(`   📊 Partition ${partitionInfo.partitionId}: seq ${partitionInfo.lastEnqueuedSequenceNumber}, offset ${partitionInfo.lastEnqueuedOffset}`);
  }

  // -----------------------------------------------------------------------
  // 5. Receive events (short burst from consumer group)
  // -----------------------------------------------------------------------

  private async receiveEvents(): Promise<void> {
    return new Promise<void>((resolve) => {
      const consumer = new EventHubConsumerClient(
        CONSUMER_GROUP,
        CONNECTION_STRING!,
        TELEMETRY_HUB,
      );

      let received = 0;
      const maxReceive = 10;
      const timeout = setTimeout(async () => {
        await consumer.close();
        if (received === 0) {
          console.log("   📥 Consumer: no new events (timeout)");
        }
        resolve();
      }, 5000);

      const subscription = consumer.subscribe(
        {
          processEvents: async (events: ReceivedEventData[], context: PartitionContext) => {
            for (const event of events) {
              received++;
              this.receivedCount++;
              const body = event.body as TelemetryEvent;
              console.log(
                `   📥 Partition ${context.partitionId}: ${body.deviceId} → ${body.metricType}=${body.value}${body.unit}`,
              );
              if (received >= maxReceive) {
                clearTimeout(timeout);
                await subscription.close();
                await consumer.close();
                resolve();
                return;
              }
            }
          },
          processError: async (err: Error) => {
            console.error(`   ⚠️  Consumer error: ${err.message}`);
          },
        },
        { startPosition: earliestEventPosition },
      );
    });
  }

  // -----------------------------------------------------------------------
  // Main operation cycle
  // -----------------------------------------------------------------------

  private async runCycle(): Promise<void> {
    this.operationCount++;
    console.log(`\n🔄 Cycle #${this.operationCount}`);
    console.log("========================================");

    // Hub info (first cycle only)
    if (this.operationCount === 1) {
      console.log("\n📊 Event Hub information...");
      await this.getHubInfo();
    }

    // Send telemetry batch
    console.log("\n📡 Sending telemetry...");
    await this.sendTelemetryBatch();

    // Send partitioned events
    console.log("\n🔀 Sending partitioned events...");
    await this.sendPartitionedEvents();

    // Send alerts
    console.log("\n🚨 Checking for alerts...");
    await this.sendAlerts();

    // Receive events
    console.log("\n📥 Receiving events...");
    await this.receiveEvents();

    console.log("\n----------------------------------------");
    console.log(`✅ Cycle #${this.operationCount} completed (total received: ${this.receivedCount})`);
  }

  // -----------------------------------------------------------------------
  // Start
  // -----------------------------------------------------------------------

  public async start(): Promise<void> {
    console.log("🎯 Starting Event Hubs streaming demonstration...\n");

    const loop = async () => {
      if (this.isShuttingDown) return;

      try {
        await this.runCycle();
      } catch (err) {
        console.error("❌ Cycle error:", err instanceof Error ? err.message : err);
      }

      if (MAX_OPERATIONS > 0 && this.operationCount >= MAX_OPERATIONS) {
        console.log(`\n🏁 Reached max operations (${MAX_OPERATIONS}). Done.`);
        await this.telemetryProducer.close();
        await this.alertsProducer.close();
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
    const app = new EventHubsApp();
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
