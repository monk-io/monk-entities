import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import { getApiKey } from "./common.ts";
import cli from "cli";

/**
 * Base definition interface for all Neon entities
 */
export interface NeonEntityDefinition {
    /**
     * @description Secret Reference for Neon API authentication
     * @minLength 1
     * @maxLength 24
     */
    secret_ref: string;
}

/**
 * Base state interface for all Neon entities
 */
export interface NeonEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

/**
 * Base class for all Neon entities.
 * Provides common functionality like authentication, HTTP client setup, and error handling.
 */
export abstract class NeonEntity<
    D extends NeonEntityDefinition,
    S extends NeonEntityState
> extends MonkEntity<D, S> {
    
    /**
     * API key for Neon API access
     */
    protected apiKey!: string;
    
    /**
     * HTTP client configured for Neon API
     */
    protected httpClient!: HttpClient;

    /**
     * Base URL for Neon API
     */
    protected readonly baseUrl = "https://console.neon.tech/api/v2";

    static readonly readiness = { period: 15, initialDelay: 2, attempts: 20 };

    /**
     * Initialize authentication and HTTP client before any operations
     */
    protected override before(): void {
        this.apiKey = getApiKey(this.definition.secret_ref);
        if (!this.apiKey) {
            throw new Error(`Failed to retrieve API key from secret: ${this.definition.secret_ref}`);
        }

        this.httpClient = new HttpClient({
            baseUrl: this.baseUrl,
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    /**
     * Standard start implementation for Neon entities
     */
    override start(): void {
        cli.output(`Starting Neon operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Neon entities
     */
    override stop(): void {
        cli.output(`Stopping Neon operations for: ${this.getEntityName()}`);
        // Neon resources don't need explicit stopping - they remain active
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
            
            if (body) {
                cli.output(`📦 Request body: ${JSON.stringify(body, null, 2)}`);
            }

            const response = this.httpClient.request(method as any, path, { 
                body,
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                }
            });
            
            cli.output(`📡 Response status: ${response.statusCode}`);
            
            if (!response.ok) {
                cli.output(`❌ Error response body: ${response.data}`);
                throw new Error(`Neon API error: ${response.statusCode} ${response.status} - ${response.data}`);
            }
            
            // Handle JSON parsing issue in Goja runtime
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
                throw new Error(`Neon ${method} request to ${path} failed: ${error.message}`);
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
     * Helper method to wait for operations to complete
     */
    protected waitForOperation(projectId: string, operationId: string, maxAttempts: number = 40, delayMs: number = 2000): void {
        if (!operationId) return;

        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const operationData = this.makeRequest("GET", `/projects/${projectId}/operations/${operationId}`);
                
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
                cli.output(`⏳ Waiting for operation ${operationId} to complete... (attempt ${attempts}/${maxAttempts})`);
                // Simple delay
                const start = Date.now();
                while (Date.now() - start < delayMs) {
                    // Busy wait
                }
            }
        }

        throw new Error(`Operation ${operationId} did not complete within ${maxAttempts * delayMs / 1000} seconds`);
    }

    /**
     * Helper method to wait for multiple operations to complete
     */
    protected waitForOperations(projectId: string, operationIds: string[], maxAttempts: number = 40, delayMs: number = 2000): void {
        if (!operationIds || operationIds.length === 0) return;

        cli.output(`⏳ Waiting for ${operationIds.length} operations to complete...`);
        
        for (const operationId of operationIds) {
            this.waitForOperation(projectId, operationId, maxAttempts, delayMs);
        }
    }

    
} 