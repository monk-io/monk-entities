import { MongoDBAtlasEntity, MongoDBAtlasEntityDefinition, MongoDBAtlasEntityState } from "./base.ts";
import { getOrganization } from "./common.ts";
import cli from "cli";

/**
 * Represents a MongoDB Atlas project entity.
 * This entity allows interaction with MongoDB Atlas projects via its API.
 * @interface ProjectDefinition
 */
export interface ProjectDefinition extends MongoDBAtlasEntityDefinition {
    /**
     * @description Project name
     * @minLength 1
     * @maxLength 100
     */
    name: string;

    /**
     * @description Organization Name
     * @minLength 1
     * @maxLength 100
     */
    organization: string;
}

/**
 * Represents the mutable runtime state of a MongoDB Atlas project entity.
 * This state can change during the entity's lifecycle.
 * @interface ProjectState
 */
export interface ProjectState extends MongoDBAtlasEntityState {
    /**
     * @description Project ID
     */
    id?: string;

    /**
     * @description Project Organization ID
     */
    organization_id?: string;

    /**
     * @description Project Name
     */
    name?: string;
}

export class Project extends MongoDBAtlasEntity<ProjectDefinition, ProjectState> {
    
    protected getEntityName(): string {
        return this.definition.name;
    }

    /** Create a new MongoDB Atlas project */
    override create(): void {
        // Check if project already exists
        const existingProject = this.checkResourceExists(`/groups/byName/${this.definition.name}`);
        
        if (existingProject) {
            // Project already exists, just set our state
            this.state = {
                id: existingProject.id,
                name: existingProject.name,
                organization_id: existingProject.orgId,
                existing: true
            };
            return;
        }

        // Project doesn't exist, create it
        // First get organization ID
        const org = getOrganization(this.definition.organization, this.apiToken);
        
        const body = {
            name: this.definition.name,
            withDefaultAlertsSettings: true,
            orgId: org.id
        };
        
        const createObj = this.makeRequest("POST", "/groups", body);
        
        // Set state with created project info
        this.state = {
            id: createObj.id,
            name: createObj.name,
            organization_id: createObj.orgId,
            existing: false
        };
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // nothing to update for the current implementation
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Project does not exist, nothing to delete");
            return;
        }
        
        // First, delete all clusters in the project to avoid the 409 error
        this.deleteAllClustersInProject();
        
        // Then delete the project
        this.deleteResource(`/groups/${this.state.id}`, "Project");
    }

    /**
     * Wait for all cluster deletions to complete by polling the API
     */
    private waitForClusterDeletions(): void {
        const maxAttempts = 30; // Wait up to 5 minutes (30 * 10 seconds)
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                const clustersResponse = this.makeRequest("GET", `/groups/${this.state.id}/clusters`);
                
                if (!clustersResponse || !clustersResponse.results || clustersResponse.results.length === 0) {
                    cli.output("All clusters have been deleted successfully");
                    return;
                }
                
                const remainingClusters = clustersResponse.results.length;
                cli.output(`Still waiting for ${remainingClusters} cluster(s) to be deleted... (attempt ${attempts + 1}/${maxAttempts})`);
                
                // Wait 10 seconds before next check
                // Note: In Goja runtime, we don't have setTimeout, so we'll use a simple delay
                attempts++;
                
                if (attempts >= maxAttempts) {
                    cli.output("Warning: Timeout waiting for cluster deletions. Proceeding with project deletion anyway.");
                    break;
                }
                
                // Simple delay - this is not ideal but works in Goja
                const start = Date.now();
                while (Date.now() - start < 10000) {
                    // 10 second delay
                }
                
            } catch (error) {
                cli.output(`Warning: Error checking cluster deletion status: ${error instanceof Error ? error.message : 'Unknown error'}`);
                break;
            }
        }
    }

    /**
     * Delete all clusters in the project before deleting the project itself
     * This prevents the 409 error when trying to delete a project with active clusters
     */
    private deleteAllClustersInProject(): void {
        if (this.state.existing) {
            cli.output("Project wasn't created by this entity, skipping cluster cleanup");
            return;
        }

        try {
            cli.output("Checking for active clusters in project before deletion...");
            
            // Get all clusters in the project
            const clustersResponse = this.makeRequest("GET", `/groups/${this.state.id}/clusters`);
            
            if (clustersResponse && clustersResponse.results && clustersResponse.results.length > 0) {
                cli.output(`Found ${clustersResponse.results.length} active cluster(s) in project. Deleting them first...`);
                
                // Delete each cluster
                for (const cluster of clustersResponse.results) {
                    try {
                        cli.output(`Deleting cluster: ${cluster.name}`);
                        this.makeRequest("DELETE", `/groups/${this.state.id}/clusters/${cluster.name}`);
                        cli.output(`Successfully deleted cluster: ${cluster.name}`);
                    } catch (error) {
                        cli.output(`Warning: Failed to delete cluster ${cluster.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                        // Continue with other clusters even if one fails
                    }
                }
                
                // Wait for cluster deletions to complete by polling
                cli.output("Waiting for cluster deletions to complete...");
                this.waitForClusterDeletions();
            } else {
                cli.output("No active clusters found in project");
            }
        } catch (error) {
            cli.output(`Warning: Failed to check/delete clusters in project: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Continue with project deletion attempt even if cluster cleanup fails
        }
    }
}
