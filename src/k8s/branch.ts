import { action, Args } from "monkec/base";
import k8s from "k8s";
import gcp from "cloud/gcp";
import cli from "cli";
import crypto from "crypto";
import { retry, isRetryable } from "monkec/resilience";
import { K8sEntity, K8sConnection } from "./k8s-base.ts";
import { readiness } from "./readiness.ts";
import {
    COPIED_KINDS,
    copyOf,
    isolationPolicy,
    diskName,
    parseHandle,
} from "./branch-copy.ts";

const OWNER = "monk.io/owner";
const BRANCH_OF = "monk.io/branch-of";
const BRANCH_LABEL = "monk.io/branch";
const MARKER = "monk-branch";
const PD_DRIVER = "pd.csi.storage.gke.io";
/** GCE labels on each clone: who made it, and in which run. */
const OWNER_LABEL = "monk-owner";
const RUN_LABEL = "monk-run";
const COMPUTE = "https://compute.googleapis.com/compute/v1";

/**
 * What to branch and where.
 * @interface BranchDefinition
 */
export interface BranchDefinition extends K8sConnection {
    /**
     * @description Namespace to copy: its workloads, Services, ConfigMaps and Secrets, and the data on its volumes
     */
    source_namespace: string;

    /**
     * @description Replicas per Deployment or StatefulSet name in the branch, e.g. {loadgen: 0} to leave a writer out
     */
    replicas?: Record<string, number>;

    /**
     * @description Keep LoadBalancer and NodePort Services as they are; by default the branch's are ClusterIP, reachable only inside the cluster
     */
    expose?: boolean;

    /**
     * @description Seal the branch off with a NetworkPolicy: its pods talk only to each other and to the cluster's DNS (default true). Needs a cluster that enforces NetworkPolicies (GKE Dataplane V2, Calico, Cilium)
     */
    isolate?: boolean;

    /**
     * @description CIDRs the branch's pods may still reach when isolated, e.g. ["0.0.0.0/0"] for the internet (which includes the source's pods unless their CIDR is excluded elsewhere)
     */
    allow_egress?: string[];

    /**
     * @description Disk type for the cloned disks, e.g. pd-balanced; defaults to each source disk's type
     */
    disk_type?: string;

    /**
     * @description A Job to run in the source namespace before the disks are cloned, e.g. to flush a database to disk. Its container: {image, command, args, env}. The clones wait until it completes.
     */
    before_clone?: {
        image: string;
        command?: string[];
        args?: string[];
        env?: Record<string, string>;
    };

    /**
     * @description What to do with a claim whose volume can't be cloned (not a zonal GCE Persistent Disk, e.g. NFS or Filestore): "fail" (default) refuses to branch; "empty" gives the branch a new, empty claim of the same name, class and size
     */
    other_claims?: "fail" | "empty";

    /**
     * @description Keep the cloned disks when the branch is deleted (default false: they are deleted with it)
     */
    keep_disks?: boolean;
}

/**
 * A claim of the source namespace and its clone.
 * @interface ClonedClaim
 */
export interface ClonedClaim {
    /** @description The claim's name, in both namespaces */
    claim: string;
    /** @description The source disk, projects/P/zones/Z/disks/D */
    source_disk: string;
    /** @description The clone's GCE name */
    disk: string;
    /** @description GCP project */
    project: string;
    /** @description Zone */
    zone: string;
    /** @description Size, as the source's PersistentVolume states it, e.g. 30Gi */
    capacity: string;
    /** @description GCE disk type of the clone */
    disk_type?: string;
    /** @description Storage class of the source claim */
    storage_class?: string;
    /** @description Access modes of the source claim */
    access_modes: string[];
    /** @description Filesystem type of the source volume */
    fs_type?: string;
    /** @description Not cloned (other_claims: empty): the branch gets a new, empty claim */
    empty?: boolean;
}

/**
 * How the branch came up.
 * @interface BranchState
 */
export interface BranchState {
    /** @description The branch's namespace */
    namespace?: string;
    /** @description Namespace it was copied from */
    source_namespace?: string;
    /** @description The claims cloned */
    claims?: ClonedClaim[];
    /** @description This run of the branch, as each clone's monk-run label says */
    run_id?: string;
    /** @description Whether a before_clone Job was started */
    before_clone_job?: string;
    /** @description When the branch was asked for (create) */
    requested_at?: string;
    /** @description When the last cloned disk was READY and the objects were applied */
    applied_at?: string;
    /** @description When every workload in the branch was ready */
    ready_at?: string;
    /** @description Seconds from requested_at to applied_at */
    clone_seconds?: number;
    /** @description Seconds from requested_at to ready_at */
    ready_seconds?: number;
    /** @description Objects copied, as Kind/name */
    objects?: string[];
}

/** Seconds between two ISO times. */
function seconds(from?: string, to?: string): number | undefined {
    if (!from || !to) return undefined;
    return Math.round((Date.parse(to) - Date.parse(from)) / 100) / 10;
}

/**
 * @description A copy of a Kubernetes namespace, data included, in a new
 * namespace on the same cluster: a branch of production to test against.
 *
 * Each bound PersistentVolumeClaim of the source namespace on a GCE
 * Persistent Disk (the PD CSI driver, as on GKE) gets a clone of its disk,
 * made by GCE in seconds whatever its size, and a claim of the same name in
 * the branch bound to it, so a copied StatefulSet takes its pods' claims
 * over by name and starts on the source's data. Deployments, StatefulSets,
 * Services, ConfigMaps, Secrets and ServiceAccounts are copied, with
 * `<svc>.<source>.svc` names rewritten to the branch's namespace; Services
 * lose their node ports and load balancers unless `expose`.
 *
 * The branch is sealed off with a NetworkPolicy unless `isolate: false`:
 * cloned databases remember their original peers' addresses and would
 * otherwise reach them.
 *
 * The clones are crash-consistent, as if the source's nodes had lost
 * power: a database recovers them as it would after a crash. `before_clone`
 * runs a Job first (a flush, a checkpoint) to make that recovery short.
 *
 * Deleting the branch deletes its namespace, then its volumes and disks.
 * The source namespace is only read, apart from the before_clone Job.
 */
export class Branch extends K8sEntity<BranchDefinition, BranchState> {
    /** Clones of large disks and first starts on them: up to 30 minutes, checked every 3 s. */
    static readiness = { period: 3, initialDelay: 1, attempts: 600 };

    /** Pods stop, then volumes detach and disks go: up to 15 minutes. */
    static deletion = { period: 5, attempts: 180 };

    private target(): string {
        const ns = this.definition.namespace;
        if (!ns) throw new Error("namespace (the branch's) is required");
        if (ns === this.definition.source_namespace) throw new Error("namespace must differ from source_namespace");
        return ns;
    }

    private annotations(): Record<string, string> {
        return { [OWNER]: this.path, [BRANCH_OF]: this.definition.source_namespace };
    }

    override create(): void {
        const ns = this.target();
        const src = this.definition.source_namespace;
        this.state.requested_at = new Date().toISOString();
        // A branch made again in the same namespace is another run: its
        // clones must be new ones, not those an earlier run kept.
        this.state.run_id = crypto.sha256(`${this.path} ${this.state.requested_at}`).slice(0, 16);
        this.state.namespace = ns;
        this.state.source_namespace = src;

        // Everything that can refuse the branch is checked before anything
        // is written, so a refused branch leaves nothing behind.
        const existing = this.k8s(`reading namespace ${ns}`, (c) => k8s.read(c, { apiVersion: "v1", kind: "Namespace", name: ns }));
        if (existing && existing.metadata?.annotations?.[OWNER] !== this.path) {
            throw new Error(`namespace ${ns} exists and is not this branch's`);
        }
        this.state.claims = this.claims();
        for (const c of this.state.claims) {
            if (c.empty) continue;
            const d = this.disk(c);
            const not = d === null ? undefined : this.notOurs(c, d);
            if (not) throw new Error(`disk ${c.disk} already exists and ${not}; delete it, or branch into another namespace`);
        }
        cli.output(`${this.state.claims.filter((c) => !c.empty).length} volumes to clone from ${src}`);

        this.apply({
            apiVersion: "v1",
            kind: "Namespace",
            metadata: { name: ns, annotations: this.annotations(), labels: { [BRANCH_LABEL]: "true", [BRANCH_OF]: src } },
        });
        if (this.definition.isolate !== false) {
            this.apply(isolationPolicy(ns, this.annotations(), this.definition.allow_egress ?? []));
        }

        if (this.definition.before_clone) {
            this.state.before_clone_job = this.startBeforeClone();
        } else {
            this.cloneDisks();
        }
    }

    override update(): void {
        // A branch is a copy as of when it was made; changing what to copy
        // means a new branch.
        cli.output("a branch is not updated in place: delete it and run it again for a new copy");
    }

    /** The source's bound claims on PD CSI volumes, with what their clones need. */
    private claims(): ClonedClaim[] {
        const src = this.definition.source_namespace;
        const pvcs = this.k8s(`listing claims in ${src}`, (c) =>
            k8s.list(c, { apiVersion: "v1", kind: "PersistentVolumeClaim", namespace: src }));
        const out: ClonedClaim[] = [];
        for (const pvc of pvcs) {
            const name = pvc.metadata.name;
            if (pvc.status?.phase !== "Bound" || !pvc.spec?.volumeName) {
                cli.output(`skipping claim ${name}: not bound`);
                continue;
            }
            const pv = this.k8s(`reading volume ${pvc.spec.volumeName}`, (c) =>
                k8s.read(c, { apiVersion: "v1", kind: "PersistentVolume", name: pvc.spec.volumeName }));
            const csi = pv?.spec?.csi;
            const h = csi?.driver === PD_DRIVER ? parseHandle(csi.volumeHandle) : undefined;
            if (!h || !h.zonal) {
                const why = !csi || csi.driver !== PD_DRIVER
                    ? `its volume is not a GCE Persistent Disk (driver ${csi?.driver ?? "none"})`
                    : `volume handle ${csi.volumeHandle} is not a zonal disk`;
                if ((this.definition.other_claims ?? "fail") !== "empty") {
                    throw new Error(`claim ${name}: ${why}; only zonal ${PD_DRIVER} volumes can be cloned (other_claims: empty gives such claims a new, empty volume instead)`);
                }
                cli.output(`claim ${name}: ${why}; the branch gets a new, empty claim`);
                out.push({
                    claim: name,
                    source_disk: "",
                    disk: "",
                    project: "",
                    zone: "",
                    capacity: pvc.spec.resources?.requests?.storage ?? pvc.status?.capacity?.storage,
                    storage_class: pvc.spec.storageClassName,
                    access_modes: pvc.spec.accessModes ?? ["ReadWriteOnce"],
                    empty: true,
                });
                continue;
            }
            out.push({
                claim: name,
                source_disk: csi.volumeHandle,
                disk: diskName(this.target(), name),
                project: h.project,
                zone: h.location,
                capacity: pv.spec.capacity?.storage ?? pvc.status?.capacity?.storage,
                disk_type: this.definition.disk_type,
                storage_class: pvc.spec.storageClassName,
                access_modes: pvc.spec.accessModes ?? ["ReadWriteOnce"],
                fs_type: csi.fsType,
            });
        }
        return out;
    }

    /** Starts the before_clone Job in the source namespace; returns its name. */
    private startBeforeClone(): string {
        const b = this.definition.before_clone!;
        const name = `${this.target()}-before-clone`.slice(0, 63).replace(/-+$/, "");
        const env = Object.entries(b.env ?? {}).map(([k, v]) => ({ name: k, value: v }));
        this.apply({
            apiVersion: "batch/v1",
            kind: "Job",
            metadata: { name, namespace: this.definition.source_namespace, annotations: this.annotations() },
            spec: {
                backoffLimit: 2,
                ttlSecondsAfterFinished: 600,
                template: {
                    metadata: { labels: { [BRANCH_LABEL]: "before-clone" } },
                    spec: {
                        restartPolicy: "Never",
                        containers: [{
                            name: "before-clone",
                            image: b.image,
                            ...(b.command ? { command: b.command } : {}),
                            ...(b.args ? { args: b.args } : {}),
                            ...(env.length > 0 ? { env } : {}),
                        }],
                    },
                },
            },
        });
        cli.output(`started Job ${name} in ${this.definition.source_namespace}; disks are cloned once it completes`);
        return name;
    }

    /** Whether the before_clone Job has completed; throws when it failed. */
    private beforeCloneDone(): boolean {
        const name = this.state.before_clone_job;
        if (!name) return true;
        const job = this.k8s(`reading Job ${name}`, (c) =>
            k8s.read(c, { apiVersion: "batch/v1", kind: "Job", name, namespace: this.definition.source_namespace }));
        // Gone after its TTL: it completed long ago.
        if (job === null) return true;
        const r = readiness(job);
        if (r.reason.startsWith("failed")) throw new Error(`before_clone Job ${name} ${r.reason}`);
        if (!r.ready) cli.output(`waiting for before_clone Job ${name}: ${r.reason}`);
        return r.ready;
    }

    /** Asks GCE for each clone that doesn't exist yet. */
    private cloneDisks(): void {
        for (const c of this.state.claims ?? []) {
            if (c.empty) continue;
            const existing = this.disk(c);
            if (existing !== null) {
                const not = this.notOurs(c, existing);
                if (not) throw new Error(`disk ${c.disk} already exists and ${not}; delete it, or branch into another namespace`);
                continue;
            }
            const body: any = {
                name: c.disk,
                sourceDisk: c.source_disk,
                labels: {
                    "monk-branch": this.target().slice(0, 63),
                    "monk-branch-of": this.definition.source_namespace.slice(0, 63),
                    [OWNER_LABEL]: this.owner(),
                    [RUN_LABEL]: this.state.run_id ?? "",
                },
                description: `Clone of ${c.source_disk} for Kubernetes branch ${this.target()} (${this.path})`,
            };
            if (c.disk_type) body.type = `projects/${c.project}/zones/${c.zone}/diskTypes/${c.disk_type}`;
            try {
                this.gce("POST", `${COMPUTE}/projects/${c.project}/zones/${c.zone}/disks`, body);
            } catch (e) {
                // A retried insert that went through the first time.
                if ((e as any)?.status !== 409) throw e;
            }
            cli.output(`cloning ${c.source_disk} to ${c.disk}`);
        }
    }

    /** The clone's GCE disk, or null. */
    private disk(c: ClonedClaim): any | null {
        try {
            return this.gce("GET", `${COMPUTE}/projects/${c.project}/zones/${c.zone}/disks/${c.disk}`);
        } catch (e) {
            if ((e as any)?.status === 404) return null;
            throw e;
        }
    }

    /** The monk-owner label value of this branch's clones. */
    private owner(): string {
        return crypto.sha256(this.path).slice(0, 40);
    }

    /**
     * Why disk d is not this run's clone of c, or undefined when it is:
     * a disk of the same name may be one an earlier run kept, or another
     * cluster's branch into a namespace of the same name.
     */
    private notOurs(c: ClonedClaim, d: any): string | undefined {
        const labels = d.labels ?? {};
        if (labels[OWNER_LABEL] !== this.owner()) return "was not made by this branch";
        if (labels[RUN_LABEL] !== this.state.run_id) return "is a clone an earlier run of this branch kept";
        if (!String(d.sourceDisk ?? "").endsWith(c.source_disk)) return `is not a clone of ${c.source_disk}`;
        return undefined;
    }

    override checkReadiness(): boolean {
        // State changes made in a check that fails are not kept, so every
        // step here reads what is there and does what is missing.
        if (!this.beforeCloneDone()) return false;
        this.cloneDisks();

        const pending: string[] = [];
        for (const c of this.state.claims ?? []) {
            if (c.empty) continue;
            const d = this.disk(c);
            if (d?.status === "FAILED") throw new Error(`cloning ${c.disk} failed`);
            if (d?.status !== "READY") pending.push(`${c.disk} (${d?.status ?? "not there yet"})`);
        }
        if (pending.length > 0) {
            cli.output(`waiting for disks: ${pending.join(", ")}`);
            return false;
        }

        const ns = this.target();
        let marker = this.k8s("reading the branch marker", (c) =>
            k8s.read(c, { apiVersion: "v1", kind: "ConfigMap", name: MARKER, namespace: ns }));
        if (marker === null) {
            this.bindVolumes();
            const objects = this.copyObjects();
            const at = new Date().toISOString();
            this.apply({
                apiVersion: "v1",
                kind: "ConfigMap",
                metadata: { name: MARKER, namespace: ns, annotations: this.annotations() },
                data: { applied_at: at, objects: objects.join("\n") },
            });
            cli.output(`applied ${objects.length} objects to ${ns}`);
            return false;
        }

        const waiting = this.workloadsWaiting();
        if (waiting) {
            cli.output(`waiting for ${waiting}`);
            return false;
        }
        const now = new Date().toISOString();
        this.state.applied_at = marker.data?.applied_at;
        this.state.objects = (marker.data?.objects ?? "").split("\n").filter((s: string) => s);
        this.state.ready_at = now;
        this.state.clone_seconds = seconds(this.state.requested_at, this.state.applied_at);
        this.state.ready_seconds = seconds(this.state.requested_at, now);
        cli.output(`branch ${ns} is ready in ${this.state.ready_seconds}s (disks cloned and objects applied in ${this.state.clone_seconds}s)`);
        return true;
    }

    /** A PersistentVolume for each clone and a claim of the source's name bound to it. */
    private bindVolumes(): void {
        const ns = this.target();
        for (const c of this.state.claims ?? []) {
            if (c.empty) {
                this.apply({
                    apiVersion: "v1",
                    kind: "PersistentVolumeClaim",
                    metadata: { name: c.claim, namespace: ns, annotations: this.annotations() },
                    spec: {
                        accessModes: c.access_modes,
                        resources: { requests: { storage: c.capacity } },
                        ...(c.storage_class ? { storageClassName: c.storage_class } : {}),
                    },
                });
                continue;
            }
            const pvName = c.disk;
            this.apply({
                apiVersion: "v1",
                kind: "PersistentVolume",
                metadata: { name: pvName, annotations: this.annotations(), labels: { [BRANCH_LABEL]: ns.slice(0, 63) } },
                spec: {
                    capacity: { storage: c.capacity },
                    accessModes: c.access_modes,
                    // The branch deletes its disks itself, after its pods are gone.
                    persistentVolumeReclaimPolicy: "Retain",
                    ...(c.storage_class ? { storageClassName: c.storage_class } : {}),
                    claimRef: { namespace: ns, name: c.claim },
                    csi: {
                        driver: PD_DRIVER,
                        volumeHandle: `projects/${c.project}/zones/${c.zone}/disks/${c.disk}`,
                        ...(c.fs_type ? { fsType: c.fs_type } : {}),
                    },
                    nodeAffinity: {
                        required: {
                            nodeSelectorTerms: [{
                                matchExpressions: [{ key: "topology.gke.io/zone", operator: "In", values: [c.zone] }],
                            }],
                        },
                    },
                },
            });
            this.apply({
                apiVersion: "v1",
                kind: "PersistentVolumeClaim",
                metadata: { name: c.claim, namespace: ns, annotations: this.annotations() },
                spec: {
                    accessModes: c.access_modes,
                    resources: { requests: { storage: c.capacity } },
                    volumeName: pvName,
                    storageClassName: c.storage_class ?? "",
                },
            });
        }
    }

    /** Copies the source's objects into the branch; returns them as Kind/name. */
    private copyObjects(): string[] {
        const src = this.definition.source_namespace;
        const ns = this.target();
        const done: string[] = [];
        for (const k of COPIED_KINDS) {
            const objs = this.k8s(`listing ${k.kind}s in ${src}`, (c) =>
                k8s.list(c, { apiVersion: k.apiVersion, kind: k.kind, namespace: src }));
            for (const obj of objs) {
                const copy = copyOf({ apiVersion: k.apiVersion, kind: k.kind, ...obj }, {
                    source: src,
                    target: ns,
                    annotations: this.annotations(),
                    replicas: this.definition.replicas,
                    expose: this.definition.expose,
                });
                if (!copy) continue;
                this.apply(copy);
                done.push(`${k.kind}/${obj.metadata.name}`);
            }
        }
        return done;
    }

    /** The first workload in the branch that isn't ready, with why; undefined when all are. */
    private workloadsWaiting(): string | undefined {
        const ns = this.target();
        for (const kind of ["StatefulSet", "Deployment"]) {
            const objs = this.k8s(`listing ${kind}s in ${ns}`, (c) =>
                k8s.list(c, { apiVersion: "apps/v1", kind, namespace: ns }));
            for (const o of objs) {
                // Read each one: a list may lag behind its status.
                const live = this.k8s(`reading ${kind} ${o.metadata.name}`, (c) =>
                    k8s.read(c, { apiVersion: "apps/v1", kind, name: o.metadata.name, namespace: ns }));
                const r = readiness(live);
                if (!r.ready) return `${kind} ${o.metadata.name}: ${r.reason}${this.unscheduled(ns)}`;
            }
        }
        return undefined;
    }

    /**
     * Why the branch's pods that can't be placed can't, e.g. "; pod
     * cassandra-1 unschedulable: 0/3 nodes are available: 3 Insufficient
     * memory", so a branch that won't fit says so; empty when all are placed.
     */
    private unscheduled(ns: string): string {
        const pods = this.k8s(`listing pods in ${ns}`, (c) => k8s.list(c, { apiVersion: "v1", kind: "Pod", namespace: ns }));
        for (const p of pods) {
            const c = (p.status?.conditions ?? []).find((x: any) => x.type === "PodScheduled" && x.status === "False");
            if (c) return `; pod ${p.metadata.name} ${String(c.reason ?? "unscheduled").toLowerCase()}: ${c.message ?? ""}`;
        }
        return "";
    }

    override delete(): void {
        const ns = this.state.namespace ?? this.definition.namespace;
        if (!ns) return;
        const live = this.k8s(`reading namespace ${ns}`, (c) => k8s.read(c, { apiVersion: "v1", kind: "Namespace", name: ns }));
        if (live && live.metadata?.annotations?.[OWNER] !== this.path) {
            cli.output(`namespace ${ns} is not this branch's; leaving it`);
            return;
        }
        if (live) {
            this.k8s(`deleting namespace ${ns}`, (c) => k8s.remove(c, { apiVersion: "v1", kind: "Namespace", name: ns }));
            cli.output(`deleting namespace ${ns}`);
        }
        if (this.state.before_clone_job) {
            this.k8s("deleting the before_clone Job", (c) => k8s.remove(c, {
                apiVersion: "batch/v1", kind: "Job", name: this.state.before_clone_job!, namespace: this.definition.source_namespace,
            }));
        }
    }

    override checkDeleted(): boolean {
        const ns = this.state.namespace ?? this.definition.namespace;
        if (!ns) return true;
        const live = this.k8s(`reading namespace ${ns}`, (c) => k8s.read(c, { apiVersion: "v1", kind: "Namespace", name: ns }));
        if (live && live.metadata?.annotations?.[OWNER] === this.path) {
            cli.output(`waiting for namespace ${ns} to go (${live.status?.phase ?? "?"})`);
            return false;
        }
        let waiting = false;
        for (const c of this.state.claims ?? []) {
            // An empty claim's volume goes with the namespace.
            if (c.empty) continue;
            const pv = this.k8s(`reading volume ${c.disk}`, (cl) => k8s.read(cl, { apiVersion: "v1", kind: "PersistentVolume", name: c.disk }));
            if (pv && pv.metadata?.annotations?.[OWNER] === this.path) {
                this.k8s(`deleting volume ${c.disk}`, (cl) => k8s.remove(cl, { apiVersion: "v1", kind: "PersistentVolume", name: c.disk }));
                waiting = true;
                continue;
            }
            if (this.definition.keep_disks) continue;
            const d = this.disk(c);
            if (d === null) continue;
            const not = this.notOurs(c, d);
            if (not) {
                cli.output(`leaving disk ${c.disk}: it ${not}`);
                continue;
            }
            if ((d.users ?? []).length > 0) {
                cli.output(`waiting for ${c.disk} to detach`);
                waiting = true;
                continue;
            }
            if (d.status !== "DELETING") {
                this.gce("DELETE", `${COMPUTE}/projects/${c.project}/zones/${c.zone}/disks/${c.disk}`);
                cli.output(`deleting disk ${c.disk}`);
            }
            waiting = true;
        }
        return !waiting;
    }

    /**
     * Where the branch stands: disks, claims and workloads.
     */
    @action("status")
    status(_args?: Args): void {
        const ns = this.target();
        for (const c of this.state.claims ?? []) {
            const d = this.disk(c);
            cli.output(`disk ${c.disk}: ${d?.status ?? "missing"} (from ${c.source_disk})`);
        }
        cli.output(this.workloadsWaiting() ?? `workloads in ${ns} are ready`);
        if (this.state.ready_seconds !== undefined) {
            cli.output(`ready ${this.state.ready_seconds}s after it was asked for; disks cloned and objects applied after ${this.state.clone_seconds}s`);
        }
    }

    /** Server-side apply as field manager monk. */
    private apply(obj: any): void {
        this.k8s(`applying ${obj.kind} ${obj.metadata?.name}`, (c) => k8s.apply(c, obj));
    }

    /** A Compute Engine request with the Monk cluster's GCP credentials. */
    private gce(method: "GET" | "POST" | "DELETE", url: string, body?: unknown): any {
        return retry(() => {
            const options: any = {};
            if (body !== undefined) {
                options.body = JSON.stringify(body);
                options.headers = { "Content-Type": "application/json" };
            }
            const r: any = method === "GET" ? gcp.get(url, options) : method === "POST" ? gcp.post(url, options) : gcp.delete(url, options);
            if (!r.statusCode || r.statusCode >= 400) {
                let detail = r.error || `${r.statusCode}`;
                try {
                    const e = JSON.parse(r.body).error;
                    if (e?.message) detail = `${r.statusCode}: ${e.message}`;
                } catch {
                    // not a GCP error body
                }
                const err: any = new Error(`GCE ${method} ${url} failed: ${detail}`);
                err.name = "HttpError";
                err.status = r.statusCode ?? 0;
                err.kind = r.statusCode ? "status" : "transport";
                err.method = method;
                throw err;
            }
            return r.body ? JSON.parse(r.body) : {};
        }, { when: (e) => isRetryable(e, method === "POST" ? "POST" : "PUT"), what: `GCE ${method} ${url}`, budgetMs: 20000 });
    }
}
