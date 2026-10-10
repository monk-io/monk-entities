import { MonkEntity } from "monkec/base";
import { HttpClient, HttpMethod } from "monkec/http-client";
import { retry, isRetryable, deleteIfExists } from "monkec/resilience";
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
            expectJson: true,
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
        cli.output(`🔧 Making ${method} request to: ${this.baseUrl}${path}`);
        if (body) {
            cli.output(`📦 Request body: ${JSON.stringify(body, null, 2)}`);
        }
        // Neon answers 423 while a project has operations running; those,
        // rate limits and, for requests safe to repeat, failures that may
        // have gone through are retried.
        const response = retry(() => this.httpClient.request(method as HttpMethod, path, { body }), {
            attempts: 10,
            delayMs: 2000,
            maxDelayMs: 10000,
            when: (e) => isRetryable(e, method),
            what: `Neon ${method} ${path}`,
        });
        cli.output(`📡 Response status: ${response.statusCode}`);
        return response.data;
    }

    /**
     * Deletes a resource, unless the entity adopted it rather than created
     * it. A resource already gone counts as deleted.
     */
    protected deleteResource(path: string, resourceName: string): void {
        if (this.state.existing) {
            cli.output(`${resourceName} wasn't created by this entity, skipping delete`);
            return;
        }
        if (deleteIfExists(() => this.makeRequest("DELETE", path))) {
            cli.output(`Successfully deleted ${resourceName}`);
        } else {
            cli.output(`${resourceName} was already deleted`);
        }
    }

    /**
     * Waits for an operation to finish; throws if it fails, or doesn't
     * finish in time.
     */
    protected waitForOperation(project_id: string, operation_id: string, maxAttempts: number = 40, delayMs: number = 2000): void {
        if (!operation_id) return;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const data = this.makeRequest("GET", `/projects/${project_id}/operations/${operation_id}`);
            const status = data?.operation?.status;
            if (status === "finished" || status === "completed") {
                cli.output(`✅ Operation ${operation_id} completed successfully`);
                return;
            }
            if (status === "failed" || status === "error" || status === "cancelled") {
                throw new Error(`Neon operation ${operation_id} ${status}: ${data.operation.error || "no details"}`);
            }
            if (attempt < maxAttempts) {
                cli.output(`⏳ Waiting for operation ${operation_id} to complete... (attempt ${attempt}/${maxAttempts})`);
                sleep(delayMs);
            }
        }

        throw new Error(`Operation ${operation_id} did not complete within ${maxAttempts * delayMs / 1000} seconds`);
    }

    /**
     * Helper method to wait for multiple operations to complete
     */
    protected waitForOperations(project_id: string, operation_ids: string[], maxAttempts: number = 40, delayMs: number = 2000): void {
        if (!operation_ids || operation_ids.length === 0) return;

        cli.output(`⏳ Waiting for ${operation_ids.length} operations to complete...`);
        
        for (const operation_id of operation_ids) {
            this.waitForOperation(project_id, operation_id, maxAttempts, delayMs);
        }
    }

    
} 