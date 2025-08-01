import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";

export interface AWSSQSDefinition {
    region: string;
}

export interface AWSSQSState {
    queue_url?: string;           // Essential: Primary identifier for all SQS operations
    queue_name?: string;          // Essential: Needed for identification and operations  
    existing?: boolean;           // Essential: Determines delete behavior
}



// SQS API Response interfaces
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
    NextToken?: string;
}

export interface SQSSendMessageResponse {
    MessageId?: string;
    MD5OfBody?: string;
    MD5OfMessageAttributes?: string;
    SequenceNumber?: string;
    MessageDeduplicationId?: string;
    MessageGroupId?: string;
}

export interface SQSReceiveMessageResponse {
    Messages?: Array<{
        MessageId?: string;
        ReceiptHandle?: string;
        MD5OfBody?: string;
        Body?: string;
        Attributes?: Record<string, string>;
        MD5OfMessageAttributes?: string;
        MessageAttributes?: Record<string, any>;
    }>;
}

export interface SQSErrorResponse {
    Error: {
        Code: string;
        Message: string;
        Type?: string;
    };
    RequestId?: string;
}

export abstract class AWSSQSEntity<
    D extends AWSSQSDefinition,
    S extends AWSSQSState
> extends MonkEntity<D, S> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    protected abstract getQueueName(): string;

    protected getQueueUrl(queueName: string): string {
        cli.output(`[DEBUG] Getting queue URL for: ${queueName}`);
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

        cli.output(`[DEBUG] GetQueueUrl response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            // Parse XML error response
            if (response.body.includes('AWS.SimpleQueueService.NonExistentQueue')) {
                return "";
            }
            const errorMatch = response.body.match(/<Message>(.*?)<\/Message>/);
            const errorMessage = errorMatch ? errorMatch[1] : response.body;
            throw new Error(`Failed to get queue URL: ${errorMessage}`);
        }

        // Parse XML response to extract QueueUrl
        const queueUrlMatch = response.body.match(/<QueueUrl>(.*?)<\/QueueUrl>/);
        return queueUrlMatch ? queueUrlMatch[1] : "";
    }

    protected createQueue(queueName: string, attributes?: Record<string, string>): SQSCreateQueueResponse {
        cli.output(`[DEBUG] Creating queue: ${queueName} with attributes: ${JSON.stringify(attributes)}`);
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        let body = `Action=CreateQueue&QueueName=${encodeURIComponent(queueName)}&Version=2012-11-05`;

        if (attributes) {
            let attributeIndex = 1;
            for (const [key, value] of Object.entries(attributes)) {
                body += `&Attribute.${attributeIndex}.Name=${encodeURIComponent(key)}`;
                body += `&Attribute.${attributeIndex}.Value=${encodeURIComponent(value)}`;
                attributeIndex++;
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

        cli.output(`[DEBUG] CreateQueue response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            // Parse XML error response
            const errorMatch = response.body.match(/<Message>(.*?)<\/Message>/);
            const errorMessage = errorMatch ? errorMatch[1] : response.body;
            throw new Error(`Failed to create queue: ${errorMessage}`);
        }

        // Parse XML response to extract QueueUrl
        const queueUrlMatch = response.body.match(/<QueueUrl>(.*?)<\/QueueUrl>/);
        return { QueueUrl: queueUrlMatch ? queueUrlMatch[1] : "" };
    }

    protected deleteQueue(queueUrl: string): void {
        cli.output(`[DEBUG] Deleting queue: ${queueUrl}`);
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        const body = `Action=DeleteQueue&QueueUrl=${encodeURIComponent(queueUrl)}&Version=2012-11-05`;

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        cli.output(`[DEBUG] DeleteQueue response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            const errorData: SQSErrorResponse = JSON.parse(response.body);
            throw new Error(`Failed to delete queue: ${errorData.Error?.Message || response.body}`);
        }
    }

    protected getQueueAttributes(queueUrl: string, attributeNames?: string[]): SQSGetQueueAttributesResponse {
        cli.output(`[DEBUG] Getting queue attributes for: ${queueUrl}`);
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        let body = `Action=GetQueueAttributes&QueueUrl=${encodeURIComponent(queueUrl)}&Version=2012-11-05`;

        if (attributeNames && attributeNames.length > 0) {
            attributeNames.forEach((name, index) => {
                body += `&AttributeName.${index + 1}=${encodeURIComponent(name)}`;
            });
        } else {
            body += '&AttributeName.1=All';
        }

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        cli.output(`[DEBUG] GetQueueAttributes response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            // Parse XML error response
            const errorMatch = response.body.match(/<Message>(.*?)<\/Message>/);
            const errorMessage = errorMatch ? errorMatch[1] : response.body;
            throw new Error(`Failed to get queue attributes: ${errorMessage}`);
        }

        // Parse XML response to extract attributes
        const attributes: Record<string, string> = {};
        
        cli.output(`[DEBUG] Raw XML body: ${response.body}`);
        
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
                cli.output(`[DEBUG] Found attribute: ${match[1]} = ${match[2]}`);
            }
            // Reset regex for next pattern
            regex.lastIndex = 0;
        }

        cli.output(`[DEBUG] Parsed attributes: ${JSON.stringify(attributes)}`);
        return { Attributes: attributes };
    }

    protected setQueueAttributes(queueUrl: string, attributes: Record<string, string>): void {
        cli.output(`[DEBUG] Setting queue attributes for: ${queueUrl}, attributes: ${JSON.stringify(attributes)}`);
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        let body = `Action=SetQueueAttributes&QueueUrl=${encodeURIComponent(queueUrl)}&Version=2012-11-05`;

        let attributeIndex = 1;
        for (const [key, value] of Object.entries(attributes)) {
            body += `&Attribute.${attributeIndex}.Name=${encodeURIComponent(key)}`;
            body += `&Attribute.${attributeIndex}.Value=${encodeURIComponent(value)}`;
            attributeIndex++;
        }

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        cli.output(`[DEBUG] SetQueueAttributes response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            const errorData: SQSErrorResponse = JSON.parse(response.body);
            throw new Error(`Failed to set queue attributes: ${errorData.Error?.Message || response.body}`);
        }
    }

    protected sendMessage(queueUrl: string, messageBody: string, attributes?: Record<string, any>): SQSSendMessageResponse {
        cli.output(`[DEBUG] Sending message to: ${queueUrl}`);
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        let body = `Action=SendMessage&QueueUrl=${encodeURIComponent(queueUrl)}&MessageBody=${encodeURIComponent(messageBody)}&Version=2012-11-05`;

        if (attributes) {
            for (const [key, value] of Object.entries(attributes)) {
                if (key === 'DelaySeconds' || key === 'MessageDeduplicationId' || key === 'MessageGroupId') {
                    body += `&${key}=${encodeURIComponent(value.toString())}`;
                }
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

        cli.output(`[DEBUG] SendMessage response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            const errorData: SQSErrorResponse = JSON.parse(response.body);
            throw new Error(`Failed to send message: ${errorData.Error?.Message || response.body}`);
        }

        const data: SQSSendMessageResponse = JSON.parse(response.body);
        return data;
    }

    protected receiveMessage(queueUrl: string, maxMessages: number = 1, waitTimeSeconds: number = 0): SQSReceiveMessageResponse {
        cli.output(`[DEBUG] Receiving messages from: ${queueUrl}`);
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        const body = `Action=ReceiveMessage&QueueUrl=${encodeURIComponent(queueUrl)}&MaxNumberOfMessages=${maxMessages}&WaitTimeSeconds=${waitTimeSeconds}&Version=2012-11-05`;

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        cli.output(`[DEBUG] ReceiveMessage response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            const errorData: SQSErrorResponse = JSON.parse(response.body);
            throw new Error(`Failed to receive messages: ${errorData.Error?.Message || response.body}`);
        }

        const data: SQSReceiveMessageResponse = JSON.parse(response.body);
        return data;
    }

    protected deleteMessage(queueUrl: string, receiptHandle: string): void {
        cli.output(`[DEBUG] Deleting message from: ${queueUrl}`);
        const url = `https://sqs.${this.region}.amazonaws.com/`;
        
        const body = `Action=DeleteMessage&QueueUrl=${encodeURIComponent(queueUrl)}&ReceiptHandle=${encodeURIComponent(receiptHandle)}&Version=2012-11-05`;

        const response = aws.post(url, {
            service: 'sqs',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        cli.output(`[DEBUG] DeleteMessage response: ${JSON.stringify(response, null, 2)}`);

        if (response.statusCode !== 200) {
            const errorData: SQSErrorResponse = JSON.parse(response.body);
            throw new Error(`Failed to delete message: ${errorData.Error?.Message || response.body}`);
        }
    }

    protected waitForQueueAvailable(queueUrl: string, maxAttempts: number = 30, delaySeconds: number = 5): boolean {
        cli.output(`[DEBUG] Waiting for queue to be available: ${queueUrl}`);
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const attributes = this.getQueueAttributes(queueUrl, ['QueueArn']);
                cli.output(`[DEBUG] Attempt ${attempt}: Got attributes: ${JSON.stringify(attributes)}`);
                if (attributes.Attributes?.QueueArn) {
                    cli.output(`[DEBUG] Queue is available after ${attempt} attempts, QueueArn: ${attributes.Attributes.QueueArn}`);
                    return true;
                } else {
                    cli.output(`[DEBUG] No QueueArn found in attributes on attempt ${attempt}`);
                }
            } catch (error) {
                cli.output(`[DEBUG] Queue not available yet, attempt ${attempt}/${maxAttempts}: ${error}`);
            }
            
            if (attempt < maxAttempts) {
                cli.output(`[DEBUG] Waiting ${delaySeconds} seconds before next attempt...`);
                // Simple delay implementation
                const start = Date.now();
                while (Date.now() - start < delaySeconds * 1000) {
                    // Busy wait
                }
            }
        }
        
        cli.output(`[DEBUG] Queue not available after ${maxAttempts} attempts`);
        return false;
    }

    protected queueExists(queueName: string): boolean {
        try {
            const queueUrl = this.getQueueUrl(queueName);
            return queueUrl !== "";
        } catch (error) {
            cli.output(`[DEBUG] Queue existence check failed: ${error}`);
            return false;
        }
    }
} 