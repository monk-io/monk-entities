import { action, Args } from "monkec/base";
import k8s from "k8s";
import cli from "cli";
import { K8sEntity, K8sConnection, listNodes, nodeAddress, defined } from "./k8s-base.ts";
import { readiness } from "./readiness.ts";

/** The annotation that says which Monk entity manages an object. */
export const OWNER = "monk.io/owner";

/**
 * How an entity that manages Kubernetes objects keeps them.
 * @interface ObjectsDefinition
 */
export interface ObjectsDefinition extends K8sConnection {
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

    /**
     * @description Which node address node_address is: ExternalIP, InternalIP or Hostname (default ExternalIP if nodes have one, else InternalIP)
     */
    node_address_type?: string;
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
 * @interface ObjectsState
 */
export interface ObjectsState {
    /**
     * @description The objects this entity manages, in the order they are applied
     */
    objects?: ManagedObject[];

    /**
     * @description Whether every object is ready
     */
    ready?: boolean;

    /**
     * @description The objects a delete removed, until the cluster has let go of them
     */
    deleting?: ManagedObject[];

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

    /**
     * @description Address of a ready node, where node_port is reachable
     */
    node_address?: string;

    /**
     * @description Host to reach the first Service at from outside the cluster when it can be: its load balancer, else a node (with node_port), else its cluster IP
     */
    host?: string;

    /**
     * @description Port that goes with host
     */
    port?: number;

    /**
     * @description host:port
     */
    endpoint?: string;
}

export function describe(o: { kind: string; name: string; namespace?: string }): string {
    return `${o.kind} ${o.namespace ? o.namespace + "/" : ""}${o.name}`;
}

/** obj with a Secret's values hidden, for printing. */
function redacted(obj: any): any {
    if (obj?.kind !== "Secret") return obj;
    const hide = (m: any) => (m ? Object.fromEntries(Object.keys(m).map((k) => [k, "(hidden)"])) : m);
    const out: any = { ...obj, data: hide(obj.data), stringData: hide(obj.stringData) };
    if (out.metadata?.annotations?.["kubectl.kubernetes.io/last-applied-configuration"]) {
        out.metadata = { ...out.metadata, annotations: { ...out.metadata.annotations, "kubectl.kubernetes.io/last-applied-configuration": "(hidden)" } };
    }
    if (out.metadata?.managedFields) out.metadata = { ...out.metadata, managedFields: undefined };
    return out;
}

function ref(o: ManagedObject) {
    return defined({ apiVersion: o.api_version, kind: o.kind, name: o.name, namespace: o.namespace });
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
 * Base for entities that keep a set of Kubernetes objects on a cluster:
 * what desired() returns is applied with server-side apply, objects it no
 * longer returns are deleted, and deleting the entity deletes what it
 * created. Each object is annotated with the entity's path, and objects
 * that exist without it are only taken over with `adopt: true`.
 */
export abstract class K8sObjects<D extends ObjectsDefinition, S extends ObjectsState> extends K8sEntity<D, S> {
    /** Rollouts pull images and attach volumes: up to five minutes. */
    static readiness = { period: 5, initialDelay: 2, attempts: 60 };

    /**
     * Finalizers hold objects until what they stand for is released (a
     * LoadBalancer Service's load balancer, a claimed volume): up to ten
     * minutes.
     */
    static deletion = { period: 5, attempts: 120 };

    /** The objects the entity should keep, as Kubernetes takes them. */
    protected abstract desired(): any[];

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
        // A delete run again still waits for what the last one removed.
        const deleting: ManagedObject[] = [...(this.state.deleting ?? [])];
        for (const o of [...objects].reverse()) {
            if (o.adopted) {
                cli.output(`${describe(o)} was adopted; leaving it in place`);
                continue;
            }
            if (this.keeps(o)) {
                cli.output(`keeping ${describe(o)}`);
                continue;
            }
            const removed = this.k8s(`deleting ${describe(o)}`, (c) =>
                k8s.remove(c, ref(o)));
            cli.output(removed ? `deleted ${describe(o)}` : `${describe(o)} was already deleted`);
            if (!deleting.some((d) => sameObject(d, o))) deleting.push(o);
        }
        this.state.objects = [];
        this.state.ready = false;
        this.state.deleting = deleting;
    }

    /**
     * Whether the objects the delete removed are gone. Kubernetes keeps an
     * object with finalizers until they have run, so this waits for a
     * LoadBalancer Service's load balancer or a claim's volume to be
     * released too.
     */
    override checkDeleted(): boolean {
        for (const o of this.state.deleting ?? []) {
            const live = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, ref(o)));
            // One of the same name made since is another object.
            if (live === null || (o.uid && live.metadata?.uid && live.metadata.uid !== o.uid)) continue;
            const finalizers: string[] = live.metadata?.finalizers ?? [];
            cli.output(`waiting for ${describe(o)} to go${finalizers.length > 0 ? ` (finalizers: ${finalizers.join(", ")})` : ""}`);
            return false;
        }
        this.state.deleting = undefined;
        return true;
    }

    override checkReadiness(): boolean {
        if (this.definition.wait === false) return true;
        // A check that fails keeps no state, so what is awaited is printed.
        this.firstService = undefined;
        let waitingFor: string | undefined;
        for (const o of this.state.objects ?? []) {
            const live = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, ref(o)));
            this.noteOutputs(live);
            this.observe(live);
            const r = readiness(live);
            if (!r.ready && waitingFor === undefined) waitingFor = `${describe(o)}: ${r.reason}`;
        }
        this.noteEndpoint();
        this.state.ready = waitingFor === undefined;
        if (waitingFor !== undefined) cli.output(`waiting for ${waitingFor}`);
        return this.state.ready;
    }

    /** Whether an object stays on the cluster when the entity no longer wants it. */
    protected keeps(_o: ManagedObject): boolean {
        return false;
    }

    /** Lets an entity note what it reports from an object as last read or applied. */
    protected observe(_obj: any): void {}

    /**
     * Applies the objects again. Monk skips an update when the definition
     * has not changed, so this is how changed Monk secrets reach the
     * cluster.
     */
    @action("apply")
    reapply(_args?: Args): void {
        this.applyAll();
    }

    /** Shows whether each object is ready. */
    @action("status")
    status(_args?: Args): void {
        for (const o of this.state.objects ?? []) {
            const live = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, ref(o)));
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
                k8s.read(c, ref(o)));
            cli.output(JSON.stringify(redacted(live), null, 2));
        }
    }

    /** Restarts the pods of the Deployments, StatefulSets and DaemonSets, as kubectl rollout restart does. */
    @action("restart")
    restart(_args?: Args): void {
        const at = new Date().toISOString();
        for (const o of this.state.objects ?? []) {
            if (o.kind !== "Deployment" && o.kind !== "StatefulSet" && o.kind !== "DaemonSet") continue;
            // A field of its own manager, so applying the objects again
            // neither undoes nor fights it.
            this.k8s(`restarting ${describe(o)}`, (c) => k8s.apply(c, {
                apiVersion: o.api_version, kind: o.kind,
                metadata: defined({ name: o.name, namespace: o.namespace }),
                spec: { template: { metadata: { annotations: { "kubectl.kubernetes.io/restartedAt": at } } } },
            }, { fieldManager: "monk-restart" }));
            cli.output(`restarting ${describe(o)}`);
        }
    }

    /** Applies the desired objects, then deletes what is no longer desired. */
    private applyAll(): void {
        const desired = this.desired();
        if (desired.length === 0) throw new Error("no objects to apply");
        const ordered = desired
            .map((obj, i) => ({ obj, i }))
            .sort((a, b) => applyOrder(a.obj.kind) - applyOrder(b.obj.kind) || a.i - b.i)
            .map((x) => x.obj);

        const previous = this.state.objects ?? [];
        const fieldManager = this.definition.field_manager ?? "monk";
        let defaultNs: string | undefined;
        const managed: ManagedObject[] = [];
        this.firstService = undefined;

        for (const obj of ordered) {
            if (!obj.apiVersion || !obj.kind || !obj.metadata?.name) {
                throw new Error(`object without apiVersion, kind and metadata.name: ${JSON.stringify(obj).slice(0, 200)}`);
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
                throw new Error(`${describe(entry)} is given twice`);
            }
            const known = previous.find((p) => sameObject(p, entry));
            entry.adopted = known?.adopted ?? (known ? false : this.claim(entry));

            obj.metadata.annotations = { ...(obj.metadata.annotations ?? {}), [OWNER]: this.path };
            const applied = this.k8s(`applying ${describe(entry)}`, (c) => k8s.apply(c, obj, { fieldManager }));
            entry.uid = applied.metadata?.uid;
            managed.push(entry);
            cli.output(`applied ${describe(entry)}${entry.adopted ? " (adopted)" : ""}`);
            this.noteOutputs(applied);
            this.observe(applied);
            if (obj.kind === "CustomResourceDefinition") this.waitEstablished(entry);
        }

        for (const p of [...previous].reverse()) {
            if (managed.some((m) => sameObject(m, p))) continue;
            if (p.adopted) {
                cli.output(`${describe(p)} is no longer wanted; it was adopted, so it stays`);
                continue;
            }
            if (this.keeps(p)) {
                cli.output(`${describe(p)} is no longer wanted; keeping it`);
                continue;
            }
            this.k8s(`deleting ${describe(p)}`, (c) =>
                k8s.remove(c, ref(p)));
            cli.output(`deleted ${describe(p)}: it is no longer wanted`);
        }
        this.state.objects = managed;
        this.state.ready = false;
        this.state.deleting = undefined;
        this.noteEndpoint();
    }

    /**
     * Checks that an object the entity has not applied before may be
     * applied, and returns whether that adopts it.
     */
    private claim(o: ManagedObject): boolean {
        const live = this.k8s(`reading ${describe(o)}`, (c) =>
            k8s.read(c, ref(o)));
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
        // Well within the minute a call may take.
        for (let i = 0; i < 20; i++) {
            const crd = this.k8s(`reading ${describe(o)}`, (c) =>
                k8s.read(c, { apiVersion: o.api_version, kind: o.kind, name: o.name }));
            if (readiness(crd).ready) return;
            sleep(1000);
        }
        throw new Error(`${describe(o)} was not established within 20 seconds; applying again picks up from here`);
    }

    /** The first Service, as last read. */
    private firstService?: any;

    private noteOutputs(obj: any): void {
        if (obj?.kind === "Service" && this.firstService === undefined) this.firstService = obj;
    }

    /** Fills in the ways to reach the first Service. */
    private noteEndpoint(): void {
        const svc = this.firstService;
        const port = svc?.spec?.ports?.[0];
        const ingress = svc?.status?.loadBalancer?.ingress?.[0];
        this.state.cluster_ip = svc?.spec?.clusterIP;
        this.state.load_balancer = ingress ? (ingress.hostname ?? ingress.ip) : undefined;
        this.state.node_port = port?.nodePort;
        this.state.node_address = undefined;
        if (port?.nodePort !== undefined) {
            this.state.node_address = nodeAddress(listNodes(this.cluster()), this.definition.node_address_type);
        }
        this.state.host = undefined;
        this.state.port = undefined;
        if (this.state.load_balancer) {
            this.state.host = this.state.load_balancer;
            this.state.port = port?.port;
        } else if (this.state.node_address && this.state.node_port) {
            this.state.host = this.state.node_address;
            this.state.port = this.state.node_port;
        } else if (this.state.cluster_ip && this.state.cluster_ip !== "None") {
            this.state.host = this.state.cluster_ip;
            this.state.port = port?.port;
        }
        this.state.endpoint = this.state.host && this.state.port ? `${this.state.host}:${this.state.port}` : undefined;
    }
}
