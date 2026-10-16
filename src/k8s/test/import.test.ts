// Tests for importing what a namespace holds: k8s/inventory and the
// observe mode of the k8s object entities, against the fake API server.
import { test, expect, Test, text } from "monk/test";
import { Resource } from "../resource.ts";
import { Inventory } from "../inventory.ts";
import { kube, KUBE } from "./fake-kube.ts";

/** A namespace someone else deployed: an app, its Service, its settings, and a Helm release. */
function seed(t: Test) {
    const api = t.use(kube);
    const put = (key: string, obj: any) => api.state.objects.set(key, obj);
    put("namespaces//shop", { apiVersion: "v1", kind: "Namespace", metadata: { name: "shop", uid: "uid-ns" } });
    put("deployments/shop/web", {
        apiVersion: "apps/v1", kind: "Deployment",
        metadata: { name: "web", namespace: "shop", uid: "uid-web", resourceVersion: "41", generation: 3, annotations: { "deployment.kubernetes.io/revision": "3" } },
        spec: { replicas: 2, selector: { matchLabels: { app: "web" } }, template: { metadata: { labels: { app: "web" } }, spec: { containers: [{ name: "web", image: "nginx:1.27" }] } } },
        status: { replicas: 2, readyReplicas: 2, updatedReplicas: 2, availableReplicas: 2, observedGeneration: 3 },
    });
    put("services/shop/web", {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "web", namespace: "shop", uid: "uid-svc" },
        spec: { type: "LoadBalancer", clusterIP: "10.96.0.12", clusterIPs: ["10.96.0.12"], selector: { app: "web" }, ports: [{ port: 80, targetPort: 80, protocol: "TCP" }] },
        status: { loadBalancer: { ingress: [{ hostname: "web.elb.example.com" }] } },
    });
    put("configmaps/shop/settings", { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "settings", namespace: "shop", uid: "uid-cm" }, data: { mode: "fast" } });
    put("secrets/shop/db", { apiVersion: "v1", kind: "Secret", type: "Opaque", metadata: { name: "db", namespace: "shop", uid: "uid-db" }, data: { password: "c2VjcmV0" } });
    put("statefulsets/shop/cache", {
        apiVersion: "apps/v1", kind: "StatefulSet",
        metadata: { name: "cache", namespace: "shop", uid: "uid-cache", annotations: { "meta.helm.sh/release-name": "cache" }, labels: { "app.kubernetes.io/managed-by": "Helm" } },
        spec: { replicas: 1, serviceName: "cache", selector: { matchLabels: { app: "cache" } }, template: { metadata: { labels: { app: "cache" } }, spec: { containers: [{ name: "redis", image: "redis:7" }] } } },
        status: { replicas: 1, readyReplicas: 1, currentReplicas: 1, updatedReplicas: 1, availableReplicas: 1 },
    });
    // What import leaves out: the cluster's own objects, and objects others own.
    put("services/default/kubernetes", { apiVersion: "v1", kind: "Service", metadata: { name: "kubernetes", namespace: "default" }, spec: { ports: [{ port: 443 }] } });
    put("configmaps/shop/kube-root-ca.crt", { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "kube-root-ca.crt", namespace: "shop" }, data: { "ca.crt": "x" } });
    put("secrets/shop/sh.helm.release.v1.cache.v1", { apiVersion: "v1", kind: "Secret", type: "helm.sh/release.v1", metadata: { name: "sh.helm.release.v1.cache.v1", namespace: "shop" } });
    put("configmaps/shop/web-generated", {
        apiVersion: "v1", kind: "ConfigMap",
        metadata: { name: "web-generated", namespace: "shop", ownerReferences: [{ apiVersion: "apps/v1", kind: "Deployment", name: "web", uid: "uid-web" }] },
    });
    return api;
}

function observer(t: Test, manifest: string) {
    const r = t.entity(Resource, { server: KUBE, token_secret: "kube-token", namespace: "shop", mode: "observe", manifest });
    r.secret("kube-token", "test-token");
    return r;
}

const WEB = `
apiVersion: apps/v1
kind: Deployment
metadata: {name: web, namespace: shop}
---
apiVersion: v1
kind: Service
metadata: {name: web, namespace: shop}
`;

test("observe mode maps what exists and changes nothing", (t) => {
    const api = seed(t);
    const r = observer(t, WEB);
    r.create();
    expect(api.state.managers).toEqual([]);
    expect(r.state.objects?.map((o) => [o.kind, o.uid, o.adopted, o.summary])).toEqual([
        ["Deployment", "uid-web", true, "replicas=2 images=nginx:1.27"],
        ["Service", "uid-svc", true, "type=LoadBalancer ports=80/TCP address=web.elb.example.com"],
    ]);
    // A connection target, like anything Monk made.
    expect(r.state.load_balancer).toBe("web.elb.example.com");
    expect(r.state.endpoint).toBe("web.elb.example.com:80");
    r.waitReady();

    expect(() => r.do("restart")).toThrow(/only observes them \(mode: observe\)/);
    expect(() => r.do("apply")).toThrow(/only observes them/);

    r.delete();
    expect(r.output.join("\n")).toContain("forgetting 2 observed objects; they stay on the cluster");
    expect(api.state.objects.has("deployments/shop/web")).toBe(true);
    expect(api.state.objects.has("services/shop/web")).toBe(true);
    expect(api.state.managers).toEqual([]);
});

test("observe mode refuses an object that does not exist", (t) => {
    seed(t);
    const r = observer(t, "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: missing}\n");
    expect(() => r.create()).toThrow(/ConfigMap shop\/missing does not exist; mode: observe only maps objects that do/);
});

test("refresh notes what changed, went and came back", (t) => {
    const api = seed(t);
    const r = observer(t, WEB);
    r.create();
    r.do("refresh");
    expect(r.output).toContain("no changes");

    const web = api.state.objects.get("deployments/shop/web");
    web.spec.replicas = 4;
    web.spec.template.spec.containers[0].image = "nginx:1.28";
    r.do("refresh");
    const changes = () => (r.state.changes ?? []).map((c) => c.replace(/^\S+ /, ""));
    expect(changes()).toEqual(["Deployment shop/web: replicas=2 images=nginx:1.27 -> replicas=4 images=nginx:1.28"]);

    const svc = api.state.objects.get("services/shop/web");
    api.state.objects.delete("services/shop/web");
    r.do("refresh");
    expect(changes().at(-1)).toBe("Service shop/web: gone");
    expect(r.state.objects?.[1].gone).toBe(true);
    expect(r.state.load_balancer ?? undefined).toBe(undefined);

    api.state.objects.set("services/shop/web", svc);
    r.do("refresh");
    expect(changes().at(-1)).toBe("Service shop/web: back");
    expect(r.state.load_balancer).toBe("web.elb.example.com");
    expect(api.state.managers).toEqual([]);
}, { explore: false });

test("turning an observer to manage takes the objects over and still leaves them on delete", (t) => {
    const api = seed(t);
    const manifest = "apiVersion: v1\nkind: ConfigMap\nmetadata: {name: settings, namespace: shop}\ndata: {mode: careful}\n";
    const r = observer(t, manifest);
    r.create();
    expect(api.state.objects.get("configmaps/shop/settings").data.mode).toBe("fast");

    r.redefine({ server: KUBE, token_secret: "kube-token", namespace: "shop", mode: "manage", manifest });
    r.update();
    expect(api.state.objects.get("configmaps/shop/settings").data.mode).toBe("careful");
    expect(r.state.objects?.[0].adopted).toBe(true);

    r.delete();
    expect(api.state.objects.has("configmaps/shop/settings")).toBe(true);
});

function inventory(t: Test) {
    const inv = t.entity(Inventory, { server: KUBE, token_secret: "kube-token", namespace: "shop" });
    inv.secret("kube-token", "test-token");
    return inv;
}

test("an inventory lists what a namespace holds, without what others own", (t) => {
    const api = seed(t);
    const inv = inventory(t);
    inv.create();
    expect(inv.state.namespace).toBe("shop");
    expect((inv.state.objects ?? []).map((o) => `${o.kind}/${o.name}${o.managed_by ? ` (${o.managed_by})` : ""}`)).toEqual([
        "ConfigMap/settings",
        "Deployment/web",
        "Secret/db",
        "Service/web",
        "StatefulSet/cache (helm:cache)",
    ]);
    expect(inv.output.at(-1)).toBe("5 objects in shop, 1 managed by other tools");
    expect(api.state.managers).toEqual([]);

    api.state.objects.set("configmaps/shop/flags", { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "flags", namespace: "shop" } });
    api.state.objects.delete("secrets/shop/db");
    inv.do("refresh");
    expect(inv.state.new_objects).toEqual(["ConfigMap/flags"]);
    expect(inv.state.gone_objects).toEqual(["Secret/db"]);
});

test("an API the cluster will not describe keeps its objects, rather than losing them", (t) => {
    seed(t);
    const inv = inventory(t);
    inv.create();
    t.http.use("GET https://kube.test/apis/apps/v1", () => text(503, "the apps API is down"));
    inv.do("refresh");
    expect(inv.state.unreadable_apis).toEqual(["apps/v1"]);
    expect(inv.state.gone_objects).toEqual([]);
    expect((inv.state.objects ?? []).map((o) => `${o.kind}/${o.name}`)).toContain("Deployment/web");
    expect(inv.output).toContain("could not read the API apps/v1; its objects are carried over from the last stock");
}, { explore: false });

test("the API server's own Service is left out of default", (t) => {
    seed(t);
    const inv = t.entity(Inventory, { server: KUBE, token_secret: "kube-token", namespace: "default" });
    inv.secret("kube-token", "test-token");
    inv.create();
    expect(inv.state.objects ?? []).toEqual([]);
});

test("an inventory writes a template that observes each object", (t) => {
    seed(t);
    const inv = inventory(t);
    inv.create();
    inv.do("template", { every: "300" });
    const yaml = inv.output.at(-1) ?? "";

    expect(yaml).toContain("namespace: imported-shop");
    for (const name of ["configmap-settings", "deployment-web", "secret-db", "service-web", "statefulset-cache"]) {
        expect(yaml).toContain(`\n${name}:\n`);
    }
    expect(yaml.match(/\n  mode: observe\n/g)?.length).toBe(5);
    expect(yaml.match(/every: 300/g)?.length).toBe(5);
    expect(yaml).toContain('  server: "' + KUBE + '"');
    expect(yaml).toContain('  token_secret: "kube-token"');
    expect(yaml).toContain('  permitted-secrets:\n    "kube-token": true\n');
    // Typed where the typed entity renders the object as it is, else k8s/resource and why.
    expect(yaml).toContain("deployment-web:\n  defines: k8s/deployment\n");
    expect(yaml).toContain('  image: "nginx:1.27"\n  selector:\n    app: "web"\n  replicas: 2\n');
    expect(yaml).toContain("service-web:\n  defines: k8s/service\n");
    expect(yaml).toContain('  service_type: "LoadBalancer"\n  selector:\n    app: "web"\n  ports: ["=80"]\n');
    expect(yaml).toContain("configmap-settings:\n  defines: k8s/config-map\n");
    expect(yaml).toContain("secret-db:\n  # k8s/resource: k8s/secret would need the values in Monk; they stay on the cluster\n  defines: k8s/resource\n");
    expect(yaml).toContain("  # managed by helm:cache\n  # k8s/resource: k8s/stateful-set makes a headless Service of its own\n  defines: k8s/resource\n");
    // Secret values stay on the cluster; what the cluster set is left out.
    expect(yaml).not.toContain("c2VjcmV0");
    expect(yaml).not.toContain("10.96.0.12");
    expect(yaml).not.toContain("uid-web");
    expect(yaml).not.toContain("deployment.kubernetes.io/revision");
    expect(yaml).not.toContain("readyReplicas");
    // A Helm release is a group of its own inside the stack.
    expect(yaml).toContain("release-cache:\n  defines: process-group\n  runnable-list:\n    - imported-shop/statefulset-cache\n");
    expect(yaml).toContain("stack:\n  defines: process-group\n  runnable-list:\n    - imported-shop/configmap-settings\n");
    expect(yaml).toContain("    - imported-shop/release-cache");

    expect(() => inv.do("template", { every: "5" })).toThrow(/at least 30/);
});

test("the manifests an inventory writes observe the same objects", (t) => {
    const api = seed(t);
    const inv = inventory(t);
    inv.create();
    inv.do("template", { typed: "false" });
    const yaml = inv.output.at(-1) ?? "";
    // Each entity's manifest, taken back out of the template, maps its object.
    const blocks = yaml.split("\n  manifest: |\n").slice(1).map((b) => b.split("\n  crons:")[0].split("\n").map((l) => l.slice(4)).join("\n"));
    expect(blocks.length).toBe(5);
    for (const manifest of blocks) {
        const r = observer(t, manifest);
        r.create();
        expect(r.state.objects?.length).toBe(1);
        expect(r.state.objects?.[0].uid).toMatch(/^uid-/);
    }
    expect(api.state.managers).toEqual([]);
});
