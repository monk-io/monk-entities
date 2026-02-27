import { 
    AWSGlueSchemaRegistryEntity, 
    AWSGlueSchemaRegistryDefinition, 
    AWSGlueSchemaRegistryState, 
    action 
} from "./glue-schema-registry-base.ts";
import cli from "cli";
import { 
    DataFormat,
    Compatibility,
    SchemaStatus,
    SchemaVersionStatus,
    validateSchemaName,
    validateRegistryName
} from "./common.ts";

/**
 * Definition interface for AWS Glue Schema entity.
 * Configures schema properties including format, compatibility, and initial definition.
 * @interface SchemaDefinition
 */
export interface SchemaDefinition extends AWSGlueSchemaRegistryDefinition {
    /** @description Name of the registry containing this schema */
    registry_name: string;
    
    /** @description Unique name for the schema within the registry (1-255 chars) */
    schema_name: string;
    
    /** 
     * @description Data format for the schema
     * @default "AVRO"
     */
    data_format: DataFormat;
    
    /**
     * @description Schema compatibility mode for version evolution
     * @default "BACKWARD"
     */
    compatibility?: Compatibility;
    
    /** @description Initial schema definition (AVRO JSON, JSON Schema, or Protobuf) */
    schema_definition: string;
    
    /** @description Human-readable description of the schema */
    schema_description?: string;
    
    /** @description Resource tags for the schema */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS Glue Schema entity.
 * Contains runtime information about the created schema.
 * @interface SchemaState
 */
export interface SchemaState extends AWSGlueSchemaRegistryState {
    /** @description Full ARN of the schema */
    schema_arn?: string;
    
    /** @description Schema name */
    schema_name?: string;
    
    /** @description Registry name containing this schema */
    registry_name?: string;
    
    /** @description Registry ARN */
    registry_arn?: string;
    
    /** @description Current status of the schema (AVAILABLE, PENDING, DELETING) */
    status?: SchemaStatus;
    
    /** @description Data format of the schema */
    data_format?: DataFormat;
    
    /** @description Compatibility mode */
    compatibility?: Compatibility;
    
    /** @description Latest schema version number */
    latest_schema_version?: number;
    
    /** @description UUID of the latest schema version */
    schema_version_id?: string;
    
    /** @description Status of the latest schema version */
    schema_version_status?: SchemaVersionStatus;
    
    /** @description Schema creation timestamp */
    created_time?: string;
    
    /** @description Schema last updated timestamp */
    updated_time?: string;
}

/**
 * @description AWS Glue Schema entity.
 * Creates and manages schemas within AWS Glue Schema Registry for data validation and evolution.
 * Supports AVRO, JSON Schema, and Protobuf formats with configurable compatibility modes.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.schema_arn` - Schema ARN for IAM policies and cross-service references
 * - `state.schema_name` - Schema name for version registration
 * - `state.registry_name` - Parent registry name
 * - `state.latest_schema_version` - Latest version number for consumers
 * - `state.schema_version_id` - UUID of latest version for SerDe operations
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-glue-schema-registry/registry` - Parent registry for this schema
 * - `aws-glue-schema-registry/schema-version` - Register additional versions
 * - `aws-lambda/function` - Validate data in Lambda functions
 * - `aws-kinesis/stream` - Schema validation for streaming data
 */
export class Schema extends AWSGlueSchemaRegistryEntity<SchemaDefinition, SchemaState> {
    
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

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

        const validFormats: DataFormat[] = ['AVRO', 'JSON', 'PROTOBUF'];
        if (!validFormats.includes(this.definition.data_format)) {
            throw new Error(`Invalid data_format: ${this.definition.data_format}. Must be one of: ${validFormats.join(', ')}`);
        }

        if (this.definition.compatibility) {
            const validCompatibility: Compatibility[] = [
                'NONE', 'DISABLED', 'BACKWARD', 'BACKWARD_ALL', 
                'FORWARD', 'FORWARD_ALL', 'FULL', 'FULL_ALL'
            ];
            if (!validCompatibility.includes(this.definition.compatibility)) {
                throw new Error(`Invalid compatibility: ${this.definition.compatibility}. Must be one of: ${validCompatibility.join(', ')}`);
            }
        }
    }

    override create(): void {
        this.validateDefinition();
        
        // Check if schema already exists
        try {
            const existing = this.getSchemaInfo();
            if (existing) {
                this.state = {
                    schema_arn: existing.SchemaArn,
                    schema_name: existing.SchemaName,
                    registry_name: existing.RegistryName,
                    registry_arn: existing.RegistryArn,
                    status: existing.SchemaStatus as SchemaStatus,
                    data_format: existing.DataFormat as DataFormat,
                    compatibility: existing.Compatibility as Compatibility,
                    latest_schema_version: existing.LatestSchemaVersion,
                    schema_version_id: existing.LatestSchemaVersionId,
                    schema_version_status: existing.LatestSchemaVersionStatus as SchemaVersionStatus,
                    created_time: existing.CreatedTime,
                    updated_time: existing.UpdatedTime,
                    existing: true
                };
                return;
            }
        } catch (error) {
            if (!this.isNotFoundError(error)) {
                throw error;
            }
        }

        // Create the schema with initial version
        const params: Record<string, any> = {
            RegistryId: { RegistryName: this.definition.registry_name },
            SchemaName: this.definition.schema_name,
            DataFormat: this.definition.data_format,
            SchemaDefinition: this.definition.schema_definition
        };

        if (this.definition.compatibility) {
            params.Compatibility = this.definition.compatibility;
        }

        if (this.definition.schema_description) {
            params.Description = this.definition.schema_description;
        }

        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            params.Tags = this.definition.tags;
        }

        const response = this.makeGlueRequest("CreateSchema", params);

        this.state = {
            schema_arn: response.SchemaArn,
            schema_name: response.SchemaName,
            registry_name: response.RegistryName,
            registry_arn: response.RegistryArn,
            status: response.SchemaStatus as SchemaStatus,
            data_format: response.DataFormat as DataFormat,
            compatibility: response.Compatibility as Compatibility,
            latest_schema_version: response.LatestSchemaVersion,
            schema_version_id: response.SchemaVersionId,
            schema_version_status: response.SchemaVersionStatus as SchemaVersionStatus,
            existing: false
        };
    }

    override checkReadiness(): boolean {
        if (!this.state.schema_name || !this.state.registry_name) {
            return false;
        }

        try {
            const info = this.getSchemaInfo();
            if (!info) {
                return false;
            }

            this.state.status = info.SchemaStatus as SchemaStatus;
            this.state.latest_schema_version = info.LatestSchemaVersion;
            this.state.schema_version_id = info.LatestSchemaVersionId;
            this.state.schema_version_status = info.LatestSchemaVersionStatus as SchemaVersionStatus;

            // Schema is ready when status is AVAILABLE
            return info.SchemaStatus === 'AVAILABLE';
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    override update(): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        this.validateDefinition();

        // Check if compatibility or description needs updating
        const compatibilityChanged = this.definition.compatibility && 
            this.definition.compatibility !== this.state.compatibility;
        
        // Get current schema info to check description
        const currentInfo = this.getSchemaInfo();
        const descriptionChanged = this.definition.schema_description !== undefined && 
            this.definition.schema_description !== (currentInfo?.Description || '');

        // Update schema if compatibility or description changed
        if (compatibilityChanged || descriptionChanged) {
            const params: Record<string, any> = {
                SchemaId: {
                    SchemaName: this.state.schema_name,
                    RegistryName: this.state.registry_name
                }
            };

            // Include compatibility (required by API, use current if not changing)
            if (this.definition.compatibility) {
                params.Compatibility = this.definition.compatibility;
            } else if (this.state.compatibility) {
                params.Compatibility = this.state.compatibility;
            }

            if (this.definition.schema_description !== undefined) {
                params.Description = this.definition.schema_description;
            }

            const response = this.makeGlueRequest("UpdateSchema", params);
            this.state.compatibility = response.Compatibility as Compatibility;
        }

        // Update tags if specified
        if (this.definition.tags) {
            this.updateTags();
        }
    }

    override delete(): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            this.makeGlueRequest("DeleteSchema", {
                SchemaId: {
                    SchemaName: this.state.schema_name,
                    RegistryName: this.state.registry_name
                }
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
     * Get schema information from AWS
     */
    private getSchemaInfo(): any {
        try {
            return this.makeGlueRequest("GetSchema", {
                SchemaId: {
                    SchemaName: this.definition.schema_name,
                    RegistryName: this.definition.registry_name
                }
            });
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Update tags on the schema
     */
    private updateTags(): void {
        if (!this.state.schema_arn || !this.definition.tags) {
            return;
        }

        // Get current tags
        const currentTags = this.getTags();
        const newTags = this.definition.tags;

        // Find tags to remove
        const tagsToRemove = Object.keys(currentTags).filter(key => !(key in newTags));
        if (tagsToRemove.length > 0) {
            this.makeGlueRequest("UntagResource", {
                ResourceArn: this.state.schema_arn,
                TagsToRemove: tagsToRemove
            });
        }

        // Add/update tags
        if (Object.keys(newTags).length > 0) {
            this.makeGlueRequest("TagResource", {
                ResourceArn: this.state.schema_arn,
                TagsToAdd: newTags
            });
        }
    }

    /**
     * Get current tags on the schema
     */
    private getTags(): Record<string, string> {
        if (!this.state.schema_arn) {
            return {};
        }

        try {
            const response = this.makeGlueRequest("GetTags", {
                ResourceArn: this.state.schema_arn
            });
            return response.Tags || {};
        } catch (error) {
            return {};
        }
    }

    // ==================== Actions ====================

    /**
     * Get detailed schema information
     */
    @action("get-info")
    getInfo(): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        const info = this.getSchemaInfo();
        if (!info) {
            throw new Error(`Schema ${this.state.schema_name} not found`);
        }

        cli.output("==================================================");
        cli.output(`Schema: ${info.SchemaName}`);
        cli.output("==================================================");
        cli.output(`ARN: ${info.SchemaArn}`);
        cli.output(`Registry: ${info.RegistryName}`);
        cli.output(`Status: ${info.SchemaStatus}`);
        cli.output(`Data Format: ${info.DataFormat}`);
        cli.output(`Compatibility: ${info.Compatibility}`);
        if (info.Description) {
            cli.output(`Description: ${info.Description}`);
        }
        cli.output("");
        cli.output("Version Info:");
        cli.output(`  Latest Version: ${info.LatestSchemaVersion}`);
        cli.output(`  Version ID: ${info.LatestSchemaVersionId}`);
        cli.output(`  Version Status: ${info.LatestSchemaVersionStatus}`);
        cli.output("");
        cli.output(`Created: ${info.CreatedTime}`);
        if (info.UpdatedTime) {
            cli.output(`Updated: ${info.UpdatedTime}`);
        }

        // Get and display tags
        const tags = this.getTags();
        if (Object.keys(tags).length > 0) {
            cli.output("");
            cli.output("Tags:");
            for (const [key, value] of Object.entries(tags)) {
                cli.output(`  ${key}: ${value}`);
            }
        }

        cli.output("==================================================");
    }

    /**
     * Register a new schema version
     */
    @action("register-version")
    registerVersion(args?: { schema_definition?: string }): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        const schemaDefinition = args?.schema_definition || this.definition.schema_definition;
        if (!schemaDefinition) {
            throw new Error("schema_definition is required");
        }

        cli.output(`Registering new version for schema '${this.state.schema_name}'...`);

        const response = this.makeGlueRequest("RegisterSchemaVersion", {
            SchemaId: {
                SchemaName: this.state.schema_name,
                RegistryName: this.state.registry_name
            },
            SchemaDefinition: schemaDefinition
        });

        cli.output("");
        cli.output("✅ Schema version registered!");
        cli.output(`   Version Number: ${response.VersionNumber}`);
        cli.output(`   Version ID: ${response.SchemaVersionId}`);
        cli.output(`   Status: ${response.Status}`);

        // Update state with new version info
        this.state.latest_schema_version = response.VersionNumber;
        this.state.schema_version_id = response.SchemaVersionId;
        this.state.schema_version_status = response.Status as SchemaVersionStatus;
    }

    /**
     * List all versions of this schema
     */
    @action("list-versions")
    listVersions(args?: { max_results?: string; next_token?: string }): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        const params: Record<string, any> = {
            SchemaId: {
                SchemaName: this.state.schema_name,
                RegistryName: this.state.registry_name
            }
        };

        if (args?.max_results) {
            params.MaxResults = parseInt(args.max_results, 10);
        }

        if (args?.next_token) {
            params.NextToken = args.next_token;
        }

        const response = this.makeGlueRequest("ListSchemaVersions", params);

        cli.output("==================================================");
        cli.output(`Versions of Schema: ${this.state.schema_name}`);
        cli.output("==================================================");

        if (response.Schemas && response.Schemas.length > 0) {
            cli.output(`Total: ${response.Schemas.length} version(s)`);
            cli.output("");

            for (const version of response.Schemas) {
                const isLatest = version.VersionNumber === this.state.latest_schema_version ? " (latest)" : "";
                cli.output(`📋 Version ${version.VersionNumber}${isLatest}`);
                cli.output(`   Version ID: ${version.SchemaVersionId}`);
                cli.output(`   Status: ${version.Status}`);
                cli.output(`   Created: ${version.CreatedTime}`);
                cli.output("");
            }

            if (response.NextToken) {
                cli.output(`📝 More versions available. Use next_token="${response.NextToken}" to see more.`);
            }
        } else {
            cli.output("No versions found.");
        }

        cli.output("==================================================");
    }

    /**
     * Get a specific schema version
     */
    @action("get-version")
    getVersion(args?: { version_number?: string; version_id?: string }): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        const params: Record<string, any> = {};

        if (args?.version_id) {
            params.SchemaVersionId = args.version_id;
        } else {
            params.SchemaId = {
                SchemaName: this.state.schema_name,
                RegistryName: this.state.registry_name
            };

            if (args?.version_number) {
                params.SchemaVersionNumber = {
                    VersionNumber: parseInt(args.version_number, 10)
                };
            } else {
                params.SchemaVersionNumber = { LatestVersion: true };
            }
        }

        const response = this.makeGlueRequest("GetSchemaVersion", params);

        cli.output("==================================================");
        cli.output(`Schema Version Details`);
        cli.output("==================================================");
        cli.output(`Schema ARN: ${response.SchemaArn}`);
        cli.output(`Version Number: ${response.VersionNumber}`);
        cli.output(`Version ID: ${response.SchemaVersionId}`);
        cli.output(`Status: ${response.Status}`);
        cli.output(`Data Format: ${response.DataFormat}`);
        cli.output(`Created: ${response.CreatedTime}`);
        cli.output("");
        cli.output("Schema Definition:");
        cli.output("--------------------------------------------------");
        cli.output(response.SchemaDefinition);
        cli.output("==================================================");
    }

    /**
     * Check if a schema definition is syntactically valid.
     * 
     * NOTE: This action only validates that the schema definition is well-formed
     * according to the data format (AVRO, JSON, PROTOBUF). It does NOT check
     * compatibility with previous schema versions. To verify compatibility,
     * use the register-version action which will fail if the schema is incompatible
     * with the registry's compatibility mode.
     */
    @action("check-validity")
    checkValidity(args?: { schema_definition?: string }): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        const schemaDefinition = args?.schema_definition;
        if (!schemaDefinition) {
            throw new Error("schema_definition is required");
        }

        cli.output(`Checking schema validity for '${this.state.schema_name}'...`);
        cli.output(`Data format: ${this.state.data_format}`);
        cli.output("");

        const response = this.makeGlueRequest("CheckSchemaVersionValidity", {
            DataFormat: this.state.data_format,
            SchemaDefinition: schemaDefinition
        });

        cli.output("");
        if (response.Valid) {
            cli.output("✅ Schema definition is syntactically VALID!");
            cli.output("");
            cli.output("⚠️  NOTE: This only validates syntax, not compatibility.");
            cli.output("   To check compatibility with previous versions, use 'register-version'.");
            cli.output(`   Current compatibility mode: ${this.state.compatibility || 'NONE'}`);
        } else {
            cli.output("❌ Schema definition is INVALID (syntax error).");
            if (response.Error) {
                cli.output(`   Error: ${response.Error}`);
            }
        }
    }

    /**
     * Get diff between two schema versions
     */
    @action("get-diff")
    getDiff(args?: { first_version?: string; second_version?: string }): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        const firstVersion = args?.first_version ? parseInt(args.first_version, 10) : 1;
        const secondVersion = args?.second_version 
            ? parseInt(args.second_version, 10) 
            : (this.state.latest_schema_version || 1);

        cli.output(`Getting diff between version ${firstVersion} and ${secondVersion}...`);

        const response = this.makeGlueRequest("GetSchemaVersionsDiff", {
            SchemaId: {
                SchemaName: this.state.schema_name,
                RegistryName: this.state.registry_name
            },
            FirstSchemaVersionNumber: { VersionNumber: firstVersion },
            SecondSchemaVersionNumber: { VersionNumber: secondVersion },
            SchemaDiffType: 'SYNTAX_DIFF'
        });

        cli.output("");
        cli.output("==================================================");
        cli.output(`Schema Diff: v${firstVersion} → v${secondVersion}`);
        cli.output("==================================================");
        
        if (response.Diff) {
            cli.output(response.Diff);
        } else {
            cli.output("No differences found or diff not available.");
        }
        
        cli.output("==================================================");
    }

    /**
     * Get the schema definition for the latest version
     */
    @action("get-definition")
    getDefinition(args?: { version_number?: string }): void {
        if (!this.state.schema_name || !this.state.registry_name) {
            throw new Error("Schema not created yet");
        }

        const params: Record<string, any> = {
            SchemaId: {
                SchemaName: this.state.schema_name,
                RegistryName: this.state.registry_name
            }
        };

        if (args?.version_number) {
            params.SchemaVersionNumber = {
                VersionNumber: parseInt(args.version_number, 10)
            };
        } else {
            params.SchemaVersionNumber = { LatestVersion: true };
        }

        const response = this.makeGlueRequest("GetSchemaVersion", params);

        // Output just the schema definition for easy piping
        cli.output(response.SchemaDefinition);
    }
}
