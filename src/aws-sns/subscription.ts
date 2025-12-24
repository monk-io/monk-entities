/**
 * @fileoverview AWS SNS Subscription entity for managing topic subscriptions.
 */

import { AWSSNSEntity, AWSSNSDefinition, AWSSNSState } from "./base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";

/**
 * Valid SNS subscription protocols
 */
export type SNSSubscriptionProtocol = 
    | "http" 
    | "https" 
    | "email" 
    | "email-json" 
    | "sms" 
    | "sqs" 
    | "lambda" 
    | "application" 
    | "firehose";

/**
 * Definition interface for AWS SNS Subscription entity.
 * Configures subscription properties including protocol, endpoint, and filtering policies.
 * @interface SNSSubscriptionDefinition
 */
export interface SNSSubscriptionDefinition extends AWSSNSDefinition {
    /** @description ARN of the SNS topic to subscribe to */
    topic_arn: string;

    /** @description Protocol for the subscription */
    protocol: SNSSubscriptionProtocol;

    /** @description Endpoint for the subscription (email, URL, queue ARN, etc.) */
    endpoint: string;

    /** @description JSON message filtering policy */
    filter_policy?: string;

    /** @description JSON delivery retry policy */
    delivery_policy?: string;

    /** @description Dead letter queue configuration (JSON string) */
    redrive_policy?: string;

    /** @description Enable raw message delivery (for SQS/HTTP) */
    raw_message_delivery?: boolean;

    /** @description Additional subscription attributes */
    attributes?: Record<string, string>;
}

/**
 * State interface for AWS SNS Subscription entity.
 * Contains runtime information about the created subscription.
 * @interface SNSSubscriptionState
 */
export interface SNSSubscriptionState extends AWSSNSState {
    /** @description ARN of the subscription */
    subscription_arn: string;

    /** @description Whether the subscription is pending confirmation */
    pending_confirmation: boolean;

    /** @description Protocol of the subscription */
    protocol: string;

    /** @description Endpoint of the subscription */
    endpoint: string;
}

/**
 * @description AWS SNS Subscription entity.
 * Creates and manages subscriptions to Amazon SNS topics for message delivery.
 * Supports protocols: HTTP/HTTPS, email, SMS, SQS, Lambda, application, and Firehose.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.subscription_arn` - Subscription ARN for management operations
 * - `state.protocol` - Subscription protocol (email, sqs, lambda, etc.)
 * - `state.endpoint` - Target endpoint receiving messages
 * - `state.pending_confirmation` - Whether subscription awaits confirmation
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-sns/topic` - The topic to subscribe to
 * - `aws-sqs/queue` - Use queue ARN as endpoint for SQS subscriptions
 * - `aws-lambda/function` - Use function ARN for Lambda subscriptions
 */
export class SNSSubscription extends AWSSNSEntity<SNSSubscriptionDefinition, SNSSubscriptionState> {
    entityKind = "sns-subscription" as const;

    static readiness = {
        period: 5,         // Check every 5 seconds
        initialDelay: 3,   // Wait 3 seconds before first check
        attempts: 20       // Up to 100 seconds of checking
    };

    /**
     * Create a new subscription or adopt an existing one
     */
    create(): void {
        const { topic_arn, protocol, endpoint } = this.definition;

        cli.output(`Creating SNS subscription: ${protocol}:${endpoint} to topic ${topic_arn}`);

        // Check if subscription already exists
        const existingSubscription = this.findExistingSubscription();
        
        if (existingSubscription) {
            cli.output(`Subscription already exists (ARN: ${existingSubscription.SubscriptionArn}), adopting it`);
            this.state = {
                subscription_arn: existingSubscription.SubscriptionArn,
                pending_confirmation: existingSubscription.SubscriptionArn === "PendingConfirmation",
                protocol: existingSubscription.Protocol,
                endpoint: existingSubscription.Endpoint,
                existing: true
            };
            return;
        }

        // Build subscription parameters
        const params: Record<string, string> = {
            TopicArn: topic_arn,
            Protocol: protocol,
            Endpoint: endpoint
        };
        
        // Add attributes
        let attrIndex = 1;
        
        if (this.definition.filter_policy) {
            params[`Attributes.entry.${attrIndex}.key`] = "FilterPolicy";
            params[`Attributes.entry.${attrIndex}.value`] = this.definition.filter_policy;
            attrIndex++;
        }
        
        if (this.definition.delivery_policy) {
            params[`Attributes.entry.${attrIndex}.key`] = "DeliveryPolicy";
            params[`Attributes.entry.${attrIndex}.value`] = this.definition.delivery_policy;
            attrIndex++;
        }
        
        if (this.definition.redrive_policy) {
            params[`Attributes.entry.${attrIndex}.key`] = "RedrivePolicy";
            params[`Attributes.entry.${attrIndex}.value`] = this.definition.redrive_policy;
            attrIndex++;
        }
        
        if (this.definition.raw_message_delivery !== undefined) {
            params[`Attributes.entry.${attrIndex}.key`] = "RawMessageDelivery";
            params[`Attributes.entry.${attrIndex}.value`] = String(this.definition.raw_message_delivery);
            attrIndex++;
        }
        
        // Add any custom attributes
        if (this.definition.attributes) {
            for (const [key, value] of Object.entries(this.definition.attributes)) {
                params[`Attributes.entry.${attrIndex}.key`] = key;
                params[`Attributes.entry.${attrIndex}.value`] = value;
                attrIndex++;
            }
        }

        // Execute Subscribe
        const response = this.snsRequest("Subscribe", params);

        // Parse response
        const subscriptionArn = this.parseXmlField(response.body, "SubscriptionArn");
        if (!subscriptionArn) {
            throw new Error("Failed to parse SubscriptionArn from response");
        }

        const isPending = subscriptionArn === "PendingConfirmation";

        cli.output(`SNS subscription created: ${subscriptionArn}`);
        if (isPending) {
            cli.output(`⚠️  Subscription is pending confirmation. Check ${endpoint} to confirm.`);
        }

        this.state = {
            subscription_arn: subscriptionArn,
            pending_confirmation: isPending,
            protocol,
            endpoint,
            existing: false
        };
    }

    /**
     * Update subscription attributes
     */
    update(): void {
        if (!this.state?.subscription_arn) {
            throw new Error("Cannot update: subscription not created");
        }

        // Can't update pending confirmations
        if (this.state.pending_confirmation) {
            cli.output("⚠️  Subscription is pending confirmation, skipping update");
            return;
        }

        cli.output(`Updating SNS subscription: ${this.state.subscription_arn}`);

        const updates: Record<string, string> = {};

        // Check for attribute changes
        if (this.definition.filter_policy !== undefined) {
            updates["FilterPolicy"] = this.definition.filter_policy;
        }
        
        if (this.definition.delivery_policy !== undefined) {
            updates["DeliveryPolicy"] = this.definition.delivery_policy;
        }
        
        if (this.definition.redrive_policy !== undefined) {
            updates["RedrivePolicy"] = this.definition.redrive_policy;
        }
        
        if (this.definition.raw_message_delivery !== undefined) {
            updates["RawMessageDelivery"] = String(this.definition.raw_message_delivery);
        }

        // Apply custom attributes
        if (this.definition.attributes) {
            Object.assign(updates, this.definition.attributes);
        }

        // Update each attribute
        for (const [key, value] of Object.entries(updates)) {
            this.setSubscriptionAttribute(key, value);
        }

        cli.output("Subscription updated successfully");
    }

    /**
     * Delete the subscription
     */
    delete(): void {
        if (!this.state?.subscription_arn) {
            cli.output("No subscription to delete");
            return;
        }

        // Don't delete adopted subscriptions
        if (this.state.existing) {
            cli.output(`Subscription ${this.state.subscription_arn} was adopted (existing=true), not deleting`);
            return;
        }

        // Can't unsubscribe pending confirmations
        if (this.state.pending_confirmation) {
            cli.output("Subscription is pending confirmation, skipping deletion");
            return;
        }

        cli.output(`Deleting SNS subscription: ${this.state.subscription_arn}`);

        this.snsRequest("Unsubscribe", {
            SubscriptionArn: this.state.subscription_arn
        });

        cli.output("SNS subscription deleted successfully");
    }

    /**
     * Check if subscription is ready (exists and confirmed)
     */
    override checkReadiness(): boolean {
        if (!this.state?.subscription_arn) {
            return false;
        }

        if (this.state.pending_confirmation) {
            return false;
        }

        // Verify subscription still exists
        try {
            const attributes = this.getSubscriptionAttributes();
            
            // Check if confirmed
            const arn = this.parseXmlField(attributes, "SubscriptionArn");
            if (arn === "PendingConfirmation") {
                return false;
            }

            return true;
        } catch (_error) {
            return false;
        }
    }

    override start(): void {
        // Subscriptions don't have a start operation
        this.checkReadiness();
    }

    override stop(): void {
        // Subscriptions don't have a stop operation
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    /**
     * Custom action: Get subscription attributes
     */
    @action("get-attributes")
    getAttributes(_args?: Args): Record<string, any> {
        if (!this.state?.subscription_arn || this.state.pending_confirmation) {
            throw new Error("Cannot get attributes: subscription not confirmed");
        }

        const response = this.getSubscriptionAttributes();
        return this.parseAttributes(response);
    }

    /**
     * Custom action: Set filter policy
     */
    @action("set-filter-policy")
    setFilterPolicy(args?: Args): void {
        if (!this.state?.subscription_arn || this.state.pending_confirmation) {
            throw new Error("Cannot set filter policy: subscription not confirmed");
        }

        const filterPolicy = args?.filter_policy;
        if (!filterPolicy) {
            throw new Error("Required: filter_policy (JSON string)");
        }

        this.setSubscriptionAttribute("FilterPolicy", filterPolicy);
        cli.output("Filter policy updated");
    }

    /**
     * Custom action: Set redrive policy (DLQ)
     */
    @action("set-redrive-policy")
    setRedrivePolicy(args?: Args): void {
        if (!this.state?.subscription_arn || this.state.pending_confirmation) {
            throw new Error("Cannot set redrive policy: subscription not confirmed");
        }

        const redrivePolicy = args?.redrive_policy;
        if (!redrivePolicy) {
            throw new Error("Required: redrive_policy (JSON string with deadLetterTargetArn)");
        }

        this.setSubscriptionAttribute("RedrivePolicy", redrivePolicy);
        cli.output("Redrive policy updated");
    }

    /**
     * Custom action: Confirm subscription (for HTTP/HTTPS endpoints)
     */
    @action("confirm-subscription")
    confirmSubscription(args?: Args): void {
        if (!this.definition.topic_arn) {
            throw new Error("Topic ARN not available");
        }

        const token = args?.token;
        if (!token) {
            throw new Error("Required: token (confirmation token from SNS message)");
        }

        cli.output("Confirming subscription...");

        const response = this.snsRequest("ConfirmSubscription", {
            TopicArn: this.definition.topic_arn,
            Token: token
        });

        // Parse new subscription ARN
        const arn = this.parseXmlField(response.body, "SubscriptionArn");
        if (arn) {
            this.state.subscription_arn = arn;
            this.state.pending_confirmation = false;
            cli.output(`Subscription confirmed: ${arn}`);
        }
    }

    /**
     * Find existing subscription
     */
    private findExistingSubscription(): any | null {
        const { topic_arn, protocol, endpoint } = this.definition;

        cli.output(`Checking for existing subscription: ${protocol}:${endpoint}`);

        // List subscriptions for the topic
        try {
            const response = this.snsRequest("ListSubscriptionsByTopic", {
                TopicArn: topic_arn
            });

            // Parse subscriptions
            const subscriptions = this.parseSubscriptions(response.body);

            // Find matching subscription
            for (const sub of subscriptions) {
                if (sub.Protocol === protocol && sub.Endpoint === endpoint) {
                    return sub;
                }
            }
        } catch (_error) {
            // Topic might not exist yet, that's ok
            return null;
        }

        return null;
    }

    /**
     * Get subscription attributes
     */
    private getSubscriptionAttributes(): string {
        const response = this.snsRequest("GetSubscriptionAttributes", {
            SubscriptionArn: this.state.subscription_arn
        });

        return response.body;
    }

    /**
     * Set a subscription attribute
     */
    private setSubscriptionAttribute(name: string, value: string): void {
        cli.output(`Setting subscription attribute: ${name}`);

        this.snsRequest("SetSubscriptionAttributes", {
            SubscriptionArn: this.state.subscription_arn,
            AttributeName: name,
            AttributeValue: value
        });
    }

    /**
     * Parse subscriptions from ListSubscriptionsByTopic response
     */
    private parseSubscriptions(xml: string): any[] {
        const subscriptions: any[] = [];
        const memberRegex = /<member>([\s\S]*?)<\/member>/g;
        let match;

        while ((match = memberRegex.exec(xml)) !== null) {
            const memberXml = match[1];
            const subscription: any = {};

            const arnMatch = /<SubscriptionArn>([^<]+)<\/SubscriptionArn>/.exec(memberXml);
            const protocolMatch = /<Protocol>([^<]+)<\/Protocol>/.exec(memberXml);
            const endpointMatch = /<Endpoint>([^<]+)<\/Endpoint>/.exec(memberXml);

            if (arnMatch) subscription.SubscriptionArn = arnMatch[1];
            if (protocolMatch) subscription.Protocol = protocolMatch[1];
            if (endpointMatch) subscription.Endpoint = endpointMatch[1];

            subscriptions.push(subscription);
        }

        return subscriptions;
    }

    /**
     * Parse attributes from GetSubscriptionAttributes response
     */
    private parseAttributes(xml: string): Record<string, any> {
        const attributes: Record<string, any> = {};
        const entryRegex = /<entry><key>([^<]+)<\/key><value>([^<]*)<\/value><\/entry>/g;
        let match;

        while ((match = entryRegex.exec(xml)) !== null) {
            const key = match[1];
            const value = match[2];

            // Try to parse JSON values
            if (key === "FilterPolicy" || key === "DeliveryPolicy" || key === "RedrivePolicy") {
                try {
                    attributes[key] = JSON.parse(value);
                } catch {
                    attributes[key] = value;
                }
            } else if (key === "RawMessageDelivery") {
                attributes[key] = value === "true";
            } else {
                attributes[key] = value;
            }
        }

        return attributes;
    }
}
