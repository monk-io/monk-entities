import { action, Args } from "monkec/base";
import k8s from "k8s";
import cli from "cli";
import { K8sEntity, K8sConnection, CONNECTION_FIELDS } from "./k8s-base.ts";

/**
 * A Kubernetes cluster Monk works on.
 * @interface ClusterDefinition
 */
export interface ClusterDefinition extends K8sConnection {}

/**
 * What Monk knows of the cluster, and how to reach it, for other entities
 * to wire to.
 * @interface ClusterState
 */
export interface ClusterState {
    /**
     * @description Kubernetes version the API server reports
     */
    version?: string;

    /**
     * @description Platform the API server reports, e.g. linux/amd64
     */
    platform?: string;

    /**
     * @description Namespace objects that name none go to
     */
    default_namespace?: string;

    /** @description Connection: secret holding the kubeconfig */
    kubeconfig_secret?: string;
    /** @description Connection: kubeconfig context */
    context?: string;
    /** @description Connection: API server URL */
    server?: string;
    /** @description Connection: secret holding the bearer token */
    token_secret?: string;
    /** @description Connection: API server CA */
    ca?: string;
    /** @description Connection: skip server certificate verification */
    insecure?: boolean;
    /** @description Connection: EKS cluster name */
    eks_cluster?: string;
    /** @description Connection: EKS region */
    eks_region?: string;
    /** @description Connection: GKE cluster name */
    gke_cluster?: string;
    /** @description Connection: GKE location */
    gke_location?: string;
    /** @description Connection: GKE project */
    gke_project?: string;
    /** @description Connection: namespace */
    namespace?: string;
}

/**
 * @description Kubernetes cluster.
 * Checks that Monk can reach a cluster and keeps how to reach it, so the
 * k8s/resource entities of a stack can wire to one place instead of each
 * repeating the connection.
 *
 * ## Secrets
 * - Reads: `kubeconfig_secret` (a kubeconfig) or `token_secret` (a bearer token), when set
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.version` - Kubernetes version of the API server
 * - `state.default_namespace` - namespace objects that name none go to
 * - `state.kubeconfig_secret`, `state.server`, `state.eks_cluster`, ... - the connection, as given
 *
 * ## Composing with Other Entities
 * Works with:
 * - `k8s/resource` - wire its connection fields to this cluster's state with
 *   `connection-target("cluster") entity-state get-member("kubeconfig_secret")`
 */
export class Cluster extends K8sEntity<ClusterDefinition, ClusterState> {
    override create(): void {
        this.refresh();
    }

    override update(): void {
        this.refresh();
    }

    override checkReadiness(): boolean {
        try {
            this.refresh();
            return true;
        } catch (e) {
            cli.output(`cluster not reachable: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** Lists the cluster's namespaces. */
    @action("namespaces")
    namespaces(_args?: Args): void {
        const all = this.k8s("listing namespaces", (c) => k8s.list(c, { apiVersion: "v1", kind: "Namespace" }));
        for (const ns of all) cli.output(`${ns.metadata.name}\t${ns.status?.phase ?? ""}`);
    }

    /** Lists the kinds the cluster serves. */
    @action("kinds")
    kinds(_args?: Args): void {
        const all = this.k8s("discovering kinds", (c) => k8s.resources(c));
        for (const r of all) cli.output(`${r.apiVersion}\t${r.kind}\t${r.namespaced ? "namespaced" : "cluster"}`);
    }

    private refresh(): void {
        const v = this.k8s("reading the server version", (c) => k8s.version(c));
        this.state.version = v.gitVersion;
        this.state.platform = v.platform;
        this.state.default_namespace = this.defaultNamespace();
        const d = this.definition as any;
        const s = this.state as any;
        for (const f of CONNECTION_FIELDS) {
            if (d[f] !== undefined) s[f] = d[f];
        }
    }
}
