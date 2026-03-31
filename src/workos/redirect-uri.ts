import { WorkOSEntity, WorkOSEntityDefinition, WorkOSEntityState, action } from "./workos-base.ts";
import cli from "cli";

export interface WorkOSRedirectUriDefinition extends WorkOSEntityDefinition {
    /**
     * @description The redirect URI to register (e.g. http://localhost:3000/callback)
     * @minLength 1
     */
    uri: string;
}

export interface WorkOSRedirectUriState extends WorkOSEntityState {
    /**
     * @description WorkOS redirect URI ID (ruri_...)
     */
    redirect_uri_id?: string;
    /**
     * @description The registered redirect URI
     */
    uri?: string;
}

/**
 * @description WorkOS Redirect URI entity.
 * Registers a redirect URI for AuthKit authentication flows.
 * AuthKit requires redirect URIs to be registered before they can be used in OAuth callbacks.
 * Note: http://localhost URIs are only allowed in Sandbox (test) environments.
 *
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - WorkOS API key
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.redirect_uri_id` - WorkOS redirect URI ID (ruri_...)
 * - `state.uri` - The registered redirect URI
 *
 * ## Composing with Other Entities
 * Works with:
 * - `workos/credentials` - Shares API credentials
 */
export class RedirectUri extends WorkOSEntity<WorkOSRedirectUriDefinition, WorkOSRedirectUriState> {
    protected getEntityName(): string {
        return this.definition.uri;
    }

    override create(): void {
        // Try to find existing redirect URI
        let found: any = null;
        try {
            const list = this.makeRequest("GET", `/user_management/redirect_uris?limit=100`);
            const items = Array.isArray(list?.data) ? list.data : [];
            found = items.find((it: any) => it.uri === this.definition.uri);
        } catch { /* list may not be available */ }

        if (found) {
            this.state = {
                redirect_uri_id: found.id,
                uri: found.uri,
                existing: true,
            };
            cli.output(`Reusing existing WorkOS redirect URI ${found.id}`);
            return;
        }

        const created = this.makeRequest("POST", "/user_management/redirect_uris", {
            uri: this.definition.uri,
        });
        this.state = {
            redirect_uri_id: created?.id,
            uri: created?.uri,
            existing: false,
        };
        cli.output(`Created WorkOS redirect URI ${created?.id}`);
    }

    override update(): void {
        if (!this.state?.redirect_uri_id) {
            this.create();
            return;
        }
        cli.output(`WorkOS redirect URI ${this.state.redirect_uri_id} — no update needed`);
    }

    override delete(): void {
        if (!this.state?.redirect_uri_id || this.state.existing) return;
        try {
            this.makeRequest("DELETE", `/user_management/redirect_uris/${this.state.redirect_uri_id}`);
            cli.output(`Deleted WorkOS redirect URI ${this.state.redirect_uri_id}`);
        } catch { /* ignore deletion errors */ }
    }

    override checkReadiness(): boolean {
        return Boolean(this.state?.redirect_uri_id);
    }

    @action("get-info")
    /**
     * @description Get redirect URI details
     */
    getInfo(): void {
        if (!this.state?.redirect_uri_id) {
            cli.output("Redirect URI not created yet");
            return;
        }
        cli.output(JSON.stringify({
            id: this.state.redirect_uri_id,
            uri: this.state.uri,
        }, null, 2));
    }
}
