import { MonkEntity } from "monkec/base";
export { action } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import secret from "secret";

export interface WorkOSEntityDefinition {
    /**
     * @description Secret name storing WorkOS API key (sk_test_... or sk_production_...)
     * @minLength 1
     * @maxLength 64
     */
    secret_ref: string;
}

export interface WorkOSEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

export abstract class WorkOSEntity<D extends WorkOSEntityDefinition, S extends WorkOSEntityState> extends MonkEntity<D, S> {
    protected apiKey!: string;
    protected httpClient!: HttpClient;
    protected readonly baseUrl = "https://api.workos.com";

    static readonly readiness = { period: 10, initialDelay: 1, attempts: 12 };

    protected override before(): void {
        const key = secret.get(this.definition.secret_ref);
        if (!key) {
            throw new Error(`Failed to retrieve WorkOS API key from secret: ${this.definition.secret_ref}`);
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
                throw new Error(`WorkOS API error: ${response.statusCode} ${response.status} - ${JSON.stringify(response.data)}`);
            }
            return response.data;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`WorkOS ${method} ${path} failed: ${msg}`);
        }
    }

    protected deriveMode(): "test" | "production" {
        if (this.apiKey.startsWith("sk_test_")) return "test";
        if (this.apiKey.startsWith("sk_production_")) return "production";
        return this.apiKey.includes("test") ? "test" : "production";
    }
}
