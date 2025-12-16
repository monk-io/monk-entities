import { AWSDynamoDBEntity, AWSDynamoDBDefinition, AWSDynamoDBState, action } from "./base.ts";
import cli from "cli";

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
    validateKeySchemaAttributes,
    convertTagsToArray,
    convertTagsToObject
} from "./common.ts";

export interface DynamoDBTableDefinition extends AWSDynamoDBDefinition {
    /**
     * @description The name of the DynamoDB table
     * @minLength 3
     * @maxLength 255
     * @pattern ^[a-zA-Z0-9_.-]+$
     */
    table_name: string;
    
    /**
     * @description Attribute definitions for the table
     */
    attribute_definitions?: AttributeDefinition[];
    
    /**
     * @description Key schema for the table (hash and range keys)
     */
    key_schema?: KeySchemaElement[];
    
    /**
     * @description Billing mode for the table
     * @default "PAY_PER_REQUEST"
     */
    billing_mode?: 'PROVISIONED' | 'PAY_PER_REQUEST';
    
    /**
     * @description Provisioned throughput settings (required if billing_mode is PROVISIONED)
     */
    provisioned_throughput?: ProvisionedThroughput;
    
    /**
     * @description Global secondary indexes
     */
    global_secondary_indexes?: GlobalSecondaryIndex[];
    
    /**
     * @description Local secondary indexes
     */
    local_secondary_indexes?: LocalSecondaryIndex[];
    
    /**
     * @description Server-side encryption specification
     */
    sse_specification?: SSESpecification;
    
    /**
     * @description DynamoDB stream configuration
     */
    stream_specification?: StreamSpecification;
    
    /**
     * @description Table class
     * @default "STANDARD"
     */
    table_class?: 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS';
    
    /**
     * @description Deletion protection enabled
     * @default false
     */
    deletion_protection_enabled?: boolean;
    
    /**
     * @description Point-in-time recovery enabled
     * @default false
     */
    point_in_time_recovery_enabled?: boolean;
    
    /**
     * @description Resource tags
     */
    tags?: Record<string, string>;
}

export interface DynamoDBTableState extends AWSDynamoDBState {
    /** @description Table name */
    table_name?: string;
    /** @description Table ARN */
    table_arn?: string;
    /** @description Current table status (e.g., ACTIVE) */
    table_status?: string;
    /** @description Indicates if the table pre-existed before this entity managed it */
    existing?: boolean;
}

export class DynamoDBTable extends AWSDynamoDBEntity<DynamoDBTableDefinition, DynamoDBTableState> {
    
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    private extractArrayFromIndexedFields(obj: any, fieldName: string): any[] {
        // First check if the field is already a direct array
        if (obj[fieldName] && Array.isArray(obj[fieldName])) {
            return obj[fieldName];
        }
        
        // Otherwise, extract from indexed notation (field!0, field!1, etc.)
        const result: any[] = [];
        let index = 0;
        
        while (obj[`${fieldName}!${index}`] !== undefined) {
            let item = obj[`${fieldName}!${index}`];
            
            // For each extracted item, recursively process any nested indexed fields
            item = this.processNestedIndexedFields(item);
            
            result.push(item);
            index++;
        }
        
        // Filter out null/undefined values to prevent API errors
        return result.filter(item => item != null);
    }

    private processNestedIndexedFields(obj: any): any {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }
        
        const processedObj = { ...obj };
        
        // Look for nested indexed fields and convert them to arrays
        const indexedFields = new Set<string>();
        
        // Find all indexed field patterns in the object
        for (const key in processedObj) {
            const match = key.match(/^(.+)!(\d+)$/);
            if (match) {
                const [, fieldName] = match;
                indexedFields.add(fieldName);
            }
        }
        
        // Process each indexed field found
        for (const fieldName of indexedFields) {
            const extractedArray = this.extractArrayFromIndexedFields(processedObj, fieldName);
            
            // Remove the indexed entries and add the array
            let index = 0;
            while (processedObj[`${fieldName}!${index}`] !== undefined) {
                delete processedObj[`${fieldName}!${index}`];
                index++;
            }
            
            if (extractedArray.length > 0) {
                processedObj[fieldName] = extractedArray;
            }
        }
        
        return processedObj;
    }

    private validateDefinition(): void {
        // Extract arrays from indexed format
        const attributeDefinitions = this.extractArrayFromIndexedFields(this.definition, 'attribute_definitions');
        const keySchema = this.extractArrayFromIndexedFields(this.definition, 'key_schema');
        const globalSecondaryIndexes = this.extractArrayFromIndexedFields(this.definition, 'global_secondary_indexes');
        const localSecondaryIndexes = this.extractArrayFromIndexedFields(this.definition, 'local_secondary_indexes');
        
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
        
        // Validate that all key schema attributes are defined in attribute definitions
        const validation = validateKeySchemaAttributes(
            attributeDefinitions, 
            keySchema, 
            globalSecondaryIndexes, 
            localSecondaryIndexes
        );
        
        if (!validation.isValid) {
            const errors = [];
            if (validation.missingAttributes.length > 0) {
                errors.push(`Missing attribute definitions: ${validation.missingAttributes.join(', ')}`);
            }
            if (validation.duplicateAttributes.length > 0) {
                errors.push(`Duplicate attribute definitions: ${validation.duplicateAttributes.join(', ')}`);
            }
            throw new Error(`DynamoDB attribute validation failed: ${errors.join('; ')}. All attributes in AttributeDefinitions must be used in key schemas, and no duplicates are allowed.`);
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
            // Validate and filter GSI objects to ensure they have valid KeySchema
            const validGSIs = globalSecondaryIndexes.filter(gsi => {
                return gsi && gsi.IndexName && gsi.KeySchema && Array.isArray(gsi.KeySchema) && gsi.KeySchema.length > 0;
            });
            
            if (validGSIs.length > 0) {
                schema.GlobalSecondaryIndexes = validGSIs;
            }
        }

        // Handle local secondary indexes
        const localSecondaryIndexes = this.extractArrayFromIndexedFields(this.definition, 'local_secondary_indexes');
        if (localSecondaryIndexes.length > 0) {
            // Validate and filter LSI objects to ensure they have valid KeySchema
            const validLSIs = localSecondaryIndexes.filter(lsi => {
                return lsi && lsi.IndexName && lsi.KeySchema && Array.isArray(lsi.KeySchema) && lsi.KeySchema.length > 0;
            });
            
            if (validLSIs.length > 0) {
                schema.LocalSecondaryIndexes = validLSIs;
            }
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

    checkLiveness(): boolean { return this.checkReadiness(); }

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

    // ==================== BACKUP ACTIONS ====================

    /**
     * Get backup configuration and status including PITR and recent backups
     */
    @action("get-backup-info")
    getBackupInfo(): void {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        cli.output("==================================================");
        cli.output(`Backup Info for table: ${this.state.table_name}`);
        cli.output("==================================================");

        // Get continuous backups (PITR) status
        try {
            const continuousBackups = this.makeDynamoDBRequest("DescribeContinuousBackups", {
                TableName: this.state.table_name
            });

            const pitrDesc = continuousBackups.ContinuousBackupsDescription;
            if (pitrDesc) {
                cli.output("");
                cli.output("📋 Continuous Backups Status:");
                cli.output(`   Status: ${pitrDesc.ContinuousBackupsStatus}`);
                
                const pitr = pitrDesc.PointInTimeRecoveryDescription;
                if (pitr) {
                    cli.output(`   PITR Enabled: ${pitr.PointInTimeRecoveryStatus === 'ENABLED' ? '✅ Yes' : '❌ No'}`);
                    if (pitr.EarliestRestorableDateTime) {
                        cli.output(`   Earliest Restore: ${pitr.EarliestRestorableDateTime}`);
                    }
                    if (pitr.LatestRestorableDateTime) {
                        cli.output(`   Latest Restore: ${pitr.LatestRestorableDateTime}`);
                    }
                }
            }
        } catch (error) {
            cli.output(`⚠️ Could not fetch PITR status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        // List recent on-demand backups
        try {
            const backups = this.makeDynamoDBRequest("ListBackups", {
                TableName: this.state.table_name,
                Limit: 5
            });

            cli.output("");
            cli.output("📦 Recent On-Demand Backups:");
            
            if (backups.BackupSummaries && backups.BackupSummaries.length > 0) {
                cli.output(`   Total: ${backups.BackupSummaries.length} backup(s)`);
                for (const backup of backups.BackupSummaries) {
                    cli.output("");
                    cli.output(`   • ${backup.BackupName}`);
                    cli.output(`     ARN: ${backup.BackupArn}`);
                    cli.output(`     Status: ${backup.BackupStatus}`);
                    cli.output(`     Created: ${backup.BackupCreationDateTime}`);
                    if (backup.BackupSizeBytes) {
                        const sizeMB = (backup.BackupSizeBytes / (1024 * 1024)).toFixed(2);
                        cli.output(`     Size: ${sizeMB} MB`);
                    }
                }
            } else {
                cli.output("   No on-demand backups found");
            }
        } catch (error) {
            cli.output(`⚠️ Could not list backups: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        cli.output("");
        cli.output("==================================================");
    }

    /**
     * Create an on-demand backup snapshot
     * @param args.backup_name - Name for the backup (optional, auto-generated if not provided)
     */
    @action("create-snapshot")
    createSnapshot(args?: any): void {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const backupName = args?.backup_name || args?.snapshot_id || 
            `${this.state.table_name}-backup-${Date.now()}`;

        cli.output(`Creating backup '${backupName}' for table '${this.state.table_name}'...`);

        const response = this.makeDynamoDBRequest("CreateBackup", {
            TableName: this.state.table_name,
            BackupName: backupName
        });

        if (response.BackupDetails) {
            const details = response.BackupDetails;
            cli.output("");
            cli.output("✅ Backup created successfully!");
            cli.output(`   Name: ${details.BackupName}`);
            cli.output(`   ARN: ${details.BackupArn}`);
            cli.output(`   Status: ${details.BackupStatus}`);
            cli.output(`   Created: ${details.BackupCreationDateTime}`);
            
            // Extract backup ID from ARN for easier reference
            const backupId = details.BackupArn.split('/').pop();
            cli.output(`   Backup ID: ${backupId}`);
            cli.output("");
            cli.output("💡 Use this ARN or ID with 'restore' action to restore from this backup");
        }
    }

    /**
     * List available on-demand backups
     * @param args.limit - Maximum number of backups to list (default: 20)
     * @param args.status - Filter by status: CREATING, AVAILABLE, DELETED (optional)
     */
    @action("list-snapshots")
    listSnapshots(args?: any): void {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const limit = parseInt(args?.limit || "20", 10);
        const status = args?.status;

        const params: any = {
            TableName: this.state.table_name,
            Limit: limit
        };

        if (status) {
            params.BackupType = status === 'SYSTEM' ? 'SYSTEM' : 
                               status === 'AWS_BACKUP' ? 'AWS_BACKUP' : 'USER';
        }

        cli.output("==================================================");
        cli.output(`Backups for table: ${this.state.table_name}`);
        cli.output("==================================================");

        const response = this.makeDynamoDBRequest("ListBackups", params);

        if (response.BackupSummaries && response.BackupSummaries.length > 0) {
            cli.output(`Total backups found: ${response.BackupSummaries.length}`);
            cli.output("");

            for (let i = 0; i < response.BackupSummaries.length; i++) {
                const backup = response.BackupSummaries[i];
                const backupId = backup.BackupArn.split('/').pop();
                
                cli.output(`📦 Backup #${i + 1}`);
                cli.output(`   Name: ${backup.BackupName}`);
                cli.output(`   ID: ${backupId}`);
                cli.output(`   ARN: ${backup.BackupArn}`);
                cli.output(`   Status: ${backup.BackupStatus}`);
                cli.output(`   Type: ${backup.BackupType || 'USER'}`);
                cli.output(`   Created: ${backup.BackupCreationDateTime}`);
                if (backup.BackupExpiryDateTime) {
                    cli.output(`   Expires: ${backup.BackupExpiryDateTime}`);
                }
                if (backup.BackupSizeBytes) {
                    const sizeMB = (backup.BackupSizeBytes / (1024 * 1024)).toFixed(2);
                    cli.output(`   Size: ${sizeMB} MB`);
                }
                cli.output("");
            }

            if (response.LastEvaluatedBackupArn) {
                cli.output("📝 More backups available. Increase limit to see more.");
            }
        } else {
            cli.output("No backups found for this table.");
            cli.output("");
            cli.output("💡 Create a backup with: monk do <namespace>/<table>/create-snapshot");
        }

        cli.output("==================================================");
    }

    /**
     * Get detailed information about a specific backup
     * @param args.backup_arn - Full ARN of the backup
     * @param args.snapshot_id - Backup ID (alternative to full ARN)
     */
    @action("describe-snapshot")
    describeSnapshot(args?: any): void {
        const backupArn = args?.backup_arn || args?.snapshot_id;
        if (!backupArn) {
            throw new Error("backup_arn or snapshot_id is required");
        }

        // If just an ID is provided, construct the ARN
        let fullArn = backupArn;
        if (!backupArn.startsWith('arn:')) {
            if (!this.state.table_arn) {
                throw new Error("Cannot construct backup ARN without table ARN. Please provide full backup_arn.");
            }
            // Extract account and region from table ARN
            const arnParts = this.state.table_arn.split(':');
            const region = arnParts[3];
            const account = arnParts[4];
            fullArn = `arn:aws:dynamodb:${region}:${account}:table/${this.state.table_name}/backup/${backupArn}`;
        }

        const response = this.makeDynamoDBRequest("DescribeBackup", {
            BackupArn: fullArn
        });

        if (response.BackupDescription) {
            const desc = response.BackupDescription;
            const details = desc.BackupDetails;
            const sourceTable = desc.SourceTableDetails;
            const sourceFeatures = desc.SourceTableFeatureDetails;

            cli.output("==================================================");
            cli.output("Backup Details");
            cli.output("==================================================");
            
            if (details) {
                cli.output(`Name: ${details.BackupName}`);
                cli.output(`ARN: ${details.BackupArn}`);
                cli.output(`Status: ${details.BackupStatus}`);
                cli.output(`Type: ${details.BackupType || 'USER'}`);
                cli.output(`Created: ${details.BackupCreationDateTime}`);
                if (details.BackupExpiryDateTime) {
                    cli.output(`Expires: ${details.BackupExpiryDateTime}`);
                }
                if (details.BackupSizeBytes) {
                    const sizeMB = (details.BackupSizeBytes / (1024 * 1024)).toFixed(2);
                    cli.output(`Size: ${sizeMB} MB`);
                }
            }

            if (sourceTable) {
                cli.output("");
                cli.output("📋 Source Table Info:");
                cli.output(`   Table Name: ${sourceTable.TableName}`);
                cli.output(`   Table ARN: ${sourceTable.TableArn}`);
                cli.output(`   Item Count: ${sourceTable.ItemCount || 'N/A'}`);
                cli.output(`   Billing Mode: ${sourceTable.BillingMode || 'PROVISIONED'}`);
                if (sourceTable.ProvisionedThroughput) {
                    cli.output(`   Read Capacity: ${sourceTable.ProvisionedThroughput.ReadCapacityUnits}`);
                    cli.output(`   Write Capacity: ${sourceTable.ProvisionedThroughput.WriteCapacityUnits}`);
                }
            }

            if (sourceFeatures) {
                cli.output("");
                cli.output("📋 Source Table Features:");
                if (sourceFeatures.GlobalSecondaryIndexes) {
                    cli.output(`   GSI Count: ${sourceFeatures.GlobalSecondaryIndexes.length}`);
                }
                if (sourceFeatures.LocalSecondaryIndexes) {
                    cli.output(`   LSI Count: ${sourceFeatures.LocalSecondaryIndexes.length}`);
                }
                if (sourceFeatures.StreamDescription) {
                    cli.output(`   Streams: Enabled`);
                }
                if (sourceFeatures.SSEDescription) {
                    cli.output(`   Encryption: ${sourceFeatures.SSEDescription.SSEType || 'Enabled'}`);
                }
            }

            cli.output("==================================================");
        }
    }

    /**
     * Delete an on-demand backup
     * @param args.backup_arn - Full ARN of the backup to delete
     * @param args.snapshot_id - Backup ID (alternative to full ARN)
     */
    @action("delete-snapshot")
    deleteSnapshot(args?: any): void {
        const backupArn = args?.backup_arn || args?.snapshot_id;
        if (!backupArn) {
            throw new Error("backup_arn or snapshot_id is required");
        }

        // If just an ID is provided, construct the ARN
        let fullArn = backupArn;
        if (!backupArn.startsWith('arn:')) {
            if (!this.state.table_arn) {
                throw new Error("Cannot construct backup ARN without table ARN. Please provide full backup_arn.");
            }
            const arnParts = this.state.table_arn.split(':');
            const region = arnParts[3];
            const account = arnParts[4];
            fullArn = `arn:aws:dynamodb:${region}:${account}:table/${this.state.table_name}/backup/${backupArn}`;
        }

        cli.output(`Deleting backup: ${fullArn}...`);

        const response = this.makeDynamoDBRequest("DeleteBackup", {
            BackupArn: fullArn
        });

        if (response.BackupDescription) {
            const details = response.BackupDescription.BackupDetails;
            cli.output("");
            cli.output("✅ Backup deletion initiated!");
            cli.output(`   Name: ${details.BackupName}`);
            cli.output(`   Status: ${details.BackupStatus}`);
        }
    }

    /**
     * Restore table from backup or point-in-time
     * @param args.backup_arn - Full ARN of backup to restore from (for on-demand backup restore)
     * @param args.snapshot_id - Backup ID (alternative to backup_arn)
     * @param args.target_table - Name for the restored table (required)
     * @param args.restore_timestamp - ISO timestamp for PITR restore (alternative to backup restore)
     * @param args.use_latest - Set to "true" to restore to latest restorable time (for PITR)
     */
    @action("restore")
    restore(args?: any): void {
        if (!this.state.table_name) {
            throw new Error("Table not created yet");
        }

        const targetTable = args?.target_table || args?.target_id;
        if (!targetTable) {
            throw new Error("target_table is required - restored data goes to a NEW table");
        }

        const backupArn = args?.backup_arn || args?.snapshot_id;
        const restoreTimestamp = args?.restore_timestamp;
        const useLatest = args?.use_latest === 'true' || args?.use_latest === true;

        if (!backupArn && !restoreTimestamp && !useLatest) {
            throw new Error("Either backup_arn/snapshot_id, restore_timestamp, or use_latest=true is required");
        }

        // Point-in-time restore
        if (restoreTimestamp || useLatest) {
            cli.output(`Initiating point-in-time restore to new table '${targetTable}'...`);
            
            const params: any = {
                SourceTableName: this.state.table_name,
                TargetTableName: targetTable
            };

            if (useLatest) {
                params.UseLatestRestorableTime = true;
                cli.output("Using latest restorable time...");
            } else {
                // Parse timestamp - support both ISO string and Unix timestamp
                let restoreTime: string;
                if (/^\d+$/.test(restoreTimestamp)) {
                    // Unix timestamp in seconds
                    restoreTime = new Date(parseInt(restoreTimestamp, 10) * 1000).toISOString();
                } else {
                    restoreTime = restoreTimestamp;
                }
                params.RestoreDateTime = restoreTime;
                cli.output(`Restoring to: ${restoreTime}`);
            }

            const response = this.makeDynamoDBRequest("RestoreTableToPointInTime", params);

            if (response.TableDescription) {
                cli.output("");
                cli.output("✅ Point-in-time restore initiated!");
                cli.output(`   Target Table: ${response.TableDescription.TableName}`);
                cli.output(`   Status: ${response.TableDescription.TableStatus}`);
                cli.output(`   ARN: ${response.TableDescription.TableArn}`);
                cli.output("");
                cli.output("💡 Use 'get-restore-status' action to monitor progress:");
                cli.output(`   monk do <namespace>/<entity>/get-restore-status target_table="${targetTable}"`);
            }
        } 
        // On-demand backup restore
        else {
            // Construct full ARN if needed
            let fullArn = backupArn;
            if (!backupArn.startsWith('arn:')) {
                if (!this.state.table_arn) {
                    throw new Error("Cannot construct backup ARN without table ARN. Please provide full backup_arn.");
                }
                const arnParts = this.state.table_arn.split(':');
                const region = arnParts[3];
                const account = arnParts[4];
                fullArn = `arn:aws:dynamodb:${region}:${account}:table/${this.state.table_name}/backup/${backupArn}`;
            }

            cli.output(`Restoring from backup to new table '${targetTable}'...`);
            cli.output(`Backup ARN: ${fullArn}`);

            const response = this.makeDynamoDBRequest("RestoreTableFromBackup", {
                BackupArn: fullArn,
                TargetTableName: targetTable
            });

            if (response.TableDescription) {
                cli.output("");
                cli.output("✅ Restore from backup initiated!");
                cli.output(`   Target Table: ${response.TableDescription.TableName}`);
                cli.output(`   Status: ${response.TableDescription.TableStatus}`);
                cli.output(`   ARN: ${response.TableDescription.TableArn}`);
                cli.output("");
                cli.output("💡 Use 'get-restore-status' action to monitor progress:");
                cli.output(`   monk do <namespace>/<entity>/get-restore-status target_table="${targetTable}"`);
            }
        }
    }

    /**
     * Check the status of a restored table
     * @param args.target_table - Name of the restored table to check
     */
    @action("get-restore-status")
    getRestoreStatus(args?: any): void {
        const targetTable = args?.target_table || args?.target_id;
        if (!targetTable) {
            throw new Error("target_table is required");
        }

        cli.output(`Checking restore status for table: ${targetTable}`);
        cli.output("");

        try {
            const response = this.makeDynamoDBRequest("DescribeTable", {
                TableName: targetTable
            });

            if (response.Table) {
                const table = response.Table;
                cli.output("==================================================");
                cli.output("Restore Status");
                cli.output("==================================================");
                cli.output(`Table Name: ${table.TableName}`);
                cli.output(`Status: ${table.TableStatus}`);
                cli.output(`ARN: ${table.TableArn}`);
                
                if (table.RestoreSummary) {
                    const restore = table.RestoreSummary;
                    cli.output("");
                    cli.output("📋 Restore Details:");
                    if (restore.SourceBackupArn) {
                        cli.output(`   Source Backup: ${restore.SourceBackupArn}`);
                    }
                    if (restore.SourceTableArn) {
                        cli.output(`   Source Table: ${restore.SourceTableArn}`);
                    }
                    cli.output(`   Restore Time: ${restore.RestoreDateTime}`);
                    cli.output(`   In Progress: ${restore.RestoreInProgress ? '🔄 Yes' : '✅ Completed'}`);
                }

                if (table.TableStatus === 'ACTIVE') {
                    cli.output("");
                    cli.output("✅ Table is ACTIVE and ready for use!");
                } else if (table.TableStatus === 'CREATING') {
                    cli.output("");
                    cli.output("🔄 Restore is still in progress. Check again in a few minutes.");
                }

                cli.output("==================================================");
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes("ResourceNotFoundException")) {
                cli.output(`❌ Table '${targetTable}' not found.`);
                cli.output("   The restore may not have started yet or the table name is incorrect.");
            } else {
                throw error;
            }
        }
    }

    // ==================== END BACKUP ACTIONS ====================

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