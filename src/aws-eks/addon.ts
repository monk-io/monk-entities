import cli from "cli";
import { EKSEntity, EKSDefinition, requestToken, defined } from "./eks-base.ts";

/**
 * An EKS add-on.
 * @interface AddonDefinition
 */
export interface AddonDefinition extends EKSDefinition {
    /**
     * @description Name of the EKS cluster
     */
    cluster_name: string;

    /**
     * @description Add-on name, e.g. aws-ebs-csi-driver, vpc-cni, coredns, kube-proxy, eks-pod-identity-agent, metrics-server
     */
    name: string;

    /**
     * @description Add-on version (default: EKS's default for the cluster's Kubernetes version)
     */
    version?: string;

    /**
     * @description IAM role for the add-on's service account (IAM roles for service accounts)
     */
    service_account_role_arn?: string;

    /**
     * @description Add-on configuration, as JSON or YAML
     */
    configuration?: string;
}

/**
 * What an add-on reports.
 * @interface AddonState
 */
export interface AddonState {
    /** @description Add-on name */
    name?: string;
    /** @description CREATING, ACTIVE, UPDATING, DEGRADED, CREATE_FAILED, UPDATE_FAILED, DELETING or DELETE_FAILED */
    status?: string;
    /** @description Installed version */
    version?: string;
    /** @description Whether the add-on was installed before this entity managed it */
    adopted?: boolean;
}

/**
 * @description An Amazon EKS add-on, such as the EBS CSI driver.
 * Installs an EKS add-on and keeps its version and configuration; fields
 * the add-on had set otherwise are overwritten. aws-ebs-csi-driver is what
 * makes PersistentVolumeClaims (k8s/volume, a workload's storage) work on
 * EKS; its permissions come from the node role (AmazonEBSCSIDriverPolicy)
 * or from service_account_role_arn.
 *
 * Deleting the entity removes the add-on, unless it was installed before
 * (vpc-cni, coredns and kube-proxy come with every cluster).
 *
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.status`, `state.version`
 */
export class Addon extends EKSEntity<AddonDefinition, AddonState> {
    static readiness = { period: 10, initialDelay: 10, attempts: 60 };

    override create(): void {
        const d = this.definition;
        const existing = this.describe();
        if (existing) {
            cli.output(`add-on ${d.name} is installed already; managing it from now on`);
            this.state.adopted = true;
            this.apply(existing);
            return;
        }
        const body = defined({
            addonName: d.name,
            addonVersion: d.version,
            serviceAccountRoleArn: d.service_account_role_arn,
            configurationValues: d.configuration,
            resolveConflicts: "OVERWRITE",
            clientRequestToken: requestToken(),
        });
        const res = this.send(`installing add-on ${d.name}`, "POST", `${this.clusterPath()}/addons`, body, true);
        this.note(res.addon);
        this.state.adopted = false;
    }

    override update(): void {
        const live = this.describe();
        if (!live) {
            this.create();
            return;
        }
        this.apply(live);
    }

    override delete(): void {
        if (this.state.adopted) {
            cli.output(`add-on ${this.definition.name} was installed before; leaving it in place`);
            return;
        }
        this.remove(`removing add-on ${this.definition.name}`, this.path_());
        this.state.status = "DELETING";
    }

    override checkReadiness(): boolean {
        const live = this.describe();
        if (!live) return false;
        this.note(live);
        const issues = (live.health?.issues ?? []).map((i: any) => `${i.code}: ${i.message}`).join("; ");
        if (live.status === "CREATE_FAILED" || live.status === "UPDATE_FAILED") {
            throw new Error(`add-on ${this.definition.name} is ${live.status}${issues ? `: ${issues}` : ""}`);
        }
        if (live.status !== "ACTIVE") cli.output(`add-on ${this.definition.name} is ${live.status}${issues ? `: ${issues}` : ""}`);
        return live.status === "ACTIVE";
    }

    /** Updates the add-on where it differs from the definition. */
    private apply(live: any): void {
        const d = this.definition;
        this.note(live);
        const differs = (d.version !== undefined && d.version !== live.addonVersion) ||
            (d.service_account_role_arn !== undefined && d.service_account_role_arn !== live.serviceAccountRoleArn) ||
            (d.configuration !== undefined && d.configuration !== live.configurationValues);
        if (!differs) return;
        const body = defined({
            addonVersion: d.version,
            serviceAccountRoleArn: d.service_account_role_arn,
            configurationValues: d.configuration,
            resolveConflicts: "OVERWRITE",
            clientRequestToken: requestToken(),
        });
        this.send(`updating add-on ${d.name}`, "POST", `${this.path_()}/update`, body, true);
        cli.output(`updating add-on ${d.name}`);
    }

    private clusterPath(): string {
        return `/clusters/${encodeURIComponent(this.definition.cluster_name)}`;
    }

    private path_(): string {
        return `${this.clusterPath()}/addons/${encodeURIComponent(this.definition.name)}`;
    }

    private describe(): any | null {
        return this.find(`reading add-on ${this.definition.name}`, this.path_())?.addon ?? null;
    }

    private note(a: any): void {
        if (!a) return;
        this.state.name = a.addonName;
        this.state.status = a.status;
        this.state.version = a.addonVersion;
    }
}
