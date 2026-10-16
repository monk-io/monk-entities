import { isMap, keyOrder } from "./named.ts";
import { ConfigMapObjects, DeploymentObjects, ServiceObjects, VolumeObjects } from "./builders.ts";
import { asManifest, setBy } from "./manifest.ts";

// What each typed entity would apply, rendered by the class the entity
// itself extends; these are not entities of their own.
class DeploymentRender extends DeploymentObjects<any, any> {}
class ServiceRender extends ServiceObjects<any, any> {}
class ConfigMapRender extends ConfigMapObjects<any, any> {}
class VolumeRender extends VolumeObjects<any, any> {}

/** A typed entity for an object: its type and its settings. */
export interface Typed {
    type: string;
    fields: Record<string, unknown>;
}

/** The typed entity that maps an object as it is, or why there is none. */
export interface Choice {
    typed?: Typed;
    reason?: string;
}

/** Reads an object's settings off its manifest, or says why it cannot. */
type Lift = (m: any) => Record<string, unknown> | string;

interface Kind {
    type: string;
    entity: new (definition: any, state: any, ctx: any) => { manifests(): any[] };
    lift: Lift;
}

const KINDS: Record<string, Kind> = {
    "apps/v1 Deployment": { type: "k8s/deployment", entity: DeploymentRender, lift: liftDeployment },
    "v1 Service": { type: "k8s/service", entity: ServiceRender, lift: liftService },
    "v1 ConfigMap": { type: "k8s/config-map", entity: ConfigMapRender, lift: liftConfigMap },
    "v1 PersistentVolumeClaim": { type: "k8s/volume", entity: VolumeRender, lift: liftVolume },
};

/** Kinds with a typed entity that an import cannot use, and why. */
const NOT_LIFTED: Record<string, string> = {
    "v1 Secret": "k8s/secret would need the values in Monk; they stay on the cluster",
    "apps/v1 StatefulSet": "k8s/stateful-set makes a headless Service of its own",
    "batch/v1 Job": "a Job runs once; k8s/job would run it again",
    "networking.k8s.io/v1 Ingress": "k8s/ingress is not mapped yet",
};

/**
 * The typed entity that maps live with the given connection settings, if
 * one renders it exactly: every field the entity would set has the value
 * the cluster has, and every other field the cluster has is one it fills
 * in by default. Promoting such an entity to manage then changes nothing.
 * Otherwise the reason, for a comment over the k8s/resource used instead;
 * none for a kind with no typed entity.
 */
export function typedFor(live: any, connection: Record<string, unknown>): Choice {
    const key = `${live.apiVersion} ${live.kind}`;
    const kind = KINDS[key];
    if (!kind) return NOT_LIFTED[key] ? { reason: NOT_LIFTED[key] } : {};
    const m = asManifest(live);
    const why = pinned(live, kind.type);
    if (why) return { reason: why };
    const fields = kind.lift(m);
    if (typeof fields === "string") return { reason: `${kind.type}: ${fields}` };
    const script = arrowScript(fields);
    if (script) return { reason: `${kind.type}: ${script} starts with <-, which Monk would read as ArrowScript` };
    let rendered: any[];
    try {
        const ent = new kind.entity({ ...connection, ...fields, mode: "observe" }, {}, { path: `import/${m.metadata.name}` });
        rendered = ent.manifests();
    } catch (e) {
        return { reason: `${kind.type}: ${(e as Error).message}` };
    }
    if (rendered.length !== 1) {
        const extra = rendered.slice(1).map((o) => `${o.kind} ${o.metadata?.name}`).join(", ");
        return { reason: `${kind.type} would also make ${extra}` };
    }
    const unset: string[] = [];
    const different: string[] = [];
    compare(rendered[0], m, [], unset, different);
    if (unset.length === 0 && different.length === 0) return { typed: { type: kind.type, fields } };
    const parts: string[] = [];
    if (unset.length > 0) parts.push(`has no setting for ${some(unset)}`);
    if (different.length > 0) parts.push(`would set ${some(different)} differently`);
    return { reason: `${kind.type} ${parts.join("; it ")}` };
}

function some(paths: string[]): string {
    return paths.length <= 3 ? paths.join(", ") : `${paths.slice(0, 3).join(", ")} and ${paths.length - 3} more`;
}

/**
 * Fields the cluster picks when nobody does, but someone may set: a
 * NodePort, a Service's IPs and IP families, the volume a claim binds. A
 * typed entity has no setting for them, so an object that has one set by
 * hand stays a k8s/resource, whose manifest keeps it.
 */
const PINNED = ["nodePort", "healthCheckNodePort", "clusterIP", "clusterIPs", "ipFamilyPolicy", "ipFamilies", "volumeName"];

/** Why live needs a setting its typed entity lacks, if it does. */
function pinned(live: any, type: string): string | undefined {
    if (live.kind === "Service" && live.spec?.clusterIP === "None") {
        // Headless: the typed entity asks for None itself.
        live = { ...live, spec: { ...live.spec, clusterIP: undefined, clusterIPs: undefined } };
    }
    const byHand = PINNED.filter((f) => setBy(live, f) === true);
    if (byHand.length > 0) return `${type} has no setting for ${byHand.join(", ")}, which was set by hand`;
    const unknown = PINNED.filter((f) => setBy(live, f) === undefined);
    if (unknown.length > 0) return `${type} has no setting for ${unknown.join(", ")}, and with no managedFields there is no telling whether the cluster picked it`;
    return undefined;
}

/** The path of the first string in v that Monk would read as ArrowScript. */
function arrowScript(v: unknown, path = ""): string | undefined {
    if (typeof v === "string") return v.trimStart().startsWith("<-") ? path : undefined;
    if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i++) {
            const p = arrowScript(v[i], `${path}[${i}]`);
            if (p) return p;
        }
        return undefined;
    }
    if (isMap(v)) {
        for (const [k, x] of Object.entries(v)) {
            const p = arrowScript(x, path ? `${path}.${k}` : k);
            if (p) return p;
        }
    }
    return undefined;
}

/** Whether names are in the order Monk keeps a map's keys in. */
function inOrder(names: string[]): boolean {
    return names.every((n, i) => i === 0 || keyOrder(names[i - 1], n) < 0);
}

/** The settings every typed entity takes from metadata. */
function meta(m: any): Record<string, unknown> {
    const f: Record<string, unknown> = { name: m.metadata.name, standard_labels: false };
    if (filled(m.metadata.labels)) f.labels = m.metadata.labels;
    if (filled(m.metadata.annotations)) f.annotations = m.metadata.annotations;
    return f;
}

function liftDeployment(m: any): Record<string, unknown> | string {
    const spec = m.spec ?? {};
    const pod = spec.template?.spec ?? {};
    const containers = pod.containers ?? [];
    if (containers.length !== 1) return `the pods run ${containers.length} containers, and it runs one`;
    if ((pod.initContainers ?? []).length > 0) return "it has no init containers";
    if ((spec.selector?.matchExpressions ?? []).length > 0) return "its selector takes labels, not expressions";
    const c = containers[0];
    const f = meta(m);
    f.image = c.image;
    if (c.name !== m.metadata.name) f.container_name = c.name;
    f.selector = spec.selector?.matchLabels ?? {};
    if (spec.replicas !== undefined) f.replicas = spec.replicas;
    if (c.command) f.command = c.command;
    if (c.args) f.args = c.args;

    const env: Record<string, string> = {};
    // Variables and volumes are maps in the template, which Monk keeps
    // sorted, so the entity writes them sorted; other orders would change.
    if (!inOrder((c.env ?? []).map((e: any) => e.name))) return "its variables are not in alphabetical order, as it keeps them";
    if (!inOrder((c.volumeMounts ?? []).map((v: any) => v.name))) return "its volumes are not in alphabetical order, as it keeps them";
    if (!inOrder((pod.volumes ?? []).map((v: any) => v.name))) return "its volumes are not in alphabetical order, as it keeps them";
    for (const e of c.env ?? []) {
        if (e.valueFrom) return `variable ${e.name} is read from a ${Object.keys(e.valueFrom)[0]}`;
        env[e.name] = e.value ?? "";
    }
    if (filled(env)) f.env = env;
    for (const e of c.envFrom ?? []) {
        if (e.prefix) return "variables from envFrom take no prefix";
        if (e.configMapRef && f.env_config_map === undefined) f.env_config_map = e.configMapRef.name;
        else if (e.secretRef && f.env_secret === undefined) f.env_secret = e.secretRef.name;
        else return "it reads variables from one ConfigMap and one Secret at most";
    }

    const ports = (c.ports ?? []).map((p: any) => {
        const proto = String(p.protocol ?? "TCP").toLowerCase();
        const name = p.name === `${proto}-${p.containerPort}` ? "" : `${p.name ?? ""}=`;
        return `${name}${p.containerPort}${proto === "tcp" ? "" : `/${proto}`}`;
    });
    if (ports.length > 0) {
        f.ports = ports;
        // The Service is an object of its own, imported on its own.
        f.service_type = "none";
    }

    const req = c.resources?.requests ?? {};
    const lim = c.resources?.limits ?? {};
    if (req.cpu !== undefined) f.cpu = req.cpu;
    if (req.memory !== undefined) f.memory = req.memory;
    if (lim.cpu !== undefined) f.cpu_limit = lim.cpu;
    if (lim.memory !== undefined) f.memory_limit = lim.memory;

    const probe = c.readinessProbe;
    if (probe?.exec) {
        const cmd = probe.exec.command ?? [];
        if (cmd.length !== 3 || cmd[0] !== "/bin/sh" || cmd[1] !== "-c") return "its readiness command runs through /bin/sh -c";
        f.readiness_command = cmd[2];
    } else if (probe?.httpGet) {
        f.readiness_path = probe.httpGet.path;
        f.readiness_port = probe.httpGet.port;
    } else if (probe?.tcpSocket) {
        f.readiness_port = probe.tcpSocket.port;
    }

    const storage: Record<string, unknown> = {};
    for (const mount of c.volumeMounts ?? []) {
        if (mount.subPath) return `volume ${mount.name} is mounted by subPath`;
        const v = (pod.volumes ?? []).find((x: any) => x.name === mount.name);
        const s: Record<string, unknown> = { path: mount.mountPath };
        if (v?.emptyDir && !filled(v.emptyDir)) s.temporary = true;
        else if (v?.persistentVolumeClaim) s.claim = v.persistentVolumeClaim.claimName;
        else return `volume ${mount.name} is not a claim or an empty directory`;
        if (mount.readOnly) s.read_only = true;
        storage[mount.name] = s;
    }
    if (filled(storage)) f.storage = storage;

    if (pod.serviceAccountName) f.service_account = pod.serviceAccountName;
    if ((pod.imagePullSecrets ?? []).length === 1) f.image_pull_secret = pod.imagePullSecrets[0].name;
    if (filled(pod.nodeSelector)) f.node_selector = pod.nodeSelector;
    if (filled(spec.template?.metadata?.annotations)) f.pod_annotations = spec.template.metadata.annotations;
    return f;
}

function liftService(m: any): Record<string, unknown> | string {
    const spec = m.spec ?? {};
    if (spec.type === "ExternalName") return "it makes no ExternalName Service";
    if (!filled(spec.selector)) return "it needs a selector, and this Service has none";
    const f = meta(m);
    if (spec.clusterIP === "None") f.service_type = "headless";
    else if (spec.type && spec.type !== "ClusterIP") f.service_type = spec.type;
    f.selector = spec.selector;
    const ports: string[] = [];
    for (const p of spec.ports ?? []) {
        if (typeof p.targetPort === "string") return `port ${p.port} sends to a port named ${p.targetPort}`;
        const proto = String(p.protocol ?? "TCP").toLowerCase();
        const target = p.targetPort ?? p.port;
        const name = p.name === `${proto}-${p.port}` ? "" : `${p.name ?? ""}=`;
        ports.push(`${name}${target === p.port ? p.port : `${p.port}:${target}`}${proto === "tcp" ? "" : `/${proto}`}`);
    }
    f.ports = ports;
    return f;
}

function liftConfigMap(m: any): Record<string, unknown> | string {
    if (filled(m.binaryData)) return "it keeps no binary data";
    const f = meta(m);
    f.data = m.data ?? {};
    return f;
}

function liftVolume(m: any): Record<string, unknown> | string {
    const spec = m.spec ?? {};
    const modes = spec.accessModes ?? [];
    if (modes.length !== 1) return `it takes one access mode, and this claim has ${modes.length}`;
    const f = meta(m);
    f.size = spec.resources?.requests?.storage;
    if (spec.storageClassName) f.storage_class = spec.storageClassName;
    if (modes[0] !== "ReadWriteOnce") f.access_mode = modes[0];
    return f;
}

/**
 * Fields the cluster fills in, with the value it fills in, by path; a
 * number in a path is *. A field at one of these paths with that value is
 * not one the import has to carry.
 */
const DEFAULTS: Record<string, unknown> = {
    "spec.progressDeadlineSeconds": 600,
    "spec.revisionHistoryLimit": 10,
    "spec.strategy": { type: "RollingUpdate", rollingUpdate: { maxSurge: "25%", maxUnavailable: "25%" } },
    "spec.template.metadata.creationTimestamp": null,
    "spec.template.spec.dnsPolicy": "ClusterFirst",
    "spec.template.spec.restartPolicy": "Always",
    "spec.template.spec.schedulerName": "default-scheduler",
    "spec.template.spec.securityContext": {},
    "spec.template.spec.terminationGracePeriodSeconds": 30,
    "spec.template.spec.containers.*.terminationMessagePath": "/dev/termination-log",
    "spec.template.spec.containers.*.terminationMessagePolicy": "File",
    "spec.template.spec.containers.*.resources": {},
    "spec.template.spec.containers.*.readinessProbe.timeoutSeconds": 1,
    "spec.template.spec.containers.*.readinessProbe.successThreshold": 1,
    "spec.template.spec.containers.*.readinessProbe.httpGet.scheme": "HTTP",
    "spec.sessionAffinity": "None",
    "spec.internalTrafficPolicy": "Cluster",
    "spec.externalTrafficPolicy": "Cluster",
    "spec.allocateLoadBalancerNodePorts": true,
    "spec.type": "ClusterIP",
    "spec.volumeMode": "Filesystem",
};

/**
 * Fields the cluster allocates or picks, whatever their value; the ones
 * someone may pin (PINNED) are checked before an object gets this far.
 */
const ALLOCATED = ["spec.clusterIPs", "spec.ipFamilies", "spec.ipFamilyPolicy", "spec.ports.*.nodePort", "spec.healthCheckNodePort", "spec.volumeName"];

/** Whether the cluster put value at path in parent by itself. */
function byCluster(path: string[], value: unknown, parent: any): boolean {
    const p = path.map((s) => (/^\d+$/.test(s) ? "*" : s)).join(".");
    if (ALLOCATED.includes(p)) return true;
    if (p in DEFAULTS) return canonical(DEFAULTS[p]) === canonical(value);
    if (p === "spec.template.spec.containers.*.imagePullPolicy") {
        const tag = /:([^:/@]+)$/.exec(String(parent.image ?? ""))?.[1];
        return value === (tag === undefined || tag === "latest" ? "Always" : "IfNotPresent");
    }
    // Set with serviceAccountName, the name it replaced.
    if (p === "spec.template.spec.serviceAccount") return value === parent.serviceAccountName;
    return false;
}

/**
 * Notes where want, an object an entity renders, and have, the object as
 * the cluster has it, part: fields want sets that have lacks or holds
 * differently, and fields have holds that want does not set and that the
 * cluster did not fill in.
 */
function compare(want: any, have: any, path: string[], unset: string[], different: string[]): void {
    if (isMap(want) && isMap(have)) {
        for (const [k, w] of Object.entries(want)) {
            if (have[k] === undefined) {
                if (filled(w)) different.push(show([...path, k]));
                continue;
            }
            compare(w, have[k], [...path, k], unset, different);
        }
        for (const [k, h] of Object.entries(have)) {
            if (k in want || h === undefined) continue;
            if (!byCluster([...path, k], h, have)) unset.push(show([...path, k]));
        }
        return;
    }
    if (Array.isArray(want) && Array.isArray(have) && want.length === have.length) {
        want.forEach((w, i) => compare(w, have[i], [...path, String(i)], unset, different));
        return;
    }
    if (canonical(want) !== canonical(have)) different.push(show(path));
}

function show(path: string[]): string {
    return path.map((s) => (/^[A-Za-z0-9_-]+$/.test(s) ? s : JSON.stringify(s))).join(".");
}

/** Whether v is more than nothing: a map or list with something in it, or a value. */
function filled(v: unknown): boolean {
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (isMap(v)) return Object.keys(v).length > 0;
    return true;
}

/** v as JSON with map keys sorted, so equal values print the same. */
function canonical(v: unknown): string {
    if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
    if (isMap(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
    return JSON.stringify(v ?? null);
}

/** Words YAML 1.1 reads as a boolean or null rather than a string. */
const YAML_WORDS = /^(y|yes|n|no|true|false|on|off|null)$/i;

/** A template key: plain when YAML reads it back as written, else quoted. */
function yamlKey(k: string): string {
    return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(k) && !YAML_WORDS.test(k) ? k : JSON.stringify(k);
}

/**
 * The YAML lines that set key to v at the given indent: maps as blocks,
 * lists of values in flow style, text with line breaks as a literal
 * block, other values as JSON, which YAML reads the same.
 */
export function yamlField(key: string, v: unknown, indent: string): string[] {
    const script = arrowScript(v, key);
    if (script) throw new Error(`${script} starts with <-, which Monk would read as ArrowScript`);
    const k = `${indent}${yamlKey(key)}:`;
    if (isMap(v)) {
        if (!filled(v)) return [`${k} {}`];
        return [k, ...Object.entries(v).flatMap(([ck, cv]) => yamlField(ck, cv, `${indent}  `))];
    }
    if (Array.isArray(v)) return [`${k} ${JSON.stringify(v)}`];
    if (typeof v === "string" && v.includes("\n") && !/^\s/.test(v) && !/[ \t]\n|[ \t]$|\r/.test(v) && !v.endsWith("\n\n")) {
        const body = v.endsWith("\n") ? v.slice(0, -1) : v;
        return [`${k} ${v.endsWith("\n") ? "|" : "|-"}`, ...body.split("\n").map((l) => (l === "" ? "" : `${indent}  ${l}`))];
    }
    return [`${k} ${typeof v === "string" ? JSON.stringify(v) : String(v)}`];
}
