import { AzureEventHubsEntity, AzureEventHubsDefinition, AzureEventHubsState } from "./azure-eventhubs-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for Azure Event Hubs Consumer Group.
 * Configures consumer group properties.
 * @interface ConsumerGroupDefinition
 */
export interface ConsumerGroupDefinition extends AzureEventHubsDefinition {
    /**
     * @description Event Hubs namespace name
     */
    namespace_name: string;

    /**
     * @description Event Hub name
     */
    eventhub_name: string;

    /**
     * @description Consumer group name (1-50 chars)
     * @minLength 1
     * @maxLength 50
     */
    consumer_group_name: string;

    /**
     * @description User metadata for the consumer group
     */
    user_metadata?: string;
}

/**
 * State interface for Azure Event Hubs Consumer Group.
 * Contains runtime information about the created consumer group.
 * @interface ConsumerGroupState
 */
export interface ConsumerGroupState extends AzureEventHubsState {
    /**
     * @description The consumer group name
     */
    consumer_group_name?: string;

    /**
     * @description The event hub name
     */
    eventhub_name?: string;

    /**
     * @description The namespace name
     */
    namespace_name?: string;

    /**
     * @description Creation timestamp
     */
    created_at?: string;

    /**
     * @description Last update timestamp
     */
    updated_at?: string;
}

/**
 * @description Azure Event Hubs Consumer Group entity.
 * Creates and manages consumer groups within an Event Hub.
 * Consumer groups enable multiple consuming applications to read the event stream independently.
 *
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.consumer_group_name` - Consumer group name
 * - `state.eventhub_name` - Parent event hub name
 * - `state.namespace_name` - Parent namespace name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `azure-eventhubs/eventhubs-namespace` - Parent namespace
 * - `azure-eventhubs/eventhub` - Parent event hub
 */
export class ConsumerGroup extends AzureEventHubsEntity<ConsumerGroupDefinition, ConsumerGroupState> {
    
    protected getEntityName(): string {
        return this.definition.consumer_group_name;
    }

    protected getResourceType(): string {
        return "consumergroups";
    }

    override create(): void {
        const namespaceName = this.definition.namespace_name;
        const eventHubName = this.definition.eventhub_name;
        const consumerGroupName = this.definition.consumer_group_name;
        const path = this.buildConsumerGroupPath(namespaceName, eventHubName, consumerGroupName);
        
        // Check if consumer group exists
        const existingResult = this.checkResourceExistsWithStatus(path);
        
        if (existingResult.resource) {
            // Consumer group exists
            const props = existingResult.resource.properties as Record<string, unknown>;
            
            this.state.existing = true;
            this.state.consumer_group_name = consumerGroupName;
            this.state.eventhub_name = eventHubName;
            this.state.namespace_name = namespaceName;
            this.state.created_at = props.createdAt as string;
            this.state.updated_at = props.updatedAt as string;
            this.state.provisioning_state = "Succeeded";
            
            cli.output(`✅ Found existing Consumer Group: ${consumerGroupName}`);
            return;
        }
        
        // Check if we should create
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Consumer Group ${consumerGroupName} not found and create_when_missing is false`);
            this.state.consumer_group_name = consumerGroupName;
            this.state.eventhub_name = eventHubName;
            this.state.namespace_name = namespaceName;
            return;
        }
        
        // Create consumer group
        const requestBody = this.buildCreateRequest();
        const response = this.makeAzureRequest("PUT", path, requestBody);
        
        if (response.error && response.statusCode !== 200 && response.statusCode !== 201) {
            throw new Error(`Failed to create consumer group: ${response.error}, body: ${response.body}`);
        }
        
        const result = JSON.parse(response.body);
        const props = result.properties as Record<string, unknown>;
        
        this.state.existing = false;
        this.state.consumer_group_name = consumerGroupName;
        this.state.eventhub_name = eventHubName;
        this.state.namespace_name = namespaceName;
        this.state.created_at = props.createdAt as string;
        this.state.updated_at = props.updatedAt as string;
        this.state.provisioning_state = "Succeeded";
        
        cli.output(`✅ Created Azure Event Hubs Consumer Group: ${consumerGroupName}`);
    }

    override update(): void {
        // Update uses the same logic as create (PUT is idempotent)
        this.create();
    }

    private buildCreateRequest(): Record<string, unknown> {
        const properties: Record<string, unknown> = {};

        if (this.definition.user_metadata) {
            properties.userMetadata = this.definition.user_metadata;
        }

        return { properties };
    }

    override checkReadiness(): boolean {
        const namespaceName = this.definition.namespace_name;
        const eventHubName = this.definition.eventhub_name;
        const consumerGroupName = this.definition.consumer_group_name;
        
        if (!namespaceName || !eventHubName || !consumerGroupName) {
            return false;
        }

        // If create_when_missing is false and consumer group doesn't exist, consider it ready
        if (this.definition.create_when_missing === false && !this.state.provisioning_state) {
            return true;
        }

        const path = this.buildConsumerGroupPath(namespaceName, eventHubName, consumerGroupName);
        const existing = this.checkResourceExists(path);
        
        if (!existing) {
            return false;
        }

        const props = existing.properties as Record<string, unknown>;
        
        // Update state
        this.state.updated_at = props?.updatedAt as string;
        this.state.provisioning_state = "Succeeded";
        
        // Consumer groups are ready immediately after creation
        return true;
    }

    override delete(): void {
        const namespaceName = this.definition.namespace_name;
        const eventHubName = this.definition.eventhub_name;
        const consumerGroupName = this.definition.consumer_group_name;
        
        // Don't delete the default $Default consumer group
        if (consumerGroupName === "$Default") {
            cli.output(`⚠️  Cannot delete the default consumer group $Default`);
            return;
        }
        
        const path = this.buildConsumerGroupPath(namespaceName, eventHubName, consumerGroupName);
        this.deleteResourceByPath(path, consumerGroupName);
    }

    /**
     * Get detailed information about the consumer group
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("👥 Consumer Group Information");
        cli.output("==================================================");

        const path = this.buildConsumerGroupPath(
            this.definition.namespace_name,
            this.definition.eventhub_name,
            this.definition.consumer_group_name
        );
        const existing = this.checkResourceExists(path);
        
        if (!existing) {
            cli.output("❌ Consumer Group not found");
            return;
        }

        const props = existing.properties as Record<string, unknown>;

        cli.output("");
        cli.output("📋 Basic Information:");
        cli.output(`   Name: ${existing.name}`);
        cli.output(`   Event Hub: ${this.definition.eventhub_name}`);
        cli.output(`   Namespace: ${this.definition.namespace_name}`);

        if (props.userMetadata) {
            cli.output("");
            cli.output("📝 User Metadata:");
            cli.output(`   ${props.userMetadata}`);
        }

        cli.output("");
        cli.output("📅 Timestamps:");
        cli.output(`   Created: ${props.createdAt}`);
        cli.output(`   Updated: ${props.updatedAt}`);

        cli.output("");
        cli.output("==================================================");
    }
}
