import { AzureEventHubsEntity, AzureEventHubsDefinition, AzureEventHubsState } from "./azure-eventhubs-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Capture configuration for Event Hub
 */
export interface CaptureConfig {
    /**
     * @description Enable capture
     */
    enabled: boolean;

    /**
     * @description Capture encoding format
     */
    encoding?: "Avro" | "AvroDeflate";

    /**
     * @description Time window in seconds (60-900)
     */
    interval_in_seconds?: number;

    /**
     * @description Size limit in bytes (10485760-524288000)
     */
    size_limit_in_bytes?: number;

    /**
     * @description Skip empty archives
     */
    skip_empty_archives?: boolean;

    /**
     * @description Destination storage account resource ID
     */
    destination_storage_account_resource_id?: string;

    /**
     * @description Destination blob container name
     */
    destination_blob_container?: string;

    /**
     * @description Archive name format
     */
    destination_archive_name_format?: string;
}

/**
 * Definition interface for Azure Event Hub.
 * Configures event hub properties including partitions, retention, and capture.
 * @interface EventHubDefinition
 */
export interface EventHubDefinition extends AzureEventHubsDefinition {
    /**
     * @description Event Hubs namespace name
     */
    namespace_name: string;

    /**
     * @description Event Hub name (1-256 chars)
     * @minLength 1
     * @maxLength 256
     */
    eventhub_name: string;

    /**
     * @description Number of partitions (1-32 for Standard, up to 1024 for Premium)
     * @default 2
     */
    partition_count?: number;

    /**
     * @description Message retention in days (1-7 for Standard, 1-90 for Premium)
     * @default 1
     */
    message_retention_in_days?: number;

    /**
     * @description Capture configuration for archiving events
     */
    capture?: CaptureConfig;
}

/**
 * State interface for Azure Event Hub.
 * Contains runtime information about the created event hub.
 * @interface EventHubState
 */
export interface EventHubState extends AzureEventHubsState {
    /**
     * @description The event hub name
     */
    eventhub_name?: string;

    /**
     * @description The namespace name
     */
    namespace_name?: string;

    /**
     * @description Current status
     */
    status?: string;

    /**
     * @description Number of partitions
     */
    partition_count?: number;

    /**
     * @description Partition IDs
     */
    partition_ids?: string[];

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
 * @description Azure Event Hub entity.
 * Creates and manages event hubs within an Event Hubs namespace.
 * Supports partitioning, message retention, and capture to storage.
 *
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.eventhub_name` - Event Hub name
 * - `state.namespace_name` - Parent namespace name
 * - `state.partition_ids` - List of partition IDs
 *
 * ## Composing with Other Entities
 * Works with:
 * - `azure-eventhubs/eventhubs-namespace` - Parent namespace
 * - `azure-eventhubs/consumer-group` - Create consumer groups for this event hub
 */
export class EventHub extends AzureEventHubsEntity<EventHubDefinition, EventHubState> {
    
    protected getEntityName(): string {
        return this.definition.eventhub_name;
    }

    protected getResourceType(): string {
        return "eventhubs";
    }

    override create(): void {
        const namespaceName = this.definition.namespace_name;
        const eventHubName = this.definition.eventhub_name;
        const path = this.buildEventHubPath(namespaceName, eventHubName);
        
        // Check if event hub exists
        const existingResult = this.checkResourceExistsWithStatus(path);
        
        if (existingResult.resource) {
            // Event hub exists
            const props = existingResult.resource.properties as Record<string, unknown>;
            
            this.state.existing = true;
            this.state.eventhub_name = eventHubName;
            this.state.namespace_name = namespaceName;
            this.state.status = props.status as string;
            this.state.partition_count = props.partitionCount as number;
            this.state.partition_ids = props.partitionIds as string[];
            this.state.created_at = props.createdAt as string;
            this.state.updated_at = props.updatedAt as string;
            this.state.provisioning_state = "Succeeded";
            
            cli.output(`✅ Found existing Event Hub: ${eventHubName}`);
            return;
        }
        
        // Check if we should create
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Event Hub ${eventHubName} not found and create_when_missing is false`);
            this.state.eventhub_name = eventHubName;
            this.state.namespace_name = namespaceName;
            return;
        }
        
        // Create event hub
        const requestBody = this.buildCreateRequest();
        const response = this.makeAzureRequest("PUT", path, requestBody);
        
        if (response.error && response.statusCode !== 200 && response.statusCode !== 201) {
            throw new Error(`Failed to create event hub: ${response.error}, body: ${response.body}`);
        }
        
        const result = JSON.parse(response.body);
        const props = result.properties as Record<string, unknown>;
        
        this.state.existing = false;
        this.state.eventhub_name = eventHubName;
        this.state.namespace_name = namespaceName;
        this.state.status = props.status as string;
        this.state.partition_count = props.partitionCount as number;
        this.state.partition_ids = props.partitionIds as string[];
        this.state.created_at = props.createdAt as string;
        this.state.updated_at = props.updatedAt as string;
        this.state.provisioning_state = "Succeeded";
        
        cli.output(`✅ Created Azure Event Hub: ${eventHubName}`);
    }

    override update(): void {
        // Update uses the same logic as create (PUT is idempotent)
        this.create();
    }

    private buildCreateRequest(): Record<string, unknown> {
        const properties: Record<string, unknown> = {};

        if (this.definition.partition_count !== undefined) {
            properties.partitionCount = this.definition.partition_count;
        } else {
            properties.partitionCount = 2;
        }

        if (this.definition.message_retention_in_days !== undefined) {
            properties.messageRetentionInDays = this.definition.message_retention_in_days;
        } else {
            properties.messageRetentionInDays = 1;
        }

        // Configure capture if specified
        if (this.definition.capture) {
            const capture = this.definition.capture;
            const captureDescription: Record<string, unknown> = {
                enabled: capture.enabled
            };

            if (capture.encoding) {
                captureDescription.encoding = capture.encoding;
            }

            if (capture.interval_in_seconds !== undefined) {
                captureDescription.intervalInSeconds = capture.interval_in_seconds;
            }

            if (capture.size_limit_in_bytes !== undefined) {
                captureDescription.sizeLimitInBytes = capture.size_limit_in_bytes;
            }

            if (capture.skip_empty_archives !== undefined) {
                captureDescription.skipEmptyArchives = capture.skip_empty_archives;
            }

            if (capture.destination_storage_account_resource_id && capture.destination_blob_container) {
                captureDescription.destination = {
                    name: "EventHubArchive.AzureBlockBlob",
                    properties: {
                        storageAccountResourceId: capture.destination_storage_account_resource_id,
                        blobContainer: capture.destination_blob_container,
                        archiveNameFormat: capture.destination_archive_name_format || 
                            "{Namespace}/{EventHub}/{PartitionId}/{Year}/{Month}/{Day}/{Hour}/{Minute}/{Second}"
                    }
                };
            }

            properties.captureDescription = captureDescription;
        }

        return { properties };
    }

    override checkReadiness(): boolean {
        const namespaceName = this.definition.namespace_name;
        const eventHubName = this.definition.eventhub_name;
        
        if (!namespaceName || !eventHubName) {
            return false;
        }

        // If create_when_missing is false and event hub doesn't exist, consider it ready
        if (this.definition.create_when_missing === false && !this.state.status) {
            return true;
        }

        const path = this.buildEventHubPath(namespaceName, eventHubName);
        const existing = this.checkResourceExists(path);
        
        if (!existing) {
            return false;
        }

        const props = existing.properties as Record<string, unknown>;
        const status = props?.status as string;
        
        // Update state
        this.state.status = status;
        this.state.updated_at = props?.updatedAt as string;
        
        return status === "Active";
    }

    override delete(): void {
        const namespaceName = this.definition.namespace_name;
        const eventHubName = this.definition.eventhub_name;
        const path = this.buildEventHubPath(namespaceName, eventHubName);
        this.deleteResourceByPath(path, eventHubName);
    }

    /**
     * Get detailed information about the event hub
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📦 Event Hub Information");
        cli.output("==================================================");

        const path = this.buildEventHubPath(this.definition.namespace_name, this.definition.eventhub_name);
        const existing = this.checkResourceExists(path);
        
        if (!existing) {
            cli.output("❌ Event Hub not found");
            return;
        }

        const props = existing.properties as Record<string, unknown>;

        cli.output("");
        cli.output("📋 Basic Information:");
        cli.output(`   Name: ${existing.name}`);
        cli.output(`   Namespace: ${this.definition.namespace_name}`);
        cli.output(`   Status: ${props.status}`);

        cli.output("");
        cli.output("⚙️  Configuration:");
        cli.output(`   Partition Count: ${props.partitionCount}`);
        cli.output(`   Message Retention (days): ${props.messageRetentionInDays}`);
        
        const partitionIds = props.partitionIds as string[];
        if (partitionIds && partitionIds.length > 0) {
            cli.output(`   Partition IDs: ${partitionIds.join(", ")}`);
        }

        // Capture configuration
        const capture = props.captureDescription as Record<string, unknown>;
        if (capture) {
            cli.output("");
            cli.output("📸 Capture Configuration:");
            cli.output(`   Enabled: ${capture.enabled}`);
            if (capture.enabled) {
                cli.output(`   Encoding: ${capture.encoding || "Avro"}`);
                cli.output(`   Interval (seconds): ${capture.intervalInSeconds || 300}`);
                cli.output(`   Size Limit (bytes): ${capture.sizeLimitInBytes || 314572800}`);
                cli.output(`   Skip Empty Archives: ${capture.skipEmptyArchives || false}`);
            }
        }

        cli.output("");
        cli.output("📅 Timestamps:");
        cli.output(`   Created: ${props.createdAt}`);
        cli.output(`   Updated: ${props.updatedAt}`);

        cli.output("");
        cli.output("==================================================");
    }

    /**
     * List all consumer groups for this event hub
     */
    @action("list-consumer-groups")
    listConsumerGroups(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📋 Consumer Groups");
        cli.output("==================================================");

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${this.definition.namespace_name}/eventhubs/${this.definition.eventhub_name}/consumergroups?api-version=${this.apiVersion}`;
        const response = this.makeAzureRequest("GET", path);
        
        if (response.error) {
            cli.output(`❌ Failed to list consumer groups: ${response.error}`);
            return;
        }

        const result = JSON.parse(response.body);
        const groups = result.value as Array<Record<string, unknown>>;

        if (!groups || groups.length === 0) {
            cli.output("No consumer groups found.");
            return;
        }

        cli.output(`\nFound ${groups.length} consumer group(s):\n`);

        for (const group of groups) {
            const props = group.properties as Record<string, unknown>;
            cli.output(`👥 Consumer Group: ${group.name}`);
            if (props.userMetadata) {
                cli.output(`   User Metadata: ${props.userMetadata}`);
            }
            cli.output("");
        }

        cli.output("==================================================");
    }

    /**
     * Get partition runtime information
     */
    @action("get-partition-info")
    getPartitionInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📊 Partition Information");
        cli.output("==================================================");

        const path = this.buildEventHubPath(this.definition.namespace_name, this.definition.eventhub_name);
        const existing = this.checkResourceExists(path);
        
        if (!existing) {
            cli.output("❌ Event Hub not found");
            return;
        }

        const props = existing.properties as Record<string, unknown>;
        const partitionIds = props.partitionIds as string[];

        cli.output("");
        cli.output(`📋 Event Hub: ${existing.name}`);
        cli.output(`   Total Partitions: ${props.partitionCount}`);
        cli.output("");

        if (partitionIds && partitionIds.length > 0) {
            cli.output("📁 Partitions:");
            for (const partitionId of partitionIds) {
                cli.output(`   - Partition ${partitionId}`);
            }
        }

        cli.output("");
        cli.output("==================================================");
    }
}
