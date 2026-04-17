/**
 * GCP IAP Settings Entity
 *
 * Applies IAP settings (access/application) to an existing IAP-protected resource
 * (App Engine app, Compute backend service, Cloud Run service, organization, folder).
 * Settings are not a creatable resource — this entity PATCHes settings and restores
 * the prior state on delete.
 *
 * @see https://cloud.google.com/iap/docs/reference/rest/v1/IapSettings
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import {
    IAP_API_URL,
    IapTarget,
    IapTargetKind,
    collectUpdateMaskPaths,
    resolveIapResourceName,
} from "./iap-common.ts";

/**
 * OAuth-related settings for IAP access
 */
export interface IapOAuthSettings {
    /**
     * @description OAuth 2.0 client ID (e.g., from gcp/iap-oauth-client state.client_id)
     */
    client_id?: string;

    /**
     * @description OAuth 2.0 client secret value (plaintext — prefer reading from Monk secret in template)
     */
    client_secret?: string;

    /**
     * @description Domain hint to show on the OAuth consent screen (hd parameter)
     */
    login_hint?: string;

    /**
     * @description List of OAuth client IDs permitted programmatic access to this IAP resource
     */
    programmatic_clients?: string[];
}

/**
 * CORS settings for IAP-protected resources
 */
export interface IapCorsSettings {
    /**
     * @description Allow HTTP OPTIONS calls to skip authentication
     */
    allow_http_options?: boolean;
}

/**
 * Reauthentication policy settings
 */
export interface IapReauthSettings {
    /**
     * @description Reauthentication method: LOGIN, SECURE_KEY, or ENROLLED_SECOND_FACTORS
     */
    method?: "LOGIN" | "SECURE_KEY" | "ENROLLED_SECOND_FACTORS";

    /**
     * @description Reauthentication session lifetime, e.g., "3600s"
     */
    max_age?: string;

    /**
     * @description Policy type: MINIMUM or DEFAULT
     */
    policy_type?: "MINIMUM" | "DEFAULT";
}

/**
 * Allowed-domains settings
 */
export interface IapAllowedDomainsSettings {
    /**
     * @description List of trusted domains (email addresses must match one of these)
     */
    domains?: string[];

    /**
     * @description Enable the allowed-domains check
     */
    enable?: boolean;
}

/**
 * GCIP (Google Cloud Identity Platform) settings for 3p IdPs
 */
export interface IapGcipSettings {
    /**
     * @description GCIP tenant IDs
     */
    tenant_ids?: string[];

    /**
     * @description URI of the login page for GCIP tenants
     */
    login_page_uri?: string;
}

/**
 * All IAP access settings (grouped)
 */
export interface IapAccessSettings {
    /**
     * @description OAuth 2.0 settings for IAP's own sign-in flow
     */
    oauth_settings?: IapOAuthSettings;

    /**
     * @description CORS behavior for IAP-protected resources
     */
    cors_settings?: IapCorsSettings;

    /**
     * @description Reauthentication policy
     */
    reauth_settings?: IapReauthSettings;

    /**
     * @description Allowed-domains restriction
     */
    allowed_domains_settings?: IapAllowedDomainsSettings;

    /**
     * @description GCIP configuration for third-party identity providers
     */
    gcip_settings?: IapGcipSettings;

    /**
     * @description Identity source precedence
     */
    identity_sources?: Array<"WORKFORCE_IDENTITY_FEDERATION" | "IDENTITY_SOURCE_UNSPECIFIED">;
}

/**
 * Custom access-denied page configuration
 */
export interface IapAccessDeniedPageSettings {
    /**
     * @description URI to redirect to when access is denied
     */
    access_denied_page_uri?: string;

    /**
     * @description Enable troubleshooting URL generation on the denied page
     */
    generate_troubleshooting_uri?: boolean;

    /**
     * @description Enable remediation token generation
     */
    remediation_token_generation_enabled?: boolean;
}

/**
 * Attribute propagation settings
 */
export interface IapAttributePropagationSettings {
    /**
     * @description Where propagated attributes should be placed: HEADER, JWT, or RCTOKEN
     */
    output_credentials?: Array<"HEADER" | "JWT" | "RCTOKEN">;

    /**
     * @description CEL expression returning the list of attributes to propagate
     */
    expression?: string;

    /**
     * @description Whether attribute propagation is enabled
     */
    enable?: boolean;
}

/**
 * Cloud Service Mesh / RCToken settings
 */
export interface IapCsmSettings {
    /**
     * @description Audience claim set in the generated RCToken
     */
    rctoken_aud?: string;
}

/**
 * All IAP application settings (grouped)
 */
export interface IapApplicationSettings {
    /**
     * @description Access-denied page behavior
     */
    access_denied_page_settings?: IapAccessDeniedPageSettings;

    /**
     * @description Cookie domain for IAP-issued cookies
     */
    cookie_domain?: string;

    /**
     * @description Attribute propagation to backend
     */
    attribute_propagation_settings?: IapAttributePropagationSettings;

    /**
     * @description Service Mesh (CSM) RCToken settings
     */
    csm_settings?: IapCsmSettings;
}

/**
 * IAP Settings entity definition
 */
export interface IapSettingsDefinition extends GcpEntityDefinition {
    /**
     * @description Kind of IAP-protected resource. Selects which target_* fields apply.
     */
    target_kind: IapTargetKind;

    /**
     * @description App Engine application ID (for target_kind: app-engine, app-engine-service)
     */
    app_id?: string;

    /**
     * @description App Engine service name (for target_kind: app-engine-service)
     */
    app_engine_service?: string;

    /**
     * @description Compute Engine backend service ID (for target_kind: compute, compute-regional)
     */
    backend_service?: string;

    /**
     * @description GCP region (for target_kind: compute-regional, cloud-run)
     */
    region?: string;

    /**
     * @description Cloud Run service name (for target_kind: cloud-run)
     */
    cloud_run_service?: string;

    /**
     * @description Organization numeric ID (for target_kind: organization)
     */
    organization_id?: string;

    /**
     * @description Folder numeric ID (for target_kind: folder)
     */
    folder_id?: string;

    /**
     * @description Verbatim IAP resource path (for target_kind: raw)
     */
    resource_path?: string;

    /**
     * @description Access-related IAP settings
     */
    access_settings?: IapAccessSettings;

    /**
     * @description Application-related IAP settings
     */
    application_settings?: IapApplicationSettings;
}

/**
 * IAP Settings entity state
 */
export interface IapSettingsState extends GcpEntityState {
    /**
     * @description Full IAP-protected resource path
     */
    resource_name?: string;

    /**
     * @description Snapshot of prior settings for restore on delete
     */
    prior_settings?: Record<string, unknown>;

    /**
     * @description Cached project number (resolved from project ID)
     */
    project_number?: string;
}

/**
 * @description GCP IAP Settings entity. Applies IAP settings (access and application) to an
 * existing IAP-protected resource. The resource must already exist — this entity only modifies
 * settings via PATCH. On delete, prior settings (if any) are restored; otherwise settings are
 * cleared.
 *
 * ## Required Permissions
 * - `iap.settings.get`
 * - `iap.settings.update`
 * - `resourcemanager.projects.get` (resolves project number)
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.resource_name` — full IAP resource path
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/iap-oauth-client` — supply client_id + secret into `access_settings.oauth_settings`
 */
export class IapSettings extends GcpEntity<IapSettingsDefinition, IapSettingsState> {

    static readonly readiness = { period: 5, initialDelay: 1, attempts: 3 };

    protected getEntityName(): string {
        return `GCP IAP Settings (${this.state.resource_name || this.definition.target_kind})`;
    }

    private getResourceName(): string {
        return resolveIapResourceName(
            this.definition as unknown as IapTarget,
            this.state,
            this.projectId,
        );
    }

    private buildIapSettingsBody(): Record<string, unknown> {
        const body: Record<string, unknown> = { name: this.getResourceName() };

        if (this.definition.access_settings) {
            body.accessSettings = this.transformAccessSettings(
                this.definition.access_settings as unknown as IapAccessSettings
            );
        }
        if (this.definition.application_settings) {
            body.applicationSettings = this.transformApplicationSettings(
                this.definition.application_settings as unknown as IapApplicationSettings
            );
        }
        return body;
    }

    private transformAccessSettings(s: IapAccessSettings): Record<string, unknown> {
        const out: Record<string, unknown> = {};

        if (s.oauth_settings) {
            const oauth: Record<string, unknown> = {};
            if (s.oauth_settings.client_id !== undefined) oauth.clientId = s.oauth_settings.client_id;
            if (s.oauth_settings.client_secret !== undefined) oauth.clientSecret = s.oauth_settings.client_secret;
            if (s.oauth_settings.login_hint !== undefined) oauth.loginHint = s.oauth_settings.login_hint;
            if (s.oauth_settings.programmatic_clients !== undefined) oauth.programmaticClients = s.oauth_settings.programmatic_clients;
            out.oauthSettings = oauth;
        }

        if (s.cors_settings) {
            const cors: Record<string, unknown> = {};
            if (s.cors_settings.allow_http_options !== undefined) cors.allowHttpOptions = s.cors_settings.allow_http_options;
            out.corsSettings = cors;
        }

        if (s.reauth_settings) {
            const reauth: Record<string, unknown> = {};
            if (s.reauth_settings.method !== undefined) reauth.method = s.reauth_settings.method;
            if (s.reauth_settings.max_age !== undefined) reauth.maxAge = s.reauth_settings.max_age;
            if (s.reauth_settings.policy_type !== undefined) reauth.policyType = s.reauth_settings.policy_type;
            out.reauthSettings = reauth;
        }

        if (s.allowed_domains_settings) {
            const ads: Record<string, unknown> = {};
            if (s.allowed_domains_settings.domains !== undefined) ads.domains = s.allowed_domains_settings.domains;
            if (s.allowed_domains_settings.enable !== undefined) ads.enable = s.allowed_domains_settings.enable;
            out.allowedDomainsSettings = ads;
        }

        if (s.gcip_settings) {
            const g: Record<string, unknown> = {};
            if (s.gcip_settings.tenant_ids !== undefined) g.tenantIds = s.gcip_settings.tenant_ids;
            if (s.gcip_settings.login_page_uri !== undefined) g.loginPageUri = s.gcip_settings.login_page_uri;
            out.gcipSettings = g;
        }

        if (s.identity_sources !== undefined) out.identitySources = s.identity_sources;

        return out;
    }

    private transformApplicationSettings(s: IapApplicationSettings): Record<string, unknown> {
        const out: Record<string, unknown> = {};

        if (s.access_denied_page_settings) {
            const adp: Record<string, unknown> = {};
            if (s.access_denied_page_settings.access_denied_page_uri !== undefined) {
                adp.accessDeniedPageUri = s.access_denied_page_settings.access_denied_page_uri;
            }
            if (s.access_denied_page_settings.generate_troubleshooting_uri !== undefined) {
                adp.generateTroubleshootingUri = s.access_denied_page_settings.generate_troubleshooting_uri;
            }
            if (s.access_denied_page_settings.remediation_token_generation_enabled !== undefined) {
                adp.remediationTokenGenerationEnabled = s.access_denied_page_settings.remediation_token_generation_enabled;
            }
            out.accessDeniedPageSettings = adp;
        }

        if (s.cookie_domain !== undefined) out.cookieDomain = s.cookie_domain;

        if (s.attribute_propagation_settings) {
            const aps: Record<string, unknown> = {};
            if (s.attribute_propagation_settings.output_credentials !== undefined) {
                aps.outputCredentials = s.attribute_propagation_settings.output_credentials;
            }
            if (s.attribute_propagation_settings.expression !== undefined) {
                aps.expression = s.attribute_propagation_settings.expression;
            }
            if (s.attribute_propagation_settings.enable !== undefined) {
                aps.enable = s.attribute_propagation_settings.enable;
            }
            out.attributePropagationSettings = aps;
        }

        if (s.csm_settings) {
            const csm: Record<string, unknown> = {};
            if (s.csm_settings.rctoken_aud !== undefined) csm.rctokenAud = s.csm_settings.rctoken_aud;
            out.csmSettings = csm;
        }

        return out;
    }

    override create(): void {
        const resourceName = this.getResourceName();
        const getUrl = `${IAP_API_URL}/${resourceName}:iapSettings`;

        const current = this.get(getUrl);
        if (current && (current.accessSettings || current.applicationSettings)) {
            this.state.prior_settings = {
                accessSettings: current.accessSettings,
                applicationSettings: current.applicationSettings,
            };
            this.state.existing = true;
        } else {
            this.state.existing = false;
        }

        this.applySettings();
    }

    override update(): void {
        this.applySettings();
    }

    override delete(): void {
        const resourceName = this.state.resource_name;
        if (!resourceName) return;

        const url = `${IAP_API_URL}/${resourceName}:iapSettings?updateMask=accessSettings,applicationSettings`;
        if (this.state.prior_settings) {
            const body: Record<string, unknown> = { name: resourceName, ...this.state.prior_settings };
            this.patch(url, body);
            cli.output(`Restored prior IAP settings on ${resourceName}`);
        } else {
            const body: Record<string, unknown> = {
                name: resourceName,
                accessSettings: {},
                applicationSettings: {},
            };
            this.patch(url, body);
            cli.output(`Cleared IAP settings on ${resourceName}`);
        }
    }

    private applySettings(): void {
        const resourceName = this.getResourceName();
        const body = this.buildIapSettingsBody();
        const paths = collectUpdateMaskPaths({
            accessSettings: body.accessSettings,
            applicationSettings: body.applicationSettings,
        });
        if (paths.length === 0) {
            cli.output("No IAP settings to apply (definition has no access_settings or application_settings)");
            return;
        }
        const url = `${IAP_API_URL}/${resourceName}:iapSettings?updateMask=${paths.join(",")}`;
        this.patch(url, body);
        cli.output(`Applied IAP settings on ${resourceName}`);
        cli.output(`  updateMask: ${paths.join(",")}`);
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.resource_name);
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    /**
     * Display current IAP settings (raw JSON)
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.resource_name) {
            throw new Error("IAP settings not applied yet");
        }
        const info = this.get(`${IAP_API_URL}/${this.state.resource_name}:iapSettings`);
        cli.output(`IAP Settings for ${this.state.resource_name}:`);
        cli.output(JSON.stringify(info, null, 2));
    }

    /**
     * Alias for get-info — prints the raw settings object
     */
    @action("show-raw")
    showRaw(_args?: Args): void {
        this.getInfo(_args);
    }
}
