import { MonkEntity, action } from "monkec/base";
import aws from "cloud/aws";

// Re-export action decorator to avoid duplicate 'base' variable in compiled output
export { action };

/**
 * Base definition interface for AWS Glue Schema Registry entities.
 * @interface AWSGlueSchemaRegistryDefinition
 */
export interface AWSGlueSchemaRegistryDefinition {
    /** @description AWS region for the Schema Registry */
    region: string;
}

/**
 * Base state interface for AWS Glue Schema Registry entities.
 * @interface AWSGlueSchemaRegistryState
 */
export interface AWSGlueSchemaRegistryState {
    /** @description Indicates if the resource pre-existed before this entity managed it */
    existing?: boolean;
}

export interface GlueErrorResponse {
    __type: string;
    Message?: string;
    message?: string;
}

/**
 * Base class for AWS Glue Schema Registry entities.
 * Provides common HTTP client setup and request handling for Glue API.
 */
export abstract class AWSGlueSchemaRegistryEntity<
    TDefinition extends AWSGlueSchemaRegistryDefinition,
    TState extends AWSGlueSchemaRegistryState
> extends MonkEntity<TDefinition, TState> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    /**
     * Make a request to the AWS Glue API using JSON-RPC style
     * @param action - The Glue API action (e.g., "CreateRegistry")
     * @param body - The request body as an object
     * @returns Parsed JSON response
     */
    protected makeGlueRequest(action: string, body: Record<string, any>): any {
        const url = `https://glue.${this.region}.amazonaws.com/`;
        
        const options = {
            service: "glue",
            region: this.region,
            headers: {
                "X-Amz-Target": `AWSGlue.${action}`,
                "Content-Type": "application/x-amz-json-1.1"
            },
            body: JSON.stringify(body),
            timeout: 30
        };

        try {
            const response = aws.post(url, options);

            if (response.statusCode >= 400) {
                let errorMessage = `Glue API error: ${response.statusCode} ${response.status}`;
                
                try {
                    const errorBody: GlueErrorResponse = JSON.parse(response.body);
                    const message = errorBody.Message || errorBody.message;
                    if (message) {
                        errorMessage += ` - ${message}`;
                    }
                    if (errorBody.__type) {
                        // Extract just the exception name from the full type
                        const exceptionName = errorBody.__type.split('#').pop() || errorBody.__type;
                        errorMessage += ` (${exceptionName})`;
                    }
                } catch (_parseError) {
                    errorMessage += ` - Raw: ${response.body}`;
                }
                throw new Error(errorMessage);
            }

            // Parse response body if present
            if (response.body) {
                try {
                    return JSON.parse(response.body);
                } catch (_error) {
                    // Empty or non-JSON response is OK for some operations
                    return {};
                }
            }

            return {};
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Glue API error:')) {
                throw error;
            }
            throw new Error(`Glue API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check if an error indicates the resource was not found
     */
    protected isNotFoundError(error: unknown): boolean {
        if (error instanceof Error) {
            return error.message.includes('EntityNotFoundException') ||
                   error.message.includes('NotFoundException');
        }
        return false;
    }

    /**
     * Check if an error indicates the resource already exists
     */
    protected isAlreadyExistsError(error: unknown): boolean {
        if (error instanceof Error) {
            return error.message.includes('AlreadyExistsException');
        }
        return false;
    }

    /**
     * Simple delay implementation using busy wait
     */
    protected delay(seconds: number): void {
        const delayMs = seconds * 1000;
        const start = Date.now();
        while (Date.now() - start < delayMs) {
            // Busy wait
        }
    }
}
