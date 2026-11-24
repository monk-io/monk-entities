/**
 * What helm/template runs and how it reads the result. A plain module so
 * tests can call it directly (entity modules cannot be imported by other
 * modules), since the tasks module has no fake to test against.
 */

/** Where the task writes the manifest, and its values file. */
export const OUT = "/out/manifest.yaml";
export const VALUES = "/work/values.yaml";

/** Where a chart from a blob is unpacked in the task. */
export const CHART_DIR = "/chart";

export interface RenderInput {
    chart?: string;
    /** A blob holding the chart's directory (Chart.yaml at its root), instead of chart. */
    chart_blob?: string;
    repo?: string;
    version?: string;
    release: string;
    namespace: string;
    values?: Record<string, unknown>;
    kube_version?: string;
    image?: string;
    /** host, user and password for `helm registry login`, from the registry secret. */
    login?: { host: string; user: string; password: string };
}

/** The default image: helm on Alpine. */
export const IMAGE = "alpine/helm:4.3.2";

/**
 * The shell the task runs. Every input comes in through the environment,
 * never spliced into the script, so a value can't change what it runs.
 */
const SCRIPT = `set -eu
mkdir -p /out
if [ -n "\${REGISTRY_PASSWORD:-}" ]; then
  printf '%s' "$REGISTRY_PASSWORD" | helm registry login "$REGISTRY_HOST" -u "$REGISTRY_USER" --password-stdin >/dev/null
fi
set -- template "$RELEASE" "$CHART" --namespace "$NAMESPACE" -f ${VALUES}
[ -n "\${VERSION:-}" ] && set -- "$@" --version "$VERSION"
[ -n "\${REPO:-}" ] && set -- "$@" --repo "$REPO"
[ -n "\${KUBE_VERSION:-}" ] && set -- "$@" --kube-version "$KUBE_VERSION"
helm "$@" > ${OUT}
echo "rendered $(grep -c '^kind:' ${OUT}) objects"`;

/** The task spec that renders the chart. */
export function renderSpec(i: RenderInput): any {
    if (!i.chart === !i.chart_blob) throw new Error("give exactly one of chart or chart_blob");
    const env: Record<string, string> = {
        RELEASE: i.release,
        CHART: i.chart_blob ? CHART_DIR : i.chart!,
        NAMESPACE: i.namespace,
    };
    if (i.version) env.VERSION = i.version;
    if (i.repo) env.REPO = i.repo;
    if (i.kube_version) env.KUBE_VERSION = i.kube_version;
    if (i.login) {
        env.REGISTRY_HOST = i.login.host;
        env.REGISTRY_USER = i.login.user;
        env.REGISTRY_PASSWORD = i.login.password;
    }
    return {
        image: i.image ?? IMAGE,
        entrypoint: ["sh", "-c"],
        command: [SCRIPT],
        env,
        files: { [VALUES]: JSON.stringify(i.values ?? {}) },
        ...(i.chart_blob ? { blobs: { [CHART_DIR]: i.chart_blob } } : {}),
        outputs: [OUT],
        timeout: 600,
    };
}

/** The registry an oci:// chart is in, or undefined for other charts. */
export function registryOf(chart: string): string | undefined {
    const m = /^oci:\/\/([^/]+)/.exec(chart);
    return m ? m[1] : undefined;
}

/**
 * A registry secret's value, "user:password", as the two; a value without a
 * colon is a token with the user "token", as ghcr.io and most registries take.
 */
export function credentials(value: string): { user: string; password: string } {
    const i = value.indexOf(":");
    if (i < 0) return { user: "token", password: value };
    return { user: value.slice(0, i), password: value.slice(i + 1) };
}

/** What a run says: done with a manifest, still going, or failed and why. */
export type Outcome =
    | { kind: "waiting"; why: string }
    | { kind: "done"; manifest: string }
    | { kind: "failed"; why: string };

export function outcome(run: any): Outcome {
    if (!run) return { kind: "failed", why: "the render task is gone" };
    switch (run.state) {
        case "pending":
        case "running":
            return { kind: "waiting", why: `render task is ${run.state}` };
        case "succeeded": {
            const manifest = run.outputs?.[OUT];
            if (manifest === undefined) return { kind: "failed", why: `the render task wrote no ${OUT}${run.error ? `: ${run.error}` : ""}` };
            return { kind: "done", manifest };
        }
        default: {
            const tail = String(run.stderr || run.error || "").trim().split("\n").slice(-5).join("\n");
            const code = run.exitCode !== undefined && run.exitCode !== null ? ` (exit ${run.exitCode})` : "";
            return { kind: "failed", why: `render task ${run.state}${code}${tail ? `: ${tail}` : ""}` };
        }
    }
}

/** An image reference's parts: registry host, repository, tag and digest. */
export interface ImageRef {
    registry: string;
    repository: string;
    tag: string;
    digest?: string;
}

/** Splits an image reference as Docker does: no host means Docker Hub, and a one-part name is under library/. */
export function parseImage(image: string): ImageRef {
    let rest = image;
    let digest: string | undefined;
    const at = rest.indexOf("@");
    if (at >= 0) {
        digest = rest.slice(at + 1);
        rest = rest.slice(0, at);
    }
    let registry = "docker.io";
    const slash = rest.indexOf("/");
    if (slash >= 0) {
        const first = rest.slice(0, slash);
        if (first.includes(".") || first.includes(":") || first === "localhost") {
            registry = first;
            rest = rest.slice(slash + 1);
        }
    }
    let tag = "latest";
    const colon = rest.lastIndexOf(":");
    if (colon >= 0) {
        tag = rest.slice(colon + 1);
        rest = rest.slice(0, colon);
    }
    if (registry === "docker.io" && !rest.includes("/")) rest = `library/${rest}`;
    return { registry, repository: rest, tag, ...(digest ? { digest } : {}) };
}

const POD_SPEC_PATHS: Record<string, string[]> = {
    Pod: ["spec"],
    Deployment: ["spec", "template", "spec"],
    StatefulSet: ["spec", "template", "spec"],
    DaemonSet: ["spec", "template", "spec"],
    ReplicaSet: ["spec", "template", "spec"],
    Job: ["spec", "template", "spec"],
    CronJob: ["spec", "jobTemplate", "spec", "template", "spec"],
};

function podSpec(obj: any): any | undefined {
    const path = POD_SPEC_PATHS[obj?.kind];
    if (!path) return undefined;
    let x = obj;
    for (const k of path) x = x?.[k];
    return x;
}

function containersOf(spec: any): any[] {
    return [...(spec?.initContainers ?? []), ...(spec?.containers ?? []), ...(spec?.ephemeralContainers ?? [])];
}

/** Whether image matches one of patterns, where * matches anything (slashes included). */
export function matches(image: string, patterns: string[]): boolean {
    return patterns.some((p) => new RegExp("^" + p.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(image));
}

/** The images of the objects' containers that match patterns and have no digest yet. */
export function imagesToPin(objs: any[], patterns: string[]): string[] {
    const out: string[] = [];
    for (const obj of objs) {
        for (const c of containersOf(podSpec(obj))) {
            const img = c?.image;
            if (typeof img !== "string" || img.includes("@") || !matches(img, patterns)) continue;
            if (!out.includes(img)) out.push(img);
        }
    }
    return out;
}

/** The objects with each image in digests pinned: `repo:tag` becomes `repo:tag@sha256:...`. */
export function pinned(objs: any[], digests: Record<string, string>): any[] {
    const copy = JSON.parse(JSON.stringify(objs));
    for (const obj of copy) {
        for (const c of containersOf(podSpec(obj))) {
            const d = digests[c?.image];
            if (d) c.image = `${c.image}@${d}`;
        }
    }
    return copy;
}

/** Objects as a manifest: one JSON document each, which is YAML too. */
export function toManifest(objs: any[]): string {
    return objs.map((o) => JSON.stringify(o)).join("\n---\n") + "\n";
}

/** A response header, whatever its case. */
export function header(headers: Record<string, string> | undefined, name: string): string | undefined {
    const want = name.toLowerCase();
    for (const [k, v] of Object.entries(headers ?? {})) if (k.toLowerCase() === want) return v;
    return undefined;
}

/** realm, service and scope of a `Bearer realm="...",service="...",scope="..."` challenge. */
export function bearerChallenge(value: string | undefined): Record<string, string> | undefined {
    if (!value || !/^Bearer\s/i.test(value)) return undefined;
    const out: Record<string, string> = {};
    for (const m of value.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
    return out.realm ? out : undefined;
}

/** What resolveDigest sends requests with: http.do, or a stub in tests. */
export type Send = (url: string, options: { method: string; headers?: Record<string, string> }) => { statusCode: number; headers: Record<string, string>; body: string };

const ACCEPT = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

/**
 * The digest an image's tag points at now, from its registry's API: a HEAD
 * of the manifest, answering a Bearer challenge with a token (with login
 * when given, anonymous otherwise) as Docker does.
 */
export function resolveDigest(image: string, send: Send, login?: { user: string; password: string }): string {
    const ref = parseImage(image);
    const host = ref.registry === "docker.io" ? "registry-1.docker.io" : ref.registry;
    const url = `https://${host}/v2/${ref.repository}/manifests/${ref.tag}`;
    const basic = login ? `Basic ${btoa(`${login.user}:${login.password}`)}` : undefined;
    let auth = basic;
    for (let attempt = 0; attempt < 2; attempt++) {
        const r = send(url, { method: "HEAD", headers: { Accept: ACCEPT, ...(auth ? { Authorization: auth } : {}) } });
        if (r.statusCode >= 200 && r.statusCode < 300) {
            const d = header(r.headers, "Docker-Content-Digest");
            if (!d) throw new Error(`${image}: the registry gave no Docker-Content-Digest`);
            return d;
        }
        const challenge = r.statusCode === 401 ? bearerChallenge(header(r.headers, "WWW-Authenticate")) : undefined;
        if (!challenge || attempt > 0) throw new Error(`${image}: ${r.statusCode} from ${host}${r.statusCode === 404 ? " (no such tag yet?)" : ""}`);
        const q = [`service=${encodeURIComponent(challenge.service ?? "")}`, `scope=${encodeURIComponent(challenge.scope ?? `repository:${ref.repository}:pull`)}`].join("&");
        const t = send(`${challenge.realm}?${q}`, { method: "GET", headers: basic ? { Authorization: basic } : {} });
        if (t.statusCode < 200 || t.statusCode >= 300) throw new Error(`${image}: token from ${challenge.realm}: ${t.statusCode}`);
        const body = JSON.parse(t.body || "{}");
        const token = body.token ?? body.access_token;
        if (!token) throw new Error(`${image}: no token from ${challenge.realm}`);
        auth = `Bearer ${token}`;
    }
    throw new Error(`${image}: unreachable`);
}
