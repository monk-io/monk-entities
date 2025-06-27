import http, { HttpResponse } from "http";

/**
 * Supported HTTP methods
 */
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

/**
 * Configuration options for the HTTP client
 */
export interface HttpClientOptions {
  /** Base URL for all requests */
  baseUrl?: string;
  /** Default headers to include with all requests */
  headers?: Record<string, string>;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Whether to automatically parse JSON responses (default: true) */
  parseJson?: boolean;
  /** Whether to automatically stringify JSON requests (default: true) */
  stringifyJson?: boolean;
}

/**
 * HTTP client request options
 */
export interface HttpClientRequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Request body (will be JSON stringified if object and stringifyJson is true) */
  body?: any;
  /** Query parameters to append to URL */
  query?: Record<string, string>;
}

/**
 * HTTP client response object
 */
export interface HttpClientResponse<T = any> {
  /** HTTP status code */
  statusCode: number;
  /** Status text */
  status: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body (parsed as JSON if parseJson is true and content-type is JSON) */
  data: T;
  /** Raw response body */
  raw: string;
  /** Content length in bytes */
  contentLength: number;
  /** Whether the request was successful (status 200-299) */
  ok: boolean;
}

/**
 * A pleasant HTTP client that wraps the builtin http module
 *
 * @example
 * ```typescript
 * const client = new HttpClient({
 *   baseUrl: "https://api.example.com",
 *   timeout: 5000,
 *   headers: { "User-Agent": "MyApp/1.0" }
 * });
 *
 * const response = client.get("/users");
 * console.log(response.data);
 * ```
 */
export class HttpClient {
  private options: Required<HttpClientOptions>;

  /**
   * Create a new HTTP client with the specified options
   * @param options - Configuration options for the HTTP client
   * @throws {Error} When configuration options are invalid
   */
  constructor(options: HttpClientOptions = {}) {
    // Validate configuration options
    if (options.baseUrl && !this.isValidUrl(options.baseUrl)) {
      throw new Error(
        `Invalid baseUrl format: "${options.baseUrl}". Must be a valid URL or empty string.`
      );
    }

    if (options.timeout !== undefined && options.timeout <= 0) {
      throw new Error(
        `Invalid timeout: ${options.timeout}. Must be a positive number in milliseconds.`
      );
    }

    if (options.timeout !== undefined && options.timeout > 300000) {
      // 5 minutes max
      throw new Error(
        `Timeout too large: ${options.timeout}ms. Maximum allowed is 300000ms (5 minutes).`
      );
    }

    if (options.headers) {
      for (const [key, _value] of Object.entries(options.headers)) {
        if (key.trim() === "") {
          throw new Error("Header keys cannot be empty or whitespace only");
        }
      }
    }

    this.options = {
      baseUrl: options.baseUrl || "",
      headers: options.headers || {},
      timeout: options.timeout || 30000,
      parseJson: options.parseJson !== false,
      stringifyJson: options.stringifyJson !== false,
    };

    // Set default JSON headers if not provided
    if (this.options.stringifyJson && !this.options.headers["Content-Type"]) {
      this.options.headers["Content-Type"] = "application/json";
    }
    if (this.options.parseJson && !this.options.headers["Accept"]) {
      this.options.headers["Accept"] = "application/json";
    }
  }

  /**
   * Perform a GET request
   * @param url - The URL to request (relative to baseUrl if configured)
   * @param options - Additional request options
   * @returns HTTP response with parsed data
   * @throws {Error} When URL is invalid, request configuration is malformed, network request fails, or response parsing fails
   */
  get<T = any>(
    url: string,
    options: HttpClientRequestOptions = {}
  ): HttpClientResponse<T> {
    return this.request<T>("GET", url, options);
  }

  /**
   * Perform a POST request
   * @param url - The URL to request (relative to baseUrl if configured)
   * @param options - Additional request options including body data
   * @returns HTTP response with parsed data
   * @throws {Error} When URL is invalid, request configuration is malformed, body serialization fails, network request fails, or response parsing fails
   */
  post<T = any>(
    url: string,
    options: HttpClientRequestOptions = {}
  ): HttpClientResponse<T> {
    return this.request<T>("POST", url, options);
  }

  /**
   * Perform a PUT request
   * @param url - The URL to request (relative to baseUrl if configured)
   * @param options - Additional request options including body data
   * @returns HTTP response with parsed data
   * @throws {Error} When URL is invalid, request configuration is malformed, body serialization fails, network request fails, or response parsing fails
   */
  put<T = any>(
    url: string,
    options: HttpClientRequestOptions = {}
  ): HttpClientResponse<T> {
    return this.request<T>("PUT", url, options);
  }

  /**
   * Perform a PATCH request (polyfilled using the builtin http.do method)
   * @param url - The URL to request (relative to baseUrl if configured)
   * @param options - Additional request options including body data
   * @returns HTTP response with parsed data
   * @throws {Error} When URL is invalid, request configuration is malformed, body serialization fails, network request fails, or response parsing fails
   */
  patch<T = any>(
    url: string,
    options: HttpClientRequestOptions = {}
  ): HttpClientResponse<T> {
    return this.request<T>("PATCH", url, options);
  }

  /**
   * Perform a DELETE request
   * @param url - The URL to request (relative to baseUrl if configured)
   * @param options - Additional request options
   * @returns HTTP response with parsed data
   * @throws {Error} When URL is invalid, request configuration is malformed, network request fails, or response parsing fails
   */
  delete<T = any>(
    url: string,
    options: HttpClientRequestOptions = {}
  ): HttpClientResponse<T> {
    return this.request<T>("DELETE", url, options);
  }

  /**
   * Perform a custom HTTP request
   * @param method - HTTP method (GET, POST, PUT, PATCH, DELETE, etc.)
   * @param url - The URL to request (relative to baseUrl if configured)
   * @param options - Additional request options
   * @returns HTTP response with parsed data
   * @throws {Error} When method is invalid, URL is invalid, request configuration is malformed, body serialization fails, network request fails, or response parsing fails
   */
  request<T = any>(
    method: HttpMethod,
    url: string,
    options: HttpClientRequestOptions = {}
  ): HttpClientResponse<T> {
    // Validate URL
    if (!url || url.trim() === "") {
      throw new Error("URL is required and must be a non-empty string");
    }

    const trimmedUrl = url.trim();
    if (trimmedUrl.length > 2048) {
      throw new Error(
        `URL too long: ${trimmedUrl.length} characters. Maximum allowed is 2048 characters.`
      );
    }

    // Validate request options
    this.validateRequestOptions(options);

    const normalizedMethod = method.toUpperCase() as HttpMethod;

    let fullUrl: string;
    let headers: Record<string, string>;
    let body: string | undefined;

    try {
      // Build the full URL
      fullUrl = this.buildUrl(trimmedUrl, options.query);

      // Merge headers
      headers = {
        ...this.options.headers,
        ...options.headers,
      };

      // Remove Content-Type for GET and DELETE requests with no body
      if ((normalizedMethod === "GET" || normalizedMethod === "DELETE") && !options.body && headers["Content-Type"]) {
        delete headers["Content-Type"];
      }

      // Prepare the body - skip for DELETE requests unless explicitly provided
      if (normalizedMethod === "DELETE" && !options.body) {
        body = undefined;
      } else {
        body = this.prepareBody(options.body);
      }
    } catch (error) {
      throw new Error(
        `Failed to prepare ${normalizedMethod} request to "${trimmedUrl}": ${
          error instanceof Error ? error.message : "Unknown preparation error"
        }`
      );
    }

    // Build the request
    const request = {
      method: normalizedMethod,
      headers,
      body,
      timeout: options.timeout || this.options.timeout,
    };

    // Make the request using the appropriate builtin method
    let response: HttpResponse;
    try {
      if (normalizedMethod === "GET") {
        response = http.get(fullUrl, request);
      } else if (normalizedMethod === "POST") {
        response = http.post(fullUrl, request);
      } else if (normalizedMethod === "PUT") {
        response = http.put(fullUrl, request);
      } else if (normalizedMethod === "DELETE") {
        response = http.delete(fullUrl, request);
      } else {
        // Use http.do for other methods like PATCH
        response = http.do(fullUrl, request);
      }
    } catch (error) {
      throw new Error(
        `${normalizedMethod} request to "${fullUrl}" failed during execution: ${
          error instanceof Error ? error.message : "Unknown network error"
        }`
      );
    }

    // Check for errors
    if (response.error) {
      throw new Error(
        `${normalizedMethod} request to "${fullUrl}" failed: ${response.error}. ` +
          response.body
      );
    }

    // Parse the response
    try {
      return this.parseResponse<T>(response);
    } catch (error) {
      throw new Error(
        `${normalizedMethod} request to "${fullUrl}" succeeded but response parsing failed: ${
          error instanceof Error ? error.message : "Unknown parsing error"
        }`
      );
    }
  }

  /**
   * Build the full URL with base URL and query parameters
   * @throws {Error} When URL construction fails or results in invalid URL
   */
  private buildUrl(url: string, query?: Record<string, string>): string {
    let fullUrl = url;

    // Add base URL if provided and URL is relative
    if (this.options.baseUrl && !url.startsWith("http")) {
      const baseUrl = this.options.baseUrl.endsWith("/")
        ? this.options.baseUrl.slice(0, -1)
        : this.options.baseUrl;
      const path = url.startsWith("/") ? url : `/${url}`;
      fullUrl = `${baseUrl}${path}`;
    }

    // Add query parameters
    if (query && Object.keys(query).length > 0) {
      try {
        const queryParts = Object.entries(query)
          .map(
            ([key, value]) =>
              `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
          )
          .join("&");
        fullUrl += (fullUrl.includes("?") ? "&" : "?") + queryParts;
      } catch (error) {
        throw new Error(
          `Failed to build query string: ${
            error instanceof Error ? error.message : "Invalid query parameters"
          }`
        );
      }
    }

    // Final URL validation
    if (fullUrl.length > 2048) {
      throw new Error(
        `Final URL too long: ${fullUrl.length} characters (maximum: 2048)`
      );
    }

    return fullUrl;
  }

  /**
   * Parse the HTTP response into our format
   * @throws {Error} When response parsing fails
   */
  private parseResponse<T>(response: any): HttpClientResponse<T> {
    if (!response || typeof response !== "object") {
      throw new Error("Invalid response object received from HTTP request");
    }

    let data: T = response.body as T;

    // Try to parse JSON if enabled and appropriate
    if (this.options.parseJson && response.body) {
      const contentType =
        response.headers?.["content-type"] ||
        response.headers?.["Content-Type"] ||
        "";

      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(response.body);
        } catch (error) {
          // If JSON parsing fails, keep the raw body but provide context
          console.warn(
            `Failed to parse JSON response (Content-Type: ${contentType}): ${
              error instanceof Error
                ? error.message
                : "Unknown JSON parse error"
            }`
          );
        }
      }
    }

    return {
      statusCode: response.statusCode || 0,
      status: response.status || "Unknown",
      headers: response.headers || {},
      data,
      raw: response.body || "",
      contentLength: response.contentLength || 0,
      ok: (response.statusCode || 0) >= 200 && (response.statusCode || 0) < 300,
    };
  }

  /**
   * Validate request options
   * @throws {Error} When request options are invalid
   */
  private validateRequestOptions(options: HttpClientRequestOptions): void {
    if (options.timeout !== undefined && options.timeout <= 0) {
      throw new Error(
        `Invalid request timeout: ${options.timeout}. Must be a positive number in milliseconds.`
      );
    }

    if (options.timeout !== undefined && options.timeout > 300000) {
      // 5 minutes max
      throw new Error(
        `Request timeout too large: ${options.timeout}ms. Maximum allowed is 300000ms (5 minutes).`
      );
    }

    if (options.headers) {
      for (const [key] of Object.entries(options.headers)) {
        if (key.trim() === "") {
          throw new Error(
            "Request header keys cannot be empty or whitespace only"
          );
        }
      }
    }

    if (options.query) {
      for (const [key] of Object.entries(options.query)) {
        if (key.trim() === "") {
          throw new Error(
            "Query parameter keys cannot be empty or whitespace only"
          );
        }
      }
    }
  }

  /**
   * Prepare request body for sending
   * @throws {Error} When body serialization fails
   */
  private prepareBody(body: any): string | undefined {
    if (body === undefined || body === null) {
      return undefined;
    }

    if (typeof body === "string") {
      return body;
    }

    if (this.options.stringifyJson && typeof body === "object") {
      try {
        return JSON.stringify(body);
      } catch (error) {
        throw new Error(
          `Failed to JSON stringify request body: ${
            error instanceof Error ? error.message : "Invalid JSON data"
          }`
        );
      }
    }

    // Convert non-string, non-object values to string
    try {
      return String(body);
    } catch (error) {
      throw new Error(
        `Failed to convert request body to string: ${
          error instanceof Error ? error.message : "Unknown conversion error"
        }`
      );
    }
  }

  /**
   * Check if a string is a valid URL format
   */
  private isValidUrl(urlString: string): boolean {
    if (!urlString || urlString.trim() === "") {
      return true; // Empty string is valid (means no base URL)
    }

    // Basic URL validation - must start with http:// or https://
    const urlPattern = /^https?:\/\/.+/;
    return urlPattern.test(urlString.trim());
  }
} 