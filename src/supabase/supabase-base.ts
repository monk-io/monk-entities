import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import cli from "cli";
import secret from "secret";

/**
 * Base definition interface for all Supabase entities
 */
export interface SupabaseEntityDefinition {
    /**
     * @description Secret reference for Supabase Management API authentication
     * Defaults to "supabase-api-token" if not provided
     */
    secret_ref?: string;

}

/**
 * Base state interface for all Supabase entities
 */
export interface SupabaseEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

/**
 * Base class for all Supabase entities.
 * Provides common functionality like authentication, HTTP client setup, and error handling.
 */
export abstract class SupabaseEntity<
    D extends SupabaseEntityDefinition,
    S extends SupabaseEntityState
> extends MonkEntity<D, S> {
    
    /**
     * Personal Access Token for Supabase Management API access
     */
    protected apiToken!: string;
    
    /**
     * HTTP client configured for Supabase Management API
     */
    protected httpClient!: HttpClient;

    /**
     * Base URL for Supabase Management API
     */
    protected readonly baseUrl = "https://api.supabase.com";

    static readonly readiness = { period: 15, initialDelay: 2, attempts: 20 };

    /**
     * Initialize authentication and HTTP client before any operations
     */
    protected override before(): void {
        const secretRef = this.definition.secret_ref || "supabase-api-token";
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
            timeout: 30000,
        });
    }

    /**
     * Standard start implementation for Supabase entities
     */
    override start(): void {
        cli.output(`Starting Supabase operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Supabase entities  
     */
    override stop(): void {
        cli.output(`Stopping Supabase operations for: ${this.getEntityName()}`);
        // Supabase resources don't need explicit stopping - they remain active
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

            // Set up headers
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
                throw new Error(`Supabase API error: ${response.statusCode} ${response.status} - ${response.data}`);
            }
            
            let responseData = response.data;
            if (typeof responseData === "string") {
                try {
                    responseData = JSON.parse(responseData);
                } catch (e) {
                    // Ignore parsing errors - return as string
                }
            }
            
            return responseData;
        } catch (error) {
            cli.output(`🔍 makeRequest caught error: ${typeof error}`);
            
            let errorMessage = "Unknown error";
            
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === "string") {
                errorMessage = error;
            } else if (typeof error === "object" && error !== null) {
                try {
                    errorMessage = JSON.stringify(error);
                } catch {
                    errorMessage = String(error);
                }
            } else {
                errorMessage = String(error);
            }
            
            throw new Error(`Supabase ${method} request to ${path} failed: ${errorMessage}`);
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
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
                cli.output(`⚠️  ${resourceName} not found, may have been already deleted`);
                return;
            }
            
            throw new Error(`Failed to delete ${resourceName}: ${errorMessage}`);
        }
    }
}
