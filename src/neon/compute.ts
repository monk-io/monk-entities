import { action, Args } from "monkec/base";
import { NeonEntity, NeonEntityDefinition, NeonEntityState } from "./neon-base.ts";
import cli from "cli";

/**
 * Defines the immutable configuration properties for a Neon compute entity.
 * @interface NeonComputeDefinition
 */
export interface NeonComputeDefinition extends NeonEntityDefinition {
    /**
     * Project ID that this compute belongs to
     * @description The Neon project ID (format: project-name-123456)
     */
    project_id: string;

    /**
     * Branch ID that this compute belongs to
     * @description The Neon branch ID (format: br-name-123456)
     */
    branch_id: string;

    /**
     * Type of compute
     * @description Whether this is a read-write or read-only compute
     * @default read_write
     */
    compute_type?: "read_write" | "read_only";

    /**
     * Minimum compute size in vCPUs
     * @description Minimum compute units for autoscaling
     * @default 1
     */
    min_cu?: number;

    /**
     * Maximum compute size in vCPUs
     * @description Maximum compute units for autoscaling
     * @default 1
     */
    max_cu?: number;

    /**
     * Whether to enable connection pooling
     * @description Enable connection pooler for the compute
     * @default false
     */
    pooler_enabled?: boolean;

    /**
     * Connection pooler mode
     * @description Mode for the connection pooler
     * @default transaction
     */
    pooler_mode?: "transaction" | "session";
}

/**
 * Represents the mutable runtime state of a Neon compute.
 * @interface NeonComputeState
 */
export interface NeonComputeState extends NeonEntityState {
    /**
     * Compute ID
     * @description Unique identifier for the compute (format: ep-name-123456)
     */
    id?: string;

    /**
     * Compute hostname
     * @description Hostname for connecting to the compute
     */
    host?: string;

    /**
     * Proxy hostname
     * @description Proxy hostname for connecting to the compute
     */
    proxy_host?: string;

    /**
     * Current state
     * @description Current state of the compute (active, idle, etc)
     */
    current_state?: string;

    /**
     * Pending state
     * @description Pending state if compute is transitioning
     */
    pending_state?: string;

    /**
     * Creation timestamp
     * @description When the compute was created
     * @format date-time
     */
    created_at?: string;

    /**
     * Last update timestamp
     * @description When the compute was last updated
     * @format date-time
     */
    updated_at?: string;

    /**
     * Last active timestamp
     * @description When the compute was last active
     * @format date-time
     */
    last_active?: string;

    /**
     * Whether compute is disabled
     * @description If true, compute is disabled
     */
    disabled?: boolean;

    /**
     * Operation ID for tracking compute creation
     * @description ID of the operation that created the compute
     */
    operation_id?: string;
}

/**
 * @description Neon Compute entity.
 * Creates and manages Neon compute endpoints for database connections.
 * Compute endpoints provide connection URLs and control compute resources.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Neon API key (defaults to `neon-api-key`)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.id` - Compute endpoint ID
 * - `state.host` - Connection hostname
 * - `state.current_state` - Endpoint state (idle, active)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `neon/project` - The project containing this endpoint
 * - `neon/branch` - The branch this endpoint connects to
 */
export class Compute extends NeonEntity<NeonComputeDefinition, NeonComputeState> {
    
    protected getEntityName(): string {
        return `Neon Compute for branch ${this.definition.branch_id} in project ${this.definition.project_id}`;
    }

    private findExistingEndpoint(): any {
        try {
            const endpointsResponse = this.makeRequest("GET", `/projects/${this.definition.project_id}/endpoints`);
            
            if (endpointsResponse.endpoints && endpointsResponse.endpoints.length > 0) {
                return endpointsResponse.endpoints.find((endpoint: any) => 
                    endpoint.branch_id === this.definition.branch_id && 
                    endpoint.type === (this.definition.compute_type || "read_write")
                );
            }
            return null;
        } catch (error) {
            cli.output(`⚠️ Error checking existing endpoints: ${error}`);
            return null;
        }
    }

    override create(): void {
        // Check for existing endpoints first
        const existingEndpoint = this.findExistingEndpoint();
        if (existingEndpoint) {
            this.state.existing = true;
            this.state.id = existingEndpoint.id;
            this.state.host = existingEndpoint.host;
            this.state.current_state = existingEndpoint.current_state;
            this.state.disabled = existingEndpoint.disabled;
            this.state.created_at = existingEndpoint.created_at;
            this.state.updated_at = existingEndpoint.updated_at;
            this.state.proxy_host = existingEndpoint.proxy_host;
            this.state.last_active = existingEndpoint.last_active;
            this.state.pending_state = existingEndpoint.pending_state;
            cli.output(`✅ Using existing endpoint: ${existingEndpoint.id} for branch ${this.definition.branch_id}`);
            return;
        }

        const endpointData = {
            endpoint: {
                type: this.definition.compute_type || "read_write",
                branch_id: this.definition.branch_id,
                settings: {
                    compute: {
                        min_cu: this.definition.min_cu || 1,
                        max_cu: this.definition.max_cu || 1
                    },
                    pooler: {
                        enabled: this.definition.pooler_enabled || false,
                        mode: this.definition.pooler_mode || "transaction"
                    }
                }
            }
        };

        const response = this.makeRequest(
            "POST",
            `/projects/${this.definition.project_id}/endpoints`,
            endpointData
        );

        const endpoint = response.endpoint;
        this.state.id = endpoint.id;
        this.state.host = endpoint.host;
        this.state.current_state = endpoint.current_state;
        this.state.disabled = endpoint.disabled;
        this.state.created_at = endpoint.created_at;
        this.state.updated_at = endpoint.updated_at;
        this.state.proxy_host = endpoint.proxy_host;
        this.state.last_active = endpoint.last_active;
        this.state.pending_state = endpoint.pending_state;
        this.state.operation_id = response.operations?.[0]?.id;
    }

    override start(): void {
        // Wait for compute operations to complete
        if (this.state.operation_id) {
            this.waitForOperation(this.definition.project_id, this.state.operation_id);
        }
    }

    @action("Restart compute")
    restart(_args?: Args): void {
        if (!this.state.id) {
            throw new Error("Compute ID is missing");
        }

        cli.output(`🔄 Restarting compute ${this.state.id}...`);
        
        const response = this.makeRequest(
            "POST",
            `/projects/${this.definition.project_id}/endpoints/${this.state.id}/restart`
        );

        cli.output(`✅ Compute restart initiated`);
        
        // Update operation ID if provided
        if (response.operations && response.operations.length > 0) {
            this.state.operation_id = response.operations[0].id;
        }
    }

    @action("Get compute details")
    getCompute(_args?: Args): void {
        if (!this.state.id) {
            throw new Error("Compute ID not available");
        }

        const endpoint = this.makeRequest("GET", `/projects/${this.definition.project_id}/endpoints/${this.state.id}`);
        cli.output(`Compute: ${JSON.stringify(endpoint, null, 2)}`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No compute ID available for deletion");
            return;
        }

        this.deleteResource(`/projects/${this.definition.project_id}/endpoints/${this.state.id}`, `Compute ${this.state.id}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        // Check if compute is ready by getting its current status
        try {
            const endpoint = this.makeRequest("GET", `/projects/${this.definition.project_id}/endpoints/${this.state.id}`);
            const isReady = endpoint.endpoint && endpoint.endpoint.current_state === "active";
            
            if (isReady) {
                cli.output(`✅ Compute ${this.state.id} is ready (state: ${endpoint.endpoint.current_state})`);
            } else {
                cli.output(`⏳ Compute ${this.state.id} is not ready yet (state: ${endpoint.endpoint?.current_state || 'unknown'})`);
            }
            
            return isReady;
        } catch (error) {
            cli.output(`❌ Error checking compute readiness: ${error}`);
            return false;
        }
    }

    checkLiveness(): boolean {
        if (!this.state.id) {
            throw new Error("Compute ID not available");
        }
        try {
            const endpoint = this.makeRequest("GET", `/projects/${this.definition.project_id}/endpoints/${this.state.id}`);
            const state = endpoint.endpoint?.current_state as string | undefined;
            if (state === "active" || state === "idle") {
                return true;
            }
            throw new Error(`Compute is not active or idle (state: ${state ?? "unknown"})`);
        } catch (e: unknown) {
            throw new Error("Unable to check compute status");
        }
    }
}