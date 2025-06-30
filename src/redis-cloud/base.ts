import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import { BASE_URL, CONTENT_TYPE, DEFAULT_TASK_TIMEOUT, DEFAULT_POLLING_INTERVAL, getCredentials, createAuthString } from "./common.ts";
import cli from "cli";

/**
 * Redis Cloud subscription types
 */
export type SubscriptionType = "essentials" | "pro";

/**
 * Cloud providers supported by Redis Cloud
 */
export type CloudProvider = "AWS" | "GCP" | "AZURE";

/**
 * Redis protocols supported
 */
export type RedisProtocol = "redis" | "memcached" | "stack";

/**
 * RESP versions supported
 */
export type RespVersion = "resp2" | "resp3";

/**
 * Data persistence options
 */
export type DataPersistenceType = 
    | "none"
    | "aof-every-1-second" 
    | "aof-every-write"
    | "snapshot-every-1-hour"
    | "snapshot-every-6-hours"
    | "snapshot-every-12-hours";

/**
 * Data eviction policies
 */
export type DataEvictionPolicy = 
    | "allkeys-lru"
    | "allkeys-lfu" 
    | "allkeys-random"
    | "volatile-lru"
    | "volatile-lfu"
    | "volatile-random"
    | "volatile-ttl"
    | "noeviction";

/**
 * Availability types for subscriptions
 */
export type AvailabilityType = "No replication" | "Single-zone" | "Multi-zone";

/**
 * Payment methods
 */
export type PaymentMethodType = "credit-card" | "marketplace";

/**
 * Sharding types for Pro subscriptions
 */
export type ShardingType = "default-regex-rules" | "custom-regex-rules" | "redis-oss-hashing";

/**
 * Alert types
 */
export type AlertType = 
    | "dataset-size"
    | "datasets-size" 
    | "throughput-higher-than"
    | "throughput-lower-than"
    | "latency"
    | "syncsource-error"
    | "syncsource-lag"
    | "connections-limit";

/**
 * Base definition interface for all Redis Cloud entities
 */
export interface RedisCloudEntityDefinition {
    /**
     * Secret Reference for Redis Cloud API authentication
     * @minLength 1
     * @maxLength 24
     */
    secret_ref: string;
}

/**
 * Base state interface for all Redis Cloud entities
 */
export interface RedisCloudEntityState {
    /**
     * Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

/**
 * Base class for all Redis Cloud entities.
 * Provides common functionality like authentication, HTTP client setup, and task waiting.
 */
export abstract class RedisCloudEntity<
    D extends RedisCloudEntityDefinition,
    S extends RedisCloudEntityState
> extends MonkEntity<D, S> {
    
    /**
     * HTTP client configured for Redis Cloud API
     */
    protected httpClient!: HttpClient;

    /**
     * Authentication credentials
     */
    protected credentials!: { accessKey: string; secretKey: string };

    /**
     * Initialize authentication and HTTP client before any operations
     */
    protected override before(): void {
        this.credentials = getCredentials(this.definition.secret_ref);
        
        const authString = createAuthString(this.credentials.accessKey, this.credentials.secretKey);

        this.httpClient = new HttpClient({
            baseUrl: BASE_URL,
            headers: {
                "authorization": "Basic " + authString,
                "content-type": CONTENT_TYPE,
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    /**
     * Standard start implementation for Redis Cloud entities
     */
    override start(): void {
        cli.output(`Starting Redis Cloud operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for Redis Cloud entities
     */
    override stop(): void {
        cli.output(`Stopping Redis Cloud operations for: ${this.getEntityName()}`);
        // Redis Cloud resources don't need explicit stopping - they remain active
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
            const response = this.httpClient.request(method as any, path, { 
                body,
                headers: {
                    "authorization": "Basic " + createAuthString(this.credentials.accessKey, this.credentials.secretKey),
                    "content-type": CONTENT_TYPE,
                }
            });
            
            if (!response.ok) {
                const errorBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                throw new Error(`Redis Cloud API error: ${response.statusCode} ${response.status}. Body: ${errorBody || response.raw}`);
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
                throw new Error(`Redis Cloud ${method} request to ${path} failed: ${error.message}`);
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
     * Wait for task completion with timeout
     */
    protected waitForTask(taskId: string, timeoutSeconds: number = DEFAULT_TASK_TIMEOUT): any {
        if (!taskId) {
            return null;
        }

        const startTime = Date.now();
        const timeout = timeoutSeconds * 1000;

        while (Date.now() - startTime < timeout) {
            try {
                const taskData = this.makeRequest("GET", `/tasks/${taskId}`);
                
                if (taskData && taskData.status) {
                    if (taskData.status === "processing-completed") {
                        cli.output(`✅ Task ${taskId} completed successfully`);
                        return taskData;
                    }
                    
                    if (taskData.status === "processing-error") {
                        throw new Error(`Task failed: ${taskData.description || 'Unknown error'}`);
                    }
                    
                    // Task is still processing
                    cli.output(`⏳ Task ${taskId} status: ${taskData.status}`);
                }
            } catch (error) {
                cli.output(`⚠️ Error checking task status: ${error}`);
            }

            // Wait before next check
            const currentTime = Date.now();
            const elapsed = currentTime - startTime;
            if (elapsed + DEFAULT_POLLING_INTERVAL < timeout) {
                // Simple delay implementation
                const endTime = currentTime + DEFAULT_POLLING_INTERVAL;
                while (Date.now() < endTime) {
                    // Busy wait - not ideal but works in this environment
                }
            } else {
                break;
            }
        }

        throw new Error(`Task ${taskId} timed out after ${timeoutSeconds} seconds`);
    }
} 