import { type Args } from "monkec/base";
import {
    RunpodEntity,
    type RunpodEntityDefinition,
    type RunpodEntityState,
    action,
} from "./runpod-base.ts";
import { toApiBody } from "./common.ts";
import cli from "cli";

/**
 * Definition interface for the RunPod Template entity.
 * @see https://api.runpod.io/v2/openapi.json
 */
export interface RunpodTemplateDefinition extends RunpodEntityDefinition {
    /** @description Template name. Used to adopt a pre-existing template. */
    name: string;
    /** @description Container image reference, e.g. `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04` */
    image: string;
    /** @description Ephemeral container disk in GB, wiped when a pod using this template restarts */
    disk?: number;
    /** @description Arguments passed to the container entrypoint */
    args?: string;
    /** @description Environment variables applied to containers created from this template */
    env?: Record<string, string>;
    /** @description Exposed ports in `port/protocol` form, e.g. `["8888/http", "22/tcp"]` */
    ports?: string[];
    /** @description Container registry credential ID, for private images */
    registry?: string;
    /** @description Console grouping only — does not affect hardware, scheduling, or billing. Defaults to NVIDIA. */
    category?: "CPU" | "NVIDIA" | "AMD";
    /** @description Host-local persistent storage in GB (minimum 10). Requires `persistent_disk_path`. Not allowed on CPU pods. */
    persistent_disk_size?: number;
    /** @description Mount path for the persistent disk, e.g. `/workspace`. Required when `persistent_disk_size` is set. */
    persistent_disk_path?: string;
    /** @description Acceptable CUDA versions as `major.minor`, e.g. `["12.8"]`. CPU pods ignore this. */
    allowed_cuda_versions?: string[];
    /** @description Mark as a serverless template rather than a pod template */
    serverless?: boolean;
    /** @description Publish the template publicly */
    public?: boolean;
    /** @description Inject a generated JUPYTER_PASSWORD to start JupyterLab. RunPod defaults this to true for templates; expose `8888/http` to reach it. */
    start_jupyter?: boolean;
    /** @description Inject PUBLIC_KEY from the account's registered SSH keys. RunPod defaults this to true for templates; needs `22/tcp` in ports for direct SSH. */
    start_ssh?: boolean;
}

/**
 * State interface for the RunPod Template entity.
 */
export interface RunpodTemplateState extends RunpodEntityState {
    /** @description Template ID assigned by RunPod */
    id?: string;
    /** @description Template name */
    name?: string;
    /** @description Container image the template deploys */
    image?: string;
}

/**
 * @description RunPod template — a reusable container configuration (image, disk, ports, env)
 * that pods and serverless endpoints can instantiate by ID.
 *
 * Templates are configuration only and cost nothing on their own, so this entity has no cost
 * actions; the pod that consumes the template is what bills.
 *
 * ## Required Permissions
 * A RunPod API key with read/write access to the account. RunPod does not offer
 * scoped API keys, so the key grants full account access.
 *
 * ## Secrets
 * - Reads: `secret_ref` (defaults to `runpod-api-token`)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.id` - Template ID; pass to a pod's `template_id` to deploy from this template
 *
 * ## Composing with Other Entities
 * Works with:
 * - `runpod/runpod-pod` - wire `template_id` to `state.id` so the pod inherits this
 *   container config; explicit pod fields still override the template
 */
export class RunpodTemplate extends RunpodEntity<
    RunpodTemplateDefinition,
    RunpodTemplateState
> {
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 12 };

    protected getEntityName(): string {
        return `RunPod template ${this.definition.name}`;
    }

    override create(): void {
        const existing = this.findByName("/templates", this.definition.name);
        if (existing) {
            this.applyState(existing, true);
            cli.output(`📦 Adopted existing template ${existing.id} (${this.definition.name})`);
            return;
        }

        const created = this.makeRequest("POST", "/templates", this.buildBody());
        this.applyState(created, false);
        cli.output(`✅ Created template ${this.state.id} (${this.definition.name})`);
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        const updated = this.makeRequest("PATCH", `/templates/${this.state.id}`, this.buildBody());
        this.applyState(updated, this.state.existing);
        cli.output(`✅ Updated template ${this.state.id}`);
    }

    override delete(): void {
        if (!this.state.id) return;

        if (this.state.existing) {
            cli.output("Template pre-existed this entity; skipping delete");
            return;
        }

        this.deleteResource(`/templates/${this.state.id}`, `template ${this.state.id}`);
    }

    override checkReadiness(): boolean {
        return Boolean(this.state.id);
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.id) {
            cli.output("Template not created yet");
            return;
        }
        const info = this.makeRequest("GET", `/templates/${this.state.id}`);
        cli.output(JSON.stringify(info, null, 2));
    }

    private buildBody(): Record<string, any> {
        const body: Record<string, any> = {
            name: this.definition.name,
            image: this.definition.image,
            disk: this.definition.disk,
            args: this.definition.args,
            env: this.definition.env,
            ports: this.definition.ports,
            registry: this.definition.registry,
            category: this.definition.category,
            allowed_cuda_versions: this.definition.allowed_cuda_versions,
            serverless: this.definition.serverless,
            public: this.definition.public,
            start_jupyter: this.definition.start_jupyter,
            start_ssh: this.definition.start_ssh,
        };

        // Templates accept only a persistent mount — a `network` key is rejected with 422.
        // Both size and path are required together; a partial mount is a 422 as well.
        if (this.definition.persistent_disk_size !== undefined) {
            if (!this.definition.persistent_disk_path) {
                throw new Error(
                    `Template ${this.definition.name} sets persistent_disk_size but no ` +
                    `persistent_disk_path. RunPod requires both — there is no default path.`
                );
            }
            body.mounts = {
                persistent: {
                    size: this.definition.persistent_disk_size,
                    path: this.definition.persistent_disk_path,
                },
            };
        }

        return toApiBody(body);
    }

    private applyState(template: any, existing?: boolean): void {
        this.state.id = template?.id ?? this.state.id;
        this.state.name = template?.name ?? this.definition.name;
        this.state.image = template?.image ?? this.definition.image;
        this.state.existing = existing;
    }
}
