// Tests for gcp/compute-disk, run by `monk entity test src/gcp`.
//
// "a disk is cloned from another, becomes ready, and is deleted" is a
// recording of a live run against Compute Engine: it creates a blank 10 GB
// pd-standard disk, clones it, and deletes both. To record it again, with a
// service account key that can manage disks in the project:
//
//   GCP_CREDENTIALS="$(cat key.json)" GCP_PROJECT=my-project GCP_ZONE=europe-west1-b \
//     monk entity test --record --run 'cloned from another' src/gcp
//
// The key is only used to get tokens; it is never written to the recording.
// The other tests replay that recording, changed by handlers to cover what
// GCP does when things go wrong.
import { test, expect, json, withJson, Test } from "monk/test";
import { ComputeDisk } from "../compute-disk.ts";

const API = "https://compute.googleapis.com/compute/v1";
const RECORDED = "a disk is cloned from another, becomes ready, and is deleted";
const DISK = `${API}/projects/:project/zones/:zone/disks/:disk`;

/**
 * Points t at Compute Engine, or at the recording of from, with GCP
 * credentials from GCP_CREDENTIALS on live runs.
 */
function compute(t: Test, from?: string) {
    const api = t.recorded(API, from ? { from } : undefined);
    const key = t.env("GCP_CREDENTIALS", "", { secret: true });
    t.provider("gcp", key ? JSON.parse(key) : {
        type: "service_account",
        project_id: "test-project",
        client_email: "monk-test@test-project.iam.gserviceaccount.com",
        private_key: "unused",
    });
    return api;
}

/** The source disk and its clone, as the recorded test defines them. */
function disks(t: Test) {
    const project = t.env("GCP_PROJECT", "test-project");
    const zone = t.env("GCP_ZONE", "europe-west1-b");
    const src = t.entity(ComputeDisk, {
        project, zone,
        name: "monk-entities-test-src",
        disk_type: "pd-standard",
        size_gb: 10,
        labels: { purpose: "monk-entities-test" },
    });
    const clone = t.entity(ComputeDisk, {
        project, zone,
        name: "monk-entities-test-clone",
        source_disk: "monk-entities-test-src",
        labels: { purpose: "monk-entities-test" },
    });
    return { src, clone, project, zone };
}

/** The source disk made and ready, from the recording. */
function readySource(t: Test) {
    const d = disks(t);
    d.src.create();
    d.src.waitReady(30);
    return d;
}

test(RECORDED, (t) => {
    compute(t);
    const { src, clone } = disks(t);

    src.create();
    expect(src.state.existing).toBe(false);
    src.waitReady(30);
    expect(src.state.status).toBe("READY");
    expect(src.state.size_gb).toBe(10);
    expect(src.state.disk_type).toBe("pd-standard");

    clone.create();
    expect(clone.state.existing).toBe(false);
    // A create whose response was lost finds the disk instead.
    if (!t.exploring) expect(clone.state.operation_name).toBeTruthy();
    clone.waitReady(60);
    expect(clone.state.status).toBe("READY");
    expect(clone.state.name).toBe("monk-entities-test-clone");
    expect(clone.state.zone).toBe(src.state.zone);
    // The clone takes the source's size and type.
    expect(clone.state.size_gb).toBe(10);
    expect(clone.state.disk_type).toBe("pd-standard");
    expect(clone.state.source_disk ?? "").toContain("/disks/monk-entities-test-src");
    expect(clone.state.self_link ?? "").toContain("/disks/monk-entities-test-clone");

    clone.waitDeleted(30);
    src.waitDeleted(30);
});

test("costs are reported per hour and per month", (t) => {
    compute(t, RECORDED);
    const { src } = readySource(t);
    src.do("costs");
    const out = JSON.parse(src.output.join("\n"));
    expect(out.type).toBe("gcp-compute-disk");
    expect(out.costs.month.amount).toBe("0.40");
    expect(out.costs.hour.currency).toBe("USD");
    src.do("get-cost-estimate");
    expect(src.output.join("\n")).toContain("ESTIMATED MONTHLY COST: $0.40");
}, { explore: false });

test("a disk attached to an instance is not deleted", (t) => {
    compute(t, RECORDED);
    const { src } = readySource(t);
    t.http.use(`GET ${DISK}`, (req, next) => withJson(next(), (b) => {
        b.users = [`${API}/projects/p/zones/z/instances/branch-node-1`];
    }));
    expect(() => src.delete()).toThrow(/attached to branch-node-1/);
    expect(t.http.requests().filter((r) => r.startsWith("DELETE"))).toEqual([]);
}, { explore: false });

test("a disk that already exists is adopted, and left in place", (t) => {
    compute(t, RECORDED);
    t.http.use(`GET ${DISK}`, () => json(200, {
        kind: "compute#disk", name: "monk-entities-test-src", status: "READY", sizeGb: "200",
        type: `${API}/projects/p/zones/europe-west1-b/diskTypes/pd-ssd`,
        zone: `${API}/projects/p/zones/europe-west1-b`,
        selfLink: `${API}/projects/p/zones/europe-west1-b/disks/monk-entities-test-src`,
        labels: { team: "data" },
    }));
    const { src } = disks(t);
    src.create();
    expect(src.state.existing).toBe(true);
    expect(src.state.size_gb).toBe(200);
    src.checkReadiness();
    src.waitDeleted();
    expect(t.http.requests().filter((r) => r.startsWith("POST") || r.startsWith("DELETE"))).toEqual([]);
}, { explore: false });

test("force_ownership deletes a disk that already existed", (t) => {
    compute(t, RECORDED);
    let gone = false;
    t.http.use(`* ${DISK}`, (req, next) => {
        if (req.method === "DELETE") {
            gone = true;
            return json(200, { kind: "compute#operation", name: "op-del", operationType: "delete", status: "RUNNING" });
        }
        if (gone) return json(404, { error: { code: 404, message: "not found" } });
        return json(200, { kind: "compute#disk", name: "monk-entities-test-src", status: "READY", sizeGb: "10", labels: {} });
    });
    const { project, zone } = disks(t);
    const d = t.entity(ComputeDisk, { project, zone, name: "monk-entities-test-src", size_gb: 10, force_ownership: true });
    d.create();
    expect(d.state.existing).toBe(false);
    d.waitDeleted();
    expect(t.http.requests().filter((r) => r.startsWith("DELETE")).length).toBe(1);
}, { explore: false });

test("a clone smaller than its source is refused before anything is created", (t) => {
    compute(t, RECORDED);
    const { src, project, zone } = readySource(t);
    const small = t.entity(ComputeDisk, { project, zone, name: "monk-entities-test-clone", source_disk: "monk-entities-test-src", size_gb: 5 });
    expect(() => small.create()).toThrow(/size_gb 5 is smaller than the source disk monk-entities-test-src \(10 GB\)/);
    expect(t.http.requests().filter((r) => r.startsWith("POST")).length).toBe(1); // the source's own create
    expect(src.state.status).toBe("READY");
}, { explore: false });

test("a definition with two sources, or a blank disk without a size, is refused", (t) => {
    compute(t, RECORDED);
    const { project, zone } = disks(t);
    const both = t.entity(ComputeDisk, { project, zone, name: "x", source_disk: "a", source_snapshot: "b" });
    expect(() => both.create()).toThrow(/not both/);
    const blank = t.entity(ComputeDisk, { project, zone, name: "y" });
    expect(() => blank.create()).toThrow(/size_gb is required/);
    expect(t.http.requests()).toEqual([]);
}, { explore: false });

test("a missing source disk says so", (t) => {
    compute(t, RECORDED);
    const { project, zone } = disks(t);
    t.http.use(`GET ${API}/projects/:project/zones/:zone/disks/no-such-disk`, () =>
        json(404, { error: { code: 404, message: "The resource 'no-such-disk' was not found" } }));
    const c = t.entity(ComputeDisk, { project, zone, name: "monk-entities-test-clone", source_disk: "no-such-disk" });
    expect(() => c.create()).toThrow(/source disk .*no-such-disk does not exist/);
}, { explore: false });

test("a clone whose operation fails says why", (t) => {
    compute(t, RECORDED);
    const { clone } = readySource(t);
    clone.create();
    t.http.use(`GET ${API}/projects/:project/zones/:zone/operations/:op`, (req, next) => withJson(next(), (b) => {
        b.status = "DONE";
        b.error = { errors: [{ code: "QUOTA_EXCEEDED", message: "Quota 'DISKS_TOTAL_GB' exceeded" }] };
    }));
    expect(() => clone.checkReadiness()).toThrow(/failed: QUOTA_EXCEEDED: Quota 'DISKS_TOTAL_GB' exceeded/);
}, { explore: false });

test("a clone is not ready while GCP is still copying it", (t) => {
    compute(t, RECORDED);
    const { clone } = readySource(t);
    clone.create();
    let checks = 0;
    t.http.use(`GET ${API}/projects/:project/zones/:zone/operations/:op`, (req, next) => withJson(next(), (b) => {
        checks++;
        if (checks <= 5) b.status = "RUNNING";
    }));
    expect(() => clone.checkReadiness()).toThrow();
    expect(clone.output.join("\n")).toContain("is RUNNING");
    clone.waitReady(10);
    expect(clone.state.status).toBe("READY");
}, { explore: false });

test("deleting a disk that is already gone succeeds", (t) => {
    const api = compute(t, RECORDED);
    const { src } = readySource(t);
    api.fault("DELETE /projects/:project/zones/:zone/disks/:disk", 404, { body: { error: { code: 404, message: "not found" } } });
    src.delete();
    expect(src.output.join("\n")).toContain("already deleted");
}, { explore: false });

test("the snapshot action starts a snapshot of the disk", (t) => {
    compute(t, RECORDED);
    const { src } = readySource(t);
    let body: any;
    t.http.handle(`POST ${DISK}/createSnapshot`, (req) => {
        body = req.json();
        return json(200, { kind: "compute#operation", name: "op-snap", status: "RUNNING" });
    });
    src.do("snapshot", { name: "nightly-1", storage_location: "europe-west1" });
    expect(body).toEqual({ name: "nightly-1", storageLocations: ["europe-west1"] });
    expect(src.output.join("\n")).toContain("Snapshot nightly-1 of disk monk-entities-test-src started");
}, { explore: false });
