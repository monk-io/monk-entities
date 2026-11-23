// Tests for what helm/template runs, by `monk entity test src/helm`. The
// entity itself runs its render in a task, which has no fake: it is tested
// live (README).
import { test, expect } from "monk/test";
import { renderSpec, registryOf, credentials, outcome, OUT, VALUES, IMAGE } from "../render.ts";

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
