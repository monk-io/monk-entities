import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import cli from "cli";
import secret from "secret";

/**
 * Base definition interface for all Netlify entities
 */
export interface NetlifyEntityDefinition {
    /**
     * @description Secret Reference for Netlify API authentication
     * Defaults to "default-netlify-pat" if not provided
     * @minLength 1
     * @maxLength 24
     */
    secret_ref?: string;
}

/**
 * Base state interface for all Netlify entities
 */
export interface NetlifyEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

/**
 * Base class for all Netlify entities.
 * Provides common functionality like authentication, HTTP client setup, and error handling.
 */
export abstract class NetlifyEntity<
    D extends NetlifyEntityDefinition,
    S extends NetlifyEntityState
> extends MonkEntity<D, S> {
    
    /**
     * Personal Access Token for Netlify API access
     */
    protected apiToken!: string;
    
    /**
     * HTTP client configured for Netlify API
     */
    protected httpClient!: HttpClient;

    /**
     * Base URL for Netlify API
     */
    protected readonly baseUrl = "https://api.netlify.com/api/v1";

    static readonly readiness = { period: 15, initialDelay: 2, attempts: 20 };

    /**
     * Initialize authentication and HTTP client before any operations
     */
    protected override before(): void {
        const secretRef = this.definition.secret_ref || "default-netlify-pat";
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
     * Standard start implementation for Netlify entities
     */
    override start(): void {
        cli.output(`Starting Netlify operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Netlify entities
     */
    override stop(): void {
        cli.output(`Stopping Netlify operations for: ${this.getEntityName()}`);
        // Netlify resources don't need explicit stopping - they remain active
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
                throw new Error(`Netlify API error: ${response.statusCode} ${response.status} - ${response.data}`);
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
            
            throw new Error(`Netlify ${method} request to ${path} failed: ${errorMessage}`);
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
                cli.output(`The resource will be cleaned up by Netlify automatically`);
                cli.output(`Error details: ${errorMessage}`);
                return; // Don't throw error for 500 responses
            }
            
            throw new Error(`Failed to delete ${resourceName}: ${errorMessage}`);
        }
    }

    /**
     * Helper method to wait for operations to complete
     */
    protected waitForOperation(operationId: string, maxAttempts: number = 40, delayMs: number = 2000): void {
        if (!operationId) return;

        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const operationData = this.makeRequest("GET", `/operations/${operationId}`);
                
                if (operationData.operation) {
                    if (operationData.operation.status === "finished" || operationData.operation.status === "completed") {
                        cli.output(`✅ Operation ${operationId} completed successfully`);
                        return;
                    }
                    
                    if (operationData.operation.status === "failed") {
                        throw new Error(`Operation failed: ${operationData.operation.error || 'Unknown error'}`);
                    }
                }
            } catch (error) {
                // Continue waiting
            }

            attempts++;
            if (attempts < maxAttempts) {
                // Wait before next attempt
                const start = Date.now();
                while (Date.now() - start < delayMs) {
                    // Busy wait
                }
            }
        }

        throw new Error(`Operation ${operationId} timed out after ${maxAttempts} attempts`);
    }
}