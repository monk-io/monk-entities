import { action, Args } from "monkec/base";
import k8s from "k8s";
import cli from "cli";
import { K8sEntity, K8sConnection } from "./k8s-base.ts";
import { readiness } from "./readiness.ts";

/** The annotation that says which Monk entity manages an object. */
export const OWNER = "monk.io/owner";

/**
 * Kubernetes objects, as a YAML manifest, applied to a cluster.
 * @interface ResourceDefinition
 */
export interface ResourceDefinition extends K8sConnection {
    /**
     * @description The objects, as YAML; several documents separated by --- are fine
     */
    manifest: string;

    /**
     * @description Take over objects that already exist and Monk did not create (default false)
     */
    adopt?: boolean;

    /**
     * @description What deleting this entity does to the objects: delete (default) or orphan. Adopted objects are always left in place.
     */
    on_delete?: string;

    /**
     * @description Wait for the objects to be ready before this entity is (default true)
     */
    wait?: boolean;

    /**
     * @description Field manager for server-side apply (default monk)
     */
    field_manager?: string;
}

/**
 * An object this entity manages.
 * @interface ManagedObject
 */
export interface ManagedObject {
    /** @description API version, e.g. apps/v1 */
    api_version: string;
    /** @description Kind, e.g. Deployment */
    kind: string;
    /** @description Name */
    name: string;
    /** @description Namespace, for a namespaced kind */
    namespace?: string;
    /** @description Kubernetes UID */
    uid?: string;
    /** @description Whether it existed before Monk managed it */
    adopted?: boolean;
}

/**
 * The objects and what they report.
 * @interface ResourceState
 */
export interface ResourceState {
    /**
     * @description The objects this entity manages, in the order they are applied
     */
    objects?: ManagedObject[];

    /**
     * @description Whether every object is ready
     */
    ready?: boolean;

    /**
     * @description Cluster IP of the first Service
     */
    cluster_ip?: string;

    /**
     * @description External address (hostname or IP) of the first LoadBalancer Service
     */
    load_balancer?: string;

    /**
     * @description Node port of the first Service's first port, for NodePort and LoadBalancer Services
     */
    node_port?: number;
}

function describe(o: { kind: string; name: string; namespace?: string }): string {
    return `${o.kind} ${o.namespace ? o.namespace + "/" : ""}${o.name}`;
}

function sameObject(a: ManagedObject, b: ManagedObject): boolean {
    // The version may change (v1beta1 to v1); the object is the same.
    const group = (v: string) => (v.includes("/") ? v.split("/")[0] : "");
    return group(a.api_version) === group(b.api_version) && a.kind === b.kind && a.name === b.name && (a.namespace ?? "") === (b.namespace ?? "");
}

/** Namespaces and CRDs go first, so what lives in them can follow. */
function applyOrder(kind: string): number {
    if (kind === "Namespace") return 0;
    if (kind === "CustomResourceDefinition") return 1;
    return 2;
}

/**
 * @description Kubernetes objects.
 * Applies a manifest of Kubernetes objects to a cluster with server-side
 * apply, as field manager `monk`, and keeps them as the manifest says:
 * updates re-apply it, objects dropped from it are deleted, and deleting
 * the entity deletes what it created. Works with any kind the cluster
 * serves, custom resources included.
 *
 * Every object is annotated `monk.io/owner` with this entity's path. An
 * object that already exists without that annotation is refused unless
 * `adopt: true`; adopted objects are managed from then on but left in place
 * when the entity is deleted.
 *
 * Readiness follows the kinds: rollouts for Deployments, StatefulSets and
 * DaemonSets, completion for Jobs, an address for LoadBalancer Services,
 * Established for CRDs, and a Ready or Available condition for anything
 * else that reports one.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` (a kubeconfig) or `token_secret` (a bearer token), when set
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.cluster_ip` - cluster IP of the first Service
 * - `state.load_balancer` - external address of the first LoadBalancer Service
 * - `state.node_port` - node port of the first Service, for clusters without load balancers
 * - `state.objects` - what the entity manages, with UIDs
 *
 * ## Composing with Other Entities
 * Works with:
 * - `k8s/cluster` - wire the connection fields to its state
 * - anything that needs an address: `connection-target("app") entity-state get-member("load_balancer")`
 */
export class Resource extends K8sEntity<ResourceDefinition, ResourceState> {
    override create(): void {
        this.applyAll();
    }

    override update(): void {
        this.applyAll();
    }

    override delete(): void {
        const objects = this.state.objects ?? [];
        if ((this.definition.on_delete ?? "delete") === "orphan") {
            cli.output(`leaving ${objects.length} objects in place (on_delete: orphan)`);
            return;
        }
        for (const o of [...objects].reverse()) {
            if (o.adopted) {
                cli.output(`${describe(o)} was adopted; leaving it in place`);
                continue;
            }
            const removed = this.k8s(`deleting ${describe(o)}`, (c) =>
                k8s.remove(c, { apiVersion: o.api_version, kind: o.kind, name: o.name, namespace: o.namespace }));
            cli.output(removed ? `deleted ${describe(o)}` : `${describe(o)} was already deleted`);
        }
        this.state.objects = [];
        this.state.ready = false;
    }

    override checkReadiness(): boolean {
        if (this.definition.wait === false) return true;
        // A check that fails keeps no state, so what is awaited is printed.
        this.state.cluster_ip = undefined;
        this.state.load_balancer = undefined;
        this.state.node_port = undefined;
        let waitingFor: string | undefined;
        for (const o of this.state.objects ?? []) {
            const live = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, { apiVersion: o.api_version, kind: o.kind, name: o.name, namespace: o.namespace }));
            this.noteOutputs(live);
            const r = readiness(live);
            if (!r.ready && waitingFor === undefined) waitingFor = `${describe(o)}: ${r.reason}`;
        }
        this.state.ready = waitingFor === undefined;
        if (waitingFor !== undefined) cli.output(`waiting for ${waitingFor}`);
        return this.state.ready;
    }

    /** Shows whether each object is ready. */
    @action("status")
    status(_args?: Args): void {
        for (const o of this.state.objects ?? []) {
            const live = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, { apiVersion: o.api_version, kind: o.kind, name: o.name, namespace: o.namespace }));
            const r = readiness(live);
            cli.output(`${describe(o)}: ${r.ready ? "ready" : r.reason}${o.adopted ? " (adopted)" : ""}`);
        }
    }

    /** Prints the objects as the cluster has them; kind and name args narrow it down. */
    @action("get")
    get(args?: Args): void {
        for (const o of this.state.objects ?? []) {
            if (args?.name && args.name !== o.name) continue;
            if (args?.kind && args.kind !== o.kind) continue;
            const live = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, { apiVersion: o.api_version, kind: o.kind, name: o.name, namespace: o.namespace }));
            cli.output(JSON.stringify(live, null, 2));
        }
    }

    /** Restarts the pods of the Deployments, StatefulSets and DaemonSets, as kubectl rollout restart does. */
    @action("restart")
    restart(_args?: Args): void {
        const at = new Date().toISOString();
        for (const o of this.state.objects ?? []) {
            if (o.kind !== "Deployment" && o.kind !== "StatefulSet" && o.kind !== "DaemonSet") continue;
            // A field of its own manager, so applying the manifest again
            // neither undoes nor fights it.
            this.k8s(`restarting ${describe(o)}`, (c) => k8s.apply(c, {
                apiVersion: o.api_version, kind: o.kind,
                metadata: { name: o.name, namespace: o.namespace },
                spec: { template: { metadata: { annotations: { "kubectl.kubernetes.io/restartedAt": at } } } },
            }, { fieldManager: "monk-restart" }));
            cli.output(`restarting ${describe(o)}`);
        }
    }

    /** Applies the manifest, then deletes what it no longer has. */
    private applyAll(): void {
        const desired = k8s.parse(this.definition.manifest);
        if (desired.length === 0) throw new Error("manifest has no objects");
        const ordered = desired
            .map((obj, i) => ({ obj, i }))
            .sort((a, b) => applyOrder(a.obj.kind) - applyOrder(b.obj.kind) || a.i - b.i)
            .map((x) => x.obj);

        const previous = this.state.objects ?? [];
        const fieldManager = this.definition.field_manager ?? "monk";
        let defaultNs: string | undefined;
        const managed: ManagedObject[] = [];
        this.state.cluster_ip = undefined;
        this.state.load_balancer = undefined;
        this.state.node_port = undefined;

        for (const obj of ordered) {
            if (!obj.apiVersion || !obj.kind || !obj.metadata?.name) {
                throw new Error(`manifest object without apiVersion, kind and metadata.name: ${JSON.stringify(obj).slice(0, 200)}`);
            }
            const res = this.k8s(`looking up ${obj.apiVersion} ${obj.kind}`, (c) => k8s.resource(c, obj.apiVersion, obj.kind));
            let namespace: string | undefined;
            if (res.namespaced) {
                namespace = obj.metadata.namespace ?? (defaultNs ??= this.defaultNamespace());
                obj.metadata.namespace = namespace;
            } else {
                delete obj.metadata.namespace;
            }
            const entry: ManagedObject = { api_version: obj.apiVersion, kind: obj.kind, name: obj.metadata.name, namespace };
            if (managed.some((m) => sameObject(m, entry))) {
                throw new Error(`manifest has ${describe(entry)} twice`);
            }
            const known = previous.find((p) => sameObject(p, entry));
            entry.adopted = known?.adopted ?? (known ? false : this.claim(entry));

            obj.metadata.annotations = { ...(obj.metadata.annotations ?? {}), [OWNER]: this.path };
            const applied = this.k8s(`applying ${describe(entry)}`, (c) => k8s.apply(c, obj, { fieldManager }));
            entry.uid = applied.metadata?.uid;
            managed.push(entry);
            cli.output(`applied ${describe(entry)}${entry.adopted ? " (adopted)" : ""}`);
            this.noteOutputs(applied);
            if (obj.kind === "CustomResourceDefinition") this.waitEstablished(entry);
        }

        for (const p of [...previous].reverse()) {
            if (managed.some((m) => sameObject(m, p))) continue;
            if (p.adopted) {
                cli.output(`${describe(p)} left the manifest; it was adopted, so it stays`);
                continue;
            }
            this.k8s(`deleting ${describe(p)}`, (c) =>
                k8s.remove(c, { apiVersion: p.api_version, kind: p.kind, name: p.name, namespace: p.namespace }));
            cli.output(`deleted ${describe(p)}: it left the manifest`);
        }
        this.state.objects = managed;
        this.state.ready = false;
    }

    /**
     * Checks that an object the entity has not applied before may be
     * applied, and returns whether that adopts it.
     */
    private claim(o: ManagedObject): boolean {
        const live = this.k8s(`reading ${describe(o)}`, (c) =>
            k8s.read(c, { apiVersion: o.api_version, kind: o.kind, name: o.name, namespace: o.namespace }));
        if (live === null) return false;
        const owner = live.metadata?.annotations?.[OWNER];
        if (owner === this.path) return false; // made by this entity before its state was lost
        if (owner) throw new Error(`${describe(o)} is managed by ${owner}; one object cannot have two owners`);
        if (!this.definition.adopt) {
            throw new Error(`${describe(o)} already exists and Monk did not create it; set adopt: true to take it over`);
        }
        return true;
    }

    /** Waits until a CRD is served, so custom resources after it apply. */
    private waitEstablished(o: ManagedObject): void {
        for (let i = 0; i < 60; i++) {
            const crd = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, { apiVersion: o.api_version, kind: o.kind, name: o.name }));
            if (readiness(crd).ready) return;
            sleep(1000);
        }
        throw new Error(`${describe(o)} was not established within a minute`);
    }

    /** Keeps the addresses the first Service reports. */
    private noteOutputs(obj: any): void {
        if (obj?.kind !== "Service" || this.state.cluster_ip !== undefined) return;
        this.state.cluster_ip = obj.spec?.clusterIP;
        this.state.node_port = obj.spec?.ports?.[0]?.nodePort;
        const ingress = obj.status?.loadBalancer?.ingress?.[0];
        if (ingress) this.state.load_balancer = ingress.hostname ?? ingress.ip;
    }
}
