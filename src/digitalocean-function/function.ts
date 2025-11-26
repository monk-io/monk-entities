import { DOFunctionEntity, DOFunctionDefinition, DOFunctionState } from "./base.ts";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;
import cli from "cli";
import { 
    validateFunctionDefinition, 
    formatFunctionState, 
    isDeploymentReady, 
    isDeploymentFailed,
    getDeploymentStatusDescription,
    sanitizeAppName,
    sanitizeComponentName,
    buildEnvironmentVariables,
    buildLogDestinations,
    normalizeGitHubRepo
} from "./common.ts";

/**
 * Extended definition interface for DigitalOcean Function with additional fields
 */
export interface AppFunctionDefinition extends DOFunctionDefinition {
    // All properties inherited from DOFunctionDefinition
}

/**
 * DigitalOcean App Platform Function entity implementation
 */
export class AppFunction extends DOFunctionEntity<AppFunctionDefinition, DOFunctionState> {
    
    // Customize readiness check parameters
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 20 };
    
    /**
     * Create the function component in App Platform
     */
    override create(): void {
        try {
            // Validate the definition
            this.validateDefinition();
            
            const appName = sanitizeAppName(this.definition.app_name);
            
            // Check if app already exists (with debug output)
            cli.output(`[DEBUG] Checking if app '${appName}' already exists...`);
            const existingApp = this.checkAppExists(appName);
            if (existingApp) {
                cli.output(`App ${appName} already exists, checking for function component...`);
                
                // Check if our function component exists in the app
                const functionComponent = existingApp.spec?.functions?.find(
                    (fn: any) => fn.name === sanitizeComponentName(this.definition.component_name)
                );
                
                if (functionComponent) {
                    cli.output(`Function component ${this.definition.component_name} already exists in app ${appName}`);
                                // Mark as existing (don't delete on cleanup)
            const state = formatFunctionState(existingApp, true, this.definition.component_name);
            Object.assign(this.state, state);
                    return;
                }
                
                // App exists but function component doesn't - add our component
                cli.output(`Adding function component ${this.definition.component_name} to existing app ${appName}`);
                this.addFunctionToExistingApp(existingApp);
                return;
            }
            
            // Create new app with function component
            cli.output(`Creating new app ${appName} with function component ${this.definition.component_name}`);
            const appSpec = this.buildAppSpec();
            cli.output(`[DEBUG] App spec created, making API call to create app...`);
            const createdApp = this.createApp(appSpec);
            
            // Mark as created by us (safe to delete)
            const state = formatFunctionState(createdApp, false, this.definition.component_name);
            Object.assign(this.state, state);
            
            cli.output(`Successfully created app ${appName} with ID: ${createdApp.id}`);
            
        } catch (error) {
            throw new Error(`Failed to create DigitalOcean function: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Update the function component
     */
    override update(): void {
        try {
            if (!this.state.app_id) {
                throw new Error("Cannot update function: app_id not found in state");
            }
            
            cli.output(`Updating app ${this.state.app_id}...`);
            
            // Get current app state
            this.getApp(this.state.app_id);
            
            // Build updated app spec
            const updatedSpec = this.buildAppSpec();
            
            // Update the app
            const updatedApp = this.updateApp(this.state.app_id, updatedSpec);
            
            // Update state with new information (minimal data only)
            const updatedState = formatFunctionState(updatedApp, this.state.existing, this.definition.component_name);
            Object.assign(this.state, updatedState);
            
            cli.output(`Successfully updated app ${this.state.app_id}`);
            
        } catch (error) {
            throw new Error(`Failed to update DigitalOcean function: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Delete the function component or entire app
     */
    override delete(): void {
        try {
            if (!this.state.app_id) {
                cli.output("No app_id in state, nothing to delete");
                return;
            }
            
            // Only delete if we created the app
            if (this.state.existing) {
                cli.output(`App ${this.state.app_id} was pre-existing, not deleting`);
                // Reset tracking state but don't delete
                this.state.app_id = undefined;
                this.state.component_name = undefined;
                return;
            }
            
            cli.output(`Deleting app ${this.state.app_id}...`);
            
            // Delete the entire app (which includes our function component)
            this.deleteApp(this.state.app_id);
            
            // Clear state
            this.state.app_id = undefined;
            this.state.component_name = undefined;
            
            cli.output(`Successfully deleted app ${this.state.app_id}`);
            
        } catch (error) {
            throw new Error(`Failed to delete DigitalOcean function: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Check if the function is ready
     */
    override checkReadiness(): boolean {
        if (!this.state.app_id) {
            return false;
        }
        
        // Always check fresh status from API
        
        // Background task - keep console.log
        console.log(`Checking readiness for app ${this.state.app_id}...`);
        
        try {
            const app = this.getApp(this.state.app_id);
            
            // Don't update state in readiness check - keep it minimal
            
            // Check both active_deployment and in_progress_deployment
            const activeDeployment = app.active_deployment;
            const inProgressDeployment = app.in_progress_deployment;
            
            let deploymentPhase = 'unknown';
            let deploymentSource = 'none';
            
            if (activeDeployment) {
                deploymentPhase = activeDeployment.phase || 'unknown';
                deploymentSource = 'active';
            } else if (inProgressDeployment) {
                deploymentPhase = inProgressDeployment.phase || 'unknown';
                deploymentSource = 'in_progress';
            }
            
            // Background task - keep console.log
            console.log(`App ${this.state.app_id} deployment phase: ${deploymentPhase} (${deploymentSource})`);
            
            if (isDeploymentFailed(deploymentPhase)) {
                // Background task - keep console.log
                console.log(`App deployment failed: ${getDeploymentStatusDescription(deploymentPhase)}`);
                return false;
            }
            
            return isDeploymentReady(deploymentPhase);
            
        } catch (error) {
            // Background task - keep console.log
            console.log(`Readiness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    
    /**
     * Get function information with debug output
     */
    @action("info")
    getInfo(): void {
        if (!this.state.app_id) {
            cli.output("No function deployed");
            return;
        }

        try {
            cli.output("Fetching function information...");
            const app = this.makeDORequest('GET', `/apps/${this.state.app_id}`, undefined, true);
            const appData = app.app;
            const func = appData.spec?.functions?.[0];
            
            cli.output("=== Function Information ===");
            cli.output(`App: ${appData.spec.name} (${appData.id})`);
            cli.output(`Component: ${func?.name || 'N/A'}`);
            cli.output(`Status: ${appData.active_deployment?.phase || 'Unknown'}`);
            cli.output(`URL: ${appData.live_url || 'Not available'}`);
            cli.output(`Runtime: Auto-detected from source`);
            cli.output(`Scaling: Managed by platform`);
            
        } catch (error) {
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Get function URL for testing
     */
    @action("url")
    getUrl(): void {
        if (!this.state.app_id) {
            cli.output("No function deployed");
            return;
        }

        try {
            const app = this.makeDORequest('GET', `/apps/${this.state.app_id}`, undefined, true);
            const appData = app.app;
            
            if (appData.live_url) {
                cli.output(`Function URL: ${appData.live_url}`);
                cli.output(`Test: curl "${appData.live_url}"`);
            } else {
                cli.output("Function URL not available yet");
            }
            
        } catch (error) {
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Get deployment status and logs
     */
    @action("logs")
    getLogs(): void {
        if (!this.state.app_id) {
            cli.output("No function deployed");
            return;
        }

        try {
            const app = this.makeDORequest('GET', `/apps/${this.state.app_id}`, undefined, true);
            const appData = app.app;
            
            cli.output("=== Deployment Status ===");
            cli.output(`Status: ${appData.active_deployment?.phase || 'Unknown'}`);
            
            if (appData.active_deployment) {
                cli.output(`Deployment ID: ${appData.active_deployment.id}`);
                
                // Try to get deployment logs
                try {
                    const deployments = this.makeDORequest('GET', `/apps/${this.state.app_id}/deployments`, undefined, true);
                    cli.output(`Recent deployments: ${deployments.deployments?.length || 0}`);
                } catch (logError) {
                    cli.output("Could not fetch deployment details");
                }
            }
            
            cli.output(`Console: https://cloud.digitalocean.com/apps/${this.state.app_id}`);
            
        } catch (error) {
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Trigger a new deployment
     */
    @action("deploy")
    deploy(): void {
        if (!this.state.app_id) {
            cli.output("No function to redeploy");
            return;
        }

        try {
            cli.output("Triggering new deployment...");
            
            // Get current app spec and trigger redeploy
            const app = this.makeDORequest('GET', `/apps/${this.state.app_id}`, undefined, true);
            const updatedApp = this.makeDORequest('PUT', `/apps/${this.state.app_id}`, { spec: app.app.spec }, true);
            
            cli.output("Deployment triggered");
            cli.output(`Status: ${updatedApp.app.active_deployment?.phase || 'Unknown'}`);
            
        } catch (error) {
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Validate the function definition
     */
    protected override validateDefinition(): void {
        const errors = validateFunctionDefinition(this.definition as DOFunctionDefinition);
        
        if (errors.length > 0) {
            throw new Error(`Invalid function definition:\n${errors.join('\n')}`);
        }
    }
    
    /**
     * Build app specification with proper secret resolution
     */
    protected override buildAppSpec(): any {
        const functionComponent: any = {
            name: sanitizeComponentName(this.definition.component_name),
            source_dir: this.definition.source_dir || '/',
            github: {
                repo: normalizeGitHubRepo(this.definition.github_repo),
                branch: this.definition.github_branch || 'main',
                deploy_on_push: this.definition.github_deploy_on_push !== false
            },
            // Note: Functions API doesn't support instance_count, instance_size_slug, environment_slug
            // These are managed automatically by the platform
        };
        
        // Add routes
        if (this.definition.routes && this.definition.routes.length > 0) {
            functionComponent.routes = [...this.definition.routes];
        }
        
        // Add environment variables with secret resolution
        if (this.definition.envs && this.definition.envs.length > 0) {
            functionComponent.envs = buildEnvironmentVariables(
                [...this.definition.envs],
                (ref: string) => this.getSecretValue(ref)
            );
        }
        
        // Add log destinations with secret resolution
        if (this.definition.log_destinations && this.definition.log_destinations.length > 0) {
            functionComponent.log_destinations = buildLogDestinations(
                [...this.definition.log_destinations],
                (ref: string) => this.getSecretValue(ref)
            );
        }
        
        // Add build/run commands
        if (this.definition.build_command) {
            functionComponent.build_command = this.definition.build_command;
        }
        
        if (this.definition.run_command) {
            functionComponent.run_command = this.definition.run_command;
        }
        
        // Add CPU kind
        if (this.definition.cpu_kind) {
            functionComponent.cpu_kind = this.definition.cpu_kind;
        }
        
        const spec: any = {
            name: sanitizeAppName(this.definition.app_name),
            region: this.definition.region || 'nyc',
            functions: [functionComponent]
        };
        
        // Add app-level configuration
        if (this.definition.alerts && this.definition.alerts.length > 0) {
            spec.alerts = [...this.definition.alerts];
        }
        
        if (this.definition.domains && this.definition.domains.length > 0) {
            spec.domains = [...this.definition.domains];
        }
        
        return spec;
    }
    
    /**
     * Add function component to existing app
     */
    private addFunctionToExistingApp(existingApp: any): void {
        // Get current app spec
        const currentSpec = existingApp.spec;
        
        // Build our function component
        const newFunctionComponent: any = {
            name: sanitizeComponentName(this.definition.component_name),
            source_dir: this.definition.source_dir || '/',
            github: {
                repo: normalizeGitHubRepo(this.definition.github_repo),
                branch: this.definition.github_branch || 'main',
                deploy_on_push: this.definition.github_deploy_on_push !== false
            },
            // Note: Functions API doesn't support instance_count, instance_size_slug, environment_slug
            // These are managed automatically by the platform
        };
        
        // Add optional configurations
        if (this.definition.routes && this.definition.routes.length > 0) {
            newFunctionComponent.routes = [...this.definition.routes];
        }
        
        if (this.definition.envs && this.definition.envs.length > 0) {
            newFunctionComponent.envs = buildEnvironmentVariables(
                [...this.definition.envs],
                (ref: string) => this.getSecretValue(ref)
            );
        }
        
        // Add to existing functions array
        if (!currentSpec.functions) {
            currentSpec.functions = [];
        }
        currentSpec.functions.push(newFunctionComponent);
        
        // Update the app
        const updatedApp = this.updateApp(existingApp.id, currentSpec);
        
        // Mark as existing app but our component
        const state = formatFunctionState(updatedApp, true, this.definition.component_name);
        Object.assign(this.state, state);
    }
}
