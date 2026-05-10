import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import secret from "secret";

/**
 * Resend shared definition.
 */
export interface ResendEntityDefinition {
  /**
   * @description Optional secret reference for the Resend API key; defaults to `resend-api-token`
   */
  secret_ref?: string;
}

/**
 * Resend shared state.
 */
export interface ResendEntityState {
  /**
   * @description Resource existed before this entity created it
   */
  existing?: boolean;
}

export abstract class ResendEntity<
  D extends ResendEntityDefinition,
  S extends ResendEntityState
> extends MonkEntity<D, S> {
  protected apiKey!: string;
  protected http!: HttpClient;

  protected override before(): void {
    const secretRef = this.definition.secret_ref || "resend-api-token";
    const token = secret.get(secretRef);
    if (!token) {
      throw new Error(`Missing Resend API token in secret: ${secretRef}`);
    }
    this.apiKey = token;

    this.http = new HttpClient({
      baseUrl: "https://api.resend.com",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
        `Resend API error: ${res.statusCode} ${res.status} - ${
          typeof res.data === "string" ? res.data : JSON.stringify(res.data)
        }`
      );
    }
    return res.data as T;
  }
}
