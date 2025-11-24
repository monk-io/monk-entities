import { AWSSNSEntity, AWSSNSDefinition, AWSSNSState } from "./base.ts";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;
import cli from "cli";
import { validateTopicName, parseTopicArn, TopicAttributes, type SNSProtocol } from "./common.ts";

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

export interface SNSTopicState extends AWSSNSState {
    /** @description SNS topic name */
    topic_name?: string;
    /** @description SNS topic ARN */
    topic_arn?: string;
    /** @description Whether the topic is FIFO */
    is_fifo?: boolean;
}

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
    getAttributes(_args?: MonkecBase.Args): void {
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
    listSubscriptions(_args?: MonkecBase.Args): void {
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
    subscribe(args?: MonkecBase.Args): void {
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
    unsubscribe(args?: MonkecBase.Args): void {
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
    publish(args?: MonkecBase.Args): void {
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
    addPermission(args?: MonkecBase.Args): void {
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
    removePermission(args?: MonkecBase.Args): void {
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
}

