/**
 * GCP Cloud Storage HMAC Keys Entity
 *
 * Creates and manages HMAC keys for Cloud Storage XML API interoperability.
 *
 * @see https://cloud.google.com/storage/docs/authentication/managing-hmackeys
 */

import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import { CLOUD_STORAGE_API_URL } from "./common.ts";
import secret from "secret";
import cli from "cli";

const DEFAULT_HMAC_ACCESS_SECRET = "gcs-hmac-access-key";
const DEFAULT_HMAC_SECRET_SECRET = "gcs-hmac-secret-key";

/**
 * Cloud Storage HMAC keys entity definition
 * @interface CloudStorageHmacKeysDefinition
 */
export interface CloudStorageHmacKeysDefinition extends GcpEntityDefinition {
    /**
     * @description Service account email to create the HMAC key for
     */
    service_account_email: string;

    /**
     * @description Optional display name for logs only
     */
    name?: string;

    /**
     * @description Secret name to store the HMAC access key ID
     * @default gcs-hmac-access-key
     */
    access_key_secret_ref?: string;

    /**
     * @description Secret name to store the HMAC secret key
     * @default gcs-hmac-secret-key
     */
    secret_key_secret_ref?: string;
}

/**
 * Cloud Storage HMAC keys entity state
 * @interface CloudStorageHmacKeysState
 */
export interface CloudStorageHmacKeysState extends GcpEntityState {
    /**
     * @description HMAC access key ID
     */
    access_key?: string;

    /**
     * @description Full resource name of the HMAC key
     */
    id?: string;

    /**
     * @description Service account email associated with the key
     */
    service_account_email?: string;
}

interface HmacKeyResource {
    id?: string;
    accessId?: string;
    serviceAccountEmail?: string;
}

/**
 * @description GCP Cloud Storage HMAC Keys entity.
 * Creates and manages HMAC access keys for the Cloud Storage XML API (S3-compatible).
 * Use these keys with S3-compatible tools by pointing to `https://storage.googleapis.com`.
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: secret name from `access_key_secret_ref` property - HMAC access key ID
 * - Writes: secret name from `secret_key_secret_ref` property - HMAC secret key
 *
 * ## State Fields for Composition
 * - `state.access_key` - Access key ID for S3-compatible clients
 * - `state.service_account_email` - Service account email used for the key
 *
 * ## Dependencies
 * - `gcp/service-account` - Use `state.email` as `service_account_email`
 * - `gcp/service-usage` - Ensure `storage.googleapis.com` is enabled
 *
 * ## Definition Fields from Other Entities
 * - `service_account_email` - From `gcp/service-account` `state.email`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/cloud-storage` - Provision buckets and access them via S3-compatible clients
 *
 * @example Create HMAC keys for a service account
 * ```yaml
 * storage-hmac-keys:
 *   defines: gcp/cloud-storage-hmac-keys
 *   service_account_email: <- connection-target("sa") entity-state get-member("email")
 *   access_key_secret_ref: gcs-hmac-access-key
 *   secret_key_secret_ref: gcs-hmac-secret-key
 *   permitted-secrets:
 *     gcs-hmac-access-key: true
 *     gcs-hmac-secret-key: true
 *   connections:
 *     sa:
 *       runnable: gcp/service-account/my-sa
 *       service: service-account
 * ```
 */
export class CloudStorageHmacKeys extends GcpEntity<
    CloudStorageHmacKeysDefinition,
    CloudStorageHmacKeysState
> {
    static override readonly readiness = { period: 5, initialDelay: 2, attempts: 10 };

    protected getEntityName(): string {
        const label = this.definition.name || this.definition.service_account_email;
        return `Cloud Storage HMAC Keys ${label}`;
    }

    private getHmacKeysUrl(): string {
        return `${CLOUD_STORAGE_API_URL}/projects/${this.projectId}/hmacKeys`;
    }

    private getHmacKeyUrl(accessKey: string): string {
        return `${this.getHmacKeysUrl()}/${accessKey}`;
    }

    private get accessKeySecretName(): string {
        return this.definition.access_key_secret_ref || DEFAULT_HMAC_ACCESS_SECRET;
    }

    private get secretKeySecretName(): string {
        return this.definition.secret_key_secret_ref || DEFAULT_HMAC_SECRET_SECRET;
    }

    private readSecret(name: string): string | undefined {
        try {
            return secret.get(name);
        } catch {
            return undefined;
        }
    }

    private getExistingKey(accessKey: string): HmacKeyResource | null {
        return this.checkResourceExists(this.getHmacKeyUrl(accessKey)) as HmacKeyResource | null;
    }

    override create(): void {
        if (!this.definition.service_account_email) {
            throw new Error("service_account_email is required to create HMAC keys");
        }

        const storedAccessKey = this.readSecret(this.accessKeySecretName);
        const storedSecretKey = this.readSecret(this.secretKeySecretName);
        if (this.state.access_key && storedAccessKey && storedSecretKey) {
            const existing = this.getExistingKey(this.state.access_key);
            if (existing) {
                cli.output(`HMAC key already exists, adopting: ${this.state.access_key}`);
                this.state.service_account_email = existing.serviceAccountEmail;
                this.state.id = existing.id || this.state.access_key;
                this.state.existing = true;
                return;
            }
        }

        const url = `${this.getHmacKeysUrl()}?serviceAccountEmail=${encodeURIComponent(this.definition.service_account_email)}`;
        cli.output(`Creating Cloud Storage HMAC keys for ${this.definition.service_account_email}`);
        const result = this.post(url);
        const accessKey = result.accessId || result.access_key || result.accessKey;
        const secretKey = result.secret || result.secretKey;
        if (!accessKey || !secretKey) {
            throw new Error(`Unexpected response from HMAC key creation: ${JSON.stringify(result)}`);
        }

        secret.set(this.accessKeySecretName, accessKey);
        secret.set(this.secretKeySecretName, secretKey);
        cli.output(`Stored HMAC keys in secrets (${this.accessKeySecretName} / ${this.secretKeySecretName})`);

        this.state.access_key = accessKey;
        this.state.id = result.id || accessKey;
        this.state.service_account_email = result.serviceAccountEmail || this.definition.service_account_email;
        this.state.existing = false;
    }

    override update(): void {
        if (!this.state.access_key) {
            this.create();
            return;
        }
        const existing = this.getExistingKey(this.state.access_key);
        if (!existing) {
            cli.output("HMAC key missing, recreating.");
            this.create();
            return;
        }
        this.state.service_account_email = existing.serviceAccountEmail || this.state.service_account_email;
        this.state.id = existing.id || this.state.id;
        cli.output("HMAC keys cannot be updated. Delete and recreate if needed.");
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output("HMAC keys were not created by this entity, skipping delete");
            return;
        }
        if (!this.state.access_key) {
            cli.output("No HMAC access key to delete");
            return;
        }

        const keyUrl = this.getHmacKeyUrl(this.state.access_key);
        const existing = this.getExistingKey(this.state.access_key);
        if (!existing) {
            cli.output(`HMAC key ${this.state.access_key} does not exist, cleaning up secrets/state`);
            this.cleanupSecretsAndState();
            return;
        }

        cli.output(`Disabling HMAC key: ${this.state.access_key}`);
        try {
            this.put(keyUrl, { state: "INACTIVE" });
        } catch (error) {
            cli.output(`Warning: failed to disable key before delete: ${(error as Error).message}`);
        }

        cli.output(`Deleting HMAC key: ${this.state.access_key}`);
        try {
            this.httpDelete(keyUrl);
        } catch (error) {
            cli.output(`Warning: failed to delete HMAC key: ${(error as Error).message}`);
        }
        this.cleanupSecretsAndState();
    }

    private cleanupSecretsAndState(): void {
        try {
            secret.remove(this.accessKeySecretName);
        } catch {
            cli.output(`Could not remove secret: ${this.accessKeySecretName}`);
        }
        try {
            secret.remove(this.secretKeySecretName);
        } catch {
            cli.output(`Could not remove secret: ${this.secretKeySecretName}`);
        }

        this.state.access_key = undefined;
        this.state.id = undefined;
        this.state.service_account_email = undefined;
        this.state.existing = false;
    }

    override checkReadiness(): boolean {
        if (!this.state.access_key) {
            cli.output("HMAC access key not created yet");
            return false;
        }

        const key = this.getExistingKey(this.state.access_key);
        if (!key) {
            cli.output("HMAC key not found");
            return false;
        }

        const storedAccessKey = this.readSecret(this.accessKeySecretName);
        const storedSecretKey = this.readSecret(this.secretKeySecretName);
        if (!storedAccessKey || !storedSecretKey) {
            cli.output("HMAC secrets not found");
            return false;
        }

        return true;
    }

    override checkLiveness(): boolean {
        return !!this.state.access_key;
    }
}
