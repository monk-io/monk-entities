// Tests for importing objects as typed entities: an object gets its typed
// entity only when that entity renders it as the cluster has it, so that
// switching the entity from observe to manage changes nothing.
import { test, expect, Test } from "monk/test";
import k8s from "k8s";
import { Deployment } from "../deployment.ts";
import { Service } from "../service.ts";
import { ConfigMap } from "../config-map.ts";
import { Volume } from "../volume.ts";
import { Inventory } from "../inventory.ts";
import { typedFor, yamlField } from "../typed-import.ts";
import { asManifest } from "../manifest.ts";
import { kube, KUBE } from "./fake-kube.ts";

const CONNECTION = { server: KUBE, token_secret: "kube-token", namespace: "shop" };

/** What `kubectl create deployment web --image=nginx:1.27 --port=80 --replicas=2` leaves, as the API server returns it. */
function deployment(): any {
    return {
        apiVersion: "apps/v1", kind: "Deployment",
        metadata: {
            name: "web", namespace: "shop", uid: "uid-web", resourceVersion: "812", generation: 1, creationTimestamp: "2026-10-16T09:00:00Z",
            labels: { app: "web" }, annotations: { "deployment.kubernetes.io/revision": "1" },
        },
        spec: {
            replicas: 2,
            selector: { matchLabels: { app: "web" } },
            template: {
                metadata: { creationTimestamp: null, labels: { app: "web" } },
                spec: {
                    containers: [{
                        name: "nginx", image: "nginx:1.27", ports: [{ containerPort: 80, protocol: "TCP" }], resources: {},
                        terminationMessagePath: "/dev/termination-log", terminationMessagePolicy: "File", imagePullPolicy: "IfNotPresent",
                    }],
                    restartPolicy: "Always", terminationGracePeriodSeconds: 30, dnsPolicy: "ClusterFirst", securityContext: {}, schedulerName: "default-scheduler",
                },
            },
            strategy: { type: "RollingUpdate", rollingUpdate: { maxUnavailable: "25%", maxSurge: "25%" } },
            revisionHistoryLimit: 10,
            progressDeadlineSeconds: 600,
        },
        status: { observedGeneration: 1, replicas: 2, readyReplicas: 2, availableReplicas: 2 },
    };
}

/** What `kubectl expose deployment web --port=80 --target-port=8080` leaves. */
function service(): any {
    return {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "web", namespace: "shop", uid: "uid-svc", resourceVersion: "815", creationTimestamp: "2026-10-16T09:00:01Z", labels: { app: "web" } },
        spec: {
            ports: [{ port: 80, protocol: "TCP", targetPort: 8080 }],
            selector: { app: "web" },
            clusterIP: "10.96.40.2", clusterIPs: ["10.96.40.2"], type: "ClusterIP", sessionAffinity: "None",
            ipFamilies: ["IPv4"], ipFamilyPolicy: "SingleStack", internalTrafficPolicy: "Cluster",
        },
        status: { loadBalancer: {} },
    };
}

function headless(): any {
    return {
        apiVersion: "v1", kind: "Service",
        metadata: { name: "cache", namespace: "shop", uid: "uid-cache" },
        spec: {
            ports: [{ name: "redis", port: 6379, protocol: "TCP", targetPort: 6379 }],
            selector: { app: "cache" },
            clusterIP: "None", clusterIPs: ["None"], type: "ClusterIP", sessionAffinity: "None",
            ipFamilies: ["IPv4"], ipFamilyPolicy: "SingleStack", internalTrafficPolicy: "Cluster",
        },
    };
}

/** A bound claim, with what the volume controllers add. */
function claim(): any {
    return {
        apiVersion: "v1", kind: "PersistentVolumeClaim",
        metadata: {
            name: "data", namespace: "shop", uid: "uid-pvc",
            annotations: { "pv.kubernetes.io/bind-completed": "yes", "volume.kubernetes.io/storage-provisioner": "rancher.io/local-path", "volume.kubernetes.io/selected-node": "kind-control-plane" },
            finalizers: ["kubernetes.io/pvc-protection"],
        },
        spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "1Gi" } }, storageClassName: "standard", volumeMode: "Filesystem", volumeName: "pvc-0b7e" },
        status: { phase: "Bound", capacity: { storage: "1Gi" } },
    };
}

function configMap(): any {
    return {
        apiVersion: "v1", kind: "ConfigMap",
        metadata: { name: "settings", namespace: "shop", uid: "uid-cm" },
        data: { mode: "fast", "nginx.conf": "server {\n  listen 8080;\n}\n" },
    };
}

test("objects as kubectl leaves them map to their typed entities", () => {
    expect(typedFor(deployment(), CONNECTION).typed).toEqual({
        type: "k8s/deployment",
        fields: {
            name: "web", standard_labels: false, labels: { app: "web" }, image: "nginx:1.27", container_name: "nginx",
            selector: { app: "web" }, replicas: 2, ports: ["=80"], service_type: "none",
        },
    });
    expect(typedFor(service(), CONNECTION).typed).toEqual({
        type: "k8s/service",
        fields: { name: "web", standard_labels: false, labels: { app: "web" }, selector: { app: "web" }, ports: ["=80:8080"] },
    });
    expect(typedFor(headless(), CONNECTION).typed?.fields).toEqual({
        name: "cache", standard_labels: false, service_type: "headless", selector: { app: "cache" }, ports: ["redis=6379"],
    });
    expect(typedFor(claim(), CONNECTION).typed).toEqual({
        type: "k8s/volume", fields: { name: "data", standard_labels: false, size: "1Gi", storage_class: "standard" },
    });
    expect(typedFor(configMap(), CONNECTION).typed?.fields.data).toEqual(configMap().data);
});

test("an object a typed entity cannot render as it is falls back, saying why", () => {
    const reason = (obj: any) => typedFor(obj, CONNECTION).reason;

    const probed = deployment();
    probed.spec.template.spec.containers[0].livenessProbe = { httpGet: { path: "/", port: 80, scheme: "HTTP" }, periodSeconds: 10, timeoutSeconds: 1, successThreshold: 1, failureThreshold: 3 };
    expect(reason(probed)).toBe("k8s/deployment has no setting for spec.template.spec.containers.0.livenessProbe");

    const ready = deployment();
    ready.spec.template.spec.containers[0].readinessProbe = { httpGet: { path: "/healthz", port: 80, scheme: "HTTP" }, periodSeconds: 10, timeoutSeconds: 1, successThreshold: 1, failureThreshold: 3 };
    expect(reason(ready)).toBe("k8s/deployment would set spec.template.spec.containers.0.readinessProbe.periodSeconds differently");

    // A label on the Deployment only would reach the pods, and roll them.
    const labelled = deployment();
    labelled.metadata.labels.team = "shop";
    expect(reason(labelled)).toBe('k8s/deployment would set spec.template.metadata.labels.team differently');

    const sidecar = deployment();
    sidecar.spec.template.spec.containers.push({ name: "log", image: "busybox" });
    expect(reason(sidecar)).toBe("k8s/deployment: the pods run 2 containers, and it runs one");

    const fromSecret = deployment();
    fromSecret.spec.template.spec.containers[0].env = [{ name: "TOKEN", valueFrom: { secretKeyRef: { name: "db", key: "token" } } }];
    expect(reason(fromSecret)).toBe("k8s/deployment: variable TOKEN is read from a secretKeyRef");

    const named = service();
    named.spec.ports[0].targetPort = "http";
    expect(reason(named)).toBe("k8s/service: port 80 sends to a port named http");

    expect(reason({ apiVersion: "v1", kind: "Secret", metadata: { name: "db" }, type: "Opaque", data: {} })).toBe("k8s/secret would need the values in Monk; they stay on the cluster");
    // A kind with no typed entity takes k8s/resource without a word.
    expect(typedFor({ apiVersion: "v1", kind: "ServiceAccount", metadata: { name: "x" } }, CONNECTION)).toEqual({});
});

/** Whether every field in part has the same value in whole. */
function within(part: any, whole: any, path = ""): string[] {
    if (part !== null && typeof part === "object" && !Array.isArray(part)) {
        if (whole === null || typeof whole !== "object") return [path];
        return Object.entries(part).flatMap(([k, v]) => (v === undefined ? [] : within(v, whole[k], `${path}.${k}`)));
    }
    if (Array.isArray(part)) {
        if (!Array.isArray(whole) || whole.length !== part.length) return [path];
        return part.flatMap((v, i) => within(v, whole[i], `${path}.${i}`));
    }
    return part === whole ? [] : [path];
}

const ENTITIES: Record<string, any> = { "k8s/deployment": Deployment, "k8s/service": Service, "k8s/volume": Volume, "k8s/config-map": ConfigMap };

test("a typed entity from an import, switched to manage, applies the object as it was", (t: Test) => {
    const api = t.use(kube);
    const objects: Record<string, any> = {
        "deployments/shop/web": deployment(),
        "services/shop/web": service(),
        "services/shop/cache": headless(),
        "persistentvolumeclaims/shop/data": claim(),
        "configmaps/shop/settings": configMap(),
    };
    for (const [key, obj] of Object.entries(objects)) {
        api.state.objects.set(key, obj);
        const typed = typedFor(obj, CONNECTION).typed!;
        const e: any = t.entity(ENTITIES[typed.type], { ...CONNECTION, ...typed.fields, mode: "observe" });
        e.secret("kube-token", "test-token");
        e.create();
        expect(e.state.objects?.map((o: any) => o.uid)).toEqual([obj.metadata.uid]);

        e.redefine({ ...CONNECTION, ...typed.fields, mode: "manage" });
        e.update();
        // What the entity applied is what was there, as a manifest: its
        // owner note and what the cluster sets aside.
        expect(within(asManifest(api.state.objects.get(key)), asManifest(obj))).toEqual([]);
    }
});

test("the settings an import writes read back as they were written", () => {
    const fields = typedFor(configMap(), CONNECTION).typed!.fields;
    fields.labels = { "app.kubernetes.io/part-of": "shop", tier: "1" };
    fields.env = { GREETING: "it's \"fine\"", EMPTY: "" };
    const yaml = ["thing:", ...Object.entries(fields).flatMap(([k, v]) => yamlField(k, v, "  "))].join("\n");
    expect(yaml).toContain('  data:\n    mode: "fast"\n    nginx.conf: |\n      server {\n        listen 8080;\n      }\n');
    expect(k8s.parse(yaml)[0].thing).toEqual(fields);
});

test("an inventory writes typed entities that observe the objects they came from", (t) => {
    const api = t.use(kube);
    api.state.objects.set("namespaces//shop", { apiVersion: "v1", kind: "Namespace", metadata: { name: "shop", uid: "uid-ns" } });
    api.state.objects.set("deployments/shop/web", deployment());
    api.state.objects.set("services/shop/web", service());
    api.state.objects.set("configmaps/shop/settings", configMap());
    const inv = t.entity(Inventory, CONNECTION);
    inv.secret("kube-token", "test-token");
    inv.create();
    inv.do("template");
    const template = k8s.parse(inv.output.at(-1) ?? "")[0];
    for (const name of ["configmap-settings", "deployment-web", "service-web"]) {
        const { defines, crons: _c, "permitted-secrets": _p, ...definition } = template[name];
        const e: any = t.entity(ENTITIES[defines], definition);
        e.secret("kube-token", "test-token");
        e.create();
        expect(e.state.objects?.length).toBe(1);
    }
    expect(api.state.managers).toEqual([]);
});
