import cli from "cli";
import { EKSEntity, EKSDefinition, requestToken, defined, flatStrings } from "./eks-base.ts";

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
     * @description IAM roles for the add-on's service accounts through EKS Pod Identity, by service account name, e.g. ebs-csi-controller-sa: <role ARN>. Needs the eks-pod-identity-agent add-on, and roles that trust pods.eks.amazonaws.com
     */
    service_account_roles?: Record<string, string>;

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
    /** @description The Pod Identity roles last given to EKS, as service account=role ARN lines */
    service_account_roles?: string;
}

/**
 * @description An Amazon EKS add-on, such as the EBS CSI driver.
 * Installs an EKS add-on and keeps its version and configuration; fields
 * the add-on had set otherwise are overwritten. aws-ebs-csi-driver is what
 * makes PersistentVolumeClaims (k8s/volume, a workload's storage) work on
 * EKS. An add-on that calls AWS gets its permissions best through EKS Pod
 * Identity (service_account_roles); pods on managed nodes can not always
 * reach the node role.
 *
 * A change is carried out once the add-on is not changing any more, so a
 * failed add-on is mended by fixing its definition.
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

    static deletion = { period: 10, attempts: 60 };

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
            podIdentityAssociations: this.associations(),
            configurationValues: d.configuration,
            resolveConflicts: "OVERWRITE",
            clientRequestToken: requestToken(),
        });
        const res = this.send(`installing add-on ${d.name}`, "POST", `${this.clusterPath()}/addons`, body, true);
        this.note(res.addon);
        this.state.adopted = false;
        this.state.service_account_roles = this.roles();
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
        this.startDelete(`removing add-on ${this.definition.name}`, this.path_(), () => this.describe()?.status);
        this.state.status = "DELETING";
    }

    override checkDeleted(): boolean {
        if (this.state.adopted) return true;
        const live = this.describe();
        if (!live) return true;
        const issues = (live.health?.issues ?? []).map((i: any) => `${i.code}: ${i.message}`).join("; ");
        if (live.status === "DELETE_FAILED") throw new Error(`add-on ${this.definition.name} failed to delete${issues ? `: ${issues}` : ""}`);
        cli.output(`add-on ${this.definition.name} is ${live.status}`);
        return false;
    }

    override checkReadiness(): boolean {
        const live = this.describe();
        if (!live) return false;
        this.note(live);
        const settled = !["CREATING", "UPDATING", "DELETING"].includes(live.status);
        if (settled && this.differs(live)) {
            this.apply(live);
            return false;
        }
        const issues = (live.health?.issues ?? []).map((i: any) => `${i.code}: ${i.message}`).join("; ");
        if (live.status === "CREATE_FAILED" || live.status === "UPDATE_FAILED") {
            throw new Error(`add-on ${this.definition.name} is ${live.status}${issues ? `: ${issues}` : ""}`);
        }
        if (live.status !== "ACTIVE") cli.output(`add-on ${this.definition.name} is ${live.status}${issues ? `: ${issues}` : ""}`);
        return live.status === "ACTIVE";
    }

    /** Whether the add-on differs from the definition. */
    private differs(live: any): boolean {
        const d = this.definition;
        return (d.version !== undefined && d.version !== live.addonVersion) ||
            (d.service_account_role_arn !== undefined && d.service_account_role_arn !== live.serviceAccountRoleArn) ||
            (d.configuration !== undefined && d.configuration !== live.configurationValues) ||
            this.roles() !== (this.state.service_account_roles ?? "");
    }

    /**
     * Updates the add-on where it differs from the definition, once it is
     * not changing; readiness carries out what is left.
     */
    private apply(live: any): void {
        const d = this.definition;
        this.note(live);
        if (!this.differs(live)) return;
        if (["CREATING", "UPDATING", "DELETING"].includes(live.status)) {
            cli.output(`add-on ${d.name} is ${live.status}; the change follows once it is done`);
            return;
        }
        const body = defined({
            addonVersion: d.version,
            serviceAccountRoleArn: d.service_account_role_arn,
            podIdentityAssociations: this.associations() ?? (this.state.service_account_roles ? [] : undefined),
            configurationValues: d.configuration,
            resolveConflicts: "OVERWRITE",
            clientRequestToken: requestToken(),
        });
        this.send(`updating add-on ${d.name}`, "POST", `${this.path_()}/update`, body, true);
        this.state.service_account_roles = this.roles();
        this.state.status = "UPDATING";
        cli.output(`updating add-on ${d.name}`);
    }

    /** The Pod Identity roles as EKS takes them, or undefined for none. */
    private associations(): { serviceAccount: string; roleArn: string }[] | undefined {
        const roles = flatStrings(this.definition.service_account_roles);
        const names = Object.keys(roles).sort();
        if (names.length === 0) return undefined;
        return names.map((n) => ({ serviceAccount: n, roleArn: roles[n] }));
    }

    /** The Pod Identity roles as one comparable string. */
    private roles(): string {
        return (this.associations() ?? []).map((a) => `${a.serviceAccount}=${a.roleArn}`).join("\n");
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
