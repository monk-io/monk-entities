import { AzureServiceBusEntity, AzureServiceBusDefinition, AzureServiceBusState } from "./azure-servicebus-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for Azure Service Bus Topic.
 * Configures topic properties for publish-subscribe messaging.
 * @interface TopicDefinition
 */
export interface TopicDefinition extends AzureServiceBusDefinition {
    /**
     * @description Service Bus namespace name
     */
    namespace_name: string;

    /**
     * @description Topic name (1-260 chars, alphanumeric, hyphens, underscores, periods)
     * @minLength 1
     * @maxLength 260
     */
    topic_name: string;

    /**
     * @description Maximum topic size in megabytes (1024, 2048, 3072, 4096, 5120, 10240, 20480, 40960, 81920)
     * @default 1024
     */
    max_size_in_megabytes?: number;

    /**
     * @description Default message time to live (ISO 8601 duration, e.g., PT1H, P14D)
     * @default "P14D"
     */
    default_message_time_to_live?: string;

    /**
     * @description Enable duplicate detection
     */
    requires_duplicate_detection?: boolean;

    /**
     * @description Duplicate detection history time window (ISO 8601 duration)
     */
    duplicate_detection_history_time_window?: string;

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
     * @description Support ordering of messages
     */
    support_ordering?: boolean;

    /**
     * @description Maximum subscriptions per topic (default 2000)
     */
    max_subscriptions_per_topic?: number;

    /**
     * @description Maximum message size in kilobytes (Premium tier: up to 100MB)
     */
    max_message_size_in_kilobytes?: number;
}

/**
 * State interface for Azure Service Bus Topic.
 * Contains runtime information about the created topic.
 * @interface TopicState
 */
export interface TopicState extends AzureServiceBusState {
    /**
     * @description Topic name (primary identifier)
     */
    topic_name?: string;

    /**
     * @description Namespace name
     */
    namespace_name?: string;

    /**
     * @description Topic status
     */
    status?: string;

    /**
     * @description Number of subscriptions
     */
    subscription_count?: number;

    /**
     * @description Topic size in bytes
     */
    size_in_bytes?: number;

    /**
     * @description Topic creation time
     */
    created_at?: string;

    /**
     * @description Topic last updated time
     */
    updated_at?: string;
}

/**
 * @description Azure Service Bus Topic entity.
 * Creates and manages topics within a Service Bus namespace for publish-subscribe messaging.
 * Topics allow multiple subscribers to receive copies of messages.
 *
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.topic_name` - Topic name
 * - `state.namespace_name` - Parent namespace name
 * - `state.subscription_count` - Number of subscriptions
 *
 * ## Composing with Other Entities
 * Depends on:
 * - `azure-servicebus/namespace` - Parent namespace must exist
 * Works with:
 * - `azure-servicebus/subscription` - Create subscriptions to receive messages
 */
export class Topic extends AzureServiceBusEntity<TopicDefinition, TopicState> {
    
    protected getEntityName(): string {
        return this.definition.topic_name || "Service Bus Topic";
    }

    protected getResourceType(): string {
        return "topics";
    }

    override create(): void {
        const path = this.buildTopicPath(this.definition.namespace_name, this.definition.topic_name);
        
        // Check if topic already exists
        const existsResult = this.checkResourceExistsWithStatus(path);
        
        if (existsResult.resource) {
            const existingTopic = existsResult.resource;
            const properties = existingTopic.properties as Record<string, unknown> | undefined;
            
            this.state = {
                topic_name: this.definition.topic_name,
                namespace_name: this.definition.namespace_name,
                status: typeof properties?.status === 'string' ? properties.status : undefined,
                subscription_count: typeof properties?.subscriptionCount === 'number' ? properties.subscriptionCount : undefined,
                size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : undefined,
                provisioning_state: "Succeeded",
                created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
                updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined,
                existing: true
            };
            cli.output(`✅ Service Bus topic ${this.definition.topic_name} already exists`);
            return;
        }

        // Skip creation if create_when_missing is false
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Topic ${this.definition.topic_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {}
        };

        // Add topic properties
        if (this.definition.max_size_in_megabytes !== undefined) {
            body.properties.maxSizeInMegabytes = this.definition.max_size_in_megabytes;
        }

        if (this.definition.default_message_time_to_live) {
            body.properties.defaultMessageTimeToLive = this.definition.default_message_time_to_live;
        }

        if (this.definition.requires_duplicate_detection === true) {
            body.properties.requiresDuplicateDetection = true;
        }

        if (this.definition.duplicate_detection_history_time_window) {
            body.properties.duplicateDetectionHistoryTimeWindow = this.definition.duplicate_detection_history_time_window;
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

        if (this.definition.support_ordering === true) {
            body.properties.supportOrdering = true;
        }

        if (this.definition.max_message_size_in_kilobytes !== undefined) {
            body.properties.maxMessageSizeInKilobytes = this.definition.max_message_size_in_kilobytes;
        }

        // Create the topic
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create Service Bus topic: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            topic_name: this.definition.topic_name,
            namespace_name: this.definition.namespace_name,
            status: typeof properties?.status === 'string' ? properties.status : undefined,
            subscription_count: typeof properties?.subscriptionCount === 'number' ? properties.subscriptionCount : 0,
            size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : 0,
            provisioning_state: "Succeeded",
            created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
            existing: false
        };

        cli.output(`✅ Created Azure Service Bus topic: ${this.definition.topic_name}`);
    }

    override update(): void {
        if (!this.state.topic_name) {
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

        if (this.definition.auto_delete_on_idle) {
            body.properties.autoDeleteOnIdle = this.definition.auto_delete_on_idle;
        }

        if (this.definition.enable_batched_operations !== undefined) {
            body.properties.enableBatchedOperations = this.definition.enable_batched_operations;
        }

        if (this.definition.support_ordering !== undefined) {
            body.properties.supportOrdering = this.definition.support_ordering;
        }

        if (this.definition.max_message_size_in_kilobytes !== undefined) {
            body.properties.maxMessageSizeInKilobytes = this.definition.max_message_size_in_kilobytes;
        }

        const path = this.buildTopicPath(this.definition.namespace_name, this.definition.topic_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to update Service Bus topic: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            ...this.state,
            status: typeof properties?.status === 'string' ? properties.status : this.state.status,
            subscription_count: typeof properties?.subscriptionCount === 'number' ? properties.subscriptionCount : this.state.subscription_count,
            size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : this.state.size_in_bytes,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined
        };

        cli.output(`✅ Updated Azure Service Bus topic: ${this.definition.topic_name}`);
    }

    override delete(): void {
        if (!this.state.topic_name || !this.state.namespace_name) {
            cli.output(`⚠️  No topic to delete`);
            return;
        }

        const path = this.buildTopicPath(this.state.namespace_name, this.state.topic_name);
        this.deleteResourceByPath(path, this.state.topic_name);
    }

    override checkReadiness(): boolean {
        if (!this.state.topic_name || !this.state.namespace_name) {
            if (this.definition.create_when_missing === false) {
                cli.output("Topic not created (create_when_missing is false)");
                return true;
            }
            cli.output("Topic not yet created");
            return false;
        }

        const path = this.buildTopicPath(this.state.namespace_name, this.state.topic_name);
        const existsResult = this.checkResourceExistsWithStatus(path);

        if (!existsResult.resource) {
            if (existsResult.notFound) {
                cli.output("Topic not found");
                return false;
            }
            cli.output(`Error checking topic: ${existsResult.error || 'Unknown error'}`);
            return false;
        }

        const properties = existsResult.resource.properties as Record<string, unknown> | undefined;
        const status = properties?.status as string | undefined;

        // Update state with latest info
        this.state = {
            ...this.state,
            status: status,
            subscription_count: typeof properties?.subscriptionCount === 'number' ? properties.subscriptionCount : this.state.subscription_count,
            size_in_bytes: typeof properties?.sizeInBytes === 'number' ? properties.sizeInBytes : this.state.size_in_bytes,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : this.state.updated_at
        };

        if (status === "Active") {
            cli.output("Topic is ready");
            return true;
        }

        cli.output(`Topic status: ${status || 'Unknown'}`);
        return false;
    }

    /**
     * Get detailed topic information
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📦 Service Bus Topic Information");
        cli.output("==================================================");

        const path = this.buildTopicPath(this.definition.namespace_name, this.definition.topic_name);
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to get topic info: ${response.error}`);
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
        cli.output(`   Subscription Count: ${properties?.subscriptionCount || 0}`);

        cli.output(`\n📊 Message Statistics:`);
        cli.output(`   Active Messages: ${countDetails?.activeMessageCount || 0}`);
        cli.output(`   Dead Letter Messages: ${countDetails?.deadLetterMessageCount || 0}`);
        cli.output(`   Scheduled Messages: ${countDetails?.scheduledMessageCount || 0}`);
        cli.output(`   Transfer Messages: ${countDetails?.transferMessageCount || 0}`);
        cli.output(`   Total Size (bytes): ${properties?.sizeInBytes || 0}`);

        cli.output(`\n⚙️  Configuration:`);
        cli.output(`   Max Size (MB): ${properties?.maxSizeInMegabytes}`);
        cli.output(`   Message TTL: ${this.formatDuration(properties?.defaultMessageTimeToLive as string || 'P14D')}`);

        cli.output(`\n🔧 Features:`);
        cli.output(`   Requires Duplicate Detection: ${properties?.requiresDuplicateDetection || false}`);
        cli.output(`   Enable Partitioning: ${properties?.enablePartitioning || false}`);
        cli.output(`   Enable Express: ${properties?.enableExpress || false}`);
        cli.output(`   Enable Batched Operations: ${properties?.enableBatchedOperations ?? true}`);
        cli.output(`   Support Ordering: ${properties?.supportOrdering || false}`);

        cli.output(`\n📅 Timestamps:`);
        cli.output(`   Created: ${properties?.createdAt}`);
        cli.output(`   Updated: ${properties?.updatedAt}`);
        cli.output(`   Accessed: ${properties?.accessedAt}`);

        cli.output("\n==================================================");
    }

    /**
     * List all subscriptions for this topic
     */
    @action("list-subscriptions")
    listSubscriptions(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📋 Topic Subscriptions");
        cli.output("==================================================");

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.ServiceBus/namespaces/${this.definition.namespace_name}/topics/${this.definition.topic_name}/subscriptions?api-version=${this.apiVersion}`;
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to list subscriptions: ${response.error}`);
            return;
        }

        const data = this.parseResponseBody(response) as Record<string, unknown> | null;
        const subscriptions = data?.value as Array<Record<string, unknown>> | undefined;

        if (!subscriptions || subscriptions.length === 0) {
            cli.output("\nNo subscriptions found for this topic.");
            cli.output("\n==================================================");
            return;
        }

        cli.output(`\nFound ${subscriptions.length} subscription(s):\n`);

        for (const sub of subscriptions) {
            const props = sub.properties as Record<string, unknown> | undefined;
            const countDetails = props?.countDetails as Record<string, unknown> | undefined;
            cli.output(`📁 Subscription: ${sub.name}`);
            cli.output(`   Status: ${props?.status}`);
            cli.output(`   Active Messages: ${countDetails?.activeMessageCount || 0}`);
            cli.output(`   Dead Letter Messages: ${countDetails?.deadLetterMessageCount || 0}`);
            cli.output(`   Max Delivery Count: ${props?.maxDeliveryCount}`);
            cli.output("");
        }

        cli.output("==================================================");
    }

    /**
     * Get topic runtime properties (message counts, etc.)
     */
    @action("get-runtime-info")
    getRuntimeInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📊 Topic Runtime Information");
        cli.output("==================================================");

        const path = this.buildTopicPath(this.definition.namespace_name, this.definition.topic_name);
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

        cli.output(`\n📊 Subscriptions:`);
        cli.output(`   Count: ${properties?.subscriptionCount || 0}`);

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
