import { MonkEntity } from "monkec/base";
export { action } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import { getManagementToken } from "./common.ts";

export interface Auth0EntityDefinition {
    /**
     * @description Auth0 tenant domain, e.g. your-tenant.us.auth0.com
     * @minLength 1
     */
    domain: string;
    /**
     * @description Secret name holding the Auth0 Management API M2M application's client ID (default: auth0-management-client-id)
     */
    management_client_id_ref?: string;
    /**
     * @description Secret name holding the Auth0 Management API M2M application's client secret (default: auth0-management-client-secret)
     */
    management_client_secret_ref?: string;
}

export interface Auth0EntityState {
    /**
     * @description Indicates the resource already existed before this entity managed it
     */
    existing?: boolean;
}

export abstract class Auth0Entity<
    D extends Auth0EntityDefinition,
    S extends Auth0EntityState
> extends MonkEntity<D, S> {
    protected httpClient!: HttpClient;

    static readonly readiness = { period: 5, initialDelay: 1, attempts: 10 };

    protected override before(): void {
        const clientIdRef = this.definition.management_client_id_ref || "auth0-management-client-id";
        const clientSecretRef = this.definition.management_client_secret_ref || "auth0-management-client-secret";
        const token = getManagementToken(this.definition.domain, clientIdRef, clientSecretRef);

        this.httpClient = new HttpClient({
            baseUrl: `https://${this.definition.domain}/api/v2`,
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    protected abstract getEntityName(): string;

    protected makeRequest(method: string, path: string, body?: Record<string, any>): any {
        const response = this.httpClient.request(method as any, path, body !== undefined ? { body } : {});
        if (!response.ok) {
            throw new Error(
                `${this.getEntityName()} API error: ${response.statusCode} ${response.status} - ${JSON.stringify(response.data)}`
            );
        }
        return response.data;
    }
}
