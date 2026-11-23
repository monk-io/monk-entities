/**
 * GCP Google Kubernetes Engine Cluster Entity
 *
 * Creates a zonal GKE Standard cluster with one node pool. Create returns
 * once GCP accepts the request; the cluster is ready when its status is
 * RUNNING, which takes 5-8 minutes. The k8s entities reach it with
 * `gke_cluster`, `gke_location` and `gke_project`, which this entity
 * exposes in its state.
 *
 * @see https://cloud.google.com/kubernetes-engine/docs/reference/rest/v1/projects.locations.clusters
 */

import { action, Args } from "monkec/base";
import { ensureCreated, deleteIfExists } from "monkec/resilience";
import cli from "cli";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import { CONTAINER_API_URL } from "./common.ts";
import {
    OWNER_LABEL,
    ownerLabel,
    lastSegment,
    hasStatus,
    DISK_PRICE_PER_GIB_MONTH,
    HOURS_PER_MONTH,
} from "./compute-common.ts";

/**
 * List prices per hour of e2 VMs in us-central1 (europe-west1 is about 10%
 * higher, other regions up to ~40%). Approximations: the catalog is too large to read
 * in an entity step.
 */
const NODE_PRICE_PER_HOUR: Record<string, number> = {
    "e2-micro": 0.0084,
    "e2-small": 0.0168,
    "e2-medium": 0.0335,
    "e2-standard-2": 0.067,
    "e2-standard-4": 0.134,
    "e2-standard-8": 0.268,
    "e2-standard-16": 0.536,
    "e2-highcpu-2": 0.0495,
    "e2-highcpu-4": 0.099,
    "e2-highcpu-8": 0.198,
    "e2-highmem-2": 0.0904,
    "e2-highmem-4": 0.1808,
    "e2-highmem-8": 0.3616,
};

/** Spot VMs cost roughly 30% of the on-demand price; the discount varies. */
const SPOT_FACTOR = 0.3;

/** GKE cluster management fee per hour; one zonal cluster per billing account is covered by a credit. */
const MANAGEMENT_FEE_PER_HOUR = 0.10;

/**
 * GKE cluster definition
 */
export interface GkeClusterDefinition extends GcpEntityDefinition {
    /**
     * @description Cluster name (lowercase letters, digits, dashes; starts with a letter; at most 40 chars)
     */
    name: string;

    /**
     * @description Zone the cluster lives in, e.g. europe-west1-b. A zonal
     * cluster has one control plane and its nodes in that zone; a region is refused.
     */
    location: string;

    /**
     * @description Kubernetes version for a new cluster, e.g. 1.33 or 1.33.5-gke.1080000.
     * Default: the release channel's default. Cannot be changed in place.
     */
    kubernetes_version?: string;

    /**
     * @description RAPID, REGULAR, STABLE, EXTENDED or NONE (no channel: you upgrade by hand).
     * @default "REGULAR"
     */
    release_channel?: string;

    /**
     * @description Name of the node pool
     * @default "default-pool"
     */
    node_pool_name?: string;

    /**
     * @description Machine type of the nodes. Needs a new cluster to change.
     * @default "e2-standard-2"
     */
    machine_type?: string;

    /**
     * @description Number of nodes in the pool. Changing it resizes the pool.
     * @default 3
     * @minimum 0
     */
    node_count?: number;

    /**
     * @description Boot disk size per node in GB. GKE's own default is 100 GB
     * pd-balanced, which counts against the regional SSD quota; this entity
     * defaults to a smaller standard disk. Needs a new cluster to change.
     * @default 30
     * @minimum 10
     */
    disk_size_gb?: number;

    /**
     * @description Boot disk type: pd-standard, pd-balanced or pd-ssd. Needs a new cluster to change.
     * @default "pd-standard"
     */
    disk_type?: string;

    /**
     * @description Run the nodes on Spot VMs: cheaper, and reclaimed by GCP at any time.
     * @default false
     */
    spot?: boolean;

    /**
     * @description Labels on the cluster (GCP resource labels). Changing them
     * updates the cluster. The cluster also gets a monk-owner label naming the
     * Monk instance that created it.
     */
    labels?: Record<string, string>;

    /**
     * @description VPC network name or path
     * @default "default"
     */
    network?: string;

    /**
     * @description Subnetwork name or path. Default: the network's subnetwork in the cluster's region.
     */
    subnetwork?: string;

    /**
     * @description Use GKE Dataplane V2 (ADVANCED_DATAPATH), which enforces
     * Kubernetes NetworkPolicies. Create-only: a cluster made without it
     * cannot get it, and one made with it cannot lose it; changing this
     * needs a new cluster.
     * @default true
     */
    dataplane_v2?: boolean;

    /**
     * @description Send logs to Cloud Logging. Off by default to keep the cost down.
     * @default false
     */
    logging?: boolean;

    /**
     * @description Send metrics to Cloud Monitoring. Off by default to keep the cost down.
     * @default false
     */
    monitoring?: boolean;
}

/**
 * GKE cluster state
 */
export interface GkeClusterState extends GcpEntityState {
    /** @description Cluster name */
    name?: string;

    /** @description Zone of the cluster */
    location?: string;

    /** @description Project of the cluster */
    project?: string;

    /** @description Cluster name, for the k8s entities' gke_cluster */
    gke_cluster?: string;

    /** @description Zone, for the k8s entities' gke_location */
    gke_location?: string;

    /** @description Project, for the k8s entities' gke_project */
    gke_project?: string;

    /** @description IP address of the Kubernetes API server */
    endpoint?: string;

    /** @description Base64 PEM CA certificate of the cluster */
    ca_certificate?: string;

    /** @description PROVISIONING, RUNNING, RECONCILING, STOPPING, ERROR or DEGRADED */
    status?: string;

    /** @description Kubernetes version of the control plane */
    master_version?: string;

    /** @description Name of the node pool */
    node_pool?: string;

    /** @description Number of nodes in the pool */
    node_count?: number;

    /** @description Full self-link of the cluster */
    self_link?: string;
}

/**
 * @description Manages a zonal GKE Standard cluster with one node pool.
 * Create returns as soon as GCP accepts the request; the entity is ready when
 * the cluster is RUNNING (5-8 minutes; readiness waits up to ~22).
 * The state carries `gke_cluster`, `gke_location` and `gke_project`, so
 * `k8s/*` entities can connect with the Monk cluster's GCP credentials.
 *
 * Update resizes the node pool (`node_count`) and sets labels. Anything
 * else (machine type, disks, version, network, `dataplane_v2`, `spot`)
 * needs a new cluster; the entity says so and leaves the cluster alone.
 * Resizing and labelling are cluster operations that cannot overlap: when
 * both change, the size is applied first and the labels with the next update.
 *
 * Deleting removes the cluster and its nodes, and waits until it is gone
 * (3-5 minutes). A cluster that existed before the entity created it is
 * adopted and left in place on delete, unless `force_ownership` is set.
 *
 * Logging and monitoring are off by default (`logging: false`,
 * `monitoring: false`) to keep the cost down.
 *
 * ## Required Permissions
 * - `container.clusters.create`, `container.clusters.get`, `container.clusters.delete`
 * - `container.clusters.update` - resize and labels
 * - `container.operations.get`
 * - `iam.serviceAccounts.actAs` on the nodes' service account (the default compute one)
 *
 * ## Secrets
 * - Reads: none (authenticated via gcp provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.gke_cluster`, `state.gke_location`, `state.gke_project` - for `k8s/*` entities
 * - `state.endpoint`, `state.ca_certificate` - API server address and CA
 * - `state.status`, `state.master_version`, `state.node_pool`, `state.node_count`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `k8s/*` entities - `gke_cluster`, `gke_location`, `gke_project`
 * - `gcp/service-usage` - enable container.googleapis.com
 */
export class GkeCluster extends GcpEntity<GkeClusterDefinition, GkeClusterState> {

    /** Creating takes 5-8 minutes: wait up to ~22. */
    static readonly readiness = { period: 15, initialDelay: 10, attempts: 90 };

    /** Deleting takes 3-5 minutes: wait up to 15. */
    static readonly deletion = { period: 15, attempts: 60 };

    protected getEntityName(): string {
        return `GKE cluster ${this.definition.name}`;
    }

    private locationUrl(): string {
        return `${CONTAINER_API_URL}/projects/${this.projectId}/locations/${this.definition.location}`;
    }

    private clusterUrl(): string {
        return `${this.locationUrl()}/clusters/${this.definition.name}`;
    }

    private poolName(): string {
        return this.definition.node_pool_name ?? "default-pool";
    }

    /** The cluster, or nothing if it doesn't exist. */
    private getCluster(): any | undefined {
        try {
            return this.request("GET", this.clusterUrl());
        } catch (e) {
            if (hasStatus(e, 404)) return undefined;
            throw e;
        }
    }

    /** The operation, or nothing if GCP no longer has it. */
    private getOperation(name: string): any | undefined {
        try {
            return this.request("GET", `${this.locationUrl()}/operations/${name}`);
        } catch (e) {
            if (hasStatus(e, 404)) return undefined;
            throw e;
        }
    }

    private populate(c: any): void {
        this.state.name = c.name;
        this.state.location = c.location ?? this.definition.location;
        this.state.project = this.projectId;
        this.state.gke_cluster = c.name;
        this.state.gke_location = this.state.location;
        this.state.gke_project = this.projectId;
        this.state.endpoint = c.endpoint;
        this.state.ca_certificate = c.masterAuth?.clusterCaCertificate;
        this.state.status = c.status;
        this.state.master_version = c.currentMasterVersion;
        this.state.self_link = c.selfLink;
        const pool = this.livePool(c);
        this.state.node_pool = pool?.name ?? this.poolName();
        const count = this.liveNodeCount(c, pool);
        if (count !== undefined) this.state.node_count = count;
    }

    private livePool(c: any): any | undefined {
        const pools: any[] = c.nodePools ?? [];
        return pools.find((p) => p.name === this.poolName()) ?? pools[0];
    }

    /**
     * The pool's node count. GKE's JSON leaves out fields that are 0, so a
     * pool without initialNodeCount has 0 nodes. The pool's count follows
     * setSize at once; the cluster's currentNodeCount lags, and is only the
     * fallback when there is no pool to read.
     */
    private liveNodeCount(c: any, pool: any): number | undefined {
        if (pool) return Number(pool.initialNodeCount ?? 0);
        return c.currentNodeCount !== undefined ? Number(c.currentNodeCount) : undefined;
    }

    private desiredLabels(): Record<string, string> {
        return { ...(this.definition.labels ?? {}), [OWNER_LABEL]: ownerLabel(this.path) };
    }

    private validate(): void {
        const d = this.definition;
        if (!/^[a-z][a-z0-9-]{0,39}$/.test(d.name)) {
            throw new Error(`name ${d.name} is not a valid cluster name (lowercase letters, digits, dashes; starts with a letter; at most 40 chars)`);
        }
        if (!/^[a-z]+-[a-z]+[0-9]+-[a-z]$/.test(d.location)) {
            throw new Error(`location ${d.location} is not a zone like europe-west1-b; this entity creates zonal clusters`);
        }
        const channel = (d.release_channel ?? "REGULAR").toUpperCase();
        if (!["RAPID", "REGULAR", "STABLE", "EXTENDED", "NONE"].includes(channel)) {
            throw new Error(`release_channel ${d.release_channel} is not one of RAPID, REGULAR, STABLE, EXTENDED, NONE`);
        }
    }

    private networkRef(kind: "networks" | "subnetworks", ref: string): string {
        if (ref.startsWith("projects/") || ref.startsWith("https://")) return ref;
        if (kind === "networks") return `projects/${this.projectId}/global/networks/${ref}`;
        const region = this.definition.location.replace(/-[a-z]$/, "");
        return `projects/${this.projectId}/regions/${region}/subnetworks/${ref}`;
    }

    /** Sends the create request; returns the operation. */
    private insertCluster(): any {
        const d = this.definition;
        const channel = (d.release_channel ?? "REGULAR").toUpperCase();
        const nodeConfig: any = {
            machineType: d.machine_type ?? "e2-standard-2",
            diskSizeGb: d.disk_size_gb ?? 30,
            diskType: d.disk_type ?? "pd-standard",
        };
        if (d.spot) nodeConfig.spot = true;
        const cluster: any = {
            name: d.name,
            resourceLabels: this.desiredLabels(),
            releaseChannel: { channel: channel === "NONE" ? "UNSPECIFIED" : channel },
            network: this.networkRef("networks", d.network ?? "default"),
            nodePools: [{
                name: this.poolName(),
                initialNodeCount: d.node_count ?? 3,
                config: nodeConfig,
                management: { autoRepair: true, autoUpgrade: true },
            }],
            addonsConfig: { gcePersistentDiskCsiDriverConfig: { enabled: true } },
            loggingService: d.logging ? "logging.googleapis.com/kubernetes" : "none",
            monitoringService: d.monitoring ? "monitoring.googleapis.com/kubernetes" : "none",
        };
        if (d.dataplane_v2 ?? true) cluster.networkConfig = { datapathProvider: "ADVANCED_DATAPATH" };
        if (d.subnetwork) cluster.subnetwork = this.networkRef("subnetworks", d.subnetwork);
        if (d.kubernetes_version) cluster.initialClusterVersion = d.kubernetes_version;

        cli.output(`Creating GKE cluster ${d.name} in ${d.location} (${cluster.nodePools[0].initialNodeCount} x ${nodeConfig.machineType}${d.spot ? " spot" : ""}, ` +
            `${nodeConfig.diskSizeGb} GB ${nodeConfig.diskType}, ${channel} channel, dataplane v2 ${d.dataplane_v2 ?? true ? "on" : "off"})`);
        return this.request("POST", `${this.locationUrl()}/clusters`, { cluster });
    }

    /**
     * Decides who owns a cluster create() found: this instance if it carries
     * the owner label, otherwise someone else unless force_ownership.
     */
    private claim(c: any, firstRun: boolean): void {
        const name = this.definition.name;
        if (c.resourceLabels?.[OWNER_LABEL] === ownerLabel(this.path)) {
            if (this.state.existing !== false) cli.output(`Cluster ${name} was created by this entity earlier`);
            this.state.existing = false;
        } else if (firstRun) {
            if (this.definition.force_ownership) {
                cli.output(`Cluster ${name} already exists; reclaiming ownership (force_ownership=true)`);
                this.state.existing = false;
            } else {
                cli.output(`Cluster ${name} already exists; adopting it (it is left in place on delete)`);
                this.state.existing = true;
            }
        }
    }

    override create(): void {
        this.validate();
        const firstRun = this.state.existing === undefined;
        const { resource, adopted } = ensureCreated({
            find: () => this.getCluster(),
            create: () => this.insertCluster(),
            what: `cluster ${this.definition.name}`,
        });
        if (adopted) {
            this.claim(resource, firstRun);
            this.populate(resource);
            return;
        }
        this.state.existing = false;
        if (resource.operationType !== undefined) {
            // Created: the operation runs on; readiness follows it.
            this.state.operation_name = resource.name;
            this.state.name = this.definition.name;
            this.state.location = this.definition.location;
            this.state.project = this.projectId;
            this.state.gke_cluster = this.definition.name;
            this.state.gke_location = this.definition.location;
            this.state.gke_project = this.projectId;
            this.state.node_pool = this.poolName();
            this.state.status = "PROVISIONING";
            cli.output(`Cluster ${this.definition.name} is being created (operation ${resource.name})`);
        } else {
            // The create failed midway but the cluster was made.
            this.populate(resource);
        }
    }

    /** Names what a definition asks for that a live cluster cannot change in place. */
    private immutableDifferences(live: any): string[] {
        const d = this.definition;
        const diffs: string[] = [];
        const pool = this.livePool(live);
        const cfg = pool?.config ?? {};
        if (d.machine_type && cfg.machineType && d.machine_type !== cfg.machineType) diffs.push("machine_type");
        if (d.disk_size_gb !== undefined && cfg.diskSizeGb !== undefined && d.disk_size_gb !== Number(cfg.diskSizeGb)) diffs.push("disk_size_gb");
        if (d.disk_type && cfg.diskType && d.disk_type !== cfg.diskType) diffs.push("disk_type");
        if (d.spot !== undefined && Boolean(cfg.spot) !== d.spot) diffs.push("spot");
        if (d.network && live.network && lastSegment(d.network) !== lastSegment(live.network)) diffs.push("network");
        if (d.subnetwork && live.subnetwork && lastSegment(d.subnetwork) !== lastSegment(live.subnetwork)) diffs.push("subnetwork");
        const v2 = live.networkConfig?.datapathProvider === "ADVANCED_DATAPATH";
        if ((d.dataplane_v2 ?? true) !== v2) diffs.push("dataplane_v2");
        if (d.kubernetes_version && live.currentMasterVersion && !live.currentMasterVersion.startsWith(d.kubernetes_version)) diffs.push("kubernetes_version");
        const channel = live.releaseChannel?.channel;
        const want = (d.release_channel ?? "REGULAR").toUpperCase();
        if (channel && (channel === "UNSPECIFIED" ? "NONE" : channel) !== want) diffs.push("release_channel");
        return diffs;
    }

    override update(): void {
        const live = this.getCluster();
        if (!live) {
            this.create();
            return;
        }
        this.populate(live);
        const d = this.definition;
        if (this.state.existing && !d.force_ownership) {
            cli.output(`Cluster ${d.name} was not created by this entity; leaving it as it is`);
            return;
        }
        const diffs = this.immutableDifferences(live);
        if (diffs.length > 0) {
            cli.output(`Cluster ${d.name}: ${diffs.join(", ")} cannot change in place (create a new cluster to change them)`);
        }

        const want = this.desiredLabels();
        const have: Record<string, string> = live.resourceLabels ?? {};
        const sameLabels = Object.keys(want).length === Object.keys(have).length &&
            Object.keys(want).every((k) => have[k] === want[k]);
        const pool = this.livePool(live);
        const current = this.liveNodeCount(live, pool);
        const resize = d.node_count !== undefined && current !== undefined && d.node_count !== current;

        if ((resize || !sameLabels) && live.status !== "RUNNING") {
            throw new Error(`cluster ${d.name} is ${live.status}; it can be changed once it is RUNNING`);
        }
        if (resize) {
            cli.output(`Resizing node pool ${pool?.name ?? this.poolName()} of cluster ${d.name} from ${current} to ${d.node_count} nodes`);
            const op = this.request("POST", `${this.clusterUrl()}/nodePools/${pool?.name ?? this.poolName()}:setSize`, { nodeCount: d.node_count });
            this.state.operation_name = op.name;
            this.state.status = "RECONCILING";
            if (!sameLabels) cli.output(`Labels of cluster ${d.name} are set by the next update, once the resize has finished`);
            return;
        }
        if (!sameLabels) {
            cli.output(`Setting labels on cluster ${d.name}`);
            const op = this.request("POST", `${this.clusterUrl()}:setResourceLabels`, {
                resourceLabels: want,
                labelFingerprint: live.labelFingerprint,
            });
            this.state.operation_name = op.name;
            this.state.status = "RECONCILING";
        }
    }

    /**
     * Checks a few times, 10 s apart, before saying not ready: a cluster
     * takes minutes to create or resize, and each check would otherwise
     * be one quick request per readiness period.
     */
    override checkReadiness(): boolean {
        for (let i = 0; ; i++) {
            if (this.readyOnce()) return true;
            if (i >= 3) return false;
            sleep(10000);
        }
    }

    private readyOnce(): boolean {
        const name = this.definition.name;
        const opName = this.state.operation_name;
        if (opName) {
            const op = this.getOperation(opName);
            if (op && op.status !== "DONE") {
                cli.output(`Cluster ${name}: operation ${op.operationType ?? ""} is ${op.status}`);
                return false;
            }
            const err = op?.error ? `${op.error.message ?? JSON.stringify(op.error)}` : undefined;
            if (err) throw new Error(`cluster ${name}: operation ${op.operationType ?? opName} failed: ${err}`);
        }
        const live = this.getCluster();
        if (!live) {
            cli.output(`Cluster ${name} not found yet`);
            return false;
        }
        this.populate(live);
        if (live.status === "ERROR") throw new Error(`cluster ${name} is in ERROR: ${live.statusMessage ?? "no details"}`);
        if (live.status !== "RUNNING") {
            cli.output(`Cluster ${name} is ${live.status}${live.statusMessage ? ` (${live.statusMessage})` : ""}`);
            return false;
        }
        // The pool's count is the asked-for one once a resize is done.
        const want = this.definition.node_count ?? 3;
        if (!this.state.existing && this.state.node_count !== undefined && this.state.node_count !== want) {
            cli.output(`Cluster ${name} is RUNNING with ${this.state.node_count} of ${want} nodes`);
            return false;
        }
        cli.output(`Cluster ${name} is RUNNING (Kubernetes ${this.state.master_version}, ${this.state.node_count ?? "?"} nodes)`);
        return true;
    }

    override checkLiveness(): boolean {
        const live = this.getCluster();
        if (!live) throw new Error(`cluster ${this.definition.name} does not exist`);
        return live.status === "RUNNING" || live.status === "RECONCILING";
    }

    /** Whether delete leaves the cluster in place. */
    private keeps(): boolean {
        return Boolean(this.state.existing) && !this.definition.force_ownership;
    }

    override delete(): void {
        const name = this.definition.name;
        if (this.keeps()) {
            cli.output(`Cluster ${name} was not created by this entity; leaving it in place`);
            return;
        }
        const live = this.getCluster();
        if (!live) {
            cli.output(`Cluster ${name} is already deleted`);
            return;
        }
        if (live.status === "STOPPING") {
            cli.output(`Cluster ${name} is being deleted`);
            return;
        }
        this.requestDelete(live);
    }

    /**
     * Asks GCP to delete the cluster unless it is already going. While
     * another operation runs (a create or a resize), GCP refuses with
     * "incompatible operation"; the delete is then asked again from
     * checkDeleted once that operation is done.
     */
    private requestDelete(live: any): void {
        const name = this.definition.name;
        if (live.status === "STOPPING") return;
        let op: any;
        try {
            if (!deleteIfExists(() => { op = this.request("DELETE", this.clusterUrl()); })) {
                cli.output(`Cluster ${name} is already deleted`);
                return;
            }
        } catch (e) {
            const msg = String((e as any)?.message ?? e);
            if ((e as any)?.status === 400 && /incompatible operation/i.test(msg)) {
                cli.output(`Cluster ${name} is ${live.status} with an operation running; deleting it once that is done`);
                return;
            }
            throw e;
        }
        this.state.operation_name = op?.name;
        this.state.status = "STOPPING";
        cli.output(`Deleting cluster ${name}`);
    }

    /** Checks a few times, 10 s apart, before saying the cluster is still there. */
    override checkDeleted(): boolean {
        if (this.keeps()) return true;
        for (let i = 0; ; i++) {
            if (this.deletedOnce()) return true;
            if (i >= 3) return false;
            sleep(10000);
        }
    }

    private deletedOnce(): boolean {
        const name = this.definition.name;
        const live = this.getCluster();
        if (!live) return true;
        if (live.status !== "STOPPING") {
            const opName = this.state.operation_name;
            if (opName) {
                const op = this.getOperation(opName);
                if (op?.operationType === "DELETE_CLUSTER" && op.status === "DONE" && op.error) {
                    throw new Error(`deleting cluster ${name} failed: ${op.error.message ?? JSON.stringify(op.error)}`);
                }
            }
            // A delete GCP refused while another operation ran.
            this.requestDelete(live);
        }
        cli.output(`Cluster ${name} is ${live.status}`);
        return false;
    }

    // ==================== ACTIONS ====================

    /** Prints the cluster as GCP describes it. */
    @action("get-info")
    getInfo(_args?: Args): void {
        const live = this.getCluster();
        if (!live) throw new Error(`cluster ${this.definition.name} does not exist`);
        cli.output(JSON.stringify(live, null, 2));
    }

    /**
     * Prints a kubeconfig for the cluster. It runs gke-gcloud-auth-plugin
     * to get tokens, which Monk's k8s entities map to the Monk cluster's
     * GCP credentials; kubectl needs the plugin installed and gcloud logged in.
     */
    @action("get-kubeconfig")
    getKubeconfig(_args?: Args): void {
        const live = this.getCluster();
        if (!live) throw new Error(`cluster ${this.definition.name} does not exist`);
        if (!live.endpoint || !live.masterAuth?.clusterCaCertificate) {
            throw new Error(`cluster ${this.definition.name} is ${live.status}; it has no endpoint yet`);
        }
        const id = `gke_${this.projectId}_${this.definition.location}_${this.definition.name}`;
        cli.output([
            "apiVersion: v1",
            "kind: Config",
            "clusters:",
            `- name: ${id}`,
            "  cluster:",
            `    server: https://${live.endpoint}`,
            `    certificate-authority-data: ${live.masterAuth.clusterCaCertificate}`,
            "contexts:",
            `- name: ${id}`,
            "  context:",
            `    cluster: ${id}`,
            `    user: ${id}`,
            `current-context: ${id}`,
            "users:",
            `- name: ${id}`,
            "  user:",
            "    exec:",
            "      apiVersion: client.authentication.k8s.io/v1beta1",
            "      command: gke-gcloud-auth-plugin",
            "      installHint: Install gke-gcloud-auth-plugin (gcloud components install gke-gcloud-auth-plugin)",
            "      provideClusterInfo: true",
            "",
        ].join("\n"));
    }

    // ==================== COSTS ====================

    private monthlyCost(): { nodes: number; hourly?: number; disks: number; month?: number } {
        const d = this.definition;
        const nodes = this.state.node_count ?? d.node_count ?? 3;
        const machine = d.machine_type ?? "e2-standard-2";
        const price = NODE_PRICE_PER_HOUR[machine];
        const diskRate = DISK_PRICE_PER_GIB_MONTH[d.disk_type ?? "pd-standard"] ?? 0;
        const disks = nodes * (d.disk_size_gb ?? 30) * diskRate;
        if (price === undefined) return { nodes, disks };
        const hourly = price * (d.spot ? SPOT_FACTOR : 1);
        return { nodes, hourly, disks, month: nodes * hourly * HOURS_PER_MONTH + disks };
    }

    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const d = this.definition;
        const { nodes, hourly, disks, month } = this.monthlyCost();
        cli.output(`Cost estimate for GKE cluster ${d.name}`);
        cli.output(`  Zone: ${d.location}`);
        cli.output(`  Nodes: ${nodes} x ${d.machine_type ?? "e2-standard-2"}${d.spot ? " (spot, ~70% off, varies)" : ""}`);
        if (hourly === undefined || month === undefined) {
            cli.output(`  No list price known for machine type ${d.machine_type}`);
            return;
        }
        cli.output(`  VMs: $${hourly.toFixed(4)}/hour each`);
        cli.output(`  Boot disks: ${nodes} x ${d.disk_size_gb ?? 30} GB ${d.disk_type ?? "pd-standard"} = $${disks.toFixed(2)}/month`);
        cli.output(`  Management fee: $${MANAGEMENT_FEE_PER_HOUR.toFixed(2)}/hour, covered by the free tier for the first zonal cluster per billing account; later clusters pay it ($${(MANAGEMENT_FEE_PER_HOUR * HOURS_PER_MONTH).toFixed(2)}/month)`);
        cli.output(`ESTIMATED MONTHLY COST: $${month.toFixed(2)} ($${(month / HOURS_PER_MONTH).toFixed(4)}/hour), excluding the management fee`);
        cli.output(`Not included: load balancers, persistent volumes, egress, logging and monitoring ingestion`);
    }

    @action("costs")
    costs(_args?: Args): void {
        const type = "gcp-gke-cluster";
        if (!this.state.gke_cluster && !this.state.operation_name) {
            cli.output(JSON.stringify({ type, costs: { month: { amount: "0", currency: "USD" } } }));
            return;
        }
        const { month } = this.monthlyCost();
        if (month === undefined) {
            cli.output(JSON.stringify({
                type,
                costs: { month: { amount: "0", currency: "USD", error: `no list price known for machine type ${this.definition.machine_type}` } },
            }));
            return;
        }
        cli.output(JSON.stringify({
            type,
            costs: {
                hour: { amount: (month / HOURS_PER_MONTH).toFixed(6), currency: "USD" },
                month: { amount: month.toFixed(2), currency: "USD" },
            },
        }));
    }
}
