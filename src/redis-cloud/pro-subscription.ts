import cli from "cli";

import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./base.ts";

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
export interface ProSubscriptionDefinition extends RedisCloudEntityDefinition {
    /**
     * Subscription name
     * @description Name of the subscription
     */
    name: string;

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
 * Redis Cloud Subscription Entity
 * 
 * Manages Redis Cloud subscriptions which are containers for Redis databases.
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
        const paymentMethodId = this.selectPaymentMethod();

        return {
            name: this.definition.name,
            paymentMethod: this.definition.payment_method,
            paymentMethodId
        };
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