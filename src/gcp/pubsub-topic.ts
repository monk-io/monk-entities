/**
 * GCP Pub/Sub Topic Entity
 *
 * Creates and manages Google Cloud Pub/Sub topics for asynchronous messaging.
 *
 * @see https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.topics
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { PUBSUB_API_URL } from "./common.ts";

/**
 * Schema encoding for messages validated against a schema
 */
export type SchemaEncoding = "JSON" | "BINARY";

/**
 * Definition for a Pub/Sub Topic entity
 */
export interface PubsubTopicDefinition extends GcpEntityDefinition {
    /**
     * @description Topic name (3-255 characters, letters, numbers, dashes, underscores, periods, tildes, plus, percent)
     */
    name: string;

    /**
     * @description Labels to apply to the topic
     */
    labels?: Record<string, string>;

    /**
     * @description How long to retain published messages (e.g., "604800s" for 7 days). Minimum 600s, maximum 2678400s (31 days)
     */
    message_retention_duration?: string;

    /**
     * @description Cloud KMS CryptoKey name for encrypting messages at rest
     */
    kms_key_name?: string;

    /**
     * @description Full resource name of a Pub/Sub schema for message validation
     */
    schema_name?: string;

    /**
     * @description Encoding of messages validated against the schema
     */
    schema_encoding?: SchemaEncoding;
}

/**
 * State for a Pub/Sub Topic entity
 */
export interface PubsubTopicState extends GcpEntityState {
    /**
     * @description Full resource name of the topic (projects/{project}/topics/{name})
     */
    topic_name?: string;
}

/**
 * @description GCP Pub/Sub Topic entity. Creates and manages Pub/Sub topics for
 * asynchronous publish-subscribe messaging between independent applications.
 *
 * ## Required Permissions
 * - `pubsub.topics.create` — create topics
 * - `pubsub.topics.get` — check existence and readiness
 * - `pubsub.topics.update` — update labels, retention, etc.
 * - `pubsub.topics.delete` — delete topics
 * - `pubsub.topics.publish` — publish messages (publish action)
 * - `pubsub.topics.list` — list subscriptions (list-subscriptions action)
 * - `monitoring.timeSeries.list` — cost estimation metrics
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.topic_name` — full topic resource name, used by `gcp/pubsub-subscription` to attach subscriptions
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/pubsub-subscription` — attach pull or push subscriptions to this topic
 * - `gcp/cloud-function` — trigger functions via Pub/Sub event trigger
 * - `gcp/service-usage` — enable `pubsub.googleapis.com` API
 */
export class PubsubTopic extends GcpEntity<PubsubTopicDefinition, PubsubTopicState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    protected getEntityName(): string {
        return `GCP Pub/Sub Topic ${this.definition.name || 'unnamed'}`;
    }

    /**
     * Build the full resource name for this topic
     */
    private getTopicResourceName(): string {
        return `projects/${this.projectId}/topics/${this.definition.name}`;
    }

    /**
     * Build the API URL for this topic
     */
    private getTopicUrl(): string {
        return `${PUBSUB_API_URL}/${this.getTopicResourceName()}`;
    }

    /**
     * Build the topic request body from definition
     */
    private buildTopicBody(): Record<string, unknown> {
        const body: Record<string, unknown> = {};

        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        if (this.definition.message_retention_duration) {
            body.messageRetentionDuration = this.definition.message_retention_duration;
        }

        if (this.definition.kms_key_name) {
            body.kmsKeyName = this.definition.kms_key_name;
        }

        if (this.definition.schema_name) {
            body.schemaSettings = {
                schema: this.definition.schema_name,
                encoding: this.definition.schema_encoding || "JSON",
            };
        }

        return body;
    }

    override create(): void {
        const topicUrl = this.getTopicUrl();

        // Check if topic already exists
        const existing = this.checkResourceExists(topicUrl);
        if (existing) {
            this.state.existing = true;
            this.state.topic_name = existing.name || this.getTopicResourceName();
            cli.output(`Adopted existing Pub/Sub topic: ${this.state.topic_name}`);
            return;
        }

        // Create the topic — PUT is idempotent for Pub/Sub topics
        const body = this.buildTopicBody();
        const result = this.put(topicUrl, body);

        this.state.topic_name = result.name || this.getTopicResourceName();
        this.state.existing = false;
        cli.output(`Created Pub/Sub topic: ${this.state.topic_name}`);
    }

    override update(): void {
        if (!this.state.topic_name) {
            this.create();
            return;
        }

        const body: Record<string, unknown> = {
            topic: this.buildTopicBody(),
        };

        // Build update mask from defined fields
        const updateMaskPaths: string[] = [];
        if (this.definition.labels) {
            (body.topic as Record<string, unknown>).labels = this.definition.labels;
            updateMaskPaths.push("labels");
        }
        if (this.definition.message_retention_duration) {
            (body.topic as Record<string, unknown>).messageRetentionDuration = this.definition.message_retention_duration;
            updateMaskPaths.push("messageRetentionDuration");
        }

        if (updateMaskPaths.length === 0) {
            cli.output("No updatable fields changed, skipping update");
            return;
        }

        body.updateMask = updateMaskPaths.join(",");

        this.patch(this.getTopicUrl(), body);
        cli.output(`Updated Pub/Sub topic: ${this.state.topic_name}`);
    }

    override delete(): void {
        if (!this.state.topic_name) return;

        this.deleteResource(this.getTopicUrl(), `Pub/Sub topic ${this.definition.name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.topic_name) return false;
        try {
            const result = this.get(this.getTopicUrl());
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
     * Get topic details
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.topic_name) throw new Error("Topic not created yet");

        const info = this.get(this.getTopicUrl());
        cli.output(`\nPub/Sub Topic: ${this.definition.name}`);
        cli.output(`  Resource Name: ${info.name}`);
        if (info.labels && Object.keys(info.labels).length > 0) {
            cli.output(`  Labels: ${JSON.stringify(info.labels)}`);
        }
        if (info.messageRetentionDuration) {
            cli.output(`  Message Retention: ${info.messageRetentionDuration}`);
        }
        if (info.kmsKeyName) {
            cli.output(`  KMS Key: ${info.kmsKeyName}`);
        }
        if (info.schemaSettings) {
            cli.output(`  Schema: ${info.schemaSettings.schema} (${info.schemaSettings.encoding})`);
        }
    }

    /**
     * Publish a message to the topic
     */
    @action("publish")
    publish(args?: Args): void {
        if (!this.state.topic_name) throw new Error("Topic not created yet");
        if (!args || !args.message) throw new Error("Required argument: message");

        const message: Record<string, unknown> = {
            data: this.base64Encode(String(args.message)),
        };

        if (args.attributes) {
            try {
                message.attributes = typeof args.attributes === "string"
                    ? JSON.parse(args.attributes)
                    : args.attributes;
            } catch {
                throw new Error("attributes must be a valid JSON object");
            }
        }

        if (args.ordering_key) {
            message.orderingKey = String(args.ordering_key);
        }

        const publishUrl = `${this.getTopicUrl()}:publish`;
        const result = this.post(publishUrl, { messages: [message] });

        const messageId = result.messageIds?.[0] || "unknown";
        cli.output(`Published message to ${this.definition.name} (ID: ${messageId})`);
    }

    /**
     * List subscriptions attached to this topic
     */
    @action("list-subscriptions")
    listSubscriptions(_args?: Args): void {
        if (!this.state.topic_name) throw new Error("Topic not created yet");

        const url = `${this.getTopicUrl()}/subscriptions`;
        const result = this.get(url);

        const subscriptions = result.subscriptions || [];
        cli.output(`\nSubscriptions for topic ${this.definition.name}:`);
        if (subscriptions.length === 0) {
            cli.output("  (none)");
        } else {
            for (const sub of subscriptions) {
                cli.output(`  - ${sub}`);
            }
        }
        cli.output(`\nTotal: ${subscriptions.length}`);
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
            // List services to find Pub/Sub service ID
            const servicesUrl = `${billingApiUrl}/services?pageSize=100`;
            const servicesResp = this.get(servicesUrl);

            let serviceId = '';
            if (servicesResp.services && Array.isArray(servicesResp.services)) {
                for (const svc of servicesResp.services) {
                    if (svc.displayName && svc.displayName.toLowerCase().includes('pub/sub')) {
                        // Extract service ID from name like "services/XXXX-YYYY-ZZZZ"
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

            // Fallback to well-known rates if API didn't return them
            if (deliveryRate === 0) deliveryRate = 40.0; // $40/TiB
            if (storageRate === 0) storageRate = 0.27;   // $0.27/GiB-month

            return {
                messageDeliveryPerTib: deliveryRate,
                storagePerGibMonth: storageRate,
                source: deliveryRate === 40.0 ? 'Fallback pricing' : 'GCP Cloud Billing Catalog API',
            };
        } catch (error) {
            // Fallback to published pricing
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
    private getPubsubMetrics(): {
        publishedBytes: number;
        publishedMessages: number;
        subscriptionCount: number;
    } {
        const metrics = {
            publishedBytes: 0,
            publishedMessages: 0,
            subscriptionCount: 0,
        };

        try {
            const monitoringUrl = 'https://monitoring.googleapis.com/v3';
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const endTime = now.toISOString();
            const startTime = thirtyDaysAgo.toISOString();

            const topicId = this.definition.name;

            // Fetch published bytes
            const bytesFilter = `metric.type="pubsub.googleapis.com/topic/byte_cost" AND resource.labels.topic_id="${topicId}"`;
            const bytesUrl = `${monitoringUrl}/projects/${this.projectId}/timeSeries?filter=${encodeURIComponent(bytesFilter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            try {
                const bytesResp = this.get(bytesUrl);
                if (bytesResp.timeSeries && Array.isArray(bytesResp.timeSeries)) {
                    for (const ts of bytesResp.timeSeries) {
                        for (const point of ts.points || []) {
                            metrics.publishedBytes += parseFloat(point.value?.int64Value || point.value?.doubleValue || '0');
                        }
                    }
                }
            } catch {
                // Metrics may not be available yet
            }

            // Fetch published message count
            const messagesFilter = `metric.type="pubsub.googleapis.com/topic/send_message_operation_count" AND resource.labels.topic_id="${topicId}"`;
            const messagesUrl = `${monitoringUrl}/projects/${this.projectId}/timeSeries?filter=${encodeURIComponent(messagesFilter)}&interval.startTime=${startTime}&interval.endTime=${endTime}&aggregation.alignmentPeriod=2592000s&aggregation.perSeriesAligner=ALIGN_SUM`;

            try {
                const messagesResp = this.get(messagesUrl);
                if (messagesResp.timeSeries && Array.isArray(messagesResp.timeSeries)) {
                    for (const ts of messagesResp.timeSeries) {
                        for (const point of ts.points || []) {
                            metrics.publishedMessages += parseInt(point.value?.int64Value || point.value?.doubleValue || '0', 10);
                        }
                    }
                }
            } catch {
                // Metrics may not be available yet
            }

            // Count subscriptions
            try {
                const subsUrl = `${this.getTopicUrl()}/subscriptions`;
                const subsResp = this.get(subsUrl);
                metrics.subscriptionCount = (subsResp.subscriptions || []).length;
            } catch {
                // Not critical
            }
        } catch {
            // Return zero metrics on any error
        }

        return metrics;
    }

    /**
     * Calculate monthly cost from metrics and pricing
     */
    private calculateMonthlyCost(): { total: number; deliveryCost: number; storageCost: number; pricing: any; metrics: any } {
        const pricing = this.fetchPubsubPricing();
        const metrics = this.getPubsubMetrics();

        const TIB = 1024 * 1024 * 1024 * 1024;
        const GIB = 1024 * 1024 * 1024;

        // Data delivery cost: published bytes * (1 + subscription_count) / TiB * rate
        // Each subscription receives a copy of the data
        const totalDeliveryBytes = metrics.publishedBytes * Math.max(1, metrics.subscriptionCount);
        const deliveryCost = (totalDeliveryBytes / TIB) * pricing.messageDeliveryPerTib;

        // Storage cost only applies if message_retention_duration is set
        let storageCost = 0;
        if (this.definition.message_retention_duration) {
            // Estimate storage as average retained bytes
            const retentionSeconds = parseInt(this.definition.message_retention_duration.replace('s', ''), 10) || 0;
            const retentionDays = retentionSeconds / 86400;
            const dailyBytes = metrics.publishedBytes / 30;
            const avgRetainedBytes = dailyBytes * retentionDays;
            storageCost = (avgRetainedBytes / GIB) * pricing.storagePerGibMonth;
        }

        // Apply free tier: 10 GB/month
        const FREE_TIER_BYTES = 10 * GIB;
        let adjustedDeliveryCost = deliveryCost;
        if (totalDeliveryBytes <= FREE_TIER_BYTES) {
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
     * Get detailed cost estimate for this topic
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        if (!this.state.topic_name) {
            cli.output("Topic not created yet — no cost to estimate");
            return;
        }

        const { total, deliveryCost, storageCost, pricing, metrics } = this.calculateMonthlyCost();
        const TIB = 1024 * 1024 * 1024 * 1024;
        const GIB = 1024 * 1024 * 1024;

        cli.output(`\nCost Estimate for Pub/Sub Topic: ${this.definition.name}`);
        cli.output(`  Project: ${this.projectId}`);
        cli.output(`  Pricing Source: ${pricing.source}`);

        cli.output(`\nPricing Rates:`);
        cli.output(`  Message Delivery: $${pricing.messageDeliveryPerTib.toFixed(2)}/TiB`);
        cli.output(`  Message Storage:  $${pricing.storagePerGibMonth.toFixed(2)}/GiB-month`);

        cli.output(`\nUsage (last 30 days):`);
        cli.output(`  Published Messages: ${metrics.publishedMessages.toLocaleString()}`);
        cli.output(`  Published Data:     ${(metrics.publishedBytes / GIB).toFixed(4)} GiB`);
        cli.output(`  Subscriptions:      ${metrics.subscriptionCount}`);

        cli.output(`\nCost Breakdown:`);
        cli.output(`  Data Delivery: $${deliveryCost.toFixed(4)} (${(metrics.publishedBytes * Math.max(1, metrics.subscriptionCount) / TIB).toFixed(6)} TiB)`);
        cli.output(`  Message Storage: $${storageCost.toFixed(4)}`);
        cli.output(`  ─────────────────`);
        cli.output(`  Estimated Monthly Total: $${total.toFixed(2)}`);

        cli.output(`\nNotes:`);
        cli.output(`  - Free tier: 10 GB/month data delivery`);
        cli.output(`  - Minimum 1 KB assessed per publish request`);
        cli.output(`  - Storage costs apply only with message retention enabled`);
        if (!this.definition.message_retention_duration) {
            cli.output(`  - Message retention is NOT configured (no storage cost)`);
        }
    }

    /**
     * Standardized cost output for Monk billing system
     */
    @action("costs")
    costs(): void {
        if (!this.state.topic_name) {
            cli.output(JSON.stringify({
                type: "gcp-pubsub-topic",
                costs: { month: { amount: "0", currency: "USD" } }
            }));
            return;
        }

        try {
            const { total } = this.calculateMonthlyCost();
            cli.output(JSON.stringify({
                type: "gcp-pubsub-topic",
                costs: { month: { amount: total.toFixed(2), currency: "USD" } }
            }));
        } catch (error) {
            cli.output(JSON.stringify({
                type: "gcp-pubsub-topic",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            }));
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /**
     * Base64 encode a string (simple implementation for Goja runtime)
     */
    private base64Encode(str: string): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        let i = 0;
        while (i < str.length) {
            const a = str.charCodeAt(i++);
            const b = i < str.length ? str.charCodeAt(i++) : 0;
            const c = i < str.length ? str.charCodeAt(i++) : 0;
            const triplet = (a << 16) | (b << 8) | c;

            result += chars[(triplet >> 18) & 0x3f];
            result += chars[(triplet >> 12) & 0x3f];
            result += i - 2 < str.length ? chars[(triplet >> 6) & 0x3f] : '=';
            result += i - 1 < str.length ? chars[triplet & 0x3f] : '=';
        }
        return result;
    }
}
