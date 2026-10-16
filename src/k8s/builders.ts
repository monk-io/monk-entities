import { NamedObjects, NamedDefinition, NamedState, strings } from "./named.ts";
import { Workload, WorkloadDefinition, WorkloadState, parsePort, named } from "./workload.ts";

// What the typed object entities apply, from their settings. Each entity
// extends its class here, and an import renders objects through the same
// class, so the two cannot drift apart.

/**
 * A Service in front of pods.
 * @interface ServiceDefinition
 */
export interface ServiceDefinition extends NamedDefinition {
    /**
     * @description Pods to send traffic to, by their app.kubernetes.io/name label: the name of a k8s/deployment or k8s/stateful-set
     */
    app?: string;

    /**
     * @description Pods to send traffic to, by labels (instead of app)
     */
    selector?: Record<string, string>;

    /**
     * @description Ports: 80, or 80:8080 to send port 80 to the pods' 8080, with /udp for UDP; http=80:8080 names the port (default tcp-80), =80 leaves it unnamed
     */
    ports: (number | string)[];

    /**
     * @description ClusterIP (default), NodePort, LoadBalancer or Headless
     */
    service_type?: string;
}

/**
 * Settings, as a ConfigMap.
 * @interface ConfigMapDefinition
 */
export interface ConfigMapDefinition extends NamedDefinition {
    /**
     * @description The settings: key to value
     */
    data: Record<string, string>;
}

/**
 * A volume pods can mount.
 * @interface VolumeDefinition
 */
export interface VolumeDefinition extends NamedDefinition {
    /**
     * @description Size, e.g. 10Gi
     */
    size: string;

    /**
     * @description Storage class (default: the cluster's default)
     */
    storage_class?: string;

    /**
     * @description ReadWriteOnce (default), ReadWriteMany, ReadOnlyMany or ReadWriteOncePod
     */
    access_mode?: string;

    /**
     * @description Delete the volume and its data when the entity is deleted (default false: it is kept, as Monk keeps a runnable's volumes)
     */
    delete_volumes?: boolean;
}

/** What k8s/deployment applies. */
export abstract class DeploymentObjects<D extends WorkloadDefinition & { replicas?: number }, S extends WorkloadState> extends Workload<D, S> {
    protected kind(): string {
        return "Deployment";
    }

    protected build(name: string): any[] {
        return this.deploymentObjects(name, this.definition.replicas);
    }
}

/** What k8s/service applies. */
export abstract class ServiceObjects<D extends ServiceDefinition, S extends NamedState> extends NamedObjects<D, S> {
    protected kind(): string {
        return "Service";
    }

    protected build(name: string): any[] {
        return serviceObjects(name, this.definition);
    }
}

/** What k8s/config-map applies. */
export abstract class ConfigMapObjects<D extends ConfigMapDefinition, S extends NamedState> extends NamedObjects<D, S> {
    protected kind(): string {
        return "ConfigMap";
    }

    protected build(name: string): any[] {
        return configMapObjects(name, this.definition);
    }
}

/** What k8s/volume applies. */
export abstract class VolumeObjects<D extends VolumeDefinition, S extends NamedState> extends NamedObjects<D, S> {
    protected kind(): string {
        return "PersistentVolumeClaim";
    }

    protected build(name: string): any[] {
        return volumeObjects(name, this.definition);
    }
}

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
