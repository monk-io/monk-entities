import cli from "cli";

import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./redis-base.ts";

/**
 * Redis Cloud subscription types
 */
export type SubscriptionType = "essentials" | "pro";

/**
 * Cloud providers supported by Redis Cloud
 */
export type CloudProvider = "AWS" | "GCP" | "AZURE";

/**
 * Availability types for subscriptions
 */
export type AvailabilityType = "No replication" | "Single-zone" | "Multi-zone";

/**
 * Payment methods
 */
export type PaymentMethodType = "credit-card" | "marketplace";

/**
 * Deployment types for subscriptions
 */
export type DeploymentType = "single-region" | "active-active";

/**
 * Memory storage types
 */
export type MemoryStorageType = "ram" | "ram-and-flash";

/**
 * Persistent storage encryption types
 */
export type PersistentStorageEncryptionType = "cloud-provider-managed-key" | "customer-managed-key";

/**
 * Database protocols
 */
export type DatabaseProtocol = "redis" | "memcached";

/**
 * Data persistence types
 */
export type DataPersistenceType = "none" | "aof-every-1-second" | "aof-every-write" | "snapshot-every-1-hour" | "snapshot-every-6-hours" | "snapshot-every-12-hours";

/**
 * RESP versions
 */
export type RespVersion = "resp2" | "resp3";

/**
 * Sharding types
 */
export type ShardingType = "default-regex-rules" | "custom-regex-rules" | "redis-oss-hashing";

/**
 * Database throughput specification
 */
export interface DatabaseThroughputSpec {
    by: string;
    value: number;
}

/**
 * Local throughput specification for Active-Active databases
 */
export interface LocalThroughput {
    read_ops_per_second: number;
    write_ops_per_second: number;
}

/**
 * Database module specification
 */
export interface DatabaseModuleSpec {
    name: string;
    parameters?: Record<string, any>;
}

/**
 * Subscription region networking specification
 */
export interface SubscriptionRegionNetworkingSpec {
    /**
     * Deployment CIDR
     * @description Required for Active-Active subscriptions. Deployment CIDR mask. Must be a valid CIDR format with a range of 256 IP addresses.
     */
    deployment_cidr: string;

    /**
     * VPC ID
     * @description Optional. Enter a VPC identifier that exists in the hosted AWS account. Creates a new VPC if not set.
     */
    vpc_id?: string;
}

/**
 * Subscription region specification
 */
export interface SubscriptionRegionSpec {
    /**
     * Region
     * @description Required. Deployment region as defined by the cloud provider.
     */
    region: string;

    /**
     * Multiple availability zones
     * @description Optional. Support deployment on multiple availability zones within the selected region. Default: 'false'
     */
    multiple_availability_zones?: boolean;

    /**
     * Preferred availability zones
     * @description Optional. List the zone ID(s) for your preferred availability zone(s) for the cloud provider and region.
     */
    preferred_availability_zones?: string[];

    /**
     * Networking
     * @description Optional. Cloud networking details, per region. Required if creating an Active-Active subscription.
     */
    networking?: SubscriptionRegionNetworkingSpec;
}

/**
 * Cloud provider specification
 */
export interface SubscriptionSpec {
    /**
     * Provider
     * @description Optional. Cloud provider. Default: 'AWS'
     */
    provider?: CloudProvider;

    /**
     * Cloud account ID
     * @description Optional. Cloud account identifier. Default: Redis internal cloud account (Cloud Account ID = 1).
     */
    cloud_account_id?: number;

    /**
     * Regions
     * @description Required. The cloud provider region or list of regions (Active-Active only) and networking details.
     */
    regions: SubscriptionRegionSpec[];
}

/**
 * Database specification for subscription
 */
export interface SubscriptionDatabaseSpec {
    /**
     * Database name
     * @description Required. Name of the database. Limited to 40 characters or less, must include only letters, digits, and hyphens ('-').
     */
    name: string;

    /**
     * Database protocol
     * @description Optional. Database protocol. Only set to 'memcached' if you have a legacy application. Default: 'redis'
     */
    protocol?: DatabaseProtocol;

    /**
     * Memory limit in GB (deprecated)
     * @description Optional. Total memory in GB, including replication and other overhead. You cannot set both dataset_size_in_gb and memory_limit_in_gb.
     */
    memory_limit_in_gb?: number;

    /**
     * Dataset size in GB
     * @description Optional. The maximum amount of data in the dataset for this database in GB.
     */
    dataset_size_in_gb?: number;

    /**
     * Support OSS Cluster API
     * @description Optional. Support Redis OSS Cluster API. Default: 'false'
     */
    support_oss_cluster_api?: boolean;

    /**
     * Data persistence
     * @description Optional. Type and rate of data persistence in persistent storage. Default: 'none'
     */
    data_persistence?: DataPersistenceType;

    /**
     * Replication
     * @description Optional. Databases replication. Default: 'true'
     */
    replication?: boolean;

    /**
     * Throughput measurement
     * @description Optional. Throughput measurement method.
     */
    throughput_measurement?: DatabaseThroughputSpec;

    /**
     * Local throughput measurement
     * @description Optional. Expected throughput per region for an Active-Active database.
     */
    local_throughput_measurement?: LocalThroughput[];

    /**
     * Modules
     * @description Optional. Redis advanced capabilities (also known as modules) to be provisioned in the database.
     */
    modules?: DatabaseModuleSpec[];

    /**
     * Quantity
     * @description Optional. Number of databases that will be created with these settings. Default: 1
     */
    quantity?: number;

    /**
     * Average item size in bytes
     * @description Optional. Relevant only to ram-and-flash (also known as Auto Tiering) subscriptions.
     */
    average_item_size_in_bytes?: number;

    /**
     * RESP version
     * @description Optional. Redis Serialization Protocol version. Must be compatible with Redis version.
     */
    resp_version?: RespVersion;

    /**
     * Redis version
     * @description Optional. If specified, redisVersion defines the Redis database version.
     */
    redis_version?: string;

    /**
     * Sharding type
     * @description Optional. Database Hashing policy.
     */
    sharding_type?: ShardingType;

    /**
     * Query performance factor
     * @description Optional. The query performance factor adds extra compute power specifically for search and query databases.
     */
    query_performance_factor?: string;
}

/**
 * Defines the immutable configuration properties for a Redis Cloud subscription entity.
 */
export interface ProSubscriptionDefinition extends RedisCloudEntityDefinition {
    /**
     * Subscription name
     * @description Optional. New subscription name.
     */
    name?: string;

    /**
     * Dry run
     * @description Optional. When 'false': Creates a deployment plan and deploys it, creating any resources required by the plan. When 'true': creates a read-only deployment plan and does not create any resources. Default: 'false'
     */
    dry_run?: boolean;

    /**
     * Deployment type
     * @description Optional. When 'single-region' or not set: Creates a single region subscription. When 'active-active': creates an Active-Active (multi-region) subscription.
     */
    deployment_type?: DeploymentType;

    /**
     * Payment method
     * @description Optional. The payment method for the subscription. If set to 'credit-card', 'payment_method_id' must be defined. Default: 'credit-card'
     */
    payment_method?: PaymentMethodType;

    /**
     * Payment method ID
     * @description Optional. A valid payment method ID for this account. Use GET /payment-methods to get a list of all payment methods for your account. This value is optional if 'payment_method' is 'marketplace', but required for all other account types.
     */
    payment_method_id?: number;

    /**
     * Memory storage
     * @description Optional. Memory storage preference: either 'ram' or a combination of 'ram-and-flash' (also known as Auto Tiering). Default: 'ram'
     */
    memory_storage?: MemoryStorageType;

    /**
     * Persistent storage encryption type
     * @description Optional. Persistent storage encryption secures data-at-rest for database persistence. You can use 'cloud-provider-managed-key' or 'customer-managed-key'. Default: 'cloud-provider-managed-key'
     */
    persistent_storage_encryption_type?: PersistentStorageEncryptionType;

    /**
     * Redis version
     * @description Optional. Defines the Redis version of the databases in the subscription. If not set, the Redis version for your databases will be the default version. Use GET /subscriptions/redis-versions to get a list of available Redis versions.
     */
    redis_version?: string;

    // /**
    //  * Cloud providers
    //  * @description Required. Cloud provider, region, and networking details.
    //  */
    // cloud_providers: SubscriptionSpec[];

    // /**
    //  * Databases
    //  * @description Required. One or more database specification(s) to create in this subscription.
    //  */
    // databases: SubscriptionDatabaseSpec[];

    /**
     * Payment method type
     * @description Type of payment method to auto-select
     */
    payment_method_type?: string;
}

/**
 * Represents the mutable runtime state of a Redis Cloud subscription entity.
 */
export interface ProSubscriptionState extends RedisCloudEntityState {
    /**
     * Entity ID from Redis Cloud
     */
    id?: string | number;

    /**
     * Whether the entity is ready/active
     */
    ready?: boolean;

    /**
     * Subscription name
     */
    name?: string;

    /**
     * Subscription status
     */
    status?: string;

    /**
     * Payment method ID used by the subscription
     */
    payment_method_id?: number;
}

/**
 * @description Redis Cloud Pro Subscription entity.
 * Creates and manages Redis Cloud Pro subscriptions for enterprise Redis deployments.
 * Subscriptions are containers that define cloud provider, region, and pricing.
 * 
 * ## Secrets
 * - Reads: secret names from `account_key_secret_ref`, `secret_key_secret_ref` properties - Redis Cloud API credentials
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.id` - Subscription ID
 * - `state.name` - Subscription name
 * - `state.status` - Subscription status (active, pending, etc.)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `redis-cloud/pro-database` - Create databases in this subscription
 */
export class ProSubscription extends RedisCloudEntity<ProSubscriptionDefinition, ProSubscriptionState> {

    /**
     * Get subscription prefix for API calls (essentials uses /fixed)
     */
    protected getSubscriptionPrefix(): string {
        return "";
    }

    /**
     * Make authenticated HTTP request to Redis Cloud API
     */
    protected override makeRequest(method: string, path: string, body?: any): any {
        try {
            const response = this.httpClient.request(method as any, path, { body });
            
            if (!response.ok) {
                const errorBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                throw new Error(`Redis Cloud API error: ${response.statusCode} ${response.status}. Body: ${errorBody || response.raw}`);
            }
            
            return response.data;
        } catch (error) {
            throw new Error(`${method} request to ${path} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected getEntityName(): string {
        return `Redis Cloud Subscription: ${this.definition.name}`;
    }

    /**
     * Select the appropriate payment method
     */
    private selectPaymentMethod(): number | undefined {
        if (this.definition.payment_method_id) {
            return this.definition.payment_method_id;
        }

        const paymentMethodType = this.definition.payment_method || this.definition.payment_method_type;
        
        if (!paymentMethodType) {
            return undefined;
        }

        const paymentMethodsData = this.makeRequest("GET", "/payment-methods");
        const paymentMethods = paymentMethodsData.paymentMethods || [];

        for (const paymentMethod of paymentMethods) {
            if (paymentMethod.type === paymentMethodType) {
                cli.output(`Selected payment method: ${JSON.stringify(paymentMethod)}`);
                return paymentMethod.id;
            }
        }

        throw new Error(`No matching payment method found for type: ${paymentMethodType}`);
    }

    /**
     * Create the subscription body for API requests
     */
    private createSubscriptionBody(): any {
        const paymentMethodId = this.selectPaymentMethod();
        
        const paymentMethod = this.definition.payment_method;

        const body: any = {
            name: this.definition.name,
            paymentMethodId
        };

        // Add optional properties if they exist, mapping snake_case to camelCase for API
        if (paymentMethod) {
            body.paymentMethod = paymentMethod;
        }

        if (this.definition.dry_run !== undefined) {
            body.dryRun = this.definition.dry_run;
        }

        if (this.definition.deployment_type) {
            body.deploymentType = this.definition.deployment_type;
        }

        if (this.definition.memory_storage) {
            body.memoryStorage = this.definition.memory_storage;
        }

        if (this.definition.persistent_storage_encryption_type) {
            body.persistentStorageEncryptionType = this.definition.persistent_storage_encryption_type;
        }

        if (this.definition.redis_version) {
            body.redisVersion = this.definition.redis_version;
        }

        // // Add required arrays
        // if (this.definition.cloud_providers) {
        //     body.cloudProviders = this.definition.cloud_providers;
        // }

        // if (this.definition.databases) {
        //     body.databases = this.definition.databases;
        // }

        return body;
    }

    /**
     * Sync subscription with Redis Cloud API
     */
    private syncSubscription(isUpdate: boolean = false): ProSubscriptionState {
        const subscriptionPrefix = this.getSubscriptionPrefix();
        const body = this.createSubscriptionBody();

        let response: any;
        if (isUpdate && this.state.id) {
            response = this.makeRequest("PUT", `${subscriptionPrefix}/subscriptions/${this.state.id}`, body);
        } else {
            response = this.makeRequest("POST", `${subscriptionPrefix}/subscriptions`, body);
        }

        cli.output(`Subscription API response: ${JSON.stringify(response)}`);

        // Wait for task completion
        const task = this.waitForTask(response.taskId);
        const resourceId = task.response.resourceId;

        // Get the subscription details
        const subscriptionData = this.makeRequest("GET", `${subscriptionPrefix}/subscriptions/${resourceId}`);
        
        cli.output(`Subscription details: ${JSON.stringify(subscriptionData)}`);

        // Transform response to state format
        const newState: ProSubscriptionState = {
            id: subscriptionData.id,
            name: subscriptionData.name,
            status: subscriptionData.status,
            ready: subscriptionData.status === "active",
            payment_method_id: subscriptionData.paymentMethodId,
            existing: false
        };

        return newState;
    }

    /**
     * Delete all databases in the subscription before deletion
     */
    private deleteSubscriptionDatabases(): void {
        const subscriptionPrefix = this.getSubscriptionPrefix();
        
        if (!this.state.id) {
            return;
        }

        const databasesData = this.makeRequest("GET", `${subscriptionPrefix}/subscriptions/${this.state.id}/databases`);
        const databases = databasesData.subscription?.databases || [];

        for (const database of databases) {
            cli.output(`Deleting database: ${database.name} (ID: ${database.databaseId})`);
            
            const deleteResponse = this.makeRequest("DELETE", 
                `${subscriptionPrefix}/subscriptions/${this.state.id}/databases/${database.databaseId}`);
            
            if (deleteResponse.taskId) {
                this.waitForTask(deleteResponse.taskId);
            }
        }
    }

    override create(): void {
        cli.output(`Creating Redis Cloud subscription: ${this.definition.name}`);
        
        try {
            // Check if subscription already exists (by name, since we don't have ID yet)
            const subscriptionPrefix = this.getSubscriptionPrefix();
            const existingSubscriptions = this.makeRequest("GET", `${subscriptionPrefix}/subscriptions`);
            
            for (const sub of existingSubscriptions.subscriptions || []) {
                if (sub.name === this.definition.name) {
                    cli.output(`Subscription ${this.definition.name} already exists with ID: ${sub.id}`);
                    this.state = {
                        id: sub.id,
                        name: sub.name,
                        status: sub.status,
                        ready: sub.status === "active",
                        payment_method_id: sub.paymentMethodId,
                        existing: true
                    };
                    return;
                }
            }

            // Create new subscription
            this.state = this.syncSubscription(false);
            cli.output(`Successfully created subscription with ID: ${this.state.id}`);
            
        } catch (error) {
            throw new Error(`Failed to create subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        cli.output(`Updating Redis Cloud subscription: ${this.definition.name} (ID: ${this.state.id})`);
        
        try {
            this.state = { ...this.state, ...this.syncSubscription(true) };
            cli.output(`Successfully updated subscription with ID: ${this.state.id}`);
            
        } catch (error) {
            throw new Error(`Failed to update subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No subscription to delete");
            return;
        }

        if (this.state.existing) {
            cli.output("Subscription existed before entity management - not deleting");
            return;
        }

        cli.output(`Deleting Redis Cloud subscription: ${this.definition.name} (ID: ${this.state.id})`);
        
        try {
            // Delete all databases first
            this.deleteSubscriptionDatabases();

            // Delete the subscription
            const subscriptionPrefix = this.getSubscriptionPrefix();
            const response = this.makeRequest("DELETE", `${subscriptionPrefix}/subscriptions/${this.state.id}`);
            
            if (response.taskId) {
                this.waitForTask(response.taskId);
            }

            this.state = {};
            cli.output("Successfully deleted subscription");
            
        } catch (error) {
            throw new Error(`Failed to delete subscription: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        try {
            const subscriptionPrefix = this.getSubscriptionPrefix();
            const subscriptionData = this.makeRequest("GET", `${subscriptionPrefix}/subscriptions/${this.state.id}`);
            
            const isReady = subscriptionData.status === "active";
            this.state.ready = isReady;
            this.state.status = subscriptionData.status;
            
            return isReady;
        } catch (error) {
            cli.output(`Error checking subscription readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
}