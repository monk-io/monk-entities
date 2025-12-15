/**
 * DigitalOcean module for authenticated HTTP operations (provided by Goja runtime)
 */
declare module "cloud/digitalocean" {
  /**
   * Request options accepted by `cloud/digitalocean`.
   *
   * Notes:
   * - `timeout` is in seconds.
   * - For convenience helpers (`get/post/put/delete`) you may pass additional fields (like `token`) which are forwarded
   *   to the underlying Goja HTTP implementation as "extra" fields.
   */
  interface DORequestOptions {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    /**
     * Optional request-level token override (maps to Goja HTTP "extra" fields).
     * When provided, it is used instead of provider-stored credentials.
     */
    token?: string;
  }

  /**
   * HTTP response returned by DigitalOcean requests.
   */
  interface DOHTTPResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    contentLength: number;
    error?: string;
  }

  interface DOModule {
    /**
     * Perform an HTTP GET request (authenticated via DigitalOcean token).
     *
     * The URL may be absolute (`https://api.digitalocean.com/...`) or a path (`/v2/...`).
     * @param url - The URL (absolute) or path (relative to `https://api.digitalocean.com`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    get(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    /**
     * Perform an HTTP POST request (authenticated via DigitalOcean token).
     * @param url - The URL (absolute) or path (relative to `https://api.digitalocean.com`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    post(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    /**
     * Perform an HTTP PUT request (authenticated via DigitalOcean token).
     * @param url - The URL (absolute) or path (relative to `https://api.digitalocean.com`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    put(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    /**
     * Perform an HTTP DELETE request (authenticated via DigitalOcean token).
     * @param url - The URL (absolute) or path (relative to `https://api.digitalocean.com`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    delete(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    /**
     * Perform an HTTP request with explicit method (authenticated via DigitalOcean token).
     * @param url - The URL (absolute) or path (relative to `https://api.digitalocean.com`)
     * @param options - Request options, including HTTP method (may include `token` override)
     * @returns HTTP response
     */
    do(url: string, options: DORequestOptions): DOHTTPResponse;
  }

  const digitalocean: DOModule;
  export default digitalocean;
}
