import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import cli from "cli";
import secret from "secret";

/**
 * Base definition interface for all Vercel entities
 */
export interface VercelEntityDefinition {
    /**
      * @description Secret Reference for Vercel API authentication
      * Defaults to "default-vercel-token" if not provided
      * @minLength 1
      * @maxLength 24
      */
    secret_ref?: string;

    /**
     * @description Team ID for team-specific operations (optional)
     */
    team_id?: string;
}

/**
 * Base state interface for all Vercel entities
 */
export interface VercelEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

/**
 * Base class for all Vercel entities.
 * Provides common functionality like authentication, HTTP client setup, and error handling.
 */
export abstract class VercelEntity<
    D extends VercelEntityDefinition,
    S extends VercelEntityState
> extends MonkEntity<D, S> {
    
    /**
     * Personal Access Token for Vercel API access
     */
    protected apiToken!: string;
    
    /**
     * HTTP client configured for Vercel API
     */
    protected httpClient!: HttpClient;

    /**
     * Base URL for Vercel API
     */
    protected readonly baseUrl = "https://api.vercel.com";

    static readonly readiness = { period: 15, initialDelay: 2, attempts: 20 };

    /**
     * Initialize authentication and HTTP client before any operations
     */
    protected override before(): void {
        const secretRef = this.definition.secret_ref || "default-vercel-token";
        const token = secret.get(secretRef);
        if (!token) {
            throw new Error(`Failed to retrieve API token from secret: ${secretRef}`);
        }
        this.apiToken = token;

        this.httpClient = new HttpClient({
            baseUrl: this.baseUrl,
            headers: {
                "Authorization": `Bearer ${this.apiToken}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    /**
     * Standard start implementation for Vercel entities
     */
    override start(): void {
        cli.output(`Starting Vercel operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Vercel entities
     */
    override stop(): void {
        cli.output(`Stopping Vercel operations for: ${this.getEntityName()}`);
        // Vercel resources don't need explicit stopping - they remain active
        // This is just a lifecycle hook for cleanup or logging
    }

    /**
     * Get the display name for this entity (to be implemented by subclasses)
     */
    protected abstract getEntityName(): string;

    /**
     * Helper method to make authenticated HTTP requests with consistent error handling
     */
    protected makeRequest(method: string, path: string, body?: any): any {
        try {
            const fullUrl = `${this.baseUrl}${path}`;
            cli.output(`🔧 Making ${method} request to: ${fullUrl}`);
            
            if (body && method !== "GET" && method !== "DELETE") {
                cli.output(`📦 Request body: ${JSON.stringify(body, null, 2)}`);
            }

            // Set up headers - don't include Content-Type for DELETE requests
            const headers: any = {
                "Authorization": `Bearer ${this.apiToken}`,
                "Accept": "application/json",
            };
            
            // Only include Content-Type for non-DELETE requests that have a body
            if (method !== "DELETE" && (method !== "GET" || body)) {
                headers["Content-Type"] = "application/json";
            }

            const requestOptions: any = { headers };
            
            // Only include body for non-GET and non-DELETE requests
            if (method !== "GET" && method !== "DELETE" && body) {
                requestOptions.body = body;
            }

            const response = this.httpClient.request(method as any, path, requestOptions);
            
            cli.output(`📡 Response status: ${response.statusCode}`);
            
            if (!response.ok) {
                cli.output(`❌ Error response body: ${response.data}`);
                throw new Error(`Vercel API error: ${response.statusCode} ${response.status} - ${response.data}`);
            }
            
            let responseData = response.data;
            if (typeof responseData === "string") {
                try {
                    responseData = JSON.parse(responseData);
                } catch (e) {
                    // Ignore parsing errors
                }
            }
            
            return responseData;
        } catch (error) {
            cli.output(`🔍 makeRequest caught error: ${typeof error}`);
            cli.output(`🔍 Error instanceof Error: ${error instanceof Error}`);
            
            let errorMessage = "Unknown error";
            
            if (error instanceof Error) {
                errorMessage = error.message;
                cli.output(`🔍 Error message: ${errorMessage}`);
            } else if (typeof error === "string") {
                errorMessage = error;
                cli.output(`🔍 String error: ${errorMessage}`);
            } else if (typeof error === "object" && error !== null) {
                try {
                    errorMessage = JSON.stringify(error);
                    cli.output(`🔍 Object error: ${errorMessage}`);
                } catch {
                    errorMessage = String(error);
                    cli.output(`🔍 Stringified object error: ${errorMessage}`);
                }
            } else {
                errorMessage = String(error);
                cli.output(`🔍 Other error: ${errorMessage}`);
            }
            
            throw new Error(`Vercel ${method} request to ${path} failed: ${errorMessage}`);
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
            return null;
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
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            // Handle specific error cases
            if (errorMessage.includes('500') || errorMessage.includes('unexpected response code 500')) {
                cli.output(`⚠️  Warning: ${resourceName} may have dependencies or be in a transitional state`);
                cli.output(`The resource will be cleaned up by Vercel automatically`);
                cli.output(`Error details: ${errorMessage}`);
                return; // Don't throw error for 500 responses
            }
            
            throw new Error(`Failed to delete ${resourceName}: ${errorMessage}`);
        }
    }



    /**
     * Helper method to build team-specific API paths
     */
    protected getTeamPath(): string {
        return this.definition.team_id ? `?teamId=${this.definition.team_id}` : "";
    }

    /**
     * Helper method to build team-specific API paths for POST/PUT requests
     */
    protected getTeamBody(): any {
        return this.definition.team_id ? { teamId: this.definition.team_id } : {};
    }
} 