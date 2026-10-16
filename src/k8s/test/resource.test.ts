// Tests for k8s/resource and k8s/cluster, run by `monk entity test src/k8s`,
// against the fake API server in fake-kube.ts. k8s.e2e.ts runs the same
// entities on a real cluster.
import { test, expect, Test } from "monk/test";
import { Resource, OWNER } from "../resource.ts";
import { Cluster } from "../cluster.ts";
import { Lookup } from "../lookup.ts";
import { kube, KUBE, stored } from "./fake-kube.ts";

const APP = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
spec:
  replicas: 2
  selector: {matchLabels: {app: web}}
  template:
    metadata: {labels: {app: web}}
    spec: {containers: [{name: web, image: nginx}]}
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: shop
spec:
  type: LoadBalancer
  selector: {app: web}
  ports: [{port: 80}]
---
apiVersion: v1
kind: Namespace
metadata:
  name: shop
`;

/** A k8s/resource on the fake cluster, reached with a token. */
function resource(t: Test, manifest: string, extra: Record<string, unknown> = {}) {
    const r = t.entity(Resource, { server: KUBE, token_secret: "kube-token", manifest, ...extra });
    r.secret("kube-token", "test-token");
    return r;
}

test("a manifest is applied, becomes ready, and is deleted", (t) => {
    const api = t.use(kube);
    const r = resource(t, APP);
    r.create();
    // The namespace first, whatever the manifest's order.
    expect(r.state.objects?.map((o) => `${o.kind} ${o.namespace ?? ""}/${o.name}`)).toEqual([
        "Namespace /shop", "Deployment shop/web", "Service shop/web",
    ]);
    expect(r.state.cluster_ip).toBe("10.96.0.10");
    const dep = api.state.objects.get("deployments/shop/web");
    expect(dep.metadata.annotations[OWNER]).toContain("resource");
    expect(api.state.managers.every((m) => m === "monk")).toBe(true);

    r.waitReady();
    expect(r.state.ready).toBe(true);
    expect(r.state.load_balancer).toBe("203.0.113.7");

    r.delete();
    // The Service stays until its load balancer is released.
    expect(stored(api.state)).toEqual(["services/shop/web"]);
    r.waitDeleted();
    expect(stored(api.state).length).toBe(0);
    if (!t.exploring) {
        expect(t.http.requests().filter((q) => q.startsWith("DELETE"))).toEqual([
            `DELETE ${KUBE}/api/v1/namespaces/shop/services/web -> 200`,
            `DELETE ${KUBE}/apis/apps/v1/namespaces/shop/deployments/web -> 200`,
            `DELETE ${KUBE}/api/v1/namespaces/shop -> 200`,
        ]);
    }
});

test("a delete is not done while finalizers hold an object", (t) => {
    const api = t.use(kube);
    const r = resource(t, APP);
    r.create();
    r.delete();
    // A delete run again still waits for what the first one removed.
    r.delete();
    expect(() => r.checkDeleted()).toThrow(/not deleted yet/);
    expect(r.output.join("\n")).toContain("waiting for Service shop/web to go (finalizers: service.kubernetes.io/load-balancer-cleanup)");
    r.checkDeleted();
    expect(stored(api.state)).toEqual([]);
}, { explore: false });

test("an object made again under the same name does not hold a delete up", (t) => {
    const api = t.use(kube);
    const r = resource(t, APP);
    r.create();
    r.delete();
    api.state.terminating.clear();
    api.state.objects.get("services/shop/web").metadata = { name: "web", namespace: "shop", uid: "uid-other" };
    r.checkDeleted();
}, { explore: false });

test("readiness says what it is waiting for", (t) => {
    t.use(kube);
    const r = resource(t, APP);
    r.create();
    expect(() => r.checkReadiness()).toThrow(/not ready/);
    expect(r.output.join("\n")).toContain("waiting for Deployment shop/web: 0 of 2 replicas available");
}, { explore: false });

test("objects that leave the manifest are deleted on update", (t) => {
    const api = t.use(kube);
    const two = "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: a}\ndata: {k: '1'}\n---\napiVersion: v1\nkind: ConfigMap\nmetadata: {name: b}\n";
    const r = resource(t, two);
    r.create();
    expect(stored(api.state)).toEqual(["configmaps/default/a", "configmaps/default/b"]);

    r.redefine({ ...r.definition, manifest: "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: a}\ndata: {k: '2'}\n" });
    r.update();
    expect(stored(api.state)).toEqual(["configmaps/default/a"]);
    expect(api.state.objects.get("configmaps/default/a").data.k).toBe("2");
    expect(r.state.objects?.length).toBe(1);
    expect(r.output.join("\n")).toContain("deleted ConfigMap default/b: it is no longer wanted");
});

test("an object Monk did not create is refused, unless adopted, and adopted ones stay", (t) => {
    const api = t.use(kube);
    api.state.objects.set("configmaps/default/settings", {
        apiVersion: "v1", kind: "ConfigMap", metadata: { name: "settings", namespace: "default", uid: "uid-old" }, data: { mode: "manual" },
    });
    const manifest = "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: settings}\ndata: {mode: monk}\n";

    const refused = resource(t, manifest);
    expect(() => refused.create()).toThrow(/ConfigMap default\/settings already exists and Monk did not create it; set adopt: true/);
    expect(api.state.objects.get("configmaps/default/settings").data.mode).toBe("manual");

    const r = resource(t, manifest, { adopt: true });
    r.create();
    expect(r.state.objects?.[0].adopted).toBe(true);
    expect(r.state.objects?.[0].uid).toBe("uid-old");
    expect(api.state.objects.get("configmaps/default/settings").data.mode).toBe("monk");

    r.delete();
    expect(api.state.objects.has("configmaps/default/settings")).toBe(true);
    expect(r.output.join("\n")).toContain("was adopted; leaving it in place");
});

test("an object another entity manages is refused, even with adopt", (t) => {
    const api = t.use(kube);
    const manifest = "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: shared}\n";
    resource(t, manifest).create();
    const other = resource(t, manifest, { adopt: true });
    expect(() => other.create()).toThrow(/ConfigMap default\/shared is managed by .*resource.*; one object cannot have two owners/);
    expect(stored(api.state).length).toBe(1);
}, { explore: false });

test("a CRD and its custom resources apply together", (t) => {
    const api = t.use(kube);
    const r = resource(t, `
apiVersion: example.com/v1
kind: Widget
metadata: {name: w}
size: 3
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata: {name: widgets.example.com}
spec:
  group: example.com
  scope: Namespaced
  names: {plural: widgets, singular: widget, kind: Widget}
  versions: [{name: v1, served: true, storage: true}]
`);
    r.create();
    expect(r.state.objects?.map((o) => o.kind)).toEqual(["CustomResourceDefinition", "Widget"]);
    expect(api.state.objects.get("widgets/default/w").size).toBe(3);
    r.waitReady();
    r.delete();
    expect(stored(api.state).length).toBe(0);
});

test("a kubeconfig in a secret is used, with its context's namespace", (t) => {
    const api = t.use(kube);
    const r = t.entity(Resource, {
        kubeconfig_secret: "kubeconfig",
        manifest: "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: a}\n",
    });
    r.secret("kubeconfig", `apiVersion: v1
kind: Config
current-context: dev
clusters: [{name: dev, cluster: {server: "${KUBE}"}}]
users: [{name: me, user: {token: kubeconfig-token}}]
contexts: [{name: dev, context: {cluster: dev, user: me, namespace: team}}]
`);
    r.create();
    expect(api.state.objects.has("configmaps/team/a")).toBe(true);
});

test("a kubeconfig that would run a command is refused", (t) => {
    t.use(kube);
    const r = t.entity(Resource, { kubeconfig_secret: "kubeconfig", manifest: "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: a}\n" });
    r.secret("kubeconfig", `current-context: c
clusters: [{name: c, cluster: {server: "${KUBE}"}}]
users: [{name: u, user: {exec: {command: /usr/bin/curl, args: [evil.example]}}}]
contexts: [{name: c, context: {cluster: c, user: u}}]
`);
    expect(() => r.create()).toThrow(/credential plugin "\/usr\/bin\/curl", which is not supported/);
    expect(t.http.requests()).toEqual([]);
}, { explore: false });

test("on_delete orphan leaves the objects", (t) => {
    const api = t.use(kube);
    const r = resource(t, "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: a}\n", { on_delete: "orphan" });
    r.create();
    r.delete();
    expect(api.state.objects.has("configmaps/default/a")).toBe(true);
}, { explore: false });

test("restart rolls deployments with a field manager of its own", (t) => {
    const api = t.use(kube);
    const r = resource(t, APP);
    r.create();
    r.do("restart");
    const dep = api.state.objects.get("deployments/shop/web");
    expect(dep.spec.template.metadata.annotations["kubectl.kubernetes.io/restartedAt"]).toBeTruthy();
    expect(api.state.managers.filter((m) => m === "monk-restart").length).toBe(1);
}, { explore: false });

test("a manifest that names an object twice is refused", (t) => {
    t.use(kube);
    const r = resource(t, "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: a}\n---\napiVersion: v1\nkind: ConfigMap\nmetadata: {name: a}\n");
    expect(() => r.create()).toThrow(/ConfigMap default\/a is given twice/);
}, { explore: false });

test("a cluster reports its version and keeps its connection for wiring", (t) => {
    t.use(kube);
    const c = t.entity(Cluster, { server: KUBE, token_secret: "kube-token", namespace: "apps" });
    c.secret("kube-token", "test-token");
    c.create();
    expect(c.state.version).toBe("v1.31.0");
    expect(c.state.default_namespace).toBe("apps");
    expect(c.state.server).toBe(KUBE);
    expect(c.state.token_secret).toBe("kube-token");
    expect(c.state.nodes?.map((n) => `${n.name} ${n.internal_ip} ${n.ready}`)).toEqual(["node-a 10.0.0.1 false", "node-b 10.0.0.2 true"]);
    expect(c.state.node_address).toBe("10.0.0.2");
    c.waitReady();
    c.do("namespaces");
});

test("a NodePort Service is reached at a ready node", (t) => {
    t.use(kube);
    const r = resource(t, "apiVersion: v1\nkind: Service\nmetadata: {name: web}\nspec: {type: NodePort, selector: {app: web}, ports: [{port: 80}]}\n");
    r.create();
    expect(r.state.node_port).toBe(30080);
    expect(r.state.node_address).toBe("10.0.0.2");
    expect(r.state.endpoint).toBe("10.0.0.2:30080");
});

test("a LoadBalancer Service is reached at its load balancer once it has one", (t) => {
    t.use(kube);
    const r = resource(t, APP);
    r.create();
    expect(r.state.endpoint).toBe("10.0.0.2:30080");
    r.waitReady();
    expect(r.state.endpoint).toBe("203.0.113.7:80");
});

test("node addresses are left out when the credentials may not list nodes", (t) => {
    const api = t.use(kube);
    api.fault("GET /api/v1/nodes", 403, { body: { kind: "Status", reason: "Forbidden", message: "nodes is forbidden" } });
    const r = resource(t, "apiVersion: v1\nkind: Service\nmetadata: {name: web}\nspec: {type: NodePort, ports: [{port: 80}]}\n");
    r.create();
    expect(r.state.node_port).toBe(30080);
    expect(r.state.node_address ?? undefined).toBe(undefined);
    expect(r.state.endpoint).toBe("10.96.0.10:80");
}, { explore: false });

test("a lookup reads what Monk does not manage, by name or labels", (t) => {
    const api = t.use(kube);
    api.state.objects.set("services/ingress/controller", {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "controller", namespace: "ingress", uid: "uid-ctl", labels: { app: "ingress" } },
        spec: { type: "LoadBalancer", clusterIP: "10.96.1.1", ports: [{ port: 443 }] },
        status: { loadBalancer: { ingress: [{ hostname: "lb.example.com" }] } },
    });
    const byName = t.entity(Lookup, {
        server: KUBE, token_secret: "kube-token", api_version: "v1", kind: "Service", name: "controller", namespace: "ingress",
        fields: [
            { name: "address", path: "status.loadBalancer.ingress.0.hostname" },
            { name: "port", path: "spec.ports.0.port" },
            { name: "ports", path: "spec.ports" },
            { name: "missing", path: "spec.nope" },
        ],
    });
    byName.secret("kube-token", "test-token");
    byName.create();
    byName.waitReady();
    expect(byName.state.found).toBe(true);
    // Under values, with objects and lists as they are, not as JSON.
    expect(byName.state.values).toEqual({ address: "lb.example.com", port: 443, ports: [{ port: 443 }] });

    const byLabels = t.entity(Lookup, {
        server: KUBE, token_secret: "kube-token", api_version: "v1", kind: "Service", label_selector: "app=ingress", all_namespaces: true,
        fields: [{ name: "ip", path: "spec.clusterIP" }],
    });
    byLabels.secret("kube-token", "test-token");
    byLabels.create();
    expect(byLabels.state.name).toBe("controller");
    expect(byLabels.state.values).toEqual({ ip: "10.96.1.1" });

    // A field that is gone from the object is gone from values.
    api.state.objects.get("services/ingress/controller").status = {};
    byName.waitReady();
    expect(byName.state.values).toEqual({ port: 443, ports: [{ port: 443 }] });

    byName.delete();
    expect(api.state.objects.has("services/ingress/controller")).toBe(true);
});

test("a lookup drops the fields it kept at the top of state before values", (t) => {
    const api = t.use(kube);
    api.state.objects.set("configmaps/default/settings", { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "settings", namespace: "default" }, data: { mode: "fast" } });
    const l = t.entity(Lookup, { server: KUBE, token_secret: "kube-token", api_version: "v1", kind: "ConfigMap", name: "settings", fields: [{ name: "mode", path: "data.mode" }] });
    l.secret("kube-token", "test-token");
    l.create();
    // As an older lookup left it.
    const st = l.state as any;
    st.mode = "stale";
    st.field_names = ["mode"];
    l.update();
    const after = l.state as any;
    expect([after.mode, after.field_names]).toEqual([undefined, undefined]);
    expect(l.state.values).toEqual({ mode: "fast" });
}, { explore: false });

test("a lookup is not ready until its object exists", (t) => {
    const api = t.use(kube);
    const l = t.entity(Lookup, { server: KUBE, token_secret: "kube-token", api_version: "v1", kind: "ConfigMap", name: "later" });
    l.secret("kube-token", "test-token");
    l.create();
    expect(l.state.found).toBe(false);
    expect(() => l.checkReadiness()).toThrow(/not ready/);
    api.state.objects.set("configmaps/default/later", { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "later", namespace: "default" } });
    l.waitReady();
}, { explore: false });
