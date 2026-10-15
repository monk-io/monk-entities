import { action, Args } from "monkec/base";
import cli from "cli";
import { EKSEntity, EKSDefinition, requestToken, defined, flatStrings, OWNER_TAG } from "./eks-base.ts";

/**
 * A taint that keeps pods off nodes unless they tolerate it.
 * @interface Taint
 */
export interface Taint {
    /** @description Key */
    key: string;
    /** @description Value */
    value?: string;
    /** @description NO_SCHEDULE, NO_EXECUTE or PREFER_NO_SCHEDULE */
    effect: string;
}

/**
 * EC2 nodes for an EKS cluster.
 * @interface NodeGroupDefinition
 */
export interface NodeGroupDefinition extends EKSDefinition {
    /**
     * @description Name of the EKS cluster
     */
    cluster_name: string;

    /**
     * @description Node group name, unique in the cluster
     */
    name: string;

    /**
     * @description ARN of the IAM role the nodes run as (trusts ec2.amazonaws.com, with AmazonEKSWorkerNodePolicy, AmazonEKS_CNI_Policy and AmazonEC2ContainerRegistryReadOnly)
     */
    node_role_arn: string;

    /**
     * @description Subnets for the nodes
     */
    subnet_ids: string[];

    /**
     * @description EC2 instance types, e.g. [t3.medium] (default t3.medium)
     */
    instance_types?: string[];

    /**
     * @description Nodes to run (default 2)
     */
    desired_size?: number;

    /**
     * @description Fewest nodes (default 1)
     */
    min_size?: number;

    /**
     * @description Most nodes (default: desired_size)
     */
    max_size?: number;

    /**
     * @description Root disk size of each node in GiB (default 20)
     */
    disk_size?: number;

    /**
     * @description ON_DEMAND (default) or SPOT
     */
    capacity_type?: string;

    /**
     * @description AMI type, e.g. AL2023_x86_64_STANDARD or AL2023_ARM_64_STANDARD (default: EKS's for the instance type)
     */
    ami_type?: string;

    /**
     * @description Kubernetes version of the nodes (default: the cluster's). Raising it upgrades the nodes.
     */
    version?: string;

    /**
     * @description Kubernetes labels on the nodes
     */
    labels?: Record<string, string>;

    /**
     * @description Kubernetes taints on the nodes
     */
    taints?: Taint[];

    /**
     * @description Resource tags
     */
    tags?: Record<string, string>;
}

/**
 * What a node group reports.
 * @interface NodeGroupState
 */
export interface NodeGroupState {
    /** @description Node group name */
    name?: string;
    /** @description Node group ARN */
    arn?: string;
    /** @description CREATING, ACTIVE, UPDATING, DELETING, CREATE_FAILED, DELETE_FAILED or DEGRADED */
    status?: string;
    /** @description Kubernetes version of the nodes */
    version?: string;
    /** @description Nodes wanted */
    desired_size?: number;
    /** @description Auto Scaling group that runs the nodes */
    autoscaling_group?: string;
}

/**
 * @description EC2 nodes for an Amazon EKS cluster, as a managed node group.
 * Creates a managed node group: EKS runs the nodes in an Auto Scaling group
 * and replaces them on upgrades. The entity is ready when the group is
 * ACTIVE, which takes a few minutes. Size, labels and the Kubernetes
 * version are updated in place, one EKS update after another; instance types, subnets, disk size and the
 * node role are fixed once the group exists.
 *
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.status`, `state.autoscaling_group`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `aws-eks/cluster` - the cluster the nodes join
 * - `aws-iam/iam-role` - the node role
 * - k8s entities - depend on the node group so pods have nodes to run on
 */
export class NodeGroup extends EKSEntity<NodeGroupDefinition, NodeGroupState> {
    /** Node groups take a few minutes to create: up to 20. */
    static readiness = { period: 15, initialDelay: 30, attempts: 80 };

    /** Draining and terminating the nodes takes some minutes: up to 30. */
    static deletion = { period: 20, attempts: 90 };

    override create(): void {
        const d = this.definition;
        const existing = this.describe();
        if (existing) {
            if (existing.tags?.[OWNER_TAG] !== this.path) {
                throw new Error(`node group ${d.name} already exists in cluster ${d.cluster_name} and Monk did not create it`);
            }
            this.note(existing); // made by a create whose response was lost
            return;
        }
        if (!d.node_role_arn) throw new Error("node_role_arn is required");
        if ((d.subnet_ids ?? []).length === 0) throw new Error("subnet_ids is required");
        const body = defined({
            nodegroupName: d.name,
            nodeRole: d.node_role_arn,
            subnets: d.subnet_ids,
            instanceTypes: d.instance_types ?? ["t3.medium"],
            scalingConfig: this.scaling(),
            diskSize: d.disk_size,
            capacityType: d.capacity_type,
            amiType: d.ami_type,
            version: d.version,
            labels: d.labels ? flatStrings(d.labels) : undefined,
            taints: d.taints?.map((t) => defined({ key: t.key, value: t.value, effect: t.effect })),
            tags: { ...flatStrings(d.tags), [OWNER_TAG]: this.path },
            clientRequestToken: requestToken(),
        });
        const res = this.send(`creating node group ${d.name}`, "POST", `${this.clusterPath()}/node-groups`, body, true);
        cli.output(`creating EKS node group ${d.name}; this takes a few minutes`);
        this.note(res.nodegroup);
    }

    override update(): void {
        const d = this.definition;
        const live = this.describe();
        if (!live) {
            this.create();
            return;
        }
        this.note(live);
        if (live.status !== "ACTIVE" && live.status !== "DEGRADED") {
            cli.output(`node group ${d.name} is ${live.status}; the changes follow once it is ACTIVE`);
            return;
        }
        const started = this.converge(live);
        if (started) cli.output(started);
    }

    override delete(): void {
        if (this.startDelete(`deleting node group ${this.definition.name}`, this.path_(), () => this.describe()?.status)) {
            cli.output(`deleting EKS node group ${this.definition.name}; AWS takes some minutes to finish`);
        }
        this.state.status = "DELETING";
    }

    override checkDeleted(): boolean {
        const live = this.describe();
        if (!live) return true;
        const issues = (live.health?.issues ?? []).map((i: any) => `${i.code}: ${i.message}`).join("; ");
        if (live.status === "DELETE_FAILED") throw new Error(`node group ${this.definition.name} failed to delete${issues ? `: ${issues}` : ""}`);
        cli.output(`node group ${this.definition.name} is ${live.status}`);
        return false;
    }

    override checkReadiness(): boolean {
        const live = this.describe();
        if (!live) {
            cli.output(`node group ${this.definition.name} not found`);
            return false;
        }
        this.note(live);
        const issues = (live.health?.issues ?? []).map((i: any) => `${i.code}: ${i.message}`).join("; ");
        if (live.status === "CREATE_FAILED") throw new Error(`node group ${this.definition.name} failed to create${issues ? `: ${issues}` : ""}`);
        if (live.status !== "ACTIVE") {
            cli.output(`node group ${this.definition.name} is ${live.status}${issues ? `: ${issues}` : ""}`);
            return false;
        }
        // One update at a time: what the last one could not take starts here.
        const started = this.converge(live);
        if (started) {
            cli.output(started);
            return false;
        }
        return true;
    }

    /** Shows the node group's status, size and health. */
    @action("status")
    status(_args?: Args): void {
        const live = this.describe();
        if (!live) {
            cli.output("not found");
            return;
        }
        const s = live.scalingConfig ?? {};
        cli.output(`${live.nodegroupName}: ${live.status}, ${s.desiredSize} nodes (${s.minSize}-${s.maxSize}) of ${(live.instanceTypes ?? []).join(", ")}, Kubernetes ${live.version}`);
        for (const i of live.health?.issues ?? []) cli.output(`issue ${i.code}: ${i.message}`);
    }

    /**
     * Starts the first update the node group needs to match the
     * definition: the version, then size and labels. Returns what it
     * started, or nothing if none is needed.
     */
    private converge(live: any): string | undefined {
        const d = this.definition;
        if (d.version && d.version !== live.version) {
            this.send(`upgrading node group ${d.name}`, "POST", `${this.path_()}/update-version`, { version: d.version, clientRequestToken: requestToken() }, true);
            return `upgrading EKS node group ${d.name} from ${live.version} to ${d.version}`;
        }
        const want = this.scaling();
        const have = live.scalingConfig ?? {};
        const scale = want.desiredSize !== have.desiredSize || want.minSize !== have.minSize || want.maxSize !== have.maxSize;
        const labels = flatStrings(d.labels);
        const current: Record<string, string> = live.labels ?? {};
        const addOrUpdate: Record<string, string> = {};
        for (const [k, v] of Object.entries(labels)) if (current[k] !== v) addOrUpdate[k] = v;
        const removeLabels = Object.keys(current).filter((k) => !(k in labels));
        const relabel = Object.keys(addOrUpdate).length > 0 || removeLabels.length > 0;
        if (!scale && !relabel) return undefined;
        const body: any = { clientRequestToken: requestToken() };
        if (scale) body.scalingConfig = want;
        if (relabel) body.labels = defined({ addOrUpdateLabels: Object.keys(addOrUpdate).length > 0 ? addOrUpdate : undefined, removeLabels: removeLabels.length > 0 ? removeLabels : undefined });
        this.send(`updating node group ${d.name}`, "POST", `${this.path_()}/update-config`, body, true);
        return `updating EKS node group ${d.name}${scale ? ` to ${want.desiredSize} nodes` : ""}`;
    }

    private scaling(): { desiredSize: number; minSize: number; maxSize: number } {
        const d = this.definition;
        const desired = d.desired_size ?? 2;
        const min = d.min_size ?? Math.min(1, desired);
        const max = d.max_size ?? Math.max(desired, 1);
        if (min > desired || desired > max) throw new Error(`node group sizes must satisfy min_size <= desired_size <= max_size (${min}, ${desired}, ${max})`);
        return { desiredSize: desired, minSize: min, maxSize: max };
    }

    private clusterPath(): string {
        return `/clusters/${encodeURIComponent(this.definition.cluster_name)}`;
    }

    private path_(): string {
        return `${this.clusterPath()}/node-groups/${encodeURIComponent(this.definition.name)}`;
    }

    private describe(): any | null {
        return this.find(`reading node group ${this.definition.name}`, this.path_())?.nodegroup ?? null;
    }

    private note(n: any): void {
        if (!n) return;
        this.state.name = n.nodegroupName;
        this.state.arn = n.nodegroupArn;
        this.state.status = n.status;
        this.state.version = n.version;
        this.state.desired_size = n.scalingConfig?.desiredSize;
        this.state.autoscaling_group = n.resources?.autoScalingGroups?.[0]?.name;
    }
}
