/**
 * Parse SNS error from response
 */
export function parseSNSError(response: any): string {
    if (!response.body) {
        return `HTTP ${response.statusCode}: ${response.error || "Unknown error"}`;
    }

    // Try to extract error message from XML response
    const errorCodeMatch = /<Code>([^<]+)<\/Code>/.exec(response.body);
    const errorMessageMatch = /<Message>([^<]+)<\/Message>/.exec(response.body);

    if (errorCodeMatch && errorMessageMatch) {
        return `${errorCodeMatch[1]}: ${errorMessageMatch[1]}`;
    }

    if (errorMessageMatch) {
        return errorMessageMatch[1];
    }

    return `HTTP ${response.statusCode}: ${response.body.substring(0, 200)}`;
}

/**
 * Validate SNS topic name format
 * Topic names must be made up of only uppercase and lowercase ASCII letters, numbers, hyphens, underscores, and periods (for .fifo suffix)
 * Must be between 1 and 256 characters long
 * FIFO topics must end with .fifo
 */
export function validateTopicName(name: string): boolean {
    if (!name || name.length < 1 || name.length > 256) {
        return false;
    }
    // Allow alphanumeric, hyphens, underscores, and periods (for .fifo suffix)
    return /^[a-zA-Z0-9_.-]+$/.test(name);
}

/**
 * Validate SNS topic display name
 * Display names must be at most 100 characters long
 */
export function validateDisplayName(name: string): boolean {
    return name.length <= 100;
}

/**
 * Parse topic ARN to extract topic name
 */
export function parseTopicArn(arn: string): string | undefined {
    // ARN format: arn:aws:sns:region:account-id:topic-name
    const parts = arn.split(":");
    return parts.length >= 6 ? parts[5] : undefined;
}

/**
 * SNS subscription protocol types
 */
export type SNSProtocol = "http" | "https" | "email" | "email-json" | "sms" | "sqs" | "application" | "lambda" | "firehose";

/**
 * SNS topic attribute names
 */
export const TopicAttributes = {
    POLICY: "Policy",
    DISPLAY_NAME: "DisplayName",
    DELIVERY_POLICY: "DeliveryPolicy",
    KMS_MASTER_KEY_ID: "KmsMasterKeyId",
    FIFO_TOPIC: "FifoTopic",
    CONTENT_BASED_DEDUPLICATION: "ContentBasedDeduplication",
    SIGNATURE_VERSION: "SignatureVersion"
} as const;

/**
 * SNS message attribute data types
 */
export type MessageAttributeDataType = "String" | "Number" | "Binary" | "String.Array" | "Number.Array" | "Binary.Array";

