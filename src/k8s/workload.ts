import k8s from "k8s";
import secret from "secret";
import { NamedObjects, NamedDefinition, NamedState, strings, digest, dnsName, sorted } from "./named.ts";
import { ManagedObject } from "./objects.ts";

/**
 * A file in the container, kept in a ConfigMap.
 * @interface FileDefinition
 */
export interface FileDefinition {
    /** @description Absolute path of the file in the container */
    path: string;
    /** @description What the file holds */
    contents: string;
    /** @description File mode, e.g. 0755 (default 0644) */
    mode?: number;
}

/**
 * A directory in the container that outlives its pods, or a scratch one.
 * @interface VolumeMountDefinition
 */
export interface VolumeMountDefinition {
    /** @description Absolute path to mount the volume at */
    path: string;
    /** @description Size of a new volume, e.g. 10Gi (default 1Gi) */
    size?: string;
    /** @description Storage class of a new volume (default: the cluster's default) */
    storage_class?: string;
    /** @description Name of an existing PersistentVolumeClaim to mount instead, e.g. a k8s/volume's */
    claim?: string;
    /** @description An empty directory that lives as long as the pod, instead of a volume */
    temporary?: boolean;
    /** @description Mount read-only */
    read_only?: boolean;
}

/**
 * A container and how its pods run.
 * @interface WorkloadDefinition
 */
export interface WorkloadDefinition extends NamedDefinition {
    /**
     * @description Container image
     */
    image: string;

    /**
     * @description Name of the container (defaults to the object's name)
     */
    container_name?: string;

    /**
     * @description Labels that pick the pods (default app.kubernetes.io/name: the object's name); the pods get them too
     */
    selector?: Record<string, string>;

    /**
     * @description Command to run instead of the image's entrypoint
     */
    command?: string[];

    /**
     * @description Arguments to the command
     */
    args?: string[];

    /**
     * @description A shell script to run with /bin/sh -c, instead of command
     */
    script?: string;

    /**
     * @description Environment variables
     */
    env?: Record<string, string>;

    /**
     * @description Environment variables from Monk secrets: variable name to secret name. The values are kept in a Kubernetes Secret; list the secrets in permitted-secrets.
     */
    secret_env?: Record<string, string>;

    /**
     * @description ConfigMap whose keys all become environment variables, e.g. a k8s/config-map's name
     */
    env_config_map?: string;

    /**
     * @description Secret whose keys all become environment variables, e.g. a k8s/secret's name
     */
    env_secret?: string;

    /**
     * @description Ports the container listens on: 8080, or 80:8080 to expose container port 8080 as port 80, with /udp for UDP; http=8080 names the port (default tcp-8080), =8080 leaves it unnamed
     */
    ports?: (number | string)[];

    /**
     * @description Service in front of the pods when there are ports: ClusterIP (default), NodePort, LoadBalancer, or none
     */
    service_type?: string;

    /**
     * @description CPU to reserve, e.g. 250m
     */
    cpu?: string;

    /**
     * @description Memory to reserve, e.g. 256Mi
     */
    memory?: string;

    /**
     * @description Most CPU the container may use
     */
    cpu_limit?: string;

    /**
     * @description Most memory the container may use
     */
    memory_limit?: string;

    /**
     * @description Files in the container, by name (files and volumes are words Monk templates keep for runnables)
     */
    config_files?: Record<string, FileDefinition>;

    /**
     * @description Volumes in the container, by name
     */
    storage?: Record<string, VolumeMountDefinition>;

    /**
     * @description Delete the volumes this entity made when they are dropped or the entity is deleted (default false: they are kept, as Monk keeps a runnable's volumes)
     */
    delete_volumes?: boolean;

    /**
     * @description HTTP path that answers 2xx when the container is ready, e.g. /healthz
     */
    readiness_path?: string;

    /**
     * @description Port for the readiness check (defaults to the first port); without readiness_path, a TCP check
     */
    readiness_port?: number;

    /**
     * @description Shell command that succeeds when the container is ready
     */
    readiness_command?: string;

    /**
     * @description Service account the pods run as
     */
    service_account?: string;

    /**
     * @description Name of a Kubernetes Secret with registry credentials for pulling the image
     */
    image_pull_secret?: string;

    /**
     * @description Node labels the pods must run on
     */
    node_selector?: Record<string, string>;

    /**
     * @description Annotations on the pods
     */
    pod_annotations?: Record<string, string>;
}

/**
 * What a workload reports.
 * @interface WorkloadState
 */
export interface WorkloadState extends NamedState {
    /**
     * @description When the values of secret_env last changed, which restarts the pods
     */
    secret_env_changed?: string;
}

export interface Port {
    port: number;
    target: number;
    protocol: string;
    /** Empty for an unnamed port. */
    name: string;
}

/**
 * A port setting: [name=][port:]target[/protocol]. Without name= the port
 * is named <protocol>-<named>, where named is the target for a workload
 * and the port for a Service; with name= and nothing before it, unnamed.
 */
export function parsePort(p: number | string, named: "port" | "target"): Port {
    const s = String(p).trim();
    const m = /^(?:([a-z0-9-]*)=)?(?:(\d+):)?(\d+)(?:\/(tcp|udp|sctp))?$/i.exec(s);
    if (!m) throw new Error(`port "${s}" is not like 8080, 80:8080, 53/udp or http=80:8080`);
    const target = Number(m[3]);
    const protocol = (m[4] ?? "tcp").toUpperCase();
    const port = m[2] ? Number(m[2]) : target;
    const name = m[1] ?? `${protocol.toLowerCase()}-${named === "port" ? port : target}`;
    return { port, target, protocol, name };
}

/** p without an empty name. */
export function named<T extends { name?: string }>(p: T): T {
    if (p.name !== "") return p;
    const { name: _n, ...rest } = p;
    return rest as T;
}

function parsePorts(ports: (number | string)[] | undefined): Port[] {
    return (ports ?? []).map((p) => parsePort(p, "target"));
}

/** s as Kubernetes keeps it in a Secret's data: UTF-8, base64-encoded. */
function base64(s: string): string {
    return btoa(encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16))));
}

/** The pod template and what goes with it. */
export interface Pod {
    template: any;
    /** Objects the pods need: a ConfigMap of files, a Secret of variables, volumes. */
    objects: any[];
    /** Volumes to make per pod, for a StatefulSet. */
    claimTemplates: any[];
    ports: Port[];
}

/**
 * Base for entities that run a container: Deployments, StatefulSets and Jobs.
 */
export abstract class Workload<D extends WorkloadDefinition, S extends WorkloadState> extends NamedObjects<D, S> {
    /**
     * The pod template. With perPod, new volumes are claim templates for a
     * StatefulSet; else they are PersistentVolumeClaims of their own.
     */
    protected pod(name: string, perPod: boolean): Pod {
        const d = this.definition;
        if (!d.image) throw new Error("image is required");
        const ports = parsePorts(d.ports);
        const objects: any[] = [];
        const claimTemplates: any[] = [];
        const annotations = strings(d.pod_annotations);

        const container: any = { name: d.container_name ?? name, image: d.image };
        if (d.script) container.command = ["/bin/sh", "-c", d.script];
        else if (d.command) container.command = d.command.map(String);
        if (d.args) container.args = d.args.map(String);
        if (ports.length > 0) container.ports = ports.map((p) => named({ name: p.name, containerPort: p.target, protocol: p.protocol }));

        const env: any[] = sorted(strings(d.env)).map(([k, v]) => ({ name: k, value: v }));
        const secretEnv = strings(d.secret_env);
        if (Object.keys(secretEnv).length > 0) {
            const sname = `${name}-env`;
            const values: Record<string, string> = {};
            for (const [k, ref] of sorted(secretEnv)) {
                values[k] = secret.get(ref);
                env.push({ name: k, valueFrom: { secretKeyRef: { name: sname, key: k } } });
            }
            objects.push({ apiVersion: "v1", kind: "Secret", metadata: { name: sname }, type: "Opaque", stringData: values });
            this.noteSecretEnv(sname, values);
            if (this.state.secret_env_changed) annotations["monk.io/secret-env-changed"] = this.state.secret_env_changed;
        }
        if (env.length > 0) container.env = env;
        const envFrom: any[] = [];
        if (d.env_config_map) envFrom.push({ configMapRef: { name: d.env_config_map } });
        if (d.env_secret) envFrom.push({ secretRef: { name: d.env_secret } });
        if (envFrom.length > 0) container.envFrom = envFrom;

        const resources: any = {};
        if (d.cpu || d.memory) resources.requests = strings({ cpu: d.cpu, memory: d.memory });
        if (d.cpu_limit || d.memory_limit) resources.limits = strings({ cpu: d.cpu_limit, memory: d.memory_limit });
        if (resources.requests || resources.limits) container.resources = resources;

        const probe = this.readinessProbe(ports);
        if (probe) container.readinessProbe = probe;

        const volumes: any[] = [];
        const mounts: any[] = [];
        const files = sorted(d.config_files);
        if (files.length > 0) {
            const cname = `${name}-files`;
            const data: Record<string, string> = {};
            const items: any[] = [];
            for (const [key, f] of files) {
                if (!f?.path || f.contents === undefined) throw new Error(`config file ${key} needs path and contents`);
                data[key] = String(f.contents);
                items.push(f.mode === undefined ? { key, path: key } : { key, path: key, mode: Number(f.mode) });
                mounts.push({ name: "files", mountPath: f.path, subPath: key, readOnly: true });
            }
            objects.push({ apiVersion: "v1", kind: "ConfigMap", metadata: { name: cname }, data });
            volumes.push({ name: "files", configMap: { name: cname, items } });
            // Files mounted one by one do not follow their ConfigMap, so
            // a change restarts the pods.
            annotations["monk.io/files"] = digest(data);
        }
        for (const [key, v] of sorted(d.storage)) {
            if (!v?.path) throw new Error(`storage ${key} needs a path`);
            const vname = dnsName(key);
            mounts.push(v.read_only ? { name: vname, mountPath: v.path, readOnly: true } : { name: vname, mountPath: v.path });
            if (v.temporary) {
                volumes.push({ name: vname, emptyDir: {} });
                continue;
            }
            if (v.claim) {
                volumes.push({ name: vname, persistentVolumeClaim: { claimName: v.claim } });
                continue;
            }
            const spec: any = { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: v.size ?? "1Gi" } } };
            if (v.storage_class) spec.storageClassName = v.storage_class;
            if (perPod) {
                claimTemplates.push({ metadata: { name: vname }, spec });
            } else {
                const claim = `${name}-${vname}`;
                objects.push({ apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: claim }, spec });
                volumes.push({ name: vname, persistentVolumeClaim: { claimName: claim } });
            }
        }
        if (mounts.length > 0) container.volumeMounts = mounts;

        const spec: any = { containers: [container] };
        if (volumes.length > 0) spec.volumes = volumes;
        if (d.service_account) spec.serviceAccountName = d.service_account;
        if (d.image_pull_secret) spec.imagePullSecrets = [{ name: d.image_pull_secret }];
        if (d.node_selector) spec.nodeSelector = strings(d.node_selector);

        const metadata: any = { labels: { ...this.labels(name), ...this.podSelector(name) } };
        if (Object.keys(annotations).length > 0) metadata.annotations = annotations;
        return { template: { metadata, spec }, objects, claimTemplates, ports };
    }

    /** A Deployment of the pods, and what goes with it; the Deployment first. */
    protected deploymentObjects(name: string, replicas: number | undefined): any[] {
        const pod = this.pod(name, false);
        const hasClaims = pod.objects.some((o) => o.kind === "PersistentVolumeClaim");
        const spec: any = {
            replicas: replicas ?? 1,
            selector: this.selector(name),
            template: pod.template,
        };
        if (hasClaims) spec.strategy = { type: "Recreate" };
        const deployment = { apiVersion: "apps/v1", kind: "Deployment", metadata: { name }, spec };
        const svc = this.serviceFor(name, pod.ports);
        return [deployment, ...(svc ? [svc] : []), ...pod.objects];
    }

    /** The Service in front of the pods, unless there are no ports or service_type is none. */
    protected serviceFor(name: string, ports: Port[]): any | undefined {
        const type = this.definition.service_type ?? "ClusterIP";
        if (ports.length === 0 || type.toLowerCase() === "none") return undefined;
        return {
            apiVersion: "v1", kind: "Service", metadata: { name },
            spec: {
                type,
                selector: this.podSelector(name),
                ports: ports.map((p) => named({ name: p.name, port: p.port, targetPort: p.target, protocol: p.protocol })),
            },
        };
    }

    protected selector(name: string): any {
        return { matchLabels: this.podSelector(name) };
    }

    /** The labels that pick the pods. */
    protected podSelector(name: string): Record<string, string> {
        return this.definition.selector ? strings(this.definition.selector) : { "app.kubernetes.io/name": name };
    }

    protected keeps(o: ManagedObject): boolean {
        return o.kind === "PersistentVolumeClaim" && !this.definition.delete_volumes;
    }

    private readinessProbe(ports: Port[]): any | undefined {
        const d = this.definition;
        const timing = { periodSeconds: 5, failureThreshold: 3 };
        if (d.readiness_command) return { exec: { command: ["/bin/sh", "-c", d.readiness_command] }, ...timing };
        const port = d.readiness_port ?? ports[0]?.target;
        if (d.readiness_path) {
            if (port === undefined) throw new Error("readiness_path needs readiness_port or a port");
            return { httpGet: { path: d.readiness_path, port: Number(port) }, ...timing };
        }
        if (d.readiness_port !== undefined) return { tcpSocket: { port: Number(d.readiness_port) }, ...timing };
        return undefined;
    }

    /**
     * Notes in state when the values of secret_env differ from the
     * Secret's, so the pods restart and read them: variables from a Secret
     * are read only when a container starts.
     */
    private noteSecretEnv(name: string, values: Record<string, string>): void {
        const ns = this.definition.namespace ?? this.defaultNamespace();
        const live = this.k8s(`reading Secret ${ns}/${name}`, (c) =>
            k8s.read(c, { apiVersion: "v1", kind: "Secret", name, namespace: ns }));
        if (live === null) return;
        const data = live.data ?? {};
        const same = Object.keys(values).length === Object.keys(data).length &&
            Object.entries(values).every(([k, v]) => data[k] === base64(v));
        if (!same) this.state.secret_env_changed = new Date().toISOString();
    }
}
