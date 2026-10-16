import { OWNER } from "./objects.ts";

/** Fields the cluster sets, which a manifest leaves out. */
const SET_BY_CLUSTER = ["uid", "resourceVersion", "generation", "creationTimestamp", "managedFields", "ownerReferences", "selfLink", "deletionTimestamp", "deletionGracePeriodSeconds"];
const ANNOTATIONS_BY_TOOLS = ["kubectl.kubernetes.io/last-applied-configuration", "deployment.kubernetes.io/revision", OWNER];
/** Annotations the cluster's volume controllers leave, by prefix. */
const ANNOTATION_PREFIXES_BY_CLUSTER = ["pv.kubernetes.io/", "volume.kubernetes.io/", "volume.beta.kubernetes.io/"];
const FINALIZERS_BY_CLUSTER = ["kubernetes.io/pvc-protection"];

/**
 * obj as a manifest: no status, nothing the cluster set, and no Secret
 * values, which stay on the cluster.
 */
export function asManifest(obj: any): any {
    const { status: _status, ...rest } = obj;
    const metadata: any = { ...(obj.metadata ?? {}) };
    for (const f of SET_BY_CLUSTER) delete metadata[f];
    if (metadata.annotations) {
        const annotations: Record<string, string> = {};
        for (const [k, v] of Object.entries(metadata.annotations as Record<string, string>)) {
            if (ANNOTATIONS_BY_TOOLS.includes(k) || ANNOTATION_PREFIXES_BY_CLUSTER.some((p) => k.startsWith(p))) continue;
            annotations[k] = v;
        }
        if (Object.keys(annotations).length === 0) delete metadata.annotations;
        else metadata.annotations = annotations;
    }
    if (metadata.finalizers) {
        const finalizers = (metadata.finalizers as string[]).filter((f) => !FINALIZERS_BY_CLUSTER.includes(f));
        if (finalizers.length === 0) delete metadata.finalizers;
        else metadata.finalizers = finalizers;
    }
    const out: any = { ...rest, metadata };
    if (obj.kind === "Secret") {
        delete out.data;
        delete out.stringData;
    }
    if (obj.kind === "Service" && out.spec && out.spec.clusterIP !== "None") {
        // Allocated by the cluster; None (headless) is asked for.
        const { clusterIP: _ip, clusterIPs: _ips, ...spec } = out.spec;
        out.spec = spec;
    }
    return out;
}
