/**
 * GCP module for GCP-authenticated HTTP operations (provided by Goja runtime)
 */
declare module "cloud/gcp" {
  /**
   * HTTP response interface
   */
  interface HTTPResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    contentLength: number;
    error?: string;
  }

  /**
   * Request options interface
   */
  interface GCPRequestOptions {
    body?: string;
    headers?: Record<string, string>;
    timeout?: number;
  }

  interface GCPDoRequestOptions extends GCPRequestOptions {
    method: string;
  }

  /**
   * GCP HTTP client interface with OAuth2 signing capabilities
   */
  interface GCPModule {
    /**
     * Gets the current GCP project ID from environment/credentials
     * @returns The GCP project ID
     */
    getProject(): string;

    /**
     * Performs an HTTP GET request with GCP OAuth2 signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    get(url: string, options?: GCPRequestOptions): HTTPResponse;

    /**
     * Performs an HTTP POST request with GCP OAuth2 signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    post(url: string, options?: GCPRequestOptions): HTTPResponse;

    /**
     * Performs an HTTP PUT request with GCP OAuth2 signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    put(url: string, options?: GCPRequestOptions): HTTPResponse;

    /**
     * Performs an HTTP DELETE request with GCP OAuth2 signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    delete(url: string, options?: GCPRequestOptions): HTTPResponse;

    /**
     * Performs an HTTP request with GCP OAuth2 signing
     * @param url - The URL to request
     * @param options - Request options, including HTTP method
     * @returns HTTP response
     */
    do(url: string, options: GCPDoRequestOptions): HTTPResponse;
  }

  const gcp: GCPModule;
  export default gcp;
}
