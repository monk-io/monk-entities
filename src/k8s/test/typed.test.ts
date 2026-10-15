// Tests for the typed object entities (k8s/deployment, k8s/stateful-set,
// k8s/job, k8s/config-map, k8s/secret, k8s/service, k8s/ingress,
// k8s/kube-namespace, k8s/volume), against the fake API server.
import { test, expect, Test } from "monk/test";
import { Deployment } from "../deployment.ts";
import { StatefulSet } from "../stateful-set.ts";
import { Job } from "../job.ts";
import { ConfigMap } from "../config-map.ts";
import { Secret } from "../secret.ts";
import { Service } from "../service.ts";
import { Ingress } from "../ingress.ts";
import { KubeNamespace } from "../kube-namespace.ts";
import { Volume } from "../volume.ts";
import { kube, KUBE, stored } from "./fake-kube.ts";

const CONN = { server: KUBE, token_secret: "kube-token" };

function on<T extends { secret(name: string, value: string): void }>(i: T): T {
    i.secret("kube-token", "test-token");
    return i;
}

const WEB = {
    ...CONN,
    name: "web",
    namespace: "shop",
    image: "nginx:1.27",
    replicas: 2,
    ports: ["80:8080", 9090],
    env: { MODE: "production", WORKERS: 4 as any },
    secret_env: { DB_PASSWORD: "db-password" },
    config_files: { conf: { path: "/etc/nginx/conf.d/default.conf", contents: "server {}" } },
    storage: { cache: { path: "/var/cache/nginx", size: "2Gi" }, tmp: { path: "/tmp", temporary: true } },
    readiness_path: "/healthz",
    cpu: "100m",
    memory: "128Mi",
    labels: { "app.kubernetes.io/part-of": "shop" },
    node_selector: { "kubernetes.io/arch": "arm64" },
};

test("a deployment comes with its service, secret, files and volume", (t) => {
    const api = t.use(kube);
    const d = on(t.entity(Deployment, WEB));
    d.secret("db-password", "hunter2");
    d.create();
    expect(stored(api.state)).toEqual([
        "configmaps/shop/web-files",
        "deployments/shop/web",
        "persistentvolumeclaims/shop/web-cache",
        "secrets/shop/web-env",
        "services/shop/web",
    ]);

    const dep = api.state.objects.get("deployments/shop/web");
    expect(dep.spec.replicas).toBe(2);
    expect(dep.spec.strategy).toEqual({ type: "Recreate" });
    expect(dep.spec.selector).toEqual({ matchLabels: { "app.kubernetes.io/name": "web" } });
    const c = dep.spec.template.spec.containers[0];
    expect(c.image).toBe("nginx:1.27");
    expect(c.ports).toEqual([
        { name: "tcp-8080", containerPort: 8080, protocol: "TCP" },
        { name: "tcp-9090", containerPort: 9090, protocol: "TCP" },
    ]);
    expect(c.env).toEqual([
        { name: "MODE", value: "production" },
        { name: "WORKERS", value: "4" },
        { name: "DB_PASSWORD", valueFrom: { secretKeyRef: { name: "web-env", key: "DB_PASSWORD" } } },
    ]);
    expect(c.readinessProbe.httpGet).toEqual({ path: "/healthz", port: 8080 });
    expect(c.resources).toEqual({ requests: { cpu: "100m", memory: "128Mi" } });
    expect(c.volumeMounts).toEqual([
        { name: "files", mountPath: "/etc/nginx/conf.d/default.conf", subPath: "conf", readOnly: true },
        { name: "cache", mountPath: "/var/cache/nginx" },
        { name: "tmp", mountPath: "/tmp" },
    ]);
    expect(dep.spec.template.spec.volumes).toEqual([
        { name: "files", configMap: { name: "web-files", items: [{ key: "conf", path: "conf" }] } },
        { name: "cache", persistentVolumeClaim: { claimName: "web-cache" } },
        { name: "tmp", emptyDir: {} },
    ]);
    expect(dep.metadata.labels["app.kubernetes.io/managed-by"]).toBe("monk");
    // Keys with slashes come back from Monk nested; they are joined again.
    expect(dep.metadata.labels["app.kubernetes.io/part-of"]).toBe("shop");
    expect(dep.spec.template.spec.nodeSelector).toEqual({ "kubernetes.io/arch": "arm64" });

    const svc = api.state.objects.get("services/shop/web");
    expect(svc.spec.ports).toEqual([
        { name: "tcp-8080", port: 80, targetPort: 8080, protocol: "TCP" },
        { name: "tcp-9090", port: 9090, targetPort: 9090, protocol: "TCP" },
    ]);
    expect(api.state.objects.get("secrets/shop/web-env").data.DB_PASSWORD).toBe(btoa("hunter2"));
    expect(api.state.objects.get("persistentvolumeclaims/shop/web-cache").spec.resources.requests.storage).toBe("2Gi");

    d.waitReady();
    expect(d.state.name).toBe("web");
    expect(d.state.namespace).toBe("shop");
    expect(d.state.ready_replicas).toBe(2);
    expect(d.state.endpoint).toBe("10.96.0.10:80");
});

test("changed secret values and files restart the pods, unchanged ones do not", (t) => {
    const api = t.use(kube);
    const d = on(t.entity(Deployment, WEB));
    d.secret("db-password", "hunter2");
    d.create();
    const pod = () => api.state.objects.get("deployments/shop/web").spec.template.metadata.annotations ?? {};
    const files = pod()["monk.io/files"];
    expect(pod()["monk.io/secret-env-changed"]).toBeUndefined();

    d.update();
    expect(pod()["monk.io/secret-env-changed"]).toBeUndefined();

    // Monk skips an update that changes no definition, so a new secret
    // value is copied over by the apply action.
    d.secret("db-password", "correct horse ü");
    d.update();
    expect(pod()["monk.io/secret-env-changed"]).toBeUndefined();
    d.do("apply");
    const changed = pod()["monk.io/secret-env-changed"];
    expect(changed).toBeDefined();
    d.do("apply");
    expect(pod()["monk.io/secret-env-changed"]).toBe(changed);
    expect(pod()["monk.io/files"]).toBe(files);

    d.redefine({ ...WEB, config_files: { conf: { path: "/etc/nginx/conf.d/default.conf", contents: "server { listen 8080; }" } } });
    d.update();
    expect(pod()["monk.io/files"]).not.toBe(files);
});

test("volumes stay when the entity is deleted, unless delete_volumes", (t) => {
    const api = t.use(kube);
    const d = on(t.entity(Deployment, WEB));
    d.secret("db-password", "hunter2");
    d.create();
    d.delete();
    expect(stored(api.state)).toEqual(["persistentvolumeclaims/shop/web-cache"]);
    expect(d.output.join("\n")).toContain("keeping PersistentVolumeClaim shop/web-cache");

    // Made again, the entity takes its volume back.
    d.create();
    d.redefine({ ...WEB, delete_volumes: true });
    d.update();
    d.delete();
    // The claim goes once its volume is released.
    expect(stored(api.state)).toEqual(["persistentvolumeclaims/shop/web-cache"]);
    d.waitDeleted();
    expect(stored(api.state)).toEqual([]);
});

test("get hides a secret's values", (t) => {
    t.use(kube);
    const d = on(t.entity(Deployment, WEB));
    d.secret("db-password", "hunter2");
    d.create();
    d.do("get", { kind: "Secret" });
    const out = d.output.join("\n");
    expect(out).toContain("(hidden)");
    expect(out).not.toContain(btoa("hunter2"));
}, { explore: false });

test("a deployment without ports has no service, and service_type none drops it", (t) => {
    const api = t.use(kube);
    const worker = on(t.entity(Deployment, { ...CONN, name: "worker", image: "busybox", script: "sleep infinity" }));
    worker.create();
    expect(stored(api.state)).toEqual(["deployments/default/worker"]);
    expect(api.state.objects.get("deployments/default/worker").spec.template.spec.containers[0].command)
        .toEqual(["/bin/sh", "-c", "sleep infinity"]);

    const fromMaps = on(t.entity(Deployment, { ...CONN, name: "env", image: "busybox", env_config_map: "settings", env_secret: "creds" }));
    fromMaps.create();
    expect(api.state.objects.get("deployments/default/env").spec.template.spec.containers[0].envFrom)
        .toEqual([{ configMapRef: { name: "settings" } }, { secretRef: { name: "creds" } }]);
    fromMaps.delete();

    const quiet = on(t.entity(Deployment, { ...CONN, name: "quiet", image: "nginx", ports: [80], service_type: "none" }));
    quiet.create();
    expect(stored(api.state)).toEqual(["deployments/default/quiet", "deployments/default/worker"]);
});

test("the name defaults to the entity's own", (t) => {
    t.use(kube);
    const d = on(t.entity(Deployment, { ...CONN, image: "nginx" }));
    d.create();
    expect(d.state.name).toMatch(/^[a-z0-9-]+$/);
    expect(d.state.objects?.[0].name).toBe(d.state.name);
});

test("override sets what the entity has no setting for", (t) => {
    const api = t.use(kube);
    const d = on(t.entity(Deployment, {
        ...CONN, name: "web", image: "nginx",
        override: "spec:\n  revisionHistoryLimit: 2\n  template:\n    spec:\n      priorityClassName: high\n",
    }));
    d.create();
    const dep = api.state.objects.get("deployments/default/web");
    expect(dep.spec.revisionHistoryLimit).toBe(2);
    expect(dep.spec.template.spec.priorityClassName).toBe("high");
    expect(dep.spec.template.spec.containers[0].image).toBe("nginx");
});

test("a stateful set gets a volume per pod and a headless service", (t) => {
    const api = t.use(kube);
    const db = on(t.entity(StatefulSet, {
        ...CONN, name: "db", image: "postgres:17", ports: [5432],
        storage: { data: { path: "/var/lib/postgresql/data", size: "10Gi", storage_class: "fast" } },
        readiness_command: "pg_isready",
    }));
    db.create();
    expect(stored(api.state)).toEqual(["services/default/db", "services/default/db-pods", "statefulsets/default/db"]);
    const set = api.state.objects.get("statefulsets/default/db");
    expect(set.spec.serviceName).toBe("db-pods");
    expect(set.spec.volumeClaimTemplates).toEqual([
        { metadata: { name: "data" }, spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "10Gi" } }, storageClassName: "fast" } },
    ]);
    expect(set.spec.persistentVolumeClaimRetentionPolicy).toBeUndefined();
    expect(set.spec.template.spec.containers[0].readinessProbe.exec.command).toEqual(["/bin/sh", "-c", "pg_isready"]);
    expect(api.state.objects.get("services/default/db-pods").spec.clusterIP).toBe("None");

    db.waitReady();
    expect(db.state.pods_service).toBe("db-pods");
    expect(db.state.endpoint).toBe("10.96.0.10:5432");
});

test("a job is ready when it completes, and a change runs a new one", (t) => {
    const api = t.use(kube);
    const j = on(t.entity(Job, { ...CONN, name: "migrate", image: "app:1", command: ["./migrate"] }));
    j.create();
    const first = j.state.name ?? "";
    expect(first).toMatch(/^migrate-[0-9a-f]{8}$/);
    expect(api.state.objects.get(`jobs/default/${first}`).spec.template.spec.restartPolicy).toBe("Never");
    j.waitReady();
    expect(j.state.succeeded).toBe(1);

    j.update();
    expect(j.state.name).toBe(first);

    j.redefine({ ...CONN, name: "migrate", image: "app:2", command: ["./migrate"] });
    j.update();
    expect(j.state.name).not.toBe(first);
    expect(stored(api.state)).toEqual([`jobs/default/${j.state.name}`]);
});

test("a config map and a secret from Monk secrets", (t) => {
    const api = t.use(kube);
    const cm = on(t.entity(ConfigMap, { ...CONN, name: "settings", data: { DB_HOST: "10.0.0.5", DB_PORT: 5432 as any } }));
    cm.create();
    expect(api.state.objects.get("configmaps/default/settings").data).toEqual({ DB_HOST: "10.0.0.5", DB_PORT: "5432" });

    const s = on(t.entity(Secret, { ...CONN, name: "creds", secrets: { password: "db-password" }, data: { user: "app" } }));
    s.secret("db-password", "hunter2");
    s.create();
    const live = api.state.objects.get("secrets/default/creds");
    expect(live.type).toBe("Opaque");
    expect(live.data).toEqual({ user: btoa("app"), password: btoa("hunter2") });
    expect(JSON.stringify(s.state)).not.toContain("hunter2");

    s.delete();
    expect(api.state.objects.has("secrets/default/creds")).toBe(false);
});

test("a service selects an app's pods, and an ingress routes to it", (t) => {
    const api = t.use(kube);
    const lb = on(t.entity(Service, { ...CONN, name: "web-public", app: "web", ports: ["443:8443"], service_type: "LoadBalancer" }));
    lb.create();
    const svc = api.state.objects.get("services/default/web-public");
    expect(svc.spec.selector).toEqual({ "app.kubernetes.io/name": "web" });
    expect(svc.spec.ports).toEqual([{ name: "tcp-443", port: 443, targetPort: 8443, protocol: "TCP", nodePort: 30080 }]);
    lb.waitReady();
    expect(lb.state.endpoint).toBe("203.0.113.7:443");

    const ing = on(t.entity(Ingress, {
        ...CONN, name: "web", host: "shop.example.com", service: "web", port: 80, ingress_class: "nginx", cert_issuer: "letsencrypt", wait_address: true,
    }));
    ing.create();
    const live = api.state.objects.get("ingresses/default/web");
    expect(live.metadata.annotations["cert-manager.io/cluster-issuer"]).toBe("letsencrypt");
    expect(live.spec.tls).toEqual([{ hosts: ["shop.example.com"], secretName: "web-tls" }]);
    expect(live.spec.rules[0].http.paths[0].backend).toEqual({ service: { name: "web", port: { number: 80 } } });
    expect(ing.state.url).toBe("https://shop.example.com/");
    ing.waitReady();
    expect(ing.state.address).toBe("203.0.113.9");
});

test("a namespace, and a volume that outlives its entity", (t) => {
    const api = t.use(kube);
    const ns = on(t.entity(KubeNamespace, { ...CONN, name: "team-a" }));
    ns.create();
    expect(api.state.objects.has("namespaces//team-a")).toBe(true);
    expect(ns.state.name).toBe("team-a");

    const v = on(t.entity(Volume, { ...CONN, name: "shared", namespace: "team-a", size: "5Gi", access_mode: "ReadWriteMany" }));
    v.create();
    expect(api.state.objects.get("persistentvolumeclaims/team-a/shared").spec.accessModes).toEqual(["ReadWriteMany"]);
    v.delete();
    expect(api.state.objects.has("persistentvolumeclaims/team-a/shared")).toBe(true);

    ns.delete();
    expect(api.state.objects.has("namespaces//team-a")).toBe(false);
});

test("bad ports are refused", (t) => {
    t.use(kube);
    const d = on(t.entity(Deployment, { ...CONN, name: "web", image: "nginx", ports: ["http"] }));
    expect(() => d.create()).toThrow(/port "http" is not like/);
}, { explore: false });
