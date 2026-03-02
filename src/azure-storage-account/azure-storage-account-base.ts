import { MonkEntity } from "monkec/base";
import cli from "cli";
import azure from "cloud/azure";

/**
 * Azure API response interface (matches cloud/azure module response)
 */
export interface AzureResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    contentLength: number;
    error?: string;
}

/**
 * Base definition interface for all Azure Storage entities
 * @interface AzureStorageDefinition
 */
export interface AzureStorageDefinition {
    /**
     * @description Azure subscription ID
     */
    subscription_id: string;

    /**
     * @description Azure resource group name
     */
    resource_group_name: string;

    /**
     * @description Create resource even if it doesn't exist (for testing)
     * @default true
     */
    create_when_missing?: boolean;
}

/**
 * Base state interface for all Azure Storage entities
 * @interface AzureStorageState
 */
export interface AzureStorageState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;

    /**
     * @description The provisioning state of the resource
     */
    provisioning_state?: string;
}

/**
 * Base class for all Azure Storage entities.
 * Provides common functionality like Azure API interaction and error handling.
 */
export abstract class AzureStorageEntity<
    D extends AzureStorageDefinition,
    S extends AzureStorageState
> extends MonkEntity<D, S> {
    
    protected readonly apiVersion = "2023-05-01";
    protected readonly baseUrl = "https://management.azure.com";

    // Azure Storage Account typically provisions quickly (1-2 minutes)
    // Total timeout: 5s initial + (30 attempts × 10s) = ~5 minutes
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    /**
     * Get the display name for this entity (to be implemented by subclasses)
     */
    protected abstract getEntityName(): string;

    /**
     * Get the Azure resource type (to be implemented by subclasses)
     */
    protected abstract getResourceType(): string;

    /**
     * Standard start implementation for Azure Storage entities
     */
    override start(): void {
        cli.output(`Starting Azure Storage operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Azure Storage entities  
     */
    override stop(): void {
        cli.output(`Stopping Azure Storage operations for: ${this.getEntityName()}`);
    }

    /**
     * Sensitive field names that should be redacted from logs
     */
    private static readonly SENSITIVE_FIELDS = [
        'key',
        'connectionString',
        'accessKey',
        'primaryKey',
        'secondaryKey',
        'sasToken',
        'secret'
    ];

    /**
     * Redact sensitive fields from an object for safe logging
     */
    private redactSensitiveFields(obj: unknown): unknown {
        if (obj === null || obj === undefined) {
            return obj;
        }
        
        if (typeof obj !== 'object') {
            return obj;
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.redactSensitiveFields(item));
        }
        
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            if (AzureStorageEntity.SENSITIVE_FIELDS.some(field => 
                key.toLowerCase().includes(field.toLowerCase())
            )) {
                result[key] = '[REDACTED]';
            } else if (typeof value === 'object' && value !== null) {
                result[key] = this.redactSensitiveFields(value);
            } else {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * Helper method to make authenticated Azure API requests with consistent error handling
     */
    protected makeAzureRequest(method: string, path: string, body?: unknown): AzureResponse {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            "Content-Type": "application/json"
        };

        cli.output(`🔧 Making ${method} request to: ${url}`);
        
        const bodyString = body ? JSON.stringify(body) : undefined;
        if (body && (method === "PUT" || method === "POST" || method === "PATCH")) {
            // Redact sensitive fields before logging
            const redactedBody = this.redactSensitiveFields(body);
            cli.output(`📦 Request body: ${JSON.stringify(redactedBody)}`);
        }

        let response: AzureResponse;
        
        switch (method.toUpperCase()) {
            case "GET":
                response = azure.get(url, { headers });
                break;
            case "PUT":
                response = azure.put(url, { headers, body: bodyString });
                break;
            case "POST":
                response = azure.post(url, { headers, body: bodyString });
                break;
            case "DELETE":
                response = azure.delete(url, { headers });
                break;
            case "PATCH":
                // Use azure.do() for PATCH since there's no dedicated patch() method
                response = azure.do(url, { method: "PATCH", headers, body: bodyString });
                break;
            default:
                throw new Error(`Unsupported HTTP method: ${method}`);
        }

        cli.output(`📡 Response status: ${response.statusCode}`);
        
        // Redact sensitive fields from response body before logging
        if (response.body) {
            try {
                const parsedBody = JSON.parse(response.body);
                const redactedBody = this.redactSensitiveFields(parsedBody);
                cli.output(`📡 Response body: ${JSON.stringify(redactedBody)}`);
            } catch {
                // If not JSON, log as-is (non-JSON responses typically don't contain secrets)
                cli.output(`📡 Response body: ${response.body}`);
            }
        } else {
            cli.output(`📡 Response body: `);
        }
        
        if (response.error) {
            cli.output(`❌ Error response: ${response.error}`);
        }

        return response;
    }

    /**
     * Build the resource path for Azure API calls
     */
    protected buildResourcePath(resourceName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/${this.getResourceType()}/${resourceName}?api-version=${this.apiVersion}`;
    }

    /**
     * Check if a resource exists by making a GET request
     * Returns the resource data if it exists, null otherwise
     */
    protected checkResourceExists(resourceName: string): Record<string, unknown> | null {
        const result = this.checkResourceExistsWithStatus(resourceName);
        return result.resource;
    }

    /**
     * Check if a resource exists by making a GET request
     * Returns detailed status including whether it was a definitive 404 or another error
     * @returns Object with:
     *   - resource: The resource data if found, null otherwise
     *   - notFound: True only if the resource was definitively not found (404)
     *   - error: Error message if there was an API error (non-404)
     */
    protected checkResourceExistsWithStatus(resourceName: string): { resource: Record<string, unknown> | null; notFound: boolean; error?: string } {
        try {
            const path = this.buildResourcePath(resourceName);
            const response = this.makeAzureRequest("GET", path);
            
            if (response.statusCode === 404) {
                // Definitive "not found" - resource doesn't exist
                return { resource: null, notFound: true };
            }
            
            if (response.error) {
                // Other API error (500, 429, etc.) - not a definitive "not found"
                return { resource: null, notFound: false, error: response.error };
            }
            
            if (response.body) {
                return { resource: JSON.parse(response.body), notFound: false };
            }
            
            return { resource: null, notFound: false, error: "Empty response body" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            cli.output(`⚠️  Error checking if resource exists: ${errorMsg}`);
            // Exception during check - not a definitive "not found"
            return { resource: null, notFound: false, error: errorMsg };
        }
    }

    /**
     * Helper method to handle resource deletion with proper existing resource checks
     */
    protected deleteResource(resourceName: string): void {
        if (this.state.existing) {
            cli.output(`${this.getEntityName()} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            const path = this.buildResourcePath(resourceName);
            const response = this.makeAzureRequest("DELETE", path);
            
            if (response.error) {
                // Check if it's a 404 (resource not found) - that's OK for delete
                if (response.statusCode === 404) {
                    cli.output(`⚠️  ${this.getEntityName()} not found, may have been already deleted`);
                    return;
                }
                throw new Error(`${response.error}, body: ${response.body}`);
            }
            
            cli.output(`✅ Successfully initiated deletion of ${this.getEntityName()}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to delete ${this.getEntityName()}: ${errorMessage}`);
        }
    }

    /**
     * Parse Azure API response body safely
     */
    protected parseResponseBody(response: AzureResponse): unknown {
        if (!response.body) {
            return null;
        }
        
        try {
            return JSON.parse(response.body);
        } catch (_error) {
            cli.output(`⚠️  Failed to parse response body as JSON: ${response.body}`);
            return null;
        }
    }

    /**
     * Check if response indicates success
     */
    protected isSuccessResponse(response: AzureResponse): boolean {
        return !response.error && 
               response.statusCode !== undefined && 
               response.statusCode >= 200 && 
               response.statusCode < 300;
    }
}
