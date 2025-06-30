import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./base.ts";
import cli from "cli";

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
 * Defines the immutable configuration properties for a Redis Cloud subscription entity.
 */
export interface SubscriptionDefinition extends RedisCloudEntityDefinition {
    /**
     * Subscription type
     */
    subscription_type: SubscriptionType;
    /**
     * Subscription name
     * @description Name of the subscription
     */
    name: string;

    /**
     * Cloud provider
     * @description Cloud provider for the subscription (AWS, GCP, or AZURE)
     */
    provider: CloudProvider;

    /**
     * Region
     * @description Cloud provider region where the subscription will be created
     */
    region: string;

    /**
     * Redis Flex enabled
     * @description Whether Redis Flex is enabled for this subscription
     */
    redis_flex: boolean;

    /**
     * Size
     * @description Size of the subscription (memory size in GB)
     */
    size: number;

    /**
     * Availability
     * @description Availability configuration for the subscription
     */
    availability: AvailabilityType;

    /**
     * Support data persistence
     * @description Whether the subscription supports data persistence
     */
    support_data_persistence: boolean;

    /**
     * Support instant and daily backups
     * @description Whether the subscription supports instant and daily backups
     */
    support_instant_and_daily_backups: boolean;

    /**
     * Support replication
     * @description Whether the subscription supports replication
     */
    support_replication: boolean;

    /**
     * Support clustering
     * @description Whether the subscription supports clustering
     */
    support_clustering: boolean;

    /**
     * Support SSL
     * @description Whether the subscription supports SSL encryption
     */
    support_ssl: boolean;

    /**
     * Payment method
     * @description Payment method type (credit-card or marketplace)
     */
    payment_method?: PaymentMethodType;

    /**
     * Payment method ID
     * @description Specific payment method ID if known
     */
    payment_method_id?: number;

    /**
     * Payment method type
     * @description Type of payment method to auto-select
     */
    payment_method_type?: string;
}

/**
 * Represents the mutable runtime state of a Redis Cloud subscription entity.
 */
export interface SubscriptionState extends RedisCloudEntityState {
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
     * Plan ID used by the subscription
     */
    plan_id?: number;

    /**
     * Payment method ID used by the subscription
     */
    payment_method_id?: number;

    /**
     * Cloud provider information
     */
    provider?: CloudProvider;

    /**
     * Region information
     */
    region?: string;

    /**
     * Subscription type
     */
    type?: string;

    /**
     * Number of databases in the subscription
     */
    database_count?: number;
}

/**
 * Plan selection criteria interface
 */
interface PlanCriteria {
    provider: CloudProvider;
    region: string;
    redis_flex: boolean;
    size: number;
    availability: AvailabilityType;
    support_data_persistence: boolean;
    support_instant_and_daily_backups: boolean;
    support_replication: boolean;
    support_clustering: boolean;
    support_ssl: boolean;
}

/**
 * Redis Cloud Subscription Entity
 * 
 * Manages Redis Cloud subscriptions which are containers for Redis databases.
 * Supports both Essentials and Pro subscription types with automatic plan selection.
 */
export class Subscription extends RedisCloudEntity<SubscriptionDefinition, SubscriptionState> {

    /**
     * Get subscription prefix for API calls (essentials uses /fixed)
     */
    protected getSubscriptionPrefix(): string {
        return this.definition.subscription_type === "essentials" ? "/fixed" : "";
    }

    /**
     * Make authenticated HTTP request to Redis Cloud API
     */
    protected makeRequest(method: string, path: string, body?: any): any {
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

    /**
     * Wait for a Redis Cloud task to complete
     */
    protected waitForTask(taskId: string): string {
        const maxAttempts = 60; // 5 minutes with 5 second intervals
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const taskData = this.makeRequest("GET", `/tasks/${taskId}`);
                
                cli.output(`Task ${taskId} status: ${taskData.status} (attempt ${attempts + 1}/${maxAttempts})`);
                
                if (taskData.status === "completed") {
                    return taskData.resourceId;
                }
                
                if (taskData.status === "failed") {
                    throw new Error(`Task ${taskId} failed: ${taskData.description || 'Unknown error'}`);
                }
                
                // Wait 5 seconds before next check
                attempts++;
                if (attempts < maxAttempts) {
                    // Sleep for 5 seconds (in a real implementation, this would use proper async sleep)
                    const start = Date.now();
                    while (Date.now() - start < 5000) {
                        // Busy wait - not ideal but works for sync operations
                    }
                }
            } catch (error) {
                if (attempts === maxAttempts - 1) {
                    throw error;
                }
                attempts++;
                // Brief wait before retry
                const start = Date.now();
                while (Date.now() - start < 1000) {
                    // Busy wait
                }
            }
        }
        
        throw new Error(`Task ${taskId} did not complete within timeout period`);
    }

    protected getEntityName(): string {
        return `Redis Cloud Subscription: ${this.definition.name}`;
    }

    /**
     * Select the appropriate plan based on subscription requirements
     */
    private selectPlan(criteria: PlanCriteria): number {
        const subscriptionPrefix = this.getSubscriptionPrefix();
        const queryParams = `provider=${criteria.provider}&redisFlex=${criteria.redis_flex.toString()}`;

        const plansData = this.makeRequest("GET", `${subscriptionPrefix}/plans?${queryParams}`);
        const plans = plansData.plans || [];

        for (const plan of plans) {
            if (this.planMatches(plan, criteria)) {
                cli.output(`Selected plan: ${JSON.stringify(plan)}`);
                return plan.id;
            }
        }

        throw new Error("No matching plan found for the given subscription requirements");
    }

    /**
     * Check if a plan matches the given criteria
     */
    private planMatches(plan: any, criteria: PlanCriteria): boolean {
        return (
            plan.provider === criteria.provider &&
            plan.region === criteria.region &&
            plan.redisFlex === criteria.redis_flex &&
            plan.size === criteria.size &&
            plan.availability === criteria.availability &&
            plan.supportDataPersistence === criteria.support_data_persistence &&
            plan.supportInstantAndDailyBackups === criteria.support_instant_and_daily_backups &&
            plan.supportReplication === criteria.support_replication &&
            plan.supportClustering === criteria.support_clustering &&
            plan.supportSsl === criteria.support_ssl
        );
    }

    /**
     * Select the appropriate payment method
     */
    private selectPaymentMethod(): number | undefined {
        if (this.definition.payment_method_id) {
            return this.definition.payment_method_id;
        }

        if (!this.definition.payment_method_type) {
            return undefined;
        }

        const paymentMethodsData = this.makeRequest("GET", "/payment-methods");
        const paymentMethods = paymentMethodsData.paymentMethods || [];

        for (const paymentMethod of paymentMethods) {
            if (paymentMethod.type === this.definition.payment_method_type) {
                cli.output(`Selected payment method: ${JSON.stringify(paymentMethod)}`);
                return paymentMethod.id;
            }
        }

        throw new Error(`No matching payment method found for type: ${this.definition.payment_method_type}`);
    }

    /**
     * Create the subscription body for API requests
     */
    private createSubscriptionBody(): any {
        const planCriteria: PlanCriteria = {
            provider: this.definition.provider,
            region: this.definition.region,
            redis_flex: this.definition.redis_flex,
            size: this.definition.size,
            availability: this.definition.availability,
            support_data_persistence: this.definition.support_data_persistence,
            support_instant_and_daily_backups: this.definition.support_instant_and_daily_backups,
            support_replication: this.definition.support_replication,
            support_clustering: this.definition.support_clustering,
            support_ssl: this.definition.support_ssl
        };

        const planId = this.selectPlan(planCriteria);
        const paymentMethodId = this.selectPaymentMethod();

        return {
            name: this.definition.name,
            planId,
            paymentMethod: this.definition.payment_method,
            paymentMethodId
        };
    }

    /**
     * Sync subscription with Redis Cloud API
     */
    private syncSubscription(isUpdate: boolean = false): SubscriptionState {
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
        const resourceId = this.waitForTask(response.taskId);

        // Get the subscription details
        const subscriptionData = this.makeRequest("GET", `${subscriptionPrefix}/subscriptions/${resourceId}`);
        
        cli.output(`Subscription details: ${JSON.stringify(subscriptionData)}`);

        // Transform response to state format
        const newState: SubscriptionState = {
            ...subscriptionData,
            id: subscriptionData.id,
            name: subscriptionData.name,
            status: subscriptionData.status,
            ready: subscriptionData.status === "active",
            type: this.definition.subscription_type,
            existing: false
        };

        // Clean up response data
        delete (newState as any).links;

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
                        ...sub,
                        ready: sub.status === "active",
                        type: this.definition.subscription_type,
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