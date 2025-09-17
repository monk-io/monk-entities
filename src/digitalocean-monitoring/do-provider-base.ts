import { MonkEntity } from "monkec/base";
// Use runtime require to avoid TS type resolution for cloud/digitalocean
declare const require: any;
// @ts-ignore
const digitalocean = require("cloud/digitalocean");
import cli from "cli";

export interface DOMonitoringDefinitionBase {
    // No additional properties needed - provider handles authentication automatically
}

export interface DOMonitoringStateBase {
    existing?: boolean;
}

export abstract class DOMonitoringEntity<
    D extends DOMonitoringDefinitionBase,
    S extends DOMonitoringStateBase
> extends MonkEntity<D, S> {
    
    /**
     * Readiness check configuration
     */
    static readonly readiness = { period: 15, initialDelay: 5, attempts: 40 };

    protected override before(): void {
        // Authentication is handled automatically by DigitalOcean provider
    }

    protected abstract getEntityName(): string;

    /**
     * Standard start implementation for DigitalOcean entities
     */
    override start(): void {
        cli.output(`Starting DigitalOcean Monitoring operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for DigitalOcean entities
     */
    override stop(): void {
        cli.output(`Stopping DigitalOcean Monitoring operations for: ${this.getEntityName()}`);
    }

    /**
     * Helper method to make authenticated HTTP requests using DigitalOcean provider
     */
    protected makeRequest(method: string, path: string, body?: any): any {
        // Ensure path starts with /v2/
        const apiPath = path.startsWith('/v2/') ? path : `/v2${path}`;
        
        try {
            // Make HTTP request without debug output

            const requestOptions: any = {
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }
            };

            if (body) {
                requestOptions.body = JSON.stringify(body);
            }

            let response: any;
            switch (method.toUpperCase()) {
                case 'GET':
                    response = digitalocean.get(apiPath, requestOptions);
                    break;
                case 'POST':
                    response = digitalocean.post(apiPath, requestOptions);
                    break;
                case 'PUT':
                    response = digitalocean.put(apiPath, requestOptions);
                    break;
                case 'DELETE':
                    response = digitalocean.delete(apiPath, requestOptions);
                    break;
                default:
                    throw new Error(`Unsupported HTTP method: ${method}`);
            }
            
            if (response.statusCode < 200 || response.statusCode >= 300) {
                let errorMessage = `DigitalOcean API error: ${response.statusCode} ${response.status}`;
                
                // Try to parse error details
                try {
                    if (response.body) {
                        const errorData = JSON.parse(response.body);
                        if (errorData.errors && Array.isArray(errorData.errors)) {
                            errorMessage += ` - ${errorData.errors.map((e: any) => e.message).join(', ')}`;
                        } else if (errorData.message) {
                            errorMessage += ` - ${errorData.message}`;
                        }
                    }
                } catch (parseError) {
                    errorMessage += ` - Raw: ${response.body || ''}`;
                }
                
                throw new Error(errorMessage);
            }
            
            // Parse response body
            let responseData = {};
            if (response.body) {
                try {
                    responseData = JSON.parse(response.body);
                } catch (e) {
                    // If parsing fails, return the string as-is
                    responseData = response.body;
                }
            }
            
            return responseData;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`DigitalOcean ${method} request to ${apiPath} failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Helper method to check if a resource exists by making a GET request
     * Returns the resource data if it exists, null otherwise
     */
    protected checkResourceExists(path: string): any | null {
        try {
            return this.makeRequest("GET", path);
        } catch (error) {
            // Resource doesn't exist or other error
            if (error instanceof Error && (
                error.message.includes("404") || 
                error.message.includes("not found") ||
                error.message.includes("not_found")
            )) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Helper method to handle resource deletion with proper existing resource checks
     */
    protected deleteResource(path: string, resourceName: string): void {
        if (this.state.existing) {
            // Resource wasn't created by this entity, skip deletion
            return;
        }

        try {
            this.makeRequest("DELETE", path);
            // Resource deleted successfully
        } catch (error) {
            // If resource doesn't exist, that's fine
            if (error instanceof Error && (
                error.message.includes("404") || 
                error.message.includes("not found") ||
                error.message.includes("not_found")
            )) {
                // Resource was already deleted
                return;
            }
            throw new Error(`Failed to delete ${resourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Helper method to get account information and verified email
     */
    protected getAccountInfo(): any {
        try {
            return this.makeRequest("GET", "/account");
        } catch (error) {
            throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Helper method to auto-detect verified email from account
     */
    protected getVerifiedEmail(): string | null {
        try {
            const accountResponse = this.getAccountInfo();
            if (accountResponse.account && accountResponse.account.email_verified && accountResponse.account.email) {
                return accountResponse.account.email;
            }
            return null;
        } catch (error) {
            // Could not auto-detect verified email, return null silently
            return null;
        }
    }

    /**
     * Helper method to list all droplets
     */
    protected listDroplets(): any {
        try {
            return this.makeRequest("GET", "/droplets");
        } catch (error) {
            throw new Error(`Failed to list droplets: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

}
