import { AzureEventHubsEntity, AzureEventHubsDefinition, AzureEventHubsState } from "./azure-eventhubs-base.ts";
import cli from "cli";
import secret from "secret";
import http from "http";
import { action, Args } from "monkec/base";

/**
 * SKU configuration for Event Hubs Namespace
 */
export interface SkuConfig {
    /**
     * @description Event Hubs namespace SKU name
     * - Basic: Basic tier with limited features
     * - Standard: Standard tier with consumer groups and partitions
     * - Premium: Premium tier with dedicated resources
     */
    name: "Basic" | "Standard" | "Premium";

    /**
     * @description Capacity units (throughput units for Standard, processing units for Premium)
     */
    capacity?: number;
}

/**
 * Definition interface for Azure Event Hubs Namespace.
 * Configures namespace properties including SKU, location, and features.
 * @interface EventHubsNamespaceDefinition
 */
export interface EventHubsNamespaceDefinition extends AzureEventHubsDefinition {
    /**
     * @description Event Hubs namespace name (6-50 chars, alphanumeric and hyphens)
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
     * @description Event Hubs namespace SKU configuration
     */
    sku: SkuConfig;

    /**
     * @description Enable zone redundancy (Premium tier only)
     */
    zone_redundant?: boolean;

    /**
     * @description Enable auto-inflate for automatic scaling (Standard tier)
     */
    is_auto_inflate_enabled?: boolean;

    /**
     * @description Maximum throughput units when auto-inflate is enabled (1-40)
     */
    maximum_throughput_units?: number;

    /**
     * @description Enable Kafka support
     */
    kafka_enabled?: boolean;

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
    public_network_access?: "Enabled" | "Disabled" | "SecuredByPerimeter";

    /**
     * @description Tags for the resource
     */
    tags?: Record<string, string>;

    /**
     * @description Secret reference for primary connection string
     *              If provided, the primary connection string will be saved to this secret
     */
    primary_connection_string_secret_ref?: string;

    /**
     * @description Secret reference for secondary connection string
     *              If provided, the secondary connection string will be saved to this secret
     */
    secondary_connection_string_secret_ref?: string;
}

/**
 * State interface for Azure Event Hubs Namespace.
 * Contains runtime information about the created namespace.
 * @interface EventHubsNamespaceState
 */
export interface EventHubsNamespaceState extends AzureEventHubsState {
    /**
     * @description The namespace name
     */
    namespace_name?: string;

    /**
     * @description The Event Hubs endpoint URL
     */
    service_bus_endpoint?: string;

    /**
     * @description The namespace location
     */
    location?: string;

    /**
     * @description The SKU tier
     */
    sku_tier?: string;

    /**
     * @description Creation timestamp
     */
    created_at?: string;

    /**
     * @description Last update timestamp
     */
    updated_at?: string;

    /**
     * @description Whether secrets have been populated
     */
    secrets_populated?: boolean;
}

/**
 * @description Azure Event Hubs Namespace entity.
 * Creates and manages Azure Event Hubs namespaces for event streaming.
 * Supports Basic, Standard, and Premium tiers with various features.
 *
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: secret names from `primary_connection_string_secret_ref`, `secondary_connection_string_secret_ref` properties - Connection strings (if specified)
 *
 * ## State Fields for Composition
 * - `state.namespace_name` - Namespace name
 * - `state.service_bus_endpoint` - Event Hubs endpoint URL
 *
 * ## Composing with Other Entities
 * Works with:
 * - `azure-eventhubs/eventhub` - Create event hubs within the namespace
 * - `azure-eventhubs/consumer-group` - Create consumer groups for event hubs
 */
export class EventHubsNamespace extends AzureEventHubsEntity<EventHubsNamespaceDefinition, EventHubsNamespaceState> {
    
    protected getEntityName(): string {
        return this.definition.namespace_name;
    }

    protected getResourceType(): string {
        return "namespaces";
    }

    override create(): void {
        const namespaceName = this.definition.namespace_name;
        const path = this.buildNamespacePath(namespaceName);
        
        // Check if namespace exists
        const existingResult = this.checkResourceExistsWithStatus(path);
        
        if (existingResult.resource) {
            // Namespace exists
            const props = existingResult.resource.properties as Record<string, unknown>;
            const sku = existingResult.resource.sku as Record<string, unknown>;
            const provisioningState = props.provisioningState as string;
            
            this.state.existing = true;
            this.state.namespace_name = namespaceName;
            this.state.provisioning_state = provisioningState;
            this.state.service_bus_endpoint = props.serviceBusEndpoint as string;
            this.state.location = existingResult.resource.location as string;
            this.state.sku_tier = sku?.tier as string;
            this.state.created_at = props.createdAt as string;
            this.state.updated_at = props.updatedAt as string;
            
            cli.output(`✅ Found existing Event Hubs namespace: ${namespaceName}`);
            
            // If existing namespace is ready, populate secrets immediately
            if (provisioningState === "Succeeded") {
                cli.output(`🔑 Existing namespace is ready, attempting to populate secrets...`);
                this.populateSecrets();
            }
            return;
        }
        
        // Check if we should create
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Namespace ${namespaceName} not found and create_when_missing is false`);
            this.state.namespace_name = namespaceName;
            return;
        }
        
        // Create namespace
        const requestBody = this.buildCreateRequest();
        const response = this.makeAzureRequest("PUT", path, requestBody);
        
        if (response.error && response.statusCode !== 200 && response.statusCode !== 201 && response.statusCode !== 202) {
            throw new Error(`Failed to create namespace: ${response.error}, body: ${response.body}`);
        }
        
        const result = JSON.parse(response.body);
        const props = result.properties as Record<string, unknown>;
        const sku = result.sku as Record<string, unknown>;
        
        this.state.existing = false;
        this.state.namespace_name = namespaceName;
        this.state.provisioning_state = props.provisioningState as string;
        this.state.service_bus_endpoint = props.serviceBusEndpoint as string;
        this.state.location = this.definition.location;
        this.state.sku_tier = sku?.tier as string;
        this.state.created_at = props.createdAt as string;
        this.state.updated_at = props.updatedAt as string;
        
        cli.output(`✅ Created Azure Event Hubs namespace: ${namespaceName}`);
    }

    override update(): void {
        // Update uses the same logic as create (PUT is idempotent)
        this.create();
    }

    private buildCreateRequest(): Record<string, unknown> {
        const request: Record<string, unknown> = {
            location: this.definition.location,
            sku: {
                name: this.definition.sku.name,
                tier: this.definition.sku.name,
                capacity: this.definition.sku.capacity || 1
            },
            properties: {}
        };

        const properties: Record<string, unknown> = {};

        if (this.definition.zone_redundant !== undefined) {
            properties.zoneRedundant = this.definition.zone_redundant;
        }

        if (this.definition.is_auto_inflate_enabled !== undefined) {
            properties.isAutoInflateEnabled = this.definition.is_auto_inflate_enabled;
        }

        if (this.definition.maximum_throughput_units !== undefined) {
            properties.maximumThroughputUnits = this.definition.maximum_throughput_units;
        }

        if (this.definition.kafka_enabled !== undefined) {
            properties.kafkaEnabled = this.definition.kafka_enabled;
        }

        if (this.definition.minimum_tls_version) {
            properties.minimumTlsVersion = this.definition.minimum_tls_version;
        }

        if (this.definition.disable_local_auth !== undefined) {
            properties.disableLocalAuth = this.definition.disable_local_auth;
        }

        if (this.definition.public_network_access) {
            properties.publicNetworkAccess = this.definition.public_network_access;
        }

        request.properties = properties;

        if (this.definition.tags) {
            request.tags = this.definition.tags;
        }

        return request;
    }

    private populateSecrets(): void {
        if (!this.definition.primary_connection_string_secret_ref && 
            !this.definition.secondary_connection_string_secret_ref) {
            this.state.secrets_populated = true;
            return;
        }

        try {
            // Get connection strings from RootManageSharedAccessKey
            const keysPath = this.buildListKeysPath(this.definition.namespace_name, "RootManageSharedAccessKey");
            const response = this.makeAzureRequest("POST", keysPath);
            
            if (response.error) {
                cli.output(`⚠️  Failed to get connection strings: ${response.error}`);
                return;
            }

            const keys = JSON.parse(response.body);
            
            if (this.definition.primary_connection_string_secret_ref && keys.primaryConnectionString) {
                secret.set(this.definition.primary_connection_string_secret_ref, keys.primaryConnectionString);
                cli.output(`✅ Saved primary connection string to secret: ${this.definition.primary_connection_string_secret_ref}`);
            }

            if (this.definition.secondary_connection_string_secret_ref && keys.secondaryConnectionString) {
                secret.set(this.definition.secondary_connection_string_secret_ref, keys.secondaryConnectionString);
                cli.output(`✅ Saved secondary connection string to secret: ${this.definition.secondary_connection_string_secret_ref}`);
            }

            this.state.secrets_populated = true;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            cli.output(`⚠️  Failed to populate secrets: ${errorMsg}`);
        }
    }

    override checkReadiness(): boolean {
        const namespaceName = this.definition.namespace_name;
        
        if (!namespaceName) {
            return false;
        }

        // If create_when_missing is false and namespace doesn't exist, consider it ready
        if (this.definition.create_when_missing === false && !this.state.provisioning_state) {
            return true;
        }

        const path = this.buildNamespacePath(namespaceName);
        const existing = this.checkResourceExists(path);
        
        if (!existing) {
            return false;
        }

        const props = existing.properties as Record<string, unknown>;
        const provisioningState = props?.provisioningState as string;
        
        // Update state
        this.state.provisioning_state = provisioningState;
        this.state.updated_at = props?.updatedAt as string;
        
        // Populate secrets on first successful readiness check
        if (provisioningState === "Succeeded" && !this.state.secrets_populated) {
            this.populateSecrets();
        }
        
        return provisioningState === "Succeeded" || provisioningState === "Active";
    }

    override delete(): void {
        const namespaceName = this.definition.namespace_name;
        const path = this.buildNamespacePath(namespaceName);
        this.deleteResourceByPath(path, namespaceName);
    }

    /**
     * Get detailed information about the namespace
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📦 Event Hubs Namespace Information");
        cli.output("==================================================");

        const path = this.buildNamespacePath(this.definition.namespace_name);
        const existing = this.checkResourceExists(path);
        
        if (!existing) {
            cli.output("❌ Namespace not found");
            return;
        }

        const props = existing.properties as Record<string, unknown>;
        const sku = existing.sku as Record<string, unknown>;
        const tags = existing.tags as Record<string, string>;

        cli.output("");
        cli.output("📋 Basic Information:");
        cli.output(`   Name: ${existing.name}`);
        cli.output(`   Location: ${existing.location}`);
        cli.output(`   SKU: ${sku?.name} (${sku?.tier})`);
        cli.output(`   Capacity: ${sku?.capacity} throughput unit(s)`);
        cli.output(`   Provisioning State: ${props.provisioningState}`);
        cli.output(`   Status: ${props.status}`);

        cli.output("");
        cli.output("🔗 Endpoints:");
        cli.output(`   Service Bus Endpoint: ${props.serviceBusEndpoint}`);

        cli.output("");
        cli.output("⚙️  Features:");
        cli.output(`   Kafka Enabled: ${props.kafkaEnabled || false}`);
        cli.output(`   Auto-Inflate Enabled: ${props.isAutoInflateEnabled || false}`);
        if (props.isAutoInflateEnabled) {
            cli.output(`   Maximum Throughput Units: ${props.maximumThroughputUnits}`);
        }
        cli.output(`   Zone Redundant: ${props.zoneRedundant || false}`);

        cli.output("");
        cli.output("🔒 Security Settings:");
        cli.output(`   Minimum TLS Version: ${props.minimumTlsVersion || "1.0"}`);
        cli.output(`   Disable Local Auth: ${props.disableLocalAuth || false}`);
        cli.output(`   Public Network Access: ${props.publicNetworkAccess || "Enabled"}`);

        cli.output("");
        cli.output("📅 Timestamps:");
        cli.output(`   Created: ${props.createdAt}`);
        cli.output(`   Updated: ${props.updatedAt}`);

        if (tags && Object.keys(tags).length > 0) {
            cli.output("");
            cli.output("🏷️  Tags:");
            for (const [key, value] of Object.entries(tags)) {
                cli.output(`   ${key}: ${value}`);
            }
        }

        cli.output("");
        cli.output("==================================================");
    }

    /**
     * List all event hubs in the namespace
     */
    @action("list-eventhubs")
    listEventHubs(_args?: Args): void {
        cli.output("==================================================");
        cli.output("📋 Event Hubs");
        cli.output("==================================================");

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${this.definition.namespace_name}/eventhubs?api-version=${this.apiVersion}`;
        const response = this.makeAzureRequest("GET", path);
        
        if (response.error) {
            cli.output(`❌ Failed to list event hubs: ${response.error}`);
            return;
        }

        const result = JSON.parse(response.body);
        const eventHubs = result.value as Array<Record<string, unknown>>;

        if (!eventHubs || eventHubs.length === 0) {
            cli.output("No event hubs found in this namespace.");
            return;
        }

        cli.output(`\nFound ${eventHubs.length} event hub(s):\n`);

        for (const eh of eventHubs) {
            const props = eh.properties as Record<string, unknown>;
            cli.output(`📁 Event Hub: ${eh.name}`);
            cli.output(`   Status: ${props.status}`);
            cli.output(`   Partition Count: ${props.partitionCount}`);
            cli.output(`   Message Retention (days): ${props.messageRetentionInDays}`);
            cli.output("");
        }

        cli.output("==================================================");
    }

    // ========================================
    // Cost Estimation
    // ========================================

    /**
     * Make an external HTTP request (for Azure Retail Prices API)
     */
    private makeExternalRequest(url: string): Record<string, unknown> | null {
        try {
            const response = http.get(url, {
                headers: { 'Accept': 'application/json' }
            });
            if (response.body) {
                return JSON.parse(response.body);
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Fetch Event Hubs pricing from Azure Retail Prices API
     */
    private fetchEventHubsPricing(location: string, skuName: string): {
        throughputUnitPerHour: number;
        ingressPerMillion: number;
        source: string;
    } {
        try {
            const baseUrl = 'https://prices.azure.com/api/retail/prices';
            const armRegionName = location.toLowerCase().replace(/\s+/g, '');

            const filter = `serviceName eq 'Event Hubs' and armRegionName eq '${armRegionName}'`;
            const encodedFilter = encodeURIComponent(filter);
            const url = `${baseUrl}?$filter=${encodedFilter}`;

            const response = this.makeExternalRequest(url);

            if (response && response.Items && Array.isArray(response.Items)) {
                let tuRate = 0;
                let ingressRate = 0;

                const tierLower = skuName.toLowerCase();

                for (const item of response.Items as Array<{
                    meterName?: string;
                    productName?: string;
                    skuName?: string;
                    unitPrice?: number;
                }>) {
                    const meterName = (item.meterName || '').toLowerCase();
                    const productName = (item.productName || '').toLowerCase();
                    const itemSku = (item.skuName || '').toLowerCase();
                    const price = item.unitPrice || 0;

                    if (price <= 0) continue;

                    // Match the correct tier
                    if (!productName.includes(tierLower) && !itemSku.includes(tierLower)) continue;

                    if (meterName.includes('throughput unit') || meterName.includes('processing unit')) {
                        if (tuRate === 0) tuRate = price;
                    } else if (meterName.includes('ingress') && meterName.includes('event')) {
                        if (ingressRate === 0) ingressRate = price;
                    }
                }

                if (tuRate > 0) {
                    return {
                        throughputUnitPerHour: tuRate,
                        ingressPerMillion: ingressRate > 0 ? ingressRate : 0,
                        source: 'Azure Retail Prices API'
                    };
                }
            }
        } catch (error) {
            throw new Error(`Failed to fetch Event Hubs pricing from Azure API: ${(error as Error).message}`);
        }

        throw new Error(`Could not retrieve Event Hubs ${skuName} pricing from Azure Retail Prices API`);
    }

    /**
     * Get detailed cost estimate for the Event Hubs namespace
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const namespaceName = this.definition.namespace_name;

        cli.output(`\n💰 Cost Estimate for Event Hubs Namespace: ${namespaceName}`);
        cli.output(`${'='.repeat(60)}`);

        const skuName = this.definition.sku.name;
        const capacity = this.definition.sku.capacity || 1;
        const location = this.definition.location;

        cli.output(`\n📊 Namespace Configuration:`);
        cli.output(`   Name: ${namespaceName}`);
        cli.output(`   Location: ${location}`);
        cli.output(`   SKU: ${skuName}`);
        cli.output(`   Capacity: ${capacity} ${skuName === 'Premium' ? 'Processing Unit(s)' : 'Throughput Unit(s)'}`);
        cli.output(`   Auto-Inflate: ${this.definition.is_auto_inflate_enabled || false}`);
        if (this.definition.is_auto_inflate_enabled && this.definition.maximum_throughput_units) {
            cli.output(`   Max Throughput Units: ${this.definition.maximum_throughput_units}`);
        }
        cli.output(`   Kafka Enabled: ${this.definition.kafka_enabled || false}`);

        const pricing = this.fetchEventHubsPricing(location, skuName);
        const hoursPerMonth = 730;

        cli.output(`\n💵 Pricing (${pricing.source}):`);
        cli.output(`   Per ${skuName === 'Premium' ? 'PU' : 'TU'}/hour: $${pricing.throughputUnitPerHour.toFixed(4)}`);
        if (pricing.ingressPerMillion > 0) {
            cli.output(`   Ingress Events: $${pricing.ingressPerMillion.toFixed(4)} per million`);
        }

        const tuMonthlyCost = capacity * pricing.throughputUnitPerHour * hoursPerMonth;

        // Get actual ingress event metrics from Azure Monitor
        const metrics = this.getEventHubsMetrics();
        let ingressCost = 0;
        if (metrics.incomingMessages > 0 && pricing.ingressPerMillion > 0 && skuName !== 'Premium') {
            ingressCost = (metrics.incomingMessages / 1000000) * pricing.ingressPerMillion;
        }

        cli.output(`\n💵 Cost Breakdown (Monthly):`);
        cli.output(`   ${skuName === 'Premium' ? 'Processing Units' : 'Throughput Units'} (${capacity} x $${pricing.throughputUnitPerHour.toFixed(4)}/hr x ${hoursPerMonth}hrs): $${tuMonthlyCost.toFixed(2)}`);
        if (skuName === 'Premium') {
            cli.output(`   Ingress Events: Included in PU cost`);
        } else if (metrics.incomingMessages > 0) {
            cli.output(`   Ingress Events (${metrics.incomingMessages.toLocaleString()} from Azure Monitor): $${ingressCost.toFixed(4)}`);
        } else {
            cli.output(`   Ingress Events: Azure Monitor metrics unavailable`);
        }

        const totalMonthlyCost = tuMonthlyCost + ingressCost;

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - Cost is primarily based on provisioned throughput/processing units`);
        cli.output(`   - Ingress events are charged per million events (Basic/Standard)`);
        cli.output(`   - Premium tier includes ingress events in the PU cost`);
        cli.output(`   - Auto-inflate may increase costs if TUs scale up`);
        cli.output(`   - Capture feature (if enabled) has additional storage costs`);
    }

    /**
     * Get Azure Monitor metrics for Event Hubs namespace (last 30 days).
     * Returns total incoming messages count.
     */
    private getEventHubsMetrics(): { incomingMessages: number } {
        try {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const timespan = `${thirtyDaysAgo.toISOString()}/${now.toISOString()}`;
            const resourcePath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${this.definition.namespace_name}`;

            const metricsPath = `${resourcePath}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=IncomingMessages&timespan=${timespan}&interval=P1D&aggregation=Total`;
            const response = this.makeAzureRequest("GET", metricsPath);

            if (response.error || !response.body) {
                return { incomingMessages: 0 };
            }

            const data = JSON.parse(response.body);
            const metrics = data.value || [];
            let incomingMessages = 0;

            for (const metric of metrics) {
                const timeseries = metric.timeseries || [];
                for (const ts of timeseries) {
                    const dataPoints = ts.data || [];
                    for (const point of dataPoints) {
                        incomingMessages += point.total || 0;
                    }
                }
            }

            return { incomingMessages };
        } catch {
            return { incomingMessages: 0 };
        }
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        try {
            const skuName = this.definition.sku.name;
            const capacity = this.definition.sku.capacity || 1;
            const location = this.definition.location;
            const hoursPerMonth = 730;

            const pricing = this.fetchEventHubsPricing(location, skuName);
            let totalMonthlyCost = capacity * pricing.throughputUnitPerHour * hoursPerMonth;

            // Add ingress event cost from Azure Monitor metrics (not for Premium tier)
            if (skuName !== 'Premium' && pricing.ingressPerMillion > 0) {
                const metrics = this.getEventHubsMetrics();
                if (metrics.incomingMessages > 0) {
                    totalMonthlyCost += (metrics.incomingMessages / 1000000) * pricing.ingressPerMillion;
                }
            }

            const result = {
                type: "azure-eventhubs-namespace",
                costs: {
                    month: {
                        amount: totalMonthlyCost.toFixed(2),
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "azure-eventhubs-namespace",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD",
                        error: (error as Error).message
                    }
                }
            };
            cli.output(JSON.stringify(result));
        }
    }

    /**
     * Regenerate authorization rule keys
     */
    @action("regenerate-key")
    regenerateKey(args?: Args): void {
        const keyType = args?.key_type as string || "PrimaryKey";
        const ruleName = args?.rule_name as string || "RootManageSharedAccessKey";

        cli.output(`🔄 Regenerating ${keyType} for rule: ${ruleName}`);

        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${this.definition.namespace_name}/authorizationRules/${ruleName}/regenerateKeys?api-version=${this.apiVersion}`;
        
        const response = this.makeAzureRequest("POST", path, { keyType });
        
        if (response.error) {
            cli.output(`❌ Failed to regenerate key: ${response.error}`);
            return;
        }

        cli.output(`✅ Successfully regenerated ${keyType}`);
        
        // Re-populate secrets if configured
        if (this.definition.primary_connection_string_secret_ref || 
            this.definition.secondary_connection_string_secret_ref) {
            this.populateSecrets();
        }
    }
}
