import { AzureServiceBusEntity, AzureServiceBusDefinition, AzureServiceBusState } from "./azure-servicebus-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for Azure Service Bus Subscription.
 * Configures subscription properties for receiving messages from a topic.
 * @interface SubscriptionDefinition
 */
export interface SubscriptionDefinition extends AzureServiceBusDefinition {
    /**
     * @description Service Bus namespace name
     */
    namespace_name: string;

    /**
     * @description Topic name
     */
    topic_name: string;

    /**
     * @description Subscription name (1-50 chars, alphanumeric, hyphens, underscores)
     * @minLength 1
     * @maxLength 50
     */
    subscription_name: string;

    /**
     * @description Default message time to live (ISO 8601 duration, e.g., PT1H, P14D)
     */
    default_message_time_to_live?: string;

    /**
     * @description Lock duration for peek-lock (ISO 8601 duration, max PT5M)
     * @default "PT1M"
     */
    lock_duration?: string;

    /**
     * @description Enable dead lettering on message expiration
     */
    dead_lettering_on_message_expiration?: boolean;

    /**
     * @description Enable dead lettering on filter evaluation exceptions
     */
    dead_lettering_on_filter_evaluation_exceptions?: boolean;

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

    /**
     * @description SQL filter rule for the subscription (default rule)
     */
    default_rule_filter?: string;

    /**
     * @description SQL action for the default rule
     */
    default_rule_action?: string;
}

/**
 * State interface for Azure Service Bus Subscription.
 * Contains runtime information about the created subscription.
 * @interface SubscriptionState
 */
export interface SubscriptionState extends AzureServiceBusState {
    /**
     * @description Subscription name (primary identifier)
     */
    subscription_name?: string;

    /**
     * @description Topic name
     */
    topic_name?: string;

    /**
     * @description Namespace name
     */
    namespace_name?: string;

    /**
     * @description Subscription status
     */
    status?: string;

    /**
     * @description Current message count
     */
    message_count?: number;

    /**
     * @description Subscription creation time
     */
    created_at?: string;

    /**
     * @description Subscription last updated time
     */
    updated_at?: string;
}

/**
 * @description Azure Service Bus Subscription entity.
 * Creates and manages subscriptions within a Service Bus topic for receiving messages.
 * Subscriptions can filter messages using SQL-like rules.
 *
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.subscription_name` - Subscription name
 * - `state.topic_name` - Parent topic name
 * - `state.namespace_name` - Parent namespace name
 * - `state.message_count` - Current message count
 *
 * ## Composing with Other Entities
 * Depends on:
 * - `azure-servicebus/namespace` - Parent namespace must exist
 * - `azure-servicebus/topic` - Parent topic must exist
 */
export class Subscription extends AzureServiceBusEntity<SubscriptionDefinition, SubscriptionState> {
    
    protected getEntityName(): string {
        return this.definition.subscription_name || "Service Bus Subscription";
    }

    protected getResourceType(): string {
        return "subscriptions";
    }

    override create(): void {
        const path = this.buildSubscriptionPath(
            this.definition.namespace_name,
            this.definition.topic_name,
            this.definition.subscription_name
        );
        
        // Check if subscription already exists
        const existsResult = this.checkResourceExistsWithStatus(path);
        
        if (existsResult.resource) {
            const existingSub = existsResult.resource;
            const properties = existingSub.properties as Record<string, unknown> | undefined;
            
            this.state = {
                subscription_name: this.definition.subscription_name,
                topic_name: this.definition.topic_name,
                namespace_name: this.definition.namespace_name,
                status: typeof properties?.status === 'string' ? properties.status : undefined,
                message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : undefined,
                provisioning_state: "Succeeded",
                created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
                updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined,
                existing: true
            };
            cli.output(`✅ Service Bus subscription ${this.definition.subscription_name} already exists`);
            return;
        }

        // Skip creation if create_when_missing is false
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Subscription ${this.definition.subscription_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {}
        };

        // Add subscription properties
        if (this.definition.default_message_time_to_live) {
            body.properties.defaultMessageTimeToLive = this.definition.default_message_time_to_live;
        }

        if (this.definition.lock_duration) {
            body.properties.lockDuration = this.definition.lock_duration;
        }

        if (this.definition.dead_lettering_on_message_expiration === true) {
            body.properties.deadLetteringOnMessageExpiration = true;
        }

        if (this.definition.dead_lettering_on_filter_evaluation_exceptions === true) {
            body.properties.deadLetteringOnFilterEvaluationExceptions = true;
        }

        if (this.definition.max_delivery_count !== undefined) {
            body.properties.maxDeliveryCount = this.definition.max_delivery_count;
        }

        if (this.definition.requires_session === true) {
            body.properties.requiresSession = true;
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

        // Create the subscription
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create Service Bus subscription: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            subscription_name: this.definition.subscription_name,
            topic_name: this.definition.topic_name,
            namespace_name: this.definition.namespace_name,
            status: typeof properties?.status === 'string' ? properties.status : undefined,
            message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : 0,
            provisioning_state: "Succeeded",
            created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
            existing: false
        };

        cli.output(`✅ Created Azure Service Bus subscription: ${this.definition.subscription_name}`);

        // Create default rule if filter is specified
        if (this.definition.default_rule_filter) {
            this.createDefaultRule();
        }
    }

    /**
     * Create or update the default rule with a filter
     */
    private createDefaultRule(): void {
        const rulePath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.ServiceBus/namespaces/${this.definition.namespace_name}/topics/${this.definition.topic_name}/subscriptions/${this.definition.subscription_name}/rules/$Default?api-version=${this.apiVersion}`;

        const ruleBody: {
            properties: {
                filterType: string;
                sqlFilter?: { sqlExpression: string };
                action?: { sqlExpression: string };
            };
        } = {
            properties: {
                filterType: "SqlFilter",
                sqlFilter: {
                    sqlExpression: this.definition.default_rule_filter || "1=1"
                }
            }
        };

        if (this.definition.default_rule_action) {
            ruleBody.properties.action = {
                sqlExpression: this.definition.default_rule_action
            };
        }

        const response = this.makeAzureRequest("PUT", rulePath, ruleBody);

        if (response.error) {
            cli.output(`⚠️  Failed to create default rule: ${response.error}`);
        } else {
            cli.output(`✅ Created default rule with filter: ${this.definition.default_rule_filter}`);
        }
    }

    override update(): void {
        if (!this.state.subscription_name) {
            this.create();
            return;
        }

        // Prepare update body
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {}
        };

        // Updatable properties
        if (this.definition.default_message_time_to_live) {
            body.properties.defaultMessageTimeToLive = this.definition.default_message_time_to_live;
        }

        if (this.definition.lock_duration) {
            body.properties.lockDuration = this.definition.lock_duration;
        }

        if (this.definition.dead_lettering_on_message_expiration !== undefined) {
            body.properties.deadLetteringOnMessageExpiration = this.definition.dead_lettering_on_message_expiration;
        }

        if (this.definition.dead_lettering_on_filter_evaluation_exceptions !== undefined) {
            body.properties.deadLetteringOnFilterEvaluationExceptions = this.definition.dead_lettering_on_filter_evaluation_exceptions;
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

        const path = this.buildSubscriptionPath(
            this.definition.namespace_name,
            this.definition.topic_name,
            this.definition.subscription_name
        );
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to update Service Bus subscription: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            ...this.state,
            status: typeof properties?.status === 'string' ? properties.status : this.state.status,
            message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : this.state.message_count,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined
        };

        cli.output(`✅ Updated Azure Service Bus subscription: ${this.definition.subscription_name}`);

        // Update default rule if filter is specified
        if (this.definition.default_rule_filter) {
            this.createDefaultRule();
        }
    }

    override delete(): void {
        if (!this.state.subscription_name || !this.state.topic_name || !this.state.namespace_name) {
            cli.output(`⚠️  No subscription to delete`);
            return;
        }

        const path = this.buildSubscriptionPath(
            this.state.namespace_name,
            this.state.topic_name,
            this.state.subscription_name
        );
        this.deleteResourceByPath(path, this.state.subscription_name);
    }

    override checkReadiness(): boolean {
        if (!this.state.subscription_name || !this.state.topic_name || !this.state.namespace_name) {
            if (this.definition.create_when_missing === false) {
                cli.output("Subscription not created (create_when_missing is false)");
                return true;
            }
            cli.output("Subscription not yet created");
            return false;
        }

        const path = this.buildSubscriptionPath(
            this.state.namespace_name,
            this.state.topic_name,
            this.state.subscription_name
        );
        const existsResult = this.checkResourceExistsWithStatus(path);

        if (!existsResult.resource) {
            if (existsResult.notFound) {
                cli.output("Subscription not found");
                return false;
            }
            cli.output(`Error checking subscription: ${existsResult.error || 'Unknown error'}`);
            return false;
        }

        const properties = existsResult.resource.properties as Record<string, unknown> | undefined;
        const status = properties?.status as string | undefined;

        // Update state with latest info
        this.state = {
            ...this.state,
            status: status,
            message_count: typeof properties?.messageCount === 'number' ? properties.messageCount : this.state.message_count,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : this.state.updated_at
        };

        if (status === "Active") {
            cli.output("Subscription is ready");
            return true;
        }

        cli.output(`Subscription status: ${status || 'Unknown'}`);
        return false;
    }

    /**
     * Get detailed subscription information
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📦 Service Bus Subscription Information");
        cli.output("==================================================");

        const path = this.buildSubscriptionPath(
            this.definition.namespace_name,
            this.definition.topic_name,
            this.definition.subscription_name
        );
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to get subscription info: ${response.error}`);
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
        cli.output(`   Topic: ${this.definition.topic_name}`);
        cli.output(`   Namespace: ${this.definition.namespace_name}`);
        cli.output(`   Status: ${properties?.status}`);

        cli.output(`\n📊 Message Statistics:`);
        cli.output(`   Active Messages: ${countDetails?.activeMessageCount || 0}`);
        cli.output(`   Dead Letter Messages: ${countDetails?.deadLetterMessageCount || 0}`);
        cli.output(`   Scheduled Messages: ${countDetails?.scheduledMessageCount || 0}`);
        cli.output(`   Transfer Messages: ${countDetails?.transferMessageCount || 0}`);
        cli.output(`   Transfer Dead Letter: ${countDetails?.transferDeadLetterMessageCount || 0}`);

        cli.output(`\n⚙️  Configuration:`);
        cli.output(`   Message TTL: ${this.formatDuration(properties?.defaultMessageTimeToLive as string || 'P14D')}`);
        cli.output(`   Lock Duration: ${this.formatDuration(properties?.lockDuration as string || 'PT1M')}`);
        cli.output(`   Max Delivery Count: ${properties?.maxDeliveryCount}`);

        cli.output(`\n🔧 Features:`);
        cli.output(`   Requires Session: ${properties?.requiresSession || false}`);
        cli.output(`   Dead Lettering on Expiration: ${properties?.deadLetteringOnMessageExpiration || false}`);
        cli.output(`   Dead Lettering on Filter Exceptions: ${properties?.deadLetteringOnFilterEvaluationExceptions || false}`);
        cli.output(`   Enable Batched Operations: ${properties?.enableBatchedOperations ?? true}`);

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
     * List all rules for this subscription
     */
    @action("list-rules")
    listRules(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📋 Subscription Rules");
        cli.output("==================================================");

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.ServiceBus/namespaces/${this.definition.namespace_name}/topics/${this.definition.topic_name}/subscriptions/${this.definition.subscription_name}/rules?api-version=${this.apiVersion}`;
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to list rules: ${response.error}`);
            return;
        }

        const data = this.parseResponseBody(response) as Record<string, unknown> | null;
        const rules = data?.value as Array<Record<string, unknown>> | undefined;

        if (!rules || rules.length === 0) {
            cli.output("\nNo rules found for this subscription.");
            cli.output("\n==================================================");
            return;
        }

        cli.output(`\nFound ${rules.length} rule(s):\n`);

        for (const rule of rules) {
            const props = rule.properties as Record<string, unknown> | undefined;
            cli.output(`📜 Rule: ${rule.name}`);
            cli.output(`   Filter Type: ${props?.filterType}`);
            
            if (props?.sqlFilter) {
                const sqlFilter = props.sqlFilter as Record<string, unknown>;
                cli.output(`   SQL Expression: ${sqlFilter.sqlExpression}`);
            }
            
            if (props?.correlationFilter) {
                const corrFilter = props.correlationFilter as Record<string, unknown>;
                cli.output(`   Correlation ID: ${corrFilter.correlationId || 'N/A'}`);
                cli.output(`   Message ID: ${corrFilter.messageId || 'N/A'}`);
                cli.output(`   Label: ${corrFilter.label || 'N/A'}`);
            }
            
            if (props?.action) {
                const action = props.action as Record<string, unknown>;
                cli.output(`   Action: ${action.sqlExpression || 'N/A'}`);
            }
            cli.output("");
        }

        cli.output("==================================================");
    }

    /**
     * Get subscription runtime properties (message counts, etc.)
     */
    @action("get-runtime-info")
    getRuntimeInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📊 Subscription Runtime Information");
        cli.output("==================================================");

        const path = this.buildSubscriptionPath(
            this.definition.namespace_name,
            this.definition.topic_name,
            this.definition.subscription_name
        );
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

        cli.output(`\n📅 Access Times:`);
        cli.output(`   Created: ${properties?.createdAt}`);
        cli.output(`   Updated: ${properties?.updatedAt}`);
        cli.output(`   Last Accessed: ${properties?.accessedAt}`);

        cli.output("\n==================================================");
    }
}
