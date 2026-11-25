import { MonkEntity } from "monkec/base";
import tasks from "tasks";
import http from "http";
import k8s from "k8s";
import secret from "secret";
import cli from "cli";
import crypto from "crypto";
import { renderSpec, registryOf, credentials, outcome, step, IMAGE, imagesToPin, pinned, toManifest, resolveDigest, parseImage } from "./render.ts";

/**
 * A chart to render, and with what.
 * @interface TemplateDefinition
 */
export interface TemplateDefinition {
    /**
     * @description The chart: an oci:// reference (oci://ghcr.io/org/charts/app), a chart name in repo, or a URL of a packaged chart. Or give chart_blob.
     */
    chart?: string;

    /**
     * @description A blob with the chart's directory, as a MANIFEST's `BLOBS chart/app` loads it with the stack: `chart_blob: blobs://chart/app`. Each version of the chart is its own blob.
     */
    chart_blob?: string;

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
     * @description Images to pin to the digest their tag points at when rendered, as patterns where * matches anything (e.g. ["ghcr.io/acme/*"]): `app:main` becomes `app:main@sha256:...`, so a new image under the same tag changes the manifest, and an unchanged one doesn't
     */
    pin_images?: string[];

    /**
     * @description Secrets with credentials per registry host, for pinning images in private registries: {"ghcr.io": "ghcr-token"}. Each value is "user:password", or a token alone
     */
    registry_secrets?: Record<string, string>;

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
    /** @description The manifest to apply: the render, with pin_images pinned to digests */
    manifest?: string;
    /** @description What helm template gave, before pinning */
    rendered?: string;
    /** @description The digest each pinned image's tag pointed at */
    digests?: Record<string, string>;
    /** @description Hash of the inputs it was rendered from */
    inputs?: string;
    /** @description Hash of the inputs of the render an update started last */
    started?: string;
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
        if (this.state.inputs === this.inputs() && this.state.rendered !== undefined) {
            // The same render; its images' tags may point elsewhere now.
            this.stopOther();
            this.pin(this.state.rendered);
            return;
        }
        this.render();
    }

    override checkReadiness(): boolean {
        const want = this.inputs();
        if (this.state.inputs === want && this.state.rendered !== undefined) return this.state.manifest !== undefined;
        // What this check sets isn't kept until it passes, so the run is found
        // by the task's name, and known by the inputs it wrote.
        const s = step(tasks.get(TASK), want);
        switch (s.kind) {
            case "start":
                this.start();
                return false;
            case "waiting":
                cli.output(s.why);
                return false;
            case "failed":
                throw new Error(`${this.what()}: ${s.why}`);
        }
        this.pin(s.manifest);
        this.state.rendered = s.manifest;
        this.state.inputs = want;
        this.state.rendered_at = new Date().toISOString();
        const n = (s.manifest.match(/^kind:/gm) ?? []).length;
        cli.output(`rendered ${this.what()}${this.definition.version ? ` ${this.definition.version}` : ""}: ${n} objects`);
        return true;
    }

    /** Sets state.manifest from a render, with pin_images pinned to their digests now. */
    private pin(rendered: string): void {
        const patterns = this.definition.pin_images ?? [];
        if (patterns.length === 0) {
            this.state.manifest = rendered;
            return;
        }
        const objs = k8s.parse(rendered);
        const digests: Record<string, string> = {};
        for (const image of imagesToPin(objs, patterns)) {
            const host = parseImage(image).registry;
            const name = this.definition.registry_secrets?.[host];
            const login = name ? credentials(this.secretValue(name, `registry_secrets["${host}"]`)) : undefined;
            digests[image] = resolveDigest(image, (url, o) => http.do(url, o), login);
        }
        const changed = Object.entries(digests).filter(([img, d]) => this.state.digests?.[img] !== d).map(([img]) => img);
        if (changed.length > 0) cli.output(`pinned ${changed.map((i) => `${i}@${digests[i].slice(0, 19)}`).join(", ")}`);
        this.state.digests = digests;
        this.state.manifest = toManifest(pinned(objs, digests));
    }

    override delete(): void {
        if (tasks.get(TASK)) {
            try {
                tasks.remove(TASK);
            } catch (e) {
                cli.output(`render task: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    }

    /** A registry secret's value; a missing or empty one is an error here, not a 401 from the registry later. */
    private secretValue(name: string, field: string): string {
        const v = secret.get(name);
        if (!v) throw new Error(`${field}: secret ${name} is empty or missing`);
        return v;
    }

    private what(): string {
        return this.definition.chart ?? `chart blob ${this.definition.chart_blob}`;
    }

    private inputs(): string {
        const d = this.definition;
        return crypto.sha256(JSON.stringify([d.chart, d.chart_blob, d.repo, d.version, d.release, d.namespace, d.values ?? {}, d.kube_version, d.image])).slice(0, 16);
    }

    /**
     * Stops a render still running that an update didn't start for the
     * inputs wanted now, so the name is free for the render that is; the
     * readiness check starts that once the stopped one is gone (monkd refuses
     * to start a name that hasn't ended). True when one is running or stopping.
     */
    private stopOther(): boolean {
        const run = tasks.get(TASK);
        if (!run) return false;
        if (run.state === "stopping") return true;
        if (outcome(run).kind !== "waiting") return false;
        if (this.state.started === this.inputs()) return true;
        tasks.remove(TASK, run.id);
        cli.output("the inputs changed while a render ran; stopping it and rendering again");
        return true;
    }

    private render(): void {
        if (this.stopOther()) return;
        this.start();
    }

    private start(): void {
        const d = this.definition;
        let login;
        if (d.registry_secret) {
            const host = registryOf(d.chart ?? "");
            if (!host) throw new Error("registry_secret is for oci:// charts");
            login = { host, ...credentials(this.secretValue(d.registry_secret, "registry_secret")) };
        }
        tasks.start(TASK, renderSpec({
            chart: d.chart, chart_blob: d.chart_blob, repo: d.repo, version: d.version, release: d.release, namespace: d.namespace,
            values: d.values, kube_version: d.kube_version, image: d.image, login, inputs: this.inputs(),
        }));
        this.state.started = this.inputs();
        cli.output(`rendering ${this.what()}${d.version ? ` ${d.version}` : ""} for ${d.namespace} with ${d.image ?? IMAGE}`);
    }
}
