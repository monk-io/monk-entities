import k8s from "k8s";
import crypto from "crypto";
import { K8sObjects, ObjectsDefinition, ObjectsState } from "./objects.ts";

/**
 * What every typed object entity takes besides its own fields.
 * @interface NamedDefinition
 */
export interface NamedDefinition extends ObjectsDefinition {
    /**
     * @description Name of the object (defaults to this entity's name)
     */
    name?: string;

    /**
     * @description Labels added to the objects
     */
    labels?: Record<string, string>;

    /**
     * @description Add app.kubernetes.io/name and app.kubernetes.io/managed-by: monk to the objects' labels (default true); false leaves the labels as given, as an imported object has them
     */
    standard_labels?: boolean;

    /**
     * @description Annotations added to the main object
     */
    annotations?: Record<string, string>;

    /**
     * @description YAML merged into the main object, for fields this entity has no setting for; maps merge, lists and values replace
     */
    override?: string;
}

/**
 * What every typed object entity reports.
 * @interface NamedState
 */
export interface NamedState extends ObjectsState {
    /**
     * @description Name of the main object
     */
    name?: string;

    /**
     * @description Namespace of the main object
     */
    namespace?: string;
}

/** A name Kubernetes takes for most kinds: lower case, digits and dashes, at most 63 characters. */
export function dnsName(s: string): string {
    const n = s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63).replace(/-+$/, "");
    if (!n) throw new Error(`cannot make a Kubernetes name of "${s}"`);
    return n;
}

/** Copies b into a: maps merge, anything else replaces. */
export function merge(a: any, b: any): any {
    if (!isMap(a) || !isMap(b)) return b;
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = k in out ? merge(out[k], v) : v;
    return out;
}

export function isMap(v: any): v is Record<string, any> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * The entries of a map setting sorted by key. Monk keeps a definition's
 * maps as a tree and hands them back sorted, so an entity sorts them too:
 * a list made from one (variables, volumes) is in the same order before
 * and after the template is loaded.
 */
export function sorted(v: { [key: string]: any } | undefined): [string, any][] {
    return Object.entries(v ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** A short hash of a value, to roll pods when what they read at start changes. */
export function digest(v: unknown): string {
    return crypto.sha256(JSON.stringify(v)).slice(0, 16);
}

/**
 * v as a map of strings, with numbers and booleans written out. Monk keeps
 * a definition's maps as a tree, so a key with slashes, as labels and
 * annotations have (app.kubernetes.io/name), comes back nested; it is
 * joined up again here.
 */
export function strings(v: Record<string, unknown> | undefined, prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, x] of Object.entries(v ?? {})) {
        if (x === undefined || x === null) continue;
        const key = prefix ? `${prefix}/${k}` : k;
        if (typeof x === "object" && !Array.isArray(x)) Object.assign(out, strings(x as Record<string, unknown>, key));
        else out[key] = typeof x === "string" ? x : String(x);
    }
    return out;
}

/**
 * Base for entities that keep one named object, and what goes with it,
 * from a few settings rather than a manifest.
 */
export abstract class NamedObjects<D extends NamedDefinition, S extends NamedState> extends K8sObjects<D, S> {
    /** The main object and what goes with it; the main object comes first. */
    protected abstract build(name: string): any[];

    protected desired(): any[] {
        const name = this.objectName();
        const objects = this.build(name);
        const main = objects[0];
        const ns = this.definition.namespace;
        for (const o of objects) {
            o.metadata = o.metadata ?? {};
            if (ns && o.kind !== "Namespace") o.metadata.namespace = o.metadata.namespace ?? ns;
            const labels = { ...this.labels(name), ...(o.metadata.labels ?? {}) };
            if (Object.keys(labels).length > 0) o.metadata.labels = labels;
        }
        if (this.definition.annotations) {
            main.metadata.annotations = { ...(main.metadata.annotations ?? {}), ...strings(this.definition.annotations) };
        }
        if (this.definition.override) {
            const extra = k8s.parse(this.definition.override);
            if (extra.length !== 1) throw new Error("override must be one YAML document");
            objects[0] = merge(main, extra[0]);
        }
        if (objects[0].kind !== this.kind() || !objects[0].metadata?.name) throw new Error(`the main object must be a named ${this.kind()}`);
        this.state.name = objects[0].metadata.name;
        return objects;
    }

    /** The kind of the main object. */
    protected abstract kind(): string;

    protected observe(obj: any): void {
        if (!obj || obj.kind !== this.kind() || obj.metadata?.name !== this.state.name) return;
        this.state.namespace = obj.metadata.namespace;
        this.observeMain(obj);
    }

    /** Lets an entity note what it reports from its main object. */
    protected observeMain(_obj: any): void {}

    /** The main object's name: the name setting, else this entity's own name. */
    protected objectName(): string {
        if (this.definition.name) return dnsName(this.definition.name);
        return dnsName(this.path.split("/").pop() ?? "");
    }

    /** Labels every object gets. Public: see K8sEntity.cluster. */
    labels(name: string): Record<string, string> {
        if (this.definition.standard_labels === false) return strings(this.definition.labels);
        return { ...strings(this.definition.labels), "app.kubernetes.io/name": name, "app.kubernetes.io/managed-by": "monk" };
    }

    /** The objects this entity would apply, main object first; changes nothing on the cluster. */
    manifests(): any[] {
        return this.desired();
    }
}
