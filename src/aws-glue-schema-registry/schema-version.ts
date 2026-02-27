import { 
    AWSGlueSchemaRegistryEntity, 
    AWSGlueSchemaRegistryDefinition, 
    AWSGlueSchemaRegistryState, 
    action 
} from "./glue-schema-registry-base.ts";
import cli from "cli";
import { 
    DataFormat,
    SchemaVersionStatus,
    validateSchemaName,
    validateRegistryName
} from "./common.ts";

/**
 * Definition interface for AWS Glue Schema Version entity.
 * Configures schema version properties including the schema definition.
 * @interface SchemaVersionDefinition
 */
export interface SchemaVersionDefinition extends AWSGlueSchemaRegistryDefinition {
    /** @description Name of the registry containing the schema */
    registry_name: string;
    
    /** @description Name of the schema to add a version to */
    schema_name: string;
    
    /** @description Schema definition for this version (AVRO JSON, JSON Schema, or Protobuf) */
    schema_definition: string;
    
    /** 
     * @description Optional metadata key-value pairs to attach to this version
     * Keys and values must be strings, max 256 chars each
     */
    metadata?: Record<string, string>;
}

/**
 * State interface for AWS Glue Schema Version entity.
 * Contains runtime information about the registered schema version.
 * @interface SchemaVersionState
 */
export interface SchemaVersionState extends AWSGlueSchemaRegistryState {
    /** @description UUID of this schema version */
    schema_version_id?: string;
    
    /** @description Sequential version number */
    version_number?: number;
    
    /** @description Current status of the version (AVAILABLE, PENDING, FAILURE, DELETING) */
    status?: SchemaVersionStatus;
    
    /** @description Parent schema ARN */
    schema_arn?: string;
    
    /** @description Schema name */
    schema_name?: string;
    
    /** @description Registry name */
    registry_name?: string;
    
    /** @description Data format of the schema */
    data_format?: DataFormat;
    
    /** @description Version creation timestamp */
    created_time?: string;
}

/**
 * @description AWS Glue Schema Version entity.
 * Registers and manages individual schema versions within AWS Glue Schema Registry.
 * Each version represents an evolution of the schema with compatibility validation.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.schema_version_id` - UUID for SerDe operations and version lookup
 * - `state.version_number` - Sequential version number for reference
 * - `state.status` - Current version status (AVAILABLE, PENDING, FAILURE)
 * - `state.schema_arn` - Parent schema ARN
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-glue-schema-registry/schema` - Parent schema for this version
 * - `aws-kinesis/stream` - Use version ID for data serialization
 * - `aws-lambda/function` - Deserialize data using version ID
 */
export class SchemaVersion extends AWSGlueSchemaRegistryEntity<SchemaVersionDefinition, SchemaVersionState> {
    
    static readonly readiness = { period: 3, initialDelay: 1, attempts: 20 };

    private validateDefinition(): void {
        if (!validateRegistryName(this.definition.registry_name)) {
            throw new Error(
                `Invalid registry name: ${this.definition.registry_name}. ` +
                `Must be 1-255 characters and contain only letters, numbers, hyphens, and underscores.`
            );
        }

        if (!validateSchemaName(this.definition.schema_name)) {
            throw new Error(
                `Invalid schema name: ${this.definition.schema_name}. ` +
                `Must be 1-255 characters and contain only letters, numbers, hyphens, underscores, and dots.`
            );
        }

        if (!this.definition.schema_definition || this.definition.schema_definition.trim() === '') {
            throw new Error("schema_definition is required and cannot be empty");
        }

        // Validate metadata if provided
        if (this.definition.metadata) {
            for (const [key, value] of Object.entries(this.definition.metadata)) {
                if (key.length > 256) {
                    throw new Error(`Metadata key '${key.substring(0, 50)}...' exceeds 256 character limit`);
                }
                if (value.length > 256) {
                    throw new Error(`Metadata value for key '${key}' exceeds 256 character limit`);
                }
            }
        }
    }

    override create(): void {
        this.validateDefinition();
        
        // Register the schema version
        const response = this.makeGlueRequest("RegisterSchemaVersion", {
            SchemaId: {
                SchemaName: this.definition.schema_name,
                RegistryName: this.definition.registry_name
            },
            SchemaDefinition: this.definition.schema_definition
        });

        this.state = {
            schema_version_id: response.SchemaVersionId,
            version_number: response.VersionNumber,
            status: response.Status as SchemaVersionStatus,
            schema_name: this.definition.schema_name,
            registry_name: this.definition.registry_name,
            existing: false
        };

        // Add metadata if specified
        if (this.definition.metadata && Object.keys(this.definition.metadata).length > 0) {
            this.addMetadata(this.definition.metadata);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.schema_version_id) {
            return false;
        }

        try {
            const info = this.getVersionInfo();
            if (!info) {
                return false;
            }

            this.state.status = info.Status as SchemaVersionStatus;
            this.state.schema_arn = info.SchemaArn;
            this.state.data_format = info.DataFormat as DataFormat;
            this.state.created_time = info.CreatedTime;

            // Version is ready when status is AVAILABLE
            // FAILURE status means the version failed validation
            if (info.Status === 'FAILURE') {
                throw new Error(`Schema version failed validation. Check schema compatibility settings.`);
            }

            return info.Status === 'AVAILABLE';
        } catch (error) {
            if (error instanceof Error && error.message.includes('failed validation')) {
                throw error;
            }
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    override update(): void {
        // Schema versions are immutable - only metadata can be updated
        if (!this.state.schema_version_id) {
            throw new Error("Schema version not created yet");
        }

        // Update metadata if specified
        if (this.definition.metadata) {
            // Get current metadata and compare
            const currentMetadata = this.queryAllMetadata();
            const newMetadata = this.definition.metadata;

            // Remove metadata keys that are no longer present
            for (const key of Object.keys(currentMetadata)) {
                if (!(key in newMetadata)) {
                    this.removeMetadataKey(key);
                }
            }

            // Add/update metadata
            if (Object.keys(newMetadata).length > 0) {
                this.addMetadata(newMetadata);
            }
        }
    }

    override delete(): void {
        if (!this.state.schema_version_id) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            // Delete specific schema version
            this.makeGlueRequest("DeleteSchemaVersions", {
                SchemaId: {
                    SchemaName: this.state.schema_name,
                    RegistryName: this.state.registry_name
                },
                Versions: `${this.state.version_number}`
            });
            this.state.status = 'DELETING';
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return;
            }
            throw error;
        }
    }

    /**
     * Get version information from AWS
     */
    private getVersionInfo(): any {
        try {
            return this.makeGlueRequest("GetSchemaVersion", {
                SchemaVersionId: this.state.schema_version_id
            });
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Add metadata to the schema version
     */
    private addMetadata(metadata: Record<string, string>): void {
        if (!this.state.schema_version_id) {
            return;
        }

        for (const [key, value] of Object.entries(metadata)) {
            try {
                this.makeGlueRequest("PutSchemaVersionMetadata", {
                    SchemaVersionId: this.state.schema_version_id,
                    MetadataKeyValue: {
                        MetadataKey: key,
                        MetadataValue: value
                    }
                });
            } catch (error) {
                // Log but don't fail on metadata errors
                console.log(`Warning: Failed to add metadata key '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }

    /**
     * Query all metadata for this version
     */
    private queryAllMetadata(): Record<string, string> {
        if (!this.state.schema_version_id) {
            return {};
        }

        try {
            const response = this.makeGlueRequest("QuerySchemaVersionMetadata", {
                SchemaVersionId: this.state.schema_version_id
            });

            const result: Record<string, string> = {};
            if (response.MetadataInfoMap) {
                for (const [key, info] of Object.entries(response.MetadataInfoMap as Record<string, any>)) {
                    result[key] = info.MetadataValue || '';
                }
            }
            return result;
        } catch (error) {
            return {};
        }
    }

    /**
     * Remove a metadata key from this version
     */
    private removeMetadataKey(key: string): void {
        if (!this.state.schema_version_id) {
            return;
        }

        try {
            this.makeGlueRequest("RemoveSchemaVersionMetadata", {
                SchemaVersionId: this.state.schema_version_id,
                MetadataKeyValue: {
                    MetadataKey: key,
                    MetadataValue: '' // Value is required but ignored for removal
                }
            });
        } catch (error) {
            // Ignore errors when removing metadata
        }
    }

    // ==================== Actions ====================

    /**
     * Get detailed version information
     */
    @action("get-info")
    getInfo(): void {
        if (!this.state.schema_version_id) {
            throw new Error("Schema version not created yet");
        }

        const info = this.getVersionInfo();
        if (!info) {
            throw new Error(`Schema version ${this.state.schema_version_id} not found`);
        }

        cli.output("==================================================");
        cli.output(`Schema Version Details`);
        cli.output("==================================================");
        cli.output(`Version ID: ${info.SchemaVersionId}`);
        cli.output(`Version Number: ${info.VersionNumber}`);
        cli.output(`Schema ARN: ${info.SchemaArn}`);
        cli.output(`Status: ${info.Status}`);
        cli.output(`Data Format: ${info.DataFormat}`);
        cli.output(`Created: ${info.CreatedTime}`);

        // Get and display metadata
        const metadata = this.queryAllMetadata();
        if (Object.keys(metadata).length > 0) {
            cli.output("");
            cli.output("Metadata:");
            for (const [key, value] of Object.entries(metadata)) {
                cli.output(`  ${key}: ${value}`);
            }
        }

        cli.output("==================================================");
    }

    /**
     * Get the schema definition for this version
     */
    @action("get-definition")
    getDefinition(): void {
        if (!this.state.schema_version_id) {
            throw new Error("Schema version not created yet");
        }

        const info = this.getVersionInfo();
        if (!info) {
            throw new Error(`Schema version ${this.state.schema_version_id} not found`);
        }

        // Output just the schema definition for easy piping
        cli.output(info.SchemaDefinition);
    }

    /**
     * Add or update metadata on this version
     */
    @action("put-metadata")
    putMetadata(args?: { key?: string; value?: string }): void {
        if (!this.state.schema_version_id) {
            throw new Error("Schema version not created yet");
        }

        if (!args?.key) {
            throw new Error("key is required");
        }

        if (!args?.value) {
            throw new Error("value is required");
        }

        if (args.key.length > 256) {
            throw new Error("Metadata key exceeds 256 character limit");
        }

        if (args.value.length > 256) {
            throw new Error("Metadata value exceeds 256 character limit");
        }

        cli.output(`Adding metadata to version ${this.state.version_number}...`);

        this.makeGlueRequest("PutSchemaVersionMetadata", {
            SchemaVersionId: this.state.schema_version_id,
            MetadataKeyValue: {
                MetadataKey: args.key,
                MetadataValue: args.value
            }
        });

        cli.output("");
        cli.output("✅ Metadata added successfully!");
        cli.output(`   Key: ${args.key}`);
        cli.output(`   Value: ${args.value}`);
    }

    /**
     * Query metadata on this version
     */
    @action("query-metadata")
    queryMetadata(args?: { key?: string }): void {
        if (!this.state.schema_version_id) {
            throw new Error("Schema version not created yet");
        }

        const params: Record<string, any> = {
            SchemaVersionId: this.state.schema_version_id
        };

        if (args?.key) {
            params.MetadataKeyValue = {
                MetadataKey: args.key
            };
        }

        const response = this.makeGlueRequest("QuerySchemaVersionMetadata", params);

        cli.output("==================================================");
        cli.output(`Metadata for Version ${this.state.version_number}`);
        cli.output("==================================================");

        if (response.MetadataInfoMap && Object.keys(response.MetadataInfoMap).length > 0) {
            for (const [key, info] of Object.entries(response.MetadataInfoMap as Record<string, any>)) {
                cli.output(`${key}: ${info.MetadataValue}`);
                if (info.CreatedTime) {
                    cli.output(`  Created: ${info.CreatedTime}`);
                }
            }
        } else {
            cli.output("No metadata found.");
        }

        cli.output("==================================================");
    }

    /**
     * Remove metadata from this version
     */
    @action("remove-metadata")
    removeMetadata(args?: { key?: string }): void {
        if (!this.state.schema_version_id) {
            throw new Error("Schema version not created yet");
        }

        if (!args?.key) {
            throw new Error("key is required");
        }

        cli.output(`Removing metadata key '${args.key}' from version ${this.state.version_number}...`);

        // Need to get the current value first (API requires it)
        const metadata = this.queryAllMetadata();
        const currentValue = metadata[args.key];

        if (!currentValue) {
            cli.output(`Metadata key '${args.key}' not found.`);
            return;
        }

        this.makeGlueRequest("RemoveSchemaVersionMetadata", {
            SchemaVersionId: this.state.schema_version_id,
            MetadataKeyValue: {
                MetadataKey: args.key,
                MetadataValue: currentValue
            }
        });

        cli.output("");
        cli.output("✅ Metadata removed successfully!");
    }

    /**
     * Check if this version's definition is compatible with the schema
     */
    @action("check-validity")
    checkValidity(): void {
        if (!this.state.schema_version_id) {
            throw new Error("Schema version not created yet");
        }

        const info = this.getVersionInfo();
        if (!info) {
            throw new Error(`Schema version ${this.state.schema_version_id} not found`);
        }

        cli.output("==================================================");
        cli.output(`Version Validity Check`);
        cli.output("==================================================");
        cli.output(`Version: ${info.VersionNumber}`);
        cli.output(`Status: ${info.Status}`);

        if (info.Status === 'AVAILABLE') {
            cli.output("");
            cli.output("✅ Schema version is VALID and available for use.");
        } else if (info.Status === 'PENDING') {
            cli.output("");
            cli.output("⏳ Schema version is still being validated...");
        } else if (info.Status === 'FAILURE') {
            cli.output("");
            cli.output("❌ Schema version FAILED validation.");
            cli.output("   This may be due to compatibility issues with previous versions.");
        }

        cli.output("==================================================");
    }
}
