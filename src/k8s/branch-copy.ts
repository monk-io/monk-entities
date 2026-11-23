/**
 * How k8s/branch copies a namespace's objects into another: what it copies,
 * and what it changes on the way so that the copies run beside the
 * originals without taking anything of theirs.
 *
 * A plain module so that tests can call it directly (entity modules cannot
 * be imported by other modules).
 */

/** The kinds a branch copies, in the order it applies them. */
export const COPIED_KINDS: { apiVersion: string; kind: string }[] = [
    { apiVersion: "v1", kind: "ServiceAccount" },
    { apiVersion: "v1", kind: "Secret" },
    { apiVersion: "v1", kind: "ConfigMap" },
    { apiVersion: "v1", kind: "Service" },
    { apiVersion: "apps/v1", kind: "StatefulSet" },
    { apiVersion: "apps/v1", kind: "Deployment" },
];

/** Secret types the cluster or a tool keeps for itself, never copied. */
const SYSTEM_SECRETS = ["kubernetes.io/service-account-token", "helm.sh/release.v1"];

/** Annotations that describe the original, not the copy. */
const DROPPED_ANNOTATIONS = [
    "kubectl.kubernetes.io/last-applied-configuration",
    "deployment.kubernetes.io/revision",
];

export interface CopyOptions {
    /** The namespace copied from. */
    source: string;
    /** The namespace copied into. */
    target: string;
    /** Annotations every copy gets (the owner and where it came from). */
    annotations: Record<string, string>;
    /** Replicas per Deployment or StatefulSet name, overriding the original's. */
    replicas?: Record<string, number>;
    /** Keep LoadBalancer and NodePort Services as they are, instead of making them ClusterIP. */
    expose?: boolean;
}

/** Whether a branch leaves obj behind: what the cluster made, or something else owns. */
export function skipped(obj: any): boolean {
    const m = obj?.metadata ?? {};
    if ((m.ownerReferences ?? []).length > 0) return true;
    if (obj.kind === "ServiceAccount" && m.name === "default") return true;
    if (obj.kind === "ConfigMap" && m.name === "kube-root-ca.crt") return true;
    if (obj.kind === "Secret" && SYSTEM_SECRETS.includes(obj.type)) return true;
    return false;
}

/**
 * Rewrites the source namespace in DNS names to the target's, in every
 * string under v: `db.prod.svc` and `db-0.db.prod.svc.cluster.local`
 * become `db.br1.svc` and `db-0.db.br1.svc.cluster.local`. A short name
 * (`db`, `db.prod`) is left alone: the first already resolves in the
 * target, and the second cannot be told apart from other text.
 */
export function rewriteHosts(v: any, source: string, target: string): any {
    const from = `.${source}.svc`;
    const to = `.${target}.svc`;
    const walk = (x: any): any => {
        if (typeof x === "string") return x.split(from).join(to);
        if (Array.isArray(x)) return x.map(walk);
        if (x !== null && typeof x === "object") {
            const out: any = {};
            for (const [k, val] of Object.entries(x)) out[k] = walk(val);
            return out;
        }
        return x;
    };
    return walk(v);
}

/** obj with its fields that only the cluster sets taken out. */
function cleanMetadata(obj: any, o: CopyOptions): any {
    const m = obj.metadata ?? {};
    const annotations: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.annotations ?? {})) {
        if (!DROPPED_ANNOTATIONS.includes(k)) annotations[k] = v as string;
    }
    for (const [k, v] of Object.entries(o.annotations)) annotations[k] = v;
    const meta: any = { name: m.name, namespace: o.target, annotations };
    if (m.labels && Object.keys(m.labels).length > 0) meta.labels = { ...m.labels };
    return meta;
}

/**
 * The copy of obj (as read from the source namespace) to apply in the
 * target namespace, or undefined when the branch leaves it behind.
 */
export function copyOf(obj: any, o: CopyOptions): any | undefined {
    if (skipped(obj)) return undefined;
    const copy: any = { apiVersion: obj.apiVersion, kind: obj.kind, metadata: cleanMetadata(obj, o) };
    switch (obj.kind) {
        case "ServiceAccount":
            // Token secrets are the cluster's to make.
            if (obj.automountServiceAccountToken !== undefined) copy.automountServiceAccountToken = obj.automountServiceAccountToken;
            if (obj.imagePullSecrets) copy.imagePullSecrets = obj.imagePullSecrets;
            return copy;
        case "Secret":
            copy.type = obj.type;
            if (obj.data) copy.data = obj.data;
            if (obj.immutable !== undefined) copy.immutable = obj.immutable;
            return rewriteSecret(copy, o);
        case "ConfigMap":
            if (obj.data) copy.data = rewriteHosts(obj.data, o.source, o.target);
            if (obj.binaryData) copy.binaryData = obj.binaryData;
            if (obj.immutable !== undefined) copy.immutable = obj.immutable;
            return copy;
        case "Service":
            copy.spec = serviceSpec(obj.spec ?? {}, o);
            return copy;
        case "StatefulSet":
        case "Deployment": {
            const spec = rewriteHosts(obj.spec ?? {}, o.source, o.target);
            const replicas = o.replicas?.[obj.metadata?.name];
            if (replicas !== undefined) spec.replicas = replicas;
            if (obj.kind === "StatefulSet") {
                // Claim templates are copied as they are: the branch made the
                // claims they name for each cloned volume, and a pod beyond
                // those gets a new, empty one.
                for (const t of spec.volumeClaimTemplates ?? []) {
                    delete t.status;
                    if (t.metadata) t.metadata = { name: t.metadata.name, ...(t.metadata.labels ? { labels: t.metadata.labels } : {}) };
                }
            }
            copy.spec = spec;
            return copy;
        }
    }
    return undefined;
}

/** A Secret's string values with hosts rewritten; binary ones as they are. */
function rewriteSecret(copy: any, o: CopyOptions): any {
    if (!copy.data) return copy;
    const data: Record<string, string> = {};
    for (const [k, v] of Object.entries(copy.data as Record<string, string>)) {
        data[k] = v;
        let text: string;
        try {
            text = atob(v);
        } catch {
            continue;
        }
        if (!text.includes(`.${o.source}.svc`)) continue;
        data[k] = btoa(rewriteHosts(text, o.source, o.target));
    }
    copy.data = data;
    return copy;
}

/**
 * A Service's spec for the copy: no addresses or node ports of the
 * original's (they are the cluster's to hand out, and node ports are
 * cluster-wide), and no way in from outside unless `expose`.
 */
function serviceSpec(spec: any, o: CopyOptions): any {
    const s: any = rewriteHosts(spec, o.source, o.target);
    const headless = s.clusterIP === "None";
    delete s.clusterIP;
    delete s.clusterIPs;
    if (headless) s.clusterIP = "None";
    delete s.healthCheckNodePort;
    for (const p of s.ports ?? []) delete p.nodePort;
    if (!o.expose && (s.type === "LoadBalancer" || s.type === "NodePort")) {
        s.type = "ClusterIP";
        delete s.externalTrafficPolicy;
        delete s.loadBalancerIP;
        delete s.loadBalancerSourceRanges;
        delete s.loadBalancerClass;
        delete s.allocateLoadBalancerNodePorts;
        delete s.externalIPs;
    }
    return s;
}

/**
 * The NetworkPolicy that seals a branch off: its pods take traffic only
 * from each other, and send it only to each other and to the cluster's
 * DNS, plus any CIDRs in allow. Copies of databases keep the addresses of
 * the originals' peers in their data (Cassandra's system.peers, a
 * replica's primary) and would otherwise reach them.
 */
export function isolationPolicy(namespace: string, annotations: Record<string, string>, allow: string[] = []): any {
    const egress: any[] = [
        { to: [{ podSelector: {} }] },
        {
            to: [{ namespaceSelector: { matchLabels: { "kubernetes.io/metadata.name": "kube-system" } } }],
            ports: [{ protocol: "UDP", port: 53 }, { protocol: "TCP", port: 53 }],
        },
    ];
    if (allow.length > 0) egress.push({ to: allow.map((cidr) => ({ ipBlock: { cidr } })) });
    return {
        apiVersion: "networking.k8s.io/v1",
        kind: "NetworkPolicy",
        metadata: { name: "monk-branch-isolation", namespace, annotations },
        spec: {
            podSelector: {},
            policyTypes: ["Ingress", "Egress"],
            ingress: [{ from: [{ podSelector: {} }] }],
            egress,
        },
    };
}

/**
 * A GCE disk name for the clone of a claim: the branch's namespace and the
 * claim's name, cut to GCE's 63 characters with a hash to keep it unique.
 */
export function diskName(namespace: string, claim: string): string {
    const base = `${namespace}-${claim}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^[^a-z]+/, "").replace(/-+$/, "");
    if (base.length <= 63) return base || "b";
    let h = 5381;
    for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0;
    const suffix = h.toString(36).padStart(6, "0").slice(-6);
    return `${base.slice(0, 56).replace(/-+$/, "")}-${suffix}`;
}

/** The parts of a PD CSI volume handle: projects/P/zones/Z/disks/D (or regions/R). */
export function parseHandle(handle: string): { project: string; location: string; zonal: boolean; disk: string } | undefined {
    const m = /^projects\/([^/]+)\/(zones|regions)\/([^/]+)\/disks\/([^/]+)$/.exec(handle ?? "");
    if (!m) return undefined;
    return { project: m[1], location: m[3], zonal: m[2] === "zones", disk: m[4] };
}
