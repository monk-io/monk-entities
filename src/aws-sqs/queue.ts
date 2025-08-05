import { AWSSQSEntity, AWSSQSDefinition, AWSSQSState } from "./base.ts";
import * as MonkecBase from "monkec/base";
import cli from "cli";
const action = MonkecBase.action;
import {
    QueueAttributes,
    SQSMessage,
    validateQueueName,
    convertAttributesToApiFormat,
    validateMessageBodySize,
    DEFAULT_STANDARD_QUEUE_ATTRIBUTES,
    DEFAULT_FIFO_QUEUE_ATTRIBUTES
} from "./common.ts";


export interface SQSQueueDefinition extends AWSSQSDefinition {
    queue_name: string;
    delay_seconds?: number;
    maximum_message_size?: number;
    message_retention_period?: number;
    receive_message_wait_time_seconds?: number;
    visibility_timeout?: number;
    fifo_queue?: boolean;
    content_based_deduplication?: boolean;
    kms_master_key_id?: string;
    kms_data_key_reuse_period_seconds?: number;
    redrive_policy?: {
        dead_letter_target_arn: string;
        max_receive_count: number;
    };
    redrive_allow_policy?: {
        redrive_permission: 'allowAll' | 'denyAll' | 'byQueue';
        source_queue_arns?: string[];
    };
    sqs_managed_sse_enabled?: boolean;
    policy?: string;
    tags?: Record<string, string>;
}

export interface SQSQueueState extends AWSSQSState {
    // Inherits only essential fields: queue_url, queue_name, existing
    // All other data (attributes, timestamps, etc.) obtained via API calls
}

export class SQSQueue extends AWSSQSEntity<SQSQueueDefinition, SQSQueueState> {
    
    protected getQueueName(): string {
        const baseName = this.definition.queue_name;
        // For FIFO queues, ensure the name ends with .fifo (AWS requirement)
        if (this.definition.fifo_queue && !baseName.endsWith('.fifo')) {
            return `${baseName}.fifo`;
        }
        return baseName;
    }

        private buildQueueAttributes(): Record<string, string> {
        const def = this.definition;
        const baseAttributes = def.fifo_queue ? 
            { ...DEFAULT_FIFO_QUEUE_ATTRIBUTES } : 
            { ...DEFAULT_STANDARD_QUEUE_ATTRIBUTES };
        
        const attributes: QueueAttributes = {
            ...baseAttributes,
            ...(def.delay_seconds !== undefined && { DelaySeconds: def.delay_seconds }),
            ...(def.maximum_message_size !== undefined && { MaximumMessageSize: def.maximum_message_size }),
            ...(def.message_retention_period !== undefined && { MessageRetentionPeriod: def.message_retention_period }),
            ...(def.receive_message_wait_time_seconds !== undefined && { ReceiveMessageWaitTimeSeconds: def.receive_message_wait_time_seconds }),
            ...(def.visibility_timeout !== undefined && { VisibilityTimeout: def.visibility_timeout }),
            // Include FifoQueue attribute only for FIFO queues (AWS rejects this attribute for standard queues)
            ...(def.fifo_queue === true && { FifoQueue: def.fifo_queue }),
            ...(def.content_based_deduplication !== undefined && def.fifo_queue && { ContentBasedDeduplication: def.content_based_deduplication }),
            ...(def.kms_master_key_id !== undefined && { KmsMasterKeyId: def.kms_master_key_id }),
            ...(def.kms_data_key_reuse_period_seconds !== undefined && { KmsDataKeyReusePeriodSeconds: def.kms_data_key_reuse_period_seconds }),
            ...(def.redrive_policy !== undefined && { RedrivePolicy: { deadLetterTargetArn: def.redrive_policy.dead_letter_target_arn, maxReceiveCount: def.redrive_policy.max_receive_count } }),
            ...(def.redrive_allow_policy !== undefined && { RedriveAllowPolicy: { redrivePermission: def.redrive_allow_policy.redrive_permission, sourceQueueArns: def.redrive_allow_policy.source_queue_arns ? [...def.redrive_allow_policy.source_queue_arns] : undefined } }),
            ...(def.sqs_managed_sse_enabled !== undefined && { SqsManagedSseEnabled: def.sqs_managed_sse_enabled }),
            ...(def.policy !== undefined && { Policy: def.policy })
        };

        return convertAttributesToApiFormat(attributes);
    }

    override create(): void {
        // Validate queue name
        if (!validateQueueName(this.getQueueName())) {
            throw new Error(`Invalid queue name: ${this.getQueueName()}`);
        }

        // Check if queue already exists
        if (this.queueExists(this.getQueueName())) {
            const queueUrl = this.getQueueUrl(this.getQueueName());
            
            // Get queue ARN from attributes
            const attributes = this.getQueueAttributes(queueUrl, ["QueueArn"]);
            const queueArn = attributes.Attributes?.QueueArn;
            
            // Queue already exists - store essential state including ARN
            this.state.existing = true;
            this.state.queue_name = this.getQueueName();
            this.state.queue_url = queueUrl;
            this.state.queue_arn = queueArn;
            return;
        }

        // Build queue attributes
        const apiAttributes = this.buildQueueAttributes();

        // Create the queue
        const createResponse = this.createQueue(this.getQueueName(), apiAttributes);
        
        if (!createResponse.QueueUrl) {
            throw new Error(`Failed to create queue: No queue URL returned`);
        }

        // Get queue ARN after creation
        const attributes = this.getQueueAttributes(createResponse.QueueUrl, ["QueueArn"]);
        const queueArn = attributes.Attributes?.QueueArn;

        // Store essential state including ARN for easy reference in templates
        this.state.existing = false;
        this.state.queue_name = this.getQueueName();
        this.state.queue_url = createResponse.QueueUrl;
        this.state.queue_arn = queueArn;
    }

    override start(): void {
        // For SQS queues, start means ensuring the queue is ready for operations
        this.checkReadiness();
    }

    override stop(): void {
        // For SQS queues, there's no specific stop operation
        // The queue remains available until deleted
    }

    override update(): void {
        if (!this.state.queue_url) {
            throw new Error('Queue URL not available for update');
        }

        const apiAttributes = this.buildQueueAttributes();
        this.setQueueAttributes(this.state.queue_url, apiAttributes);
    }

    override delete(): void {
        if (!this.state.queue_url) {
            try {
                this.state.queue_url = this.getQueueUrl(this.getQueueName());
            } catch (error) {
                // Queue doesn't exist, nothing to delete
                return;
            }
        }

        try {
            this.deleteQueue(this.state.queue_url);
        } catch (error) {
            throw new Error(`Failed to delete queue: ${(error as Error).toString()}`);
        }

        // Clear state
        this.state.queue_url = undefined;
        this.state.queue_name = undefined;
        this.state.queue_arn = undefined;
        this.state.existing = false;
    }

    override checkReadiness(): boolean {
        if (!this.state.queue_url) {
            return false;
        }

        try {
            const attributes = this.getQueueAttributes(this.state.queue_url, ["QueueArn"]);
            const isReady = !!(attributes.Attributes && attributes.Attributes.QueueArn);
            return isReady;
        } catch (error) {
            return false;
        }
    }

    @action("send-message")
    sendMessageAction(args?: MonkecBase.Args): void {
        const body = args?.body || args?.message;
        if (!body) {
            throw new Error("Message body is required");
        }

        if (!this.state.queue_url) {
            return;
        }

        try {
            if (!validateMessageBodySize(body)) {
                return;
            }

            const response = this.sendMessage(this.state.queue_url, body);

            cli.output(`Message sent: ${response.MessageId}`);
            
        } catch (error) {
            throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    @action("receive-messages")
    receiveMessagesAction(args?: MonkecBase.Args): void {
        const maxMessages = args?.maxMessages ? Math.min(parseInt(args.maxMessages), 10) : 1;
        const waitTimeSeconds = args?.waitTimeSeconds ? parseInt(args.waitTimeSeconds) : 0;

        if (!this.state.queue_url) {
            return;
        }

        try {
            const response = this.receiveMessage(this.state.queue_url, maxMessages, waitTimeSeconds);
            
            const messages: SQSMessage[] = (response.Messages || []).map(msg => ({
                MessageId: msg.MessageId || "",
                ReceiptHandle: msg.ReceiptHandle || "",
                MD5OfBody: "", // Will be empty since our receiveMessage implementation is simplified
                Body: msg.Body || "",
                Attributes: msg.Attributes || {},
                MD5OfMessageAttributes: undefined,
                MessageAttributes: msg.MessageAttributes || {}
            }));

            cli.output(`Received ${messages.length} messages`);
            cli.output(JSON.stringify(messages, null, 2));
        } catch (error) {
            throw new Error(`Failed to receive messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    @action("purge-messages")
    purgeQueue(): void {
        if (!this.state.queue_url) {
            return;
        }

        try {
            // AWS SQS doesn't have a single purge API call
            // We need to receive and delete messages in batches
            let totalPurged = 0;
            const maxIterations = 100; // Safety limit
            
            for (let i = 0; i < maxIterations; i++) {
                const response = this.receiveMessage(this.state.queue_url, 10, 0);
                
                if (!response.Messages || response.Messages.length === 0) {
                    break; // No more messages
                }
                
                // Delete each message
                for (const message of response.Messages) {
                    if (message.ReceiptHandle) {
                        try {
                            this.deleteMessage(this.state.queue_url, message.ReceiptHandle);
                            totalPurged++;
                        } catch (error) {
                            cli.output(`Failed to delete message: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        }
                    }
                }
            }

            cli.output(`Purged ${totalPurged} messages`);
        } catch (error) {
            throw new Error(`Failed to purge messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    @action("get-statistics")
    getQueueStatistics(): any {
        if (!this.state.queue_url) {
            return { success: false, error: "Queue URL not available" };
        }

        try {
            const attributes = this.getQueueAttributes(this.state.queue_url, [
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
                "ApproximateNumberOfMessagesDelayed",
                "CreatedTimestamp",
                "LastModifiedTimestamp"
            ]);

            if (!attributes.Attributes) {
                return { success: false, error: "No attributes returned" };
            }

            const statistics = {
                    approximateNumberOfMessages: parseInt(attributes.Attributes.ApproximateNumberOfMessages || "0"),
                    approximateNumberOfMessagesNotVisible: parseInt(attributes.Attributes.ApproximateNumberOfMessagesNotVisible || "0"),
                    approximateNumberOfMessagesDelayed: parseInt(attributes.Attributes.ApproximateNumberOfMessagesDelayed || "0"),
                    createdTimestamp: parseInt(attributes.Attributes.CreatedTimestamp || "0"),
                    lastModifiedTimestamp: parseInt(attributes.Attributes.LastModifiedTimestamp || "0"),
                    queueArn: this.state.queue_arn // Use stored ARN from state
                }
            return statistics;
        } catch (error) {
            throw new Error(`Failed to get queue statistics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
} 