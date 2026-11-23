// Tests for k8s/branch, run by `monk entity test src/k8s`: a namespace with
// a StatefulSet on a PD CSI volume is branched on the fake API server in
// fake-kube.ts, with a fake of Compute Engine's disks.
import { test, expect, Test, fakeApi, json, Request } from "monk/test";
import { Branch } from "../branch.ts";
import { copyOf, rewriteHosts, diskName, isolationPolicy } from "../branch-copy.ts";
import { kube, KUBE } from "./fake-kube.ts";

const GCE = "https://compute.googleapis.com";
const ZONE = "europe-west1-b";
const HANDLE = (d: string) => `projects/test-project/zones/${ZONE}/disks/${d}`;

interface Disks {
    disks: Map<string, any>;
    inserts: any[];
    deletes: string[];
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
                st.disks.set(body.name, { name: body.name, status: "CREATING", sourceDisk: body.sourceDisk, labels: body.labels, reads: 0 });
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
                return json(200, { name: d.name, status: d.status, sourceDisk: d.sourceDisk, labels: d.labels });
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

    expect(b.state.objects).toEqual([
        "Secret/db", "ConfigMap/app", "Service/cassandra", "Service/web", "StatefulSet/cassandra", "Deployment/loadgen",
    ]);
    expect(b.state.ready_seconds !== undefined).toBe(true);

    b.delete();
    b.waitDeleted();
    expect(api.state.objects.has("namespaces//br-1")).toBe(false);
    expect(api.state.objects.has("persistentvolumes//br-1-data-cassandra-0")).toBe(false);
    expect(disks.state.deletes.sort()).toEqual(["br-1-data-cassandra-0", "br-1-data-cassandra-1"]);
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
});

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
    expect(diskName("br-1", "data-cassandra-0")).toBe("br-1-data-cassandra-0");
    const long = diskName("a-very-long-branch-namespace-name-for-testing", "data-some-statefulset-with-a-long-name-0");
    expect(long.length < 64).toBe(true);
    expect(long).not.toBe(diskName("a-very-long-branch-namespace-name-for-testing", "data-some-statefulset-with-a-long-name-1"));
});
