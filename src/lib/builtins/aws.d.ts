/**
 * AWS module for AWS-authenticated HTTP operations (provided by Goja runtime)
 */
declare module "cloud/aws" {
  /**
   * AWS request options interface
   */
  interface AWSRequestOptions {
    method: string;
    service?: string;
    region?: string;
    expire?: string | number;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }

  /**
   * AWS presigned URL result interface
   */
  interface PresignResult {
    url: string;
    headers: Record<string, string[]>;
  }

  /**
   * HTTP response interface (same as http module)
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
   * AWS HTTP client interface with AWS signing capabilities
   */
  interface AWSModule {
    /**
     * Performs an HTTP GET request with AWS signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    get(url: string, options?: Partial<AWSRequestOptions>): HTTPResponse;

    /**
     * Performs an HTTP POST request with AWS signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    post(url: string, options?: Partial<AWSRequestOptions>): HTTPResponse;

    /**
     * Performs an HTTP PUT request with AWS signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    put(url: string, options?: Partial<AWSRequestOptions>): HTTPResponse;

    /**
     * Performs an HTTP DELETE request with AWS signing
     * @param url - The URL to request
     * @param options - Optional request options
     * @returns HTTP response
     */
    delete(url: string, options?: Partial<AWSRequestOptions>): HTTPResponse;

    /**
     * Performs an HTTP request with AWS signing using custom method
     * @param url - The URL to request
     * @param options - Request options including method
     * @returns HTTP response
     */
    do(url: string, options: AWSRequestOptions): HTTPResponse;

    /**
     * Creates a presigned URL for AWS requests
     * @param url - The URL to presign
     * @param options - Presign options (method, service, region, expire are required)
     * @returns Presigned URL and headers
     */
    presign(
      url: string,
      options: AWSRequestOptions & {
        method: string;
        service: string;
        region: string;
        expire: string | number;
      },
    ): PresignResult;
  }

  const aws: AWSModule;
  export default aws;
}
