import { MonkEntity } from "monkec/base";
import cli from "cli";

// Use runtime require to avoid TS type resolution for cloud/azure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: any;
// @ts-ignore
const azure = require("cloud/azure");

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
 * Base definition interface for all Azure Cosmos DB entities
 */
export interface AzureCosmosDBDefinition {
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
 * Base state interface for all Azure Cosmos DB entities
 */
export interface AzureCosmosDBState {
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
 * Base class for all Azure Cosmos DB entities.
 * Provides common functionality like Azure API interaction and error handling.
 */
export abstract class AzureCosmosDBEntity<
    D extends AzureCosmosDBDefinition,
    S extends AzureCosmosDBState
> extends MonkEntity<D, S> {
    
    protected readonly apiVersion = "2025-04-15";
    protected readonly baseUrl = "https://management.azure.com";

    static readonly readiness = { period: 30, initialDelay: 10, attempts: 20 };

    /**
     * Get the display name for this entity (to be implemented by subclasses)
     */
    protected abstract getEntityName(): string;

    /**
     * Get the Azure resource type (to be implemented by subclasses)
     */
    protected abstract getResourceType(): string;

    /**
     * Standard start implementation for Azure Cosmos DB entities
     */
    override start(): void {
        cli.output(`Starting Azure Cosmos DB operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Azure Cosmos DB entities  
     */
    override stop(): void {
        cli.output(`Stopping Azure Cosmos DB operations for: ${this.getEntityName()}`);
        // Azure resources don't need explicit stopping - they remain active
        // This is just a lifecycle hook for cleanup or logging
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
        if (bodyString && (method === "PUT" || method === "POST" || method === "PATCH")) {
            cli.output(`📦 Request body: ${bodyString}`);
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
                // Use PUT for PATCH operations since Azure builtin doesn't have patch
                response = azure.put(url, { headers, body: bodyString });
                break;
            default:
                throw new Error(`Unsupported HTTP method: ${method}`);
        }

        cli.output(`📡 Response status: ${response.statusCode}`);
        
        if (response.error) {
            cli.output(`❌ Error response: ${response.error}, body: ${response.body}`);
        }

        return response;
    }

    /**
     * Build the resource path for Azure API calls
     */
    protected buildResourcePath(resourceName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DocumentDB/${this.getResourceType()}/${resourceName}?api-version=${this.apiVersion}`;
    }

    /**
     * Check if a resource exists by making a GET request
     * Returns the resource data if it exists, null otherwise
     */
    protected checkResourceExists(resourceName: string): Record<string, unknown> | null {
        try {
            const path = this.buildResourcePath(resourceName);
            const response = this.makeAzureRequest("GET", path);
            
            if (response.error) {
                return null;
            }
            
            if (response.body) {
                return JSON.parse(response.body);
            }
            
            return null;
        } catch (error) {
            cli.output(`⚠️  Error checking if resource exists: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
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
                if (response.body && response.body.includes('"code":"ResourceNotFound"')) {
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
