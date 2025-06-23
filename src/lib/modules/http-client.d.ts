export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface HttpClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
  parseJson?: boolean;
  stringifyJson?: boolean;
}

export interface HttpClientRequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  body?: any;
  query?: Record<string, string>;
}

export interface HttpClientResponse<T = any> {
  statusCode: number;
  status: string;
  headers: Record<string, string>;
  data: T;
  raw: string;
  contentLength: number;
  ok: boolean;
}

export class HttpClient {
  constructor(options?: HttpClientOptions);
  get<T = any>(url: string, options?: HttpClientRequestOptions): HttpClientResponse<T>;
  post<T = any>(url: string, options?: HttpClientRequestOptions): HttpClientResponse<T>;
  put<T = any>(url: string, options?: HttpClientRequestOptions): HttpClientResponse<T>;
  patch<T = any>(url: string, options?: HttpClientRequestOptions): HttpClientResponse<T>;
  delete<T = any>(url: string, options?: HttpClientRequestOptions): HttpClientResponse<T>;
  request<T = any>(method: HttpMethod, url: string, options?: HttpClientRequestOptions): HttpClientResponse<T>;
} 