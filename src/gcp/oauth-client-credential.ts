/**
 * GCP IAM OAuth Client Credential Entity
 *
 * Creates and manages credentials (client secrets) for OAuth clients.
 * Stores the client secret in a Monk secret for use by applications.
 *
 * @see https://cloud.google.com/iam/docs/workforce-manage-oauth-app
 * @see https://cloud.google.com/iam/docs/reference/rest/v1/projects.locations.oauthClients.credentials
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import secret from "secret";
import cli from "cli";
import { IAM_API_URL } from "./common.ts";

/**
 * OAuth Client Credential entity definition
 * @interface OAuthClientCredentialDefinition
 */
export interface OAuthClientCredentialDefinition extends GcpEntityDefinition {
    /**
     * @description The credential ID. Must be unique within the OAuth client.
     */
    name: string;

    /**
     * @description Secret name where the client secret will be stored.
     * The secret will contain a JSON object with clientId and clientSecret.
     */
    secret: string;

    /**
     * @description The OAuth client ID this credential belongs to.
     * Usually obtained from connection to `gcp/oauth-client`.
     */
    oauth_client_id: string;

    /**
     * @description Location for the OAuth client.
     * @default global
     */
    location?: string;

    /**
     * @description Human-readable display name for this credential.
     */
    display_name?: string;

    /**
     * @description Whether the credential is disabled.
     * @default false
     */
    disabled?: boolean;
}

/**
 * OAuth Client Credential entity state
 * @interface OAuthClientCredentialState
 */
export interface OAuthClientCredentialState extends GcpEntityState {
    /**
     * @description Full resource name of the credential.
     * Format: projects/{project}/locations/{location}/oauthClients/{clientId}/credentials/{credentialId}
     */
    resource_name?: string;

    /**
     * @description The credential ID
     */
    credential_id?: string;

    /**
     * @description When the credential was created
     */
    create_time?: string;

    /**
     * @description When the credential will expire (if set)
     */
    expire_time?: string;

    /**
     * @description Whether the credential is disabled
     */
    disabled?: boolean;
}

/**
 * GCP IAM OAuth Client Credential entity
 *
 * Creates credentials (client secrets) for OAuth clients and stores them
 * in Monk secrets for use by applications.
 *
 * ## Secrets
 * **⚠️ WRITES SECRETS** - This entity writes the client credentials (JSON with
 * clientId and clientSecret) to a Monk secret. You MUST add `permitted-secrets`
 * to allow the entity to write the credential:
 * ```yaml
 * permitted-secrets:
 *   <secret>: true
 * ```
 *
 * The secret contains JSON in the format:
 * ```json
 * {
 *   "clientId": "...",
 *   "clientSecret": "..."
 * }
 * ```
 *
 * ## Dependencies
 * - **REQUIRED**: `gcp/oauth-client` - Must be created first
 * - Pass the OAuth client's `state.client_id` to `oauth_client_id` field
 *
 * ## State Fields for Composition
 * - `state.credential_id` - Unique identifier for this credential
 * - `state.resource_name` - Full resource name for API operations
 *
 * ## Required IAM Permissions
 * - `iam.oauthClientCredentials.create`
 * - `iam.oauthClientCredentials.get`
 * - `iam.oauthClientCredentials.delete`
 *
 * Or use the predefined role: `roles/iam.oauthClientAdmin`
 *
 * @see https://cloud.google.com/iam/docs/workforce-manage-oauth-app
 *
 * @example OAuth client credential
 * ```yaml
 * # Create the OAuth client first
 * my-oauth-client:
 *   defines: gcp/oauth-client
 *   name: my-web-app-client
 *   display_name: My Web Application
 *   client_type: CONFIDENTIAL_CLIENT
 *   allowed_grant_types:
 *     - AUTHORIZATION_CODE_GRANT
 *   allowed_redirect_uris:
 *     - https://myapp.example.com/callback
 *
 * # Create a credential for the client
 * my-credential:
 *   defines: gcp/oauth-client-credential
 *   name: prod-secret-v1
 *   oauth_client_id: <- connection-target("client") entity-state get-member("client_id")
 *   secret: my-oauth-credentials
 *   display_name: Production Secret v1
 *   permitted-secrets:
 *     my-oauth-credentials: true
 *   connections:
 *     client:
 *       runnable: gcp/oauth-client/my-oauth-client
 *       service: oauth-client
 * ```
 *
 * @example Using the credential in an application
 * ```yaml
 * # The secret 'my-oauth-credentials' contains:
 * # {
 * #   "clientId": "my-web-app-client",
 * #   "clientSecret": "auto-generated-secret"
 * # }
 * #
 * # Use in your application:
 * my-app:
 *   defines: runnable
 *   variables:
 *     oauth-credentials:
 *       type: string
 *       value: <- secret("my-oauth-credentials")
 *       env: OAUTH_CREDENTIALS
 * ```
 */
export class OAuthClientCredential extends GcpEntity<OAuthClientCredentialDefinition, OAuthClientCredentialState> {

    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `OAuth Client Credential ${this.definition.name}`;
    }

    /**
     * Get the location (defaults to global)
     */
    private get location(): string {
        return this.definition.location || "global";
    }

    /**
     * Get the IAM API base URL for credentials on this OAuth client
     */
    private get credentialsApiUrl(): string {
        return `${IAM_API_URL}/projects/${this.projectId}/locations/${this.location}/oauthClients/${this.definition.oauth_client_id}/credentials`;
    }

    /**
     * Get credential details from API
     */
    private getCredential(): any | null {
        return this.checkResourceExists(`${this.credentialsApiUrl}/${this.definition.name}`);
    }

    /**
     * Populate state from credential response
     */
    private populateState(credential: any): void {
        this.state.resource_name = credential.name;
        this.state.credential_id = credential.name?.split("/").pop();
        this.state.create_time = credential.createTime;
        this.state.expire_time = credential.expireTime;
        this.state.disabled = credential.disabled || false;
    }

    override create(): void {
        // Check if credential already exists in GCP
        const existing = this.getCredential();

        if (existing) {
            cli.output(`OAuth client credential ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        // Build credential configuration
        const body: any = {
            displayName: this.definition.display_name || this.definition.name,
            disabled: this.definition.disabled || false,
        };

        cli.output(`Creating OAuth client credential: ${this.definition.name}`);

        // Create with the oauthClientCredentialId query parameter
        const url = `${this.credentialsApiUrl}?oauthClientCredentialId=${encodeURIComponent(this.definition.name)}`;
        const result = this.post(url, body);

        // The response includes the client secret only at creation time
        if (!result.clientSecret) {
            // This should never happen - GCP API always returns clientSecret on creation.
            // If it does happen, we must fail because:
            // 1. The credential exists in GCP but we don't have the secret
            // 2. checkReadiness() will always fail (no secret stored)
            // 3. Subsequent create() calls will just adopt the existing credential, still without the secret
            // Delete the credential to allow retry
            try {
                this.httpDelete(`${this.credentialsApiUrl}/${this.definition.name}`);
                cli.output("Deleted orphaned credential from GCP to allow retry");
            } catch {
                // Ignore delete errors
            }
            throw new Error(
                `GCP API did not return clientSecret for credential ${this.definition.name}. ` +
                `This is unexpected. The credential has been deleted from GCP to allow retry.`
            );
        }

        // Store credentials as JSON
        const credentials = {
            clientId: this.definition.oauth_client_id,
            clientSecret: result.clientSecret,
            credentialId: this.definition.name,
        };
        secret.set(this.definition.secret, JSON.stringify(credentials, null, 2));
        cli.output(`Credential stored in secret: ${this.definition.secret}`);

        this.populateState(result);
        this.state.existing = false;

        cli.output(`OAuth client credential created: ${this.state.credential_id}`);
    }

    override update(): void {
        // Credentials can't be updated - they must be recreated
        if (!this.state.resource_name) {
            this.create();
            return;
        }

        cli.output("OAuth client credentials cannot be updated. Delete and recreate if needed.");

        // Refresh state
        const existing = this.getCredential();
        if (existing) {
            this.populateState(existing);
        }
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Credential was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getCredential();
        if (!existing) {
            cli.output(`Credential ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting OAuth client credential: ${this.definition.name}`);

        // Delete the credential from GCP
        this.httpDelete(`${this.credentialsApiUrl}/${this.definition.name}`);

        // Remove the secret
        try {
            secret.remove(this.definition.secret);
            cli.output(`Removed secret: ${this.definition.secret}`);
        } catch {
            cli.output(`Could not remove secret: ${this.definition.secret}`);
        }

        cli.output(`OAuth client credential deleted`);
    }

    override checkReadiness(): boolean {
        // Check if the credential exists in GCP
        if (!this.state.resource_name) {
            cli.output("Credential not created yet");
            return false;
        }

        // Verify the secret has the credential
        try {
            const credData = secret.get(this.definition.secret);
            if (!credData) {
                cli.output("Credential not found in secret");
                return false;
            }
        } catch {
            cli.output("Could not retrieve credential from secret");
            return false;
        }

        // Check if credential exists in GCP
        const credential = this.getCredential();
        if (!credential) {
            cli.output("Credential not found in GCP");
            return false;
        }

        if (credential.disabled) {
            cli.output("Credential is disabled");
            return false;
        }

        cli.output(`OAuth client credential is ready`);
        return true;
    }

    override checkLiveness(): boolean {
        try {
            const credData = secret.get(this.definition.secret);
            if (!credData) return false;

            const credential = this.getCredential();
            return credential !== null && !credential.disabled;
        } catch {
            return false;
        }
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const credential = this.getCredential();
        if (!credential) {
            throw new Error("Credential not found");
        }
        // Don't expose the secret, just metadata
        cli.output(JSON.stringify(credential, null, 2));
    }

    @action("enable")
    enable(_args?: Args): void {
        const url = `${this.credentialsApiUrl}/${this.definition.name}?updateMask=disabled`;
        this.patch(url, { disabled: false });
        cli.output("Credential enabled");
    }

    @action("disable")
    disable(_args?: Args): void {
        const url = `${this.credentialsApiUrl}/${this.definition.name}?updateMask=disabled`;
        this.patch(url, { disabled: true });
        cli.output("Credential disabled");
    }
}
