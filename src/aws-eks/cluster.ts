import { action, Args } from "monkec/base";
import cli from "cli";
import { EKSEntity, EKSDefinition, requestToken, defined, sameSet, awsErrorType, flatStrings, OWNER_TAG } from "./eks-base.ts";

/**
 * An EKS cluster.
 * @interface ClusterDefinition
 */
export interface ClusterDefinition extends EKSDefinition {
    /**
     * @description Cluster name, unique in the account and region
     */
    name: string;

    /**
     * @description ARN of the IAM role EKS acts as (trusts eks.amazonaws.com, with AmazonEKSClusterPolicy)
     */
    role_arn: string;

    /**
     * @description Subnets for the control plane's network interfaces, in at least two availability zones
     */
    subnet_ids: string[];

    /**
     * @description Security groups for the control plane's network interfaces, besides the one EKS makes
     */
    security_group_ids?: string[];

    /**
     * @description Kubernetes version, e.g. 1.33 (default: EKS's default). Raising it upgrades the cluster, one minor version at a time.
     */
    version?: string;

    /**
     * @description Whether the API server is reachable from the internet (default true)
     */
    endpoint_public_access?: boolean;

    /**
     * @description Whether the API server is reachable from inside the VPC (default false)
     */
    endpoint_private_access?: boolean;

    /**
     * @description CIDR blocks the public API server endpoint accepts (default 0.0.0.0/0)
     */
    public_access_cidrs?: string[];

    /**
     * @description How the cluster authenticates IAM principals: API (default) or API_AND_CONFIG_MAP
     */
    authentication_mode?: string;

    /**
     * @description Control plane logs to send to CloudWatch: api, audit, authenticator, controllerManager, scheduler
     */
    logging?: string[];

    /**
     * @description Resource tags
     */
    tags?: Record<string, string>;

    /**
     * @description Take over a cluster of this name that already exists; it is left in place when the entity is deleted
     */
    adopt?: boolean;
}

/**
 * What an EKS cluster reports.
 * @interface ClusterState
 */
export interface ClusterState {
    /** @description Cluster name, for k8s/cluster's eks_cluster */
    name?: string;
    /** @description Region, for k8s/cluster's eks_region */
    region?: string;
    /** @description Cluster ARN */
    arn?: string;
    /** @description CREATING, ACTIVE, UPDATING, DELETING or FAILED */
    status?: string;
    /** @description API server URL */
    endpoint?: string;
    /** @description The API server's CA certificate, base64-encoded PEM */
    ca?: string;
    /** @description Kubernetes version */
    version?: string;
    /** @description EKS platform version */
    platform_version?: string;
    /** @description OIDC issuer URL, for IAM roles for service accounts */
    oidc_issuer?: string;
    /** @description Security group EKS made for the control plane and nodes */
    cluster_security_group_id?: string;
    /** @description VPC of the cluster */
    vpc_id?: string;
    /** @description Whether the cluster existed before this entity managed it */
    adopted?: boolean;
}

/**
 * @description An Amazon EKS cluster.
 * Creates an EKS control plane with the Monk cluster's AWS credentials. Its
 * creator, that same AWS identity, gets cluster admin, so k8s entities reach
 * it with eks_cluster and eks_region and no kubeconfig. Nodes come from
 * aws-eks/node-group.
 *
 * Creating a cluster takes 10 to 15 minutes; the entity is ready when it is
 * ACTIVE. Raising version upgrades it; endpoint access, logging, subnets
 * and security groups are updated in place. EKS runs one update at a time,
 * so the entity starts them one after another and is ready when the
 * cluster matches its definition.
 *
 * Deleting the entity deletes the cluster, which EKS refuses while it has
 * node groups: delete those first. Deletion takes some minutes more after
 * the entity is gone; the VPC can only go after it.
 *
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.name`, `state.region` - for k8s/cluster's eks_cluster and eks_region
 * - `state.endpoint`, `state.ca` - the API server and its CA
 * - `state.oidc_issuer` - for IAM roles for service accounts
 * - `state.cluster_security_group_id`
 *
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ec2/subnet`, `aws-iam/iam-role` - what it runs in and as
 * - `aws-eks/node-group`, `aws-eks/addon`, `aws-eks/access-entry`
 * - `k8s/cluster` and every k8s entity - eks_cluster and eks_region
 */
export class Cluster extends EKSEntity<ClusterDefinition, ClusterState> {
    /** Clusters take 10 to 15 minutes to create: up to 30. */
    static readiness = { period: 20, initialDelay: 30, attempts: 90 };

    override create(): void {
        const d = this.definition;
        const path = `/clusters/${encodeURIComponent(d.name)}`;
        const existing = this.find(`looking up cluster ${d.name}`, path);
        if (existing && existing.cluster?.tags?.[OWNER_TAG] === this.path) {
            // Made by this entity, by a create whose response was lost.
            this.note(existing.cluster);
            this.state.adopted = false;
            return;
        }
        if (existing) {
            if (!d.adopt) throw new Error(`EKS cluster ${d.name} already exists; set adopt: true to take it over`);
            cli.output(`adopting EKS cluster ${d.name}`);
            this.note(existing.cluster);
            this.state.adopted = true;
            return;
        }
        if (!d.role_arn) throw new Error("role_arn is required");
        if ((d.subnet_ids ?? []).length < 2) throw new Error("subnet_ids needs subnets in at least two availability zones");
        const body = defined({
            name: d.name,
            version: d.version,
            roleArn: d.role_arn,
            resourcesVpcConfig: this.vpcConfig(),
            logging: this.logging(),
            accessConfig: { authenticationMode: d.authentication_mode ?? "API", bootstrapClusterCreatorAdminPermissions: true },
            tags: { ...flatStrings(d.tags), [OWNER_TAG]: this.path },
            clientRequestToken: requestToken(),
        });
        const res = this.send(`creating cluster ${d.name}`, "POST", "/clusters", body, true);
        cli.output(`creating EKS cluster ${d.name}; this takes 10 to 15 minutes`);
        this.note(res.cluster);
        this.state.adopted = false;
    }

    override update(): void {
        const d = this.definition;
        const live = this.describe();
        if (!live) {
            this.create();
            return;
        }
        this.note(live);
        if (d.tags && live.arn) {
            this.send(`tagging cluster ${d.name}`, "POST", `/tags/${encodeURIComponent(live.arn)}`, { tags: flatStrings(d.tags) });
        }
        if (live.status !== "ACTIVE") {
            cli.output(`EKS cluster ${d.name} is ${live.status}; the changes follow once it is ACTIVE`);
            return;
        }
        const started = this.converge(live);
        if (started) cli.output(started);
    }

    override delete(): void {
        if (this.state.adopted) {
            cli.output(`EKS cluster ${this.definition.name} was adopted; leaving it in place`);
            return;
        }
        try {
            if (this.remove(`deleting cluster ${this.definition.name}`, this.base())) {
                cli.output(`deleting EKS cluster ${this.definition.name}; AWS takes some minutes to finish`);
            }
        } catch (err) {
            if (awsErrorType(err) === "ResourceInUseException") {
                throw new Error(`EKS cluster ${this.definition.name} still has node groups or add-ons being deleted; delete again in a few minutes`);
            }
            throw err;
        }
        this.state.status = "DELETING";
    }

    override checkReadiness(): boolean {
        const live = this.describe();
        if (!live) {
            cli.output(`EKS cluster ${this.definition.name} not found`);
            return false;
        }
        this.note(live);
        if (live.status === "FAILED") throw new Error(`EKS cluster ${this.definition.name} failed to create; delete it and create it again`);
        if (live.status !== "ACTIVE") {
            cli.output(`EKS cluster ${this.definition.name} is ${live.status}`);
            return false;
        }
        // EKS runs one update at a time, so changes it could not take with
        // the last one are started here, one by one.
        const started = this.converge(live);
        if (started) {
            cli.output(started);
            return false;
        }
        return true;
    }

    /** Shows the cluster's status and the updates in progress. */
    @action("status")
    status(_args?: Args): void {
        const live = this.describe();
        if (!live) {
            cli.output("not found");
            return;
        }
        cli.output(`${live.name}: ${live.status}, Kubernetes ${live.version} (${live.platformVersion})`);
        cli.output(`endpoint: ${live.endpoint}`);
        const updates = this.find("listing updates", `${this.base()}/updates`)?.updateIds ?? [];
        for (const id of updates) {
            const u = this.find(`reading update ${id}`, `${this.base()}/updates/${encodeURIComponent(id)}`)?.update;
            if (u && u.status === "InProgress") cli.output(`update ${u.type}: ${u.status}`);
        }
    }

    /**
     * Starts the first update the cluster needs to match the definition:
     * the version, then endpoint access, then subnets and security groups,
     * then logging. Returns what it started, or nothing if none is needed.
     */
    private converge(live: any): string | undefined {
        const d = this.definition;
        if (d.version && d.version !== live.version) {
            this.send(`upgrading cluster ${d.name} to ${d.version}`, "POST", `${this.base()}/updates`, { version: d.version, clientRequestToken: requestToken() }, true);
            return `upgrading EKS cluster ${d.name} from ${live.version} to ${d.version}`;
        }
        const vpc = live.resourcesVpcConfig ?? {};
        const want = this.vpcConfig();
        const access = vpc.endpointPublicAccess !== want.endpointPublicAccess || vpc.endpointPrivateAccess !== want.endpointPrivateAccess ||
            (want.publicAccessCidrs !== undefined && !sameSet(vpc.publicAccessCidrs, want.publicAccessCidrs));
        if (access) {
            const config = defined({ endpointPublicAccess: want.endpointPublicAccess, endpointPrivateAccess: want.endpointPrivateAccess, publicAccessCidrs: want.publicAccessCidrs });
            this.send(`updating cluster ${d.name}`, "POST", `${this.base()}/update-config`, { resourcesVpcConfig: config, clientRequestToken: requestToken() }, true);
            return `updating EKS cluster ${d.name}'s endpoint access`;
        }
        if (!sameSet(vpc.subnetIds, want.subnetIds) || !sameSet(vpc.securityGroupIds, want.securityGroupIds ?? [])) {
            const config = { subnetIds: want.subnetIds, securityGroupIds: want.securityGroupIds ?? [] };
            this.send(`updating cluster ${d.name}`, "POST", `${this.base()}/update-config`, { resourcesVpcConfig: config, clientRequestToken: requestToken() }, true);
            return `updating EKS cluster ${d.name}'s subnets and security groups`;
        }
        const enabled = (live.logging?.clusterLogging ?? []).filter((l: any) => l.enabled).flatMap((l: any) => l.types ?? []);
        if (!sameSet(enabled, d.logging ?? [])) {
            this.send(`updating cluster ${d.name}'s logging`, "POST", `${this.base()}/update-config`, { logging: this.logging(true), clientRequestToken: requestToken() }, true);
            return `updating EKS cluster ${d.name}'s logging`;
        }
        return undefined;
    }

    private base(): string {
        return `/clusters/${encodeURIComponent(this.definition.name)}`;
    }

    private describe(): any | null {
        return this.find(`reading cluster ${this.definition.name}`, this.base())?.cluster ?? null;
    }

    private vpcConfig(): any {
        const d = this.definition;
        return defined({
            subnetIds: d.subnet_ids,
            securityGroupIds: d.security_group_ids,
            endpointPublicAccess: d.endpoint_public_access ?? true,
            endpointPrivateAccess: d.endpoint_private_access ?? false,
            publicAccessCidrs: d.public_access_cidrs,
        });
    }

    /** The logging setting; with all, the types not wanted are turned off too. */
    private logging(all = false): any | undefined {
        const types = this.definition.logging ?? [];
        const every = ["api", "audit", "authenticator", "controllerManager", "scheduler"];
        const off = every.filter((t) => types.indexOf(t) < 0);
        const entries: any[] = [];
        if (types.length > 0) entries.push({ types, enabled: true });
        if (all && off.length > 0) entries.push({ types: off, enabled: false });
        return entries.length > 0 ? { clusterLogging: entries } : undefined;
    }

    private note(c: any): void {
        if (!c) return;
        this.state.name = c.name;
        this.state.region = this.definition.region;
        this.state.arn = c.arn;
        this.state.status = c.status;
        this.state.endpoint = c.endpoint;
        this.state.ca = c.certificateAuthority?.data;
        this.state.version = c.version;
        this.state.platform_version = c.platformVersion;
        this.state.oidc_issuer = c.identity?.oidc?.issuer;
        this.state.cluster_security_group_id = c.resourcesVpcConfig?.clusterSecurityGroupId;
        this.state.vpc_id = c.resourcesVpcConfig?.vpcId;
    }
}
