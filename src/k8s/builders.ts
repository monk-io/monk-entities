import { strings } from "./named.ts";
import { parsePort, named } from "./workload.ts";

// What the typed object entities apply, from their settings. Kept apart from
// the entities so that an import can render an object as an entity would.

/** A k8s/config-map's objects. */
export function configMapObjects(name: string, d: { data?: Record<string, unknown> }): any[] {
    return [{ apiVersion: "v1", kind: "ConfigMap", metadata: { name }, data: strings(d.data) }];
}

/** A k8s/volume's objects. */
export function volumeObjects(name: string, d: { size?: string; storage_class?: string; access_mode?: string }): any[] {
    if (!d.size) throw new Error("size is required");
    const spec: any = { accessModes: [d.access_mode ?? "ReadWriteOnce"], resources: { requests: { storage: d.size } } };
    if (d.storage_class) spec.storageClassName = d.storage_class;
    return [{ apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name }, spec }];
}

/** A k8s/service's objects. */
export function serviceObjects(name: string, d: { app?: string; selector?: Record<string, unknown>; ports?: (number | string)[]; service_type?: string }): any[] {
    const selector = d.selector ? strings(d.selector) : d.app ? { "app.kubernetes.io/name": d.app } : undefined;
    if (!selector) throw new Error("a Service needs app or selector");
    const ports = (d.ports ?? []).map((p) => {
        const x = parsePort(p, "port");
        return named({ name: x.name, port: x.port, targetPort: x.target, protocol: x.protocol });
    });
    if (ports.length === 0) throw new Error("a Service needs ports");
    const type = d.service_type ?? "ClusterIP";
    const spec: any = type.toLowerCase() === "headless" ? { clusterIP: "None", selector, ports } : { type, selector, ports };
    return [{ apiVersion: "v1", kind: "Service", metadata: { name }, spec }];
}
