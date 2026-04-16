/**
 * GCP Identity Platform Inbound SAML Config Entity
 *
 * Creates and manages SAML 2.0 identity provider configurations for
 * Identity Platform enterprise SSO. Supports both project-level and
 * tenant-scoped configs.
 *
 * @see https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects.tenants.inboundSamlConfigs
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IDENTITY_TOOLKIT_API_URL } from "./common.ts";

/**
 * Inbound SAML Config entity definition
 * @interface IdentityPlatformInboundSamlConfigDefinition
 */
export interface IdentityPlatformInboundSamlConfigDefinition extends GcpEntityDefinition {
    /**
     * @description Config ID for this SAML provider (e.g., saml.my-provider).
     * Must start with "saml." prefix.
     */
    name: string;

    /**
     * @description Tenant ID to scope this config to a specific tenant.
     * Omit for project-level configuration.
     */
    tenant_id?: string;

    /**
     * @description Human-readable display name for this SAML provider.
     */
    display_name?: string;

    /**
     * @description Whether users can sign in with this provider.
     */
    enabled?: boolean;

    /**
     * @description SAML entity ID of the identity provider.
     */
    idp_entity_id: string;

    /**
     * @description URL to send SAML AuthnRequest to (IdP SSO URL).
     */
    sso_url: string;

    /**
     * @description Whether to sign outbound SAML requests.
     */
    sign_request?: boolean;

    /**
     * @description PEM-encoded x509 certificates from the identity provider.
     * Used to verify SAML assertions.
     */
    idp_certificates: string[];

    /**
     * @description SAML entity ID of this service provider (your application).
     */
    sp_entity_id: string;

    /**
     * @description Callback URI where the IdP sends SAML responses.
     */
    callback_uri: string;
}

/**
 * Inbound SAML Config entity state
 * @interface IdentityPlatformInboundSamlConfigState
 */
export interface IdentityPlatformInboundSamlConfigState extends GcpEntityState {
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
     * @description SAML entity ID of the identity provider.
     */
    idp_entity_id?: string;

    /**
     * @description SAML entity ID of the service provider.
     */
    sp_entity_id?: string;

    /**
     * @description Server-generated SP certificates (output only).
     */
    sp_certificates?: string;
}

/**
 * @description GCP Identity Platform SAML 2.0 identity provider configuration entity.
 * Creates and manages inbound SAML configurations for enterprise SSO integration.
 * Supports both project-level and tenant-scoped configurations.
 *
 * ## Required Permissions
 * - `firebaseauth.configs.get` — read SAML configurations
 * - `firebaseauth.configs.update` — create, update, and delete SAML configurations
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
 * - `state.idp_entity_id` — IdP entity ID
 * - `state.sp_entity_id` — SP entity ID
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/identity-platform-tenant` — Scope provider to a tenant via tenant_id
 * - `gcp/identity-platform-config` — Project-level configuration
 *
 * @example Project-level SAML provider
 * ```yaml
 * my-saml-provider:
 *   defines: gcp/identity-platform-inbound-saml-config
 *   name: saml.my-provider
 *   display_name: Enterprise SSO
 *   enabled: true
 *   idp_entity_id: https://idp.example.com/saml/metadata
 *   sso_url: https://idp.example.com/saml/sso
 *   sign_request: true
 *   idp_certificates:
 *     - |
 *       -----BEGIN CERTIFICATE-----
 *       MIICpDCCAYwCCQDU+...
 *       -----END CERTIFICATE-----
 *   sp_entity_id: https://myapp.example.com
 *   callback_uri: https://myapp.example.com/saml/callback
 * ```
 *
 * @example Tenant-scoped SAML provider
 * ```yaml
 * tenant-saml:
 *   defines: gcp/identity-platform-inbound-saml-config
 *   name: saml.corp-sso
 *   tenant_id: <- connection-target("tenant") entity-state get-member("tenant_id")
 *   display_name: Corp SAML SSO
 *   enabled: true
 *   idp_entity_id: https://corp-idp.example.com/metadata
 *   sso_url: https://corp-idp.example.com/sso
 *   idp_certificates:
 *     - |
 *       -----BEGIN CERTIFICATE-----
 *       MIICpDCCAYwCCQDU+...
 *       -----END CERTIFICATE-----
 *   sp_entity_id: https://myapp.example.com/tenant/corp
 *   callback_uri: https://myapp.example.com/tenant/corp/saml/callback
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
export class IdentityPlatformInboundSamlConfig extends GcpEntity<IdentityPlatformInboundSamlConfigDefinition, IdentityPlatformInboundSamlConfigState> {

    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Identity Platform SAML Config ${this.definition.name}`;
    }

    /**
     * Get the base URL for inbound SAML configs
     */
    private get configsApiUrl(): string {
        const base = `${IDENTITY_TOOLKIT_API_URL}/projects/${this.projectId}`;
        if (this.definition.tenant_id) {
            return `${base}/tenants/${this.definition.tenant_id}/inboundSamlConfigs`;
        }
        return `${base}/inboundSamlConfigs`;
    }

    /**
     * Get config from API
     */
    private getInboundSamlConfig(): any | null {
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
        this.state.idp_entity_id = config.idpConfig?.idpEntityId;
        this.state.sp_entity_id = config.spConfig?.spEntityId;

        if (config.spConfig?.spCertificates) {
            this.state.sp_certificates = JSON.stringify(config.spConfig.spCertificates);
        }
    }

    /**
     * Build the config body
     */
    private buildConfigBody(): any {
        const body: any = {
            idpConfig: {
                idpEntityId: this.definition.idp_entity_id,
                ssoUrl: this.definition.sso_url,
                idpCertificates: this.definition.idp_certificates.map(cert => ({
                    x509Certificate: cert,
                })),
            },
            spConfig: {
                spEntityId: this.definition.sp_entity_id,
                callbackUri: this.definition.callback_uri,
            },
        };

        if (this.definition.display_name) {
            body.displayName = this.definition.display_name;
        }

        if (this.definition.enabled !== undefined) {
            body.enabled = this.definition.enabled;
        }

        if (this.definition.sign_request !== undefined) {
            body.idpConfig.signRequest = this.definition.sign_request;
        }

        return body;
    }

    override create(): void {
        const existing = this.getInboundSamlConfig();
        if (existing) {
            cli.output(`SAML config ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        const body = this.buildConfigBody();
        const url = `${this.configsApiUrl}?inboundSamlConfigId=${encodeURIComponent(this.definition.name)}`;

        cli.output(`Creating SAML config: ${this.definition.name}`);
        const result = this.post(url, body);

        this.populateState(result);
        this.state.existing = false;
        cli.output(`SAML config created: ${this.state.config_id}`);
    }

    override update(): void {
        const existing = this.getInboundSamlConfig();
        if (!existing) {
            cli.output("SAML config not found, creating...");
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

        if (this.definition.idp_entity_id || this.definition.sso_url || this.definition.idp_certificates || this.definition.sign_request !== undefined) {
            body.idpConfig = {};
            if (this.definition.idp_entity_id) {
                body.idpConfig.idpEntityId = this.definition.idp_entity_id;
                updateMaskFields.push("idpConfig.idpEntityId");
            }
            if (this.definition.sso_url) {
                body.idpConfig.ssoUrl = this.definition.sso_url;
                updateMaskFields.push("idpConfig.ssoUrl");
            }
            if (this.definition.sign_request !== undefined) {
                body.idpConfig.signRequest = this.definition.sign_request;
                updateMaskFields.push("idpConfig.signRequest");
            }
            if (this.definition.idp_certificates) {
                body.idpConfig.idpCertificates = this.definition.idp_certificates.map(cert => ({
                    x509Certificate: cert,
                }));
                updateMaskFields.push("idpConfig.idpCertificates");
            }
        }

        if (this.definition.sp_entity_id || this.definition.callback_uri) {
            body.spConfig = {};
            if (this.definition.sp_entity_id) {
                body.spConfig.spEntityId = this.definition.sp_entity_id;
                updateMaskFields.push("spConfig.spEntityId");
            }
            if (this.definition.callback_uri) {
                body.spConfig.callbackUri = this.definition.callback_uri;
                updateMaskFields.push("spConfig.callbackUri");
            }
        }

        if (updateMaskFields.length === 0) {
            cli.output("No fields to update");
            this.populateState(existing);
            return;
        }

        const updateMask = updateMaskFields.join(",");
        const url = `${this.configsApiUrl}/${this.definition.name}?updateMask=${updateMask}`;

        cli.output(`Updating SAML config: ${this.definition.name}`);
        const result = this.patch(url, body);
        this.populateState(result);
        cli.output(`SAML config ${this.definition.name} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`SAML config ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getInboundSamlConfig();
        if (!existing) {
            cli.output(`SAML config ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting SAML config: ${this.definition.name}`);
        this.httpDelete(`${this.configsApiUrl}/${this.definition.name}`);
        cli.output(`SAML config ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const config = this.getInboundSamlConfig();
        if (!config) {
            cli.output("SAML config not found");
            return false;
        }

        this.populateState(config);

        if (!config.enabled) {
            cli.output(`SAML config ${this.definition.name} is disabled`);
            return false;
        }

        cli.output(`SAML config ${this.state.config_id} is ready`);
        return true;
    }

    override checkLiveness(): boolean {
        const config = this.getInboundSamlConfig();
        return config !== null;
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const config = this.getInboundSamlConfig();
        if (!config) {
            throw new Error("SAML config not found");
        }
        cli.output(JSON.stringify(config, null, 2));
    }

    @action("enable")
    enable(_args?: Args): void {
        const url = `${this.configsApiUrl}/${this.definition.name}?updateMask=enabled`;
        this.patch(url, { enabled: true });
        cli.output(`SAML config ${this.definition.name} enabled`);
    }

    @action("disable")
    disable(_args?: Args): void {
        const url = `${this.configsApiUrl}/${this.definition.name}?updateMask=enabled`;
        this.patch(url, { enabled: false });
        cli.output(`SAML config ${this.definition.name} disabled`);
    }
}
