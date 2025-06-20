import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import { API_VERSION, API_VERSION_2025, BASE_URL, getToken } from "./common.ts";
import cli from "cli";

/**
 * Base definition interface for all MongoDB Atlas entities
 */
export interface MongoDBAtlasEntityDefinition {
    /**
     * Secret Reference for MongoDB Atlas API authentication
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
     * Indicates if the resource already existed before this entity managed it
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
            const apiVersion = this.isClusterRequest(path) ? API_VERSION_2025 : API_VERSION;
            
            const headers: Record<string, string> = {
                "Accept": apiVersion,
                "Authorization": "Bearer " + this.apiToken,
            };
            
            if (method.toUpperCase() !== 'GET') {
                headers["Content-Type"] = apiVersion;
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
            throw new Error(`Failed to delete ${resourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if the request path is for cluster operations
     */
    private isClusterRequest(path: string): boolean {
        return path.includes('/clusters') || path.includes('/accessList');
    }
} 