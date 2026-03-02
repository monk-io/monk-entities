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
 * Base definition interface for all Azure Event Hubs entities
 * @interface AzureEventHubsDefinition
 */
export interface AzureEventHubsDefinition {
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
 * Base state interface for all Azure Event Hubs entities
 * @interface AzureEventHubsState
 */
export interface AzureEventHubsState {
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
 * Base class for all Azure Event Hubs entities.
 * Provides common functionality like Azure API interaction and error handling.
 */
export abstract class AzureEventHubsEntity<
    D extends AzureEventHubsDefinition,
    S extends AzureEventHubsState
> extends MonkEntity<D, S> {
    
    protected readonly apiVersion = "2024-01-01";
    protected readonly baseUrl = "https://management.azure.com";

    // Event Hubs namespaces typically provision in 1-3 minutes
    // Total timeout: 10s initial + (20 attempts × 15s) = ~5 minutes
    static readonly readiness = { period: 15, initialDelay: 10, attempts: 20 };

    /**
     * Get the display name for this entity (to be implemented by subclasses)
     */
    protected abstract getEntityName(): string;

    /**
     * Get the Azure resource type (to be implemented by subclasses)
     */
    protected abstract getResourceType(): string;

    /**
     * Check if the resource is ready (to be implemented by subclasses)
     * @returns true if the resource is ready, false otherwise
     */
    abstract checkReadiness(): boolean;

    /**
     * Standard start implementation for Azure Event Hubs entities
     */
    override start(): void {
        cli.output(`Starting Azure Event Hubs operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Azure Event Hubs entities  
     */
    override stop(): void {
        cli.output(`Stopping Azure Event Hubs operations for: ${this.getEntityName()}`);
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
        'secret',
        'sharedAccessKey'
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
            if (AzureEventHubsEntity.SENSITIVE_FIELDS.some(field => 
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
     * Build the resource path for Azure API calls (namespace level)
     */
    protected buildNamespacePath(namespaceName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${namespaceName}?api-version=${this.apiVersion}`;
    }

    /**
     * Build the resource path for Event Hub resources
     */
    protected buildEventHubPath(namespaceName: string, eventHubName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${namespaceName}/eventhubs/${eventHubName}?api-version=${this.apiVersion}`;
    }

    /**
     * Build the resource path for consumer group resources
     */
    protected buildConsumerGroupPath(namespaceName: string, eventHubName: string, consumerGroupName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${namespaceName}/eventhubs/${eventHubName}/consumergroups/${consumerGroupName}?api-version=${this.apiVersion}`;
    }

    /**
     * Build the resource path for authorization rules
     */
    protected buildAuthorizationRulePath(namespaceName: string, ruleName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${namespaceName}/authorizationRules/${ruleName}?api-version=${this.apiVersion}`;
    }

    /**
     * Build the resource path for listing authorization rules keys
     */
    protected buildListKeysPath(namespaceName: string, ruleName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.EventHub/namespaces/${namespaceName}/authorizationRules/${ruleName}/listKeys?api-version=${this.apiVersion}`;
    }

    /**
     * Check if a resource exists by making a GET request
     * Returns the resource data if it exists, null otherwise
     */
    protected checkResourceExists(path: string): Record<string, unknown> | null {
        const result = this.checkResourceExistsWithStatus(path);
        return result.resource;
    }

    /**
     * Check if a resource exists by making a GET request
     * Returns detailed status including whether it was a definitive 404 or another error
     */
    protected checkResourceExistsWithStatus(path: string): { resource: Record<string, unknown> | null; notFound: boolean; error?: string } {
        try {
            const response = this.makeAzureRequest("GET", path);
            
            if (response.statusCode === 404) {
                return { resource: null, notFound: true };
            }
            
            if (response.error) {
                return { resource: null, notFound: false, error: response.error };
            }
            
            if (response.body) {
                return { resource: JSON.parse(response.body), notFound: false };
            }
            
            return { resource: null, notFound: false, error: "Empty response body" };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            cli.output(`⚠️  Error checking if resource exists: ${errorMsg}`);
            return { resource: null, notFound: false, error: errorMsg };
        }
    }

    /**
     * Helper method to handle resource deletion with proper existing resource checks
     */
    protected deleteResourceByPath(path: string, resourceName: string): void {
        if (this.state.existing) {
            cli.output(`${resourceName} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            const response = this.makeAzureRequest("DELETE", path);
            
            if (response.error) {
                if (response.statusCode === 404) {
                    cli.output(`⚠️  ${resourceName} not found, may have been already deleted`);
                    return;
                }
                throw new Error(`${response.error}, body: ${response.body}`);
            }
            
            cli.output(`✅ Successfully initiated deletion of ${resourceName}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to delete ${resourceName}: ${errorMessage}`);
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

}
