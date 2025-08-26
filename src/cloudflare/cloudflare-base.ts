import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import secret from "secret";

/**
 * Cloudflare shared definition
 */
export interface CloudflareEntityDefinition {
  /**
   * @description Optional secret reference for API token; falls back to provider default
   */
  secret_ref?: string;
}

/**
 * Cloudflare shared state
 */
export interface CloudflareEntityState {
  /**
   * @description Resource existed before this entity created it
   */
  existing?: boolean;
}

export abstract class CloudflareEntity<
  D extends CloudflareEntityDefinition,
  S extends CloudflareEntityState
> extends MonkEntity<D, S> {
  protected apiToken!: string;
  protected http!: HttpClient;

  protected override before(): void {
    const secretRef = this.definition.secret_ref || "cloudflare-api-token";
    const token = secret.get(secretRef);
    if (!token) {
      throw new Error(`Missing Cloudflare API token in secret: ${secretRef}`);
    }
    this.apiToken = token;

    this.http = new HttpClient({
      baseUrl: "https://api.cloudflare.com/client/v4",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      parseJson: true,
      stringifyJson: true,
      timeout: 15000,
    });
  }

  protected request<T = any>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: any
  ): T {
    const res = this.http.request<T>(method, path, { body });
    if (!res.ok) {
      throw new Error(
        `Cloudflare API error: ${res.statusCode} ${res.status} - ${typeof res.data === "string" ? res.data : JSON.stringify(res.data)}`
      );
    }
    return res.data as T;
  }
}


