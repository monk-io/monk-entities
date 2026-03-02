import { AzureServiceBusEntity, AzureServiceBusDefinition, AzureServiceBusState } from "./azure-servicebus-base.ts";
import cli from "cli";
import secret from "secret";
import { action, Args } from "monkec/base";

/**
 * SKU configuration for Service Bus Namespace
 */
export interface SkuConfig {
    /**
     * @description Service Bus namespace SKU name
     * - Basic: Basic tier with limited features
     * - Standard: Standard tier with topics and subscriptions
     * - Premium: Premium tier with dedicated resources
     */
    name: "Basic" | "Standard" | "Premium";

    /**
     * @description Messaging units for Premium tier (1, 2, 4, 8, or 16)
     */
    capacity?: number;
}

/**
 * Definition interface for Azure Service Bus Namespace.
 * Configures namespace properties including SKU, location, and features.
 * @interface NamespaceDefinition
 */
export interface NamespaceDefinition extends AzureServiceBusDefinition {
    /**
     * @description Service Bus namespace name (6-50 chars, alphanumeric and hyphens)
     * @minLength 6
     * @maxLength 50
     * @pattern ^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$
     */
    namespace_name: string;

    /**
     * @description Azure region for the namespace
     */
    location: string;

    /**
     * @description Service Bus namespace SKU configuration
     */
    sku: SkuConfig;

    /**
     * @description Enable zone redundancy for Premium tier
     */
    zone_redundant?: boolean;

    /**
     * @description Minimum TLS version for secure connections
     * @default "1.2"
     */
    minimum_tls_version?: "1.0" | "1.1" | "1.2";

    /**
     * @description Disable local (SAS key) authentication
     */
    disable_local_auth?: boolean;

    /**
     * @description Enable public network access
     * @default "Enabled"
     */
    public_network_access?: "Enabled" | "Disabled";

    /**
     * @description Tags for the resource
     */
    tags?: Record<string, string>;

    /**
     * @description Secret reference for primary connection string
     * If provided, the primary connection string will be saved to this secret
     */
    primary_connection_string_secret_ref?: string;

    /**
     * @description Secret reference for secondary connection string
     * If provided, the secondary connection string will be saved to this secret
     */
    secondary_connection_string_secret_ref?: string;
}

/**
 * State interface for Azure Service Bus Namespace.
 * Contains runtime information about the created namespace.
 * @interface NamespaceState
 */
export interface NamespaceState extends AzureServiceBusState {
    /**
     * @description Namespace name (primary identifier)
     */
    namespace_name?: string;

    /**
     * @description Service Bus endpoint URL
     */
    service_bus_endpoint?: string;

    /**
     * @description Namespace location
     */
    location?: string;

    /**
     * @description Namespace SKU tier
     */
    sku_tier?: string;

    /**
     * @description Namespace creation time
     */
    created_at?: string;

    /**
     * @description Namespace last updated time
     */
    updated_at?: string;

    /**
     * @description Whether secrets have been populated
     */
    secrets_populated?: boolean;
}

/**
 * @description Azure Service Bus Namespace entity.
 * Creates and manages Azure Service Bus namespaces for enterprise messaging.
 * Supports Basic, Standard, and Premium tiers with various features.
 *
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: secret names from `primary_connection_string_secret_ref`, `secondary_connection_string_secret_ref` properties - Connection strings (if specified)
 *
 * ## State Fields for Composition
 * - `state.namespace_name` - Namespace name
 * - `state.service_bus_endpoint` - Service Bus endpoint URL
 *
 * ## Composing with Other Entities
 * Works with:
 * - `azure-servicebus/queue` - Create queues within the namespace
 * - `azure-servicebus/topic` - Create topics within the namespace
 */
export class ServiceBusNamespace extends AzureServiceBusEntity<NamespaceDefinition, NamespaceState> {
    
    protected getEntityName(): string {
        return this.definition.namespace_name || "Service Bus Namespace";
    }

    protected getResourceType(): string {
        return "namespaces";
    }

    override create(): void {
        const path = this.buildNamespacePath(this.definition.namespace_name);
        
        // Check if namespace already exists
        const existsResult = this.checkResourceExistsWithStatus(path);
        
        if (existsResult.resource) {
            const existingNamespace = existsResult.resource;
            const properties = existingNamespace.properties as Record<string, unknown> | undefined;
            const provisioningState = typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined;
            
            this.state = {
                namespace_name: this.definition.namespace_name,
                service_bus_endpoint: typeof properties?.serviceBusEndpoint === 'string' ? properties.serviceBusEndpoint : undefined,
                location: typeof existingNamespace.location === 'string' ? existingNamespace.location : undefined,
                sku_tier: typeof (existingNamespace.sku as Record<string, unknown>)?.tier === 'string' 
                    ? (existingNamespace.sku as Record<string, unknown>).tier as string : undefined,
                provisioning_state: provisioningState,
                created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
                updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined,
                existing: true
            };
            cli.output(`✅ Service Bus namespace ${this.definition.namespace_name} already exists`);
            
            // If existing namespace is ready, populate secrets immediately
            if (provisioningState === "Succeeded") {
                cli.output(`🔑 Existing namespace is ready, attempting to populate secrets...`);
                this.populateSecrets();
            }
            return;
        }

        // Skip creation if create_when_missing is false
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Namespace ${this.definition.namespace_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body
        const body: {
            location: string;
            sku: {
                name: string;
                tier: string;
                capacity?: number;
            };
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            location: this.definition.location,
            sku: {
                name: this.definition.sku.name,
                tier: this.definition.sku.name
            },
            properties: {}
        };

        // Add capacity for Premium tier
        if (this.definition.sku.name === "Premium" && this.definition.sku.capacity) {
            body.sku.capacity = this.definition.sku.capacity;
        }

        // Add zone redundancy for Premium tier
        if (this.definition.zone_redundant !== undefined && this.definition.sku.name === "Premium") {
            body.properties.zoneRedundant = this.definition.zone_redundant;
        }

        // Add minimum TLS version
        if (this.definition.minimum_tls_version) {
            body.properties.minimumTlsVersion = this.definition.minimum_tls_version;
        }

        // Add disable local auth
        if (this.definition.disable_local_auth !== undefined) {
            body.properties.disableLocalAuth = this.definition.disable_local_auth;
        }

        // Add public network access
        if (this.definition.public_network_access) {
            body.properties.publicNetworkAccess = this.definition.public_network_access;
        }

        // Add tags
        if (this.definition.tags) {
            body.tags = this.definition.tags;
        }

        // Create the namespace
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create Service Bus namespace: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            namespace_name: this.definition.namespace_name,
            service_bus_endpoint: typeof properties?.serviceBusEndpoint === 'string' ? properties.serviceBusEndpoint : undefined,
            location: this.definition.location,
            sku_tier: this.definition.sku.name,
            provisioning_state: typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined,
            created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : undefined,
            existing: false
        };

        cli.output(`✅ Created Azure Service Bus namespace: ${this.definition.namespace_name}`);
    }

    override update(): void {
        if (!this.state.namespace_name) {
            this.create();
            return;
        }

        // Prepare update body
        const body: {
            location: string;
            sku: {
                name: string;
                tier: string;
                capacity?: number;
            };
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            location: this.definition.location,
            sku: {
                name: this.definition.sku.name,
                tier: this.definition.sku.name
            },
            properties: {}
        };

        // Add capacity for Premium tier
        if (this.definition.sku.name === "Premium" && this.definition.sku.capacity) {
            body.sku.capacity = this.definition.sku.capacity;
        }

        // Add minimum TLS version
        if (this.definition.minimum_tls_version) {
            body.properties.minimumTlsVersion = this.definition.minimum_tls_version;
        }

        // Add disable local auth
        if (this.definition.disable_local_auth !== undefined) {
            body.properties.disableLocalAuth = this.definition.disable_local_auth;
        }

        // Add public network access
        if (this.definition.public_network_access) {
            body.properties.publicNetworkAccess = this.definition.public_network_access;
        }

        // Add tags
        if (this.definition.tags) {
            body.tags = this.definition.tags;
        }

        const path = this.buildNamespacePath(this.definition.namespace_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to update Service Bus namespace: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        const properties = responseData?.properties as Record<string, unknown> | undefined;

        this.state = {
            ...this.state,
            service_bus_endpoint: typeof properties?.serviceBusEndpoint === 'string' ? properties.serviceBusEndpoint : this.state.service_bus_endpoint,
            provisioning_state: typeof properties?.provisioningState === 'string' ? properties.provisioningState : this.state.provisioning_state,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : undefined
        };

        cli.output(`✅ Updated Azure Service Bus namespace: ${this.definition.namespace_name}`);
    }

    override delete(): void {
        if (!this.state.namespace_name) {
            cli.output(`⚠️  No namespace to delete`);
            return;
        }

        const path = this.buildNamespacePath(this.state.namespace_name);
        this.deleteResourceByPath(path, this.state.namespace_name);
    }

    override checkReadiness(): boolean {
        if (!this.state.namespace_name) {
            // If create_when_missing is false and resource doesn't exist, consider it ready
            if (this.definition.create_when_missing === false) {
                cli.output("Namespace not created (create_when_missing is false)");
                return true;
            }
            cli.output("Namespace not yet created");
            return false;
        }

        const path = this.buildNamespacePath(this.state.namespace_name);
        const existsResult = this.checkResourceExistsWithStatus(path);

        if (!existsResult.resource) {
            if (existsResult.notFound) {
                cli.output("Namespace not found");
                return false;
            }
            cli.output(`Error checking namespace: ${existsResult.error || 'Unknown error'}`);
            return false;
        }

        const properties = existsResult.resource.properties as Record<string, unknown> | undefined;
        const provisioningState = properties?.provisioningState as string | undefined;

        // Update state with latest info
        this.state = {
            ...this.state,
            service_bus_endpoint: typeof properties?.serviceBusEndpoint === 'string' ? properties.serviceBusEndpoint : this.state.service_bus_endpoint,
            provisioning_state: provisioningState,
            created_at: typeof properties?.createdAt === 'string' ? properties.createdAt : this.state.created_at,
            updated_at: typeof properties?.updatedAt === 'string' ? properties.updatedAt : this.state.updated_at
        };

        // Populate secrets if configured and not already done
        if (!this.state.secrets_populated) {
            this.populateSecrets();
        }

        if (provisioningState === "Succeeded") {
            cli.output("Namespace is ready");
            return true;
        }

        if (provisioningState === "Failed") {
            cli.output("Namespace provisioning failed");
            return false;
        }

        cli.output(`Namespace provisioning state: ${provisioningState || 'Unknown'}`);
        return false;
    }

    /**
     * Populate connection string secrets if configured
     */
    private populateSecrets(): void {
        if (!this.definition.primary_connection_string_secret_ref && !this.definition.secondary_connection_string_secret_ref) {
            this.state.secrets_populated = true;
            return;
        }

        try {
            // Get the authorization rules to retrieve connection strings
            const authRulesPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.ServiceBus/namespaces/${this.definition.namespace_name}/authorizationRules/RootManageSharedAccessKey/listKeys?api-version=${this.apiVersion}`;
            
            const response = this.makeAzureRequest("POST", authRulesPath);
            
            if (response.error) {
                cli.output(`⚠️  Failed to retrieve connection strings: ${response.error}`);
                return;
            }

            const keys = this.parseResponseBody(response) as Record<string, unknown> | null;
            
            if (keys) {
                if (this.definition.primary_connection_string_secret_ref && typeof keys.primaryConnectionString === 'string') {
                    secret.set(this.definition.primary_connection_string_secret_ref, keys.primaryConnectionString);
                    cli.output(`🔐 Saved primary connection string to secret: ${this.definition.primary_connection_string_secret_ref}`);
                }
                
                if (this.definition.secondary_connection_string_secret_ref && typeof keys.secondaryConnectionString === 'string') {
                    secret.set(this.definition.secondary_connection_string_secret_ref, keys.secondaryConnectionString);
                    cli.output(`🔐 Saved secondary connection string to secret: ${this.definition.secondary_connection_string_secret_ref}`);
                }
            }

            this.state.secrets_populated = true;
        } catch (error) {
            cli.output(`⚠️  Error populating secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get detailed namespace information
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📦 Service Bus Namespace Information");
        cli.output("==================================================");

        const path = this.buildNamespacePath(this.definition.namespace_name);
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to get namespace info: ${response.error}`);
            return;
        }

        const data = this.parseResponseBody(response) as Record<string, unknown> | null;
        if (!data) {
            cli.output("❌ No data returned");
            return;
        }

        const properties = data.properties as Record<string, unknown> | undefined;
        const sku = data.sku as Record<string, unknown> | undefined;

        cli.output(`\n📋 Basic Information:`);
        cli.output(`   Name: ${data.name}`);
        cli.output(`   Location: ${data.location}`);
        cli.output(`   SKU: ${sku?.name} (${sku?.tier})`);
        if (sku?.capacity) {
            cli.output(`   Messaging Units: ${sku.capacity}`);
        }
        cli.output(`   Provisioning State: ${properties?.provisioningState}`);
        cli.output(`   Status: ${properties?.status}`);

        cli.output(`\n🔗 Endpoints:`);
        cli.output(`   Service Bus Endpoint: ${properties?.serviceBusEndpoint}`);

        cli.output(`\n🔒 Security Settings:`);
        cli.output(`   Minimum TLS Version: ${properties?.minimumTlsVersion || '1.2'}`);
        cli.output(`   Disable Local Auth: ${properties?.disableLocalAuth || false}`);
        cli.output(`   Public Network Access: ${properties?.publicNetworkAccess || 'Enabled'}`);

        if (sku?.name === "Premium") {
            cli.output(`\n⚡ Premium Features:`);
            cli.output(`   Zone Redundant: ${properties?.zoneRedundant || false}`);
        }

        cli.output(`\n📅 Timestamps:`);
        cli.output(`   Created: ${properties?.createdAt}`);
        cli.output(`   Updated: ${properties?.updatedAt}`);

        const tags = data.tags as Record<string, string> | undefined;
        if (tags && Object.keys(tags).length > 0) {
            cli.output(`\n🏷️  Tags:`);
            for (const [key, value] of Object.entries(tags)) {
                cli.output(`   ${key}: ${value}`);
            }
        }

        cli.output("\n==================================================");
    }

    /**
     * List all queues in the namespace
     */
    @action("list-queues")
    listQueues(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📋 Service Bus Queues");
        cli.output("==================================================");

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.ServiceBus/namespaces/${this.definition.namespace_name}/queues?api-version=${this.apiVersion}`;
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to list queues: ${response.error}`);
            return;
        }

        const data = this.parseResponseBody(response) as Record<string, unknown> | null;
        const queues = data?.value as Array<Record<string, unknown>> | undefined;

        if (!queues || queues.length === 0) {
            cli.output("\nNo queues found in this namespace.");
            cli.output("\n==================================================");
            return;
        }

        cli.output(`\nFound ${queues.length} queue(s):\n`);

        for (const queue of queues) {
            const props = queue.properties as Record<string, unknown> | undefined;
            cli.output(`📁 Queue: ${queue.name}`);
            cli.output(`   Status: ${props?.status}`);
            cli.output(`   Message Count: ${props?.messageCount || 0}`);
            cli.output(`   Size (bytes): ${props?.sizeInBytes || 0}`);
            cli.output(`   Dead Letter Count: ${props?.countDetails ? (props.countDetails as Record<string, unknown>).deadLetterMessageCount : 0}`);
            cli.output("");
        }

        cli.output("==================================================");
    }

    /**
     * List all topics in the namespace
     */
    @action("list-topics")
    listTopics(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📋 Service Bus Topics");
        cli.output("==================================================");

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.ServiceBus/namespaces/${this.definition.namespace_name}/topics?api-version=${this.apiVersion}`;
        const response = this.makeAzureRequest("GET", path);

        if (response.error) {
            cli.output(`❌ Failed to list topics: ${response.error}`);
            return;
        }

        const data = this.parseResponseBody(response) as Record<string, unknown> | null;
        const topics = data?.value as Array<Record<string, unknown>> | undefined;

        if (!topics || topics.length === 0) {
            cli.output("\nNo topics found in this namespace.");
            cli.output("\n==================================================");
            return;
        }

        cli.output(`\nFound ${topics.length} topic(s):\n`);

        for (const topic of topics) {
            const props = topic.properties as Record<string, unknown> | undefined;
            cli.output(`📁 Topic: ${topic.name}`);
            cli.output(`   Status: ${props?.status}`);
            cli.output(`   Subscription Count: ${props?.subscriptionCount || 0}`);
            cli.output(`   Size (bytes): ${props?.sizeInBytes || 0}`);
            cli.output("");
        }

        cli.output("==================================================");
    }

    /**
     * Regenerate authorization keys
     */
    @action("regenerate-key")
    regenerateKey(args?: Args): void {
        const keyType = (args?.key_type as string | undefined) || "PrimaryKey";
        
        cli.output("==================================================");
        cli.output(`🔑 Regenerating ${keyType}`);
        cli.output("==================================================");

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.ServiceBus/namespaces/${this.definition.namespace_name}/authorizationRules/RootManageSharedAccessKey/regenerateKeys?api-version=${this.apiVersion}`;
        
        const body = {
            keyType: keyType
        };

        const response = this.makeAzureRequest("POST", path, body);

        if (response.error) {
            cli.output(`❌ Failed to regenerate key: ${response.error}`);
            return;
        }

        cli.output(`✅ Successfully regenerated ${keyType}`);
        
        // Update secrets if configured
        if (this.definition.primary_connection_string_secret_ref || this.definition.secondary_connection_string_secret_ref) {
            this.state.secrets_populated = false;
            this.populateSecrets();
        }

        cli.output("\n==================================================");
    }
}
