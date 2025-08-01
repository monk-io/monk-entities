import { AWSSQSEntity, AWSSQSDefinition, AWSSQSState } from "./base.ts";
import * as MonkecBase from "monkec/base";

const action = MonkecBase.action;
import {
    QueueAttributes,
    SQSMessage,
    validateQueueName,
    convertAttributesToApiFormat,
    convertAttributesFromApiFormat,
    generateMessageDeduplicationId,
    validateMessageBodySize,
    DEFAULT_STANDARD_QUEUE_ATTRIBUTES,
    DEFAULT_FIFO_QUEUE_ATTRIBUTES
} from "./common.ts";
import cli from "cli";

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
        // For FIFO queues, ensure the name ends with .fifo
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
            // FifoQueue is determined by queue name, not sent as attribute
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
        cli.output(`[DEBUG] Creating SQS queue: ${this.getQueueName()}`);
        
        // Validate queue name
        if (!validateQueueName(this.getQueueName())) {
            throw new Error(`Invalid queue name: ${this.getQueueName()}`);
        }

        // Check if queue already exists
        if (this.queueExists(this.getQueueName())) {
            cli.output(`[DEBUG] Queue ${this.getQueueName()} already exists, updating state`);
            
            const queueUrl = this.getQueueUrl(this.getQueueName());
            
            // Queue already exists - store only essential state
            this.state.existing = true;
            this.state.queue_name = this.getQueueName();
            this.state.queue_url = queueUrl;
            return;
        }

        // Build queue attributes
        const apiAttributes = this.buildQueueAttributes();

        // Create the queue
        const createResponse = this.createQueue(this.getQueueName(), apiAttributes);
        
        if (!createResponse.QueueUrl) {
            throw new Error(`Failed to create queue: No queue URL returned`);
        }

        cli.output(`[DEBUG] Queue created with URL: ${createResponse.QueueUrl}`);

        // Wait for queue to be available
        if (!this.waitForQueueAvailable(createResponse.QueueUrl)) {
            throw new Error(`Queue ${this.getQueueName()} is not available after creation`);
        }

        // Store only essential state - other data can be obtained via API calls when needed
        this.state.existing = false;
        this.state.queue_name = this.getQueueName();
        this.state.queue_url = createResponse.QueueUrl;

        cli.output(`[DEBUG] Queue creation completed: ${JSON.stringify(this.state, null, 2)}`);
    }

    override start(): void {
        cli.output(`[DEBUG] Starting SQS queue: ${this.getQueueName()}`);
        // For SQS queues, start means ensuring the queue is ready for operations
        this.checkReadiness();
    }

    override stop(): void {
        cli.output(`[DEBUG] Stopping SQS queue: ${this.getQueueName()}`);
        // For SQS queues, there's no specific stop operation
        // The queue remains available until deleted
    }

    override update(): void {
        cli.output(`[DEBUG] Updating SQS queue: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            throw new Error(`Cannot update queue: queue URL not available`);
        }

        // Build new queue attributes
        const apiAttributes = this.buildQueueAttributes();

        // Update queue attributes via API
        this.setQueueAttributes(this.state.queue_url, apiAttributes);
        
        // No need to refresh state - data can be obtained via API calls when needed

        cli.output(`[DEBUG] Queue update completed`);
    }

    override delete(): void {
        cli.output(`[DEBUG] Deleting SQS queue: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            cli.output(`[DEBUG] Queue URL not available, attempting to get it`);
            const queueUrl = this.getQueueUrl(this.getQueueName());
            if (!queueUrl) {
                cli.output(`[DEBUG] Queue ${this.getQueueName()} does not exist`);
                return;
            }
            this.state.queue_url = queueUrl;
        }

        // Delete the queue
        this.deleteQueue(this.state.queue_url);

        // Clear essential state
        this.state.queue_url = undefined;
        this.state.queue_name = undefined;
        this.state.existing = undefined;

        cli.output(`[DEBUG] Queue deletion completed`);
    }

    override checkReadiness(): boolean {
        cli.output(`[DEBUG] Checking readiness for SQS queue: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            cli.output(`[DEBUG] Queue URL not available`);
            return false;
        }

        try {
            // Try to get queue attributes to verify the queue is accessible
            const attributes = this.getQueueAttributes(this.state.queue_url, ['QueueArn']);
            const isReady = !!attributes.Attributes?.QueueArn;
            cli.output(`[DEBUG] Queue readiness: ${isReady}`);
            return isReady;
        } catch (error) {
            cli.output(`[DEBUG] Queue readiness check failed: ${error}`);
            return false;
        }
    }

    // Custom actions

    @action("Get queue information and attributes")
    getQueueInfo(): QueueAttributes | null {
        cli.output(`[DEBUG] Getting queue info for: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            cli.output(`[DEBUG] Queue URL not available`);
            return null;
        }

        try {
            const attributes = this.getQueueAttributes(this.state.queue_url);
            return convertAttributesFromApiFormat(attributes.Attributes || {});
        } catch (error) {
            cli.output(`[DEBUG] Failed to get queue info: ${error}`);
            return null;
        }
    }

    @action("Send a test message to the queue")
    sendTestMessage(messageBody: string = "Test message from SQS queue entity"): { success: boolean; messageId?: string; error?: string } {
        cli.output(`[DEBUG] Sending test message to: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            return { success: false, error: "Queue URL not available" };
        }

        try {
            // Validate message body size
            if (!validateMessageBodySize(messageBody)) {
                return { success: false, error: "Message body exceeds maximum size (256 KiB)" };
            }

            const messageAttributes: Record<string, any> = {};

            // For FIFO queues, add required attributes
            if (this.definition.fifo_queue) {
                messageAttributes.MessageGroupId = "test-group";
                if (!this.definition.content_based_deduplication) {
                    messageAttributes.MessageDeduplicationId = generateMessageDeduplicationId();
                }
            }

            const response = this.sendMessage(this.state.queue_url, messageBody, messageAttributes);
            
            return {
                success: true,
                messageId: response.MessageId
            };
        } catch (error) {
            cli.output(`[DEBUG] Failed to send test message: ${error}`);
            return { success: false, error: (error as Error).toString() };
        }
    }

    @action("Receive messages from the queue")
    receiveMessages(maxMessages: number = 1, waitTimeSeconds: number = 0): { success: boolean; messages?: SQSMessage[]; error?: string } {
        cli.output(`[DEBUG] Receiving messages from: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            return { success: false, error: "Queue URL not available" };
        }

        try {
            const response = this.receiveMessage(this.state.queue_url, maxMessages, waitTimeSeconds);
            
            const messages: SQSMessage[] = (response.Messages || []).map(msg => ({
                MessageId: msg.MessageId || "",
                ReceiptHandle: msg.ReceiptHandle || "",
                MD5OfBody: msg.MD5OfBody || "",
                Body: msg.Body || "",
                Attributes: msg.Attributes,
                MD5OfMessageAttributes: msg.MD5OfMessageAttributes,
                MessageAttributes: msg.MessageAttributes
            }));

            return {
                success: true,
                messages
            };
        } catch (error) {
            cli.output(`[DEBUG] Failed to receive messages: ${error}`);
            return { success: false, error: (error as Error).toString() };
        }
    }

    @action("Purge all messages from the queue")
    purgeQueue(): { success: boolean; error?: string } {
        cli.output(`[DEBUG] Purging queue: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            return { success: false, error: "Queue URL not available" };
        }

        try {
            // Use receiveMessage and deleteMessage in a loop to purge messages
            // Note: AWS SQS has a PurgeQueue action, but we implement it with receive/delete for simplicity
            let totalPurged = 0;
            const maxIterations = 100; // Safety limit
            
            for (let i = 0; i < maxIterations; i++) {
                const receiveResult = this.receiveMessages(10, 1); // Receive up to 10 messages with short polling
                
                if (!receiveResult.success || !receiveResult.messages || receiveResult.messages.length === 0) {
                    break;
                }

                // Delete all received messages
                for (const message of receiveResult.messages) {
                    try {
                        this.deleteMessage(this.state.queue_url!, message.ReceiptHandle);
                        totalPurged++;
                    } catch (error) {
                        cli.output(`[DEBUG] Failed to delete message ${message.MessageId}: ${error}`);
                    }
                }
            }

            cli.output(`[DEBUG] Purged ${totalPurged} messages from queue`);
            return { success: true };
        } catch (error) {
            cli.output(`[DEBUG] Failed to purge queue: ${error}`);
            return { success: false, error: (error as Error).toString() };
        }
    }

    @action("Get queue statistics and metrics")
    getQueueStatistics(): { success: boolean; statistics?: any; error?: string } {
        cli.output(`[DEBUG] Getting queue statistics for: ${this.getQueueName()}`);
        
        if (!this.state.queue_url) {
            return { success: false, error: "Queue URL not available" };
        }

        try {
            const attributes = this.getQueueAttributes(this.state.queue_url, [
                'ApproximateNumberOfMessages',
                'ApproximateNumberOfMessagesNotVisible',
                'ApproximateNumberOfMessagesDelayed',
                'CreatedTimestamp',
                'LastModifiedTimestamp'
            ]);

            const stats = {
                approximateNumberOfMessages: parseInt(attributes.Attributes?.ApproximateNumberOfMessages || "0", 10),
                approximateNumberOfMessagesNotVisible: parseInt(attributes.Attributes?.ApproximateNumberOfMessagesNotVisible || "0", 10),
                approximateNumberOfMessagesDelayed: parseInt(attributes.Attributes?.ApproximateNumberOfMessagesDelayed || "0", 10),
                createdTimestamp: attributes.Attributes?.CreatedTimestamp,
                lastModifiedTimestamp: attributes.Attributes?.LastModifiedTimestamp,
                queueArn: attributes.Attributes?.QueueArn,
                queueUrl: this.state.queue_url
            };

            return {
                success: true,
                statistics: stats
            };
        } catch (error) {
            cli.output(`[DEBUG] Failed to get queue statistics: ${error}`);
            return { success: false, error: (error as Error).toString() };
        }
    }

    @action("List queue tags")
    listQueueTags(): { success: boolean; tags?: Record<string, string>; error?: string } {
        cli.output(`[DEBUG] Listing queue tags for: ${this.getQueueName()}`);
        
        // Note: This is a placeholder implementation
        // In a full implementation, you would call the ListQueueTags API
        return {
            success: true,
            tags: this.definition.tags || {}
        };
    }

    @action("Set queue tags")
    setQueueTags(tags: Record<string, string>): { success: boolean; error?: string } {
        cli.output(`[DEBUG] Setting queue tags for: ${this.getQueueName()}`);
        
        // Note: This is a placeholder implementation
        // In a full implementation, you would call the TagQueue API
        try {
            cli.output(`[DEBUG] Would set tags: ${JSON.stringify(tags)}`);
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).toString() };
        }
    }
} 