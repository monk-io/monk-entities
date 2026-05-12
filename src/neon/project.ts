import { action, Args } from "monkec/base";
import { NeonEntity, NeonEntityDefinition, NeonEntityState } from "./neon-base.ts";
import cli from "cli";

/**
 * Defines the immutable configuration properties for a Neon project entity.
 * @interface NeonProjectDefinition
 */
export interface NeonProjectDefinition extends NeonEntityDefinition {
    /**
     * Optional project name
     * @description Custom name for the Neon project
     */
    name?: string;

    /**
     * Optional region for the project
     * @description AWS region for the Neon project
     * @default aws-us-east-2
     */
    region_id?: string;

    /**
     * Optional PostgreSQL version
     * @description PostgreSQL version for the project
     * @default 17
     */
    pg_version?: number;

    /**
     * Optional allowed IPs
     * @description List of allowed IP addresses for the project
     */
    allowed_ips?: string[];
}

/**
 * Represents the mutable runtime state of a Neon project.
 * @interface NeonProjectState
 */
export interface NeonProjectState extends NeonEntityState {
    /**
     * Project ID from Neon
     * @description Unique identifier for the project
     */
    id?: string;

    /**
     * Project name
     * @description Current name of the project
     */
    name?: string;

    /**
     * Project region
     * @description AWS region where the project is hosted
     */
    region?: string;

    /**
     * Project creation timestamp
     * @description When the project was created
     * @format date-time
     */
    created_at?: string;

    /**
     * Last update timestamp
     * @description When the project was last updated
     * @format date-time
     */
    last_updated?: string;

    /**
     * Project status
     * @description Current status of the project
     */
    status?: string;

    /**
     * Operation ID for tracking project creation
     * @description ID of the operation that created the project
     */
    operation_id?: string;
}

/**
 * @description Neon Project entity.
 * Creates and manages Neon serverless PostgreSQL projects.
 * Each project provides isolated database infrastructure with automatic scaling.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Neon API key (defaults to `neon-api-key`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.id` - Project ID for branch and database operations
 * - `state.name` - Project name
 * - `state.region` - AWS region where the project is hosted
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `neon/branch` - Create database branches for dev/test environments
 * - `neon/database` - Create databases within the project
 * - `neon/role` - Create database users/roles (writes password secret)
 */
export class Project extends NeonEntity<NeonProjectDefinition, NeonProjectState> {
    
    protected getEntityName(): string {
        return `Neon Project ${this.definition.name || 'unnamed'}`;
    }

    private findExistingProject(): any {
        try {
            const projectsResponse = this.makeRequest("GET", "/projects");
            return projectsResponse.projects?.find((p: any) => 
                p.name === this.definition.name
            );
        } catch (error) {
            cli.output(`⚠️ Could not check for existing projects: ${error}`);
            return null;
        }
    }

    override create(): void {
        // Check if project already exists
        const existingProject = this.findExistingProject();
        if (existingProject) {
            this.state.existing = true;
            this.state.id = existingProject.id;
            this.state.name = existingProject.name;
            this.state.status = existingProject.status;
            this.state.region = existingProject.region;
            this.state.created_at = existingProject.created_at;
            this.state.last_updated = existingProject.updated_at;
            this.state.operation_id = undefined;
            cli.output(`✅ Using existing project: ${existingProject.name} (${existingProject.id})`);
            return;
        }

        const projectData = {
            project: {
                name: this.definition.name,
                pg_version: this.definition.pg_version,
                region_id: this.definition.region_id
            }
        };

        const response = this.makeRequest("POST", "/projects", projectData);

        const project = response.project;
        this.state.id = project.id;
        this.state.name = project.name;
        this.state.status = project.status;
        this.state.region = project.region;
        this.state.created_at = project.created_at;
        this.state.last_updated = project.updated_at;
        
        // Handle operations array - check if it exists and has elements
        if (response.operations && Array.isArray(response.operations) && response.operations.length > 0) {
            this.state.operation_id = response.operations[0].id;
            cli.output(`📋 Project creation operation ID: ${this.state.operation_id}`);
        } else {
            cli.output(`ℹ️ No operations returned from project creation`);
            this.state.operation_id = undefined;
        }
    }

    override start(): void {
        // Wait for project operations to complete
        if (this.state.operation_id) {
            this.waitForOperation(this.state.id!, this.state.operation_id);
        }
    }

    @action("Get project details")
    getProject(_args?: Args): void {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const project = this.makeRequest("GET", `/projects/${this.state.id}`);
        cli.output(`Project: ${JSON.stringify(project, null, 2)}`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No project ID available for deletion");
            return;
        }

        this.deleteResource(`/projects/${this.state.id}`, `Project ${this.state.name}`);
    }

    @action("List all projects")
    listAllProjects(_args?: Args): any {
        const response = this.makeRequest("GET", "/projects");
        
        cli.output("📋 All Neon Projects:");
        if (response.projects && response.projects.length > 0) {
            response.projects.forEach((project: any) => {
                cli.output(`  • ${project.name} (${project.id}) - ${project.status} - ${project.region}`);
            });
        } else {
            cli.output("  No projects found");
        }
        
        return response;
    }

    @action("Debug authentication")
    debugAuth(_args?: Args): any {
        cli.output("🔐 Testing Neon API authentication...");
        
        try {
            const response = this.makeRequest("GET", "/projects");
            cli.output(`✅ Authentication successful! Found ${response.projects?.length || 0} projects`);
            return response;
        } catch (error) {
            cli.output(`❌ Authentication failed: ${error}`);
            throw error;
        }
    }

    @action("List branches for this project")
    listBranches(_args?: Args): any {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const response = this.makeRequest("GET", `/projects/${this.state.id}/branches`);
        cli.output(`📋 Branches for project ${this.state.name}:`);
        
        if (response.branches && response.branches.length > 0) {
            response.branches.forEach((branch: any) => {
                cli.output(`  • ${branch.name} (${branch.id}) - ${branch.current_state}`);
            });
        } else {
            cli.output("  No branches found");
        }
        
        return response;
    }

    @action("Create a new branch")
    createBranch(args?: Args): any {
        if (!this.state.id) {
            throw new Error("Project ID not available");
        }

        const branchName = args?.name || `branch-${Date.now()}`;
        const parent_id = args?.parent_id;
        const parent_lsn = args?.parent_lsn;

        cli.output(`🌿 Creating branch '${branchName}' in project ${this.state.name}...`);

        const branchData = {
            branch: {
                name: branchName,
                parent_id: parent_id,
                parent_lsn: parent_lsn
            },
            endpoints: [
                {
                    type: "read_write",
                    settings: {
                        pg_settings: {}
                    }
                }
            ]
        };

        const response = this.makeRequest(
            "POST",
            `/projects/${this.state.id}/branches`,
            branchData
        );

        cli.output(`✅ Branch '${branchName}' created successfully!`);
        cli.output(`   Branch ID: ${response.branch.id}`);
        cli.output(`   State: ${response.branch.current_state}`);

        return response;
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        // If we have an operation ID, check operation status first
        if (this.state.operation_id) {
            try {
                cli.output(`🔍 Checking project operation status for ID: ${this.state.operation_id}`);
                const operationData = this.makeRequest("GET", `/projects/${this.state.id}/operations/${this.state.operation_id}`);
                
                cli.output(`📊 Operation response structure: ${JSON.stringify(operationData, null, 2)}`);
                
                // Check if operation data exists in the response
                const operation = operationData.operation || operationData;
                
                if (operation) {
                    cli.output(`📊 Project operation status: ${operation.status}`);
                    
                    if (operation.status === "failed") {
                        cli.output(`❌ Project operation failed: ${operation.error || 'Unknown error'}`);
                        return false;
                    }
                    
                    // Check if operation is still running
                    if (operation.status === "running" || operation.status === "scheduling") {
                        cli.output(`⏳ Project operation still in progress: ${operation.status}`);
                        return false;
                    }
                    
                    // Operation is complete (either "completed" or "finished")
                    if (operation.status === "completed" || operation.status === "finished") {
                        cli.output(`✅ Project operation completed successfully: ${operation.status}`);
                        // Clear operation ID since it's done
                        this.state.operation_id = undefined;
                    } else {
                        cli.output(`⚠️ Project operation in unknown state: ${operation.status}`);
                        return false;
                    }
                } else {
                    cli.output(`⚠️ No operation data found in response`);
                    // If we can't find operation data, clear the operation ID and check project directly
                    this.state.operation_id = undefined;
                }
            } catch (error) {
                cli.output(`⚠️ Error checking project operation status: ${error}`);
                // If we can't check operation status, clear operation ID and fall back to GET request
                this.state.operation_id = undefined;
            }
        } else {
            cli.output(`ℹ️ No operation ID for project, checking accessibility directly`);
        }

        // If no operation ID or operation is complete, check if project is accessible
        try {
            cli.output(`🔍 Checking project accessibility for ID: ${this.state.id}`);
            const projectData = this.makeRequest("GET", `/projects/${this.state.id}`);
            
            // If the GET request succeeds, the project is ready
            if (projectData.project) {
                cli.output(`✅ Project is accessible`);
                // Update state with latest data
                this.state.name = projectData.project.name;
                this.state.region = projectData.project.region_id;
                this.state.created_at = projectData.project.created_at;
                this.state.last_updated = projectData.project.updated_at;
                this.state.status = "active";
                return true;
            }

            cli.output(`❌ No project data in response`);
            return false;
        } catch (error) {
            cli.output(`❌ Error checking project accessibility: ${error}`);
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }
    

    override update(): void {
        if (!this.state.id) {
            throw new Error("Project ID not available for update");
        }

        // For now, we'll just refresh the project data
        // In the future, this could handle actual project updates
        const project = this.makeRequest("GET", `/projects/${this.state.id}`);
        
        this.state.name = project.project.name;
        this.state.status = project.project.status;
        this.state.region = project.project.region;
        this.state.last_updated = project.project.updated_at;
        
        cli.output(`✅ Project ${this.state.name} updated successfully`);
    }
}