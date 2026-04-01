/**
 * GCP Pub/Sub Subscription Entity
 *
 * Creates and manages Google Cloud Pub/Sub subscriptions for consuming messages.
 *
 * @see https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.subscriptions
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { PUBSUB_API_URL } from "./common.ts";

/**
 * Definition for a Pub/Sub Subscription entity
 */
export interface PubsubSubscriptionDefinition extends GcpEntityDefinition {
    /**
     * @description Subscription name (3-255 characters)
     */
    name: string;

    /**
     * @description Topic to subscribe to. Can be a short name or full resource name (projects/{project}/topics/{name})
     */
    topic_name: string;

    /**
     * @description Acknowledgment deadline in seconds (10-600, default 10)
     */
    ack_deadline_seconds?: number;

    /**
     * @description How long to retain unacknowledged messages (e.g., "604800s" for 7 days, default "604800s")
     */
    message_retention_duration?: string;

    /**
     * @description Whether to retain acknowledged messages
     */
    retain_acked_messages?: boolean;

    /**
     * @description Message filter expression using Pub/Sub filtering syntax
     */
    filter?: string;

    /**
     * @description Enable exactly-once delivery semantics
     */
    enable_exactly_once_delivery?: boolean;

    /**
     * @description Push endpoint URL. If set, messages are pushed to this URL instead of pulled
     */
    push_endpoint?: string;

    /**
     * @description Full resource name of dead letter topic for failed deliveries
     */
    dead_letter_topic?: string;

    /**
     * @description Maximum delivery attempts before sending to dead letter topic (5-100, default 5)
     */
    max_delivery_attempts?: number;

    /**
     * @description Minimum retry backoff duration (e.g., "10s")
     */
    min_retry_delay?: string;

    /**
     * @description Maximum retry backoff duration (e.g., "600s")
     */
    max_retry_delay?: string;

    /**
     * @description Labels to apply to the subscription
     */
    labels?: Record<string, string>;

    /**
     * @description Expiration policy TTL. Set to "" (empty) to never expire. Default: 31 days
     */
    expiration_ttl?: string;
}

/**
 * State for a Pub/Sub Subscription entity
 */
export interface PubsubSubscriptionState extends GcpEntityState {
    /**
     * @description Full resource name of the subscription (projects/{project}/subscriptions/{name})
     */
    subscription_name?: string;

    /**
     * @description Full resource name of the subscribed topic
     */
    topic_name?: string;
}

/**
 * @description GCP Pub/Sub Subscription entity. Creates and manages subscriptions
 * for consuming messages from Pub/Sub topics via pull or push delivery.
 *
 * ## Required Permissions
 * - `pubsub.subscriptions.create` — create subscriptions
 * - `pubsub.subscriptions.get` — check existence and readiness
 * - `pubsub.subscriptions.update` — update configuration
 * - `pubsub.subscriptions.delete` — delete subscriptions
 * - `pubsub.subscriptions.consume` — pull messages (pull-messages action)
 * - `monitoring.timeSeries.list` — cost estimation metrics
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.subscription_name` — full subscription resource name
 * - `state.topic_name` — full topic resource name this subscription is attached to
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/pubsub-topic` — reads `state.topic_name` to know which topic to subscribe to
 * - `gcp/service-usage` — enable `pubsub.googleapis.com` API
 */
export class PubsubSubscription extends GcpEntity<PubsubSubscriptionDefinition, PubsubSubscriptionState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    protected getEntityName(): string {
        return `GCP Pub/Sub Subscription ${this.definition.name || 'unnamed'}`;
    }

    /**
     * Build the full resource name for this subscription
     */
    private getSubscriptionResourceName(): string {
        return `projects/${this.projectId}/subscriptions/${this.definition.name}`;
    }

    /**
     * Build the API URL for this subscription
     */
    private getSubscriptionUrl(): string {
        return `${PUBSUB_API_URL}/${this.getSubscriptionResourceName()}`;
    }

    /**
     * Resolve topic name to full resource name
     */
    private resolveTopicName(): string {
        const topic = this.definition.topic_name;
        if (topic.startsWith("projects/")) {
            return topic;
        }
        return `projects/${this.projectId}/topics/${topic}`;
    }

    /**
     * Build the subscription request body from definition
     */
    private buildSubscriptionBody(): Record<string, unknown> {
        const body: Record<string, unknown> = {
            topic: this.resolveTopicName(),
        };

        if (this.definition.ack_deadline_seconds !== undefined) {
            body.ackDeadlineSeconds = this.definition.ack_deadline_seconds;
        }

        if (this.definition.message_retention_duration) {
            body.messageRetentionDuration = this.definition.message_retention_duration;
        }

        if (this.definition.retain_acked_messages !== undefined) {
            body.retainAckedMessages = this.definition.retain_acked_messages;
        }

        if (this.definition.filter) {
            body.filter = this.definition.filter;
        }

        if (this.definition.enable_exactly_once_delivery !== undefined) {
            body.enableExactlyOnceDelivery = this.definition.enable_exactly_once_delivery;
        }

        if (this.definition.push_endpoint) {
            body.pushConfig = {
                pushEndpoint: this.definition.push_endpoint,
            };
        }

        if (this.definition.dead_letter_topic) {
            body.deadLetterPolicy = {
                deadLetterTopic: this.definition.dead_letter_topic,
                maxDeliveryAttempts: this.definition.max_delivery_attempts || 5,
            };
        }

        if (this.definition.min_retry_delay || this.definition.max_retry_delay) {
            body.retryPolicy = {};
            if (this.definition.min_retry_delay) {
                (body.retryPolicy as Record<string, unknown>).minimumBackoff = this.definition.min_retry_delay;
            }
            if (this.definition.max_retry_delay) {
                (body.retryPolicy as Record<string, unknown>).maximumBackoff = this.definition.max_retry_delay;
            }
        }

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        if (this.definition.expiration_ttl !== undefined) {
            if (this.definition.expiration_ttl === "") {
                // Never expire
                body.expirationPolicy = {};
            } else {
                body.expirationPolicy = { ttl: this.definition.expiration_ttl };
            }
        }

        return body;
    }

    override create(): void {
        const subUrl = this.getSubscriptionUrl();

        // Check if subscription already exists
        const existing = this.checkResourceExists(subUrl);
        if (existing) {
            this.state.existing = true;
            this.state.subscription_name = existing.name || this.getSubscriptionResourceName();
            this.state.topic_name = existing.topic || this.resolveTopicName();
            cli.output(`Adopted existing Pub/Sub subscription: ${this.state.subscription_name}`);
            return;
        }

        // Create the subscription — PUT is idempotent
        const body = this.buildSubscriptionBody();
        const result = this.put(subUrl, body);

        this.state.subscription_name = result.name || this.getSubscriptionResourceName();
        this.state.topic_name = result.topic || this.resolveTopicName();
        this.state.existing = false;
        cli.output(`Created Pub/Sub subscription: ${this.state.subscription_name}`);
    }

    override update(): void {
        if (!this.state.subscription_name) {
            this.create();
            return;
        }

        const subscriptionBody = this.buildSubscriptionBody();
        // Name is required in the subscription body for PATCH
        subscriptionBody.name = this.getSubscriptionResourceName();

        const updateMaskPaths: string[] = [];

        if (this.definition.ack_deadline_seconds !== undefined) updateMaskPaths.push("ackDeadlineSeconds");
        if (this.definition.message_retention_duration) updateMaskPaths.push("messageRetentionDuration");
        if (this.definition.retain_acked_messages !== undefined) updateMaskPaths.push("retainAckedMessages");
        if (this.definition.push_endpoint) updateMaskPaths.push("pushConfig");
        if (this.definition.dead_letter_topic) updateMaskPaths.push("deadLetterPolicy");
        if (this.definition.min_retry_delay || this.definition.max_retry_delay) updateMaskPaths.push("retryPolicy");
        if (this.definition.labels) updateMaskPaths.push("labels");
        if (this.definition.expiration_ttl !== undefined) updateMaskPaths.push("expirationPolicy");
        if (this.definition.enable_exactly_once_delivery !== undefined) updateMaskPaths.push("enableExactlyOnceDelivery");

        if (updateMaskPaths.length === 0) {
            cli.output("No updatable fields changed, skipping update");
            return;
        }

        const body = {
            subscription: subscriptionBody,
            updateMask: updateMaskPaths.join(","),
        };

        this.patch(this.getSubscriptionUrl(), body);
        cli.output(`Updated Pub/Sub subscription: ${this.state.subscription_name}`);
    }

    override delete(): void {
        if (!this.state.subscription_name) return;

        this.deleteResource(this.getSubscriptionUrl(), `Pub/Sub subscription ${this.definition.name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.subscription_name) return false;
        try {
            const result = this.get(this.getSubscriptionUrl());
            return Boolean(result && result.name);
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // =========================================================================
    // Actions
    // =========================================================================

    /**
     * Get subscription details
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.subscription_name) throw new Error("Subscription not created yet");

        const info = this.get(this.getSubscriptionUrl());
        cli.output(`\nPub/Sub Subscription: ${this.definition.name}`);
        cli.output(`  Resource Name: ${info.name}`);
        cli.output(`  Topic: ${info.topic}`);
        cli.output(`  Ack Deadline: ${info.ackDeadlineSeconds}s`);
        if (info.messageRetentionDuration) {
            cli.output(`  Message Retention: ${info.messageRetentionDuration}`);
        }
        if (info.pushConfig?.pushEndpoint) {
            cli.output(`  Push Endpoint: ${info.pushConfig.pushEndpoint}`);
        } else {
            cli.output(`  Delivery: Pull`);
        }
        if (info.filter) {
            cli.output(`  Filter: ${info.filter}`);
        }
        if (info.deadLetterPolicy) {
            cli.output(`  Dead Letter Topic: ${info.deadLetterPolicy.deadLetterTopic}`);
            cli.output(`  Max Delivery Attempts: ${info.deadLetterPolicy.maxDeliveryAttempts}`);
        }
        if (info.retryPolicy) {
            cli.output(`  Retry Backoff: ${info.retryPolicy.minimumBackoff || 'default'} - ${info.retryPolicy.maximumBackoff || 'default'}`);
        }
        if (info.enableExactlyOnceDelivery) {
            cli.output(`  Exactly-Once Delivery: enabled`);
        }
        if (info.labels && Object.keys(info.labels).length > 0) {
            cli.output(`  Labels: ${JSON.stringify(info.labels)}`);
        }
    }

    /**
     * Pull messages from the subscription
     */
    @action("pull-messages")
    pullMessages(args?: Args): void {
        if (!this.state.subscription_name) throw new Error("Subscription not created yet");

        const maxMessages = args?.max_messages ? parseInt(String(args.max_messages), 10) : 10;

        const pullUrl = `${this.getSubscriptionUrl()}:pull`;
        const result = this.post(pullUrl, {
            maxMessages,
        });

        const messages = result.receivedMessages || [];
        cli.output(`\nPulled ${messages.length} message(s) from ${this.definition.name}:`);

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const data = msg.message?.data ? this.base64Decode(msg.message.data) : '(empty)';
            cli.output(`\n  Message ${i + 1}:`);
            cli.output(`    ID: ${msg.message?.messageId || 'unknown'}`);
            cli.output(`    Data: ${data}`);
            if (msg.message?.attributes && Object.keys(msg.message.attributes).length > 0) {
                cli.output(`    Attributes: ${JSON.stringify(msg.message.attributes)}`);
            }
            if (msg.message?.publishTime) {
                cli.output(`    Published: ${msg.message.publishTime}`);
            }
            cli.output(`    Ack ID: ${msg.ackId}`);
        }

        // Acknowledge messages
        if (messages.length > 0) {
            const ackIds = messages.map((m: any) => m.ackId).filter(Boolean);
            if (ackIds.length > 0) {
                const ackUrl = `${this.getSubscriptionUrl()}:acknowledge`;
                this.post(ackUrl, { ackIds });
                cli.output(`\nAcknowledged ${ackIds.length} message(s)`);
            }
        }
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Extract price from a GCP Billing SKU
     */
    private extractPriceFromSku(sku: any): number {
        try {
            const pricingInfo = sku.pricingInfo;
            if (!pricingInfo || !Array.isArray(pricingInfo) || pricingInfo.length === 0) {
                return 0;
            }
            const tieredRates = pricingInfo[0].pricingExpression?.tieredRates;
            if (!tieredRates || !Array.isArray(tieredRates) || tieredRates.length === 0) {
                return 0;
            }
            for (const rate of tieredRates) {
                const unitPrice = rate.unitPrice;
                if (unitPrice) {
                    const units = parseInt(unitPrice.units || '0', 10);
                    const nanos = parseInt(unitPrice.nanos || '0', 10);
                    const price = units + (nanos / 1e9);
                    if (price > 0) {
                        return price;
                    }
                }
            }
        } catch {
            // Return 0 on any parsing error
        }
        return 0;
    }

    /**
     * Fetch Pub/Sub pricing from GCP Cloud Billing Catalog API
     */
    private fetchPubsubPricing(): {
        messageDeliveryPerTib: number;
        storagePerGibMonth: number;
        source: string;
    } {
        try {
            const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
            const servicesUrl = `${billingApiUrl}/services?pageSize=100`;
            const servicesResp = this.get(servicesUrl);

            let serviceId = '';
            if (servicesResp.services && Array.isArray(servicesResp.services)) {
                for (const svc of servicesResp.services) {
                    if (svc.displayName && svc.displayName.toLowerCase().includes('pub/sub')) {
                        serviceId = svc.name?.split('/').pop() || '';
                        break;
                    }
                }
            }

            if (!serviceId) {
                throw new Error('Pub/Sub service not found in Cloud Billing Catalog');
            }

            const skusUrl = `${billingApiUrl}/services/${serviceId}/skus?currencyCode=USD&pageSize=200`;
            const response = this.get(skusUrl);

            let deliveryRate = 0;
            let storageRate = 0;

            if (response.skus && Array.isArray(response.skus)) {
                for (const sku of response.skus) {
                    const desc = (sku.description || '').toLowerCase();
                    const price = this.extractPriceFromSku(sku);
                    if (price <= 0) continue;

                    if (desc.includes('message delivery') && !desc.includes('storage') && !desc.includes('seek')) {
                        if (deliveryRate === 0) deliveryRate = price;
                    } else if (desc.includes('message storage') || (desc.includes('retained') && desc.includes('storage'))) {
                        if (storageRate === 0) storageRate = price;
                    }
                }
            }

            if (deliveryRate === 0) deliveryRate = 40.0;
            if (storageRate === 0) storageRate = 0.27;

            return {
                messageDeliveryPerTib: deliveryRate,
                storagePerGibMonth: storageRate,
                source: deliveryRate === 40.0 ? 'Fallback pricing' : 'GCP Cloud Billing Catalog API',
            };
        } catch {
            return {
                messageDeliveryPerTib: 40.0,
                storagePerGibMonth: 0.27,
                source: 'Fallback pricing (API error)',
            };
        }
    }

    /**
     * Get usage metrics from Cloud Monitoring
     */
    private getSubscriptionMetrics(): {
        deliveredBytes: number;
        deliveredMessages: number;
        unackedMessages: number;
    } {
        const metrics = {
            deliveredBytes: 0,
            deliveredMessages: 0,
            unackedMessages: 0,
        };

        try {
            const monitoringUrl = 'https://monitoring.googleapis.com/v3';
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const endTime = now.toISOString();
            const startTime = thirtyDaysAgo.toISOString();

            const subId = this.definition.name;

            // Fetch delivered bytes (pull + push + StreamingPull)
            const bytesFilter = `metric.type="pubsub.googleapis.com/subscription/byte_cost" AND resource.labels.subscription_id="${subId}"`;
            const bytesUrl = `${monitoringUrl}/projects/${this.projectId}/timeSeries?filter=${encodeURIComponent(bytesFilter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            try {
                const bytesResp = this.get(bytesUrl);
                if (bytesResp.timeSeries && Array.isArray(bytesResp.timeSeries)) {
                    for (const ts of bytesResp.timeSeries) {
                        for (const point of ts.points || []) {
                            metrics.deliveredBytes += parseFloat(point.value?.int64Value || point.value?.doubleValue || '0');
                        }
                    }
                }
            } catch {
                // Metrics may not be available
            }

            // Fetch pull request count
            const pullFilter = `metric.type="pubsub.googleapis.com/subscription/pull_message_operation_count" AND resource.labels.subscription_id="${subId}"`;
            const pullUrl = `${monitoringUrl}/projects/${this.projectId}/timeSeries?filter=${encodeURIComponent(pullFilter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            try {
                const pullResp = this.get(pullUrl);
                if (pullResp.timeSeries && Array.isArray(pullResp.timeSeries)) {
                    for (const ts of pullResp.timeSeries) {
                        for (const point of ts.points || []) {
                            metrics.deliveredMessages += parseInt(point.value?.int64Value || point.value?.doubleValue || '0', 10);
                        }
                    }
                }
            } catch {
                // Not critical
            }
        } catch {
            // Return zero metrics on any error
        }

        return metrics;
    }

    /**
     * Calculate monthly cost
     */
    private calculateMonthlyCost(): { total: number; deliveryCost: number; storageCost: number; pricing: any; metrics: any } {
        const pricing = this.fetchPubsubPricing();
        const metrics = this.getSubscriptionMetrics();

        const TIB = 1024 * 1024 * 1024 * 1024;
        const GIB = 1024 * 1024 * 1024;

        // Data delivery cost
        const deliveryCost = (metrics.deliveredBytes / TIB) * pricing.messageDeliveryPerTib;

        // Storage cost (if retention is configured)
        let storageCost = 0;
        if (this.definition.message_retention_duration || this.definition.retain_acked_messages) {
            const retentionStr = this.definition.message_retention_duration || '604800s';
            const retentionSeconds = parseInt(retentionStr.replace('s', ''), 10) || 604800;
            const retentionDays = retentionSeconds / 86400;
            const dailyBytes = metrics.deliveredBytes / 30;
            const avgRetainedBytes = dailyBytes * retentionDays;
            storageCost = (avgRetainedBytes / GIB) * pricing.storagePerGibMonth;
        }

        // Apply free tier: 10 GB/month
        const FREE_TIER_BYTES = 10 * GIB;
        let adjustedDeliveryCost = deliveryCost;
        if (metrics.deliveredBytes <= FREE_TIER_BYTES) {
            adjustedDeliveryCost = 0;
        }

        return {
            total: adjustedDeliveryCost + storageCost,
            deliveryCost: adjustedDeliveryCost,
            storageCost,
            pricing,
            metrics,
        };
    }

    /**
     * Get detailed cost estimate for this subscription
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        if (!this.state.subscription_name) {
            cli.output("Subscription not created yet — no cost to estimate");
            return;
        }

        const { total, deliveryCost, storageCost, pricing, metrics } = this.calculateMonthlyCost();
        const GIB = 1024 * 1024 * 1024;
        const TIB = 1024 * 1024 * 1024 * 1024;

        cli.output(`\nCost Estimate for Pub/Sub Subscription: ${this.definition.name}`);
        cli.output(`  Project: ${this.projectId}`);
        cli.output(`  Topic: ${this.definition.topic_name}`);
        cli.output(`  Pricing Source: ${pricing.source}`);

        cli.output(`\nPricing Rates:`);
        cli.output(`  Message Delivery: $${pricing.messageDeliveryPerTib.toFixed(2)}/TiB`);
        cli.output(`  Message Storage:  $${pricing.storagePerGibMonth.toFixed(2)}/GiB-month`);

        cli.output(`\nUsage (last 30 days):`);
        cli.output(`  Delivered Data:     ${(metrics.deliveredBytes / GIB).toFixed(4)} GiB`);
        cli.output(`  Delivered Messages: ${metrics.deliveredMessages.toLocaleString()}`);

        cli.output(`\nCost Breakdown:`);
        cli.output(`  Data Delivery: $${deliveryCost.toFixed(4)} (${(metrics.deliveredBytes / TIB).toFixed(6)} TiB)`);
        cli.output(`  Message Storage: $${storageCost.toFixed(4)}`);
        cli.output(`  ─────────────────`);
        cli.output(`  Estimated Monthly Total: $${total.toFixed(2)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Free tier: 10 GB/month data delivery (shared across all topics/subscriptions)`);
        cli.output(`  - Minimum 1 KB assessed per pull/push request`);
        if (this.definition.push_endpoint) {
            cli.output(`  - Push delivery to: ${this.definition.push_endpoint}`);
        } else {
            cli.output(`  - Pull delivery mode`);
        }
    }

    /**
     * Standardized cost output for Monk billing system
     */
    @action("costs")
    costs(): void {
        if (!this.state.subscription_name) {
            cli.output(JSON.stringify({
                type: "gcp-pubsub-subscription",
                costs: { month: { amount: "0", currency: "USD" } }
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-pubsub-subscription",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } }
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-pubsub-subscription",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            }));
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Base64 decode a string (simple implementation for Goja runtime)
     */
    private base64Decode(str: string): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        let i = 0;
        const input = str.replace(/=+$/, '');

        while (i < input.length) {
            const a = chars.indexOf(input[i++]);
            const b = i < input.length ? chars.indexOf(input[i++]) : 0;
            const c = i < input.length ? chars.indexOf(input[i++]) : 0;
            const d = i < input.length ? chars.indexOf(input[i++]) : 0;

            const triplet = (a << 18) | (b << 12) | (c << 6) | d;

            result += String.fromCharCode((triplet >> 16) & 0xff);
            if (i - 2 < input.length) result += String.fromCharCode((triplet >> 8) & 0xff);
            if (i - 1 < input.length) result += String.fromCharCode(triplet & 0xff);
        }
        return result;
    }
}
