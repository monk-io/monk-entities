import { 
    AWSGlueSchemaRegistryEntity, 
    AWSGlueSchemaRegistryDefinition, 
    AWSGlueSchemaRegistryState, 
    action 
} from "./glue-schema-registry-base.ts";
import cli from "cli";
import { 
    RegistryStatus, 
    validateRegistryName 
} from "./common.ts";

/**
 * Definition interface for AWS Glue Schema Registry entity.
 * Configures registry properties including name, description, and tags.
 * @interface RegistryDefinition
 */
export interface RegistryDefinition extends AWSGlueSchemaRegistryDefinition {
    /** @description Unique name for the schema registry (1-255 chars, alphanumeric with hyphens/underscores) */
    registry_name: string;
    
    /** @description Human-readable description of the registry */
    registry_description?: string;
    
    /** @description Resource tags for the registry */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS Glue Schema Registry entity.
 * Contains runtime information about the created registry.
 * @interface RegistryState
 */
export interface RegistryState extends AWSGlueSchemaRegistryState {
    /** @description Full ARN of the registry */
    registry_arn?: string;
    
    /** @description Registry name */
    registry_name?: string;
    
    /** @description Current status of the registry (AVAILABLE, DELETING) */
    status?: RegistryStatus;
    
    /** @description Registry creation timestamp */
    created_time?: string;
    
    /** @description Registry last updated timestamp */
    updated_time?: string;
}

/**
 * @description AWS Glue Schema Registry entity.
 * Creates and manages AWS Glue Schema Registries for organizing and versioning data schemas.
 * Registries serve as containers for schemas used in data streaming and ETL pipelines.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.registry_arn` - Registry ARN for IAM policies and cross-service references
 * - `state.registry_name` - Registry name for schema creation
 * - `state.status` - Current registry status (AVAILABLE, DELETING)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-glue-schema-registry/schema` - Create schemas within this registry
 * - `aws-iam/role` - Grant registry access to Lambda, Glue jobs, or streaming applications
 */
export class Registry extends AWSGlueSchemaRegistryEntity<RegistryDefinition, RegistryState> {
    
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    private validateDefinition(): void {
        if (!validateRegistryName(this.definition.registry_name)) {
            throw new Error(
                `Invalid registry name: ${this.definition.registry_name}. ` +
                `Must be 1-255 characters and contain only letters, numbers, hyphens, and underscores.`
            );
        }
    }

    override create(): void {
        this.validateDefinition();
        
        // Check if registry already exists
        try {
            const existing = this.getRegistryInfo(this.definition.registry_name);
            if (existing) {
                this.state = {
                    registry_arn: existing.RegistryArn,
                    registry_name: existing.RegistryName,
                    status: existing.Status as RegistryStatus,
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

        // Create the registry
        const params: Record<string, any> = {
            RegistryName: this.definition.registry_name
        };

        if (this.definition.registry_description) {
            params.Description = this.definition.registry_description;
        }

        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            params.Tags = this.definition.tags;
        }

        const response = this.makeGlueRequest("CreateRegistry", params);

        this.state = {
            registry_arn: response.RegistryArn,
            registry_name: response.RegistryName,
            status: response.Status as RegistryStatus,
            existing: false
        };
    }

    override checkReadiness(): boolean {
        if (!this.state.registry_name) {
            return false;
        }

        try {
            const info = this.getRegistryInfo(this.state.registry_name);
            if (!info) {
                return false;
            }

            this.state.status = info.Status as RegistryStatus;
            return info.Status === 'AVAILABLE';
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    override update(): void {
        if (!this.state.registry_name) {
            throw new Error("Registry not created yet");
        }

        this.validateDefinition();

        // Update registry description if changed
        if (this.definition.registry_description !== undefined) {
            const params: Record<string, any> = {
                RegistryId: { RegistryName: this.state.registry_name },
                Description: this.definition.registry_description
            };

            this.makeGlueRequest("UpdateRegistry", params);
            // Note: UpdateRegistry response only contains RegistryArn, RegistryName, Description
            // It does NOT return UpdatedTime, so we preserve existing state.updated_time
        }

        // Update tags if specified
        if (this.definition.tags) {
            this.updateTags();
        }
    }

    override delete(): void {
        if (!this.state.registry_name) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            this.makeGlueRequest("DeleteRegistry", {
                RegistryId: { RegistryName: this.state.registry_name }
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
     * Get registry information from AWS
     */
    private getRegistryInfo(registryName: string): any {
        try {
            return this.makeGlueRequest("GetRegistry", {
                RegistryId: { RegistryName: registryName }
            });
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Update tags on the registry
     */
    private updateTags(): void {
        if (!this.state.registry_arn || !this.definition.tags) {
            return;
        }

        // Get current tags
        const currentTags = this.getTags();
        const newTags = this.definition.tags;

        // Find tags to remove
        const tagsToRemove = Object.keys(currentTags).filter(key => !(key in newTags));
        if (tagsToRemove.length > 0) {
            this.makeGlueRequest("UntagResource", {
                ResourceArn: this.state.registry_arn,
                TagsToRemove: tagsToRemove
            });
        }

        // Add/update tags
        if (Object.keys(newTags).length > 0) {
            this.makeGlueRequest("TagResource", {
                ResourceArn: this.state.registry_arn,
                TagsToAdd: newTags
            });
        }
    }

    /**
     * Get current tags on the registry
     */
    private getTags(): Record<string, string> {
        if (!this.state.registry_arn) {
            return {};
        }

        try {
            const response = this.makeGlueRequest("GetTags", {
                ResourceArn: this.state.registry_arn
            });
            return response.Tags || {};
        } catch (error) {
            return {};
        }
    }

    // ==================== Actions ====================

    /**
     * Get detailed registry information
     */
    @action("get-info")
    getInfo(): void {
        if (!this.state.registry_name) {
            throw new Error("Registry not created yet");
        }

        const info = this.getRegistryInfo(this.state.registry_name);
        if (!info) {
            throw new Error(`Registry ${this.state.registry_name} not found`);
        }

        cli.output("==================================================");
        cli.output(`Registry: ${info.RegistryName}`);
        cli.output("==================================================");
        cli.output(`ARN: ${info.RegistryArn}`);
        cli.output(`Status: ${info.Status}`);
        if (info.Description) {
            cli.output(`Description: ${info.Description}`);
        }
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
     * List all schemas in this registry
     */
    @action("list-schemas")
    listSchemas(args?: { max_results?: string; next_token?: string }): void {
        if (!this.state.registry_name) {
            throw new Error("Registry not created yet");
        }

        const params: Record<string, any> = {
            RegistryId: { RegistryName: this.state.registry_name }
        };

        if (args?.max_results) {
            params.MaxResults = parseInt(args.max_results, 10);
        }

        if (args?.next_token) {
            params.NextToken = args.next_token;
        }

        const response = this.makeGlueRequest("ListSchemas", params);

        cli.output("==================================================");
        cli.output(`Schemas in Registry: ${this.state.registry_name}`);
        cli.output("==================================================");

        if (response.Schemas && response.Schemas.length > 0) {
            cli.output(`Total: ${response.Schemas.length} schema(s)`);
            cli.output("");

            for (const schema of response.Schemas) {
                cli.output(`📋 ${schema.SchemaName}`);
                cli.output(`   ARN: ${schema.SchemaArn}`);
                cli.output(`   Status: ${schema.SchemaStatus}`);
                if (schema.Description) {
                    cli.output(`   Description: ${schema.Description}`);
                }
                cli.output(`   Created: ${schema.CreatedTime}`);
                cli.output("");
            }

            if (response.NextToken) {
                cli.output(`📝 More schemas available. Use next_token="${response.NextToken}" to see more.`);
            }
        } else {
            cli.output("No schemas found in this registry.");
            cli.output("");
            cli.output("💡 Create a schema with aws-glue-schema-registry/schema entity");
        }

        cli.output("==================================================");
    }

    /**
     * List all registries in the account/region
     */
    @action("list-registries")
    listRegistries(args?: { max_results?: string; next_token?: string }): void {
        const params: Record<string, any> = {};

        if (args?.max_results) {
            params.MaxResults = parseInt(args.max_results, 10);
        }

        if (args?.next_token) {
            params.NextToken = args.next_token;
        }

        const response = this.makeGlueRequest("ListRegistries", params);

        cli.output("==================================================");
        cli.output(`Schema Registries in ${this.region}`);
        cli.output("==================================================");

        if (response.Registries && response.Registries.length > 0) {
            cli.output(`Total: ${response.Registries.length} registry(ies)`);
            cli.output("");

            for (const registry of response.Registries) {
                const isCurrent = registry.RegistryName === this.state.registry_name ? " (current)" : "";
                cli.output(`📦 ${registry.RegistryName}${isCurrent}`);
                cli.output(`   ARN: ${registry.RegistryArn}`);
                cli.output(`   Status: ${registry.Status}`);
                if (registry.Description) {
                    cli.output(`   Description: ${registry.Description}`);
                }
                cli.output("");
            }

            if (response.NextToken) {
                cli.output(`📝 More registries available. Use next_token="${response.NextToken}" to see more.`);
            }
        } else {
            cli.output("No registries found.");
        }

        cli.output("==================================================");
    }
}
