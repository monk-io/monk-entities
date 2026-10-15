import { MonkEntity } from "monkec/base";
import { retry, isRetryable } from "monkec/resilience";
import k8s, { Cluster } from "k8s";
import secret from "secret";

/**
 * How to reach a Kubernetes cluster. Give one of: a kubeconfig, a server
 * with a token, an EKS cluster or a GKE cluster. EKS and GKE are reached
 * with the Monk cluster's own AWS and GCP credentials.
 *
 * Kubeconfigs must carry their credentials inline. A kubeconfig that runs
 * aws eks get-token or gke-gcloud-auth-plugin works: the Monk cluster's
 * cloud credentials stand in for the plugin. Other credential plugins and
 * files referenced from the kubeconfig are refused.
 */
export interface K8sConnection {
    /**
     * @description Name of a Monk secret holding a kubeconfig
     */
    kubeconfig_secret?: string;

    /**
     * @description Kubeconfig context to use (defaults to its current context)
     */
    context?: string;

    /**
     * @description API server URL, e.g. https://10.0.0.1:6443 (overrides the kubeconfig's)
     */
    server?: string;

    /**
     * @description Name of a Monk secret holding a bearer token for the API server
     */
    token_secret?: string;

    /**
     * @description PEM certificate of the API server's CA (overrides the kubeconfig's)
     */
    ca?: string;

    /**
     * @description Skip verifying the API server's certificate
     */
    insecure?: boolean;

    /**
     * @description EKS cluster name, reached with the Monk cluster's AWS credentials
     */
    eks_cluster?: string;

    /**
     * @description AWS region of the EKS cluster
     */
    eks_region?: string;

    /**
     * @description GKE cluster name, reached with the Monk cluster's GCP credentials
     */
    gke_cluster?: string;

    /**
     * @description GKE cluster location (region or zone)
     */
    gke_location?: string;

    /**
     * @description GCP project of the GKE cluster (defaults to the credentials' project)
     */
    gke_project?: string;

    /**
     * @description Namespace for objects that name none (defaults to the context's, else "default")
     */
    namespace?: string;
}

/** The connection fields, as a cluster's state echoes them for wiring. */
export const CONNECTION_FIELDS = [
    "kubeconfig_secret", "context", "server", "token_secret", "ca", "insecure",
    "eks_cluster", "eks_region", "gke_cluster", "gke_location", "gke_project", "namespace",
] as const;

/**
 * o without its undefined fields, for an object the k8s module passes on
 * as it is, where an undefined field would arrive as null.
 */
export function defined<T extends object>(o: T): T {
    const out: any = {};
    for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
    return out;
}

/** Errors worth trying again: Kubernetes requests here are all idempotent. */
export function retryable(err: unknown): boolean {
    return isRetryable(err, "PUT");
}

/**
 * Base for entities that work on a Kubernetes cluster.
 */
export abstract class K8sEntity<D extends K8sConnection, S extends object> extends MonkEntity<D, S> {
    private resolved?: Cluster;

    /** The cluster, as the k8s module takes it. */
    protected cluster(): Cluster {
        if (this.resolved) return this.resolved;
        const d = this.definition;
        const c: Cluster = {};
        if (d.kubeconfig_secret) c.kubeconfig = secret.get(d.kubeconfig_secret);
        if (d.context) c.context = d.context;
        if (d.server) c.server = d.server;
        if (d.token_secret) c.token = secret.get(d.token_secret);
        if (d.ca) c.ca = d.ca;
        if (d.insecure) c.insecure = true;
        if (d.namespace) c.namespace = d.namespace;
        if (d.eks_cluster) {
            if (!d.eks_region) throw new Error("eks_cluster needs eks_region");
            c.eks = { name: d.eks_cluster, region: d.eks_region };
        }
        if (d.gke_cluster) {
            if (!d.gke_location) throw new Error("gke_cluster needs gke_location");
            c.gke = { name: d.gke_cluster, location: d.gke_location, project: d.gke_project };
        }
        if (!c.kubeconfig && !c.server && !c.eks && !c.gke) {
            throw new Error("no cluster to talk to: set kubeconfig_secret, server, eks_cluster or gke_cluster");
        }
        this.resolved = c;
        return c;
    }

    /** Runs fn, retrying failures the API may get over. */
    protected k8s<T>(what: string, fn: (c: Cluster) => T): T {
        const c = this.cluster();
        // A call may take a minute; retries leave room for the rest of it.
        return retry(() => fn(c), { when: retryable, what, budgetMs: 20000 });
    }

    /** The namespace objects that name none go to. */
    protected defaultNamespace(): string {
        return this.k8s("reading the default namespace", (c) => k8s.namespace(c));
    }
}

/** A node and the addresses it reports. */
export interface NodeInfo {
    name: string;
    ready: boolean;
    internal_ip?: string;
    external_ip?: string;
    hostname?: string;
}

/** The cluster's nodes; empty when the credentials may not list them. */
export function listNodes(c: Cluster): NodeInfo[] {
    let nodes: any[];
    try {
        nodes = retry(() => k8s.list(c, { apiVersion: "v1", kind: "Node" }), { when: retryable, what: "listing nodes", budgetMs: 20000 });
    } catch (e) {
        if ((e as any)?.name === "HttpError" && ((e as any).status === 403 || (e as any).status === 401)) return [];
        throw e;
    }
    return nodes.map((n) => {
        const addr = (type: string) => (n.status?.addresses ?? []).find((a: any) => a.type === type)?.address;
        const ready = (n.status?.conditions ?? []).some((c: any) => c.type === "Ready" && c.status === "True");
        return { name: n.metadata.name, ready, internal_ip: addr("InternalIP"), external_ip: addr("ExternalIP"), hostname: addr("Hostname") };
    });
}

/**
 * The address to reach a node port at: the first ready node's address of
 * type (ExternalIP, InternalIP or Hostname), or by default its ExternalIP
 * if any node has one, else its InternalIP.
 */
export function nodeAddress(nodes: NodeInfo[], type?: string): string | undefined {
    const ready = nodes.filter((n) => n.ready);
    const pick = (t: string) => ready.map((n) => (t === "ExternalIP" ? n.external_ip : t === "InternalIP" ? n.internal_ip : n.hostname)).find((a) => a);
    if (type) return pick(type);
    return pick("ExternalIP") ?? pick("InternalIP");
}
