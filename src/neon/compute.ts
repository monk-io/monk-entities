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
    projectId: string;

    /**
     * Branch ID that this compute belongs to
     * @description The Neon branch ID (format: br-name-123456)
     */
    branchId: string;

    /**
     * Type of compute
     * @description Whether this is a read-write or read-only compute
     * @default read_write
     */
    computeType?: "read_write" | "read_only";

    /**
     * Minimum compute size in vCPUs
     * @description Minimum compute units for autoscaling
     * @default 1
     */
    minCu?: number;

    /**
     * Maximum compute size in vCPUs
     * @description Maximum compute units for autoscaling
     * @default 1
     */
    maxCu?: number;

    /**
     * Whether to enable connection pooling
     * @description Enable connection pooler for the compute
     * @default false
     */
    poolerEnabled?: boolean;

    /**
     * Connection pooler mode
     * @description Mode for the connection pooler
     * @default transaction
     */
    poolerMode?: "transaction" | "session";
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
    proxyHost?: string;

    /**
     * Current state
     * @description Current state of the compute (active, idle, etc)
     */
    currentState?: string;

    /**
     * Pending state
     * @description Pending state if compute is transitioning
     */
    pendingState?: string;

    /**
     * Creation timestamp
     * @description When the compute was created
     * @format date-time
     */
    createdAt?: string;

    /**
     * Last update timestamp
     * @description When the compute was last updated
     * @format date-time
     */
    updatedAt?: string;

    /**
     * Last active timestamp
     * @description When the compute was last active
     * @format date-time
     */
    lastActive?: string;

    /**
     * Whether compute is disabled
     * @description If true, compute is disabled
     */
    disabled?: boolean;

    /**
     * Operation ID for tracking compute creation
     * @description ID of the operation that created the compute
     */
    operationId?: string;
}

export class Compute extends NeonEntity<NeonComputeDefinition, NeonComputeState> {
    
    protected getEntityName(): string {
        return `Neon Compute for branch ${this.definition.branchId} in project ${this.definition.projectId}`;
    }

    private findExistingEndpoint(): any {
        try {
            const endpointsResponse = this.makeRequest("GET", `/projects/${this.definition.projectId}/endpoints`);
            
            if (endpointsResponse.endpoints && endpointsResponse.endpoints.length > 0) {
                return endpointsResponse.endpoints.find((endpoint: any) => 
                    endpoint.branch_id === this.definition.branchId && 
                    endpoint.type === (this.definition.computeType || "read_write")
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
            this.state.currentState = existingEndpoint.current_state;
            this.state.disabled = existingEndpoint.disabled;
            this.state.createdAt = existingEndpoint.created_at;
            this.state.updatedAt = existingEndpoint.updated_at;
            this.state.proxyHost = existingEndpoint.proxy_host;
            this.state.lastActive = existingEndpoint.last_active;
            this.state.pendingState = existingEndpoint.pending_state;
            cli.output(`✅ Using existing endpoint: ${existingEndpoint.id} for branch ${this.definition.branchId}`);
            return;
        }

        const endpointData = {
            endpoint: {
                type: this.definition.computeType || "read_write",
                branch_id: this.definition.branchId,
                settings: {
                    compute: {
                        min_cu: this.definition.minCu || 1,
                        max_cu: this.definition.maxCu || 1
                    },
                    pooler: {
                        enabled: this.definition.poolerEnabled || false,
                        mode: this.definition.poolerMode || "transaction"
                    }
                }
            }
        };

        const response = this.makeRequest(
            "POST",
            `/projects/${this.definition.projectId}/endpoints`,
            endpointData
        );

        const endpoint = response.endpoint;
        this.state.id = endpoint.id;
        this.state.host = endpoint.host;
        this.state.currentState = endpoint.current_state;
        this.state.disabled = endpoint.disabled;
        this.state.createdAt = endpoint.created_at;
        this.state.updatedAt = endpoint.updated_at;
        this.state.proxyHost = endpoint.proxy_host;
        this.state.lastActive = endpoint.last_active;
        this.state.pendingState = endpoint.pending_state;
        this.state.operationId = response.operations?.[0]?.id;
    }

    override start(): void {
        // Wait for compute operations to complete
        if (this.state.operationId) {
            this.waitForOperation(this.definition.projectId, this.state.operationId);
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
            `/projects/${this.definition.projectId}/endpoints/${this.state.id}/restart`
        );

        cli.output(`✅ Compute restart initiated`);
        
        // Update operation ID if provided
        if (response.operations && response.operations.length > 0) {
            this.state.operationId = response.operations[0].id;
        }
    }

    @action("Get compute details")
    getCompute(_args?: Args): void {
        if (!this.state.id) {
            throw new Error("Compute ID not available");
        }

        const endpoint = this.makeRequest("GET", `/projects/${this.definition.projectId}/endpoints/${this.state.id}`);
        cli.output(`Compute: ${JSON.stringify(endpoint, null, 2)}`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No compute ID available for deletion");
            return;
        }

        this.deleteResource(`/projects/${this.definition.projectId}/endpoints/${this.state.id}`, `Compute ${this.state.id}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        // Check if compute is ready by getting its current status
        try {
            const endpoint = this.makeRequest("GET", `/projects/${this.definition.projectId}/endpoints/${this.state.id}`);
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
            const endpoint = this.makeRequest("GET", `/projects/${this.definition.projectId}/endpoints/${this.state.id}`);
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