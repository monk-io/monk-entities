/**
 * What helm/template runs and how it reads the result. A plain module so
 * tests can call it directly (entity modules cannot be imported by other
 * modules), since the tasks module has no fake to test against.
 */

/** Where the task writes the manifest, and its values file. */
export const OUT = "/out/manifest.yaml";
export const VALUES = "/work/values.yaml";

export interface RenderInput {
    chart: string;
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
    const env: Record<string, string> = {
        RELEASE: i.release,
        CHART: i.chart,
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
