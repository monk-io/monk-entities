import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import secret from "secret";

export interface StripeEntityDefinition {
    /**
     * @description Secret name storing Stripe secret API key (sk_test_... or sk_live_...)
     * @minLength 1
     * @maxLength 64
     */
    secret_ref: string;
}

export interface StripeEntityState {
    /**
     * @description Indicates if the resource already existed before this entity managed it
     */
    existing?: boolean;
}

export abstract class StripeEntity<D extends StripeEntityDefinition, S extends StripeEntityState> extends MonkEntity<D, S> {
    protected apiKey!: string;
    protected httpClient!: HttpClient;
    protected readonly baseUrl = "https://api.stripe.com/v1";

    static readonly readiness = { period: 10, initialDelay: 1, attempts: 12 };

    protected override before(): void {
        const key = secret.get(this.definition.secret_ref);
        if (!key) {
            throw new Error(`Failed to retrieve Stripe API key from secret: ${this.definition.secret_ref}`);
        }
        this.apiKey = key;

        this.httpClient = new HttpClient({
            baseUrl: this.baseUrl,
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Accept": "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            parseJson: true,
            stringifyJson: false,
        });
    }

    protected makeRequest(method: string, path: string, formBody?: Record<string, string>): any {
        try {
            const body = formBody ? this.encodeForm(formBody) : undefined;
            const response = this.httpClient.request(method as any, path, body ? { body } : {});
            if (!response.ok) {
                throw new Error(`Stripe API error: ${response.statusCode} ${response.status} - ${response.data}`);
            }
            return response.data;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Stripe ${method} ${path} failed: ${msg}`);
        }
    }

    protected encodeForm(data: Record<string, string>): string {
        const pairs: string[] = [];
        for (const [k, v] of Object.entries(data)) {
            if (v === undefined || v === null) continue;
            pairs.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
        }
        return pairs.join("&");
    }

    protected deriveMode(): "test" | "live" {
        if (this.apiKey.startsWith("sk_test_")) return "test";
        if (this.apiKey.startsWith("sk_live_")) return "live";
        return this.apiKey.includes("test") ? "test" : "live";
    }
}


