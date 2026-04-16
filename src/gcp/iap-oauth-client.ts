/**
 * GCP IAP OAuth Client Entity
 *
 * Creates and manages IAP-specific OAuth clients under a brand.
 * The client secret is written to a Monk secret for other entities to consume.
 *
 * @see https://cloud.google.com/iap/docs/reference/rest/v1/projects.brands.identityAwareProxyClients
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import secret from "secret";
import cli from "cli";
import { IAP_API_URL } from "./iap-common.ts";

/**
 * IAP OAuth Client entity definition
 */
export interface IapOauthClientDefinition extends GcpEntityDefinition {
    /**
     * @description Brand ID (trailing segment of a brand resource name).
     * Usually obtained from `connection-target("brand") entity-state get-member("brand_id")`.
     */
    brand_id: string;

    /**
     * @description Human-readable display name for the OAuth client. Used to
     * match an existing client on re-runs (displayName is the only searchable field).
     */
    display_name: string;

    /**
     * @description Monk secret name where the generated OAuth client secret will be written.
     * Must be listed under `permitted-secrets` in the template.
     */
    secret_ref: string;
}

/**
 * IAP OAuth Client entity state
 */
export interface IapOauthClientState extends GcpEntityState {
    /**
     * @description Full resource name (projects/{pn}/brands/{brand}/identityAwareProxyClients/{id})
     */
    client_name?: string;

    /**
     * @description OAuth client ID (trailing segment of the resource name)
     */
    client_id?: string;
}

/**
 * @description GCP IAP OAuth Client entity. Creates and manages OAuth 2.0 clients under an IAP
 * OAuth brand. On create, the returned client secret is written to a Monk secret so downstream
 * entities (iap-settings) can consume it. On adoption of an existing client, the secret is rotated
 * (GCP does not return secrets on GET) so the Monk secret always holds a valid value.
 *
 * ## Required Permissions
 * - `clientauthconfig.clients.create`
 * - `clientauthconfig.clients.get`
 * - `clientauthconfig.clients.list`
 * - `clientauthconfig.clients.update` (resetSecret)
 * - `clientauthconfig.clients.delete`
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: OAuth client secret written to `definition.secret_ref`. Add `permitted-secrets`:
 *   ```yaml
 *   permitted-secrets:
 *     <secret_ref>: true
 *   ```
 *
 * ## State Fields for Composition
 * - `state.client_id` — OAuth client ID, consumed by iap-settings `oauth_settings.client_id`
 * - `state.client_name` — full resource name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/iap-brand` — provides brand_id
 * - `gcp/iap-settings` — consumes client_id + secret value to configure IAP on a resource
 */
export class IapOauthClient extends GcpEntity<IapOauthClientDefinition, IapOauthClientState> {

    static readonly readiness = { period: 5, initialDelay: 1, attempts: 6 };

    protected getEntityName(): string {
        return `GCP IAP OAuth Client "${this.definition.display_name}"`;
    }

    private getParentUrl(): string {
        return `${IAP_API_URL}/projects/${this.projectId}/brands/${this.definition.brand_id}/identityAwareProxyClients`;
    }

    override create(): void {
        const listResp = this.get(this.getParentUrl());
        const clients = (listResp.identityAwareProxyClients as Array<Record<string, unknown>> | undefined) || [];
        const existing = clients.find(c => c.displayName === this.definition.display_name);

        if (existing) {
            this.state.client_name = String(existing.name || "");
            const parts = this.state.client_name.split("/");
            this.state.client_id = parts.length > 0 ? parts[parts.length - 1] : "";
            this.state.existing = true;
            cli.output(`Adopted existing IAP OAuth client: ${this.state.client_id}`);
            this.rotateSecretInternal();
            return;
        }

        const created = this.post(this.getParentUrl(), {
            displayName: this.definition.display_name,
        });

        this.state.client_name = String(created.name || "");
        const parts = this.state.client_name.split("/");
        this.state.client_id = parts.length > 0 ? parts[parts.length - 1] : "";
        this.state.existing = false;

        if (created.secret) {
            secret.set(this.definition.secret_ref, String(created.secret));
            cli.output(`Created IAP OAuth client ${this.state.client_id} — secret stored at "${this.definition.secret_ref}"`);
        } else {
            cli.output(`Created IAP OAuth client ${this.state.client_id} — no secret in response (rotating to obtain one)`);
            this.rotateSecretInternal();
        }
    }

    override update(): void {
        // displayName is immutable on this API — no-op if unchanged, otherwise would require re-create.
        if (!this.state.client_name) {
            this.create();
        }
    }

    override delete(): void {
        if (!this.state.client_name) return;
        if (this.state.existing) {
            cli.output("IAP OAuth client was pre-existing, skipping deletion");
            return;
        }
        this.httpDelete(`${IAP_API_URL}/${this.state.client_name}`);
        cli.output(`Deleted IAP OAuth client: ${this.state.client_id}`);
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.client_name);
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    private rotateSecretInternal(): void {
        if (!this.state.client_name) {
            throw new Error("Client not created yet");
        }
        const resp = this.post(`${IAP_API_URL}/${this.state.client_name}:resetSecret`, {});
        if (resp && resp.secret) {
            secret.set(this.definition.secret_ref, String(resp.secret));
            cli.output(`Rotated OAuth secret — updated "${this.definition.secret_ref}"`);
        } else {
            cli.output("Warning: resetSecret response did not contain a secret");
        }
    }

    /**
     * Display client info (secret is never printed)
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.client_name) {
            throw new Error("Client not created yet");
        }
        const info = this.get(`${IAP_API_URL}/${this.state.client_name}`);
        cli.output(`IAP OAuth Client: ${info.name}`);
        cli.output(`  Display name: ${info.displayName}`);
        cli.output(`  Client ID: ${this.state.client_id}`);
        cli.output(`  Secret stored at Monk secret: "${this.definition.secret_ref}"`);
    }

    /**
     * Rotate the OAuth client secret and update the Monk secret
     */
    @action("reset-secret")
    resetSecret(_args?: Args): void {
        this.rotateSecretInternal();
    }

    /**
     * Show where the client secret is stored (does NOT print the secret value)
     */
    @action("get-secret")
    getSecret(_args?: Args): void {
        cli.output(`OAuth client secret is stored in Monk secret: "${this.definition.secret_ref}"`);
        cli.output(`Retrieve with: sudo monk secrets get -g ${this.definition.secret_ref}`);
    }
}
