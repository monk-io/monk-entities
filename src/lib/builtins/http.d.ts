/**
 * HTTP module for making HTTP requests (provided by Goja runtime)
 */
declare module "http" {
  /**
   * HTTP request configuration
   */
  interface HttpRequest {
    /** HTTP method (GET, POST, etc.) */
    method?: string;
    /** Request headers */
    headers?: Record<string, string>;
    /** Request body */
    body?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
  }

  /**
   * HTTP response object
   */
  export interface HttpResponse {
    /** Status text */
    status: string;
    /** HTTP status code */
    statusCode: number;
    /** Response headers */
    headers: Record<string, string>;
    /** Response body */
    body: string;
    /** Content length in bytes */
    contentLength: number;
    /** Error message if request failed */
    error?: string;
  }

  /**
   * HTTP module interface providing HTTP request methods
   */
  interface HttpModule {
    /**
     * Performs a GET request
     * @param url - The URL to request
     * @param options - Optional request configuration
     * @returns The HTTP response
     */
    get(url: string, options?: HttpRequest): HttpResponse;

    /**
     * Performs a POST request
     * @param url - The URL to request
     * @param options - Request configuration
     * @returns The HTTP response
     */
    post(url: string, options: HttpRequest): HttpResponse;

    /**
     * Performs a PUT request
     * @param url - The URL to request
     * @param options - Request configuration
     * @returns The HTTP response
     */
    put(url: string, options: HttpRequest): HttpResponse;

    /**
     * Performs a DELETE request
     * @param url - The URL to request
     * @param options - Request configuration
     * @returns The HTTP response
     */
    delete(url: string, options: HttpRequest): HttpResponse;

    /**
     * Performs a custom HTTP request
     * @param url - The URL to request
     * @param options - Request configuration
     * @returns The HTTP response
     */
    do(url: string, options: HttpRequest): HttpResponse;
  }

  const http: HttpModule;
  export default http;
}
