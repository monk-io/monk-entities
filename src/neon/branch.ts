import { action, Args } from "monkec/base";
import { NeonEntity, NeonEntityDefinition, NeonEntityState } from "./neon-base.ts";
import cli from "cli";

/**
 * Defines the immutable configuration properties for a Neon branch entity.
 * @interface NeonBranchDefinition
 */
export interface NeonBranchDefinition extends NeonEntityDefinition {
    /**
     * Project ID that this branch belongs to
     * @description The Neon project ID (format: project-name-123456)
     */
    project_id: string;

    /**
     * Optional branch name (defaults to generated name)
     * @description Custom name for the branch
     */
    name?: string;

    /**
     * Parent branch ID to branch from (defaults to main branch)
     * @description The ID of the parent branch (format: br-name-123456)
     */
    parent_id?: string;

    /**
     * Optional point-in-time LSN to branch from
     * @description Log Sequence Number to create branch from
     */
    parent_lsn?: string;
}

/**
 * Represents the mutable runtime state of a Neon branch.
 * @interface NeonBranchState
 */
export interface NeonBranchState extends NeonEntityState {
    /**
     * Branch ID from Neon
     * @description Unique identifier for the branch
     */
    id?: string;

    /**
     * Branch name
     * @description Current name of the branch
     */
    name?: string;

    /**
     * Parent branch ID
     * @description ID of the parent branch
     */
    parent_id?: string;

    /**
     * Parent LSN
     * @description Log Sequence Number the branch was created from
     */
    parent_lsn?: string;

    /**
     * Current state of the branch
     * @description Branch state (init, ready, etc)
     */
    current_state?: string;

    /**
     * Creation timestamp
     * @description When the branch was created
     * @format date-time
     */
    created_at?: string;

    /**
     * Last update timestamp
     * @description When the branch was last updated
     * @format date-time
     */
    updated_at?: string;

    /**
     * Logical size in MB
     * @description Logical size of the branch data
     */
    logical_size?: number;

    /**
     * Physical size in MB
     * @description Physical size of the branch data
     */
    physical_size?: number;

    /**
     * Operation IDs for tracking branch creation
     * @description Array of operation IDs that need to complete
     */
    operation_ids?: string[];

    /**
     * Pending state of the branch
     * @description Pending state of the branch
     */
    pending_state?: string;

    /**
     * Endpoint information
     * @description Information about the branch endpoints
     */
    endpoints?: { id: string; type: string; state: string; host: string }[];
}

/**
 * @description Neon Branch entity.
 * Creates and manages Neon database branches for development and testing.
 * Branches provide instant, copy-on-write database clones from a parent branch.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Neon API key (defaults to `neon-api-key`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.id` - Branch ID
 * - `state.name` - Branch name
 * - `state.endpoints` - Connection endpoints for the branch
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `neon/project` - The parent project containing this branch
 * - `neon/database` - Create databases on this branch
 * - `neon/compute` - Configure compute endpoints for the branch
 */
export class Branch extends NeonEntity<NeonBranchDefinition, NeonBranchState> {
    
    protected getEntityName(): string {
        return `Neon Branch ${this.definition.name || 'unnamed'} in project ${this.definition.project_id}`;
    }

    override create(): void {
        const branchData = {
            branch: {
                name: this.definition.name,
                parent_id: this.definition.parent_id,
                parent_lsn: this.definition.parent_lsn
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
            `/projects/${this.definition.project_id}/branches`,
            branchData
        );

        const branch = response.branch;
        this.state.id = branch.id;
        this.state.name = branch.name;
        this.state.current_state = branch.current_state;
        this.state.pending_state = branch.pending_state;
        this.state.parent_id = branch.parent_id;
        this.state.parent_lsn = branch.parent_lsn;
        this.state.created_at = branch.created_at;
        this.state.updated_at = branch.updated_at;

        // Extract operation IDs from operations array
        if (response.operations && response.operations.length > 0) {
            this.state.operation_ids = response.operations.map((op: any) => op.id);
        }

        // Extract endpoint information
        if (response.endpoints && response.endpoints.length > 0) {
            this.state.endpoints = response.endpoints.map((ep: any) => ({
                id: ep.id,
                type: ep.type,
                state: ep.state,
                host: ep.host
            }));
        }
    }

    override start(): void {
        // Wait for branch operations to complete
        if (this.state.operation_ids && this.state.operation_ids.length > 0) {
            this.waitForOperations(this.definition.project_id, this.state.operation_ids);
        }
    }

    @action("Get branch details")
    getBranch(_args?: Args): void {
        if (!this.state.id) {
            throw new Error("Branch ID not available");
        }

        const branch = this.makeRequest("GET", `/projects/${this.definition.project_id}/branches/${this.state.id}`);
        cli.output(`Branch: ${JSON.stringify(branch, null, 2)}`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No branch ID available for deletion");
            return;
        }

        this.deleteResource(`/projects/${this.definition.project_id}/branches/${this.state.id}`, `Branch ${this.state.name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        // Check if branch is ready by getting its current status
        try {
            const branch = this.makeRequest("GET", `/projects/${this.definition.project_id}/branches/${this.state.id}`);
            const isReady = branch.branch && branch.branch.current_state === "ready";
            
            if (isReady) {
                cli.output(`✅ Branch ${this.state.name} is ready (state: ${branch.branch.current_state})`);
            } else {
                cli.output(`⏳ Branch ${this.state.name} is not ready yet (state: ${branch.branch?.current_state || 'unknown'})`);
            }
            
            return isReady;
        } catch (error) {
            cli.output(`❌ Error checking branch readiness: ${error}`);
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }
    
} 