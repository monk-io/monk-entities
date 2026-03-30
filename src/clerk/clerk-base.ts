import { MonkEntity } from "monkec/base";
export { action } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import secret from "secret";

export interface ClerkEntityDefinition {
    /**
     * @description Secret name storing Clerk secret API key (sk_test_... or sk_live_...)
     * @minLength 1
     * @maxLength 64
     */
    secret_ref: string;
}

export interface ClerkEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

export abstract class ClerkEntity<D extends ClerkEntityDefinition, S extends ClerkEntityState> extends MonkEntity<D, S> {
    protected apiKey!: string;
    protected httpClient!: HttpClient;
    protected readonly baseUrl = "https://api.clerk.com/v1";

    static readonly readiness = { period: 10, initialDelay: 1, attempts: 12 };

    protected override before(): void {
        const key = secret.get(this.definition.secret_ref);
        if (!key) {
            throw new Error(`Failed to retrieve Clerk API key from secret: ${this.definition.secret_ref}`);
        }
        this.apiKey = key;

        this.httpClient = new HttpClient({
            baseUrl: this.baseUrl,
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    protected makeRequest(method: string, path: string, body?: Record<string, any>): any {
        try {
            const response = this.httpClient.request(method as any, path, body ? { body } : {});
            if (!response.ok) {
                throw new Error(`Clerk API error: ${response.statusCode} ${response.status} - ${JSON.stringify(response.data)}`);
            }
            return response.data;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Clerk ${method} ${path} failed: ${msg}`);
        }
    }

    protected deriveMode(): "test" | "live" {
        if (this.apiKey.startsWith("sk_test_")) return "test";
        if (this.apiKey.startsWith("sk_live_")) return "live";
        return this.apiKey.includes("test") ? "test" : "live";
    }
}
