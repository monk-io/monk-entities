import { action, Args } from "monkec/base";
import k8s from "k8s";
import cli from "cli";
import { K8sEntity, K8sConnection, CONNECTION_FIELDS } from "./k8s-base.ts";
import { OWNER } from "./objects.ts";
import { asManifest } from "./manifest.ts";
import { typedFor, yamlField } from "./typed-import.ts";

/**
 * Which namespace to take stock of, and how to reach its cluster.
 * @interface InventoryDefinition
 */
export interface InventoryDefinition extends K8sConnection {
    /**
     * @description Kinds to leave out besides the ones always left out (events, endpoints, leases, controller revisions), e.g. ["ConfigMap"]
     */
    skip_kinds?: string[];
}

/**
 * An object found in the namespace.
 * @interface InventoryItem
 */
export interface InventoryItem {
    /** @description API version, e.g. apps/v1 */
    api_version: string;
    /** @description Kind */
    kind: string;
    /** @description Name */
    name: string;
    /** @description Namespace, for a namespaced kind */
    namespace?: string;
    /** @description What else manages it, when something says so: helm:<release>, argocd:<app>, flux:<kustomization> */
    managed_by?: string;
}

/**
 * What the namespace holds.
 * @interface InventoryState
 */
export interface InventoryState {
    /** @description The namespace taken stock of */
    namespace?: string;
    /** @description Its objects that nothing else in it owns, sorted by kind and name */
    objects?: InventoryItem[];
    /** @description Objects that appeared since the stock was last taken, as Kind/name */
    new_objects?: string[];
    /** @description Objects that went since the stock was last taken, as Kind/name */
    gone_objects?: string[];
    /** @description API groups the cluster would not describe when stock was last taken; their objects are carried over, not counted as gone */
    unreadable_apis?: string[];
}

/** Kinds that are records of what happens, not things anyone deploys. */
const ALWAYS_SKIPPED = ["Event", "Endpoints", "EndpointSlice", "Lease", "ControllerRevision", "Binding"];

/** Secret types the cluster or a tool keeps for itself. */
const SYSTEM_SECRETS = ["kubernetes.io/service-account-token", "helm.sh/release.v1"];

/** A kind the cluster serves. */
interface Kind {
    apiVersion: string;
    kind: string;
    namespaced: boolean;
    verbs: string[];
}

function key(o: { kind: string; name: string }): string {
    return `${o.kind}/${o.name}`;
}

/** What else manages obj, from the labels and annotations tools leave. */
export function managerOf(obj: any): string | undefined {
    const labels = obj?.metadata?.labels ?? {};
    const annotations = obj?.metadata?.annotations ?? {};
    if (annotations[OWNER]) return `monk:${annotations[OWNER]}`;
    if (labels["argocd.argoproj.io/instance"]) return `argocd:${labels["argocd.argoproj.io/instance"]}`;
    if (annotations["argocd.argoproj.io/tracking-id"]) return `argocd:${String(annotations["argocd.argoproj.io/tracking-id"]).split(":")[0]}`;
    if (labels["kustomize.toolkit.fluxcd.io/name"]) return `flux:${labels["kustomize.toolkit.fluxcd.io/name"]}`;
    if (annotations["meta.helm.sh/release-name"]) return `helm:${annotations["meta.helm.sh/release-name"]}`;
    return undefined;
}

/** Whether obj is something the cluster made for itself in every namespace. */
function isSystem(obj: any): boolean {
    const name = obj.metadata?.name;
    if (obj.kind === "ServiceAccount" && name === "default") return true;
    if (obj.kind === "ConfigMap" && name === "kube-root-ca.crt") return true;
    if (obj.kind === "Service" && name === "kubernetes" && obj.metadata?.namespace === "default") return true;
    if (obj.kind === "Secret" && SYSTEM_SECRETS.includes(obj.type)) return true;
    return false;
}

/** A name Monk takes for a template: lowercase letters, digits and dashes. */
export function slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

/** s as a YAML scalar: JSON's quoting is YAML's too. */
function scalar(v: unknown): string {
    return typeof v === "string" ? JSON.stringify(v) : String(v);
}

/**
 * @description Takes stock of a Kubernetes namespace and writes a Monk
 * template that maps it. The objects found that nothing else in the
 * namespace owns (Deployments, Services, ConfigMaps, custom resources;
 * not the ReplicaSets and Pods a Deployment makes) are listed in state,
 * with what else manages them: a Helm release, an Argo CD app, a Flux
 * kustomization.
 *
 * The `template` action prints a template with one entity per object in
 * `mode: observe`, which maps the object without ever changing it, and
 * refreshes every two minutes; load it with `monk load` to see the
 * namespace as a Monk stack and wire Monk workloads to it. An object gets
 * its typed entity (`k8s/deployment`, `k8s/service`, `k8s/config-map`,
 * `k8s/volume`) when that entity renders it exactly, so that switching it
 * to `mode: manage` changes nothing; otherwise a `k8s/resource` with its
 * manifest, and a comment saying why. Secret values are never copied. The `refresh` action takes stock again and says what
 * appeared or went since the last time.
 *
 * Nothing on the cluster is changed, and deleting the entity changes
 * nothing either.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` (a kubeconfig) or `token_secret` (a bearer token), when set
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.namespace` - the namespace taken stock of
 * - `state.objects` - what it holds
 */
export class Inventory extends K8sEntity<InventoryDefinition, InventoryState> {
    override create(): void {
        this.take();
    }

    override update(): void {
        this.take();
    }

    override delete(): void {
        cli.output("forgetting the inventory; nothing on the cluster changes");
    }

    /** Takes stock again and says what appeared or went since the last time. */
    @action("refresh")
    refresh(_args?: Args): void {
        this.take();
    }

    /**
     * Prints a Monk template that maps the namespace. Args: namespace (the
     * template's Monk namespace, default imported-<namespace>), every
     * (seconds between refreshes, default 120), typed (false for a
     * k8s/resource per object, default true).
     */
    @action("template")
    template(args?: Args): void {
        const objects = this.state.objects ?? [];
        if (objects.length === 0) throw new Error("nothing to map: the inventory is empty");
        const ns = this.state.namespace ?? "default";
        const monkNs = slug(args?.namespace ?? `imported-${ns}`);
        const every = Number(args?.every ?? 120);
        if (!Number.isInteger(every) || every < 30) throw new Error("every is a whole number of seconds, at least 30");

        const typed = !["false", "0", "no", "off"].includes(String(args?.typed ?? "true").trim().toLowerCase());

        const settings: Record<string, unknown> = {};
        const connection: string[] = [];
        for (const f of CONNECTION_FIELDS) {
            const v = (this.definition as any)[f];
            if (f === "namespace" || v === undefined || v === null || v === "") continue;
            settings[f] = v;
            connection.push(`  ${f}: ${scalar(v)}`);
        }
        settings.namespace = ns;
        connection.push(`  namespace: ${scalar(ns)}`);
        // Each entity reads the cluster's credentials itself.
        const secrets = [this.definition.kubeconfig_secret, this.definition.token_secret].filter((v): v is string => !!v);
        if (secrets.length > 0) connection.push("  permitted-secrets:", ...secrets.map((v) => `    ${scalar(v)}: true`));

        const names = new Set<string>();
        const groups = new Map<string, string[]>();
        const out: string[] = [
            `# Generated by k8s/inventory from namespace ${ns}.`,
            "# Every entity observes its object and never changes it (mode: observe).",
            "# A typed entity renders its object as it is, so mode: manage changes nothing.",
            "# Secret values stay on the cluster.",
            `namespace: ${monkNs}`,
            "",
        ];
        for (const o of objects) {
            if (o.managed_by?.startsWith("monk:")) {
                out.push(`# ${o.kind} ${o.name} is left out: Monk manages it already (${o.managed_by.slice(5)})`, "");
                continue;
            }
            let name = slug(`${o.kind}-${o.name}`);
            for (let i = 2; names.has(name); i++) name = slug(`${o.kind}-${o.name}-${i}`);
            names.add(name);
            const live = this.k8s(`reading ${o.kind} ${o.name}`, (c) =>
                k8s.read(c, { apiVersion: o.api_version, kind: o.kind, name: o.name, namespace: o.namespace }));
            if (live === null) {
                cli.output(`${o.kind} ${o.name} is gone; left out`);
                continue;
            }
            const group = o.managed_by?.startsWith("helm:") ? slug(`release-${o.managed_by.slice(5)}`) : "";
            groups.set(group, [...(groups.get(group) ?? []), name]);
            const choice = typed ? typedFor(live, settings) : {};
            out.push(`${name}:`);
            if (o.managed_by) out.push(`  # managed by ${o.managed_by}`);
            if (choice.typed) {
                out.push(`  defines: ${choice.typed.type}`, "  mode: observe", ...connection);
                for (const [k, v] of Object.entries(choice.typed.fields)) out.push(...yamlField(k, v, "  "));
            } else {
                const manifest = JSON.stringify(asManifest(live), null, 2).split("\n").map((l) => `    ${l}`).join("\n");
                if (choice.reason) out.push(`  # k8s/resource: ${choice.reason}`);
                out.push("  defines: k8s/resource", "  mode: observe", ...connection);
                out.push("  manifest: |", manifest);
            }
            out.push("  crons:", "    refresh:", "      action: refresh", `      every: ${every}`, "");
        }
        const top: string[] = [];
        for (const [group, members] of groups) {
            if (group === "") {
                top.push(...members);
                continue;
            }
            out.push(`${group}:`, "  defines: process-group", "  runnable-list:", ...members.map((m) => `    - ${monkNs}/${m}`), "");
            top.push(group);
        }
        out.push("stack:", "  defines: process-group", "  runnable-list:", ...top.map((m) => `    - ${monkNs}/${m}`));
        cli.output(out.join("\n"));
    }

    /**
     * The kinds the cluster serves, read API group by API group, each read
     * retried. An API the cluster will not describe after that, such as an
     * aggregated API that is down, is named in unreadable rather than
     * passed over without a word.
     */
    private discover(): { kinds: Kind[]; unreadable: string[] } {
        const get = (what: string, path: string): any => this.k8s(what, (c) => {
            const res = k8s.request(c, "GET", path);
            if (!res.statusCode || res.statusCode >= 300) {
                const err: any = new Error(`GET ${path} failed: ${res.statusCode || res.error || "no response"}`);
                err.kind = res.statusCode ? "status" : "transport";
                err.status = res.statusCode ?? 0;
                err.method = "GET";
                err.url = path;
                err.body = res.body ?? "";
                err.headers = res.headers ?? {};
                throw err;
            }
            try {
                return JSON.parse(res.body || "{}");
            } catch (_e) {
                const err: any = new Error(`GET ${path} answered with a body that is not JSON`);
                err.kind = "malformed";
                err.status = res.statusCode;
                err.method = "GET";
                err.url = path;
                err.body = res.body ?? "";
                err.headers = res.headers ?? {};
                throw err;
            }
        });
        const groups = get("listing the API groups", "/apis");
        const versions = ["v1", ...(groups.groups ?? []).map((g: any) => g.preferredVersion?.groupVersion).filter((v: any) => !!v)];
        const kinds: Kind[] = [];
        const unreadable: string[] = [];
        for (const gv of versions) {
            let list: any;
            try {
                list = get(`reading the API ${gv}`, gv === "v1" ? "/api/v1" : `/apis/${gv}`);
            } catch (_e) {
                unreadable.push(gv);
                continue;
            }
            for (const r of list.resources ?? []) {
                // Subresources (deployments/scale) are not kinds of their own.
                if (String(r.name).includes("/")) continue;
                kinds.push({ apiVersion: gv, kind: r.kind, namespaced: !!r.namespaced, verbs: r.verbs ?? [] });
            }
        }
        return { kinds, unreadable };
    }

    /** Lists the namespace and notes what changed since the last time. */
    private take(): void {
        const ns = this.definition.namespace ?? this.defaultNamespace();
        const skipped = [...ALWAYS_SKIPPED, ...(this.definition.skip_kinds ?? [])];
        const { kinds: served, unreadable } = this.discover();
        const kinds = served
            .filter((r) => r.namespaced && r.verbs.includes("list") && !skipped.includes(r.kind) && !r.apiVersion.startsWith("metrics.k8s.io/"));
        const seen = new Set<string>();
        const found: InventoryItem[] = [];
        for (const r of kinds) {
            // events.k8s.io serves Event again; a kind is listed once.
            if (seen.has(r.kind)) continue;
            seen.add(r.kind);
            const items = this.k8s(`listing ${r.kind}`, (c) => k8s.list(c, { apiVersion: r.apiVersion, kind: r.kind, namespace: ns }));
            for (const obj of items) {
                if ((obj.metadata?.ownerReferences ?? []).length > 0 || isSystem(obj)) continue;
                const item: InventoryItem = { api_version: r.apiVersion, kind: r.kind, name: obj.metadata.name, namespace: ns };
                const manager = managerOf(obj);
                if (manager) item.managed_by = manager;
                found.push(item);
            }
        }
        // What the cluster would not describe is not gone: it is carried over.
        found.push(...(this.state.objects ?? []).filter((o) => unreadable.includes(o.api_version)));
        found.sort((a, b) => (a.kind === b.kind ? (a.name < b.name ? -1 : 1) : a.kind < b.kind ? -1 : 1));
        for (const gv of unreadable) cli.output(`could not read the API ${gv}; its objects are carried over from the last stock`);
        this.state.unreadable_apis = unreadable;

        const before = new Set((this.state.objects ?? []).map(key));
        const now = new Set(found.map(key));
        const first = this.state.objects === undefined;
        this.state.new_objects = first ? [] : found.map(key).filter((k) => !before.has(k));
        this.state.gone_objects = (this.state.objects ?? []).map(key).filter((k) => !now.has(k));
        for (const k of this.state.new_objects) cli.output(`new: ${k}`);
        for (const k of this.state.gone_objects) cli.output(`gone: ${k}`);
        this.state.namespace = ns;
        this.state.objects = found;
        const managed = found.filter((o) => o.managed_by).length;
        cli.output(`${found.length} objects in ${ns}${managed ? `, ${managed} managed by other tools` : ""}`);
    }
}
