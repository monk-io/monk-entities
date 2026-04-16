/**
 * GCP Identity Platform Tenant Entity
 *
 * Creates and manages Identity Platform tenants for multi-tenant user isolation.
 * Each tenant gets its own user pool and identity provider configurations.
 *
 * @see https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects.tenants
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IDENTITY_TOOLKIT_API_URL } from "./common.ts";

/**
 * MFA state options for tenant
 */
export type TenantMfaState = "DISABLED" | "ENABLED" | "MANDATORY";

/**
 * Identity Platform Tenant entity definition
 * @interface IdentityPlatformTenantDefinition
 */
export interface IdentityPlatformTenantDefinition extends GcpEntityDefinition {
    /**
     * @description Human-readable display name for the tenant.
     */
    display_name: string;

    /**
     * @description Allow email/password sign-up for this tenant.
     */
    allow_password_signup?: boolean;

    /**
     * @description Enable email link (passwordless) sign-in.
     */
    enable_email_link_signin?: boolean;

    /**
     * @description Enable anonymous users for this tenant.
     */
    enable_anonymous_user?: boolean;

    /**
     * @description Disable all authentication for this tenant.
     */
    disable_auth?: boolean;

    /**
     * @description Multi-factor authentication state: DISABLED, ENABLED, or MANDATORY.
     */
    mfa_state?: TenantMfaState;

    /**
     * @description MFA providers to enable (e.g., PHONE_SMS).
     */
    mfa_enabled_providers?: string[];

    /**
     * @description Automatically delete anonymous user accounts.
     */
    autodelete_anonymous_users?: boolean;
}

/**
 * Identity Platform Tenant entity state
 * @interface IdentityPlatformTenantState
 */
export interface IdentityPlatformTenantState extends GcpEntityState {
    /**
     * @description Full resource name of the tenant (projects/{project}/tenants/{tenant}).
     */
    resource_name?: string;

    /**
     * @description The tenant ID (extracted from resource name).
     */
    tenant_id?: string;

    /**
     * @description Human-readable display name.
     */
    display_name?: string;

    /**
     * @description Whether email/password sign-up is allowed.
     */
    allow_password_signup?: boolean;

    /**
     * @description Whether email link sign-in is enabled.
     */
    enable_email_link_signin?: boolean;

    /**
     * @description Whether anonymous users are enabled.
     */
    enable_anonymous_user?: boolean;

    /**
     * @description Whether authentication is disabled.
     */
    disable_auth?: boolean;
}

/**
 * @description GCP Identity Platform tenant entity.
 * Creates and manages Identity Platform tenants for multi-tenant user isolation.
 * Each tenant has its own user pool, sign-in settings, and identity provider
 * configurations, enabling SaaS applications to isolate users per customer.
 *
 * ## Required Permissions
 * - `identitytoolkit.tenants.create` — create tenants
 * - `identitytoolkit.tenants.get` — read tenant details
 * - `identitytoolkit.tenants.list` — list tenants
 * - `identitytoolkit.tenants.update` — update tenant settings
 * - `identitytoolkit.tenants.delete` — delete tenants
 *
 * Or use the predefined role: `roles/identityplatform.admin`
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.tenant_id` — Tenant ID, used by IdP config entities to scope providers to a tenant
 * - `state.resource_name` — Full resource name for API operations
 * - `state.display_name` — Human-readable tenant name
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/identity-platform-config` — Must have allow_tenants: true
 * - `gcp/identity-platform-oauth-idp-config` — Configure OIDC providers per tenant
 * - `gcp/identity-platform-default-idp-config` — Configure social providers per tenant
 * - `gcp/identity-platform-inbound-saml-config` — Configure SAML providers per tenant
 *
 * @example Basic tenant
 * ```yaml
 * my-tenant:
 *   defines: gcp/identity-platform-tenant
 *   display_name: Acme Corp
 *   allow_password_signup: true
 *   enable_email_link_signin: false
 *   services:
 *     tenant:
 *       protocol: custom
 * ```
 *
 * @example Tenant with MFA
 * ```yaml
 * secure-tenant:
 *   defines: gcp/identity-platform-tenant
 *   display_name: Secure Corp
 *   allow_password_signup: true
 *   mfa_state: MANDATORY
 *   mfa_enabled_providers:
 *     - PHONE_SMS
 *   services:
 *     tenant:
 *       protocol: custom
 * ```
 *
 * @example Tenant with OIDC provider
 * ```yaml
 * corp-tenant:
 *   defines: gcp/identity-platform-tenant
 *   display_name: Corp Tenant
 *   allow_password_signup: true
 *   services:
 *     tenant:
 *       protocol: custom
 *
 * corp-oidc:
 *   defines: gcp/identity-platform-oauth-idp-config
 *   name: oidc.corp-sso
 *   tenant_id: <- connection-target("tenant") entity-state get-member("tenant_id")
 *   display_name: Corp SSO
 *   enabled: true
 *   client_id: my-oidc-client-id
 *   issuer: https://accounts.google.com
 *   response_type_code: true
 *   connections:
 *     tenant:
 *       runnable: gcp/identity-platform-tenant/corp-tenant
 *       service: tenant
 *   depends:
 *     wait-for:
 *       runnables:
 *         - gcp/identity-platform-tenant/corp-tenant
 *       timeout: 120
 * ```
 */
export class IdentityPlatformTenant extends GcpEntity<IdentityPlatformTenantDefinition, IdentityPlatformTenantState> {

    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Identity Platform Tenant ${this.definition.display_name}`;
    }

    /**
     * Get the tenants API URL for this project
     */
    private get tenantsApiUrl(): string {
        return `${IDENTITY_TOOLKIT_API_URL}/projects/${this.projectId}/tenants`;
    }

    /**
     * Get tenant by ID from state
     */
    private getTenant(): any | null {
        if (!this.state.tenant_id) {
            return null;
        }
        return this.checkResourceExists(`${this.tenantsApiUrl}/${this.state.tenant_id}`);
    }

    /**
     * Find tenant by display name
     */
    private findTenantByDisplayName(): any | null {
        try {
            const result = this.get(`${this.tenantsApiUrl}?pageSize=1000`);
            if (result.tenants && Array.isArray(result.tenants)) {
                return result.tenants.find((t: any) => t.displayName === this.definition.display_name) || null;
            }
        } catch {
            // Ignore errors during search
        }
        return null;
    }

    /**
     * Populate state from tenant response
     */
    private populateState(tenant: any): void {
        this.state.resource_name = tenant.name;
        this.state.tenant_id = tenant.name?.split("/").pop();
        this.state.display_name = tenant.displayName;
        this.state.allow_password_signup = tenant.allowPasswordSignup;
        this.state.enable_email_link_signin = tenant.enableEmailLinkSignin;
        this.state.enable_anonymous_user = tenant.enableAnonymousUser;
        this.state.disable_auth = tenant.disableAuth;
    }

    /**
     * Build tenant body from definition
     */
    private buildTenantBody(): any {
        const body: any = {
            displayName: this.definition.display_name,
        };

        if (this.definition.allow_password_signup !== undefined) {
            body.allowPasswordSignup = this.definition.allow_password_signup;
        }

        if (this.definition.enable_email_link_signin !== undefined) {
            body.enableEmailLinkSignin = this.definition.enable_email_link_signin;
        }

        if (this.definition.enable_anonymous_user !== undefined) {
            body.enableAnonymousUser = this.definition.enable_anonymous_user;
        }

        if (this.definition.disable_auth !== undefined) {
            body.disableAuth = this.definition.disable_auth;
        }

        if (this.definition.mfa_state !== undefined) {
            const mfaConfig: any = { state: this.definition.mfa_state };
            if (this.definition.mfa_enabled_providers) {
                mfaConfig.enabledProviders = this.definition.mfa_enabled_providers;
            }
            body.mfaConfig = mfaConfig;
        }

        if (this.definition.autodelete_anonymous_users !== undefined) {
            body.autodeleteAnonymousUsers = this.definition.autodelete_anonymous_users;
        }

        return body;
    }

    override create(): void {
        // Check if tenant already exists by display name
        const existing = this.findTenantByDisplayName();
        if (existing) {
            cli.output(`Tenant "${this.definition.display_name}" already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        const body = this.buildTenantBody();

        cli.output(`Creating Identity Platform tenant: ${this.definition.display_name}`);
        const result = this.post(this.tenantsApiUrl, body);

        this.populateState(result);
        this.state.existing = false;
        cli.output(`Tenant created: ${this.state.tenant_id}`);
    }

    override update(): void {
        if (!this.state.tenant_id) {
            this.create();
            return;
        }

        const existing = this.getTenant();
        if (!existing) {
            cli.output("Tenant not found, creating...");
            this.state.tenant_id = undefined;
            this.create();
            return;
        }

        const body: any = {};
        const updateMaskFields: string[] = [];

        if (this.definition.display_name) {
            body.displayName = this.definition.display_name;
            updateMaskFields.push("displayName");
        }

        if (this.definition.allow_password_signup !== undefined) {
            body.allowPasswordSignup = this.definition.allow_password_signup;
            updateMaskFields.push("allowPasswordSignup");
        }

        if (this.definition.enable_email_link_signin !== undefined) {
            body.enableEmailLinkSignin = this.definition.enable_email_link_signin;
            updateMaskFields.push("enableEmailLinkSignin");
        }

        if (this.definition.enable_anonymous_user !== undefined) {
            body.enableAnonymousUser = this.definition.enable_anonymous_user;
            updateMaskFields.push("enableAnonymousUser");
        }

        if (this.definition.disable_auth !== undefined) {
            body.disableAuth = this.definition.disable_auth;
            updateMaskFields.push("disableAuth");
        }

        if (this.definition.mfa_state !== undefined) {
            const mfaConfig: any = { state: this.definition.mfa_state };
            if (this.definition.mfa_enabled_providers) {
                mfaConfig.enabledProviders = this.definition.mfa_enabled_providers;
            }
            body.mfaConfig = mfaConfig;
            updateMaskFields.push("mfaConfig");
        }

        if (this.definition.autodelete_anonymous_users !== undefined) {
            body.autodeleteAnonymousUsers = this.definition.autodelete_anonymous_users;
            updateMaskFields.push("autodeleteAnonymousUsers");
        }

        if (updateMaskFields.length === 0) {
            cli.output("No fields to update");
            this.populateState(existing);
            return;
        }

        const updateMask = updateMaskFields.join(",");
        const url = `${this.tenantsApiUrl}/${this.state.tenant_id}?updateMask=${updateMask}`;

        cli.output(`Updating tenant: ${this.state.tenant_id}`);
        const result = this.patch(url, body);
        this.populateState(result);
        cli.output(`Tenant ${this.state.tenant_id} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Tenant ${this.state.tenant_id} was not created by this entity, skipping delete`);
            return;
        }

        if (!this.state.tenant_id) {
            cli.output("No tenant to delete");
            return;
        }

        const existing = this.getTenant();
        if (!existing) {
            cli.output(`Tenant ${this.state.tenant_id} does not exist`);
            return;
        }

        cli.output(`Deleting tenant: ${this.state.tenant_id}`);
        this.httpDelete(`${this.tenantsApiUrl}/${this.state.tenant_id}`);
        cli.output(`Tenant ${this.state.tenant_id} deleted`);
    }

    override checkReadiness(): boolean {
        if (!this.state.tenant_id) {
            cli.output("Tenant not created yet");
            return false;
        }

        const tenant = this.getTenant();
        if (!tenant) {
            cli.output("Tenant not found");
            return false;
        }

        this.populateState(tenant);

        if (tenant.disableAuth) {
            cli.output("Tenant has authentication disabled");
            // Still considered ready — disabled auth is a valid state
        }

        cli.output(`Tenant ${this.state.tenant_id} is ready`);
        return true;
    }

    override checkLiveness(): boolean {
        if (!this.state.tenant_id) {
            return false;
        }
        const tenant = this.getTenant();
        return tenant !== null;
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.tenant_id) {
            throw new Error("Tenant not created yet");
        }
        const tenant = this.getTenant();
        if (!tenant) {
            throw new Error("Tenant not found");
        }
        cli.output(JSON.stringify(tenant, null, 2));
    }

    @action("list-tenants")
    listTenants(_args?: Args): void {
        const result = this.get(`${this.tenantsApiUrl}?pageSize=100`);
        const tenants = result.tenants || [];
        if (tenants.length === 0) {
            cli.output("No tenants found");
            return;
        }
        for (const tenant of tenants) {
            const id = tenant.name?.split("/").pop();
            cli.output(`${id}: ${tenant.displayName || "(no name)"} [auth: ${tenant.disableAuth ? "disabled" : "enabled"}]`);
        }
    }
}
