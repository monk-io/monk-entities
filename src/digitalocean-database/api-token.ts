import { MonkEntity } from "monkec/base";
// Use runtime require to avoid TS type resolution for cloud/digitalocean
declare const require: any;
// @ts-ignore
const digitalocean = require("cloud/digitalocean");
import secret from "secret";
import cli from "cli";

export interface DOApiTokenDefinition {
    name?: string;
}

export interface DOApiTokenState {
    id?: string;
    token?: string;
    existing?: boolean;
}

export class ApiToken extends MonkEntity<DOApiTokenDefinition, DOApiTokenState> {
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 10 };

    protected getEntityName(): string { return "api-token"; }

    override create(): void {
        const tokenName = this.definition.name || `monk-do-token-${Date.now()}`;
        const body = JSON.stringify({
            name: tokenName,
            type: "read_write"
        });
        
        const resp = digitalocean.post("/v2/tokens", {
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
        const token = data.token || data.access_token || data;
        
        if (!token || typeof token !== 'string') {
            throw new Error(`Unexpected DO response for token creation: ${resp.body || ''}`);
        }
        
        this.state.id = data.id || tokenName;
        this.state.token = token;
        this.state.existing = true;

        // Store into standard secret for DO API operations
        secret.set("do-api-token", token);
        cli.output(`Created API token and stored into secret (do-api-token)`);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("No API token id in state; nothing to delete.");
            return;
        }
        
        // Note: DigitalOcean API doesn't provide token deletion endpoint
        // Tokens expire automatically or can be revoked through the web interface
        cli.output("API token cleanup: tokens can be revoked through DigitalOcean web interface");
        
        this.state.id = undefined;
        this.state.token = undefined;
        this.state.existing = false;
        cli.output(`API token state cleared`);
    }

    override checkReadiness(): boolean { 
        return !!this.state.token; 
    }
}
