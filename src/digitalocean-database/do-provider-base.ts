import { MonkEntity } from "monkec/base";
import digitalocean from "cloud/digitalocean";
import cli from "cli";

export interface DOProviderDefinitionBase {
    // No additional properties needed - provider handles authentication automatically
}

export interface DOProviderStateBase {
    existing?: boolean;
}

export abstract class DOProviderEntity<
    D extends DOProviderDefinitionBase,
    S extends DOProviderStateBase
> extends MonkEntity<D, S> {
    
    /**
     * Readiness check configuration
     */
    static readonly readiness = { period: 15, initialDelay: 5, attempts: 40 };

    protected override before(): void {
        cli.output(`🔑 Using DigitalOcean provider for authentication`);
    }



    protected abstract getEntityName(): string;

    /**
     * Standard start implementation for DigitalOcean entities
     */
    override start(): void {
        cli.output(`Starting DigitalOcean operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for DigitalOcean entities
     */
    override stop(): void {
        cli.output(`Stopping DigitalOcean operations for: ${this.getEntityName()}`);
        // DigitalOcean resources don't need explicit stopping - they remain active
        // This is just a lifecycle hook for cleanup or logging
    }

    /**
     * Helper method to make authenticated HTTP requests using DigitalOcean provider
     */
    protected makeRequest(method: string, path: string, body?: any): any {
        // Ensure path starts with /v2/
        const apiPath = path.startsWith('/v2/') ? path : `/v2${path}`;
        
        try {
            cli.output(`🔧 Making ${method} request to: ${apiPath}`);
            
            if (body) {
                cli.output(`📦 Request body: ${JSON.stringify(body, null, 2)}`);
            }

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
            
            cli.output(`📡 Response status: ${response.statusCode}`);
            
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
                
                cli.output(`❌ Error response: ${errorMessage}`);
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
            cli.output(`${resourceName} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            this.makeRequest("DELETE", path);
            cli.output(`Successfully deleted ${resourceName}`);
        } catch (error) {
            // If resource doesn't exist, that's fine
            if (error instanceof Error && (
                error.message.includes("404") || 
                error.message.includes("not found") ||
                error.message.includes("not_found")
            )) {
                cli.output(`${resourceName} was already deleted`);
                return;
            }
            throw new Error(`Failed to delete ${resourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Helper method to wait for database status to reach target state
     */
    protected waitForDatabaseStatus(
        databaseId: string, 
        targetStatus: string, 
        maxAttempts: number = 40
    ): void {
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const response = this.makeRequest("GET", `/databases/${databaseId}`);
                const database = response.database;
                
                if (database && database.status === targetStatus) {
                    cli.output(`✅ Database ${databaseId} reached status: ${targetStatus}`);
                    return;
                }
                
                if (database && database.status === "error") {
                    throw new Error(`Database ${databaseId} entered error state`);
                }

                attempts++;
                if (attempts < maxAttempts) {
                    cli.output(`⏳ Waiting for database ${databaseId} to reach ${targetStatus}... Current: ${database?.status || 'unknown'} (attempt ${attempts}/${maxAttempts})`);
                    // No delay - immediate retry for faster response
                }
            } catch (error) {
                attempts++;
                if (attempts >= maxAttempts) {
                    throw error;
                }
                
                cli.output(`⚠️ Error checking database status, retrying... (attempt ${attempts}/${maxAttempts})`);
                // No delay - immediate retry for faster response
            }
        }

        throw new Error(`Database ${databaseId} did not reach ${targetStatus} status after ${maxAttempts} attempts`);
    }
}
