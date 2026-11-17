// Tests for gcp/compute-snapshot, run by `monk entity test src/gcp`.
//
// "a disk is snapshotted and restored from the snapshot" is a recording of
// a live run against Compute Engine: it creates a blank 10 GB pd-standard
// disk, snapshots it, restores a new disk from the snapshot, and deletes all
// three. To record it again:
//
//   GCP_CREDENTIALS="$(cat key.json)" GCP_PROJECT=my-project GCP_ZONE=europe-west1-b \
//     monk entity test --record --run 'snapshotted and restored' src/gcp
//
// The other tests replay that recording, changed by handlers.
import { test, expect, json, withJson, Test } from "monk/test";
import { ComputeDisk } from "../compute-disk.ts";
import { ComputeSnapshot } from "../compute-snapshot.ts";

const API = "https://compute.googleapis.com/compute/v1";
const RECORDED = "a disk is snapshotted and restored from the snapshot";
const SNAPSHOT = `${API}/projects/:project/global/snapshots/:snapshot`;

function compute(t: Test, from?: string) {
    const api = t.recorded(API, from ? { from } : undefined);
    keepUntilDeleted(t);
    const key = t.env("GCP_CREDENTIALS", "", { secret: true });
    t.provider("gcp", key ? JSON.parse(key) : {
        type: "service_account",
        project_id: "test-project",
        client_email: "monk-test@test-project.iam.gserviceaccount.com",
        private_key: "unused",
    });
    return api;
}

/**
 * A recording answers repeated reads in the order they came: a read that
 * a fault repeats takes a later answer, which near the end is the
 * snapshot being deleted. GCP shows DELETING only after a delete, so
 * this answers READY until the test deletes the snapshot.
 */
function keepUntilDeleted(t: Test): void {
    let deleting = false;
    t.http.use(`DELETE ${SNAPSHOT}`, (req, next) => {
        deleting = true;
        return next();
    });
    t.http.use(`GET ${SNAPSHOT}`, (req, next) => {
        const resp = next();
        if (deleting) return resp;
        return withJson(resp, (b) => {
            if (b?.status === "DELETING") b.status = "READY";
        });
    });
}

/** The source disk, its snapshot and the disk restored from it. */
function stack(t: Test) {
    const project = t.env("GCP_PROJECT", "test-project");
    const zone = t.env("GCP_ZONE", "europe-west1-b");
    const disk = t.entity(ComputeDisk, {
        project, zone, name: "monk-entities-test-snapsrc", disk_type: "pd-standard", size_gb: 10,
    });
    const snap = t.entity(ComputeSnapshot, {
        project, zone, name: "monk-entities-test-snap", source_disk: "monk-entities-test-snapsrc",
        storage_locations: ["europe-west1"], labels: { purpose: "monk-entities-test" },
    });
    const restored = t.entity(ComputeDisk, {
        project, zone, name: "monk-entities-test-restored", source_snapshot: "monk-entities-test-snap",
    });
    return { disk, snap, restored, project, zone };
}

test(RECORDED, (t) => {
    compute(t);
    const { disk, snap, restored } = stack(t);

    disk.create();
    disk.waitReady(30);

    snap.create();
    expect(snap.state.existing).toBe(false);
    snap.waitReady(60);
    expect(snap.state.status).toBe("READY");
    expect(snap.state.disk_size_gb).toBe(10);
    expect(snap.state.source_disk ?? "").toContain("/disks/monk-entities-test-snapsrc");
    expect(snap.state.storage_locations).toEqual(["europe-west1"]);

    restored.create();
    restored.waitReady(60);
    expect(restored.state.size_gb).toBe(10);
    expect(restored.state.source_snapshot ?? "").toContain("/snapshots/monk-entities-test-snap");

    restored.waitDeleted(30);
    snap.waitDeleted(30);
    disk.waitDeleted(30);
});

test("a snapshot's costs follow what it stores", (t) => {
    compute(t, RECORDED);
    const { disk, snap } = stack(t);
    disk.create();
    disk.waitReady(30);
    snap.create();
    snap.waitReady(60);
    t.http.use(`GET ${SNAPSHOT}`, (req, next) => withJson(next(), (b) => { b.storageBytes = String(4 * 1024 * 1024 * 1024); }));
    snap.checkReadiness();
    snap.do("costs");
    const out = JSON.parse(snap.output.join("\n"));
    expect(out.type).toBe("gcp-compute-snapshot");
    expect(out.costs.month.amount).toBe("0.20");
}, { explore: false });

test("a disk is not restored from a snapshot that is not READY", (t) => {
    compute(t, RECORDED);
    const { restored } = stack(t);
    t.http.use(`GET ${SNAPSHOT}`, () => json(200, { name: "monk-entities-test-snap", status: "UPLOADING", diskSizeGb: "10" }));
    t.http.use(`GET ${API}/projects/:project/zones/:zone/disks/:disk`, () => json(404, { error: { code: 404, message: "not found" } }));
    expect(() => restored.create()).toThrow(/snapshot monk-entities-test-snap is UPLOADING, not READY/);
    expect(t.http.requests().filter((r) => r.startsWith("POST"))).toEqual([]);
}, { explore: false });

test("a snapshot that already exists is adopted, and left in place", (t) => {
    compute(t, RECORDED);
    t.http.use(`GET ${SNAPSHOT}`, () => json(200, {
        kind: "compute#snapshot", name: "monk-entities-test-snap", status: "READY", diskSizeGb: "50",
        selfLink: `${API}/projects/p/global/snapshots/monk-entities-test-snap`, labels: { team: "data" },
    }));
    const { snap } = stack(t);
    snap.create();
    expect(snap.state.existing).toBe(true);
    snap.waitDeleted();
    expect(t.http.requests().filter((r) => r.startsWith("POST") || r.startsWith("DELETE"))).toEqual([]);
}, { explore: false });

test("a failed snapshot says so", (t) => {
    compute(t, RECORDED);
    const { disk, snap } = stack(t);
    disk.create();
    disk.waitReady(30);
    snap.create();
    t.http.use(`GET ${API}/projects/:project/global/operations/:op`, (req, next) => withJson(next(), (b) => {
        b.status = "DONE";
        b.error = { errors: [{ code: "RESOURCE_NOT_READY", message: "The disk is being modified" }] };
    }));
    expect(() => snap.checkReadiness()).toThrow(/failed: RESOURCE_NOT_READY: The disk is being modified/);
}, { explore: false });
