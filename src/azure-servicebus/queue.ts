import { AzureServiceBusEntity, AzureServiceBusDefinition, AzureServiceBusState } from "./azure-servicebus-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for Azure Service Bus Queue.
 * Configures queue properties including message handling, TTL, and dead-lettering.
 * @interface QueueDefinition
 */
export interface QueueDefinition extends AzureServiceBusDefinition {
    /**
     * @description Service Bus namespace name
     */
    namespace_name: string;

    /**
     * @description Queue name (1-260 chars, alphanumeric, hyphens, underscores, periods)
     * @minLength 1
     * @maxLength 260
     */
    queue_name: string;

    /**
     * @description Maximum queue size in megabytes (1024, 2048, 3072, 4096, 5120, 10240, 20480, 40960, 81920)
     * @default 1024
     */
    max_size_in_megabytes?: number;

    /**
     * @description Default message time to live (ISO 8601 duration, e.g., PT1H, P14D)
     * @default "P14D"
     */
    default_message_time_to_live?: string;

    /**
     * @description Lock duration for peek-lock (ISO 8601 duration, max PT5M)
     * @default "PT1M"
     */
    lock_duration?: string;

    /**
     * @description Enable duplicate detection
     */
    requires_duplicate_detection?: boolean;

    /**
     * @description Duplicate detection history time window (ISO 8601 duration)
     */
    duplicate_detection_history_time_window?: string;

    /**
     * @description Enable dead lettering on message expiration
     */
    dead_lettering_on_message_expiration?: boolean;

    /**
     * @description Maximum delivery count before dead-lettering
     * @default 10
     */
    max_delivery_count?: number;

    /**
     * @description Enable session support for ordered message processing
     */
    requires_session?: boolean;

    /**
     * @description Enable partitioning for high throughput
     */
    enable_partitioning?: boolean;

    /**
     * @description Enable express entities (in-memory, not persisted)
     */
    enable_express?: boolean;

    /**
     * @description Auto-delete idle duration (ISO 8601 duration, min P5M)
     */
    auto_delete_on_idle?: string;

    /**
     * @description Enable batched operations
     * @default true
     */
    enable_batched_operations?: boolean;

    /**
     * @description Forward messages to another queue/topic
     */
    forward_to?: string;

    /**
     * @description Forward dead-lettered messages to another queue/topic
     */
    forward_dead_lettered_messages_to?: string;
}

/**
 * State interface for Azure Service Bus Queue.
 * Contains runtime information about the created queue.
 * @interface QueueState
 */
export interface QueueState extends AzureServiceBusState {
    /**
     * @description Queue name (primary identifier)
     */
    queue_name?: string;

    /**
     * @description Namespace name
     */
    namespace_name?: string;

    /**
     * @description Queue status
     */
    status?: string;

    /**
     * @description Current message count
     */
    message_count?: number;

    /**
     * @description Queue size in bytes
     */
    size_in_bytes?: number;

    /**
     * @description Queue creation time
     */
    created_at?: string;

    /**
     * @description Queue last updated time
     */
    updated_at?: string;
}

/**
 * @description Azure Service Bus Queue entity.
 * Creates and manages queues within a Service Bus namespace for point-to-point messaging.
 * Supports features like sessions, dead-lettering, and message forwarding.
 *
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.queue_name` - Queue name
 * - `state.namespace_name` - Parent namespace name
 * - `state.message_count` - Current message count
 *
 * ## Composing with Other Entities
 * Depends on:
 * - `azure-servicebus/namespace` - Parent namespace must exist
 */
export class Queue extends AzureServiceBusEntity<QueueDefinition, QueueState> {
    
    protected getEntityName(): string {
        return this.definition.queue_name || "Service Bus Queue";
    }

    protected getResourceType(): string {
        return "queues";
    }

    override create(): void {
        const path = this.buildQueuePath(this.definition.namespace_name, this.definition.queue_name);
        
        // Check if queue already exists
        const existsResult = this.checkResourceExistsWithStatus(path);
        
        if (existsResult.resource) {
            const existingQueue = existsResult.resource;
            const properties = existingQueue.properties as Record<string, unknown> | undefined;
            
            this.state = {
                queue_name: this.definition.queue_name,
                namespace_name: this.definition.namespace_name,
                status: typeof properties?.status === 'string' ? properties.status : undefined,
                message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : undefined,
                size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : undefined,
                provisioning_state: "Succeeded",
                created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
                updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined,
                existing: true
            };
            cli.output(`✅ Service Bus queue ${this.definition.queue_name} already exists`);
            return;
        }

        // Skip creation if create_when_missing is false
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Queue ${this.definition.queue_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {}
        };

        // Add queue properties
        if (this.definition.max_size_in_megabytes !== undefined) {
            body.properties.maxSizeInMegabytes = this.definition.max_size_in_megabytes;
        }

        if (this.definition.default_message_time_to_live) {
            body.properties.defaultMessageTimeToLive = this.definition.default_message_time_to_live;
        }

        if (this.definition.lock_duration) {
            body.properties.lockDuration = this.definition.lock_duration;
        }

        if (this.definition.requires_duplicate_detection === true) {
            body.properties.requiresDuplicateDetection = true;
        }

        if (this.definition.duplicate_detection_history_time_window) {
            body.properties.duplicateDetectionHistoryTimeWindow = this.definition.duplicate_detection_history_time_window;
        }

        if (this.definition.dead_lettering_on_message_expiration === true) {
            body.properties.deadLetteringOnMessageExpiration = true;
        }

        if (this.definition.max_delivery_count !== undefined) {
            body.properties.maxDeliveryCount = this.definition.max_delivery_count;
        }

        if (this.definition.requires_session === true) {
            body.properties.requiresSession = true;
        }

        if (this.definition.enable_partitioning === true) {
            body.properties.enablePartitioning = true;
        }

        if (this.definition.enable_express === true) {
            body.properties.enableExpress = true;
        }

        if (this.definition.auto_delete_on_idle) {
            body.properties.autoDeleteOnIdle = this.definition.auto_delete_on_idle;
        }

        if (this.definition.enable_batched_operations !== undefined) {
            body.properties.enableBatchedOperations = this.definition.enable_batched_operations;
        }

        if (this.definition.forward_to) {
            body.properties.forwardTo = this.definition.forward_to;
        }

        if (this.definition.forward_dead_lettered_messages_to) {
            body.properties.forwardDeadLetteredMessagesTo = this.definition.forward_dead_lettered_messages_to;
        }

        // Create the queue
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create Service Bus queue: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            queue_name: this.definition.queue_name,
            namespace_name: this.definition.namespace_name,
            status: typeof properties?.status === 'string' ? properties.status : undefined,
            message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : 0,
            size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : 0,
            provisioning_state: "Succeeded",
            created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
            existing: false
        };

        cli.output(`✅ Created Azure Service Bus queue: ${this.definition.queue_name}`);
    }

    override update(): void {
        if (!this.state.queue_name) {
            this.create();
            return;
        }

        // Prepare update body (note: some properties cannot be changed after creation)
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {}
        };

        // Updatable properties
        if (this.definition.max_size_in_megabytes !== undefined) {
            body.properties.maxSizeInMegabytes = this.definition.max_size_in_megabytes;
        }

        if (this.definition.default_message_time_to_live) {
            body.properties.defaultMessageTimeToLive = this.definition.default_message_time_to_live;
        }

        if (this.definition.lock_duration) {
            body.properties.lockDuration = this.definition.lock_duration;
        }

        if (this.definition.dead_lettering_on_message_expiration !== undefined) {
            body.properties.deadLetteringOnMessageExpiration = this.definition.dead_lettering_on_message_expiration;
        }

        if (this.definition.max_delivery_count !== undefined) {
            body.properties.maxDeliveryCount = this.definition.max_delivery_count;
        }

        if (this.definition.auto_delete_on_idle) {
            body.properties.autoDeleteOnIdle = this.definition.auto_delete_on_idle;
        }

        if (this.definition.enable_batched_operations !== undefined) {
            body.properties.enableBatchedOperations = this.definition.enable_batched_operations;
        }

        if (this.definition.forward_to) {
            body.properties.forwardTo = this.definition.forward_to;
        }

        if (this.definition.forward_dead_lettered_messages_to) {
            body.properties.forwardDeadLetteredMessagesTo = this.definition.forward_dead_lettered_messages_to;
        }

        const path = this.buildQueuePath(this.definition.namespace_name, this.definition.queue_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to update Service Bus queue: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            ...this.state,
            status: typeof properties?.status === 'string' ? properties.status : this.state.status,
            message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : this.state.message_count,
            size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : this.state.size_in_bytes,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined
        };

        cli.output(`✅ Updated Azure Service Bus queue: ${this.definition.queue_name}`);
    }

    override delete(): void {
        if (!this.state.queue_name || !this.state.namespace_name) {
            cli.output(`⚠️  No queue to delete`);
            return;
        }

        const path = this.buildQueuePath(this.state.namespace_name, this.state.queue_name);
        this.deleteResourceByPath(path, this.state.queue_name);
    }

    override checkReadiness(): boolean {
        if (!this.state.queue_name || !this.state.namespace_name) {
            if (this.definition.create_when_missing === false) {
                cli.output("Queue not created (create_when_missing is false)");
                return true;
            }
            cli.output("Queue not yet created");
            return false;
        }

        const path = this.buildQueuePath(this.state.namespace_name, this.state.queue_name);
        const existsResult = this.checkResourceExistsWithStatus(path);

        if (!existsResult.resource) {
            if (existsResult.notFound) {
                cli.output("Queue not found");
                return false;
            }
            cli.output(`Error checking queue: ${existsResult.error || 'Unknown error'}`);
            return false;
        }

        const properties = existsResult.resource.properties as Record<string, unknown> | undefined;
        const status = properties?.status as string | undefined;

        // Update state with latest info
        this.state = {
            ...this.state,
            status: status,
            message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : this.state.message_count,
            size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : this.state.size_in_bytes,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : this.state.updated_at
        };

        if (status === "Active") {
            cli.output("Queue is ready");
            return true;
        }

        cli.output(`Queue status: ${status || 'Unknown'}`);
        return false;
    }

    /**
     * Get detailed queue information
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📦 Service Bus Queue Information");
        cli.output("==================================================");

        const path = this.buildQueuePath(this.definition.namespace_name, this.definition.queue_name);
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to get queue info: ${response.error}`);
            return;
        }

        const data = this.parseResponseBody(response) as Record<string, unknown> | null;
        if (!data) {
            cli.output("❌ No data returned");
            return;
        }

        const properties = data.properties as Record<string, unknown> | undefined;
        const countDetails = properties?.countDetails as Record<string, unknown> | undefined;

        cli.output(`\n📋 Basic Information:`);
        cli.output(`   Name: ${data.name}`);
        cli.output(`   Namespace: ${this.definition.namespace_name}`);
        cli.output(`   Status: ${properties?.status}`);

        cli.output(`\n📊 Message Statistics:`);
        cli.output(`   Active Messages: ${countDetails?.activeMessageCount || 0}`);
        cli.output(`   Dead Letter Messages: ${countDetails?.deadLetterMessageCount || 0}`);
        cli.output(`   Scheduled Messages: ${countDetails?.scheduledMessageCount || 0}`);
        cli.output(`   Transfer Messages: ${countDetails?.transferMessageCount || 0}`);
        cli.output(`   Transfer Dead Letter: ${countDetails?.transferDeadLetterMessageCount || 0}`);
        cli.output(`   Total Size (bytes): ${properties?.sizeInBytes || 0}`);

        cli.output(`\n⚙️  Configuration:`);
        cli.output(`   Max Size (MB): ${properties?.maxSizeInMegabytes}`);
        cli.output(`   Message TTL: ${this.formatDuration(properties?.defaultMessageTimeToLive as string || 'P14D')}`);
        cli.output(`   Lock Duration: ${this.formatDuration(properties?.lockDuration as string || 'PT1M')}`);
        cli.output(`   Max Delivery Count: ${properties?.maxDeliveryCount}`);

        cli.output(`\n🔧 Features:`);
        cli.output(`   Requires Session: ${properties?.requiresSession || false}`);
        cli.output(`   Requires Duplicate Detection: ${properties?.requiresDuplicateDetection || false}`);
        cli.output(`   Dead Lettering on Expiration: ${properties?.deadLetteringOnMessageExpiration || false}`);
        cli.output(`   Enable Partitioning: ${properties?.enablePartitioning || false}`);
        cli.output(`   Enable Express: ${properties?.enableExpress || false}`);
        cli.output(`   Enable Batched Operations: ${properties?.enableBatchedOperations || true}`);

        if (properties?.forwardTo) {
            cli.output(`\n➡️  Forwarding:`);
            cli.output(`   Forward To: ${properties.forwardTo}`);
        }
        if (properties?.forwardDeadLetteredMessagesTo) {
            cli.output(`   Forward Dead Letters To: ${properties.forwardDeadLetteredMessagesTo}`);
        }

        cli.output(`\n📅 Timestamps:`);
        cli.output(`   Created: ${properties?.createdAt}`);
        cli.output(`   Updated: ${properties?.updatedAt}`);
        cli.output(`   Accessed: ${properties?.accessedAt}`);

        cli.output("\n==================================================");
    }

    /**
     * Purge all messages from the queue (Premium tier only)
     */
    @action("purge-messages")
    purgeMessages(_args?: Args): void {
        cli.output("==================================================");
        cli.output("🗑️  Purging Queue Messages");
        cli.output("==================================================");

        // Note: This is a Premium tier feature
        cli.output("\n⚠️  Note: Purge is only available for Premium tier namespaces.");
        cli.output("For Standard/Basic tiers, messages must be received and completed.");

        cli.output("\n==================================================");
    }

    /**
     * Get queue runtime properties (message counts, etc.)
     */
    @action("get-runtime-info")
    getRuntimeInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📊 Queue Runtime Information");
        cli.output("==================================================");

        const path = this.buildQueuePath(this.definition.namespace_name, this.definition.queue_name);
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to get runtime info: ${response.error}`);
            return;
        }

        const data = this.parseResponseBody(response) as Record<string, unknown> | null;
        if (!data) {
            cli.output("❌ No data returned");
            return;
        }

        const properties = data.properties as Record<string, unknown> | undefined;
        const countDetails = properties?.countDetails as Record<string, unknown> | undefined;

        cli.output(`\n📬 Message Counts:`);
        cli.output(`   Active: ${countDetails?.activeMessageCount || 0}`);
        cli.output(`   Dead Letter: ${countDetails?.deadLetterMessageCount || 0}`);
        cli.output(`   Scheduled: ${countDetails?.scheduledMessageCount || 0}`);
        cli.output(`   Transfer: ${countDetails?.transferMessageCount || 0}`);
        cli.output(`   Transfer Dead Letter: ${countDetails?.transferDeadLetterMessageCount || 0}`);

        cli.output(`\n💾 Storage:`);
        cli.output(`   Size (bytes): ${properties?.sizeInBytes || 0}`);
        cli.output(`   Max Size (MB): ${properties?.maxSizeInMegabytes}`);

        cli.output(`\n📅 Access Times:`);
        cli.output(`   Created: ${properties?.createdAt}`);
        cli.output(`   Updated: ${properties?.updatedAt}`);
        cli.output(`   Last Accessed: ${properties?.accessedAt}`);

        cli.output("\n==================================================");
    }
}
