import { AWSDynamoDBEntity, AWSDynamoDBDefinition, AWSDynamoDBState } from "./base.ts";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;

import {
    AttributeDefinition,
    KeySchemaElement,
    GlobalSecondaryIndex,
    LocalSecondaryIndex,
    ProvisionedThroughput,
    SSESpecification,
    StreamSpecification,
    TableSchema,
    TableInfo,
    Item,
    validateTableName,
    validateBillingMode,
    convertTagsToArray,
    convertTagsToObject
} from "./common.ts";

export interface DynamoDBTableDefinition extends AWSDynamoDBDefinition {
    /**
     * The name of the DynamoDB table
     * @minLength 3
     * @maxLength 255
     * @pattern ^[a-zA-Z0-9_.-]+$
     */
    table_name: string;
    
    /**
     * Attribute definitions for the table
     */
    attribute_definitions?: AttributeDefinition[];
    
    /**
     * Key schema for the table (hash and range keys)
     */
    key_schema?: KeySchemaElement[];
    
    /**
     * Billing mode for the table
     * @default "PAY_PER_REQUEST"
     */
    billing_mode?: 'PROVISIONED' | 'PAY_PER_REQUEST';
    
    /**
     * Provisioned throughput settings (required if billing_mode is PROVISIONED)
     */
    provisioned_throughput?: ProvisionedThroughput;
    
    /**
     * Global secondary indexes
     */
    global_secondary_indexes?: GlobalSecondaryIndex[];
    
    /**
     * Local secondary indexes
     */
    local_secondary_indexes?: LocalSecondaryIndex[];
    
    /**
     * Server-side encryption specification
     */
    sse_specification?: SSESpecification;
    
    /**
     * DynamoDB stream configuration
     */
    stream_specification?: StreamSpecification;
    
    /**
     * Table class
     * @default "STANDARD"
     */
    table_class?: 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS';
    
    /**
     * Deletion protection enabled
     * @default false
     */
    deletion_protection_enabled?: boolean;
    
    /**
     * Point-in-time recovery enabled
     * @default false
     */
    point_in_time_recovery_enabled?: boolean;
    
    /**
     * Resource tags
     */
    tags?: Record<string, string>;
}

export interface DynamoDBTableState extends AWSDynamoDBState {
    // Minimal state - only essential information needed for other operations
    table_name?: string;
    table_arn?: string;
    table_status?: string;
    existing?: boolean;
}

export class DynamoDBTable extends AWSDynamoDBEntity<DynamoDBTableDefinition, DynamoDBTableState> {
    
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    private extractArrayFromIndexedFields(obj: any, fieldName: string): any[] {
        const result: any[] = [];
        let index = 0;
        
        while (obj[`${fieldName}!${index}`] !== undefined) {
            result.push(obj[`${fieldName}!${index}`]);
            index++;
        }
        
        return result;
    }

    private validateDefinition(): void {
        // Extract arrays from indexed format
        const attributeDefinitions = this.extractArrayFromIndexedFields(this.definition, 'attribute_definitions');
        const keySchema = this.extractArrayFromIndexedFields(this.definition, 'key_schema');
        
        if (!validateTableName(this.definition.table_name)) {
            throw new Error(`Invalid table name: ${this.definition.table_name}. Must be 3-255 characters and contain only letters, numbers, underscores, periods, and hyphens.`);
        }
        
        if (!attributeDefinitions || attributeDefinitions.length === 0) {
            throw new Error("At least one attribute definition is required");
        }
        
        if (!keySchema || keySchema.length === 0) {
            throw new Error("At least one key schema element is required");
        }
        
        if (!validateBillingMode(this.definition.billing_mode, this.definition.provisioned_throughput)) {
            throw new Error("Invalid billing mode configuration");
        }
    }

    private buildTableSchema(): TableSchema {
        // Extract arrays from indexed format
        const attributeDefinitions = this.extractArrayFromIndexedFields(this.definition, 'attribute_definitions');
        const keySchema = this.extractArrayFromIndexedFields(this.definition, 'key_schema');
        
        const schema: TableSchema = {
            TableName: this.definition.table_name,
            AttributeDefinitions: attributeDefinitions,
            KeySchema: keySchema,
            BillingMode: this.definition.billing_mode || 'PAY_PER_REQUEST'
        };

        if (this.definition.provisioned_throughput) {
            schema.ProvisionedThroughput = this.definition.provisioned_throughput;
        }

        // Handle global secondary indexes
        const globalSecondaryIndexes = this.extractArrayFromIndexedFields(this.definition, 'global_secondary_indexes');
        if (globalSecondaryIndexes.length > 0) {
            schema.GlobalSecondaryIndexes = globalSecondaryIndexes;
        }

        // Handle local secondary indexes
        const localSecondaryIndexes = this.extractArrayFromIndexedFields(this.definition, 'local_secondary_indexes');
        if (localSecondaryIndexes.length > 0) {
            schema.LocalSecondaryIndexes = localSecondaryIndexes;
        }

        if (this.definition.sse_specification) {
            schema.SSESpecification = this.definition.sse_specification;
        }

        if (this.definition.stream_specification) {
            schema.StreamSpecification = this.definition.stream_specification;
        }

        if (this.definition.table_class) {
            schema.TableClass = this.definition.table_class;
        }

        if (this.definition.deletion_protection_enabled !== undefined) {
            schema.DeletionProtectionEnabled = this.definition.deletion_protection_enabled;
        }

        if (this.definition.tags) {
            schema.Tags = convertTagsToArray(this.definition.tags);
        }

        return schema;
    }

    override create(): void {
        this.validateDefinition();
        
        // Check if table already exists
        const existingTable = super.getTableInfo(this.definition.table_name);
        if (existingTable) {
            this.state = {
                table_name: existingTable.TableName,
                table_arn: existingTable.TableArn,
                table_status: existingTable.TableStatus,
                existing: true
            };
            return;
        }

        // Create the table
        const tableSchema = this.buildTableSchema();
        const response = this.makeDynamoDBRequest("CreateTable", tableSchema);
        
        if (response.TableDescription) {
            this.state = {
                table_name: response.TableDescription.TableName,
                table_arn: response.TableDescription.TableArn,
                table_status: response.TableDescription.TableStatus,
                existing: false
            };
        } else {
            throw new Error("Unexpected response from CreateTable API");
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.table_name) {
            return false;
        }

        try {
            const tableInfo = super.getTableInfo(this.state.table_name);
            if (!tableInfo) {
                return false;
            }

            const isReady = tableInfo.TableStatus === 'ACTIVE';
            
            // Update state with current status
            this.state.table_status = tableInfo.TableStatus;
            
            return isReady;
        } catch (error) {
            return false;
        }
    }

    override start(): void {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }
        
        // For DynamoDB tables, "starting" means waiting for ACTIVE status
        super.waitForTableStatus(this.state.table_name, "ACTIVE", 60, 5);
    }

    override stop(): void {
        // For DynamoDB, there's no concept of stopping a table
        // This is a no-op but satisfies the interface
    }

    override update(): void {
        
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const currentTable = super.getTableInfo(this.state.table_name);
        if (!currentTable) {
            throw new Error(`Table ${this.state.table_name} not found`);
        }

        // Prepare update parameters
        const updateParams: any = {
            TableName: this.state.table_name
        };

        let hasChanges = false;

        // Update billing mode and provisioned throughput
        if (this.definition.billing_mode && 
            currentTable.BillingModeSummary?.BillingMode !== this.definition.billing_mode) {
            
            updateParams.BillingMode = this.definition.billing_mode;
            
            if (this.definition.billing_mode === 'PROVISIONED' && this.definition.provisioned_throughput) {
                updateParams.ProvisionedThroughput = this.definition.provisioned_throughput;
            }
            
            hasChanges = true;
        }

        // Update stream specification
        if (this.definition.stream_specification) {
            updateParams.StreamSpecification = this.definition.stream_specification;
            hasChanges = true;
        }

        // Update SSE specification
        if (this.definition.sse_specification) {
            updateParams.SSESpecification = this.definition.sse_specification;
            hasChanges = true;
        }

        // Update table class
        if (this.definition.table_class) {
            updateParams.TableClass = this.definition.table_class;
            hasChanges = true;
        }

        // Update deletion protection
        if (this.definition.deletion_protection_enabled !== undefined) {
            updateParams.DeletionProtectionEnabled = this.definition.deletion_protection_enabled;
            hasChanges = true;
        }

        if (hasChanges) {
            const response = this.makeDynamoDBRequest("UpdateTable", updateParams);
            if (response.TableDescription) {
                this.state.table_status = response.TableDescription.TableStatus;
            }
        } else {
        }

        // Update point-in-time recovery if specified
        if (this.definition.point_in_time_recovery_enabled !== undefined) {
            this.updatePointInTimeRecovery();
        }

        // Update tags if specified
        if (this.definition.tags) {
            this.updateTags();
        }
    }

    override delete(): void {
        
        if (!this.state.table_name) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            this.makeDynamoDBRequest("DeleteTable", {
                TableName: this.state.table_name
            });
            
            this.state.table_status = "DELETING";
        } catch (error) {
            if (error instanceof Error && error.message.includes("ResourceNotFoundException")) {
                return;
            }
            throw error;
        }
    }

    @action()
    getTableDetails(): TableInfo | null {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const tableInfo = super.getTableInfo(this.state.table_name);
        if (tableInfo) {
        }
        return tableInfo;
    }

    @action()
    putItem(args?: any): void {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const itemJson = args?.item;
        if (!itemJson) {
            throw new Error("Item is required");
        }

        // Parse JSON string to object
        let item;
        try {
            item = typeof itemJson === 'string' ? JSON.parse(itemJson) : itemJson;
        } catch (error) {
            throw new Error(`Invalid item JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        const params = {
            TableName: this.state.table_name,
            Item: item
        };

        this.makeDynamoDBRequest("PutItem", params);
    }

    @action()
    getItem(args?: any): Item | null {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const keyJson = args?.key;
        if (!keyJson) {
            throw new Error("Key is required");
        }

        // Parse JSON string to object
        let key;
        try {
            key = typeof keyJson === 'string' ? JSON.parse(keyJson) : keyJson;
        } catch (error) {
            throw new Error(`Invalid key JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        const params = {
            TableName: this.state.table_name,
            Key: key
        };

        const response = this.makeDynamoDBRequest("GetItem", params);
        if (response.Item) {
            return response.Item;
        }
        
        return null;
    }

    @action()
    deleteItem(args?: any): void {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const keyJson = args?.key;
        if (!keyJson) {
            throw new Error("Key is required");
        }

        // Parse JSON string to object
        let key;
        try {
            key = typeof keyJson === 'string' ? JSON.parse(keyJson) : keyJson;
        } catch (error) {
            throw new Error(`Invalid key JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        const params = {
            TableName: this.state.table_name,
            Key: key
        };

        this.makeDynamoDBRequest("DeleteItem", params);
    }

    @action()
    scanTable(args?: any): any {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const limit = args?.limit;
        


        const params: any = {
            TableName: this.state.table_name
        };

        if (limit) {
            params.Limit = parseInt(limit, 10);
        }

        const response = this.makeDynamoDBRequest("Scan", params);
        return {
            Items: response.Items || [],
            Count: response.Count || 0,
            ScannedCount: response.ScannedCount || 0,
            LastEvaluatedKey: response.LastEvaluatedKey
        };
    }

    @action()
    listTags(): Record<string, string> {
        if (!this.state.table_arn) {
            throw new Error("Table ARN not available");
        }

        const response = this.makeDynamoDBRequest("ListTagsOfResource", {
            ResourceArn: this.state.table_arn
        });

        const tags = convertTagsToObject(response.Tags);
        return tags || {};
    }

    private updatePointInTimeRecovery(): void {
        if (!this.state.table_name) {
            return;
        }

        const params = {
            TableName: this.state.table_name,
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: this.definition.point_in_time_recovery_enabled
            }
        };

        this.makeDynamoDBRequest("UpdateContinuousBackups", params);
    }

    private updateTags(): void {
        if (!this.state.table_arn || !this.definition.tags) {
            return;
        }

        // Get current tags
        const currentTags = this.listTags();
        const newTags = this.definition.tags;

        // Find tags to remove
        const tagsToRemove = Object.keys(currentTags).filter(key => !(key in newTags));
        if (tagsToRemove.length > 0) {
            this.makeDynamoDBRequest("UntagResource", {
                ResourceArn: this.state.table_arn,
                TagKeys: tagsToRemove
            });
        }

        // Find tags to add or update
        const tagsToSet = convertTagsToArray(newTags);
        if (tagsToSet && tagsToSet.length > 0) {
            this.makeDynamoDBRequest("TagResource", {
                ResourceArn: this.state.table_arn,
                Tags: tagsToSet
            });
        }
    }
} 