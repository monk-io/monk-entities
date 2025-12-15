import { MonkEntity } from "monkec/base";
import cli from "cli";
import secret from "secret";
import digitalocean from "cloud/digitalocean";

export interface GradientAgentDefinitionBase {
    /** @description Secret name with Gradient Agent endpoint URL */
    agent_endpoint_secret_ref?: string;
    /** @description Secret name with Gradient Agent access key */
    agent_access_key_secret_ref?: string;
}

export interface GradientAgentStateBase {
    existing?: boolean;
}

export abstract class GradientAgentBase<
    D extends GradientAgentDefinitionBase,
    S extends GradientAgentStateBase
> extends MonkEntity<D, S> {
    protected agentEndpoint!: string;
    protected agentAccessKey!: string;

    static readonly readiness = { period: 10, initialDelay: 1, attempts: 30 };

    protected override before(): void {
        const endpointRef = this.definition.agent_endpoint_secret_ref || "gradient-agent-endpoint";
        const keyRef = this.definition.agent_access_key_secret_ref || "gradient-agent-access-key";
        const endpoint = secret.get(endpointRef);
        const accessKey = secret.get(keyRef);
        if (!endpoint || !accessKey) {
            throw new Error(`Missing Gradient agent credentials in secrets: endpoint=${endpointRef}, access_key=${keyRef}`);
        }
        this.agentEndpoint = endpoint.replace(/\/$/, "");
        this.agentAccessKey = accessKey;

        cli.output(`Gradient Agent creds loaded (refs: endpoint=${endpointRef}, access_key=${keyRef})`);
    }

    protected request(method: string, path: string, body?: any): any {
        const fullPath = path.startsWith("/") ? path : `/${path}`;
        const url = `${this.agentEndpoint}${fullPath}`;
        const options: any = {
            method,
            headers: {
                "Authorization": `Bearer ${this.agentAccessKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        };
        if (body !== undefined) {
            options.body = typeof body === "string" ? body : JSON.stringify(body);
        }
        const resp = digitalocean.do(url, options);
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
            throw new Error(`Gradient agent ${method} ${fullPath} failed: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }
        try {
            return resp.body ? JSON.parse(resp.body) : {};
        } catch {
            return resp.body;
        }
    }
}


