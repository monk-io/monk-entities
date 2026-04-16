/**
 * GCP Identity Platform OAuth IdP Config Entity
 *
 * Creates and manages custom OIDC identity provider configurations for
 * Identity Platform. Supports both project-level and tenant-scoped configs.
 *
 * @see https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects.tenants.oauthIdpConfigs
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IDENTITY_TOOLKIT_API_URL } from "./common.ts";

/**
 * OAuth IdP Config entity definition
 * @interface IdentityPlatformOAuthIdpConfigDefinition
 */
export interface IdentityPlatformOAuthIdpConfigDefinition extends GcpEntityDefinition {
    /**
     * @description Config ID for this OIDC provider (e.g., oidc.my-provider).
     * Must start with "oidc." prefix.
     */
    name: string;

    /**
     * @description Tenant ID to scope this config to a specific tenant.
     * Omit for project-level configuration.
     */
    tenant_id?: string;

    /**
     * @description Human-readable display name for this OIDC provider.
     */
    display_name?: string;

    /**
     * @description Whether users can sign in with this provider.
     */
    enabled?: boolean;

    /**
     * @description OIDC client ID issued by the identity provider.
     */
    client_id: string;

    /**
     * @description OIDC issuer URI (e.g., https://accounts.google.com).
     */
    issuer: string;

    /**
     * @description OIDC client secret (required for authorization code flow).
     */
    client_secret?: string;

    /**
     * @description Use implicit flow (ID token response).
     */
    response_type_id_token?: boolean;

    /**
     * @description Use authorization code flow.
     */
    response_type_code?: boolean;
}

/**
 * OAuth IdP Config entity state
 * @interface IdentityPlatformOAuthIdpConfigState
 */
export interface IdentityPlatformOAuthIdpConfigState extends GcpEntityState {
    /**
     * @description Full resource name of the config.
     */
    resource_name?: string;

    /**
     * @description The config ID.
     */
    config_id?: string;

    /**
     * @description Human-readable display name.
     */
    display_name?: string;

    /**
     * @description Whether this provider is enabled.
     */
    enabled?: boolean;

    /**
     * @description The OIDC client ID.
     */
    client_id?: string;

    /**
     * @description The OIDC issuer URI.
     */
    issuer?: string;
}

/**
 * @description GCP Identity Platform OIDC identity provider configuration entity.
 * Creates and manages custom OIDC provider configurations for authenticating users
 * via external identity providers. Supports both project-level and tenant-scoped configs.
 *
 * ## Required Permissions
 * - `firebaseauth.configs.get` — read IdP configurations
 * - `firebaseauth.configs.update` — create, update, and delete IdP configurations
 *
 * Or use the predefined role: `roles/identityplatform.admin`
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.config_id` — Config ID for reference
 * - `state.resource_name` — Full resource name for API operations
 * - `state.enabled` — Whether the provider is currently enabled
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/identity-platform-tenant` — Scope provider to a tenant via tenant_id
 * - `gcp/identity-platform-config` — Project-level configuration
 *
 * @example Project-level OIDC provider
 * ```yaml
 * my-oidc-provider:
 *   defines: gcp/identity-platform-oauth-idp-config
 *   name: oidc.my-provider
 *   display_name: My OIDC Provider
 *   enabled: true
 *   client_id: my-client-id
 *   issuer: https://login.example.com
 *   response_type_code: true
 *   client_secret: my-client-secret
 * ```
 *
 * @example Tenant-scoped OIDC provider
 * ```yaml
 * tenant-oidc:
 *   defines: gcp/identity-platform-oauth-idp-config
 *   name: oidc.corp-sso
 *   tenant_id: <- connection-target("tenant") entity-state get-member("tenant_id")
 *   display_name: Corporate SSO
 *   enabled: true
 *   client_id: corp-client-id
 *   issuer: https://sso.corp.example.com
 *   response_type_code: true
 *   client_secret: corp-client-secret
 *   connections:
 *     tenant:
 *       runnable: gcp/identity-platform-tenant/my-tenant
 *       service: tenant
 *   depends:
 *     wait-for:
 *       runnables:
 *         - gcp/identity-platform-tenant/my-tenant
 *       timeout: 120
 * ```
 */
export class IdentityPlatformOAuthIdpConfig extends GcpEntity<IdentityPlatformOAuthIdpConfigDefinition, IdentityPlatformOAuthIdpConfigState> {

    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Identity Platform OIDC Config ${this.definition.name}`;
    }

    /**
     * Get the base URL for OAuth IdP configs (project or tenant scoped)
     */
    private get configsApiUrl(): string {
        const base = `${IDENTITY_TOOLKIT_API_URL}/projects/${this.projectId}`;
        if (this.definition.tenant_id) {
            return `${base}/tenants/${this.definition.tenant_id}/oauthIdpConfigs`;
        }
        return `${base}/oauthIdpConfigs`;
    }

    /**
     * Get config from API
     */
    private getOAuthIdpConfig(): any | null {
        return this.checkResourceExists(`${this.configsApiUrl}/${this.definition.name}`);
    }

    /**
     * Populate state from config response
     */
    private populateState(config: any): void {
        this.state.resource_name = config.name;
        this.state.config_id = config.name?.split("/").pop();
        this.state.display_name = config.displayName;
        this.state.enabled = config.enabled;
        this.state.client_id = config.clientId;
        this.state.issuer = config.issuer;
    }

    override create(): void {
        const existing = this.getOAuthIdpConfig();
        if (existing) {
            cli.output(`OIDC config ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        const body: any = {
            clientId: this.definition.client_id,
            issuer: this.definition.issuer,
        };

        if (this.definition.display_name) {
            body.displayName = this.definition.display_name;
        }

        if (this.definition.enabled !== undefined) {
            body.enabled = this.definition.enabled;
        }

        if (this.definition.client_secret) {
            body.clientSecret = this.definition.client_secret;
        }

        if (this.definition.response_type_id_token !== undefined || this.definition.response_type_code !== undefined) {
            body.responseType = {};
            if (this.definition.response_type_id_token !== undefined) {
                body.responseType.idToken = this.definition.response_type_id_token;
            }
            if (this.definition.response_type_code !== undefined) {
                body.responseType.code = this.definition.response_type_code;
            }
        }

        const url = `${this.configsApiUrl}?oauthIdpConfigId=${encodeURIComponent(this.definition.name)}`;

        cli.output(`Creating OIDC config: ${this.definition.name}`);
        const result = this.post(url, body);

        this.populateState(result);
        this.state.existing = false;
        cli.output(`OIDC config created: ${this.state.config_id}`);
    }

    override update(): void {
        const existing = this.getOAuthIdpConfig();
        if (!existing) {
            cli.output("OIDC config not found, creating...");
            this.create();
            return;
        }

        const body: any = {};
        const updateMaskFields: string[] = [];

        if (this.definition.display_name !== undefined) {
            body.displayName = this.definition.display_name;
            updateMaskFields.push("displayName");
        }

        if (this.definition.enabled !== undefined) {
            body.enabled = this.definition.enabled;
            updateMaskFields.push("enabled");
        }

        if (this.definition.client_id) {
            body.clientId = this.definition.client_id;
            updateMaskFields.push("clientId");
        }

        if (this.definition.issuer) {
            body.issuer = this.definition.issuer;
            updateMaskFields.push("issuer");
        }

        if (this.definition.client_secret !== undefined) {
            body.clientSecret = this.definition.client_secret;
            updateMaskFields.push("clientSecret");
        }

        if (this.definition.response_type_id_token !== undefined || this.definition.response_type_code !== undefined) {
            body.responseType = {};
            if (this.definition.response_type_id_token !== undefined) {
                body.responseType.idToken = this.definition.response_type_id_token;
                updateMaskFields.push("responseType.idToken");
            }
            if (this.definition.response_type_code !== undefined) {
                body.responseType.code = this.definition.response_type_code;
                updateMaskFields.push("responseType.code");
            }
        }

        if (updateMaskFields.length === 0) {
            cli.output("No fields to update");
            this.populateState(existing);
            return;
        }

        const updateMask = updateMaskFields.join(",");
        const url = `${this.configsApiUrl}/${this.definition.name}?updateMask=${updateMask}`;

        cli.output(`Updating OIDC config: ${this.definition.name}`);
        const result = this.patch(url, body);
        this.populateState(result);
        cli.output(`OIDC config ${this.definition.name} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`OIDC config ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getOAuthIdpConfig();
        if (!existing) {
            cli.output(`OIDC config ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting OIDC config: ${this.definition.name}`);
        this.httpDelete(`${this.configsApiUrl}/${this.definition.name}`);
        cli.output(`OIDC config ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const config = this.getOAuthIdpConfig();
        if (!config) {
            cli.output("OIDC config not found");
            return false;
        }

        this.populateState(config);

        if (!config.enabled) {
            cli.output(`OIDC config ${this.definition.name} is disabled`);
            return false;
        }

        cli.output(`OIDC config ${this.state.config_id} is ready`);
        return true;
    }

    override checkLiveness(): boolean {
        const config = this.getOAuthIdpConfig();
        return config !== null;
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const config = this.getOAuthIdpConfig();
        if (!config) {
            throw new Error("OIDC config not found");
        }
        cli.output(JSON.stringify(config, null, 2));
    }

    @action("enable")
    enable(_args?: Args): void {
        const url = `${this.configsApiUrl}/${this.definition.name}?updateMask=enabled`;
        this.patch(url, { enabled: true });
        cli.output("OIDC config enabled");
    }

    @action("disable")
    disable(_args?: Args): void {
        const url = `${this.configsApiUrl}/${this.definition.name}?updateMask=enabled`;
        this.patch(url, { enabled: false });
        cli.output("OIDC config disabled");
    }
}
