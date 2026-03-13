import { MonkEntity } from "monkec/base";
import hetzner from "cloud/hetzner";
import secret from "secret";
import cli from "cli";

/**
 * Definition interface for Hetzner Object Storage Credentials entity.
 * @interface HetznerS3CredentialsDefinition
 */
export interface HetznerS3CredentialsDefinition {
    /**
     * @description Description for the S3 credentials
     */
    description?: string;
}

/**
 * State interface for Hetzner Object Storage Credentials entity.
 * @interface HetznerS3CredentialsState
 */
export interface HetznerS3CredentialsState {
    /** @description Credential ID */
    id?: string;
    /** @description The access key ID for S3-compatible API access */
    access_key?: string;
    /** @description Indicates if the credentials were successfully created */
    existing?: boolean;
}

/**
 * @description Hetzner Object Storage Credentials entity.
 * Creates S3-compatible credentials for Hetzner Object Storage.
 * Upon creation, stores the access key and secret key into Monk secrets:
 * - `hetzner-s3-access-key`: The access key ID
 * - `hetzner-s3-secret-key`: The secret access key
 *
 * These secrets are used by the bucket entity for S3-compatible API operations.
 */
export class Credentials extends MonkEntity<HetznerS3CredentialsDefinition, HetznerS3CredentialsState> {
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 10 };

    protected getEntityName(): string { return "s3-credentials"; }

    override create(): void {
        const description = this.definition.description || `monk-s3-credentials-${Date.now()}`;

        const resp = hetzner.post("/v1/s3/credentials", {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                description: description
            })
        });

        if (resp.statusCode < 200 || resp.statusCode >= 300) {
            throw new Error(`Hetzner API error: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }

        const data = resp.body ? JSON.parse(resp.body) : {};
        const creds = data.s3_credentials || data;
        const accessKey: string | undefined = creds?.access_key;
        const secretKey: string | undefined = creds?.secret_key;

        if (!accessKey || !secretKey) {
            throw new Error(`Unexpected Hetzner response for S3 credential creation: ${resp.body || ''}`);
        }

        this.state.id = creds.id || accessKey;
        this.state.access_key = accessKey;
        this.state.existing = true;

        secret.set("hetzner-s3-access-key", accessKey);
        secret.set("hetzner-s3-secret-key", secretKey);
        cli.output(`Created Hetzner S3 credentials and stored into secrets (hetzner-s3-access-key / hetzner-s3-secret-key)`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No S3 credential ID in state; nothing to delete.");
            return;
        }

        const resp = hetzner.delete(`/v1/s3/credentials/${this.state.id}`, {
            headers: { "Accept": "application/json" }
        });

        if (resp.statusCode >= 400 && resp.statusCode !== 404) {
            throw new Error(`Failed to delete credentials: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }

        this.state.id = undefined;
        this.state.access_key = undefined;
        this.state.existing = false;
        cli.output(`Deleted Hetzner S3 credentials`);
    }

    override checkReadiness(): boolean { return !!this.state.id; }
}
