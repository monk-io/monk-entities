import { MonkEntity } from "monkec/base";
import tasks from "tasks";
import secret from "secret";
import cli from "cli";
import crypto from "crypto";
import { renderSpec, registryOf, credentials, outcome, IMAGE } from "./render.ts";

/**
 * A chart to render, and with what.
 * @interface TemplateDefinition
 */
export interface TemplateDefinition {
    /**
     * @description The chart: an oci:// reference (oci://ghcr.io/org/charts/app), a chart name in repo, or a URL of a packaged chart
     */
    chart: string;

    /**
     * @description A chart repository URL, for a chart given by name
     */
    repo?: string;

    /**
     * @description The chart's version; the latest when left out
     */
    version?: string;

    /**
     * @description The release name the chart is rendered with, which most charts build object names from
     */
    release: string;

    /**
     * @description The namespace the objects are rendered for
     */
    namespace: string;

    /**
     * @description Values for the chart, as a values file would give them
     */
    values?: Record<string, unknown>;

    /**
     * @description Secret with credentials for the chart's OCI registry: "user:password", or a token alone (as for ghcr.io)
     */
    registry_secret?: string;

    /**
     * @description Kubernetes version the chart is rendered for (helm's --kube-version)
     */
    kube_version?: string;

    /**
     * @description Image with helm in it; alpine/helm by default
     */
    image?: string;
}

/**
 * What was rendered.
 * @interface TemplateState
 */
export interface TemplateState {
    /** @description The rendered manifest: multi-document YAML */
    manifest?: string;
    /** @description Hash of the inputs it was rendered from */
    inputs?: string;
    /** @description The render task's run */
    task_id?: string;
    /** @description When it was rendered */
    rendered_at?: string;
}

const TASK = "render";

/**
 * @description Renders a Helm chart (helm template) in a container that Monk
 * runs to completion, and keeps the manifest in its state, for another entity
 * to apply: `manifest: <- connection-target("chart") entity-state get-member("manifest")`.
 *
 * Nothing is installed: no release, no cluster access. A change to the
 * chart, version or values renders again on update.
 *
 * Needs `permissions: tasks: {max: 1}`, and the registry secret in
 * `permissions: secrets`.
 */
export class Template extends MonkEntity<TemplateDefinition, TemplateState> {
    /** Pulling the image and the chart: up to 10 minutes, checked every 3 s. */
    static readiness = { period: 3, initialDelay: 1, attempts: 200 };

    override create(): void {
        this.render();
    }

    override update(): void {
        if (this.state.inputs === this.inputs() && this.state.manifest !== undefined) {
            cli.output("chart, version and values are unchanged");
            return;
        }
        this.render();
    }

    override checkReadiness(): boolean {
        if (!this.state.task_id) return this.state.manifest !== undefined;
        const o = outcome(tasks.get(TASK, this.state.task_id));
        if (o.kind === "waiting") {
            cli.output(o.why);
            return false;
        }
        if (o.kind === "failed") throw new Error(`${this.definition.chart}: ${o.why}`);
        this.state.manifest = o.manifest;
        this.state.rendered_at = new Date().toISOString();
        this.state.task_id = undefined;
        const n = (o.manifest.match(/^kind:/gm) ?? []).length;
        cli.output(`rendered ${this.definition.chart}${this.definition.version ? ` ${this.definition.version}` : ""}: ${n} objects`);
        return true;
    }

    override delete(): void {
        if (this.state.task_id) {
            try {
                tasks.remove(TASK, this.state.task_id);
            } catch (e) {
                cli.output(`render task: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    private inputs(): string {
        const d = this.definition;
        return crypto.sha256(JSON.stringify([d.chart, d.repo, d.version, d.release, d.namespace, d.values ?? {}, d.kube_version, d.image])).slice(0, 16);
    }

    private render(): void {
        const d = this.definition;
        let login;
        if (d.registry_secret) {
            const host = registryOf(d.chart);
            if (!host) throw new Error("registry_secret is for oci:// charts");
            login = { host, ...credentials(secret.get(d.registry_secret) ?? "") };
        }
        const run = tasks.start(TASK, renderSpec({
            chart: d.chart, repo: d.repo, version: d.version, release: d.release, namespace: d.namespace,
            values: d.values, kube_version: d.kube_version, image: d.image, login,
        }));
        this.state.task_id = run.id;
        this.state.inputs = this.inputs();
        cli.output(`rendering ${d.chart}${d.version ? ` ${d.version}` : ""} for ${d.namespace} with ${d.image ?? IMAGE}`);
    }
}
