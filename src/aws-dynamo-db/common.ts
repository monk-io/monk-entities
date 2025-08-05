export interface AttributeDefinition {
    AttributeName: string;
    AttributeType: 'S' | 'N' | 'B';
}

export interface KeySchemaElement {
    AttributeName: string;
    KeyType: 'HASH' | 'RANGE';
}

export interface GlobalSecondaryIndex {
    IndexName: string;
    KeySchema: KeySchemaElement[];
    Projection: {
        ProjectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
        NonKeyAttributes?: string[];
    };
    ProvisionedThroughput?: {
        ReadCapacityUnits: number;
        WriteCapacityUnits: number;
    };
}

export interface LocalSecondaryIndex {
    IndexName: string;
    KeySchema: KeySchemaElement[];
    Projection: {
        ProjectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
        NonKeyAttributes?: string[];
    };
}

export interface ProvisionedThroughput {
    ReadCapacityUnits: number;
    WriteCapacityUnits: number;
}

export interface SSESpecification {
    Enabled?: boolean;
    SSEType?: 'AES256' | 'KMS';
    KMSMasterKeyId?: string;
}

export interface StreamSpecification {
    StreamEnabled: boolean;
    StreamViewType?: 'KEYS_ONLY' | 'NEW_IMAGE' | 'OLD_IMAGE' | 'NEW_AND_OLD_IMAGES';
}

export interface PointInTimeRecoverySpecification {
    PointInTimeRecoveryEnabled: boolean;
}

export interface TableClass {
    TableClass: 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS';
}

export interface TableSchema {
    TableName: string;
    AttributeDefinitions: AttributeDefinition[];
    KeySchema: KeySchemaElement[];
    BillingMode?: 'PROVISIONED' | 'PAY_PER_REQUEST';
    ProvisionedThroughput?: ProvisionedThroughput;
    GlobalSecondaryIndexes?: GlobalSecondaryIndex[];
    LocalSecondaryIndexes?: LocalSecondaryIndex[];
    SSESpecification?: SSESpecification;
    StreamSpecification?: StreamSpecification;
    Tags?: Array<{
        Key: string;
        Value: string;
    }>;
    TableClass?: 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS';
    DeletionProtectionEnabled?: boolean;
}

export interface Item {
    [key: string]: AttributeValue;
}

export interface AttributeValue {
    S?: string;
    N?: string;
    B?: string;
    SS?: string[];
    NS?: string[];
    BS?: string[];
    M?: { [key: string]: AttributeValue };
    L?: AttributeValue[];
    NULL?: boolean;
    BOOL?: boolean;
}

export interface TableInfo {
    TableName: string;
    TableStatus: string;
    TableArn?: string;
    CreationDateTime?: string;
    TableSizeBytes?: number;
    ItemCount?: number;
    AttributeDefinitions?: AttributeDefinition[];
    KeySchema?: KeySchemaElement[];
    BillingModeSummary?: {
        BillingMode: string;
        LastUpdateToPayPerRequestDateTime?: string;
    };
    ProvisionedThroughput?: ProvisionedThroughput & {
        LastIncreaseDateTime?: string;
        LastDecreaseDateTime?: string;
        NumberOfDecreasesToday?: number;
    };
    GlobalSecondaryIndexes?: Array<GlobalSecondaryIndex & {
        IndexStatus?: string;
        ItemCount?: number;
        IndexSizeBytes?: number;
        IndexArn?: string;
    }>;
    LocalSecondaryIndexes?: Array<LocalSecondaryIndex & {
        IndexArn?: string;
        ItemCount?: number;
        IndexSizeBytes?: number;
    }>;
    StreamSpecification?: StreamSpecification;
    LatestStreamLabel?: string;
    LatestStreamArn?: string;
    SSEDescription?: {
        Status?: string;
        SSEType?: string;
        KMSMasterKeyArn?: string;
    };
    ArchivalSummary?: {
        ArchivalDateTime?: string;
        ArchivalReason?: string;
        ArchivalBackupArn?: string;
    };
    GlobalTableVersion?: string;
    Replicas?: any[];
    RestoreSummary?: {
        SourceBackupArn?: string;
        SourceTableArn?: string;
        RestoreDateTime?: string;
        RestoreInProgress?: boolean;
    };
    DeletionProtectionEnabled?: boolean;
    TableClassSummary?: {
        TableClass?: string;
        LastUpdateDateTime?: string;
    };
}

/**
 * Validates a DynamoDB table name according to AWS requirements
 */
export function validateTableName(name: string): boolean {
    if (!name || typeof name !== 'string') {
        return false;
    }
    
    // Table name length: 3-255 characters
    if (name.length < 3 || name.length > 255) {
        return false;
    }
    
    // Must match pattern: [a-zA-Z0-9_.-]+
    const validPattern = /^[a-zA-Z0-9_.-]+$/;
    return validPattern.test(name);
}

/**
 * Validates an attribute name according to AWS requirements
 */
export function validateAttributeName(name: string): boolean {
    if (!name || typeof name !== 'string') {
        return false;
    }
    
    // Attribute name length: 1-255 characters
    if (name.length < 1 || name.length > 255) {
        return false;
    }
    
    return true;
}

/**
 * Validates billing mode settings
 */
export function validateBillingMode(billingMode?: string, provisionedThroughput?: ProvisionedThroughput): boolean {
    if (!billingMode) {
        billingMode = 'PAY_PER_REQUEST';
    }
    
    if (billingMode === 'PROVISIONED') {
        return !!(provisionedThroughput?.ReadCapacityUnits && provisionedThroughput?.WriteCapacityUnits);
    }
    
    return billingMode === 'PAY_PER_REQUEST';
}

/**
 * Converts tags object to DynamoDB tags array format
 */
export function convertTagsToArray(tags?: Record<string, string>): Array<{Key: string, Value: string}> | undefined {
    if (!tags || Object.keys(tags).length === 0) {
        return undefined;
    }
    
    return Object.entries(tags).map(([key, value]) => ({
        Key: key,
        Value: value
    }));
}

/**
 * Converts DynamoDB tags array to object format
 */
export function convertTagsToObject(tags?: Array<{Key: string, Value: string}>): Record<string, string> | undefined {
    if (!tags || tags.length === 0) {
        return undefined;
    }
    
    const result: Record<string, string> = {};
    for (const tag of tags) {
        result[tag.Key] = tag.Value;
    }
    return result;
}

/**
 * Default table configuration for pay-per-request billing
 */
export const DEFAULT_PAY_PER_REQUEST_CONFIG = {
    BillingMode: 'PAY_PER_REQUEST',
    DeletionProtectionEnabled: false,
};

/**
 * Default table configuration for provisioned billing
 */
export const DEFAULT_PROVISIONED_CONFIG = {
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
    },
    DeletionProtectionEnabled: false,
};

/**
 * Parses DynamoDB error messages to extract useful information
 */
export function parseDynamoDBError(errorBody: string): { type: string; message: string } {
    try {
        const parsed = JSON.parse(errorBody);
        return {
            type: parsed.__type || 'UnknownError',
            message: parsed.message || 'Unknown error occurred'
        };
    } catch (e) {
        return {
            type: 'ParseError',
            message: 'Could not parse error response'
        };
    }
} 