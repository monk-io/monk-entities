// Tests for neon/branch, run by `monk entity test src/neon`.
//
// "a branch goes through its lifecycle" is a recording of a live run against
// Neon. To record it again, in a project you can create branches in:
//
//   NEON_API_KEY=... NEON_PROJECT_ID=... monk entity test --record src/neon
//
// The other tests replay that recording, changed by handlers to cover what
// Neon does when things go wrong.
import { test, expect, json, withJson, Test } from "monk/test";
import { Branch } from "../branch.ts";

const API = "https://console.neon.tech/api/v2";
const RECORDED = "a branch goes through its lifecycle";

/**
 * Points t at Neon, or at the recording of from. Handlers the test adds
 * after this change what it answers.
 */
function neon(t: Test, from?: string) {
    const api = t.recorded(API, from ? { from } : undefined);
    rememberCreated(t);
    return api;
}

/** Defines the branch the tests create, with the API key it reads. */
function branch(t: Test) {
    const b = t.entity(Branch, {
        secret_ref: "neon-api-key",
        project_id: t.env("NEON_PROJECT_ID", "proj-test"),
        name: "monk-entities-test-branch",
    });
    b.secret("neon-api-key", t.env("NEON_API_KEY", "test-key", { secret: true }));
    return b;
}

/**
 * A recording holds what Neon answered, not what Neon holds: a branch made
 * by a create whose response was lost is in no recorded list. This keeps
 * the branches creates made and adds them to later lists, as Neon would.
 */
function rememberCreated(t: Test): void {
    const created: any[] = [];
    t.http.use(`POST ${API}/projects/:project/branches`, (req, next) => {
        const resp = next();
        try {
            const b = JSON.parse(resp.body ?? "").branch;
            if (b?.id) created.push(b);
        } catch (_e) {
            // not a branch; nothing to remember
        }
        return resp;
    });
    t.http.use(`GET ${API}/projects/:project/branches`, (req, next) =>
        withJson(next(), (body) => {
            const known = new Set((body.branches ?? []).map((b: any) => b.id));
            body.branches = [...(body.branches ?? []), ...created.filter((b) => !known.has(b.id))];
        }));
}

test(RECORDED, (t) => {
    neon(t);
    const b = branch(t);
    b.create();
    expect(b.state.existing).toBe(false);
    expect(b.state.name).toBe("monk-entities-test-branch");
    b.start();
    b.waitReady(20);
    b.delete();
});

test("a branch that already exists is adopted, and left in place", (t) => {
    neon(t, RECORDED);
    t.http.use(`GET ${API}/projects/:project/branches`, () =>
        json(200, { branches: [{ id: "br-existing-1", name: "monk-entities-test-branch", current_state: "ready" }] }));
    t.http.use(`* ${API}/projects/:project/branches/:id`, (req, next) =>
        req.method === "GET" ? json(200, { branch: { id: "br-existing-1", current_state: "ready" } }) : next());
    const b = branch(t);
    b.create();
    expect(b.state.existing).toBe(true);
    expect(b.state.id).toBe("br-existing-1");
    b.delete();
    expect(t.http.requests().filter((r) => r.startsWith("POST") || r.startsWith("DELETE"))).toEqual([]);
}, { explore: false });

test("deleting a branch that is already gone succeeds", (t) => {
    const api = neon(t, RECORDED);
    const b = branch(t);
    b.create();
    api.fault("DELETE /projects/:project/branches/:id", 404, { body: { message: "branch not found" } });
    b.delete();
    expect(b.output.join("\n")).toContain("already deleted");
}, { explore: false });

test("a busy project (423) is waited out", (t) => {
    const api = neon(t, RECORDED);
    const b = branch(t);
    api.fault("POST /projects/:project/branches", 423, { times: 2, body: { message: "project already has running operations" } });
    b.create();
    expect(b.state.existing).toBe(false);
    if (!t.exploring) expect(t.clock.elapsed).toBeGreaterThan(0);
}, { explore: false });

test("a failed operation says so", (t) => {
    neon(t, RECORDED);
    t.http.use(`GET ${API}/projects/:project/operations/:id`, (req, next) =>
        withJson(next(), (body) => { body.operation.status = "failed"; body.operation.error = "out of compute"; }));
    const b = branch(t);
    b.create();
    expect(() => b.start()).toThrow(/failed: out of compute/);
}, { explore: false });
