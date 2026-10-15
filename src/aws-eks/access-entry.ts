import cli from "cli";
import { EKSEntity, EKSDefinition, defined, sameSet, requestToken } from "./eks-base.ts";

/**
 * Access to an EKS cluster for an IAM principal.
 * @interface AccessEntryDefinition
 */
export interface AccessEntryDefinition extends EKSDefinition {
    /**
     * @description Name of the EKS cluster
     */
    cluster_name: string;

    /**
     * @description ARN of the IAM user or role to let in
     */
    principal_arn: string;

    /**
     * @description Access policy, by name (AmazonEKSClusterAdminPolicy, AmazonEKSAdminPolicy, AmazonEKSEditPolicy, AmazonEKSViewPolicy) or ARN (default AmazonEKSViewPolicy)
     */
    policy?: string;

    /**
     * @description Namespaces the policy applies to (default: the whole cluster)
     */
    namespaces?: string[];

    /**
     * @description Kubernetes groups the principal is in, for RBAC bindings of your own
     */
    kubernetes_groups?: string[];
}

/**
 * What an access entry reports.
 * @interface AccessEntryState
 */
export interface AccessEntryState {
    /** @description Access entry ARN */
    arn?: string;
    /** @description Kubernetes user name the principal is known by */
    username?: string;
    /** @description Access policy ARN */
    policy_arn?: string;
    /** @description Whether the entry existed before this entity managed it; it is left in place on delete */
    adopted?: boolean;
}

/**
 * @description Access to an Amazon EKS cluster for an IAM user or role.
 * Lets an IAM principal into the cluster with an EKS access policy, for the
 * whole cluster or some namespaces: a team's role with view access, a CI
 * role with edit access to its namespace. The AWS identity Monk created the
 * cluster with is an admin already.
 *
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.username` - the principal's Kubernetes user name
 */
export class AccessEntry extends EKSEntity<AccessEntryDefinition, AccessEntryState> {
    static deletion = { period: 10, attempts: 60 };

    override create(): void {
        this.state.adopted = !!this.find("reading access entry", this.entryPath())?.accessEntry;
        this.apply();
    }

    override update(): void {
        this.apply();
    }

    override delete(): void {
        if (this.state.adopted) {
            cli.output(`access for ${this.definition.principal_arn} was there before; leaving it in place`);
            return;
        }
        // Deleting the entry removes its policy associations too.
        this.remove(`removing access for ${this.definition.principal_arn}`, this.entryPath());
    }

    override checkDeleted(): boolean {
        if (this.state.adopted) return true;
        return !this.find("reading access entry", this.entryPath())?.accessEntry;
    }

    override checkReadiness(): boolean {
        const live = this.find("reading access entry", this.entryPath())?.accessEntry;
        if (!live) return false;
        const policies = this.find("reading access policies", `${this.entryPath()}/access-policies`)?.associatedAccessPolicies ?? [];
        return policies.some((p: any) => p.policyArn === this.policyArn());
    }

    private apply(): void {
        const d = this.definition;
        if (!d.principal_arn) throw new Error("principal_arn is required");
        let entry = this.find("reading access entry", this.entryPath())?.accessEntry;
        if (!entry) {
            entry = this.send(`adding access for ${d.principal_arn}`, "POST", `${this.clusterPath()}/access-entries`,
                defined({ principalArn: d.principal_arn, kubernetesGroups: d.kubernetes_groups, clientRequestToken: requestToken() }), true).accessEntry;
        } else if (!sameSet(entry.kubernetesGroups, d.kubernetes_groups ?? [])) {
            entry = this.send(`updating access for ${d.principal_arn}`, "POST", this.entryPath(), { kubernetesGroups: d.kubernetes_groups ?? [], clientRequestToken: requestToken() }, true).accessEntry;
        }
        this.state.arn = entry?.accessEntryArn;
        this.state.username = entry?.username;

        const policyArn = this.policyArn();
        const scope = (d.namespaces ?? []).length > 0 ? { type: "namespace", namespaces: d.namespaces } : { type: "cluster" };
        // Associating again replaces the scope, so it is safe to repeat.
        this.send(`granting ${policyArn}`, "POST", `${this.entryPath()}/access-policies`, { policyArn, accessScope: scope }, true);
        const policies = this.find("reading access policies", `${this.entryPath()}/access-policies`)?.associatedAccessPolicies ?? [];
        for (const p of policies) {
            if (p.policyArn === policyArn) continue;
            this.remove(`revoking ${p.policyArn}`, `${this.entryPath()}/access-policies/${encodeURIComponent(p.policyArn)}`);
        }
        this.state.policy_arn = policyArn;
        cli.output(`${d.principal_arn} has ${policyArn.split("/").pop()} on ${scope.type === "cluster" ? "the cluster" : (d.namespaces ?? []).join(", ")}`);
    }

    private policyArn(): string {
        const p = this.definition.policy ?? "AmazonEKSViewPolicy";
        return p.startsWith("arn:") ? p : `arn:aws:eks::aws:cluster-access-policy/${p}`;
    }

    private clusterPath(): string {
        return `/clusters/${encodeURIComponent(this.definition.cluster_name)}`;
    }

    private entryPath(): string {
        return `${this.clusterPath()}/access-entries/${encodeURIComponent(this.definition.principal_arn)}`;
    }
}
