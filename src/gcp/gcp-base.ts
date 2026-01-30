/**
 * GCP Entities - Base Class
 *
 * Abstract base class for all GCP entities providing common functionality
 * for authentication, HTTP requests, and error handling.
 */

import { MonkEntity } from "monkec/base";
import gcp from "cloud/gcp";
import cli from "cli";
import { parseGcpError, isOperationDone, isOperationFailed } from "./common.ts";

/**
 * Base definition interface for all GCP entities
 */
export interface GcpEntityDefinition {
    /**
     * @description Override the GCP project ID (optional, defaults to environment)
     */
    project?: string;
}

/**
 * Base state interface for all GCP entities
 */
export interface GcpEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;

    /**
     * @description Operation name for tracking long-running operations
     */
    operation_name?: string;
}

/**
 * HTTP response from GCP API
 */
interface GcpHttpResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    error?: string;
}

/**
 * Base class for all GCP entities.
 * Provides common functionality like project ID resolution, HTTP requests, and operation tracking.
 */
export abstract class GcpEntity<
    D extends GcpEntityDefinition,
    S extends GcpEntityState
> extends MonkEntity<D, S> {

    /**
     * GCP Project ID
     */
    protected projectId!: string;

    /**
     * Default readiness check configuration
     */
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 60 };

    /**
     * Initialize project ID before any operations
     */
    protected override before(): void {
        this.projectId = this.definition.project || gcp.getProject();
        if (!this.projectId) {
            throw new Error("GCP project ID not available. Set via definition.project or environment.");
        }
    }

    /**
     * Get the display name for this entity (to be implemented by subclasses)
     */
    protected abstract getEntityName(): string;

    /**
     * Standard start implementation for GCP entities
     */
    override start(): void {
        cli.output(`Starting GCP operations for: ${this.getEntityName()}`);
    }

    /**
     * Standard stop implementation for GCP entities
     */
    override stop(): void {
        cli.output(`Stopping GCP operations for: ${this.getEntityName()}`);
    }

    /**
     * Make a GET request to a GCP API
     */
    protected get(url: string): any {
        const response = gcp.get(url);
        return this.handleResponse(response, "GET", url);
    }

    /**
     * Make a POST request to a GCP API
     */
    protected post(url: string, body?: any): any {
        // Always pass an object to gcp.post - the runtime doesn't handle undefined well
        const options: any = {};
        if (body) {
            options.body = JSON.stringify(body);
            options.headers = { "Content-Type": "application/json" };
        }
        const response = gcp.post(url, options);
        return this.handleResponse(response, "POST", url);
    }

    /**
     * Make a PUT request to a GCP API
     */
    protected put(url: string, body?: any): any {
        // Always pass an object to gcp.put - the runtime doesn't handle undefined well
        const options: any = {};
        if (body) {
            options.body = JSON.stringify(body);
            options.headers = { "Content-Type": "application/json" };
        }
        const response = gcp.put(url, options);
        return this.handleResponse(response, "PUT", url);
    }

    /**
     * Make a DELETE request to a GCP API
     */
    protected httpDelete(url: string): any {
        const response = gcp.delete(url);
        return this.handleResponse(response, "DELETE", url);
    }

    /**
     * Make a PATCH request to a GCP API
     */
    protected patch(url: string, body?: any): any {
        const options: any = { method: "PATCH" };
        if (body) {
            options.body = JSON.stringify(body);
            options.headers = { "Content-Type": "application/json" };
        }
        const response = gcp.do(url, options);
        return this.handleResponse(response, "PATCH", url);
    }

    /**
     * Handle HTTP response, parsing JSON and throwing on errors
     */
    protected handleResponse(response: GcpHttpResponse, method: string, url: string): any {
        if (response.error) {
            const errorMsg = parseGcpError(response);
            throw new Error(`GCP ${method} request to ${url} failed: ${errorMsg}`);
        }

        if (response.statusCode >= 400) {
            // Try to parse error details from JSON body
            let errorDetail = response.body;
            try {
                const errorJson = JSON.parse(response.body);
                if (errorJson.error) {
                    const e = errorJson.error;
                    errorDetail = e.message || e.status || response.body;
                    if (e.details && Array.isArray(e.details)) {
                        const detailMsgs = e.details.map((d: any) => d.reason || d["@type"] || JSON.stringify(d)).join(", ");
                        errorDetail += ` [${detailMsgs}]`;
                    }
                }
            } catch {
                // Use raw body if not JSON
            }
            throw new Error(`GCP ${method} request to ${url} failed with status ${response.statusCode}: ${errorDetail}`);
        }

        if (!response.body || response.body === "") {
            return {};
        }

        try {
            return JSON.parse(response.body);
        } catch {
            return { raw: response.body };
        }
    }

    /**
     * Check if a resource exists by making a GET request (returns null if not found)
     */
    protected checkResourceExists(url: string): any | null {
        try {
            const response = gcp.get(url);
            if (response.error || response.statusCode === 404) {
                return null;
            }
            if (response.statusCode >= 400) {
                return null;
            }
            return response.body ? JSON.parse(response.body) : null;
        } catch {
            return null;
        }
    }

    /**
     * Wait for a long-running operation to complete
     */
    protected waitForOperation(
        operationUrl: string,
        maxAttempts: number = 60,
        delayMs: number = 5000
    ): any {
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const response = gcp.get(operationUrl);
                if (response.error) {
                    throw new Error(parseGcpError(response));
                }

                const operation = JSON.parse(response.body);

                if (isOperationDone(operation)) {
                    cli.output(`Operation completed successfully`);
                    return operation;
                }

                if (isOperationFailed(operation)) {
                    const errorMsg = operation.error?.message || "Unknown error";
                    throw new Error(`Operation failed: ${errorMsg}`);
                }

                const statusInfo = operation.status || (operation.done === false ? "in progress" : "unknown");
                cli.output(`Waiting for operation to complete... (${statusInfo})`);
            } catch (error) {
                if (error instanceof Error && error.message.includes("Operation failed")) {
                    throw error;
                }
                // Continue waiting on other errors
            }

            attempts++;
            if (attempts < maxAttempts) {
                // Simple delay using busy wait (Goja doesn't have setTimeout)
                const start = Date.now();
                while (Date.now() - start < delayMs) {
                    // Busy wait
                }
            }
        }

        throw new Error(`Operation did not complete within ${maxAttempts * delayMs / 1000} seconds`);
    }

    /**
     * Delete a resource, respecting the existing flag
     */
    protected deleteResource(url: string, resourceName: string): void {
        if (this.state.existing) {
            cli.output(`${resourceName} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            this.httpDelete(url);
            cli.output(`Successfully deleted ${resourceName}`);
        } catch (error) {
            throw new Error(`Failed to delete ${resourceName}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}
