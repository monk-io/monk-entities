import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import { API_VERSION, BASE_URL, getToken } from "./common.ts";
import cli from "cli";

/**
 * Base definition interface for all MongoDB Atlas entities
 */
export interface MongoDBAtlasEntityDefinition {
    /**
     * @description Secret Reference for MongoDB Atlas API authentication
     * @minLength 1
     * @maxLength 24
     */
    secret_ref: string;
}

/**
 * Base state interface for all MongoDB Atlas entities
 */
export interface MongoDBAtlasEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

/**
 * Base class for all MongoDB Atlas entities.
 * Provides common functionality like authentication, HTTP client setup, and error handling.
 */
export abstract class MongoDBAtlasEntity<
    D extends MongoDBAtlasEntityDefinition,
    S extends MongoDBAtlasEntityState
> extends MonkEntity<D, S> {
    
    /**
     * OAuth token for MongoDB Atlas API access
     */
    protected apiToken!: string;
    
    /**
     * HTTP client configured for MongoDB Atlas API
     */
    protected httpClient!: HttpClient;

    /**
     * Initialize authentication and HTTP client before any operations
     */
    protected override before(): void {
        this.apiToken = getToken(this.definition.secret_ref);
        if (!this.apiToken) {
            throw new Error(`Failed to retrieve API token from secret: ${this.definition.secret_ref}`);
        }

        this.httpClient = new HttpClient({
            baseUrl: BASE_URL,
            headers: {
                "authorization": "Bearer " + this.apiToken,
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    /**
     * Standard start implementation for MongoDB Atlas entities
     */
    override start(): void {
        cli.output(`Starting MongoDB Atlas operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for MongoDB Atlas entities
     */
    override stop(): void {
        cli.output(`Stopping MongoDB Atlas operations for: ${this.getEntityName()}`);
        // MongoDB Atlas resources don't need explicit stopping - they remain active
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
            const headers: Record<string, string> = {
                "Accept": API_VERSION,
                "Authorization": "Bearer " + this.apiToken,
            };

            if (method.toUpperCase() !== 'GET') {
                headers["Content-Type"] = API_VERSION;
            }

            const response = this.httpClient.request(method as any, path, { 
                body,
                headers
            });
            
            if (!response.ok) {
                const errorBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                throw new Error(`MongoDB Atlas API error: ${response.statusCode} ${response.status}. Body: ${errorBody || response.raw}`);
            }
            
            // Handle JSON parsing issue in Goja runtime - same fix as in checkResourceExists
            let responseData = response.data;
            if (typeof responseData === 'string') {
                try {
                    responseData = JSON.parse(responseData);
                } catch (e) {
                    // If parsing fails, return the string as-is
                }
            }
            
            return responseData;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`MongoDB Atlas ${method} request to ${path} failed: ${error.message}`);
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
            // Use makeRequest instead of direct httpClient.get to ensure consistent JSON parsing
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
            // Idempotent delete: if the resource (or its parent group) is already gone,
            // treat it as success rather than failing the teardown.
            if (this.isResourceGoneError(error)) {
                cli.output(`${resourceName} already deleted (not found), treating as success`);
                return;
            }
            throw new Error(`Failed to delete ${resourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Detect "resource already gone" errors so deletes can be idempotent.
     * Covers HTTP 404, Atlas *_NOT_FOUND error codes, and "does not exist" messages.
     */
    protected isResourceGoneError(error: unknown): boolean {
        const msg = (error instanceof Error ? error.message : String(error)).toUpperCase();
        return msg.includes(" 404")
            || msg.includes("NOT_FOUND")
            || msg.includes("NOT FOUND")
            || msg.includes("DOES NOT EXIST");
    }
}
