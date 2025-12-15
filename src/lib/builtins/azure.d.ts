/**
 * Azure module for authenticated HTTP operations (provided by Goja runtime)
 */
declare module "cloud/azure" {
  /**
   * Request options accepted by `cloud/azure`.
   *
   * Notes:
   * - `timeout` is in seconds.
   * - `method` is required for `do()`, optional/ignored for the convenience helpers (`get/post/put/delete`).
   */
  interface AzureRequestOptions {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }

  /**
   * HTTP response returned by Azure requests.
   */
  interface AzureHTTPResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    contentLength: number;
    error?: string;
  }

  interface AzureModule {
    /**
     * Perform an HTTP GET request (authenticated via Azure credentials).
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    get(url: string, options?: Partial<AzureRequestOptions>): AzureHTTPResponse;
    /**
     * Perform an HTTP POST request (authenticated via Azure credentials).
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    post(
      url: string,
      options?: Partial<AzureRequestOptions>
    ): AzureHTTPResponse;
    /**
     * Perform an HTTP PUT request (authenticated via Azure credentials).
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    put(url: string, options?: Partial<AzureRequestOptions>): AzureHTTPResponse;
    /**
     * Perform an HTTP DELETE request (authenticated via Azure credentials).
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    delete(
      url: string,
      options?: Partial<AzureRequestOptions>
    ): AzureHTTPResponse;
    /**
     * Perform an HTTP request with explicit method (authenticated via Azure credentials).
     * @param url - The URL to request
     * @param options - Request options, including HTTP method
     * @returns HTTP response
     */
    do(url: string, options: AzureRequestOptions): AzureHTTPResponse;

    /**
     * Returns the active Azure subscription id from loaded credentials.
     * @returns The Azure subscription id
     */
    getSubscription(): string;
    /**
     * Returns the active Azure resource group name from loaded credentials.
     * @returns The Azure resource group name
     */
    getResourceGroup(): string;
    /**
     * Returns the active Azure tenant id from loaded credentials.
     * @returns The Azure tenant id
     */
    getTenant(): string;
  }

  const azure: AzureModule;
  export default azure;
}
