// A fake Kubernetes API server for the k8s package's tests: discovery,
// server-side apply, reads, paged lists and deletes, for a few built-in
// kinds and whatever kinds the CRDs applied to it define. Workloads become
// ready after a couple of reads, LoadBalancer Services get an address, and
// deleted LoadBalancer Services and PersistentVolumeClaims linger, held by
// their finalizers, for a read, as on a real cluster.
import { fakeApi, json, Request, Response } from "monk/test";

export const KUBE = "https://kube.test";

interface Kind {
    group: string; // "" for core
    version: string;
    kind: string;
    plural: string;
    namespaced: boolean;
}

const BUILTIN: Kind[] = [
    { group: "", version: "v1", kind: "Namespace", plural: "namespaces", namespaced: false },
    { group: "", version: "v1", kind: "Node", plural: "nodes", namespaced: false },
    { group: "", version: "v1", kind: "ConfigMap", plural: "configmaps", namespaced: true },
    { group: "", version: "v1", kind: "Service", plural: "services", namespaced: true },
    { group: "", version: "v1", kind: "Secret", plural: "secrets", namespaced: true },
    { group: "", version: "v1", kind: "PersistentVolumeClaim", plural: "persistentvolumeclaims", namespaced: true },
    { group: "apps", version: "v1", kind: "Deployment", plural: "deployments", namespaced: true },
    { group: "apps", version: "v1", kind: "StatefulSet", plural: "statefulsets", namespaced: true },
    { group: "networking.k8s.io", version: "v1", kind: "Ingress", plural: "ingresses", namespaced: true },
    { group: "batch", version: "v1", kind: "Job", plural: "jobs", namespaced: true },
    { group: "apiextensions.k8s.io", version: "v1", kind: "CustomResourceDefinition", plural: "customresourcedefinitions", namespaced: false },
];

export interface KubeState {
    /** Objects by "plural/namespace/name" (namespace empty for cluster-scoped). */
    objects: Map<string, any>;
    /** Reads of each object since it was last applied. */
    reads: Map<string, number>;
    kinds: Kind[];
    nextUid: number;
    /** The field managers applies came from, in order. */
    managers: string[];
    /** Deleted objects that finalizers still hold: reads until they go. */
    terminating: Map<string, number>;
}

/** The finalizer that holds an object of this kind when it is deleted, if any. */
function finalizer(obj: any): string | undefined {
    if (obj.kind === "Service" && obj.spec?.type === "LoadBalancer") return "service.kubernetes.io/load-balancer-cleanup";
    if (obj.kind === "PersistentVolumeClaim") return "kubernetes.io/pvc-protection";
    return undefined;
}

/** The keys of what the fake holds besides its nodes, sorted. */
export function stored(s: KubeState): string[] {
    return [...s.objects.keys()].filter((k) => !k.startsWith("nodes/")).sort();
}

function status(code: number, reason: string, message: string): Response {
    return json(code, { kind: "Status", apiVersion: "v1", status: "Failure", reason, message, code });
}

function utf8base64(s: string): string {
    return btoa(encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))));
}

function gv(k: Kind): string {
    return k.group ? `${k.group}/${k.version}` : k.version;
}

function discovery(s: KubeState, group: string, version: string): Response {
    const kinds = s.kinds.filter((k) => k.group === group && k.version === version);
    if (kinds.length === 0) return status(404, "NotFound", `the server could not find the requested resource`);
    return json(200, {
        kind: "APIResourceList",
        groupVersion: group ? `${group}/${version}` : version,
        resources: kinds.map((k) => ({ name: k.plural, kind: k.kind, namespaced: k.namespaced, verbs: ["get", "list", "patch", "delete"] })),
    });
}

function kindOf(s: KubeState, group: string, version: string, plural: string): Kind | undefined {
    return s.kinds.find((k) => k.group === group && k.version === version && k.plural === plural);
}

/** What a workload reports once its pods have come up. */
function progress(obj: any, reads: number): void {
    const want = obj.spec?.replicas ?? 1;
    const gen = obj.metadata.generation;
    switch (obj.kind) {
        case "Deployment":
            obj.status = reads < 2
                ? { observedGeneration: gen, replicas: want, updatedReplicas: want, availableReplicas: 0 }
                : { observedGeneration: gen, replicas: want, updatedReplicas: want, availableReplicas: want, readyReplicas: want };
            break;
        case "StatefulSet":
            obj.status = reads < 2
                ? { observedGeneration: gen, replicas: want, readyReplicas: 0, currentRevision: "r1", updateRevision: "r1" }
                : { observedGeneration: gen, replicas: want, readyReplicas: want, currentRevision: "r1", updateRevision: "r1" };
            break;
        case "Job":
            obj.status = reads < 2 ? { active: 1 } : { succeeded: obj.spec?.completions ?? 1, conditions: [{ type: "Complete", status: "True" }] };
            break;
        case "Ingress":
            if (reads >= 1) obj.status = { loadBalancer: { ingress: [{ ip: "203.0.113.9" }] } };
            break;
        case "Service":
            if (obj.spec?.type === "LoadBalancer" && reads >= 2) obj.status = { loadBalancer: { ingress: [{ ip: "203.0.113.7" }] } };
            break;
        case "CustomResourceDefinition":
            obj.status = { conditions: [{ type: "Established", status: reads >= 1 ? "True" : "False" }] };
            break;
    }
}

function object(s: KubeState, req: Request, group: string, version: string): Response {
    const p = req.params;
    const kind = kindOf(s, group, version, p.plural);
    if (!kind) return status(404, "NotFound", `the server could not find the requested resource`);
    const ns = kind.namespaced ? (p.ns ?? "") : "";
    const key = `${kind.plural}/${ns}/${p.name}`;
    const live = s.objects.get(key);

    if (req.method === "PATCH") {
        if (req.headers["Content-Type"] !== "application/apply-patch+yaml") return status(415, "UnsupportedMediaType", "not a server-side apply");
        if (req.query.fieldManager === undefined) return status(422, "Invalid", "fieldManager is required for apply requests");
        const obj = req.json();
        if (obj.kind !== kind.kind || obj.metadata?.name !== p.name) return status(400, "BadRequest", "the object does not match the URL");
        if (kind.namespaced && obj.metadata.namespace !== ns) return status(400, "BadRequest", "the namespace of the object does not match the URL");
        s.managers.push(req.query.fieldManager);
        const merged = live ? { ...live, ...obj, metadata: { ...live.metadata, ...obj.metadata } } : obj;
        merged.metadata.annotations = { ...(live?.metadata?.annotations ?? {}), ...(obj.metadata.annotations ?? {}) };
        merged.metadata.uid = live?.metadata?.uid ?? `uid-${++s.nextUid}`;
        merged.metadata.generation = (live?.metadata?.generation ?? 0) + 1;
        if (kind.kind === "Service") {
            merged.spec = { clusterIP: "10.96.0.10", ...(merged.spec ?? {}) };
            if (merged.spec.type === "NodePort" || merged.spec.type === "LoadBalancer") {
                merged.spec.ports = (merged.spec.ports ?? []).map((p: any, i: number) => ({ nodePort: 30080 + i, ...p }));
            }
        }
        if (kind.kind === "Secret" && merged.stringData) {
            // As the API server does: stringData is written into data.
            const data: Record<string, string> = {};
            for (const [k, v] of Object.entries(merged.stringData)) data[k] = utf8base64(String(v));
            merged.data = data;
            delete merged.stringData;
        }
        delete merged.status;
        s.objects.set(key, merged);
        s.reads.set(key, 0);
        progress(merged, 0);
        if (kind.kind === "CustomResourceDefinition") {
            const sp = obj.spec;
            for (const v of sp.versions ?? []) {
                if (!kindOf(s, sp.group, v.name, sp.names.plural)) {
                    s.kinds.push({ group: sp.group, version: v.name, kind: sp.names.kind, plural: sp.names.plural, namespaced: sp.scope === "Namespaced" });
                }
            }
        }
        return json(200, merged);
    }
    if (!live) return status(404, "NotFound", `${kind.plural} "${p.name}" not found`);
    if (req.method === "GET") {
        const left = s.terminating.get(key);
        if (left !== undefined) {
            if (left <= 1) {
                s.terminating.delete(key);
                s.objects.delete(key);
                return status(404, "NotFound", `${kind.plural} "${p.name}" not found`);
            }
            s.terminating.set(key, left - 1);
        }
        // Only what was applied here comes up; objects a test put in
        // place stay as they are.
        if (s.reads.has(key)) {
            const reads = (s.reads.get(key) ?? 0) + 1;
            s.reads.set(key, reads);
            progress(live, reads);
        }
        return json(200, live);
    }
    if (req.method === "DELETE") {
        // Finalizers keep the object, marked for deletion, until they
        // have released what it stands for.
        const held = finalizer(live);
        if (held) {
            if (!s.terminating.has(key)) {
                live.metadata = { ...live.metadata, deletionTimestamp: "2026-01-01T00:00:00Z", finalizers: [held] };
                s.terminating.set(key, 2);
            }
            return json(200, live);
        }
        s.objects.delete(key);
        if (kind.kind === "CustomResourceDefinition") {
            s.kinds = s.kinds.filter((k) => !(k.group === live.spec.group && k.plural === live.spec.names.plural));
        }
        return json(200, { kind: "Status", apiVersion: "v1", status: "Success" });
    }
    return status(405, "MethodNotAllowed", req.method);
}

/** Lists one object per page, so paging is exercised. */
function list(s: KubeState, req: Request, group: string, version: string): Response {
    const p = req.params;
    const kind = kindOf(s, group, version, p.plural);
    if (!kind) return status(404, "NotFound", `the server could not find the requested resource`);
    const prefix = `${kind.plural}/${kind.namespaced && p.ns ? p.ns + "/" : ""}`;
    const keys = [...s.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = Number(req.query.continue ?? "0");
    const items = keys.slice(start, start + 1).map((k) => {
        const { apiVersion: _a, kind: _k, ...rest } = s.objects.get(k);
        return rest;
    });
    const more = start + 1 < keys.length;
    return json(200, { kind: `${kind.kind}List`, apiVersion: gv(kind), metadata: more ? { continue: String(start + 1) } : {}, items });
}

export const kube = fakeApi<KubeState>(KUBE, () => {
    const st: KubeState = { objects: new Map(), reads: new Map(), kinds: [...BUILTIN], nextUid: 0, managers: [], terminating: new Map() };
    // Two nodes; the first is not ready.
    for (const [name, ip, ready] of [["node-a", "10.0.0.1", "False"], ["node-b", "10.0.0.2", "True"]]) {
        st.objects.set(`nodes//${name}`, {
            apiVersion: "v1", kind: "Node", metadata: { name, uid: `uid-${name}` },
            status: { addresses: [{ type: "InternalIP", address: ip }, { type: "Hostname", address: name }], conditions: [{ type: "Ready", status: ready }] },
        });
    }
    const state = () => st;
    return { state: st, routes: {
        "GET /version": () => json(200, { major: "1", minor: "31", gitVersion: "v1.31.0", platform: "linux/amd64" }),
        "GET /api/v1": () => discovery(state(), "", "v1"),
        "GET /apis": () => {
            const groups = new Map<string, string>();
            for (const k of state().kinds) if (k.group) groups.set(k.group, k.version);
            return json(200, {
                kind: "APIGroupList",
                groups: [...groups].map(([name, version]) => ({ name, preferredVersion: { groupVersion: `${name}/${version}`, version } })),
            });
        },
        "GET /apis/:group/:version": (req) => discovery(state(), req.params.group, req.params.version),

        "* /api/v1/namespaces/:ns/:plural/:name": (req) => object(state(), req, "", "v1"),
        "GET /api/v1/namespaces/:ns/:plural": (req) => list(state(), req, "", "v1"),
        "* /api/v1/:plural/:name": (req) => object(state(), req, "", "v1"),
        "GET /api/v1/:plural": (req) => list(state(), req, "", "v1"),

        "* /apis/:group/:version/namespaces/:ns/:plural/:name": (req) => object(state(), req, req.params.group, req.params.version),
        "GET /apis/:group/:version/namespaces/:ns/:plural": (req) => list(state(), req, req.params.group, req.params.version),
        "* /apis/:group/:version/:plural/:name": (req) => object(state(), req, req.params.group, req.params.version),
        "GET /apis/:group/:version/:plural": (req) => list(state(), req, req.params.group, req.params.version),
    } };
});
