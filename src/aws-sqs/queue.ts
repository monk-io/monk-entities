import { AWSSQSEntity, AWSSQSDefinition, AWSSQSState } from "./sqs-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";
import {
    QueueAttributes,
    SQSMessage,
    validateQueueName,
    convertAttributesToApiFormat,
    validateMessageBodySize,
    DEFAULT_STANDARD_QUEUE_ATTRIBUTES,
    DEFAULT_FIFO_QUEUE_ATTRIBUTES
} from "./common.ts";

/**
 * Definition interface for AWS SQS Queue entity.
 * Configures queue properties including message retention, visibility timeout, and encryption.
 * @interface SQSQueueDefinition
 */
export interface SQSQueueDefinition extends AWSSQSDefinition {
    /** @description Queue name (append .fifo for FIFO queues) */
    queue_name: string;
    /** @description Default delay (seconds) for messages
     *  @default 0
     */
    delay_seconds?: number;
    /** @description Maximum message size in bytes
     *  @default 262144
     */
    maximum_message_size?: number;
    /** @description How long to retain messages (seconds)
     *  @default 345600
     */
    message_retention_period?: number;
    /** @description Long polling wait time (seconds)
     *  @default 0
     */
    receive_message_wait_time_seconds?: number;
    /** @description Visibility timeout (seconds)
     *  @default 30
     */
    visibility_timeout?: number;
    /** @description Whether this is a FIFO queue
     *  @default false
     */
    fifo_queue?: boolean;
    /** @description Enable content-based deduplication (FIFO only)
     *  @default false
     */
    content_based_deduplication?: boolean;
    /** @description KMS key ID/ARN for server-side encryption */
    kms_master_key_id?: string;
    /** @description KMS data key reuse period (seconds) */
    kms_data_key_reuse_period_seconds?: number;
    /** @description Dead-letter queue settings */
    redrive_policy?: {
        /** @description Target DLQ ARN */
        dead_letter_target_arn: string;
        /** @description Max receives before moving to DLQ */
        max_receive_count: number;
    };
    /** @description Redrive allow policy configuration */
    redrive_allow_policy?: {
        /** @description Redrive permission mode */
        redrive_permission: 'allowAll' | 'denyAll' | 'byQueue';
        /** @description Allowed source queue ARNs */
        source_queue_arns?: string[];
    };
    /** @description Enable SQS-managed server-side encryption
     *  @default false
     */
    sqs_managed_sse_enabled?: boolean;
    /** @description JSON policy document string */
    policy?: string;
    /** @description Resource tags for the queue */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS SQS Queue entity.
 * Contains runtime information about the created queue.
 * Inherits only essential fields: queue_url, queue_name, existing.
 * All other data (attributes, timestamps, etc.) obtained via API calls.
 * @interface SQSQueueState
 */
export interface SQSQueueState extends AWSSQSState {
}

/**
 * @description AWS SQS Queue entity.
 * Creates and manages Amazon SQS queues for reliable message-based communication.
 * Supports both standard queues (high throughput) and FIFO queues (ordered, exactly-once delivery).
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.queue_url` - Queue URL for sending/receiving messages
 * - `state.queue_arn` - Queue ARN for IAM policies and cross-service integration
 * - `state.queue_name` - Queue name
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-lambda/function` - Trigger Lambda functions from queue messages
 * - `aws-sns/topic` - Subscribe queue to SNS topic for fanout patterns
 * - `aws-iam/role` - Grant queue access to other services
 */
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

    checkLiveness(): boolean { return this.checkReadiness(); }

    
    @action("send-message")
    sendMessageAction(args?: Args): void {
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
    receiveMessagesAction(args?: Args): void {
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

    // ==================== COST ESTIMATION ====================

    /**
     * Get CloudWatch metrics for SQS queue (last 30 days)
     */
    private getSQSCloudWatchMetrics(): {
        numberOfMessagesSent: number;
        numberOfMessagesReceived: number;
        numberOfMessagesDeleted: number;
    } | null {
        if (!this.state.queue_name) return null;

        try {
            const endTime = new Date().toISOString();
            const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const period = 2592000;

            const getMetric = (metricName: string): number => {
                // Build query string manually (URLSearchParams not available in MonkEC)
                const queryParams = [
                    'Action=GetMetricStatistics',
                    'Version=2010-08-01',
                    'Namespace=AWS%2FSQS',
                    `MetricName=${encodeURIComponent(metricName)}`,
                    `StartTime=${encodeURIComponent(startTime)}`,
                    `EndTime=${encodeURIComponent(endTime)}`,
                    `Period=${period.toString()}`,
                    'Statistics.member.1=Sum',
                    'Dimensions.member.1.Name=QueueName',
                    `Dimensions.member.1.Value=${encodeURIComponent(this.state.queue_name!)}`
                ];

                const url = `https://monitoring.${this.definition.region}.amazonaws.com/?${queryParams.join('&')}`;
                const response = aws.get(url, {
                    service: 'monitoring',
                    region: this.definition.region
                });

                if (response.statusCode === 200) {
                    const sumMatch = response.body.match(/<Sum>([\d.]+)<\/Sum>/);
                    return sumMatch ? parseFloat(sumMatch[1]) : 0;
                }
                return 0;
            };

            return {
                numberOfMessagesSent: getMetric('NumberOfMessagesSent'),
                numberOfMessagesReceived: getMetric('NumberOfMessagesReceived'),
                numberOfMessagesDeleted: getMetric('NumberOfMessagesDeleted')
            };
        } catch (error) {
            return null;
        }
    }

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
            'af-south-1': 'Africa (Cape Town)',
            'ap-east-1': 'Asia Pacific (Hong Kong)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-south-2': 'Asia Pacific (Hyderabad)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'ap-southeast-2': 'Asia Pacific (Sydney)',
            'ap-southeast-3': 'Asia Pacific (Jakarta)',
            'ap-southeast-4': 'Asia Pacific (Melbourne)',
            'ap-northeast-1': 'Asia Pacific (Tokyo)',
            'ap-northeast-2': 'Asia Pacific (Seoul)',
            'ap-northeast-3': 'Asia Pacific (Osaka)',
            'ca-central-1': 'Canada (Central)',
            'eu-central-1': 'EU (Frankfurt)',
            'eu-central-2': 'EU (Zurich)',
            'eu-west-1': 'EU (Ireland)',
            'eu-west-2': 'EU (London)',
            'eu-west-3': 'EU (Paris)',
            'eu-south-1': 'EU (Milan)',
            'eu-south-2': 'EU (Spain)',
            'eu-north-1': 'EU (Stockholm)',
            'il-central-1': 'Israel (Tel Aviv)',
            'me-south-1': 'Middle East (Bahrain)',
            'me-central-1': 'Middle East (UAE)',
            'sa-east-1': 'South America (Sao Paulo)'
        };
    }

    /**
     * Fetch SQS pricing from AWS Price List API
     */
    private fetchSQSPricing(): {
        standardPerMillion: number;
        fifoPerMillion: number;
        source: string;
    } {
        const pricingRegion = 'us-east-1';
        const url = `https://api.pricing.${pricingRegion}.amazonaws.com/`;
        const location = this.getRegionToLocationMap()[this.definition.region];
        if (!location) {
            throw new Error(`Unsupported region for SQS pricing: ${this.definition.region}`);
        }

        // Fetch standard queue pricing
        const standardFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AWSQueueService' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'queueType', Value: 'Standard' }
        ];

        const standardResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AWSQueueService',
                Filters: standardFilters,
                MaxResults: 10
            })
        });

        // Fetch FIFO queue pricing
        const fifoFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AWSQueueService' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'queueType', Value: 'FIFO' }
        ];

        const fifoResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AWSQueueService',
                Filters: fifoFilters,
                MaxResults: 10
            })
        });

        // SQS pricing is per request; convert to per million
        if (standardResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${standardResponse.statusCode} for SQS standard queue pricing`);
        }
        const standardPerRequest = this.parsePricingResponse(standardResponse.body);
        if (standardPerRequest <= 0) {
            throw new Error('Could not parse SQS standard queue pricing from AWS Price List API response');
        }

        if (fifoResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${fifoResponse.statusCode} for SQS FIFO queue pricing`);
        }
        const fifoPerRequest = this.parsePricingResponse(fifoResponse.body);
        if (fifoPerRequest <= 0) {
            throw new Error('Could not parse SQS FIFO queue pricing from AWS Price List API response');
        }

        return {
            standardPerMillion: standardPerRequest * 1000000,
            fifoPerMillion: fifoPerRequest * 1000000,
            source: 'AWS Price List API'
        };
    }

    /**
     * Get detailed cost estimate for the SQS queue
     */
    @action("get-cost-estimate")
    getCostEstimate(): void {
        if (!this.state.queue_url) {
            throw new Error("Queue not created yet");
        }

        const isFifo = this.definition.fifo_queue === true;
        const pricing = this.fetchSQSPricing();
        const pricePerMillion = isFifo ? pricing.fifoPerMillion : pricing.standardPerMillion;

        cli.output(`\n💰 Cost Estimate for SQS Queue: ${this.state.queue_name}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📊 Queue Configuration:`);
        cli.output(`   Queue Name: ${this.state.queue_name}`);
        cli.output(`   Queue Type: ${isFifo ? 'FIFO' : 'Standard'}`);
        cli.output(`   Region: ${this.definition.region}`);

        cli.output(`\n💵 Pricing (${pricing.source}):`);
        cli.output(`   ${isFifo ? 'FIFO' : 'Standard'} Requests: $${pricePerMillion.toFixed(2)} per million`);
        cli.output(`   First 1 million requests/month: Free (free tier)`);

        const metrics = this.getSQSCloudWatchMetrics();
        let totalMonthlyCost = 0;

        if (metrics) {
            const totalRequests = metrics.numberOfMessagesSent + metrics.numberOfMessagesReceived + metrics.numberOfMessagesDeleted;
            totalMonthlyCost = (totalRequests / 1000000) * pricePerMillion;

            cli.output(`\n📈 Usage (Last 30 Days from CloudWatch):`);
            cli.output(`   Messages Sent: ${metrics.numberOfMessagesSent.toLocaleString()}`);
            cli.output(`   Messages Received: ${metrics.numberOfMessagesReceived.toLocaleString()}`);
            cli.output(`   Messages Deleted: ${metrics.numberOfMessagesDeleted.toLocaleString()}`);
            cli.output(`   Total API Requests: ${totalRequests.toLocaleString()}`);

            cli.output(`\n💵 Cost Breakdown:`);
            cli.output(`   Request Costs: $${totalMonthlyCost.toFixed(4)}`);
        } else {
            cli.output(`\n⚠️ CloudWatch metrics unavailable - usage costs not included`);
        }

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - SQS is purely usage-based (no fixed monthly cost)`);
        cli.output(`   - Each 64KB chunk of a message counts as one request`);
        cli.output(`   - Free tier: 1 million requests/month (not deducted above)`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        if (!this.state.queue_url) {
            const result = {
                type: "aws-sqs-queue",
                costs: { month: { amount: "0", currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const isFifo = this.definition.fifo_queue === true;
            const pricing = this.fetchSQSPricing();
            const pricePerMillion = isFifo ? pricing.fifoPerMillion : pricing.standardPerMillion;
            let totalMonthlyCost = 0;

            const metrics = this.getSQSCloudWatchMetrics();
            if (metrics) {
                const totalRequests = metrics.numberOfMessagesSent + metrics.numberOfMessagesReceived + metrics.numberOfMessagesDeleted;
                totalMonthlyCost = (totalRequests / 1000000) * pricePerMillion;
            }

            const result = {
                type: "aws-sqs-queue",
                costs: { month: { amount: totalMonthlyCost.toFixed(2), currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "aws-sqs-queue",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            };
            cli.output(JSON.stringify(result));
        }
    }
} 