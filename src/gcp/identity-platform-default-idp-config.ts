/**
 * GCP Identity Platform Default Supported IdP Config Entity
 *
 * Configures built-in social identity providers (Google, Facebook, Apple,
 * GitHub, Microsoft, Twitter, etc.) for Identity Platform.
 * Supports both project-level and tenant-scoped configs.
 *
 * @see https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects.tenants.defaultSupportedIdpConfigs
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IDENTITY_TOOLKIT_API_URL } from "./common.ts";

/**
 * Default Supported IdP Config entity definition
 * @interface IdentityPlatformDefaultIdpConfigDefinition
 */
export interface IdentityPlatformDefaultIdpConfigDefinition extends GcpEntityDefinition {
    /**
     * @description The identity provider ID (e.g., google.com, facebook.com, apple.com,
     * github.com, microsoft.com, twitter.com).
     */
    idp_id: string;

    /**
     * @description Tenant ID to scope this config to a specific tenant.
     * Omit for project-level configuration.
     */
    tenant_id?: string;

    /**
     * @description Whether users can sign in with this provider.
     */
    enabled?: boolean;

    /**
     * @description OAuth client ID from the identity provider.
     */
    client_id: string;

    /**
     * @description OAuth client secret from the identity provider.
     */
    client_secret: string;

    /**
     * @description Apple Developer Team ID (only for apple.com provider).
     */
    apple_team_id?: string;

    /**
     * @description Key ID for the Apple private key (only for apple.com provider).
     */
    apple_key_id?: string;

    /**
     * @description Private key for Apple Sign-In (only for apple.com provider).
     */
    apple_private_key?: string;

    /**
     * @description Apple bundle IDs (only for apple.com provider).
     */
    apple_bundle_ids?: string[];
}

/**
 * Default Supported IdP Config entity state
 * @interface IdentityPlatformDefaultIdpConfigState
 */
export interface IdentityPlatformDefaultIdpConfigState extends GcpEntityState {
    /**
     * @description Full resource name of the config.
     */
    resource_name?: string;

    /**
     * @description The identity provider ID (e.g., google.com).
     */
    idp_id?: string;

    /**
     * @description Whether this provider is enabled.
     */
    enabled?: boolean;

    /**
     * @description The OAuth client ID.
     */
    client_id?: string;
}

/**
 * @description GCP Identity Platform built-in social identity provider configuration entity.
 * Configures social sign-in providers like Google, Facebook, Apple, GitHub, Microsoft,
 * and Twitter. Supports both project-level and tenant-scoped configurations.
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
 * Note: The client_id and client_secret fields are credentials from the social provider
 * (e.g., Facebook App ID/Secret), passed as definition fields, not Monk secrets.
 *
 * ## State Fields for Composition
 * - `state.idp_id` — Provider ID (e.g., google.com)
 * - `state.resource_name` — Full resource name for API operations
 * - `state.enabled` — Whether the provider is currently enabled
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/identity-platform-tenant` — Scope provider to a tenant via tenant_id
 * - `gcp/identity-platform-config` — Project-level configuration
 *
 * @example Google sign-in at project level
 * ```yaml
 * google-signin:
 *   defines: gcp/identity-platform-default-idp-config
 *   idp_id: google.com
 *   enabled: true
 *   client_id: 123456789.apps.googleusercontent.com
 *   client_secret: GOCSPX-my-secret
 * ```
 *
 * @example Facebook sign-in scoped to tenant
 * ```yaml
 * facebook-signin:
 *   defines: gcp/identity-platform-default-idp-config
 *   idp_id: facebook.com
 *   tenant_id: <- connection-target("tenant") entity-state get-member("tenant_id")
 *   enabled: true
 *   client_id: 1234567890
 *   client_secret: fb-app-secret
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
 *
 * @example Apple sign-in
 * ```yaml
 * apple-signin:
 *   defines: gcp/identity-platform-default-idp-config
 *   idp_id: apple.com
 *   enabled: true
 *   client_id: com.example.myapp
 *   client_secret: apple-placeholder
 *   apple_team_id: ABCDE12345
 *   apple_key_id: KEY123456
 *   apple_private_key: |
 *     -----BEGIN PRIVATE KEY-----
 *     ...
 *     -----END PRIVATE KEY-----
 *   apple_bundle_ids:
 *     - com.example.myapp
 * ```
 */
export class IdentityPlatformDefaultIdpConfig extends GcpEntity<IdentityPlatformDefaultIdpConfigDefinition, IdentityPlatformDefaultIdpConfigState> {

    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Identity Platform Default IdP ${this.definition.idp_id}`;
    }

    /**
     * Get the base URL for default supported IdP configs
     */
    private get configsApiUrl(): string {
        const base = `${IDENTITY_TOOLKIT_API_URL}/projects/${this.projectId}`;
        if (this.definition.tenant_id) {
            return `${base}/tenants/${this.definition.tenant_id}/defaultSupportedIdpConfigs`;
        }
        return `${base}/defaultSupportedIdpConfigs`;
    }

    /**
     * Get config from API
     */
    private getDefaultIdpConfig(): any | null {
        return this.checkResourceExists(`${this.configsApiUrl}/${this.definition.idp_id}`);
    }

    /**
     * Populate state from config response
     */
    private populateState(config: any): void {
        this.state.resource_name = config.name;
        this.state.idp_id = this.definition.idp_id;
        this.state.enabled = config.enabled;
        this.state.client_id = config.clientId;
    }

    /**
     * Build the config body
     */
    private buildConfigBody(): any {
        const body: any = {
            clientId: this.definition.client_id,
            clientSecret: this.definition.client_secret,
        };

        if (this.definition.enabled !== undefined) {
            body.enabled = this.definition.enabled;
        }

        // Apple-specific fields
        if (this.definition.idp_id === "apple.com") {
            if (this.definition.apple_team_id || this.definition.apple_key_id || this.definition.apple_private_key) {
                body.appleSignInConfig = {
                    codeFlowConfig: {},
                };
                if (this.definition.apple_team_id) {
                    body.appleSignInConfig.codeFlowConfig.teamId = this.definition.apple_team_id;
                }
                if (this.definition.apple_key_id) {
                    body.appleSignInConfig.codeFlowConfig.keyId = this.definition.apple_key_id;
                }
                if (this.definition.apple_private_key) {
                    body.appleSignInConfig.codeFlowConfig.privateKey = this.definition.apple_private_key;
                }
            }
            if (this.definition.apple_bundle_ids) {
                if (!body.appleSignInConfig) {
                    body.appleSignInConfig = {};
                }
                body.appleSignInConfig.bundleIds = this.definition.apple_bundle_ids;
            }
        }

        return body;
    }

    override create(): void {
        const existing = this.getDefaultIdpConfig();
        if (existing) {
            cli.output(`Default IdP config ${this.definition.idp_id} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        const body = this.buildConfigBody();
        const url = `${this.configsApiUrl}?idpId=${encodeURIComponent(this.definition.idp_id)}`;

        cli.output(`Creating default IdP config: ${this.definition.idp_id}`);
        const result = this.post(url, body);

        this.populateState(result);
        this.state.existing = false;
        cli.output(`Default IdP config created: ${this.state.idp_id}`);
    }

    override update(): void {
        const existing = this.getDefaultIdpConfig();
        if (!existing) {
            cli.output("Default IdP config not found, creating...");
            this.create();
            return;
        }

        const body: any = {};
        const updateMaskFields: string[] = [];

        if (this.definition.enabled !== undefined) {
            body.enabled = this.definition.enabled;
            updateMaskFields.push("enabled");
        }

        if (this.definition.client_id) {
            body.clientId = this.definition.client_id;
            updateMaskFields.push("clientId");
        }

        if (this.definition.client_secret) {
            body.clientSecret = this.definition.client_secret;
            updateMaskFields.push("clientSecret");
        }

        // Apple-specific updates
        if (this.definition.idp_id === "apple.com") {
            if (this.definition.apple_team_id || this.definition.apple_key_id || this.definition.apple_private_key) {
                body.appleSignInConfig = { codeFlowConfig: {} };
                if (this.definition.apple_team_id) {
                    body.appleSignInConfig.codeFlowConfig.teamId = this.definition.apple_team_id;
                }
                if (this.definition.apple_key_id) {
                    body.appleSignInConfig.codeFlowConfig.keyId = this.definition.apple_key_id;
                }
                if (this.definition.apple_private_key) {
                    body.appleSignInConfig.codeFlowConfig.privateKey = this.definition.apple_private_key;
                }
                updateMaskFields.push("appleSignInConfig.codeFlowConfig");
            }
            if (this.definition.apple_bundle_ids) {
                if (!body.appleSignInConfig) {
                    body.appleSignInConfig = {};
                }
                body.appleSignInConfig.bundleIds = this.definition.apple_bundle_ids;
                updateMaskFields.push("appleSignInConfig.bundleIds");
            }
        }

        if (updateMaskFields.length === 0) {
            cli.output("No fields to update");
            this.populateState(existing);
            return;
        }

        const updateMask = updateMaskFields.join(",");
        const url = `${this.configsApiUrl}/${this.definition.idp_id}?updateMask=${updateMask}`;

        cli.output(`Updating default IdP config: ${this.definition.idp_id}`);
        const result = this.patch(url, body);
        this.populateState(result);
        cli.output(`Default IdP config ${this.definition.idp_id} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Default IdP config ${this.definition.idp_id} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getDefaultIdpConfig();
        if (!existing) {
            cli.output(`Default IdP config ${this.definition.idp_id} does not exist`);
            return;
        }

        cli.output(`Deleting default IdP config: ${this.definition.idp_id}`);
        this.httpDelete(`${this.configsApiUrl}/${this.definition.idp_id}`);
        cli.output(`Default IdP config ${this.definition.idp_id} deleted`);
    }

    override checkReadiness(): boolean {
        const config = this.getDefaultIdpConfig();
        if (!config) {
            cli.output("Default IdP config not found");
            return false;
        }

        this.populateState(config);

        if (!config.enabled) {
            cli.output(`Default IdP config ${this.definition.idp_id} is disabled`);
            return false;
        }

        cli.output(`Default IdP config ${this.state.idp_id} is ready`);
        return true;
    }

    override checkLiveness(): boolean {
        const config = this.getDefaultIdpConfig();
        return config !== null;
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const config = this.getDefaultIdpConfig();
        if (!config) {
            throw new Error("Default IdP config not found");
        }
        cli.output(JSON.stringify(config, null, 2));
    }

    @action("enable")
    enable(_args?: Args): void {
        const url = `${this.configsApiUrl}/${this.definition.idp_id}?updateMask=enabled`;
        this.patch(url, { enabled: true });
        cli.output(`Default IdP ${this.definition.idp_id} enabled`);
    }

    @action("disable")
    disable(_args?: Args): void {
        const url = `${this.configsApiUrl}/${this.definition.idp_id}?updateMask=enabled`;
        this.patch(url, { enabled: false });
        cli.output(`Default IdP ${this.definition.idp_id} disabled`);
    }
}
