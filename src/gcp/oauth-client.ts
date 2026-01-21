/**
 * GCP IAM OAuth Client Entity
 *
 * Creates and manages OAuth clients for Workforce Identity Federation.
 * These OAuth clients are used for integrating external identity providers
 * with GCP services.
 *
 * @see https://cloud.google.com/iam/docs/workforce-manage-oauth-app
 * @see https://cloud.google.com/iam/docs/reference/rest/v1/projects.locations.oauthClients
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { IAM_API_URL } from "./common.ts";

/**
 * OAuth Client types
 */
export type OAuthClientType = "CONFIDENTIAL_CLIENT" | "PUBLIC_CLIENT";

/**
 * OAuth Grant types
 */
export type OAuthGrantType =
    | "AUTHORIZATION_CODE_GRANT"
    | "REFRESH_TOKEN_GRANT"
    | "CLIENT_CREDENTIALS_GRANT";

/**
 * OAuth Client entity definition
 * @interface OAuthClientDefinition
 */
export interface OAuthClientDefinition extends GcpEntityDefinition {
    /**
     * @description The OAuth client ID. Must be unique within the project and location.
     * Used to identify this OAuth client.
     */
    name: string;

    /**
     * @description Location for the OAuth client.
     * @default global
     */
    location?: string;

    /**
     * @description Human-readable display name for the OAuth client.
     * Shown in the Cloud Console.
     */
    display_name?: string;

    /**
     * @description Description of the OAuth client's purpose.
     */
    client_description?: string;

    /**
     * @description The type of OAuth client.
     * - CONFIDENTIAL_CLIENT: Server-side apps that can securely store secrets
     * - PUBLIC_CLIENT: Client-side apps (mobile, SPA) that cannot securely store secrets
     * @default CONFIDENTIAL_CLIENT
     */
    client_type?: OAuthClientType;

    /**
     * @description List of allowed OAuth grant types for this client.
     * @default ["AUTHORIZATION_CODE_GRANT"]
     */
    allowed_grant_types?: OAuthGrantType[];

    /**
     * @description List of allowed redirect URIs for OAuth flows.
     * Required for authorization code grant type.
     */
    allowed_redirect_uris?: string[];

    /**
     * @description List of allowed OAuth scopes for this client.
     * @example ["https://www.googleapis.com/auth/cloud-platform"]
     */
    allowed_scopes?: string[];

    /**
     * @description Whether the OAuth client is disabled.
     * @default false
     */
    disabled?: boolean;
}

/**
 * OAuth Client entity state
 * @interface OAuthClientState
 */
export interface OAuthClientState extends GcpEntityState {
    /**
     * @description Full resource name of the OAuth client.
     * Format: projects/{project}/locations/{location}/oauthClients/{oauthClientId}
     */
    resource_name?: string;

    /**
     * @description The OAuth client ID
     */
    client_id?: string;

    /**
     * @description Current state of the OAuth client
     */
    state?: string;

    /**
     * @description Human-readable display name
     */
    display_name?: string;

    /**
     * @description When the OAuth client was created
     */
    create_time?: string;

    /**
     * @description When the OAuth client was last updated
     */
    update_time?: string;

    /**
     * @description When the OAuth client will expire (if set)
     */
    expire_time?: string;

    /**
     * @description Whether the OAuth client is disabled
     */
    disabled?: boolean;
}

/**
 * GCP IAM OAuth Client entity
 *
 * Creates and manages OAuth clients for Workforce Identity Federation.
 * OAuth clients enable external applications to authenticate users against
 * GCP's identity platform.
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none (use `gcp/oauth-client-credential` for client secrets)
 *
 * ## State Fields for Composition
 * - `state.resource_name` - Full resource name for API operations
 * - `state.client_id` - OAuth client ID for use in OAuth flows
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/oauth-client-credential` - Creates client secrets for this OAuth client
 * - `gcp/service-usage` - Enable the IAM API first
 *
 * ## Required IAM Permissions
 * - `iam.oauthClients.create`
 * - `iam.oauthClients.get`
 * - `iam.oauthClients.update`
 * - `iam.oauthClients.delete`
 *
 * Or use the predefined role: `roles/iam.oauthClientAdmin`
 *
 * @see https://cloud.google.com/iam/docs/workforce-manage-oauth-app
 *
 * @example Basic OAuth client for web application
 * ```yaml
 * my-oauth-client:
 *   defines: gcp/oauth-client
 *   name: my-web-app-client
 *   display_name: My Web Application
 *   client_description: OAuth client for my web application
 *   client_type: CONFIDENTIAL_CLIENT
 *   allowed_grant_types:
 *     - AUTHORIZATION_CODE_GRANT
 *     - REFRESH_TOKEN_GRANT
 *   allowed_redirect_uris:
 *     - https://myapp.example.com/oauth2/callback
 *     - http://localhost:3000/oauth2/callback
 *   allowed_scopes:
 *     - https://www.googleapis.com/auth/cloud-platform
 * ```
 *
 * @example Public OAuth client for mobile app
 * ```yaml
 * mobile-oauth-client:
 *   defines: gcp/oauth-client
 *   name: mobile-app-client
 *   display_name: Mobile Application
 *   client_type: PUBLIC_CLIENT
 *   allowed_grant_types:
 *     - AUTHORIZATION_CODE_GRANT
 *   allowed_redirect_uris:
 *     - myapp://oauth2/callback
 * ```
 *
 * @example OAuth client with credential
 * ```yaml
 * # Create the OAuth client
 * web-oauth-client:
 *   defines: gcp/oauth-client
 *   name: web-app-client
 *   display_name: Web Application
 *   client_type: CONFIDENTIAL_CLIENT
 *   allowed_grant_types:
 *     - AUTHORIZATION_CODE_GRANT
 *   allowed_redirect_uris:
 *     - https://myapp.example.com/callback
 *
 * # Create a credential (client secret)
 * web-oauth-credential:
 *   defines: gcp/oauth-client-credential
 *   oauth_client_id: <- connection-target("client") entity-state get-member("client_id")
 *   name: prod-secret
 *   secret: oauth-client-secret
 *   permitted-secrets:
 *     oauth-client-secret: true
 *   connections:
 *     client:
 *       runnable: gcp/oauth-client/web-oauth-client
 *       service: oauth-client
 * ```
 */
export class OAuthClient extends GcpEntity<OAuthClientDefinition, OAuthClientState> {

    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `OAuth Client ${this.definition.name}`;
    }

    /**
     * Get the location (defaults to global)
     */
    private get location(): string {
        return this.definition.location || "global";
    }

    /**
     * Get the IAM API base URL for OAuth clients in this project/location
     */
    private get oauthClientsApiUrl(): string {
        return `${IAM_API_URL}/projects/${this.projectId}/locations/${this.location}/oauthClients`;
    }

    /**
     * Get OAuth client details from API
     */
    private getOAuthClient(): any | null {
        return this.checkResourceExists(`${this.oauthClientsApiUrl}/${this.definition.name}`);
    }

    /**
     * Populate state from OAuth client response
     */
    private populateState(client: any): void {
        this.state.resource_name = client.name;
        this.state.client_id = client.name?.split("/").pop();
        this.state.state = client.state;
        this.state.display_name = client.displayName;
        this.state.create_time = client.createTime;
        this.state.update_time = client.updateTime;
        this.state.expire_time = client.expireTime;
        this.state.disabled = client.disabled || false;
    }

    override create(): void {
        // Check if OAuth client already exists
        const existing = this.getOAuthClient();

        if (existing) {
            cli.output(`OAuth client ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        // Build OAuth client configuration
        const body: any = {
            displayName: this.definition.display_name || this.definition.name,
            disabled: this.definition.disabled || false,
        };

        if (this.definition.client_description) {
            body.description = this.definition.client_description;
        }

        if (this.definition.client_type) {
            body.clientType = this.definition.client_type;
        }

        if (this.definition.allowed_grant_types && this.definition.allowed_grant_types.length > 0) {
            body.allowedGrantTypes = this.definition.allowed_grant_types;
        }

        if (this.definition.allowed_redirect_uris && this.definition.allowed_redirect_uris.length > 0) {
            body.allowedRedirectUris = this.definition.allowed_redirect_uris;
        }

        if (this.definition.allowed_scopes && this.definition.allowed_scopes.length > 0) {
            body.allowedScopes = this.definition.allowed_scopes;
        }

        cli.output(`Creating OAuth client: ${this.definition.name}`);

        // Create with the oauthClientId query parameter
        const url = `${this.oauthClientsApiUrl}?oauthClientId=${encodeURIComponent(this.definition.name)}`;
        const result = this.post(url, body);

        this.populateState(result);
        this.state.existing = false;

        cli.output(`OAuth client created: ${this.state.client_id}`);
    }

    override update(): void {
        const existing = this.getOAuthClient();

        if (!existing) {
            cli.output("OAuth client not found, creating...");
            this.create();
            return;
        }

        // Build update body
        const body: any = {};
        const updateMaskFields: string[] = [];

        if (this.definition.display_name) {
            body.displayName = this.definition.display_name;
            updateMaskFields.push("displayName");
        }

        if (this.definition.client_description !== undefined) {
            body.description = this.definition.client_description;
            updateMaskFields.push("description");
        }

        if (this.definition.allowed_redirect_uris !== undefined) {
            body.allowedRedirectUris = this.definition.allowed_redirect_uris;
            updateMaskFields.push("allowedRedirectUris");
        }

        if (this.definition.allowed_scopes !== undefined) {
            body.allowedScopes = this.definition.allowed_scopes;
            updateMaskFields.push("allowedScopes");
        }

        if (this.definition.allowed_grant_types !== undefined) {
            body.allowedGrantTypes = this.definition.allowed_grant_types;
            updateMaskFields.push("allowedGrantTypes");
        }

        if (this.definition.disabled !== undefined) {
            body.disabled = this.definition.disabled;
            updateMaskFields.push("disabled");
        }

        if (updateMaskFields.length === 0) {
            cli.output("No fields to update");
            this.populateState(existing);
            return;
        }

        const updateMask = updateMaskFields.join(",");
        const url = `${this.oauthClientsApiUrl}/${this.definition.name}?updateMask=${updateMask}`;

        cli.output(`Updating OAuth client: ${this.definition.name}`);
        const result = this.patch(url, body);

        this.populateState(result);
        cli.output(`OAuth client ${this.definition.name} updated`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`OAuth client ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getOAuthClient();
        if (!existing) {
            cli.output(`OAuth client ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting OAuth client: ${this.definition.name}`);
        this.httpDelete(`${this.oauthClientsApiUrl}/${this.definition.name}`);
        cli.output(`OAuth client ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        const client = this.getOAuthClient();
        if (!client) {
            cli.output("OAuth client not found");
            return false;
        }

        this.populateState(client);

        // Check if client is in ACTIVE state
        if (client.state && client.state !== "ACTIVE") {
            cli.output(`OAuth client state: ${client.state}`);
            return false;
        }

        if (client.disabled) {
            cli.output("OAuth client is disabled");
            return false;
        }

        cli.output(`OAuth client ${this.state.client_id} is ready`);
        return true;
    }

    override checkLiveness(): boolean {
        const client = this.getOAuthClient();
        return client !== null && !client.disabled;
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const client = this.getOAuthClient();
        if (!client) {
            throw new Error("OAuth client not found");
        }
        cli.output(JSON.stringify(client, null, 2));
    }

    @action("list-credentials")
    listCredentials(_args?: Args): void {
        const url = `${this.oauthClientsApiUrl}/${this.definition.name}/credentials`;
        const result = this.get(url);
        cli.output(JSON.stringify(result.oauthClientCredentials || [], null, 2));
    }

    @action("enable")
    enable(_args?: Args): void {
        const url = `${this.oauthClientsApiUrl}/${this.definition.name}?updateMask=disabled`;
        this.patch(url, { disabled: false });
        cli.output("OAuth client enabled");
    }

    @action("disable")
    disable(_args?: Args): void {
        const url = `${this.oauthClientsApiUrl}/${this.definition.name}?updateMask=disabled`;
        this.patch(url, { disabled: true });
        cli.output("OAuth client disabled");
    }
}
