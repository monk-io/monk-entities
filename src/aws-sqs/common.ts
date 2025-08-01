/**
 * Common utilities and helper functions for AWS SQS entities
 */
import cli from "cli";

export interface QueueAttributes {
    DelaySeconds?: number;
    MaximumMessageSize?: number;
    MessageRetentionPeriod?: number;
    Policy?: string;
    ReceiveMessageWaitTimeSeconds?: number;
    VisibilityTimeout?: number;
    FifoQueue?: boolean;
    ContentBasedDeduplication?: boolean;
    KmsMasterKeyId?: string;
    KmsDataKeyReusePeriodSeconds?: number;
    RedrivePolicy?: {
        deadLetterTargetArn: string;
        maxReceiveCount: number;
    };
    RedriveAllowPolicy?: {
        redrivePermission: 'allowAll' | 'denyAll' | 'byQueue';
        sourceQueueArns?: string[];
    };
    SqsManagedSseEnabled?: boolean;
}

export interface MessageAttributes {
    [key: string]: {
        StringValue?: string;
        BinaryValue?: Uint8Array;
        StringListValues?: string[];
        BinaryListValues?: Uint8Array[];
        DataType: string;
    };
}

export interface SQSMessage {
    MessageId: string;
    ReceiptHandle: string;
    MD5OfBody: string;
    Body: string;
    Attributes?: Record<string, string>;
    MD5OfMessageAttributes?: string;
    MessageAttributes?: MessageAttributes;
}

/**
 * Helper function to validate queue name according to AWS SQS rules
 */
export function validateQueueName(name: string): boolean {
    // Queue name rules:
    // - Must be 1-80 characters
    // - Can contain alphanumeric characters, hyphens, and underscores
    // - FIFO queues must end with .fifo
    if (!name || name.length < 1 || name.length > 80) {
        return false;
    }
    
    const validPattern = /^[a-zA-Z0-9_-]+(\\.fifo)?$/;
    return validPattern.test(name);
}

/**
 * Helper function to check if a queue name is for a FIFO queue
 */
export function isFifoQueue(queueName: string): boolean {
    return queueName.endsWith('.fifo');
}

/**
 * Helper function to extract queue name from queue URL
 */
export function extractQueueNameFromUrl(queueUrl: string): string {
    const parts = queueUrl.split('/');
    return parts[parts.length - 1];
}

/**
 * Helper function to extract AWS account ID from queue ARN
 */
export function extractAccountIdFromArn(arn: string): string {
    const parts = arn.split(':');
    return parts.length >= 5 ? parts[4] : '';
}

/**
 * Helper function to build queue ARN from components
 */
export function buildQueueArn(region: string, accountId: string, queueName: string): string {
    return `arn:aws:sqs:${region}:${accountId}:${queueName}`;
}

/**
 * Helper function to convert queue attributes to AWS API format
 */
export function convertAttributesToApiFormat(attributes: QueueAttributes): Record<string, string> {
    const apiAttributes: Record<string, string> = {};

    if (attributes.DelaySeconds !== undefined) {
        apiAttributes.DelaySeconds = attributes.DelaySeconds.toString();
    }
    if (attributes.MaximumMessageSize !== undefined) {
        apiAttributes.MaximumMessageSize = attributes.MaximumMessageSize.toString();
    }
    if (attributes.MessageRetentionPeriod !== undefined) {
        apiAttributes.MessageRetentionPeriod = attributes.MessageRetentionPeriod.toString();
    }
    if (attributes.Policy !== undefined) {
        apiAttributes.Policy = attributes.Policy;
    }
    if (attributes.ReceiveMessageWaitTimeSeconds !== undefined) {
        apiAttributes.ReceiveMessageWaitTimeSeconds = attributes.ReceiveMessageWaitTimeSeconds.toString();
    }
    if (attributes.VisibilityTimeout !== undefined) {
        apiAttributes.VisibilityTimeout = attributes.VisibilityTimeout.toString();
    }
    // FifoQueue is determined by queue name (ending with .fifo), not sent as attribute
    // ContentBasedDeduplication is only valid for FIFO queues
    if (attributes.ContentBasedDeduplication !== undefined) {
        apiAttributes.ContentBasedDeduplication = attributes.ContentBasedDeduplication.toString();
    }
    if (attributes.KmsMasterKeyId !== undefined) {
        apiAttributes.KmsMasterKeyId = attributes.KmsMasterKeyId;
    }
    if (attributes.KmsDataKeyReusePeriodSeconds !== undefined) {
        apiAttributes.KmsDataKeyReusePeriodSeconds = attributes.KmsDataKeyReusePeriodSeconds.toString();
    }
    if (attributes.RedrivePolicy !== undefined) {
        apiAttributes.RedrivePolicy = JSON.stringify(attributes.RedrivePolicy);
    }
    if (attributes.RedriveAllowPolicy !== undefined) {
        apiAttributes.RedriveAllowPolicy = JSON.stringify(attributes.RedriveAllowPolicy);
    }
    if (attributes.SqsManagedSseEnabled !== undefined) {
        apiAttributes.SqsManagedSseEnabled = attributes.SqsManagedSseEnabled.toString();
    }

    return apiAttributes;
}

/**
 * Helper function to convert AWS API attributes to typed format
 */
export function convertAttributesFromApiFormat(apiAttributes: Record<string, string>): QueueAttributes {
    const attributes: QueueAttributes = {};

    if (apiAttributes.DelaySeconds) {
        attributes.DelaySeconds = parseInt(apiAttributes.DelaySeconds, 10);
    }
    if (apiAttributes.MaximumMessageSize) {
        attributes.MaximumMessageSize = parseInt(apiAttributes.MaximumMessageSize, 10);
    }
    if (apiAttributes.MessageRetentionPeriod) {
        attributes.MessageRetentionPeriod = parseInt(apiAttributes.MessageRetentionPeriod, 10);
    }
    if (apiAttributes.Policy) {
        attributes.Policy = apiAttributes.Policy;
    }
    if (apiAttributes.ReceiveMessageWaitTimeSeconds) {
        attributes.ReceiveMessageWaitTimeSeconds = parseInt(apiAttributes.ReceiveMessageWaitTimeSeconds, 10);
    }
    if (apiAttributes.VisibilityTimeout) {
        attributes.VisibilityTimeout = parseInt(apiAttributes.VisibilityTimeout, 10);
    }
    if (apiAttributes.FifoQueue) {
        attributes.FifoQueue = apiAttributes.FifoQueue === 'true';
    }
    if (apiAttributes.ContentBasedDeduplication) {
        attributes.ContentBasedDeduplication = apiAttributes.ContentBasedDeduplication === 'true';
    }
    if (apiAttributes.KmsMasterKeyId) {
        attributes.KmsMasterKeyId = apiAttributes.KmsMasterKeyId;
    }
    if (apiAttributes.KmsDataKeyReusePeriodSeconds) {
        attributes.KmsDataKeyReusePeriodSeconds = parseInt(apiAttributes.KmsDataKeyReusePeriodSeconds, 10);
    }
    if (apiAttributes.RedrivePolicy) {
        try {
            attributes.RedrivePolicy = JSON.parse(apiAttributes.RedrivePolicy);
        } catch (error) {
            cli.output(`[DEBUG] Failed to parse RedrivePolicy: ${error}`);
        }
    }
    if (apiAttributes.RedriveAllowPolicy) {
        try {
            attributes.RedriveAllowPolicy = JSON.parse(apiAttributes.RedriveAllowPolicy);
        } catch (error) {
            cli.output(`[DEBUG] Failed to parse RedriveAllowPolicy: ${error}`);
        }
    }
    if (apiAttributes.SqsManagedSseEnabled) {
        attributes.SqsManagedSseEnabled = apiAttributes.SqsManagedSseEnabled === 'true';
    }

    return attributes;
}

/**
 * Helper function to generate a unique message deduplication ID for FIFO queues
 */
export function generateMessageDeduplicationId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp}-${random}`;
}

/**
 * Helper function to validate message body size
 */
export function validateMessageBodySize(body: string, maxSize: number = 262144): boolean {
    // AWS SQS maximum message size is 256 KiB (262,144 bytes)
    // Simple UTF-8 byte length approximation
    let byteLength = 0;
    for (let i = 0; i < body.length; i++) {
        const code = body.charCodeAt(i);
        if (code < 0x80) {
            byteLength += 1;
        } else if (code < 0x800) {
            byteLength += 2;
        } else if (code < 0x10000) {
            byteLength += 3;
        } else {
            byteLength += 4;
        }
    }
    return byteLength <= maxSize;
}

/**
 * Helper function to calculate MD5 hash of message body (simplified implementation)
 */
export function calculateMD5(content: string): string {
    // This is a placeholder implementation
    // In a real implementation, you would use a proper MD5 library
    return `md5-${content.length}-${Date.now()}`;
}

/**
 * Helper function to parse SQS error response
 */
export function parseSQSError(responseBody: string): { code: string; message: string } {
    try {
        const parsed = JSON.parse(responseBody);
        return {
            code: parsed.Error?.Code || 'UnknownError',
            message: parsed.Error?.Message || 'Unknown error occurred'
        };
    } catch (error) {
        return {
            code: 'ParseError',
            message: `Failed to parse error response: ${responseBody}`
        };
    }
}

/**
 * Helper function to format queue policy document
 */
export function createBasicQueuePolicy(queueArn: string, allowedActions: string[] = ['sqs:*']): string {
    const policy = {
        Version: '2012-10-17',
        Statement: [
            {
                Sid: 'DefaultPolicy',
                Effect: 'Allow',
                Principal: {
                    AWS: '*'
                },
                Action: allowedActions,
                Resource: queueArn
            }
        ]
    };
    
    return JSON.stringify(policy, null, 2);
}

/**
 * Helper function to wait with exponential backoff
 */
export function exponentialBackoffWait(attempt: number, baseDelay: number = 1000, maxDelay: number = 30000): void {
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    const start = Date.now();
    while (Date.now() - start < delay) {
        // Busy wait
    }
}

/**
 * Default queue attributes for standard queues
 */
export const DEFAULT_STANDARD_QUEUE_ATTRIBUTES: QueueAttributes = {
    DelaySeconds: 0,
    MaximumMessageSize: 262144, // 256 KiB
    MessageRetentionPeriod: 345600, // 4 days
    ReceiveMessageWaitTimeSeconds: 0,
    VisibilityTimeout: 30,
    FifoQueue: false
};

/**
 * Default queue attributes for FIFO queues
 */
export const DEFAULT_FIFO_QUEUE_ATTRIBUTES: QueueAttributes = {
    ...DEFAULT_STANDARD_QUEUE_ATTRIBUTES,
    FifoQueue: true,
    ContentBasedDeduplication: false
}; 