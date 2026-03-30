import { ClerkEntity, ClerkEntityDefinition, ClerkEntityState, action } from "./clerk-base.ts";
import secret from "secret";
import cli from "cli";

export interface ClerkOAuthApplicationDefinition extends ClerkEntityDefinition {
    /**
     * @description OAuth application name
     * @minLength 1
     * @maxLength 256
     */
    name: string;
    /**
     * @description Optional: adopt existing OAuth application by ID
     */
    oauth_application_id?: string;
    /**
     * @description OAuth callback URL
     * @minLength 1
     */
    callback_url: string;
    /**
     * @description Whether the application uses PKCE (public clients)
     */
    public_client?: boolean;
    /**
     * @description Scopes for the OAuth application (space-separated)
     */
    scopes?: string;
    /**
     * @description Secret name to store the client secret (default: clerk-oauth-client-secret)
     */
    client_secret_ref?: string;
}

export interface ClerkOAuthApplicationState extends ClerkEntityState {
    /**
     * @description OAuth application ID
     */
    oauth_application_id?: string;
    /**
     * @description OAuth client ID for use in OAuth flows
     */
    client_id?: string;
    /**
     * @description Application name
     */
    name?: string;
    /**
     * @description Secret name where the client secret is stored
     */
    client_secret_secret?: string;
}

/**
 * @description Clerk OAuth Application entity.
 * Creates and manages OAuth applications for third-party authentication flows.
 * OAuth applications allow external services to authenticate using your Clerk instance.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - Clerk secret API key
 * - Writes: OAuth client secret to `client_secret_ref` (default: `clerk-oauth-client-secret`)
 *
 * ## State Fields for Composition
 * - `state.oauth_application_id` - OAuth application ID
 * - `state.client_id` - OAuth client ID
 * - `state.name` - Application name
 * - `state.client_secret_secret` - Secret name where client secret is stored
 *
 * ## Consuming OAuth Application in Runnables
 * ```yaml
 * app:
 *   defines: runnable
 *   connections:
 *     oauth:
 *       target: my-namespace/clerk-oauth
 *       service: data
 *   variables:
 *     oauth_secret_ref:
 *       type: string
 *       value: <- connection-target("oauth") entity-state get-member("client_secret_secret")
 *     CLERK_OAUTH_CLIENT_ID:
 *       env: CLERK_OAUTH_CLIENT_ID
 *       type: string
 *       value: <- connection-target("oauth") entity-state get-member("client_id")
 *     CLERK_OAUTH_CLIENT_SECRET:
 *       env: CLERK_OAUTH_CLIENT_SECRET
 *       type: string
 *       value: <- secret($oauth_secret_ref)
 * ```
 *
 * ## Composing with Other Entities
 * Works with:
 * - `clerk/credentials` - Shares API credentials
 */
export class OAuthApplication extends ClerkEntity<ClerkOAuthApplicationDefinition, ClerkOAuthApplicationState> {
    protected getEntityName(): string {
        return this.definition.name;
    }

    private getClientSecretRef(): string {
        return this.definition.client_secret_ref || "clerk-oauth-client-secret";
    }

    override create(): void {
        // Adopt existing by ID
        if (this.definition.oauth_application_id) {
            const app = this.makeRequest("GET", `/oauth_applications/${this.definition.oauth_application_id}`);
            this.state = {
                oauth_application_id: app?.id,
                client_id: app?.client_id,
                name: app?.name,
                client_secret_secret: this.getClientSecretRef(),
                existing: true,
            };
            cli.output(`Adopted existing Clerk OAuth application ${app?.id}`);
            return;
        }

        // Try find by name
        let found: any = null;
        try {
            const list = this.makeRequest("GET", "/oauth_applications");
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.name === this.definition.name);
        } catch { /* ignore search errors */ }

        if (found) {
            this.state = {
                oauth_application_id: found.id,
                client_id: found.client_id,
                name: found.name,
                client_secret_secret: this.getClientSecretRef(),
                existing: true,
            };
            cli.output(`Reusing existing Clerk OAuth application ${found.id}`);
            return;
        }

        const body: Record<string, any> = {
            name: this.definition.name,
            callback_url: this.definition.callback_url,
        };
        if (this.definition.public_client !== undefined) body["public"] = this.definition.public_client;
        if (this.definition.scopes) body["scopes"] = this.definition.scopes;

        const created = this.makeRequest("POST", "/oauth_applications", body);

        // Store client secret if returned
        if (created?.client_secret) {
            secret.set(this.getClientSecretRef(), created.client_secret);
        }

        this.state = {
            oauth_application_id: created?.id,
            client_id: created?.client_id,
            name: created?.name,
            client_secret_secret: this.getClientSecretRef(),
            existing: false,
        };
        cli.output(`Created Clerk OAuth application ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.oauth_application_id) {
            this.create();
            return;
        }
        const body: Record<string, any> = {
            name: this.definition.name,
            callback_url: this.definition.callback_url,
        };
        if (this.definition.scopes) body["scopes"] = this.definition.scopes;

        const updated = this.makeRequest("PATCH", `/oauth_applications/${this.state.oauth_application_id}`, body);
        this.state = {
            ...this.state,
            name: updated?.name,
            client_id: updated?.client_id,
        };
        cli.output(`Updated Clerk OAuth application ${this.state.oauth_application_id}`);
    }

    override delete(): void {
        if (!this.state?.oauth_application_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/oauth_applications/${this.state.oauth_application_id}`);
            cli.output(`Deleted Clerk OAuth application ${this.state.oauth_application_id}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.oauth_application_id);
    }

    @action("get-info")
    /**
     * @description Get OAuth application details
     */
    getInfo(): void {
        if (!this.state?.oauth_application_id) {
            cli.output("OAuth application not created yet");
            return;
        }
        const app = this.makeRequest("GET", `/oauth_applications/${this.state.oauth_application_id}`);
        cli.output(JSON.stringify(app, null, 2));
    }

    @action("rotate-secret")
    /**
     * @description Rotate the OAuth client secret and store the new one
     */
    rotateSecret(): void {
        if (!this.state?.oauth_application_id) {
            cli.output("OAuth application not created yet");
            return;
        }
        const result = this.makeRequest("POST", `/oauth_applications/${this.state.oauth_application_id}/rotate_secret`);
        if (result?.client_secret) {
            secret.set(this.getClientSecretRef(), result.client_secret);
            cli.output(`Rotated client secret for OAuth application ${this.state.oauth_application_id}`);
        } else {
            cli.output("Secret rotation completed but no new secret returned");
        }
    }
}
