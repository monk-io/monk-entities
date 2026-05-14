/**
 * Hetzner module for authenticated HTTP operations (provided by Goja runtime)
 */
declare module "cloud/hetzner" {
  /**
   * Request options accepted by `cloud/hetzner`.
   *
   * Notes:
   * - `timeout` is in seconds.
   * - For convenience helpers (`get/post/put/delete`) you may pass additional fields (like `token`) which are forwarded
   *   to the underlying Goja HTTP implementation as "extra" fields.
   */
  interface HetznerRequestOptions {
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
   * HTTP response returned by Hetzner requests.
   */
  interface HetznerHTTPResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    contentLength: number;
    error?: string;
  }

  interface HetznerModule {
    /**
     * Perform an HTTP GET request (authenticated via Hetzner token).
     *
     * The URL may be absolute (`https://dns.hetzner.com/...`) or a path (`/v1/...`).
     * Paths are resolved against `https://api.hetzner.cloud`; full URLs keep their host.
     * @param url - The URL (absolute) or path (relative to `https://api.hetzner.cloud`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    get(url: string, options?: Partial<HetznerRequestOptions>): HetznerHTTPResponse;
    /**
     * Perform an HTTP POST request (authenticated via Hetzner token).
     * @param url - The URL (absolute) or path (relative to `https://api.hetzner.cloud`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    post(url: string, options?: Partial<HetznerRequestOptions>): HetznerHTTPResponse;
    /**
     * Perform an HTTP PUT request (authenticated via Hetzner token).
     * @param url - The URL (absolute) or path (relative to `https://api.hetzner.cloud`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    put(url: string, options?: Partial<HetznerRequestOptions>): HetznerHTTPResponse;
    /**
     * Perform an HTTP DELETE request (authenticated via Hetzner token).
     * @param url - The URL (absolute) or path (relative to `https://api.hetzner.cloud`)
     * @param options - Optional request options (may include `token` override)
     * @returns HTTP response
     */
    delete(url: string, options?: Partial<HetznerRequestOptions>): HetznerHTTPResponse;
    /**
     * Perform an HTTP request with explicit method (authenticated via Hetzner token).
     * @param url - The URL (absolute) or path (relative to `https://api.hetzner.cloud`)
     * @param options - Request options, including HTTP method (may include `token` override)
     * @returns HTTP response
     */
    do(url: string, options: HetznerRequestOptions): HetznerHTTPResponse;
  }

  const hetzner: HetznerModule;
  export default hetzner;
}
