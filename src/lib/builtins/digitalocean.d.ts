/**
 * DigitalOcean module for authenticated HTTP operations (provided by Goja runtime)
 */
declare module "cloud/digitalocean" {
  interface DORequestOptions {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }

  interface DOHTTPResponse {
    status: string;
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    contentLength: number;
    error?: string;
  }

  interface DOModule {
    get(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    post(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    put(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    delete(url: string, options?: Partial<DORequestOptions>): DOHTTPResponse;
    do(url: string, options: DORequestOptions): DOHTTPResponse;
  }

  const digitalocean: DOModule;
  export default digitalocean;
}


