import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import { getApiToken, BASE_URL, DigitalOceanApiError } from "./common.ts";
import cli from "cli";

/**
 * Base definition interface for all DigitalOcean entities
 */
export interface DigitalOceanEntityDefinition {
  /**
   * @description Secret Reference for DigitalOcean API authentication
   * @minLength 1
   * @maxLength 24
   */
  secret_ref: string;
}

/**
 * Base state interface for all DigitalOcean entities
 */
export interface DigitalOceanEntityState {
  /**
   * @description Indicates if the resource already existed before this entity managed it
   */
  existing?: boolean;
}

/**
 * Base class for all DigitalOcean entities.
 * Provides common functionality like authentication, HTTP client setup, and error handling.
 */
export abstract class DigitalOceanEntity<
  D extends DigitalOceanEntityDefinition,
  S extends DigitalOceanEntityState
> extends MonkEntity<D, S> {
  /**
   * API token for DigitalOcean API access
   */
  protected apiToken!: string;

  /**
   * HTTP client configured for DigitalOcean API
   */
  protected httpClient!: HttpClient;

  /**
   * Readiness check configuration
   */
  static readonly readiness = { period: 15, initialDelay: 5, attempts: 60 };

  /**
   * Initialize authentication and HTTP client before any operations
   */
  protected override before(): void {
    this.apiToken = getApiToken(this.definition.secret_ref);
    if (!this.apiToken) {
      throw new Error(
        `Failed to retrieve API token from secret: ${this.definition.secret_ref}`
      );
    }

    this.httpClient = new HttpClient({
      baseUrl: BASE_URL,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      parseJson: true,
      stringifyJson: true,
    });
  }

  /**
   * Standard start implementation for DigitalOcean entities
   */
  override start(): void {
    cli.output(`Starting DigitalOcean operations for: ${this.getEntityName()}`);
  }

  /**
   * Standard stop implementation for DigitalOcean entities
   */
  override stop(): void {
    cli.output(`Stopping DigitalOcean operations for: ${this.getEntityName()}`);
    // DigitalOcean resources don't need explicit stopping - they remain active
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
      const fullUrl = `${BASE_URL}${path}`;
      cli.output(`🔧 Making ${method} request to: ${fullUrl}`);

      if (body) {
        cli.output(`📦 Request body: ${JSON.stringify(body, null, 2)}`);
      }

      const response = this.httpClient.request(method as any, path, {
        body,
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
      });

      cli.output(`📡 Response status: ${response.statusCode}`);

      if (!response.ok) {
        let errorMessage = `DigitalOcean API error: ${response.statusCode} ${response.status}`;

        // Try to parse error details
        try {
          let errorData = response.data;
          if (typeof errorData === "string") {
            errorData = JSON.parse(errorData);
          }

          if (errorData.errors && Array.isArray(errorData.errors)) {
            const errors = errorData.errors as DigitalOceanApiError[];
            errorMessage += ` - ${errors.map((e) => e.message).join(", ")}`;
          } else if (errorData.message) {
            errorMessage += ` - ${errorData.message}`;
          }
        } catch (parseError) {
          errorMessage += ` - Raw: ${response.data}`;
        }

        cli.output(`❌ Error response: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // Handle JSON parsing issue in Goja runtime
      let responseData = response.data;
      if (typeof responseData === "string") {
        try {
          responseData = JSON.parse(responseData);
        } catch (e) {
          // If parsing fails, return the string as-is
        }
      }

      return responseData;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `DigitalOcean ${method} request to ${path} failed: ${error.message}`
        );
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
      if (
        error instanceof Error &&
        (error.message.includes("404") ||
          error.message.includes("not found") ||
          error.message.includes("not_found"))
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Helper method to handle resource deletion with proper existing resource checks
   */
  protected deleteResource(path: string, resourceName: string): void {
    if (this.state.existing) {
      cli.output(
        `${resourceName} wasn't created by this entity, skipping delete`
      );
      return;
    }

    try {
      this.makeRequest("DELETE", path);
      cli.output(`Successfully deleted ${resourceName}`);
    } catch (error) {
      // If resource doesn't exist, that's fine
      if (
        error instanceof Error &&
        (error.message.includes("404") ||
          error.message.includes("not found") ||
          error.message.includes("not_found"))
      ) {
        cli.output(`${resourceName} was already deleted`);
        return;
      }
      throw new Error(
        `Failed to delete ${resourceName}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }
}
