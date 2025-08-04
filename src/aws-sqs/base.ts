import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

import {
    parseSQSError
} from "./common.ts";

export interface AWSSQSDefinition {
    region: string;
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
        redrive_permission: string;
        source_queue_arns?: string[];
    };
    sqs_managed_sse_enabled?: boolean;
    policy?: string;
    tags?: Record<string, string>;
}

export interface AWSSQSState {
    existing: boolean;
    queue_name?: string;
    queue_url?: string;
    queue_arn?: string;
}

export interface SQSCreateQueueResponse {
    QueueUrl?: string;
}

export interface SQSGetQueueUrlResponse {
    QueueUrl?: string;
}

export interface SQSGetQueueAttributesResponse {
    Attributes?: Record<string, string>;
}

export interface SQSListQueuesResponse {
    QueueUrls?: string[];
}

export interface SQSSendMessageResponse {
    MessageId?: string;
    MD5OfBody?: string;
    MD5OfMessageAttributes?: string;
}

export interface SQSReceiveMessageResponse {
    Messages?: Array<{
        MessageId?: string;
        ReceiptHandle?: string;
        Body?: string;
        Attributes?: Record<string, string>;
        MessageAttributes?: Record<string, any>;
    }>;
}

export interface SQSErrorResponse {
    Error?: {
        Type?: string;
        Code?: string;
        Message?: string;
    };
    RequestId?: string;
}

export abstract class AWSSQSEntity<TDefinition extends AWSSQSDefinition, TState extends AWSSQSState> extends MonkEntity<TDefinition, TState> {
    protected get region(): string {
        return this.definition.region;
    }

    protected abstract getQueueName(): string;

    protected getQueueUrl(queueName: string): string {
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        const body = `Action=GetQueueUrl&QueueName=${encodeURIComponent(queueName)}&Version=2012-11-05`;

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            const errorMessage = parseSQSError(response.body);
            throw new Error(`Failed to get queue URL: ${errorMessage}`);
        }

        // Parse XML response to extract queue URL
        const urlMatch = /<QueueUrl>(.*?)<\/QueueUrl>/.exec(response.body);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }

        throw new Error('Queue URL not found in response');
    }

    protected createQueue(queueName: string, attributes?: Record<string, string>): SQSCreateQueueResponse {
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        let body = `Action=CreateQueue&QueueName=${encodeURIComponent(queueName)}&Version=2012-11-05`;
        
        if (attributes) {
            let attrIndex = 1;
            for (const [name, value] of Object.entries(attributes)) {
                body += `&Attribute.${attrIndex}.Name=${encodeURIComponent(name)}`;
                body += `&Attribute.${attrIndex}.Value=${encodeURIComponent(value)}`;
                attrIndex++;
            }
        }

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            throw new Error(`Failed to create queue: ${response.body}`);
        }

        // Parse XML response to extract queue URL
        const urlMatch = /<QueueUrl>(.*?)<\/QueueUrl>/.exec(response.body);
        if (urlMatch && urlMatch[1]) {
            return { QueueUrl: urlMatch[1] };
        }

        throw new Error('Queue URL not found in response');
    }

    protected deleteQueue(queueUrl: string): void {
        const body = `Action=DeleteQueue&QueueUrl=${encodeURIComponent(queueUrl)}&Version=2012-11-05`;

        const response = aws.post(queueUrl, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            const errorMessage = parseSQSError(response.body);
            throw new Error(`Failed to delete queue: ${errorMessage}`);
        }
    }

    protected getQueueAttributes(queueUrl: string, attributeNames: string[] = ["All"]): SQSGetQueueAttributesResponse {
        const url = queueUrl;
        let body = `Action=GetQueueAttributes&Version=2012-11-05`;
        attributeNames.forEach((name, index) => {
            body += `&AttributeName.${index + 1}=${encodeURIComponent(name)}`;
        });

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            const errorMessage = parseSQSError(response.body);
            throw new Error(`Failed to get queue attributes: ${errorMessage}`);
        }

        // Parse XML response to extract attributes
        const attributes: Record<string, string> = {};
        
        // Extract attribute name-value pairs from XML using regex
        // Try multiple regex patterns to handle different XML structures
        const patterns = [
            /<Attribute><n>(.*?)<\/n><Value>(.*?)<\/Value><\/Attribute>/g,
            /<Attribute><Name>(.*?)<\/Name><Value>(.*?)<\/Value><\/Attribute>/g,
            /<member><Name>(.*?)<\/Name><Value>(.*?)<\/Value><\/member>/g
        ];
        
        for (const regex of patterns) {
            let match;
            while ((match = regex.exec(response.body)) !== null) {
                attributes[match[1]] = match[2];
            }
            // Reset regex for next pattern
            regex.lastIndex = 0;
        }

        return { Attributes: attributes };
    }

    protected setQueueAttributes(queueUrl: string, attributes: Record<string, string>): void {
        let body = `Action=SetQueueAttributes&QueueUrl=${encodeURIComponent(queueUrl)}&Version=2012-11-05`;
        
        let attrIndex = 1;
        for (const [name, value] of Object.entries(attributes)) {
            body += `&Attribute.${attrIndex}.Name=${encodeURIComponent(name)}`;
            body += `&Attribute.${attrIndex}.Value=${encodeURIComponent(value)}`;
            attrIndex++;
        }

        const response = aws.post(queueUrl, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            const errorMessage = parseSQSError(response.body);
            throw new Error(`Failed to set queue attributes: ${errorMessage}`);
        }
    }

    protected sendMessage(queueUrl: string, messageBody: string, messageAttributes?: Record<string, any>): SQSSendMessageResponse {
        let body = `Action=SendMessage&QueueUrl=${encodeURIComponent(queueUrl)}&MessageBody=${encodeURIComponent(messageBody)}&Version=2012-11-05`;
        
        if (messageAttributes) {
            let attrIndex = 1;
            for (const [name, attr] of Object.entries(messageAttributes)) {
                body += `&MessageAttribute.${attrIndex}.Name=${encodeURIComponent(name)}`;
                body += `&MessageAttribute.${attrIndex}.Value.DataType=${encodeURIComponent(attr.DataType || 'String')}`;
                body += `&MessageAttribute.${attrIndex}.Value.StringValue=${encodeURIComponent(attr.StringValue || '')}`;
                attrIndex++;
            }
        }

        const response = aws.post(queueUrl, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            throw new Error(`Failed to send message: ${response.body}`);
        }

        // Parse XML response to extract message ID
        const messageIdMatch = /<MessageId>(.*?)<\/MessageId>/.exec(response.body);
        const md5Match = /<MD5OfBody>(.*?)<\/MD5OfBody>/.exec(response.body);

        return {
            MessageId: messageIdMatch ? messageIdMatch[1] : undefined,
            MD5OfBody: md5Match ? md5Match[1] : undefined
        };
    }

    protected receiveMessage(queueUrl: string, maxNumberOfMessages: number = 1, waitTimeSeconds: number = 0): SQSReceiveMessageResponse {
        const body = `Action=ReceiveMessage&QueueUrl=${encodeURIComponent(queueUrl)}&MaxNumberOfMessages=${maxNumberOfMessages}&WaitTimeSeconds=${waitTimeSeconds}&Version=2012-11-05`;

        const response = aws.post(queueUrl, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            throw new Error(`Failed to receive messages: ${response.body}`);
        }

        // Parse XML response - simplified for now
        return { Messages: [] }; // TODO: Implement proper XML parsing for messages
    }

    protected deleteMessage(queueUrl: string, receiptHandle: string): void {
        const body = `Action=DeleteMessage&QueueUrl=${encodeURIComponent(queueUrl)}&ReceiptHandle=${encodeURIComponent(receiptHandle)}&Version=2012-11-05`;

        const response = aws.post(queueUrl, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        if (response.statusCode !== 200) {
            throw new Error(`Failed to delete message: ${response.body}`);
        }
    }

    protected queueExists(queueName: string): boolean {
        try {
            this.getQueueUrl(queueName);
            return true;
        } catch (error) {
            return false;
        }
    }


} 