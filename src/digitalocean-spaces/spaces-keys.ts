import { MonkEntity } from "monkec/base";
import digitalocean from "cloud/digitalocean";
import secret from "secret";
import cli from "cli";

export interface DOSpacesKeysDefinition {
    name?: string;
}

export interface DOSpacesKeysState {
    id?: string;
    access_key?: string;
    existing?: boolean;
}

export class SpacesKeys extends MonkEntity<DOSpacesKeysDefinition, DOSpacesKeysState> {
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 10 };

    protected getEntityName(): string { return "spaces-keys"; }

    override create(): void {
        const keyName = this.definition.name || `monk-spaces-full-access-${Date.now()}`;
        const body = JSON.stringify({
            name: keyName,
            grants: [
                {
                    bucket: "",
                    permission: "fullaccess",
                },
            ],
        });
        const resp = digitalocean.post("/v2/spaces/keys", {
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            body,
        });
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
            throw new Error(`DO API error: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }
        const data = resp.body ? JSON.parse(resp.body) : {};
        const key = data.key || data.spaces_key || data.spaces_access_key || data;
        const accessKey: string | undefined = key?.access_key;
        const secretKey: string | undefined = key?.secret_key || key?.secret;
        if (!accessKey || !secretKey) {
            throw new Error(`Unexpected DO response for Spaces key creation: ${resp.body || ''}`);
        }
        this.state.id = key.id || accessKey;
        this.state.access_key = accessKey;
        this.state.existing = true;

        // Store into standard secrets for DO Spaces S3 operations
        secret.set("do-spaces-access-key", accessKey);
        secret.set("do-spaces-secret-key", secretKey);
        cli.output(`Created Spaces key and stored into secrets (do-spaces-access-key / do-spaces-secret-key)`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No Spaces key id in state; nothing to delete.");
            return;
        }
        const resp = digitalocean.delete(`/v2/spaces/keys/${this.state.id}`, { headers: { "Accept": "application/json" } });
        if (resp.statusCode >= 400 && resp.statusCode !== 404) {
            throw new Error(`Failed to delete key: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }
        this.state.id = undefined;
        this.state.access_key = undefined;
        this.state.existing = false;
        cli.output(`Deleted Spaces key`);
    }

    override checkReadiness(): boolean { return !!this.state.id; }
}


