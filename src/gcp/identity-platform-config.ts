/**
 * GCP Identity Platform Config Entity
 *
 * Manages project-level Identity Platform configuration including
 * sign-in methods, MFA, authorized domains, and multi-tenancy settings.
 *
 * @see https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects/getConfig
 * @see https://cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IDENTITY_TOOLKIT_API_URL } from "./common.ts";

/**
 * MFA state options
 */
export type MfaState = "DISABLED" | "ENABLED" | "MANDATORY";

/**
 * Identity Platform Config entity definition
 * @interface IdentityPlatformConfigDefinition
 */
export interface IdentityPlatformConfigDefinition extends GcpEntityDefinition {
    /**
     * @description List of domains authorized for OAuth redirects.
     */
    authorized_domains?: string[];

    /**
     * @description Enable email/password sign-in.
     */
    sign_in_email_enabled?: boolean;

    /**
     * @description Require password for email sign-in (only relevant when email is enabled).
     */
    sign_in_email_password_required?: boolean;

    /**
     * @description Enable phone number sign-in.
     */
    sign_in_phone_enabled?: boolean;

    /**
     * @description Enable anonymous sign-in.
     */
    sign_in_anonymous_enabled?: boolean;

    /**
     * @description Allow multiple accounts with the same email address.
     */
    allow_duplicate_emails?: boolean;

    /**
     * @description Multi-factor authentication state: DISABLED, ENABLED, or MANDATORY.
     */
    mfa_state?: MfaState;

    /**
     * @description MFA providers to enable (e.g., PHONE_SMS).
     */
    mfa_enabled_providers?: string[];

    /**
     * @description Enable multi-tenancy support.
     */
    allow_tenants?: boolean;

    /**
     * @description Default location for tenant data (e.g., us-central1).
     */
    default_tenant_location?: string;

    /**
     * @description Automatically delete anonymous user accounts.
     */
    autodelete_anonymous_users?: boolean;
}

/**
 * Identity Platform Config entity state
 * @interface IdentityPlatformConfigState
 */
export interface IdentityPlatformConfigState extends GcpEntityState {
    /**
     * @description Full resource name of the config (projects/{project}/config).
     */
    resource_name?: string;

    /**
     * @description Identity Platform subtype (IDENTITY_PLATFORM or FIREBASE_AUTH).
     */
    subtype?: string;

    /**
     * @description List of authorized domains.
     */
    authorized_domains?: string[];

    /**
     * @description Whether email sign-in is enabled.
     */
    sign_in_email_enabled?: boolean;

    /**
     * @description Whether phone sign-in is enabled.
     */
    sign_in_phone_enabled?: boolean;

    /**
     * @description Whether anonymous sign-in is enabled.
     */
    sign_in_anonymous_enabled?: boolean;

    /**
     * @description Current MFA state.
     */
    mfa_state?: string;

    /**
     * @description Whether multi-tenancy is enabled.
     */
    allow_tenants?: boolean;

    /**
     * @description The API key for client-side operations.
     */
    client_api_key?: string;
}

/**
 * @description GCP Identity Platform project configuration entity.
 * Manages project-level Identity Platform settings including sign-in methods,
 * MFA, authorized domains, and multi-tenancy. This resource always exists once
 * Identity Platform is enabled — create applies configuration, delete is a no-op.
 *
 * ## Required Permissions
 * - `firebaseauth.configs.get` — read configuration
 * - `firebaseauth.configs.update` — update configuration
 *
 * Or use the predefined role: `roles/identityplatform.admin`
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.resource_name` — Full resource name for API operations
 * - `state.subtype` — Platform subtype (IDENTITY_PLATFORM or FIREBASE_AUTH)
 * - `state.allow_tenants` — Whether multi-tenancy is enabled
 * - `state.client_api_key` — API key for client-side SDK operations
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/identity-platform-tenant` — Create tenants (requires allow_tenants: true)
 * - `gcp/identity-platform-default-idp-config` — Configure social sign-in providers at project level
 * - `gcp/identity-platform-oauth-idp-config` — Configure OIDC providers at project level
 * - `gcp/identity-platform-inbound-saml-config` — Configure SAML providers at project level
 * - `gcp/service-usage` — Enable identitytoolkit.googleapis.com API first
 *
 * @example Basic Identity Platform configuration
 * ```yaml
 * my-identity-config:
 *   defines: gcp/identity-platform-config
 *   authorized_domains:
 *     - myapp.example.com
 *     - localhost
 *   sign_in_email_enabled: true
 *   sign_in_email_password_required: true
 *   sign_in_anonymous_enabled: false
 *   mfa_state: ENABLED
 *   mfa_enabled_providers:
 *     - PHONE_SMS
 * ```
 *
 * @example Multi-tenant configuration
 * ```yaml
 * identity-config:
 *   defines: gcp/identity-platform-config
 *   allow_tenants: true
 *   default_tenant_location: us-central1
 *   sign_in_email_enabled: true
 *   authorized_domains:
 *     - myapp.example.com
 * ```
 */
export class IdentityPlatformConfig extends GcpEntity<IdentityPlatformConfigDefinition, IdentityPlatformConfigState> {

    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Identity Platform Config (project: ${this.projectId})`;
    }

    /**
     * Get the config API URL for this project
     */
    private get configApiUrl(): string {
        return `${IDENTITY_TOOLKIT_API_URL}/projects/${this.projectId}/config`;
    }

    /**
     * Ensure Identity Platform is initialized for the project.
     * Attempts initializeAuth which is idempotent — safe to call even if already initialized.
     */
    private ensureInitialized(): void {
        // First check if config already exists
        const existing = this.getConfig();
        if (existing) {
            cli.output("Identity Platform config already exists");
            return;
        }

        // Config not found — try to initialize
        cli.output("Identity Platform config not found, attempting initialization...");
        const initUrl = `${IDENTITY_TOOLKIT_API_URL}/projects/${this.projectId}/identityPlatform:initializeAuth`;
        try {
            const result = this.post(initUrl, {});
            cli.output(`Identity Platform initialized: ${JSON.stringify(result)}`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            // ALREADY_EXISTS is expected if already initialized
            if (msg.includes("ALREADY_EXISTS") || msg.includes("already")) {
                cli.output("Identity Platform already initialized");
            } else {
                throw new Error(`Failed to initialize Identity Platform: ${msg}`);
            }
        }
    }

    /**
     * Get the current project config
     */
    private getConfig(): any | null {
        return this.checkResourceExists(this.configApiUrl);
    }

    /**
     * Populate state from config response
     */
    private populateState(config: any): void {
        this.state.resource_name = config.name;
        this.state.subtype = config.subtype;
        this.state.authorized_domains = config.authorizedDomains;
        this.state.client_api_key = config.client?.apiKey;

        if (config.signIn) {
            this.state.sign_in_email_enabled = config.signIn.email?.enabled;
            this.state.sign_in_phone_enabled = config.signIn.phoneNumber?.enabled;
            this.state.sign_in_anonymous_enabled = config.signIn.anonymous?.enabled;
        }

        if (config.mfa) {
            this.state.mfa_state = config.mfa.state;
        }

        if (config.multiTenant) {
            this.state.allow_tenants = config.multiTenant.allowTenants;
        }
    }

    /**
     * Build the config body from definition fields
     */
    private buildConfigBody(): { body: any; updateMaskFields: string[] } {
        const body: any = {};
        const updateMaskFields: string[] = [];

        if (this.definition.authorized_domains !== undefined) {
            body.authorizedDomains = this.definition.authorized_domains;
            updateMaskFields.push("authorizedDomains");
        }

        // Sign-in config
        const signIn: any = {};
        let hasSignIn = false;

        if (this.definition.sign_in_email_enabled !== undefined) {
            signIn.email = { enabled: this.definition.sign_in_email_enabled };
            if (this.definition.sign_in_email_password_required !== undefined) {
                signIn.email.passwordRequired = this.definition.sign_in_email_password_required;
            }
            updateMaskFields.push("signIn.email");
            hasSignIn = true;
        }

        if (this.definition.sign_in_phone_enabled !== undefined) {
            signIn.phoneNumber = { enabled: this.definition.sign_in_phone_enabled };
            updateMaskFields.push("signIn.phoneNumber");
            hasSignIn = true;
        }

        if (this.definition.sign_in_anonymous_enabled !== undefined) {
            signIn.anonymous = { enabled: this.definition.sign_in_anonymous_enabled };
            updateMaskFields.push("signIn.anonymous");
            hasSignIn = true;
        }

        if (this.definition.allow_duplicate_emails !== undefined) {
            signIn.allowDuplicateEmails = this.definition.allow_duplicate_emails;
            updateMaskFields.push("signIn.allowDuplicateEmails");
            hasSignIn = true;
        }

        if (hasSignIn) {
            body.signIn = signIn;
        }

        // MFA config
        if (this.definition.mfa_state !== undefined) {
            const mfa: any = { state: this.definition.mfa_state };
            if (this.definition.mfa_enabled_providers) {
                mfa.enabledProviders = this.definition.mfa_enabled_providers;
            }
            body.mfa = mfa;
            updateMaskFields.push("mfa");
        }

        // Multi-tenant config
        if (this.definition.allow_tenants !== undefined) {
            const multiTenant: any = { allowTenants: this.definition.allow_tenants };
            if (this.definition.default_tenant_location) {
                multiTenant.defaultTenantLocation = this.definition.default_tenant_location;
            }
            body.multiTenant = multiTenant;
            updateMaskFields.push("multiTenant");
        }

        if (this.definition.autodelete_anonymous_users !== undefined) {
            body.autodeleteAnonymousUsers = this.definition.autodelete_anonymous_users;
            updateMaskFields.push("autodeleteAnonymousUsers");
        }

        return { body, updateMaskFields };
    }

    override create(): void {
        // Ensure Identity Platform is initialized
        this.ensureInitialized();

        const existing = this.getConfig();
        if (existing) {
            this.state.existing = true;
        }

        const { body, updateMaskFields } = this.buildConfigBody();

        if (updateMaskFields.length === 0) {
            cli.output("No configuration fields specified, reading current config...");
            if (existing) {
                this.populateState(existing);
            }
            return;
        }

        const updateMask = updateMaskFields.join(",");
        const url = `${this.configApiUrl}?updateMask=${updateMask}`;

        cli.output(`Configuring Identity Platform for project: ${this.projectId}`);
        const result = this.patch(url, body);
        this.populateState(result);
        cli.output("Identity Platform configuration applied");
    }

    override update(): void {
        const { body, updateMaskFields } = this.buildConfigBody();

        if (updateMaskFields.length === 0) {
            cli.output("No fields to update");
            const config = this.getConfig();
            if (config) {
                this.populateState(config);
            }
            return;
        }

        const updateMask = updateMaskFields.join(",");
        const url = `${this.configApiUrl}?updateMask=${updateMask}`;

        cli.output("Updating Identity Platform configuration...");
        const result = this.patch(url, body);
        this.populateState(result);
        cli.output("Identity Platform configuration updated");
    }

    override delete(): void {
        // Project config cannot be deleted — it's always there
        cli.output("Identity Platform project config cannot be deleted (no-op)");
    }

    override checkReadiness(): boolean {
        const config = this.getConfig();
        if (!config) {
            cli.output("Identity Platform config not found — is the API enabled?");
            return false;
        }

        this.populateState(config);

        if (config.subtype !== "IDENTITY_PLATFORM") {
            cli.output(`Identity Platform subtype: ${config.subtype} (expected IDENTITY_PLATFORM)`);
            return false;
        }

        cli.output("Identity Platform config is ready");
        return true;
    }

    override checkLiveness(): boolean {
        const config = this.getConfig();
        return config !== null;
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const config = this.getConfig();
        if (!config) {
            throw new Error("Identity Platform config not found");
        }
        cli.output(JSON.stringify(config, null, 2));
    }

    @action("get-config")
    getConfigAction(_args?: Args): void {
        const config = this.getConfig();
        if (!config) {
            throw new Error("Identity Platform config not found");
        }

        cli.output("=== Identity Platform Configuration ===");
        cli.output(`Project: ${this.projectId}`);
        cli.output(`Subtype: ${config.subtype || "unknown"}`);

        if (config.signIn) {
            cli.output("\nSign-in Methods:");
            cli.output(`  Email: ${config.signIn.email?.enabled ?? false}`);
            cli.output(`  Phone: ${config.signIn.phoneNumber?.enabled ?? false}`);
            cli.output(`  Anonymous: ${config.signIn.anonymous?.enabled ?? false}`);
            cli.output(`  Duplicate emails: ${config.signIn.allowDuplicateEmails ?? false}`);
        }

        if (config.mfa) {
            cli.output(`\nMFA: ${config.mfa.state || "DISABLED"}`);
            if (config.mfa.enabledProviders) {
                cli.output(`  Providers: ${config.mfa.enabledProviders.join(", ")}`);
            }
        }

        if (config.multiTenant) {
            cli.output(`\nMulti-tenant: ${config.multiTenant.allowTenants ?? false}`);
            if (config.multiTenant.defaultTenantLocation) {
                cli.output(`  Default location: ${config.multiTenant.defaultTenantLocation}`);
            }
        }

        if (config.authorizedDomains) {
            cli.output(`\nAuthorized domains: ${config.authorizedDomains.join(", ")}`);
        }
    }
}
