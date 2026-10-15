import { action, Args } from "monkec/base";
import k8s from "k8s";
import cli from "cli";
import { K8sEntity, K8sConnection } from "./k8s-base.ts";
import { readiness } from "./readiness.ts";

/**
 * A value to copy out of the object found.
 * @interface LookupField
 */
export interface LookupField {
    /** @description State key to put the value under */
    name: string;
    /** @description Dot path in the object, e.g. status.loadBalancer.ingress.0.ip */
    path: string;
}

/**
 * What to look up.
 * @interface LookupDefinition
 */
export interface LookupDefinition extends K8sConnection {
    /** @description API version, e.g. v1 or apps/v1 */
    api_version: string;
    /** @description Kind, e.g. Service */
    kind: string;
    /** @description Name of the object; or give label_selector to take the first match */
    name?: string;
    /** @description Label selector, e.g. app.kubernetes.io/name=ingress-nginx */
    label_selector?: string;
    /** @description Look in every namespace (with label_selector) */
    all_namespaces?: boolean;
    /** @description Values to copy into state, each under its own key */
    fields?: LookupField[];
    /** @description Ready only when the object is ready by its kind's rules, not just when it exists (default false) */
    wait_ready?: boolean;
}

/**
 * What was found.
 * @interface LookupState
 */
export interface LookupState {
    /** @description Whether the object exists */
    found?: boolean;
    /** @description Name of the object found */
    name?: string;
    /** @description Namespace of the object found */
    namespace?: string;
    /** @description Kubernetes UID */
    uid?: string;
    /** @description The state keys the fields went to */
    field_names?: string[];
    /** @description How many objects matched label_selector */
    matches?: number;
}

/** State keys the lookup uses itself. */
const RESERVED = ["found", "name", "namespace", "uid", "matches", "field_names", "definition_hash"];

/** The value at a dot path; array items by index. */
export function pick(obj: any, path: string): unknown {
    let v: any = obj;
    for (const part of path.split(".")) {
        if (v === null || v === undefined) return undefined;
        v = Array.isArray(v) ? v[Number(part)] : v[part];
    }
    return v;
}

/**
 * @description Kubernetes lookup.
 * Reads an object Monk does not manage, by name or label selector, and
 * copies the fields asked for into state, for other entities to wire to:
 * an ingress controller's load balancer address, a Secret's name, a
 * ConfigMap's settings. It never changes the cluster.
 *
 * The lookup is ready once the object exists (or, with wait_ready, once it
 * is ready by its kind's rules), and is read again on every readiness
 * check, so the values follow the cluster.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` (a kubeconfig) or `token_secret` (a bearer token), when set
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.<name>` - each field asked for, as a string, under its name
 * - `state.found`, `state.name`, `state.namespace`, `state.uid`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `k8s/cluster` - wire the connection fields to its state
 */
export class Lookup extends K8sEntity<LookupDefinition, LookupState> {
    override create(): void {
        this.look();
    }

    override update(): void {
        this.look();
    }

    override checkReadiness(): boolean {
        const obj = this.look();
        if (!obj) {
            cli.output(`waiting for ${this.what()} to exist`);
            return false;
        }
        if (this.definition.wait_ready) {
            const r = readiness(obj);
            if (!r.ready) {
                cli.output(`waiting for ${this.what()}: ${r.reason}`);
                return false;
            }
        }
        return true;
    }

    /** Prints the object found. */
    @action("get")
    get(_args?: Args): void {
        cli.output(JSON.stringify(this.look() ?? null, null, 2));
    }

    private what(): string {
        const d = this.definition;
        return `${d.kind} ${d.name ?? `with labels ${d.label_selector}`}`;
    }

    /** Reads the object and fills in the state; null when there is none. */
    private look(): any {
        const d = this.definition;
        if (!d.name && !d.label_selector) throw new Error("set name or label_selector");
        let obj: any = null;
        if (d.name) {
            obj = this.k8s(`reading ${this.what()}`, (c) => k8s.read(c, { apiVersion: d.api_version, kind: d.kind, name: d.name!, namespace: d.namespace }));
        } else {
            const all = this.k8s(`listing ${this.what()}`, (c) => k8s.list(c, {
                apiVersion: d.api_version, kind: d.kind, namespace: d.namespace,
                allNamespaces: d.all_namespaces, labelSelector: d.label_selector,
            }));
            this.state.matches = all.length;
            obj = all[0] ?? null;
        }
        this.state.found = obj !== null;
        this.state.name = obj?.metadata?.name;
        this.state.namespace = obj?.metadata?.namespace;
        this.state.uid = obj?.metadata?.uid;
        const st = this.state as Record<string, unknown>;
        for (const k of this.state.field_names ?? []) delete st[k];
        const names: string[] = [];
        for (const f of d.fields ?? []) {
            if (RESERVED.indexOf(f.name) >= 0) throw new Error(`field name ${f.name} is taken by the lookup's own state`);
            names.push(f.name);
            const v = obj ? pick(obj, f.path) : undefined;
            if (v === undefined || v === null) continue;
            st[f.name] = typeof v === "object" ? JSON.stringify(v) : String(v);
        }
        this.state.field_names = names;
        return obj;
    }
}
