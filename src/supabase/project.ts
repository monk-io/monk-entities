import { SupabaseEntity, SupabaseEntityDefinition, SupabaseEntityState } from "./supabase-base.ts";
import cli from "cli";
import secret from "secret";

/**
 * Represents a Supabase project entity.
 * This entity allows interaction with Supabase projects via the Management API.
 */
export interface ProjectDefinition extends SupabaseEntityDefinition {
    /**
     * @description Project name (required)
     * @minLength 1
     * @maxLength 256
     */
    name: string;

    /**
     * @description Database password (optional - if not provided, will be retrieved/generated from secret)
     * @minLength 8
     */
    db_pass?: string;

    /**
     * @description Secret reference for database password
     * Defaults to "{project-name}-db-password" if not provided
     */
    db_pass_secret_ref?: string;

    /**
     * @description Secret reference for anon API key
     * If provided, the anon API key will be fetched and saved to this secret
     */
    anon_api_key_secret_ref?: string;

    /**
     * @description Secret reference for service_role API key
     * If provided, the service_role API key will be fetched and saved to this secret
     */
    service_role_api_key_secret_ref?: string;

    /**
     * @description Organization ID (required)
     * Organization slug for the project
     */
    organization_id: string;

    /**
     * @description Desired instance size for the project
     * Only available for paid plans
     */
    desired_instance_size?: "pico" | "nano" | "micro" | "small" | "medium" | "large" | "xlarge" | "2xlarge" | "4xlarge" | "8xlarge" | "12xlarge" | "16xlarge" | "24xlarge" | "24xlarge_optimized_memory" | "24xlarge_optimized_cpu" | "24xlarge_high_memory" | "48xlarge" | "48xlarge_optimized_memory" | "48xlarge_optimized_cpu" | "48xlarge_high_memory";

    /**
     * @description Region selection for the project
     * Can be either a specific region or a smart group
     * @default { type: "specific", code: "us-east-1" }
     */
    region_selection?: {
        /**
         * @description Region selection type - specific region
         */
        type: "specific";
        /**
         * @description Specific region code
         * Note: Codes should be retrieved from /available-regions endpoint for latest options
         */
        code: "us-east-1" | "us-east-2" | "us-west-1" | "us-west-2" | "ap-east-1" | "ap-southeast-1" | "ap-northeast-1" | "ap-northeast-2" | "ap-southeast-2" | "eu-west-1" | "eu-west-2" | "eu-west-3" | "eu-north-1" | "eu-central-1" | "eu-central-2" | "ca-central-1" | "ap-south-1" | "sa-east-1";
    } | {
        /**
         * @description Region selection type - smart regional group
         */
        type: "smartGroup";
        /**
         * @description Smart Region Group code
         * Note: Codes should be retrieved from /available-regions endpoint for latest options
         */
        code: "americas" | "emea" | "apac";
    };

}

/**
 * Represents the mutable runtime state of a Supabase project entity.
 * Minimal state containing only the project ID.
 */
export interface ProjectState extends SupabaseEntityState {
    /**
     * @description Project ID (primary identifier)
     */
    id?: string;
}

/**
 * @description Supabase Project entity.
 * Creates and manages Supabase projects with PostgreSQL database, Auth, and Storage.
 * Provides a complete backend-as-a-service platform.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Supabase management API token (defaults to `supabase-api-token`)
 * - Writes: secret name from `db_pass_secret_ref` property (defaults to `{name}-db-password`), 
 *   secret names from `anon_api_key_secret_ref`, `service_role_api_key_secret_ref` properties (if specified)
 * 
 * ## State Fields for Composition
 * - `state.id` - Project ID (reference ID for Supabase)
 * 
 * ## Composing with Other Entities
 * Supabase projects are standalone and include integrated services.
 */
export class Project extends SupabaseEntity<ProjectDefinition, ProjectState> {

    protected getEntityName(): string {
        return this.definition.name;
    }

    /** Create a new Supabase project */
    override create(): void {
        // Check if project already exists by name
        const existingProject = this.findExistingProject();

        if (existingProject) {
            // Project already exists, use it
            this.state = {
                id: existingProject.id as string,
                existing: true
            };
            cli.output(`✅ Project ${this.definition.name} already exists (id: ${existingProject.id as string})`);
            
            // Fetch and save API keys if secret references are provided
            this.fetchAndSaveApiKeys();
            return;
        }

        // Get or create database password
        const dbPassword = this.getOrCreateDatabasePassword();

        // Prepare request body for project creation
        const body: Record<string, unknown> = {
            name: this.definition.name,
            db_pass: dbPassword,
            organization_id: this.definition.organization_id,
            region_selection: this.definition.region_selection || {
                type: "specific",
                code: "us-east-1"
            },
        };

        if (this.definition.desired_instance_size) {
            body.desired_instance_size = this.definition.desired_instance_size;
        }

        // Create the project
        let createObj;
        try {
            createObj = this.makeRequest("POST", "/v1/projects", body);
        } catch (error) {
            let errorMessage = "Unknown error";

            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === "string") {
                errorMessage = error;
            }

            cli.output(`❌ Project creation failed: ${errorMessage}`);

            // Check if it's a 409 conflict error (project already exists)
            if (errorMessage.includes("409") || errorMessage.includes("already exists")) {
                cli.output(`🔄 Project creation failed with 409 (project already exists), trying to find existing project...`);
                const retryProject = this.findExistingProject();
                if (retryProject) {
                    this.state = {
                        id: retryProject.id as string,
                        existing: true
                    };
                    cli.output(`✅ Project ${this.definition.name} already exists after 409 (id: ${retryProject.id as string})`);
                    return;
                }
            }

            throw new Error(`Failed to create project: ${errorMessage}`);
        }

        // Set state from created project
        this.state = {
            id: createObj.id,
            existing: false
        };

        cli.output(`✅ Created Supabase project: ${createObj.name} (id: ${createObj.id})`);

        // Fetch and save API keys if secret references are provided
        this.fetchAndSaveApiKeys();
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }


        const body: Record<string, unknown> = {};
        let hasChanges = false;

        // Only include name if it's different
        if (this.definition.name) {
            body.name = this.definition.name;
            hasChanges = true;
        }

        // Skip update if nothing has changed
        if (!hasChanges) {
            cli.output(`ℹ️  No changes detected for project: ${this.definition.name}`);
            
            // Still fetch and save API keys if secret references are provided
            this.fetchAndSaveApiKeys();
            return;
        }

        const updatedProject = this.makeRequest("PATCH", `/v1/projects/${this.state.id}`, body);

        // State remains the same - only ID is tracked
        cli.output(`✅ Updated Supabase project: ${updatedProject.name}`);

        // Fetch and save API keys if secret references are provided
        this.fetchAndSaveApiKeys();
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Project does not exist, nothing to delete");
            return;
        }

        this.deleteResource(`/v1/projects/${this.state.id}`, "Project");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        try {
            // Check if project exists and is active
            const project = this.makeRequest("GET", `/v1/projects/${this.state.id}`);
            const isReady = project && 
                           (project.status === "ACTIVE_HEALTHY" || 
                            project.status === "ACTIVE" ||
                            project.status === "RUNNING");
            
            if (isReady) {
                cli.output(`✅ Project ${this.definition.name} is ready (status: ${project.status})`);
            } else {
                cli.output(`⏳ Project ${this.definition.name} not ready yet (status: ${project.status || 'unknown'})`);
            }
            
            return isReady;
        } catch (error) {
            cli.output(`⚠️  Failed to check project readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { 
        return this.checkReadiness(); 
    }

    /**
     * Find existing project by name
     */
    private findExistingProject(): Record<string, unknown> | null {
        try {
            const allProjects = this.makeRequest("GET", "/v1/projects");

            if (allProjects && Array.isArray(allProjects)) {
                return allProjects.find((p: Record<string, unknown>) => p.name === this.definition.name) || null;
            }
        } catch (error) {
            cli.output(`⚠️  Could not check for existing projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return null;
    }

    /**
     * Get or create database password from secret
     * If password is provided in definition, use that
     * Otherwise, try to get from secret, or generate and save new one
     */
    private getOrCreateDatabasePassword(): string {
        // If password is explicitly provided in definition, use it
        if (this.definition.db_pass) {
            return this.definition.db_pass;
        }

        // Determine secret reference name
        const secretRef = this.definition.db_pass_secret_ref || `${this.definition.name}-db-password`;
        
        try {
            // Try to get existing password from secret
            const storedPassword = secret.get(secretRef);
            if (storedPassword) {
                cli.output(`🔑 Using existing database password from secret: ${secretRef}`);
                return storedPassword;
            }
        } catch (_error) {
            // Secret doesn't exist or couldn't be retrieved
        }

        // Generate new password and save to secret
        const password = secret.randString(16) + "A1!"; // Ensure it meets Supabase requirements
        secret.set(secretRef, password);
        cli.output(`🔑 Generated new database password and saved to secret: ${secretRef}`);
        
        return password;
    }

    /**
     * Fetch and save API keys to secrets if secret references are provided
     */
    private fetchAndSaveApiKeys(): void {
        if (!this.state.id) {
            return;
        }

        // Only fetch if at least one secret reference is provided
        if (!this.definition.anon_api_key_secret_ref && !this.definition.service_role_api_key_secret_ref) {
            return;
        }

        try {
            // Fetch API keys from Supabase
            const apiKeys = this.makeRequest("GET", `/v1/projects/${this.state.id}/api-keys`);
            
            if (!Array.isArray(apiKeys)) {
                cli.output(`⚠️  API keys response is not an array`);
                return;
            }

            // Find and save anon API key
            if (this.definition.anon_api_key_secret_ref) {
                const anonKey = apiKeys.find((key: Record<string, unknown>) => key.name === "anon");
                if (anonKey && typeof anonKey.api_key === "string") {
                    secret.set(this.definition.anon_api_key_secret_ref, anonKey.api_key);
                    cli.output(`🔑 Saved anon API key to secret: ${this.definition.anon_api_key_secret_ref}`);
                } else {
                    cli.output(`⚠️  Anon API key not found in response`);
                }
            }

            // Find and save service_role API key
            if (this.definition.service_role_api_key_secret_ref) {
                const serviceRoleKey = apiKeys.find((key: Record<string, unknown>) => key.name === "service_role");
                if (serviceRoleKey && typeof serviceRoleKey.api_key === "string") {
                    secret.set(this.definition.service_role_api_key_secret_ref, serviceRoleKey.api_key);
                    cli.output(`🔑 Saved service_role API key to secret: ${this.definition.service_role_api_key_secret_ref}`);
                } else {
                    cli.output(`⚠️  Service_role API key not found in response`);
                }
            }
        } catch (error) {
            cli.output(`⚠️  Failed to fetch API keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

}
