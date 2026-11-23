// Tests for what helm/template runs, by `monk entity test src/helm`. The
// entity itself runs its render in a task, which has no fake: it is tested
// live (README).
import { test, expect } from "monk/test";
import { renderSpec, registryOf, credentials, outcome, OUT, VALUES, IMAGE, CHART_DIR, parseImage, imagesToPin, pinned, toManifest, resolveDigest, matches } from "../render.ts";

test("the render task gets every input in its environment, and the values as a file", () => {
    const spec = renderSpec({
        chart: "oci://ghcr.io/acme/charts/app", version: "0.1.0-abc", release: "app", namespace: "capsule-x",
        values: { image: { tag: "abc" }, loadgen: { enabled: false } },
        login: { host: "ghcr.io", user: "token", password: "s3cret" },
    });
    expect(spec.image).toBe(IMAGE);
    expect(spec.entrypoint).toEqual(["sh", "-c"]);
    expect(spec.env).toEqual({
        RELEASE: "app", CHART: "oci://ghcr.io/acme/charts/app", NAMESPACE: "capsule-x", VERSION: "0.1.0-abc",
        REGISTRY_HOST: "ghcr.io", REGISTRY_USER: "token", REGISTRY_PASSWORD: "s3cret",
    });
    expect(JSON.parse(spec.files[VALUES])).toEqual({ image: { tag: "abc" }, loadgen: { enabled: false } });
    expect(spec.outputs).toEqual([OUT]);
    // Inputs never reach the script's text.
    expect(spec.command[0].includes("capsule-x") || spec.command[0].includes("s3cret")).toBe(false);
});

test("a chart without login, version or repo leaves them out", () => {
    const spec = renderSpec({ chart: "./chart", release: "r", namespace: "n" });
    expect(Object.keys(spec.env).sort()).toEqual(["CHART", "NAMESPACE", "RELEASE"]);
    expect(spec.files[VALUES]).toBe("{}");
});

test("registries and credentials", () => {
    expect(registryOf("oci://ghcr.io/acme/charts/app")).toBe("ghcr.io");
    expect(registryOf("bitnami/postgresql")).toBeUndefined();
    expect(credentials("ghp_abc")).toEqual({ user: "token", password: "ghp_abc" });
    expect(credentials("bot:pa:ss")).toEqual({ user: "bot", password: "pa:ss" });
});

test("a run's outcome: waiting, the manifest, or why it failed", () => {
    expect(outcome({ state: "running" })).toEqual({ kind: "waiting", why: "render task is running" });
    expect(outcome({ state: "succeeded", outputs: { [OUT]: "kind: Service\n" } })).toEqual({ kind: "done", manifest: "kind: Service\n" });
    expect(outcome({ state: "succeeded", outputs: {} }).kind).toBe("failed");
    expect(outcome({ state: "failed", exitCode: 1, stderr: "pulling\nError: chart \"app\" version \"9\" not found\n" })).toEqual({
        kind: "failed", why: "render task failed (exit 1): pulling\nError: chart \"app\" version \"9\" not found",
    });
    expect(outcome({ state: "lost", error: "monkd on its node stopped" })).toEqual({ kind: "failed", why: "render task lost: monkd on its node stopped" });
    expect(outcome(undefined).kind).toBe("failed");
});

test("a chart from a blob is unpacked in the task and rendered from there", () => {
    const spec = renderSpec({ chart_blob: "9f2c1e", release: "app", namespace: "capsule-x" });
    expect(spec.blobs).toEqual({ [CHART_DIR]: "9f2c1e" });
    expect(spec.env.CHART).toBe(CHART_DIR);
    expect(() => renderSpec({ release: "a", namespace: "n" })).toThrow(/chart or chart_blob/);
    expect(() => renderSpec({ chart: "x", chart_blob: "y", release: "a", namespace: "n" })).toThrow(/chart or chart_blob/);
});

test("image references are split as Docker does", () => {
    expect(parseImage("cassandra:5.0.9")).toEqual({ registry: "docker.io", repository: "library/cassandra", tag: "5.0.9" });
    expect(parseImage("ghcr.io/acme/app/notes:capsule-x")).toEqual({ registry: "ghcr.io", repository: "acme/app/notes", tag: "capsule-x" });
    expect(parseImage("localhost:5000/web")).toEqual({ registry: "localhost:5000", repository: "web", tag: "latest" });
    expect(parseImage("acme/web@sha256:ab")).toEqual({ registry: "docker.io", repository: "acme/web", tag: "latest", digest: "sha256:ab" });
});

const OBJS: any[] = [
    { kind: "Deployment", metadata: { name: "notes" }, spec: { template: { spec: { initContainers: [{ name: "i", image: "busybox:1" }], containers: [{ name: "n", image: "ghcr.io/acme/notes:x" }] } } } },
    { kind: "StatefulSet", metadata: { name: "db" }, spec: { template: { spec: { containers: [{ name: "c", image: "cassandra:5.0.9" }] } } } },
    { kind: "CronJob", metadata: { name: "j" }, spec: { jobTemplate: { spec: { template: { spec: { containers: [{ name: "j", image: "ghcr.io/acme/notes:x" }, { name: "k", image: "ghcr.io/acme/search:x@sha256:00" }] } } } } } },
    { kind: "Service", metadata: { name: "s" }, spec: {} },
];

test("only matching images without a digest are pinned, everywhere they are used", () => {
    expect(matches("ghcr.io/acme/notes:x", ["ghcr.io/acme/*"])).toBe(true);
    expect(matches("ghcr.io/other/notes:x", ["ghcr.io/acme/*"])).toBe(false);
    expect(imagesToPin(OBJS, ["ghcr.io/acme/*"])).toEqual(["ghcr.io/acme/notes:x"]);
    expect(imagesToPin(OBJS, ["*"])).toEqual(["busybox:1", "ghcr.io/acme/notes:x", "cassandra:5.0.9"]);
    const p = pinned(OBJS, { "ghcr.io/acme/notes:x": "sha256:11" });
    expect(p[0].spec.template.spec.containers[0].image).toBe("ghcr.io/acme/notes:x@sha256:11");
    expect(p[2].spec.jobTemplate.spec.template.spec.containers[0].image).toBe("ghcr.io/acme/notes:x@sha256:11");
    expect(p[1].spec.template.spec.containers[0].image).toBe("cassandra:5.0.9");
    // The input is left as it was.
    expect(OBJS[0].spec.template.spec.containers[0].image).toBe("ghcr.io/acme/notes:x");
    expect(toManifest([{ a: 1 }, { b: 2 }])).toBe('{"a":1}\n---\n{"b":2}\n');
});

test("a digest comes from a HEAD of the manifest, after a Bearer challenge is answered", () => {
    const sent: string[] = [];
    const send = (url: string, o: { method: string; headers?: Record<string, string> }) => {
        sent.push(`${o.method} ${url} ${o.headers?.Authorization ?? "-"}`);
        if (url.startsWith("https://ghcr.io/token")) return { statusCode: 200, headers: {}, body: JSON.stringify({ token: "tok" }) };
        if (o.headers?.Authorization === "Bearer tok") return { statusCode: 200, headers: { "docker-content-digest": "sha256:abc" }, body: "" };
        return { statusCode: 401, headers: { "Www-Authenticate": 'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:acme/notes:pull"' }, body: "" };
    };
    expect(resolveDigest("ghcr.io/acme/notes:x", send, { user: "token", password: "p" })).toBe("sha256:abc");
    expect(sent).toEqual([
        `HEAD https://ghcr.io/v2/acme/notes/manifests/x Basic ${btoa("token:p")}`,
        `GET https://ghcr.io/token?service=ghcr.io&scope=repository%3Aacme%2Fnotes%3Apull Basic ${btoa("token:p")}`,
        "HEAD https://ghcr.io/v2/acme/notes/manifests/x Bearer tok",
    ]);
    const missing = () => ({ statusCode: 404, headers: {}, body: "" });
    expect(() => resolveDigest("cassandra:9", missing)).toThrow(/404 from registry-1.docker.io \(no such tag yet\?\)/);
});
