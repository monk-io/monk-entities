import { action, type Args } from "monkec/base";
import { Auth0Entity, type Auth0EntityDefinition, type Auth0EntityState } from "./auth0-base.ts";
import { toStringArray } from "./common.ts";
import secret from "secret";
import cli from "cli";

export interface ApplicationDefinition extends Auth0EntityDefinition {
    /**
     * @description Application name
     * @minLength 1
     */
    name: string;
    /**
     * @description Auth0 application type, e.g. native, spa, regular_web, non_interactive (default: regular_web)
     */
    app_type?: string;
    /**
     * @description Callback URLs allowed for this application (maps to Auth0's `callbacks`)
     */
    callback_urls?: string[];
    /**
     * @description Grant types supported by this application, e.g. authorization_code, refresh_token, client_credentials
     */
    grant_types?: string[];
    /**
     * @description Allowed logout redirect URLs
     */
    allowed_logout_urls?: string[];
    /**
     * @description Allowed origins for CORS
     */
    allowed_origins?: string[];
    /**
     * @description Allowed web origins for CORS on the token endpoint
     */
    web_origins?: string[];
    /**
     * @description URL for the application logo
     */
    logo_uri?: string;
    /**
     * @description Enable cross-origin authentication
     */
    cross_origin_authentication?: boolean;
    /**
     * @description Token endpoint authentication method
     */
    token_endpoint_auth_method?: "none" | "client_secret_post" | "client_secret_basic";
    /**
     * @description Secret name to store the client secret (default: auth0-client-secret)
     */
    client_secret_ref?: string;
}

export interface ApplicationState extends Auth0EntityState {
    /**
     * @description Auth0 client ID
     */
    client_id?: string;
    /**
     * @description Secret name where the current client secret is stored
     */
    client_secret_secret?: string;
    /**
     * @description Application name
     */
    name?: string;
    /**
     * @description Auth0 application type
     */
    app_type?: string;
    /**
     * @description Callback URLs configured for this application
     */
    callback_urls?: string[];
}

// Maps a patch action's arg key to the Auth0 API field it updates, and whether
// that field is an array (so a comma-separated string arg gets split).
const PATCHABLE_FIELDS: Record<string, string> = {
    name: "name",
    app_type: "app_type",
    callback_urls: "callbacks",
    grant_types: "grant_types",
    allowed_logout_urls: "allowed_logout_urls",
    web_origins: "web_origins",
    allowed_origins: "allowed_origins",
    logo_uri: "logo_uri",
    cross_origin_authentication: "cross_origin_authentication",
    token_endpoint_auth_method: "token_endpoint_auth_method",
};
const ARRAY_API_FIELDS = new Set(["callbacks", "grant_types", "allowed_logout_urls", "web_origins", "allowed_origins"]);

/**
 * @description Auth0 Application (OAuth client) entity.
 * Creates and manages Auth0 applications (Clients) via the Management API.
 *
 * ## Secrets
 * - Reads: `management_client_id_ref` / `management_client_secret_ref` — Auth0 Management API M2M credentials
 * - Writes: the application's client secret, to `client_secret_ref` (default: `auth0-client-secret`)
 *
 * ## State Fields for Composition
 * - `state.client_id` - OAuth client ID
 * - `state.client_secret_secret` - secret name holding the current client secret
 */
export class Application extends Auth0Entity<ApplicationDefinition, ApplicationState> {
    protected getEntityName(): string {
        return `Auth0 Application ${this.definition.name}`;
    }

    private getClientSecretRef(): string {
        return this.definition.client_secret_ref || "auth0-client-secret";
    }

    private buildBody(): Record<string, any> {
        const body: Record<string, any> = {
            name: this.definition.name,
            app_type: this.definition.app_type || "regular_web",
        };
        if (this.definition.callback_urls) body.callbacks = this.definition.callback_urls;
        if (this.definition.grant_types) body.grant_types = this.definition.grant_types;
        if (this.definition.allowed_logout_urls) body.allowed_logout_urls = this.definition.allowed_logout_urls;
        if (this.definition.web_origins) body.web_origins = this.definition.web_origins;
        if (this.definition.allowed_origins) body.allowed_origins = this.definition.allowed_origins;
        if (this.definition.logo_uri) body.logo_uri = this.definition.logo_uri;
        if (this.definition.cross_origin_authentication !== undefined) {
            body.cross_origin_authentication = this.definition.cross_origin_authentication;
        }
        if (this.definition.token_endpoint_auth_method) {
            body.token_endpoint_auth_method = this.definition.token_endpoint_auth_method;
        }
        return body;
    }

    private applyResponse(app: any, existing: boolean): void {
        this.state.client_id = app.client_id;
        this.state.name = app.name;
        this.state.app_type = app.app_type;
        this.state.callback_urls = app.callbacks;
        this.state.existing = existing;
        if (app.client_secret) {
            secret.set(this.getClientSecretRef(), app.client_secret);
            this.state.client_secret_secret = this.getClientSecretRef();
        }
    }

    override create(): void {
        // Adopt an existing client with the same name rather than creating a duplicate.
        let found: any = null;
        try {
            const list = this.makeRequest("GET", "/clients?fields=client_id,name&include_fields=true&per_page=100");
            const items = Array.isArray(list) ? list : [];
            found = items.find((it: any) => it.name === this.definition.name);
        } catch {
            // Ignore search failures; fall through to create
        }

        if (found) {
            const app = this.makeRequest("GET", `/clients/${found.client_id}`);
            this.applyResponse(app, true);
            cli.output(`Adopted existing Auth0 application ${app.client_id}`);
            return;
        }

        const created = this.makeRequest("POST", "/clients", this.buildBody());
        this.applyResponse(created, false);
        cli.output(`Created Auth0 application ${this.state.client_id}`);
    }

    override update(): void {
        if (!this.state.client_id) {
            this.create();
            return;
        }
        const updated = this.makeRequest("PATCH", `/clients/${this.state.client_id}`, this.buildBody());
        this.applyResponse(updated, this.state.existing ?? false);
        cli.output(`Updated Auth0 application ${this.state.client_id}`);
    }

    override delete(): void {
        if (!this.state.client_id) return;
        if (this.state.existing) {
            cli.output("Application was pre-existing, skipping deletion");
            return;
        }
        try {
            this.makeRequest("DELETE", `/clients/${this.state.client_id}`);
            cli.output(`Deleted Auth0 application ${this.state.client_id}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (!msg.includes("404")) throw err;
        }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.client_id);
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.client_id) {
            cli.output("Application not created yet");
            return;
        }
        const app = this.makeRequest("GET", `/clients/${this.state.client_id}`);
        cli.output(JSON.stringify(app, null, 2));
    }

    @action("patch")
    /**
     * @description Update specific fields at runtime (e.g. from a dependent runnable's own domain), without
     * changing the entity's static Definition. Unrecognized keys are ignored with a warning.
     */
    patch(args?: Args): void {
        if (!this.state.client_id) {
            throw new Error("Application not created yet");
        }
        const body: Record<string, any> = {};
        for (const [key, value] of Object.entries(args || {})) {
            const apiField = PATCHABLE_FIELDS[key];
            if (!apiField) {
                cli.output(`Ignoring unknown patch field: ${key}`);
                continue;
            }
            body[apiField] = ARRAY_API_FIELDS.has(apiField) ? toStringArray(value) : value;
        }
        if (Object.keys(body).length === 0) {
            cli.output("No recognized fields to patch");
            return;
        }
        const updated = this.makeRequest("PATCH", `/clients/${this.state.client_id}`, body);
        this.applyResponse(updated, this.state.existing ?? false);
        cli.output(`Patched Auth0 application ${this.state.client_id}`);
    }

    @action("rotate-secret")
    /**
     * @description Rotate the application's client secret and store the new value in `client_secret_ref`.
     * Not supported for clients configured with the Private Key JWT authentication method.
     */
    rotateSecret(_args?: Args): void {
        if (!this.state.client_id) {
            throw new Error("Application not created yet");
        }
        const result = this.makeRequest("POST", `/clients/${this.state.client_id}/rotate-secret`);
        if (result?.client_secret) {
            secret.set(this.getClientSecretRef(), result.client_secret);
            this.state.client_secret_secret = this.getClientSecretRef();
            cli.output(`Rotated client secret for Auth0 application ${this.state.client_id}`);
        } else {
            cli.output("Secret rotation completed but no new secret returned");
        }
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(
            "Auth0 billing is tenant-wide (MAU-based subscription tier), not attributable to an " +
            "individual application. No per-entity cost estimate is available."
        );
    }

    @action("costs")
    costs(): void {
        cli.output(JSON.stringify({
            type: "auth0-application",
            costs: {
                month: {
                    amount: "0",
                    currency: "USD",
                    error: "Auth0 billing is tenant-wide (MAU-based), not attributable to an individual application",
                },
            },
        }));
    }
}
