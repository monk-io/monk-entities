import { AWSSNSEntity, AWSSNSDefinition, AWSSNSState } from "./sns-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";
import { validateTopicName, parseTopicArn, TopicAttributes, type SNSProtocol } from "./common.ts";

/**
 * Definition interface for AWS SNS Topic entity.
 * Configures topic properties including FIFO settings, encryption, and delivery policies.
 * @interface SNSTopicDefinition
 */
export interface SNSTopicDefinition extends AWSSNSDefinition {
    /** @description Name of the SNS topic */
    topic_name: string;
    /** @description Display name for the topic (max 100 characters) */
    display_name?: string;
    /** @description Whether this is a FIFO topic */
    fifo_topic?: boolean;
    /** @description Enable content-based deduplication for FIFO topics */
    content_based_deduplication?: boolean;
    /** @description KMS key ID for server-side encryption */
    kms_master_key_id?: string;
    /** @description JSON policy document for the topic */
    policy?: string;
    /** @description JSON delivery policy for the topic */
    delivery_policy?: string;
    /** @description Resource tags for the topic */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS SNS Topic entity.
 * Contains runtime information about the created topic.
 * @interface SNSTopicState
 */
export interface SNSTopicState extends AWSSNSState {
    /** @description SNS topic name */
    topic_name?: string;
    /** @description SNS topic ARN */
    topic_arn?: string;
    /** @description Whether the topic is FIFO */
    is_fifo?: boolean;
}

/**
 * @description AWS SNS Topic entity.
 * Creates and manages Amazon SNS topics for publish/subscribe messaging patterns.
 * Supports standard topics (high throughput) and FIFO topics (ordered delivery).
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.topic_arn` - Topic ARN for subscriptions and publishing
 * - `state.topic_name` - Topic name
 * - `state.is_fifo` - Whether this is a FIFO topic
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-sqs/queue` - Subscribe queues for fanout message distribution
 * - `aws-lambda/function` - Invoke functions on message publish
 * - `aws-sns/subscription` - Add email, HTTP, or other endpoint subscriptions
 */
export class SNSTopic extends AWSSNSEntity<SNSTopicDefinition, SNSTopicState> {
    
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    override create(): void {
        let topicName = this.definition.topic_name;

        // Validate topic name
        if (!validateTopicName(topicName)) {
            throw new Error(`Invalid topic name: ${topicName}. Must be 1-256 characters, alphanumeric, hyphens, and underscores only.`);
        }

        // FIFO topics must end with .fifo
        const isFifo = this.definition.fifo_topic === true;
        if (isFifo && !topicName.endsWith(".fifo")) {
            topicName = `${topicName}.fifo`;
            cli.output(`FIFO topic name adjusted to: ${topicName}`);
        } else if (!isFifo && topicName.endsWith(".fifo")) {
            throw new Error("Non-FIFO topic name cannot end with .fifo");
        }

        // Check if topic already exists
        try {
            const existingTopics = this.listTopics();
            const existing = existingTopics.find(arn => {
                const name = parseTopicArn(arn);
                return name === topicName;
            });

            if (existing) {
                cli.output(`Topic ${topicName} already exists (ARN: ${existing}), adopting it`);
                this.state.existing = true;
                this.state.topic_name = topicName;
                this.state.topic_arn = existing;
                this.state.is_fifo = existing.endsWith(".fifo");
                return;
            }
        } catch (_error) {
            // Continue with creation if listing fails
        }

        // Create new topic
        cli.output(`Creating SNS topic: ${topicName}`);
        const params: Record<string, string> = {
            Name: topicName
        };

        // Add attributes
        let attrIndex = 1;
        
        if (this.definition.display_name) {
            params[`Attributes.entry.${attrIndex}.key`] = TopicAttributes.DISPLAY_NAME;
            params[`Attributes.entry.${attrIndex}.value`] = this.definition.display_name;
            attrIndex++;
        }

        if (isFifo) {
            params[`Attributes.entry.${attrIndex}.key`] = TopicAttributes.FIFO_TOPIC;
            params[`Attributes.entry.${attrIndex}.value`] = "true";
            attrIndex++;

            if (this.definition.content_based_deduplication) {
                params[`Attributes.entry.${attrIndex}.key`] = TopicAttributes.CONTENT_BASED_DEDUPLICATION;
                params[`Attributes.entry.${attrIndex}.value`] = "true";
                attrIndex++;
            }
        }

        if (this.definition.kms_master_key_id) {
            params[`Attributes.entry.${attrIndex}.key`] = TopicAttributes.KMS_MASTER_KEY_ID;
            params[`Attributes.entry.${attrIndex}.value`] = this.definition.kms_master_key_id;
            attrIndex++;
        }

        if (this.definition.policy) {
            params[`Attributes.entry.${attrIndex}.key`] = TopicAttributes.POLICY;
            params[`Attributes.entry.${attrIndex}.value`] = this.definition.policy;
            attrIndex++;
        }

        if (this.definition.delivery_policy) {
            params[`Attributes.entry.${attrIndex}.key`] = TopicAttributes.DELIVERY_POLICY;
            params[`Attributes.entry.${attrIndex}.value`] = this.definition.delivery_policy;
            attrIndex++;
        }

        // Add tags
        if (this.definition.tags) {
            let tagIndex = 1;
            for (const [key, value] of Object.entries(this.definition.tags)) {
                params[`Tags.member.${tagIndex}.Key`] = key;
                params[`Tags.member.${tagIndex}.Value`] = value;
                tagIndex++;
            }
        }

        const response = this.snsRequest("CreateTopic", params);
        const topicArn = this.parseXmlField(response.body, "TopicArn");

        if (!topicArn) {
            throw new Error("Failed to extract TopicArn from CreateTopic response");
        }

        this.state.existing = false;
        this.state.topic_name = topicName;
        this.state.topic_arn = topicArn;
        this.state.is_fifo = isFifo;

        cli.output(`SNS topic created: ${topicArn}`);
    }

    override start(): void {
        // SNS topics don't have a start operation
        this.checkReadiness();
    }

    override stop(): void {
        // SNS topics don't have a stop operation
    }

    override update(): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        cli.output(`Updating SNS topic: ${this.state.topic_arn}`);

        // Update topic attributes
        if (this.definition.display_name !== undefined) {
            this.setTopicAttribute(TopicAttributes.DISPLAY_NAME, this.definition.display_name);
        }

        if (this.definition.kms_master_key_id !== undefined) {
            this.setTopicAttribute(TopicAttributes.KMS_MASTER_KEY_ID, this.definition.kms_master_key_id);
        }

        if (this.definition.policy !== undefined) {
            this.setTopicAttribute(TopicAttributes.POLICY, this.definition.policy);
        }

        if (this.definition.delivery_policy !== undefined) {
            this.setTopicAttribute(TopicAttributes.DELIVERY_POLICY, this.definition.delivery_policy);
        }

        cli.output("Topic updated successfully");
    }

    override delete(): void {
        if (!this.state.topic_arn) {
            return;
        }

        // Don't delete existing topics
        if (this.state.existing) {
            cli.output(`Topic ${this.state.topic_arn} was existing, not deleting`);
            return;
        }

        cli.output(`Deleting SNS topic: ${this.state.topic_arn}`);
        this.deleteTopic(this.state.topic_arn);

        this.state.topic_name = undefined;
        this.state.topic_arn = undefined;
        this.state.is_fifo = undefined;

        cli.output("Topic deleted successfully");
    }

    override checkReadiness(): boolean {
        if (!this.state.topic_arn) {
            return false;
        }

        try {
            // Try to get topic attributes to verify it exists and is accessible
            this.getTopicAttributes(this.state.topic_arn);
            return true;
        } catch (_error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    // API Methods

    private listTopics(): string[] {
        const response = this.snsRequest("ListTopics", {});
        return this.parseXmlArray(response.body, "Topics", "TopicArn");
    }

    private deleteTopic(topicArn: string): void {
        this.snsRequest("DeleteTopic", {
            TopicArn: topicArn
        });
    }

    private getTopicAttributes(topicArn: string): Record<string, string> {
        const response = this.snsRequest("GetTopicAttributes", {
            TopicArn: topicArn
        });

        // Parse attributes from XML
        const attributes: Record<string, string> = {};
        const attrRegex = /<entry><key>([^<]+)<\/key><value>([^<]*)<\/value><\/entry>/g;
        let match;
        while ((match = attrRegex.exec(response.body)) !== null) {
            attributes[match[1]] = match[2];
        }

        return attributes;
    }

    private setTopicAttribute(attributeName: string, attributeValue: string): void {
        this.snsRequest("SetTopicAttributes", {
            TopicArn: this.state.topic_arn!,
            AttributeName: attributeName,
            AttributeValue: attributeValue
        });
    }

    private listSubscriptionsByTopic(topicArn: string): any[] {
        const response = this.snsRequest("ListSubscriptionsByTopic", {
            TopicArn: topicArn
        });

        // Parse subscriptions from XML (simplified)
        const subscriptions: any[] = [];
        const subRegex = /<member>(.*?)<\/member>/gs;
        let match;
        while ((match = subRegex.exec(response.body)) !== null) {
            const subXml = match[1];
            const arnMatch = /<SubscriptionArn>([^<]+)<\/SubscriptionArn>/.exec(subXml);
            const protocolMatch = /<Protocol>([^<]+)<\/Protocol>/.exec(subXml);
            const endpointMatch = /<Endpoint>([^<]+)<\/Endpoint>/.exec(subXml);
            
            if (arnMatch && protocolMatch && endpointMatch) {
                subscriptions.push({
                    SubscriptionArn: arnMatch[1],
                    Protocol: protocolMatch[1],
                    Endpoint: endpointMatch[1]
                });
            }
        }

        return subscriptions;
    }

    // Custom Actions

    @action("get-attributes")
    getAttributes(_args?: Args): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        const attributes = this.getTopicAttributes(this.state.topic_arn);
        
        cli.output(`\nTopic ARN: ${this.state.topic_arn}`);
        cli.output(`\nAttributes:`);
        cli.output(`${"=".repeat(60)}`);
        
        for (const [key, value] of Object.entries(attributes)) {
            // Format long values better
            if (value && value.length > 80) {
                cli.output(`${key}:`);
                cli.output(`  ${value.substring(0, 77)}...`);
            } else {
                cli.output(`${key}: ${value || "(empty)"}`);
            }
        }
        
        cli.output(`${"=".repeat(60)}`);
    }

    @action("list-subscriptions")
    listSubscriptions(_args?: Args): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        const subscriptions = this.listSubscriptionsByTopic(this.state.topic_arn);
        
        cli.output(`\nSubscriptions for topic: ${this.state.topic_arn}`);
        cli.output(`${"=".repeat(60)}`);
        
        if (subscriptions.length === 0) {
            cli.output("No subscriptions found");
        } else {
            subscriptions.forEach((sub, index) => {
                cli.output(`\nSubscription ${index + 1}:`);
                cli.output(`  ARN: ${sub.SubscriptionArn}`);
                cli.output(`  Protocol: ${sub.Protocol}`);
                cli.output(`  Endpoint: ${sub.Endpoint}`);
            });
        }
        
        cli.output(`\n${"=".repeat(60)}`);
        cli.output(`Total: ${subscriptions.length} subscription(s)`);
    }

    @action("subscribe")
    subscribe(args?: Args): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        const protocol = args?.protocol as SNSProtocol;
        const endpoint = args?.endpoint;

        if (!protocol || !endpoint) {
            throw new Error("Both 'protocol' and 'endpoint' are required (e.g., protocol=email endpoint=user@example.com)");
        }

        cli.output(`Creating subscription: ${protocol} -> ${endpoint}`);
        
        const response = this.snsRequest("Subscribe", {
            TopicArn: this.state.topic_arn,
            Protocol: protocol,
            Endpoint: endpoint
        });

        const subscriptionArn = this.parseXmlField(response.body, "SubscriptionArn");
        
        cli.output(`Subscription created: ${subscriptionArn}`);
        
        if (protocol === "email" || protocol === "email-json") {
            cli.output(`\nNote: Email subscriptions require confirmation. Check ${endpoint} for a confirmation email.`);
        }
    }

    @action("unsubscribe")
    unsubscribe(args?: Args): void {
        const subscriptionArn = args?.subscription_arn;

        if (!subscriptionArn) {
            throw new Error("'subscription_arn' is required (use list-subscriptions to find ARN)");
        }

        cli.output(`Unsubscribing: ${subscriptionArn}`);
        
        this.snsRequest("Unsubscribe", {
            SubscriptionArn: subscriptionArn
        });

        cli.output("Unsubscribed successfully");
    }

    @action("publish")
    publish(args?: Args): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        const message = args?.message;
        if (!message) {
            throw new Error("'message' is required (e.g., message='Hello World')");
        }

        const subject = args?.subject || "SNS Message";
        
        cli.output(`Publishing message to topic: ${this.state.topic_arn}`);
        
        const params: Record<string, string> = {
            TopicArn: this.state.topic_arn,
            Message: message,
            Subject: subject
        };

        // Add MessageGroupId for FIFO topics
        if (this.state.is_fifo) {
            const messageGroupId = args?.message_group_id || "default";
            params.MessageGroupId = messageGroupId;
            
            // Add MessageDeduplicationId if not using content-based deduplication
            if (!this.definition.content_based_deduplication) {
                const deduplicationId = args?.message_deduplication_id || `${Date.now()}-${Math.random()}`;
                params.MessageDeduplicationId = deduplicationId;
            }
        }

        const response = this.snsRequest("Publish", params);
        const messageId = this.parseXmlField(response.body, "MessageId");
        
        cli.output(`Message published successfully`);
        cli.output(`Message ID: ${messageId}`);
    }

    @action("add-permission")
    addPermission(args?: Args): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        const label = args?.label;
        const awsAccountId = args?.aws_account_id;
        const actionName = args?.action_name;

        if (!label || !awsAccountId || !actionName) {
            throw new Error("Required: label, aws_account_id, action_name (e.g., label=MyPermission aws_account_id=123456789012 action_name=Publish)");
        }

        cli.output(`Adding permission: ${label}`);
        
        this.snsRequest("AddPermission", {
            TopicArn: this.state.topic_arn,
            Label: label,
            "AWSAccountId.member.1": awsAccountId,
            "ActionName.member.1": actionName
        });

        cli.output("Permission added successfully");
    }

    @action("remove-permission")
    removePermission(args?: Args): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        const label = args?.label;
        if (!label) {
            throw new Error("'label' is required (permission label to remove)");
        }

        cli.output(`Removing permission: ${label}`);
        
        this.snsRequest("RemovePermission", {
            TopicArn: this.state.topic_arn,
            Label: label
        });

        cli.output("Permission removed successfully");
    }

    // ==================== COST ESTIMATION ====================

    /**
     * Parse pricing response from AWS Price List API
     */
    private parsePricingResponse(responseBody: string): number {
        try {
            const data = JSON.parse(responseBody);
            if (!data.PriceList || data.PriceList.length === 0) {
                return 0;
            }

            for (const priceItem of data.PriceList) {
                const product = typeof priceItem === 'string' ? JSON.parse(priceItem) : priceItem;
                const terms = product.terms?.OnDemand;
                if (!terms) continue;

                for (const termKey of Object.keys(terms)) {
                    const priceDimensions = terms[termKey].priceDimensions;
                    for (const dimKey of Object.keys(priceDimensions)) {
                        const pricePerUnit = parseFloat(priceDimensions[dimKey].pricePerUnit?.USD || '0');
                        if (pricePerUnit > 0) {
                            return pricePerUnit;
                        }
                    }
                }
            }
        } catch (error) {
            cli.output(`Warning: Failed to parse pricing: ${(error as Error).message}`);
        }
        return 0;
    }

    /**
     * Map AWS region codes to location names for Pricing API
     */
    private getRegionToLocationMap(): Record<string, string> {
        return {
            'us-east-1': 'US East (N. Virginia)',
            'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)',
            'us-west-2': 'US West (Oregon)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'ap-southeast-2': 'Asia Pacific (Sydney)',
            'ap-northeast-1': 'Asia Pacific (Tokyo)',
            'ap-northeast-2': 'Asia Pacific (Seoul)',
            'ca-central-1': 'Canada (Central)',
            'eu-central-1': 'EU (Frankfurt)',
            'eu-west-1': 'EU (Ireland)',
            'eu-west-2': 'EU (London)',
            'eu-west-3': 'EU (Paris)',
            'eu-north-1': 'EU (Stockholm)',
            'me-south-1': 'Middle East (Bahrain)',
            'sa-east-1': 'South America (Sao Paulo)'
        };
    }

    /**
     * Fetch SNS pricing from AWS Price List API
     */
    private fetchSNSPricing(): {
        publishPerMillion: number;
        httpDeliveryPer100k: number;
        source: string;
    } {
        const pricingRegion = 'us-east-1';
        const url = `https://api.pricing.${pricingRegion}.amazonaws.com/`;
        const location = this.getRegionToLocationMap()[this.region] || 'US East (N. Virginia)';

        // Fetch publish pricing
        const publishFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonSNS' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'group', Value: 'SNS-Requests-Tier1' }
        ];

        const publishResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AmazonSNS',
                Filters: publishFilters,
                MaxResults: 10
            })
        });

        // Fetch HTTP delivery pricing
        const httpFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonSNS' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'group', Value: 'SNS-HTTP-Notifications' }
        ];

        const httpResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AmazonSNS',
                Filters: httpFilters,
                MaxResults: 10
            })
        });

        if (publishResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${publishResponse.statusCode} for SNS publish pricing`);
        }
        const publishPerRequest = this.parsePricingResponse(publishResponse.body);
        if (publishPerRequest <= 0) {
            throw new Error('Could not parse SNS publish pricing from AWS Price List API response');
        }

        if (httpResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${httpResponse.statusCode} for SNS HTTP delivery pricing`);
        }
        const httpPerDelivery = this.parsePricingResponse(httpResponse.body);
        if (httpPerDelivery <= 0) {
            throw new Error('Could not parse SNS HTTP delivery pricing from AWS Price List API response');
        }

        return {
            publishPerMillion: publishPerRequest * 1000000,
            httpDeliveryPer100k: httpPerDelivery * 100000,
            source: 'AWS Price List API'
        };
    }

    /**
     * Get CloudWatch metrics for SNS topic (last 30 days)
     */
    private getSNSCloudWatchMetrics(): {
        numberOfMessagesPublished: number;
        numberOfNotificationsDelivered: number;
        numberOfNotificationsFailed: number;
    } | null {
        if (!this.state.topic_name) return null;

        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

            const getMetric = (metricName: string): number => {
                try {
                    const queryParams = [
                        'Action=GetMetricStatistics',
                        'Version=2010-08-01',
                        'Namespace=AWS%2FSNS',
                        `MetricName=${encodeURIComponent(metricName)}`,
                        `StartTime=${encodeURIComponent(startTime)}`,
                        `EndTime=${encodeURIComponent(endTime)}`,
                        'Period=2592000',
                        'Statistics.member.1=Sum',
                        'Dimensions.member.1.Name=TopicName',
                        `Dimensions.member.1.Value=${encodeURIComponent(this.state.topic_name!)}`
                    ];

                    const cwUrl = `https://monitoring.${this.region}.amazonaws.com/?${queryParams.join('&')}`;
                    const response = aws.get(cwUrl, {
                        service: 'monitoring',
                        region: this.region
                    });

                    if (response.statusCode === 200) {
                        const sumMatch = response.body.match(/<Sum>([\d.]+)<\/Sum>/);
                        return sumMatch ? parseFloat(sumMatch[1]) : 0;
                    }
                    return 0;
                } catch (_e) {
                    return 0;
                }
            };

            return {
                numberOfMessagesPublished: getMetric('NumberOfMessagesPublished'),
                numberOfNotificationsDelivered: getMetric('NumberOfNotificationsDelivered'),
                numberOfNotificationsFailed: getMetric('NumberOfNotificationsFailed')
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * Get detailed cost estimate for the SNS topic
     */
    @action("get-cost-estimate")
    getCostEstimate(): void {
        if (!this.state.topic_arn) {
            throw new Error("Topic not created yet");
        }

        const isFifo = this.state.is_fifo || this.definition.fifo_topic === true;
        const pricing = this.fetchSNSPricing();

        cli.output(`\n💰 Cost Estimate for SNS Topic: ${this.state.topic_name}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📊 Topic Configuration:`);
        cli.output(`   Topic Name: ${this.state.topic_name}`);
        cli.output(`   Topic Type: ${isFifo ? 'FIFO' : 'Standard'}`);
        cli.output(`   Topic ARN: ${this.state.topic_arn}`);
        cli.output(`   Region: ${this.region}`);

        cli.output(`\n💵 Pricing (${pricing.source}):`);
        cli.output(`   Publish: $${pricing.publishPerMillion.toFixed(2)} per million requests`);
        cli.output(`   HTTP/HTTPS Delivery: $${pricing.httpDeliveryPer100k.toFixed(2)} per 100,000`);
        cli.output(`   Email Delivery: $2.00 per 100,000`);
        cli.output(`   SQS Delivery: Free`);
        cli.output(`   Lambda Delivery: Free`);
        cli.output(`   SMS Delivery: Varies by country ($0.00645+ per message)`);

        const metrics = this.getSNSCloudWatchMetrics();
        let totalMonthlyCost = 0;

        if (metrics) {
            const publishCost = (metrics.numberOfMessagesPublished / 1000000) * pricing.publishPerMillion;
            const deliveryCost = (metrics.numberOfNotificationsDelivered / 100000) * pricing.httpDeliveryPer100k;
            totalMonthlyCost = publishCost + deliveryCost;

            cli.output(`\n📈 Usage (Last 30 Days from CloudWatch):`);
            cli.output(`   Messages Published: ${metrics.numberOfMessagesPublished.toLocaleString()}`);
            cli.output(`   Notifications Delivered: ${metrics.numberOfNotificationsDelivered.toLocaleString()}`);
            cli.output(`   Notifications Failed: ${metrics.numberOfNotificationsFailed.toLocaleString()}`);

            cli.output(`\n💵 Cost Breakdown:`);
            cli.output(`   Publish Costs: $${publishCost.toFixed(4)}`);
            cli.output(`   Delivery Costs: $${deliveryCost.toFixed(4)}`);
        } else {
            cli.output(`\n⚠️ CloudWatch metrics unavailable - usage costs not included`);
        }

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - SNS is purely usage-based (no fixed monthly cost)`);
        cli.output(`   - First 1 million publishes/month: Free (free tier)`);
        cli.output(`   - First 100,000 HTTP deliveries/month: Free`);
        cli.output(`   - First 1,000 email deliveries/month: Free`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        if (!this.state.topic_arn) {
            const result = {
                type: "aws-sns-topic",
                costs: { month: { amount: "0", currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const pricing = this.fetchSNSPricing();
            let totalMonthlyCost = 0;

            const metrics = this.getSNSCloudWatchMetrics();
            if (metrics) {
                const publishCost = (metrics.numberOfMessagesPublished / 1000000) * pricing.publishPerMillion;
                const deliveryCost = (metrics.numberOfNotificationsDelivered / 100000) * pricing.httpDeliveryPer100k;
                totalMonthlyCost = publishCost + deliveryCost;
            }

            const result = {
                type: "aws-sns-topic",
                costs: { month: { amount: totalMonthlyCost.toFixed(2), currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "aws-sns-topic",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            };
            cli.output(JSON.stringify(result));
        }
    }
}

