/**
 * GCP Service Account Key Entity
 *
 * Creates and manages service account keys, storing the private key in Monk secrets.
 *
 * @see https://cloud.google.com/iam/docs/keys-create-delete
 */

import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import secret from "secret";
import cli from "cli";
import { IAM_API_URL } from "./common.ts";

/**
 * Service Account Key entity definition
 * @interface ServiceAccountKeyDefinition
 */
export interface ServiceAccountKeyDefinition extends GcpEntityDefinition {
    /**
     * @description Secret name where the private key will be stored
     */
    secret: string;

    /**
     * @description Service account unique ID (usually from connection)
     */
    service_account_id: string;

    /**
     * @description Key type
     * @default TYPE_GOOGLE_CREDENTIALS_FILE
     */
    key_type?: string;

    /**
     * @description Key algorithm
     * @default KEY_ALG_RSA_2048
     */
    key_algorithm?: string;
}

/**
 * Service Account Key entity state
 * @interface ServiceAccountKeyState
 */
export interface ServiceAccountKeyState extends GcpEntityState {
    /**
     * @description Full resource name of the key
     */
    name?: string;

    /**
     * @description Key ID
     */
    key_id?: string;

    /**
     * @description Key algorithm used
     */
    key_algorithm?: string;

    /**
     * @description Key type
     */
    key_type?: string;

    /**
     * @description When the key was created
     */
    valid_after_time?: string;
}

/**
 * Service Account Key entity
 *
 * Creates a private key for a GCP service account and stores it in a Monk secret.
 * The key can be used by applications to authenticate as the service account.
 *
 * ## Secrets
 * **⚠️ WRITES SECRETS** - This entity writes the service account private key (JSON credentials)
 * to a Monk secret. You MUST add `permitted-secrets` to allow the entity to write the key:
 * ```yaml
 * permitted-secrets:
 *   <secret>: true
 * ```
 * The secret name is specified in the `secret` definition field.
 *
 * The secret contains the full JSON credentials file that can be used with
 * `GOOGLE_APPLICATION_CREDENTIALS` environment variable or GCP client libraries.
 *
 * ## Dependencies
 * - **REQUIRED**: `gcp/service-account` - Must be created first
 * - Pass the service account's `state.unique_id` to `service_account_id` field
 *
 * ## State Fields for Composition
 * The following state fields provide key metadata:
 * - `state.key_id` - Unique identifier for the key
 * - `state.name` - Full resource name of the key
 * - `state.valid_after_time` - When the key was created
 *
 * ## Definition Fields from Other Entities
 * - `service_account_id` - Get from `gcp/service-account` entity's `state.unique_id`
 *
 * ## Using the Credentials
 * Applications can use the secret in several ways:
 * - Set `GOOGLE_APPLICATION_CREDENTIALS` env var to the secret value
 * - Pass to GCP client libraries directly
 * - Mount as a file in containers
 *
 * @see https://cloud.google.com/iam/docs/keys-create-delete
 *
 * @example Basic service account key
 * ```yaml
 * my-sa-key:
 *   defines: gcp/service-account-key
 *   secret: my-sa-credentials
 *   service_account_id: <- connection-target("service-account") entity-state get-member("unique_id")
 *   permitted-secrets:
 *     my-sa-credentials: true
 *   connections:
 *     service-account:
 *       runnable: gcp/service-account
 *       service: service-account
 * ```
 *
 * @example Complete service account with key for application
 * ```yaml
 * # 1. Enable IAM API
 * enable-iam-api:
 *   defines: gcp/service-usage
 *   name: iam.googleapis.com
 *
 * # 2. Create service account with roles
 * app-sa:
 *   defines: gcp/service-account
 *   name: my-app-worker
 *   display_name: My Application Worker
 *   roles:
 *     - roles/storage.objectViewer
 *     - roles/bigquery.dataViewer
 *   depends:
 *     wait-for:
 *       runnables:
 *         - gcp/service-usage/enable-iam-api
 *       timeout: 300
 *
 * # 3. Create key (writes secret!)
 * app-sa-key:
 *   defines: gcp/service-account-key
 *   service_account_id: <- connection-target("sa") entity-state get-member("unique_id")
 *   secret: app-gcp-credentials
 *   permitted-secrets:
 *     app-gcp-credentials: true
 *   connections:
 *     sa:
 *       runnable: gcp/service-account/app-sa
 *       service: service-account
 *
 * # 4. Application uses the secret
 * # The 'app-gcp-credentials' secret contains JSON that can be:
 * # - Set as GOOGLE_APPLICATION_CREDENTIALS environment variable
 * # - Mounted as a file for GCP client libraries
 * ```
 */
export class ServiceAccountKey extends GcpEntity<ServiceAccountKeyDefinition, ServiceAccountKeyState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        return `Service Account Key for ${this.definition.service_account_id}`;
    }

    /**
     * Get the IAM API URL for keys
     */
    private get keysApiUrl(): string {
        return `${IAM_API_URL}/projects/${this.projectId}/serviceAccounts/${this.definition.service_account_id}/keys`;
    }

    /**
     * Check if the key already exists (by checking if secret has content)
     */
    private keyExists(): boolean {
        try {
            const existing = secret.get(this.definition.secret);
            return !!existing;
        } catch {
            return false;
        }
    }

    override create(): void {
        // Check if we already have a key stored in secret
        if (this.keyExists() && this.state.name) {
            cli.output(`Key already exists in secret ${this.definition.secret}, adopting...`);
            this.state.existing = true;
            return;
        }

        // Build key configuration
        const body = {
            privateKeyType: this.definition.key_type || "TYPE_GOOGLE_CREDENTIALS_FILE",
            keyAlgorithm: this.definition.key_algorithm || "KEY_ALG_RSA_2048",
        };

        cli.output(`Creating service account key for: ${this.definition.service_account_id}`);

        const result = this.post(this.keysApiUrl, body);

        // The private key data is base64 encoded, decode it and store
        // Note: btoa is built-in in the Goja runtime for base64 operations
        if (result.privateKeyData) {
            // Store the credentials JSON in the secret
            // The privateKeyData is already base64 encoded, we can store it as-is
            // or decode it first depending on how it should be used
            try {
                // Decode from base64 to get the actual JSON credentials
                const decoded = atob(result.privateKeyData);
                secret.set(this.definition.secret, decoded);
                cli.output(`Service account key stored in secret: ${this.definition.secret}`);
            } catch {
                // If decoding fails, store as-is
                secret.set(this.definition.secret, result.privateKeyData);
                cli.output(`Service account key stored in secret (base64): ${this.definition.secret}`);
            }
        }

        this.state.name = result.name;
        this.state.key_id = result.name?.split("/").pop();
        this.state.key_algorithm = result.keyAlgorithm;
        this.state.key_type = result.privateKeyType;
        this.state.valid_after_time = result.validAfterTime;
        this.state.existing = false;

        cli.output(`Service account key created: ${this.state.key_id}`);
    }

    override update(): void {
        // Keys can't be updated - they must be recreated
        if (!this.state.name) {
            this.create();
            return;
        }

        cli.output("Service account keys cannot be updated. Delete and recreate if needed.");
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Key was not created by this entity, skipping delete`);
            return;
        }

        if (!this.state.name) {
            cli.output("No key to delete");
            return;
        }

        cli.output(`Deleting service account key: ${this.state.key_id}`);

        // Delete the key from GCP
        // The name is the full resource path
        this.httpDelete(`${IAM_API_URL}/${this.state.name}`);

        // Remove the secret
        try {
            secret.remove(this.definition.secret);
            cli.output(`Removed secret: ${this.definition.secret}`);
        } catch {
            cli.output(`Could not remove secret: ${this.definition.secret}`);
        }

        cli.output(`Service account key deleted`);
    }

    override checkReadiness(): boolean {
        // Check if the key exists in GCP
        if (!this.state.name) {
            cli.output("Key not created yet");
            return false;
        }

        // Verify the secret has the key
        try {
            const keyData = secret.get(this.definition.secret);
            if (!keyData) {
                cli.output("Key not found in secret");
                return false;
            }
        } catch {
            cli.output("Could not retrieve key from secret");
            return false;
        }

        cli.output(`Service account key is ready`);
        return true;
    }

    checkLiveness(): boolean {
        try {
            const keyData = secret.get(this.definition.secret);
            return !!keyData;
        } catch {
            return false;
        }
    }
}
