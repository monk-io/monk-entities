import { MonkEntity } from "monkec/base";
import http from "http";
import secret from "secret";
import cli from "cli";

/**
 * Base interface for DigitalOcean App Platform Function definitions
 */
export interface DOFunctionDefinition {
    app_name: string;                    // Name of the App Platform app
    component_name: string;              // Name of the function component
    github_repo: string;                 // GitHub repository URL
    github_branch?: string;              // Git branch (default: main)
    source_dir?: string;                 // Source directory in repo (default: /)
    environment_slug?: string;           // Environment slug (default: node-js)
    instance_count?: number;             // Number of instances (default: 1)
    instance_size_slug?: string;         // Instance size (default: basic-xxs)
    api_token_secret_ref?: string;       // Secret reference for DO API token
    
    // Function-specific configuration
    routes?: Array<{
        path?: string;                   // Route path
        preserve_path_prefix?: boolean;  // Preserve path prefix
    }>;
    
    // Environment variables
    envs?: Array<{
        key: string;
        value?: string;
        scope?: "RUN_TIME" | "BUILD_TIME" | "RUN_AND_BUILD_TIME";
        type?: "GENERAL" | "SECRET";
    }>;
    
    // Log forwarding configuration
    log_destinations?: Array<{
        name: string;
        datadog?: {
            endpoint: string;
            api_key_secret_ref: string;  // Secret reference for API key
        };
        logtail?: {
            token_secret_ref: string;    // Secret reference for token
        };
    }>;
    
    // GitHub integration
    github_deploy_on_push?: boolean;     // Auto-deploy on push (default: true)
    
    // Build configuration
    build_command?: string;              // Custom build command
    run_command?: string;                // Custom run command
    
    // Resource limits
    cpu_kind?: "shared" | "dedicated";
    
    // Alerts
    alerts?: Array<{
        rule: "DEPLOYMENT_FAILED" | "DOMAIN_FAILED" | "FUNCTIONS_ACTIVATION_COUNT" | "FUNCTIONS_AVERAGE_DURATION_MS" | "FUNCTIONS_ERROR_RATE_PER_MINUTE";
        disabled?: boolean;
    }>;
    
    // Domains (optional)
    domains?: Array<{
        domain: string;
        type?: "DEFAULT" | "PRIMARY" | "ALIAS";
        wildcard?: boolean;
        zone?: string;
        minimum_tls_version?: string;
    }>;
    
    // Region
    region?: string;                     // DigitalOcean region (default: nyc)
}

/**
 * State interface for DigitalOcean App Platform Functions
 * Contains only essential runtime data that cannot be derived from API calls
 */
export interface DOFunctionState {
    existing: boolean;                   // Controls deletion behavior - CRITICAL for safety
    app_id?: string;                     // App Platform app ID - needed for all API operations
    component_name?: string;             // Function component name - needed for operations
}

/**
 * DigitalOcean App Platform API response interfaces
 */
export interface DOAppResponse {
    app: {
        id: string;
        spec: any;
        default_ingress: string;
        live_url: string;
        created_at: string;
        updated_at: string;
        active_deployment?: {
            id: string;
            phase: string;
            progress?: {
                pending_steps: number;
                running_steps: number;
                success_steps: number;
                error_steps: number;
                total_steps: number;
            };
        };
        in_progress_deployment?: {
            id: string;
            phase: string;
        };
        last_deployment_created_at: string;
        live_url_base: string;
        live_domain: string;
        domains?: Array<{
            id: string;
            spec: any;
            phase: string;
        }>;
        region: {
            slug: string;
            flag: string;
            continent: string;
            data_centers: string[];
        };
        tier_slug: string;
        dedicated_ips?: any[];
    };
}

export interface DOAppsListResponse {
    apps: Array<{
        id: string;
        spec: {
            name: string;
            region?: string;
        };
        default_ingress: string;
        created_at: string;
        updated_at: string;
    }>;
    links?: {
        pages?: {
            next?: string;
            prev?: string;
            last?: string;
            first?: string;
        };
    };
    meta: {
        total: number;
    };
}

/**
 * Abstract base class for DigitalOcean App Platform Function entities
 */
export abstract class DOFunctionEntity<TDefinition extends DOFunctionDefinition, TState extends DOFunctionState> 
    extends MonkEntity<TDefinition, TState> {
    
    protected baseUrl = "https://api.digitalocean.com/v2";
    
    /**
     * Make authenticated request to DigitalOcean API with debug output
     */
    protected makeDORequest(method: string, endpoint: string, data?: any, debug: boolean = false): any {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Get API token from secrets
        const token = this.getDOAPIToken();
        
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        
        // Debug output for request
        if (debug) {
            cli.output(`[DEBUG] API Request: ${method} ${url}`);
            if (data) {
                cli.output(`[DEBUG] Request Body: ${JSON.stringify(data, null, 2)}`);
            }
        }
        
        try {
            let response;
            if (method.toLowerCase() === 'get') {
                response = http.get(url, { headers });
            } else if (method.toLowerCase() === 'post') {
                response = http.post(url, { 
                    headers, 
                    body: data ? JSON.stringify(data) : undefined 
                });
            } else if (method.toLowerCase() === 'put') {
                response = http.put(url, { 
                    headers, 
                    body: data ? JSON.stringify(data) : undefined 
                });
            } else if (method.toLowerCase() === 'delete') {
                response = http.delete(url, { headers });
            } else {
                throw new Error(`Unsupported HTTP method: ${method}`);
            }
            
            // Debug output for response
            if (debug) {
                cli.output(`[DEBUG] API Response: ${response.status}`);
                if (response.body) {
                    cli.output(`[DEBUG] Response Body: ${response.body}`);
                }
            }
            
            if (Number(response.status) >= 400) {
                throw new Error(`DigitalOcean API error: ${response.status} - ${response.body}`);
            }
            
            return response.body ? JSON.parse(response.body) : null;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (debug) {
                cli.output(`[DEBUG] API Error: ${errorMessage}`);
            }
            // Always provide detailed error information
            cli.output(`[ERROR] DigitalOcean API request failed:`);
            cli.output(`[ERROR] Method: ${method}`);
            cli.output(`[ERROR] URL: ${url}`);
            cli.output(`[ERROR] Error: ${errorMessage}`);
            throw new Error(`DigitalOcean API request failed: ${errorMessage}`);
        }
    }
    
    /**
     * Get DigitalOcean API token from secrets
     */
    protected getDOAPIToken(): string {
        // Use secret reference
        const secretRef = this.definition.api_token_secret_ref || 'do-api-token';
        try {
            const token = secret.get(secretRef);
            if (!token) {
                throw new Error(`DigitalOcean API token not found in secret: ${secretRef}`);
            }
            return token;
        } catch (error) {
            throw new Error(`Failed to get DigitalOcean API token: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Check if an app exists by name
     */
    protected checkAppExists(appName: string): any | null {
        try {
            const response: DOAppsListResponse = this.makeDORequest('GET', '/apps');
            
            const existingApp = response.apps.find(app => app.spec.name === appName);
            if (existingApp) {
                // Get full app details
                const fullApp: DOAppResponse = this.makeDORequest('GET', `/apps/${existingApp.id}`);
                return fullApp.app;
            }
            
            return null;
        } catch (error) {
            // Background task - keep console.log
            console.log(`Error checking if app exists: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    
    /**
     * Get app by ID
     */
    protected getApp(appId: string): any {
        const response: DOAppResponse = this.makeDORequest('GET', `/apps/${appId}`);
        return response.app;
    }
    
    /**
     * Create a new app with function component
     */
    protected createApp(appSpec: any): any {
        const response: DOAppResponse = this.makeDORequest('POST', '/apps', { spec: appSpec }, true);
        return response.app;
    }
    
    /**
     * Update an existing app
     */
    protected updateApp(appId: string, appSpec: any): any {
        const response: DOAppResponse = this.makeDORequest('PUT', `/apps/${appId}`, { spec: appSpec });
        return response.app;
    }
    
    /**
     * Delete an app
     */
    protected deleteApp(appId: string): void {
        this.makeDORequest('DELETE', `/apps/${appId}`);
    }
    
    /**
     * Get app deployments
     */
    protected getAppDeployments(appId: string): any {
        return this.makeDORequest('GET', `/apps/${appId}/deployments`);
    }
    
    /**
     * Get deployment logs
     */
    protected getDeploymentLogs(appId: string, deploymentId: string, componentName: string): any {
        return this.makeDORequest('GET', `/apps/${appId}/deployments/${deploymentId}/components/${componentName}/logs`);
    }
    
    /**
     * Validate the definition
     */
    protected validateDefinition(): void {
        if (!this.definition.app_name) {
            throw new Error("app_name is required");
        }
        
        if (!this.definition.component_name) {
            throw new Error("component_name is required");
        }
        
        if (!this.definition.github_repo) {
            throw new Error("github_repo is required");
        }
        
        // Validate GitHub repo format
        const repoPattern = /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+(?:\.git)?$/;
        if (!repoPattern.test(this.definition.github_repo)) {
            throw new Error("github_repo must be a valid GitHub repository URL");
        }
        
        // Validate environment variables
        if (this.definition.envs) {
            for (const env of this.definition.envs) {
                if (!env.key) {
                    throw new Error("Environment variable key is required");
                }
                if (env.type === "SECRET" && !env.value && !env.value?.includes("secret(")) {
                    cli.output(`Warning: SECRET type environment variable ${env.key} should use secret reference`);
                }
            }
        }
    }
    
    /**
     * Build app specification for DigitalOcean App Platform
     */
    protected buildAppSpec(): any {
        const functionComponent: any = {
            name: this.definition.component_name,
            source_dir: this.definition.source_dir || '/',
            github: {
                repo: this.definition.github_repo,
                branch: this.definition.github_branch || 'main',
                deploy_on_push: this.definition.github_deploy_on_push !== false
            },
            // Note: Functions API doesn't support instance_count, instance_size_slug, environment_slug
            // These are managed automatically by the platform
        };
        
        // Add routes if specified
        if (this.definition.routes && this.definition.routes.length > 0) {
            functionComponent.routes = [...this.definition.routes];
        }
        
        // Add environment variables
        if (this.definition.envs && this.definition.envs.length > 0) {
            functionComponent.envs = this.definition.envs.map(env => ({
                key: env.key,
                value: env.value || '',
                scope: env.scope || 'RUN_AND_BUILD_TIME',
                type: env.type || 'GENERAL'
            }));
        }
        
        // Add log destinations
        if (this.definition.log_destinations && this.definition.log_destinations.length > 0) {
            functionComponent.log_destinations = this.definition.log_destinations.map(dest => {
                const logDest: any = { name: dest.name };
                
                if (dest.datadog) {
                    logDest.datadog = {
                        endpoint: dest.datadog.endpoint,
                        api_key: this.getSecretValue(dest.datadog.api_key_secret_ref)
                    };
                }
                
                if (dest.logtail) {
                    logDest.logtail = {
                        token: this.getSecretValue(dest.logtail.token_secret_ref)
                    };
                }
                
                return logDest;
            });
        }
        
        // Add build/run commands if specified
        if (this.definition.build_command) {
            functionComponent.build_command = this.definition.build_command;
        }
        
        if (this.definition.run_command) {
            functionComponent.run_command = this.definition.run_command;
        }
        
        // Add CPU kind if specified
        if (this.definition.cpu_kind) {
            functionComponent.cpu_kind = this.definition.cpu_kind;
        }
        
        const spec: any = {
            name: this.definition.app_name,
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
     * Get secret value by reference
     */
    protected getSecretValue(secretRef: string): string {
        try {
            const value = secret.get(secretRef);
            if (!value) {
                throw new Error(`Secret not found: ${secretRef}`);
            }
            return value;
        } catch (error) {
            throw new Error(`Failed to get secret ${secretRef}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Format app state for storage - minimal essential data only
     */
    protected formatAppState(app: any, wasPreExisting: boolean = false): Partial<DOFunctionState> {
        return {
            existing: wasPreExisting,
            app_id: app.id,
            component_name: this.definition.component_name
        };
    }
    
    /**
     * Check if the function component is ready
     */
    protected isFunctionReady(app: any): boolean {
        if (!app.active_deployment) {
            return false;
        }
        
        const deployment = app.active_deployment;
        
        // Check if deployment is successful
        if (deployment.phase === 'ACTIVE') {
            return true;
        }
        
        // Check if deployment failed
        if (deployment.phase === 'ERROR' || deployment.phase === 'CANCELED') {
            return false;
        }
        
        // Still in progress
        return false;
    }
}
