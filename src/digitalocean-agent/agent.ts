// @ts-nocheck
import cli from "cli";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;
// Use DigitalOcean client like in digitalocean-spaces
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const require: any;
// @ts-ignore
const digitalocean = require("cloud/digitalocean");
// @ts-ignore

export interface DOAgentDefinition {
    /** @description Agent display name */
    name: string;
    /** @description System instruction for the agent */
    instruction: string;
    /** @description Model UUID to use (or provide model_id/inference_name instead) */
    model_uuid?: string;
    /** @description Human-readable model identifier, e.g. "openai-o3" (resolved to UUID) */
    model_id?: string;
    /** @description Inference name (alias to model_id) */
    inference_name?: string;
    /** @description Optional project id */
    project_id?: string;
    /** @description Knowledge base UUIDs (alias: knowledge_base_uuid) */
    knowledge_base_uuids?: string[];
    /** @description Guardrail UUIDs */
    guardrail_uuids?: string[];
    /** @description Optional tags */
    tags?: string[];
    /** @description Region slug where the agent lives (e.g. tor1) */
    region?: string;
    /** @description Whether to include citations in responses */
    provide_citations?: boolean;
    /** @description Retrieval method type */
    retrieval_method?: string;
    /** @description Number of documents to retrieve (k) */
    k?: number;
    /** @description Sampling temperature */
    temperature?: number;
    /** @description Nucleus sampling top_p */
    top_p?: number;
    /** @description Max tokens to generate */
    max_tokens?: number;
    /** @description If true, wait for readiness after create/update (default: true) */
    wait_ready?: boolean;
    /** @description Total seconds to wait for readiness (default: 120) */
    wait_timeout_sec?: number;
    /** @description Poll interval seconds while waiting (default: 5) */
    wait_interval_sec?: number;
    /** @description Make the agent endpoint public (attempt during deploy) */
    public_endpoint?: boolean;
    /** @description Publish deployment publicly by default (alias to public_endpoint) */
    publish?: boolean;
}

export interface DOAgentState {
    id?: string;
    status?: string;
    endpoint?: string;
    existing?: boolean;
    endpoint_api_key?: string;
}

export class Agent extends MonkecBase.MonkEntity<DOAgentDefinition, DOAgentState> {
    protected getEntityName(): string { return "digitalocean-agent/agent"; }

    private httpPost(path: string, body: any): any {
        const resp = digitalocean.post(path, {
            headers: { "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
            throw new Error(`DO API error: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }
        return resp.body ? JSON.parse(resp.body) : {};
    }

    private httpGet(path: string): any {
        const resp = digitalocean.get(path, { headers: { "Accept": "application/json" } });
        if (resp.statusCode < 200 || resp.statusCode >= 300) {
            throw new Error(`DO API error: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }
        return resp.body ? JSON.parse(resp.body) : {};
    }

    private httpPatch(path: string, body: any): any {
        // Attempt PATCH via generic do() if available; fall back to PUT
        try {
            const resp = digitalocean.do(path, {
                method: "PATCH",
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                throw new Error(`DO API error: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
            }
            return resp.body ? JSON.parse(resp.body) : {};
        } catch (_e) {
            const resp = digitalocean.put(path, {
                headers: { "Accept": "application/json", "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (resp.statusCode < 200 || resp.statusCode >= 300) {
                throw new Error(`DO API error: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
            }
            return resp.body ? JSON.parse(resp.body) : {};
        }
    }

    private del(path: string): void {
        const resp = digitalocean.delete(path, { headers: { "Accept": "application/json" } });
        if (resp.statusCode >= 400 && resp.statusCode !== 404) {
            throw new Error(`DO API error: ${resp.statusCode} ${resp.status} - ${resp.body || ''}`);
        }
    }

    private resolveModelUuid(): string {
        // Prefer explicit UUID if provided
        if (this.definition.model_uuid && this.definition.model_uuid.match(/[0-9a-fA-F-]{36}/)) {
            return this.definition.model_uuid;
        }

        const candidate = (this.definition.model_id || this.definition.inference_name || this.definition.model_uuid || "").trim();
        if (!candidate) {
            throw new Error("model_uuid or model_id/inference_name must be provided");
        }

        const modelsResp = this.httpGet("/v2/gen-ai/models");
        const models = modelsResp.models || modelsResp || [];
        const lower = candidate.toLowerCase();

        const match = models.find((m: any) => {
            const uuid = (m.uuid || "").toLowerCase();
            const id = (m.id || "").toLowerCase();
            const name = (m.name || "").toLowerCase();
            return uuid === lower || id === lower || name === lower;
        });

        if (!match) {
            throw new Error(`Unable to resolve model identifier '${candidate}' to a UUID`);
        }
        return match.uuid;
    }

    private resolveProjectId(): string | undefined {
        if (this.definition.project_id && String(this.definition.project_id).trim().length > 0) {
            return this.definition.project_id;
        }
        try {
            const resp = this.httpGet("/v2/projects/default");
            const project = resp.project || resp || {};
            const projId = project.id || project.uuid;
            if (projId && String(projId).trim().length > 0) return projId;
        } catch (_e) {
            // ignore and fall back to undefined
        }
        return undefined;
    }

    // Waiting moved to readiness checks driven by Monk engine

    private deployAgentIfNeeded(): void {
        if (!this.state.id) return;
        try {
            const body: any = {};
            if (this.definition.public_endpoint || this.definition.publish) {
                body.visibility = body.visibility || "public";
                body.public = true;
                body.is_public = true;
            }
            const data = this.httpPost(`/v2/gen-ai/agents/${this.state.id}/deployments`, body);
            const dep = data.deployment || data || {};
            if (dep.url) this.state.endpoint = dep.url;
            if (dep.status) this.state.status = dep.status;
        } catch (_e) {
            // best-effort
        }
    }

    private getApiKeysBasePath(): string {
        if (!this.state.id) throw new Error("Agent id missing in state");
        return `/v2/gen-ai/agents/${this.state.id}/api_keys`;
    }

    private parseApiKeySecret(resp: any): string | undefined {
        if (!resp) return undefined;
        if (resp.api_key_info && typeof resp.api_key_info === "object") {
            const info = resp.api_key_info;
            return info.secret_key || info.api_key || info.key || info.secret;
        }
        if (resp.api_key && typeof resp.api_key === "object") {
            const obj = resp.api_key;
            return obj.secret_key || obj.api_key || obj.key || obj.secret;
        }
        return resp.secret_key || resp.api_key || resp.key || resp.secret;
    }

    override create(): void {
        const body: any = {
            name: this.definition.name,
            instruction: this.definition.instruction,
            model_uuid: this.resolveModelUuid(),
        };
        const resolvedProjectId = this.resolveProjectId();
        if (resolvedProjectId) body.project_id = resolvedProjectId;
        if (this.definition.knowledge_base_uuids) body.knowledge_base_uuid = this.definition.knowledge_base_uuids;
        if (this.definition.guardrail_uuids) body.guardrail_uuids = this.definition.guardrail_uuids;
        if (this.definition.tags) body.tags = this.definition.tags;
        if (this.definition.region) body.region = this.definition.region;
        if (this.definition.provide_citations !== undefined) body.provide_citations = this.definition.provide_citations;
        if (this.definition.retrieval_method) body.retrieval_method = this.definition.retrieval_method;
        if (this.definition.k !== undefined) body.k = this.definition.k;
        if (this.definition.temperature !== undefined) body.temperature = this.definition.temperature;
        if (this.definition.top_p !== undefined) body.top_p = this.definition.top_p;
        if (this.definition.max_tokens !== undefined) body.max_tokens = this.definition.max_tokens;

        const data = this.httpPost("/v2/gen-ai/agents", body);
        const agent = data.agent || data || {};
        this.state.id = agent.id || agent.uuid || agent.agent_uuid;
        this.state.status = agent.status || agent.state || agent.deployment?.status;
        this.state.endpoint = agent.endpoint || agent.url || agent.deployment?.url;
        this.state.existing = false;
        if (!this.state.endpoint || this.definition.public_endpoint || this.definition.publish) {
            this.deployAgentIfNeeded();
        }
        // Create API key for endpoint access on create
        try {
            const keyResp = this.httpPost(this.getApiKeysBasePath(), { agent_uuid: this.state.id, name: "default-key" });
            const apiKey = this.parseApiKeySecret(keyResp);
            if (apiKey) this.state.endpoint_api_key = apiKey;
        } catch (_e) { /* ignore if not allowed */ }
        cli.output(`Created DO Agent '${this.definition.name}' (id=${this.state.id || 'unknown'})`);
    }

    override update(): void {
        if (!this.state.id) { this.create(); return; }
        return; // TODO: remove later, this is a temp change to stop updates from timing out due to DO slowness!
        const body: any = {};
        if (this.definition.instruction) body.instruction = this.definition.instruction;
        if (this.definition.knowledge_base_uuids) body.knowledge_base_uuid = this.definition.knowledge_base_uuids;
        if (this.definition.guardrail_uuids) body.guardrail_uuids = this.definition.guardrail_uuids;
        if (this.definition.tags) body.tags = this.definition.tags;
        if (this.definition.region) body.region = this.definition.region;
        if (this.definition.provide_citations !== undefined) body.provide_citations = this.definition.provide_citations;
        if (this.definition.retrieval_method) body.retrieval_method = this.definition.retrieval_method;
        if (this.definition.k !== undefined) body.k = this.definition.k;
        if (this.definition.temperature !== undefined) body.temperature = this.definition.temperature;
        if (this.definition.top_p !== undefined) body.top_p = this.definition.top_p;
        if (this.definition.max_tokens !== undefined) body.max_tokens = this.definition.max_tokens;
        if (this.definition.model_uuid || this.definition.model_id || this.definition.inference_name) {
            body.model_uuid = this.resolveModelUuid();
        }
        const resolvedProjectId2 = this.resolveProjectId();
        if (resolvedProjectId2) body.project_id = resolvedProjectId2;
        const data = this.httpPatch(`/v2/gen-ai/agents/${this.state.id}`, body);
        const agent = data.agent || data || {};
        this.state.status = agent.status || agent.state || agent.deployment?.status || this.state.status;
        this.state.endpoint = agent.endpoint || agent.url || agent.deployment?.url || this.state.endpoint;
        if (this.definition.public_endpoint && !this.state.endpoint) {
            this.deployAgentIfNeeded();
        }
        cli.output(`Updated DO Agent (id=${this.state.id})`);
    }

    override delete(): void {
        if (!this.state.id) { cli.output("No agent id; nothing to delete"); return; }
        this.del(`/v2/gen-ai/agents/${this.state.id}`);
        this.state.id = undefined;
        this.state.status = undefined;
        this.state.endpoint = undefined;
        this.state.existing = false;
        cli.output("Deleted DO Agent");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) return false;
        try {
            const data = this.httpGet(`/v2/gen-ai/agents/${this.state.id}`);
            const agent = data.agent || data || {};
            const deployment = agent.deployment || {};
            const rawStatus = deployment.status || agent.status || agent.state || "";
            const status = String(rawStatus).toLowerCase().replace(/^status_/, "").replace(/^state_/, "");
            let endpoint = deployment.url || agent.endpoint || agent.url;
            if (!endpoint) {
                try {
                    const deps = this.httpGet(`/v2/gen-ai/agents/${this.state.id}/deployments`);
                    const list = deps.deployments || deps || [];
                    if (Array.isArray(list) && list.length > 0) {
                        const latest = list[0];
                        endpoint = latest.url || latest.endpoint || endpoint;
                    }
                } catch (_e) {
                    // ignore if deployments listing not available yet
                }
            }
            if (endpoint) this.state.endpoint = endpoint;
            this.state.status = status;
            return ["active", "ready", "running", "enabled"].includes(status);
        } catch (_e) {
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }
    
    @action()
    get(_args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const data = this.httpGet(`/v2/gen-ai/agents/${this.state.id}`);
        cli.output(JSON.stringify(data, null, 2));
    }

    @action()
    setGuardrails(args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const raw = (args?.guardrail_uuids as string) || "";
        const guardrailUuids = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
        const body = { guardrail_uuids: guardrailUuids } as any;
        const data = this.httpPatch(`/v2/gen-ai/agents/${this.state.id}`, body);
        cli.output(`Updated guardrails for Agent ${this.state.id}`);
        cli.output(JSON.stringify(data, null, 2));
    }

    @action()
    setKnowledgeBases(args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const raw = (args?.knowledge_base_uuids as string) || (args?.knowledge_base_uuid as string) || "";
        const kbUuids = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
        const body = { knowledge_base_uuid: kbUuids } as any;
        const data = this.httpPatch(`/v2/gen-ai/agents/${this.state.id}`, body);
        cli.output(`Updated knowledge bases for Agent ${this.state.id}`);
        cli.output(JSON.stringify(data, null, 2));
    }

    @action()
    createApiKey(args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const name = (args?.name as string) || (args?._?.[0] as string) || undefined;
        const body: any = { agent_uuid: this.state.id };
        if (name) body.name = name;
        const data = this.httpPost(this.getApiKeysBasePath(), body);
        cli.output(`Created API key for Agent ${this.state.id}`);
        cli.output(JSON.stringify(data, null, 2));
        const apiKey = this.parseApiKeySecret(data);
        if (apiKey) this.state.endpoint_api_key = apiKey;
    }

    @action()
    revokeApiKey(args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const keyUuid = args?.api_key_uuid as string;
        if (!keyUuid) throw new Error("api_key_uuid is required");
        this.del(`${this.getApiKeysBasePath()}/${keyUuid}`);
        cli.output(`Revoked API key ${keyUuid} for Agent ${this.state.id}`);
    }

    @action()
    deleteApiKey(args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const keyUuid = (args?.api_key_uuid as string) || (args?._?.[0] as string);
        if (!keyUuid) throw new Error("api_key_uuid is required");
        this.del(`${this.getApiKeysBasePath()}/${keyUuid}`);
        cli.output(`Deleted API key ${keyUuid} for Agent ${this.state.id}`);
    }

    @action()
    listApiKeys(_args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const data = this.httpGet(this.getApiKeysBasePath());
        cli.output(JSON.stringify(data, null, 2));
    }

    @action()
    deploy(_args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        const body: any = {};
        if (this.definition.public_endpoint) {
            body.visibility = body.visibility || "public";
            body.public = true;
            body.is_public = true;
        }
        const data = this.httpPost(`/v2/gen-ai/agents/${this.state.id}/deployments`, body);
        const dep = data.deployment || data || {};
        this.state.status = dep.status || this.state.status;
        this.state.endpoint = dep.url || this.state.endpoint;
        cli.output(`Triggered deployment for Agent ${this.state.id}`);
        cli.output(JSON.stringify(data, null, 2));
    }

    @action()
    makePublic(_args?: MonkecBase.Args): void {
        if (!this.state.id) throw new Error("Agent id missing in state");
        // Temporarily enforce public deployment
        (this.definition as any).public_endpoint = true;
        this.deployAgentIfNeeded();
        try {
            const data = this.httpGet(`/v2/gen-ai/agents/${this.state.id}`);
            const agent = data.agent || data || {};
            this.state.status = agent.status || agent.state || agent.deployment?.status || this.state.status;
            const endpoint = agent.endpoint || agent.url || agent.deployment?.url;
            if (endpoint) this.state.endpoint = endpoint;
        } catch (_e) {}
        cli.output(`Made Agent ${this.state.id} public (if supported)`);
        cli.output(JSON.stringify({ endpoint: this.state.endpoint, status: this.state.status }, null, 2));
    }

    @action()
    models(_args?: MonkecBase.Args): void {
        const data = this.httpGet("/v2/gen-ai/models");
        cli.output(JSON.stringify(data, null, 2));
    }
}


