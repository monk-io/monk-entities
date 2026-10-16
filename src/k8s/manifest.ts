import { OWNER } from "./objects.ts";

/** Fields the cluster sets, which a manifest leaves out. */
const SET_BY_CLUSTER = ["uid", "resourceVersion", "generation", "creationTimestamp", "managedFields", "ownerReferences", "selfLink", "deletionTimestamp", "deletionGracePeriodSeconds"];
const ANNOTATIONS_BY_TOOLS = ["kubectl.kubernetes.io/last-applied-configuration", "deployment.kubernetes.io/revision", OWNER];
/**
 * Annotations the volume controllers leave on a claim, by prefix; the
 * legacy volume.beta.kubernetes.io/storage-class is a user's and stays.
 */
const CLAIM_ANNOTATIONS_BY_CLUSTER = ["pv.kubernetes.io/", "volume.kubernetes.io/", "volume.beta.kubernetes.io/storage-provisioner"];
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
            if (ANNOTATIONS_BY_TOOLS.includes(k)) continue;
            if (obj.kind === "PersistentVolumeClaim" && CLAIM_ANNOTATIONS_BY_CLUSTER.some((p) => k.startsWith(p))) continue;
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
    if (obj.kind === "Service" && out.spec) {
        // Allocated by the cluster unless someone asked for it; None
        // (headless) is always asked for.
        const spec = { ...out.spec };
        for (const f of ["clusterIP", "clusterIPs"]) {
            if (setBy(obj, f) !== true) delete spec[f];
        }
        out.spec = spec;
    }
    return out;
}

/**
 * Whether someone asked for spec field f of live, rather than the cluster
 * filling it in: true, false, or undefined when live has no managedFields
 * to tell by. A field the cluster allocates (a Service's IPs, a NodePort)
 * has no manager unless one set it; a claim the cluster bound to a volume
 * carries pv.kubernetes.io/bound-by-controller, whatever the distribution
 * calls its controllers.
 */
export function setBy(live: any, f: string): boolean | undefined {
    const spec = live.spec ?? {};
    if (!JSON.stringify(spec).includes(`"${f}":`)) return false;
    if (f === "clusterIP" && spec.clusterIP === "None") return true;
    if (f === "volumeName") return live.metadata?.annotations?.["pv.kubernetes.io/bound-by-controller"] !== "yes";
    const managed: any[] | undefined = live.metadata?.managedFields;
    if (!managed) return undefined;
    return managed.some((m) => JSON.stringify(m.fieldsV1 ?? {}).includes(`"f:${f}"`));
}
