/**
 * Azure module for authenticated HTTP operations (provided by Goja runtime)
 */
declare module "cloud/azure" {
  interface AzureRequestOptions {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }

  interface AzureHTTPResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    contentLength: number;
    error?: string;
  }

  interface AzureModule {
    get(url: string, options?: Partial<AzureRequestOptions>): AzureHTTPResponse;
    post(url: string, options?: Partial<AzureRequestOptions>): AzureHTTPResponse;
    put(url: string, options?: Partial<AzureRequestOptions>): AzureHTTPResponse;
    delete(url: string, options?: Partial<AzureRequestOptions>): AzureHTTPResponse;
    do(url: string, options: AzureRequestOptions): AzureHTTPResponse;
  }

  const azure: AzureModule;
  export default azure;
}


