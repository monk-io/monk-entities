import { VercelEntity, VercelEntityDefinition, VercelEntityState } from "./vercel-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import { VERCEL_API_ENDPOINTS } from "./common.ts";

/**
 * Represents a Vercel deployment runnable.
 * This runnable handles file deployments using the Vercel CLI.
 * @interface DeploymentDefinition
 */
export interface DeploymentDefinition extends VercelEntityDefinition {
    /**
     * Project ID to deploy to
     * @description The Vercel project ID to deploy to
     */
    project_id: string;

    /**
     * Source directory path
     * @description Local directory containing files to deploy
     */
    source_path: string;

    /**
     * Production deployment (optional)
     * @description Whether this is a production deployment
     */
    production?: boolean;

    /**
     * Pre-deploy script (optional)
     * @description Script to run before deployment
     */
    pre_deploy?: string;

    /**
     * Build command override (optional)
     * @description Override the build command for this deployment
     */
    build_command?: string;

    /**
     * Output directory override (optional)
     * @description Override the output directory for this deployment
     */
    output_directory?: string;
}

/**
 * Represents the mutable runtime state of a Vercel deployment runnable.
 * @interface DeploymentState
 */
export interface DeploymentState extends VercelEntityState {
    /**
     * Deployment ID from Vercel
     */
    id?: string;

    /**
     * Deployment URL
     */
    url?: string;

    /**
     * Deployment status
     */
    status?: string;

    /**
     * Created timestamp
     */
    created_at?: string;

    /**
     * Ready timestamp
     */
    ready_at?: string;

    /**
     * Build status
     */
    build_status?: string;

    /**
     * Error message (if any)
     */
    error?: string;
}

export class Deployment extends VercelEntity<DeploymentDefinition, DeploymentState> {
    
    protected getEntityName(): string {
        return `deploy-${this.definition.project_id}`;
    }

    /** Start the deployment process */
    override start(): void {
        cli.output(`🚀 Starting Vercel deployment for project: ${this.definition.project_id}`);
        cli.output(`📁 Source directory: ${this.definition.source_path}`);
        cli.output(`🏭 Production: ${this.definition.production || false}`);

        // The actual deployment will be handled by the container/runnable
        // This entity just manages the deployment state and configuration
    }

    /** Stop the deployment process */
    override stop(): void {
        cli.output(`🛑 Stopping Vercel deployment for project: ${this.definition.project_id}`);
        // Deployments are typically one-time operations, so stopping just logs the action
    }

    /** Check if deployment is ready */
    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        try {
            const deployment = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.DEPLOYMENTS_V13}/${this.state.id}`);
            
            // Update state with latest info
            this.state.status = deployment.status;
            this.state.ready_at = deployment.ready_at;
            this.state.build_status = deployment.build_status;
            this.state.error = deployment.error;
            
            return deployment.status === "ready";
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    /** Get deployment details */
    @action("Get deployment details")
    getDeployment(): void {
        if (!this.state.id) {
            throw new Error("Deployment ID not available");
        }

        cli.output(`📋 Getting details for deployment: ${this.state.id}`);
        
        const deployment = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.DEPLOYMENTS_V13}/${this.state.id}`);
        
        cli.output(`✅ Deployment Details:`);
        cli.output(`   ID: ${deployment.id}`);
        cli.output(`   URL: ${deployment.url}`);
        cli.output(`   Status: ${deployment.status}`);
        cli.output(`   Created: ${deployment.created_at}`);
        cli.output(`   Ready: ${deployment.ready_at || 'Not ready'}`);
        cli.output(`   Build Status: ${deployment.build_status || 'Unknown'}`);
        
        if (deployment.error) {
            cli.output(`   Error: ${deployment.error}`);
        }
    }

    /** Get deployment logs */
    @action("Get deployment logs")
    getLogs(args?: Args): void {
        if (!this.state.id) {
            throw new Error("Deployment ID not available");
        }

        const functionId = args?.function_id;
        const path = args?.path || "/";

        cli.output(`📋 Getting logs for deployment: ${this.state.id}`);
        
        let logsUrl = `/v2/deployments/${this.state.id}/logs`;
        if (functionId) {
            logsUrl += `?functionId=${functionId}`;
        }
        if (path && path !== "/") {
            logsUrl += `${functionId ? '&' : '?'}path=${encodeURIComponent(path)}`;
        }

        const logs = this.makeRequest("GET", logsUrl);
        
        if (logs && Array.isArray(logs)) {
            cli.output(`📋 Deployment Logs:`);
            logs.forEach((log: any) => {
                cli.output(`   [${log.timestamp}] ${log.message}`);
            });
        } else {
            cli.output(`ℹ️  No logs available`);
        }
    }
} 