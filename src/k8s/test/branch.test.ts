// Tests for k8s/branch, run by `monk entity test src/k8s`: a namespace with
// a StatefulSet on a PD CSI volume is branched on the fake API server in
// fake-kube.ts, with a fake of Compute Engine's disks.
import { test, expect, Test, fakeApi, json, Request } from "monk/test";
import { Branch } from "../branch.ts";
import { copyOf, rewriteHosts, diskName, isolationPolicy, exposurePolicy, claimsOf, fromManifest } from "../branch-copy.ts";
import { kube, KUBE } from "./fake-kube.ts";

const GCE = "https://compute.googleapis.com";
const ZONE = "europe-west1-b";
const HANDLE = (d: string) => `projects/test-project/zones/${ZONE}/disks/${d}`;

interface Disks {
    disks: Map<string, any>;
    inserts: any[];
    deletes: string[];
}

/** A disk as Compute Engine shows it. */
function view(d: any): any {
    return { name: d.name, status: d.status, sourceDisk: d.sourceDisk, labels: d.labels, zone: d.zone, labelFingerprint: d.labelFingerprint };
}

/** Compute Engine disks: an insert is READY after a read; a delete is gone after one. */
const gce = fakeApi<Disks>(GCE, () => {
    const st: Disks = { disks: new Map(), inserts: [], deletes: [] };
    const gone = new Set<string>();
    return {
        state: st,
        routes: {
            "POST /compute/v1/projects/:p/zones/:z/disks": (req: Request) => {
                const body = req.json();
                if (st.disks.has(body.name)) return json(409, { error: { code: 409, message: "already exists" } });
                st.inserts.push(body);
                st.disks.set(body.name, {
                    name: body.name, status: "CREATING", sourceDisk: body.sourceDisk, labels: body.labels, reads: 0,
                    zone: `https://www.googleapis.com/compute/v1/projects/${req.params.p}/zones/${req.params.z}`, labelFingerprint: "fp0",
                });
                return json(200, { kind: "compute#operation", status: "RUNNING" });
            },
            "GET /compute/v1/projects/:p/zones/:z/disks/:d": (req: Request) => {
                const d = st.disks.get(req.params.d);
                if (!d) return json(404, { error: { code: 404, message: "not found" } });
                if (gone.has(d.name)) {
                    st.disks.delete(d.name);
                    return json(404, { error: { code: 404, message: "not found" } });
                }
                d.reads++;
                if (d.status === "CREATING" && d.reads >= 2) d.status = "READY";
                return json(200, view(d));
            },
            // Lists by the one kind of filter the branch uses: labels.<key> = "<value>".
            "GET /compute/v1/projects/:p/aggregated/disks": (req: Request) => {
                const m = /labels\.([a-z0-9_-]+) = "([^"]+)"/.exec(req.query.filter ?? "");
                const byZone: Record<string, any> = {};
                for (const d of st.disks.values()) {
                    if (gone.has(d.name) || (m && d.labels?.[m[1]] !== m[2])) continue;
                    const z = `zones/${String(d.zone).split("/").pop()}`;
                    (byZone[z] ??= { disks: [] }).disks.push(view(d));
                }
                return json(200, { items: byZone });
            },
            "POST /compute/v1/projects/:p/zones/:z/disks/:d/setLabels": (req: Request) => {
                const d = st.disks.get(req.params.d);
                if (!d) return json(404, { error: { code: 404, message: "not found" } });
                const body = req.json();
                if (body.labelFingerprint !== d.labelFingerprint) return json(412, { error: { code: 412, message: "fingerprint" } });
                d.labels = body.labels;
                d.labelFingerprint = d.labelFingerprint + "x";
                return json(200, { kind: "compute#operation", status: "RUNNING" });
            },
            "DELETE /compute/v1/projects/:p/zones/:z/disks/:d": (req: Request) => {
                const d = st.disks.get(req.params.d);
                if (!d) return json(404, { error: { code: 404, message: "not found" } });
                st.deletes.push(d.name);
                d.status = "DELETING";
                gone.add(d.name);
                return json(200, { kind: "compute#operation", status: "RUNNING" });
            },
        },
    };
});

/** A namespace "prod" as kubectl would have left it: Cassandra on PD CSI, a writer, an app behind a load balancer. */
function seedProd(objects: Map<string, any>) {
    const put = (key: string, o: any) => objects.set(key, o);
    put("namespaces//prod", { apiVersion: "v1", kind: "Namespace", metadata: { name: "prod", uid: "ns-prod" } });
    for (const i of [0, 1]) {
        put(`persistentvolumes//pvc-${i}`, {
            apiVersion: "v1", kind: "PersistentVolume",
            metadata: { name: `pvc-${i}`, uid: `pv-${i}` },
            spec: { capacity: { storage: "30Gi" }, csi: { driver: "pd.csi.storage.gke.io", volumeHandle: HANDLE(`pvc-${i}`), fsType: "ext4" } },
        });
        put(`persistentvolumeclaims/prod/data-cassandra-${i}`, {
            apiVersion: "v1", kind: "PersistentVolumeClaim",
            metadata: { name: `data-cassandra-${i}`, namespace: "prod", uid: `pvc-uid-${i}` },
            spec: { accessModes: ["ReadWriteOnce"], storageClassName: "premium-rwo", volumeName: `pvc-${i}`, resources: { requests: { storage: "30Gi" } } },
            status: { phase: "Bound", capacity: { storage: "30Gi" } },
        });
    }
    put("statefulsets/prod/cassandra", {
        apiVersion: "apps/v1", kind: "StatefulSet",
        metadata: { name: "cassandra", namespace: "prod", uid: "sts", resourceVersion: "77", generation: 3, annotations: { "kubectl.kubernetes.io/last-applied-configuration": "{}" } },
        spec: {
            replicas: 2, serviceName: "cassandra",
            selector: { matchLabels: { app: "cassandra" } },
            template: {
                metadata: { labels: { app: "cassandra" } },
                spec: { containers: [{ name: "cassandra", image: "cassandra:5.0.9", env: [{ name: "CASSANDRA_SEEDS", value: "cassandra-0.cassandra.prod.svc.cluster.local" }] }] },
            },
            volumeClaimTemplates: [{ metadata: { name: "data", creationTimestamp: null }, spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "30Gi" } } }, status: { phase: "Pending" } }],
        },
        status: { replicas: 2, readyReplicas: 2 },
    });
    put("deployments/prod/loadgen", {
        apiVersion: "apps/v1", kind: "Deployment",
        metadata: { name: "loadgen", namespace: "prod", uid: "dep" },
        spec: { replicas: 1, selector: { matchLabels: { app: "loadgen" } }, template: { metadata: { labels: { app: "loadgen" } }, spec: { containers: [{ name: "l", image: "cassandra:5.0.9" }] } } },
    });
    put("services/prod/cassandra", {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "cassandra", namespace: "prod", uid: "svc-c" },
        spec: { clusterIP: "None", clusterIPs: ["None"], selector: { app: "cassandra" }, ports: [{ port: 9042 }] },
    });
    put("services/prod/web", {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "web", namespace: "prod", uid: "svc-w" },
        spec: { type: "LoadBalancer", clusterIP: "10.96.3.3", clusterIPs: ["10.96.3.3"], externalTrafficPolicy: "Cluster", selector: { app: "web" }, ports: [{ port: 80, nodePort: 31111 }] },
        status: { loadBalancer: { ingress: [{ ip: "203.0.113.1" }] } },
    });
    put("configmaps/prod/app", { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "app", namespace: "prod", uid: "cm" }, data: { DB: "cassandra.prod.svc:9042" } });
    put("configmaps/prod/kube-root-ca.crt", { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "kube-root-ca.crt", namespace: "prod" }, data: { "ca.crt": "x" } });
    put("secrets/prod/db", { apiVersion: "v1", kind: "Secret", metadata: { name: "db", namespace: "prod", uid: "sec" }, type: "Opaque", data: { password: btoa("hunter2"), url: btoa("cql://cassandra.prod.svc:9042") } });
    put("roles/prod/reader", { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", metadata: { name: "reader", namespace: "prod" }, rules: [{ apiGroups: [""], resources: ["configmaps"], verbs: ["get"] }] });
    put("rolebindings/prod/reader", {
        apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding", metadata: { name: "reader", namespace: "prod" },
        roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "Role", name: "reader" },
        subjects: [{ kind: "ServiceAccount", name: "app", namespace: "prod" }, { kind: "ServiceAccount", name: "ci", namespace: "tools" }, { kind: "User", name: "jane" }],
    });
    put("secrets/prod/tok", { apiVersion: "v1", kind: "Secret", metadata: { name: "tok", namespace: "prod" }, type: "kubernetes.io/service-account-token", data: {} });
}

function branch(t: Test, extra: Record<string, unknown> = {}) {
    t.provider("gcp", { type: "service_account", project_id: "test-project", client_email: "t@test-project.iam.gserviceaccount.com", private_key: "unused" });
    const b = t.entity(Branch, { server: KUBE, token_secret: "kube-token", source_namespace: "prod", namespace: "br-1", ...extra });
    b.secret("kube-token", "test-token");
    return b;
}

test("a namespace is branched: disks cloned, claims bound to them, objects copied, the branch sealed off", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t, { replicas: { loadgen: 0 } });

    b.create();
    expect(b.state.claims?.map((c) => `${c.claim} ${c.source_disk} -> ${c.disk}`)).toEqual([
        `data-cassandra-0 ${HANDLE("pvc-0")} -> br-1-data-cassandra-0`,
        `data-cassandra-1 ${HANDLE("pvc-1")} -> br-1-data-cassandra-1`,
    ]);
    expect(disks.state.inserts.map((d) => d.sourceDisk)).toEqual([HANDLE("pvc-0"), HANDLE("pvc-1")]);
    expect(api.state.objects.get("networkpolicies/br-1/monk-branch-isolation")?.spec.policyTypes).toEqual(["Ingress", "Egress"]);
    // Nothing is copied before the disks are ready.
    expect(api.state.objects.has("statefulsets/br-1/cassandra")).toBe(false);

    b.waitReady();

    const pv = api.state.objects.get("persistentvolumes//br-1-data-cassandra-0");
    expect(pv.spec.csi.volumeHandle).toBe(HANDLE("br-1-data-cassandra-0"));
    expect(pv.spec.claimRef).toEqual({ namespace: "br-1", name: "data-cassandra-0" });
    expect(pv.spec.persistentVolumeReclaimPolicy).toBe("Retain");
    const pvc = api.state.objects.get("persistentvolumeclaims/br-1/data-cassandra-0");
    expect(pvc.spec.volumeName).toBe("br-1-data-cassandra-0");
    expect(pvc.spec.storageClassName).toBe("premium-rwo");

    const sts = api.state.objects.get("statefulsets/br-1/cassandra");
    expect(sts.spec.template.spec.containers[0].env[0].value).toBe("cassandra-0.cassandra.br-1.svc.cluster.local");
    expect(sts.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"]).toBeUndefined();
    expect(sts.metadata.annotations["monk.io/branch-of"]).toBe("prod");
    expect(sts.metadata.uid).not.toBe("sts");
    expect(api.state.objects.get("deployments/br-1/loadgen").spec.replicas).toBe(0);
    expect(api.state.objects.get("services/br-1/cassandra").spec.clusterIP).toBe("None");
    const web = api.state.objects.get("services/br-1/web");
    expect(web.spec.type).toBe("ClusterIP");
    expect(web.spec.clusterIP).toBe("10.96.0.10"); // the fake's, not prod's
    expect(web.spec.ports[0].nodePort).toBeUndefined();
    expect(api.state.objects.get("configmaps/br-1/app").data.DB).toBe("cassandra.br-1.svc:9042");
    expect(api.state.objects.has("configmaps/br-1/kube-root-ca.crt")).toBe(false);
    expect(atob(api.state.objects.get("secrets/br-1/db").data.url)).toBe("cql://cassandra.br-1.svc:9042");
    expect(atob(api.state.objects.get("secrets/br-1/db").data.password)).toBe("hunter2");
    expect(api.state.objects.has("secrets/br-1/tok")).toBe(false);

    // The source is only read.
    expect(api.state.objects.get("statefulsets/prod/cassandra").metadata.resourceVersion).toBe("77");
    expect(api.state.objects.get("services/prod/web").spec.type).toBe("LoadBalancer");

    const rb = api.state.objects.get("rolebindings/br-1/reader");
    expect(rb.subjects).toEqual([
        { kind: "ServiceAccount", name: "app", namespace: "br-1" },
        { kind: "ServiceAccount", name: "ci", namespace: "tools" },
        { kind: "User", name: "jane" },
    ]);
    expect(api.state.objects.get("roles/br-1/reader").rules[0].verbs).toEqual(["get"]);

    expect(b.state.objects).toEqual([
        "Role/reader", "RoleBinding/reader", "Secret/db", "ConfigMap/app", "Service/cassandra", "Service/web", "StatefulSet/cassandra", "Deployment/loadgen",
    ]);
    expect(b.state.ready_seconds !== undefined).toBe(true);

    b.delete();
    b.waitDeleted();
    expect(api.state.objects.has("namespaces//br-1")).toBe(false);
    expect(api.state.objects.has("persistentvolumes//br-1-data-cassandra-0")).toBe(false);
    // A DELETE whose answer was lost is sent again; that is harmless.
    expect([...new Set(disks.state.deletes)].sort()).toEqual(["br-1-data-cassandra-0", "br-1-data-cassandra-1"]);
    // Prod's disks and volumes stay.
    expect(api.state.objects.has("persistentvolumes//pvc-0")).toBe(true);
});

test("a before_clone Job runs in the source first, and the disks wait for it", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t, { before_clone: { image: "cassandra:5.0.9", command: ["nodetool", "flush"] } });
    b.create();
    expect(b.state.before_clone_job).toBe("br-1-before-clone");
    expect(api.state.objects.get("jobs/prod/br-1-before-clone").spec.template.spec.containers[0].command).toEqual(["nodetool", "flush"]);
    expect(disks.state.inserts).toEqual([]);
    b.waitReady();
    expect(disks.state.inserts.length).toBe(2);
}, { explore: false }); // same requests as the lifecycle test, which is explored

test("disks an earlier run kept are not reused: the branch made again refuses them", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t, { keep_disks: true });
    b.create();
    b.waitReady();
    b.delete();
    b.waitDeleted();
    expect(disks.state.disks.size).toBe(2);
    expect(disks.state.deletes).toEqual([]);
    // Made again in the same namespace: the kept disks are an earlier run's.
    expect([...disks.state.disks.values()].every((d) => d.labels["monk-kept"] === "true")).toBe(true);
    expect(() => b.create()).toThrow("was kept when this branch was deleted before");
}, { explore: false }); // same requests as the lifecycle test, which is explored

test("a disk of the clone's name that another branch made is neither used nor deleted", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    // Another cluster's branch into a namespace of the same name.
    disks.state.disks.set("br-1-data-cassandra-0", {
        name: "br-1-data-cassandra-0", status: "READY", sourceDisk: HANDLE("pvc-0"),
        labels: { "monk-branch-owner": "someone-else", "monk-run": "x" }, reads: 0,
    });
    const b = branch(t);
    expect(() => b.create()).toThrow("was not made by this branch");
    // Refused before anything was written.
    expect(api.state.objects.has("namespaces//br-1")).toBe(false);
    expect(disks.state.inserts).toEqual([]);

    // And a branch whose disk is taken over afterwards leaves it on delete.
    disks.state.disks.delete("br-1-data-cassandra-0");
    const c = branch(t);
    c.create();
    c.waitReady();
    disks.state.disks.get("br-1-data-cassandra-0").labels["monk-branch-owner"] = "someone-else";
    c.delete();
    c.waitDeleted();
    expect([...new Set(disks.state.deletes)]).toEqual(["br-1-data-cassandra-1"]);
    expect(c.output.join("\n")).toContain("leaving disk br-1-data-cassandra-0");
}, { explore: false }); // same requests as the lifecycle test, which is explored

test("a branch deletes its clones after GKE copied the cluster's monk-owner label onto them", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t);
    b.create();
    b.waitReady();
    // GKE's hourly sync of the cluster's resource labels onto the disks attached to its nodes.
    for (const d of disks.state.disks.values()) {
        d.labels = { ...d.labels, "monk-owner": "the-cluster", "monk-experiment": "x" };
    }
    b.delete();
    b.waitDeleted();
    expect([...new Set(disks.state.deletes)].sort()).toEqual(["br-1-data-cassandra-0", "br-1-data-cassandra-1"]);
}, { explore: false }); // same requests as the lifecycle test, which is explored

test("a branch deletes clones made before the owner label's rename, which carry only monk-owner", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t);
    b.create();
    b.waitReady();
    // As an earlier version labelled them.
    for (const d of disks.state.disks.values()) {
        const { "monk-branch-owner": owner, ...rest } = d.labels;
        d.labels = { ...rest, "monk-owner": owner };
    }
    b.delete();
    b.waitDeleted();
    expect([...new Set(disks.state.deletes)].sort()).toEqual(["br-1-data-cassandra-0", "br-1-data-cassandra-1"]);
}, { explore: false }); // same requests as the lifecycle test, which is explored

/** Fails the second disk insert after it went through, as when its answer is lost. */
function loseSecondInsert(t: Test) {
    let posts = 0;
    t.http.use(`POST ${GCE}/compute/v1/projects/:p/zones/:z/disks`, (req, next) => {
        posts++;
        const r = next();
        if (posts === 2) return json(500, { error: { code: 500, message: "backend error" } });
        return r;
    });
}

test("a branch whose create failed after cloning runs again on its own clones", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    loseSecondInsert(t);
    const b = branch(t);
    expect(() => b.create()).toThrow();
    b.create();
    b.waitReady();
    expect(disks.state.inserts.length).toBe(2);
    expect(api.state.objects.get("persistentvolumeclaims/br-1/data-cassandra-1").spec.volumeName).toBe("br-1-data-cassandra-1");
}, { explore: false }); // the test makes its own fault; exploration covers lost inserts elsewhere

test("deleting a branch whose create failed after cloning deletes its clones", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    loseSecondInsert(t);
    const b = branch(t);
    expect(() => b.create()).toThrow();
    b.delete();
    b.waitDeleted();
    expect([...new Set(disks.state.deletes)].sort()).toEqual(["br-1-data-cassandra-0", "br-1-data-cassandra-1"]);
    expect(api.state.objects.has("namespaces//br-1")).toBe(false);
}, { explore: false }); // the test makes its own fault; exploration covers lost inserts elsewhere

test("other_claims: empty gives a claim that can't be cloned a new, empty one", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    api.state.objects.set("persistentvolumes//nfs-1", {
        apiVersion: "v1", kind: "PersistentVolume", metadata: { name: "nfs-1" },
        spec: { capacity: { storage: "1Ti" }, nfs: { server: "10.0.0.9", path: "/share" } },
    });
    api.state.objects.set("persistentvolumeclaims/prod/shared", {
        apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: "shared", namespace: "prod" },
        spec: { accessModes: ["ReadWriteMany"], storageClassName: "filestore", volumeName: "nfs-1", resources: { requests: { storage: "1Ti" } } },
        status: { phase: "Bound" },
    });
    expect(() => branch(t).create()).toThrow("other_claims: empty");
    const b = branch(t, { other_claims: "empty" });
    b.create();
    b.waitReady();
    const claim = api.state.objects.get("persistentvolumeclaims/br-1/shared");
    expect(claim.spec.volumeName).toBeUndefined();
    expect(claim.spec.storageClassName).toBe("filestore");
    expect(disks.state.inserts.length).toBe(2);
}, { explore: false }); // same requests as the lifecycle test, which is explored

test("a namespace that isn't the branch's is refused", (t) => {
    const api = t.use(kube);
    t.use(gce);
    seedProd(api.state.objects);
    api.state.objects.set("namespaces//br-1", { apiVersion: "v1", kind: "Namespace", metadata: { name: "br-1", uid: "x" } });
    const b = branch(t);
    expect(() => b.create()).toThrow("not this branch's");
});

test("a volume that is not a PD CSI volume is refused", (t) => {
    const api = t.use(kube);
    t.use(gce);
    seedProd(api.state.objects);
    api.state.objects.get("persistentvolumes//pvc-1").spec.csi.driver = "ebs.csi.aws.com";
    const b = branch(t);
    expect(() => b.create()).toThrow("not a GCE Persistent Disk");
});

test("copies: hosts rewritten only in .svc names, isolation, disk names", (t) => {
    expect(rewriteHosts({ a: ["x.prod.svc", "prod", "x.prod", "x.prod.svc.cluster.local:1"] }, "prod", "b")).toEqual({
        a: ["x.b.svc", "prod", "x.prod", "x.b.svc.cluster.local:1"],
    });
    const exposed = copyOf(
        { apiVersion: "v1", kind: "Service", metadata: { name: "w" }, spec: { type: "LoadBalancer", ports: [{ port: 80, nodePort: 3 }] } },
        { source: "prod", target: "b", annotations: {}, expose: true },
    );
    expect(exposed.spec.type).toBe("LoadBalancer");
    expect(exposed.spec.ports[0].nodePort).toBeUndefined();
    expect(copyOf({ apiVersion: "v1", kind: "ConfigMap", metadata: { name: "x", ownerReferences: [{ uid: "u" }] } }, { source: "a", target: "b", annotations: {} })).toBeUndefined();
    const pol = isolationPolicy("b", {}, ["10.0.0.0/8"]);
    expect(pol.spec.egress[2].to[0].ipBlock.cidr).toBe("10.0.0.0/8");
    const open = exposurePolicy({ ...exposed, spec: { ...exposed.spec, selector: { app: "w" }, ports: [{ port: 80, targetPort: 8080 }] } }, "b", {});
    expect(open.metadata.name).toBe("monk-branch-expose-w");
    expect(open.spec.podSelector.matchLabels).toEqual({ app: "w" });
    expect(open.spec.ingress[0].from[0].ipBlock.cidr).toBe("0.0.0.0/0");
    expect(open.spec.ingress[0].ports).toEqual([{ protocol: "TCP", port: 8080 }]);
    expect(exposurePolicy({ kind: "Service", metadata: { name: "c" }, spec: { type: "ClusterIP", selector: { app: "c" } } }, "b", {})).toBeUndefined();
    expect(exposurePolicy({ kind: "Service", metadata: { name: "e" }, spec: { type: "LoadBalancer" } }, "b", {})).toBeUndefined();
    const sd = copyOf({ apiVersion: "v1", kind: "Secret", metadata: { name: "pg" }, type: "Opaque", stringData: { url: "postgres://a@db.prod.svc:5432/x", password: "p" } },
        { source: "prod", target: "b", annotations: {} });
    expect(sd.stringData).toEqual({ url: "postgres://a@db.b.svc:5432/x", password: "p" });
    expect(diskName("br-1", "data-cassandra-0")).toBe("br-1-data-cassandra-0");
    const long = diskName("a-very-long-branch-namespace-name-for-testing", "data-some-statefulset-with-a-long-name-0");
    expect(long.length < 64).toBe(true);
    expect(long).not.toBe(diskName("a-very-long-branch-namespace-name-for-testing", "data-some-statefulset-with-a-long-name-1"));
});

/** What `helm template app chart -n br-1` gives: prod's Cassandra, a new Postgres, a web app, and what a branch leaves out. */
function rendered(webImage: string): string {
    return `
apiVersion: v1
kind: Namespace
metadata:
  name: br-1
---
apiVersion: v1
kind: Secret
metadata:
  name: postgres
type: Opaque
stringData:
  password: hunter2
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: LoadBalancer
  selector: {app: web}
  ports: [{port: 80, targetPort: 8080}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  selector: {matchLabels: {app: web}}
  template:
    metadata: {labels: {app: web}}
    spec:
      imagePullSecrets: [{name: ghcr}]
      containers: [{name: web, image: "${webImage}"}]
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: cassandra
spec:
  replicas: 2
  serviceName: cassandra
  selector: {matchLabels: {app: cassandra}}
  template:
    metadata: {labels: {app: cassandra}}
    spec:
      containers: [{name: cassandra, image: "cassandra:5.0.9", env: [{name: CASSANDRA_SEEDS, value: cassandra-0.cassandra}]}]
  volumeClaimTemplates:
    - metadata: {name: data}
      spec: {accessModes: [ReadWriteOnce], resources: {requests: {storage: 30Gi}}}
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  replicas: 1
  serviceName: postgres
  selector: {matchLabels: {app: postgres}}
  template:
    metadata: {labels: {app: postgres}}
    spec:
      containers: [{name: postgres, image: "postgres:17.5-alpine"}]
  volumeClaimTemplates:
    - metadata: {name: data}
      spec: {accessModes: [ReadWriteOnce], resources: {requests: {storage: 5Gi}}}
---
apiVersion: v1
kind: Pod
metadata:
  name: web-test
  annotations:
    helm.sh/hook: test
spec:
  containers: [{name: t, image: busybox}]
`;
}

test("a branch from a manifest clones the volumes it claims and applies its objects, not the source's", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    api.state.objects.set("secrets/prod/ghcr", { apiVersion: "v1", kind: "Secret", metadata: { name: "ghcr", namespace: "prod" }, type: "kubernetes.io/dockerconfigjson", data: { ".dockerconfigjson": btoa("{}") } });
    const b = branch(t, { manifest: rendered("ghcr.io/x/web:v2"), copy_secrets: ["ghcr"] });

    b.create();
    // Prod's two Cassandra claims are cloned; the new Postgres claim is not in prod.
    expect(b.state.claims?.map((c) => c.claim)).toEqual(["data-cassandra-0", "data-cassandra-1"]);
    expect(b.output.join("\n")).toMatch(/claim data-postgres-0: not in prod; the branch's starts empty/);
    b.waitReady();

    expect(api.state.objects.get("deployments/br-1/web").spec.template.spec.containers[0].image).toBe("ghcr.io/x/web:v2");
    expect(api.state.objects.get("services/br-1/web").spec.type).toBe("ClusterIP");
    expect(api.state.objects.get("statefulsets/br-1/cassandra").metadata.annotations["monk.io/branch-of"]).toBe("prod");
    expect(api.state.objects.get("persistentvolumeclaims/br-1/data-cassandra-0").spec.volumeName).toBe("br-1-data-cassandra-0");
    expect(api.state.objects.get("secrets/br-1/ghcr").type).toBe("kubernetes.io/dockerconfigjson");
    // Not the source's objects: prod's loadgen and its db Secret stay behind.
    expect(api.state.objects.has("deployments/br-1/loadgen")).toBe(false);
    expect(api.state.objects.has("secrets/br-1/db")).toBe(false);
    expect(api.state.objects.has("pods/br-1/web-test")).toBe(false);
    expect(b.state.objects).toEqual([
        "Secret/ghcr", "Secret/postgres", "Service/web", "StatefulSet/cassandra", "StatefulSet/postgres", "Deployment/web",
    ]);
    expect(b.state.manifest_hash !== undefined).toBe(true);
    expect(disks.state.inserts.length).toBe(2);
});

test("copy_secrets naming a Secret a branch doesn't copy is an error, not a silent skip", (t) => {
    const api = t.use(kube);
    t.use(gce);
    seedProd(api.state.objects);
    api.state.objects.set("secrets/prod/sa", { apiVersion: "v1", kind: "Secret", metadata: { name: "sa", namespace: "prod" }, type: "kubernetes.io/service-account-token", data: {} });
    const b = branch(t, { manifest: rendered("ghcr.io/x/web:v2"), copy_secrets: ["sa"] });
    expect(() => {
        b.create();
        b.waitReady();
    }).toThrow(/copy_secrets: Secret sa in prod is of type kubernetes.io\/service-account-token/);
});

test("a new manifest is applied in place, on the same clones", (t) => {
    const api = t.use(kube);
    const disks = t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t, { manifest: rendered("ghcr.io/x/web:v2") });
    b.create();
    b.waitReady();
    const first = b.state.manifest_hash;

    b.redefine({ ...b.definition, manifest: rendered("ghcr.io/x/web:v3") });
    b.update();
    b.waitReady();
    expect(api.state.objects.get("deployments/br-1/web").spec.template.spec.containers[0].image).toBe("ghcr.io/x/web:v3");
    expect(b.state.manifest_hash !== first).toBe(true);
    // Cloned once.
    expect(disks.state.inserts.length).toBe(2);
}, { explore: false }); // the lifecycle above is explored

/** A migration Job, as charts render one, running image. */
function migration(image: string): string {
    return `---
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate
  annotations: {helm.sh/hook: "pre-install,pre-upgrade", helm.sh/hook-delete-policy: before-hook-creation}
spec:
  template:
    spec:
      restartPolicy: Never
      containers: [{name: migrate, image: "${image}"}]
`;
}

test("a new manifest whose Job changed replaces the Job, whose template can't be changed in place", (t) => {
    const api = t.use(kube);
    t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t, { manifest: rendered("ghcr.io/x/web:v2") + migration("ghcr.io/x/web:v2") });
    b.create();
    b.waitReady();
    const uid = api.state.objects.get("jobs/br-1/migrate").metadata.uid;

    // The same Job again is applied over the one there.
    b.redefine({ ...b.definition, manifest: rendered("ghcr.io/x/web:v2") + migration("ghcr.io/x/web:v2"), replicas: { web: 2 } });
    b.update();
    b.waitReady();
    expect(api.state.objects.get("jobs/br-1/migrate").metadata.uid).toBe(uid);

    b.redefine({ ...b.definition, manifest: rendered("ghcr.io/x/web:v3") + migration("ghcr.io/x/web:v3") });
    b.update();
    b.waitReady();
    const job = api.state.objects.get("jobs/br-1/migrate");
    expect(job.spec.template.spec.containers[0].image).toBe("ghcr.io/x/web:v3");
    expect(job.metadata.uid !== uid).toBe(true);
}, { explore: false }); // the lifecycle is explored

test("a manifest branch applies again when replicas, expose or copy_secrets change, not only the manifest", (t) => {
    const api = t.use(kube);
    t.use(gce);
    seedProd(api.state.objects);
    const b = branch(t, { manifest: rendered("ghcr.io/x/web:v2") });
    b.create();
    b.waitReady();
    const first = b.state.manifest_hash;

    b.redefine({ ...b.definition, replicas: { web: 3 }, expose: true });
    b.update();
    b.waitReady();
    expect(api.state.objects.get("deployments/br-1/web").spec.replicas).toBe(3);
    expect(api.state.objects.get("services/br-1/web").spec.type).toBe("LoadBalancer");
    expect(b.state.manifest_hash !== first).toBe(true);
}, { explore: false }); // the lifecycle is explored

test("a manifest's claims: its PVCs, and each StatefulSet pod's, with replicas overridden", () => {
    const objs = [
        { kind: "PersistentVolumeClaim", metadata: { name: "uploads" } },
        { kind: "StatefulSet", metadata: { name: "db" }, spec: { replicas: 3, volumeClaimTemplates: [{ metadata: { name: "data" } }, { metadata: { name: "wal" } }] } },
        { kind: "StatefulSet", metadata: { name: "cache" }, spec: { volumeClaimTemplates: [{ metadata: { name: "data" } }] } },
    ];
    expect(claimsOf(objs)).toEqual(["uploads", "data-db-0", "data-db-1", "data-db-2", "wal-db-0", "wal-db-1", "wal-db-2", "data-cache-0"]);
    expect(claimsOf(objs, { db: 1 })).toEqual(["uploads", "data-db-0", "wal-db-0", "data-cache-0"]);
    const m = fromManifest([
        { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: "uploads" }, spec: {} },
        { apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata: { name: "web", namespace: "prod" }, spec: { rules: [] } },
        { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "app" }, data: { a: "b" } },
        { apiVersion: "v1", kind: "Namespace", metadata: { name: "br-1" } },
        { apiVersion: "v1", kind: "Pod", metadata: { name: "t", annotations: { "helm.sh/hook": "pre-install, test-success" } } },
    ], { source: "prod", target: "br-1", annotations: { "monk.io/owner": "x" } }, ["uploads"]);
    expect(m.left).toEqual([
        "PersistentVolumeClaim/uploads: bound to a clone by the branch",
        "Ingress/web: routes outside traffic in, and the branch isn't exposed",
        "Namespace/br-1: cluster-scoped",
        "Pod/t: a Helm test hook",
    ]);
    expect(m.apply.map((o) => `${o.kind}/${o.metadata.namespace}`)).toEqual(["ConfigMap/br-1"]);
});

test("a manifest's network policies stay out of an isolated branch, and its routes out of one that isn't exposed", () => {
    const objs = [
        // As Bitnami charts render by default: egress anywhere.
        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", metadata: { name: "postgres" }, spec: { podSelector: {}, policyTypes: ["Egress"], egress: [{}] } },
        { apiVersion: "cilium.io/v2", kind: "CiliumNetworkPolicy", metadata: { name: "c" }, spec: {} },
        { apiVersion: "crd.projectcalico.org/v1", kind: "NetworkPolicy", metadata: { name: "k" }, spec: {} },
        { apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata: { name: "web" }, spec: { rules: [{ host: "app.example.com" }] } },
        { apiVersion: "gateway.networking.k8s.io/v1", kind: "HTTPRoute", metadata: { name: "web" }, spec: { hostnames: ["app.example.com"] } },
        { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "app" }, data: {} },
    ];
    const o = { source: "br-1", target: "br-1", annotations: {} };
    const kept = (opts: any) => fromManifest(objs, { ...o, ...opts }).apply.map((x) => `${x.kind}/${x.metadata.name}`);
    expect(kept({})).toEqual(["ConfigMap/app"]);
    expect(fromManifest(objs, o).left).toEqual([
        "NetworkPolicy/postgres: a network policy, which could undo the branch's isolation",
        "CiliumNetworkPolicy/c: a network policy, which could undo the branch's isolation",
        "NetworkPolicy/k: a network policy, which could undo the branch's isolation",
        "Ingress/web: routes outside traffic in, and the branch isn't exposed",
        "HTTPRoute/web: routes outside traffic in, and the branch isn't exposed",
    ]);
    expect(kept({ expose: true })).toEqual(["ConfigMap/app", "Ingress/web", "HTTPRoute/web"]);
    expect(kept({ isolate: false })).toEqual(["ConfigMap/app", "NetworkPolicy/postgres", "CiliumNetworkPolicy/c", "NetworkPolicy/k"]);
});
