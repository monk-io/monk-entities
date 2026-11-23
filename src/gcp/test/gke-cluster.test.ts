// Tests for gcp/gke-cluster, run by `monk entity test src/gcp`.
//
// "a cluster is created, resized, and deleted" is a recording of a live run
// against GKE: it creates a one-node zonal cluster (e2-medium, 20 GB
// pd-standard boot disk, Dataplane V2, logging and monitoring off), resizes
// the pool to two nodes, and deletes the cluster. It takes about 15 minutes
// and costs a few cents. To record it again, with a service account key that
// can manage clusters in the project:
//
//   GCP_CREDENTIALS="$(cat key.json)" GCP_PROJECT=my-project GCP_ZONE=europe-west1-b \
//     monk entity test --record --run 'created, resized' src/gcp
//
// The key is only used to get tokens; it is never written to the recording.
// The other tests replay that recording, changed by handlers to cover what
// GCP does when things go wrong.
import { test, expect, json, withJson, Test } from "monk/test";
import { GkeCluster } from "../gke-cluster.ts";

const API = "https://container.googleapis.com/v1";
const RECORDED = "a cluster is created, resized, and deleted";
const CLUSTER = `${API}/projects/:project/locations/:zone/clusters/:cluster`;
const OPERATION = `${API}/projects/:project/locations/:zone/operations/:op`;

/**
 * Points t at GKE, or at the recording of from, with GCP credentials from
 * GCP_CREDENTIALS on live runs.
 */
function gke(t: Test, from?: string) {
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

/** The cluster as the recorded test defines it. */
function definition(t: Test) {
    return {
        project: t.env("GCP_PROJECT", "test-project"),
        location: t.env("GCP_ZONE", "europe-west1-b"),
        name: "monk-entities-test-gke",
        machine_type: "e2-medium",
        node_count: 1,
        disk_size_gb: 20,
        disk_type: "pd-standard",
        labels: { purpose: "monk-entities-test" },
    };
}

function cluster(t: Test) {
    return t.entity(GkeCluster, definition(t));
}

/** The cluster made and ready, from the recording. */
function readyCluster(t: Test) {
    const c = cluster(t);
    c.create();
    c.waitReady(100);
    return c;
}

test(RECORDED, (t) => {
    gke(t);
    const c = cluster(t);

    c.create();
    expect(c.state.existing).toBe(false);
    // A create whose response was lost finds the cluster instead.
    if (!t.exploring) expect(c.state.operation_name).toBeTruthy();
    c.waitReady(100);
    expect(c.state.status).toBe("RUNNING");
    expect(c.state.node_count).toBe(1);
    expect(c.state.gke_cluster).toBe("monk-entities-test-gke");
    expect(c.state.gke_location).toBe(definition(t).location);
    expect(c.state.gke_project).toBe(definition(t).project);
    expect(c.state.endpoint).toBeTruthy();
    expect(c.state.ca_certificate).toBeTruthy();
    expect(c.state.master_version).toBeTruthy();
    expect(c.state.node_pool).toBe("default-pool");
    expect(c.state.self_link ?? "").toContain("/clusters/monk-entities-test-gke");

    c.redefine({ ...c.definition, node_count: 2 });
    c.update();
    c.waitReady(100);
    expect(c.state.node_count).toBe(2);

    c.waitDeleted(80);
});

test("the cluster is created as a small zonal Standard cluster", (t) => {
    gke(t, RECORDED);
    const c = cluster(t);
    let body: any;
    t.http.use(`POST ${API}/projects/:project/locations/:zone/clusters`, (req, next) => {
        body = req.json();
        return next();
    });
    c.create();
    const k = body.cluster;
    expect(k.name).toBe("monk-entities-test-gke");
    expect(k.loggingService).toBe("none");
    expect(k.monitoringService).toBe("none");
    expect(k.releaseChannel).toEqual({ channel: "REGULAR" });
    expect(k.networkConfig).toEqual({ datapathProvider: "ADVANCED_DATAPATH" });
    expect(k.addonsConfig.gcePersistentDiskCsiDriverConfig.enabled).toBe(true);
    expect(k.network).toContain("/networks/default");
    expect(k.nodePools.length).toBe(1);
    expect(k.nodePools[0].initialNodeCount).toBe(1);
    expect(k.nodePools[0].config).toEqual({ machineType: "e2-medium", diskSizeGb: 20, diskType: "pd-standard" });
    expect(k.resourceLabels.purpose).toBe("monk-entities-test");
    expect(k.resourceLabels["monk-owner"]).toBeTruthy();
}, { explore: false });

test("dataplane_v2 false, spot and logging are passed on", (t) => {
    gke(t, RECORDED);
    const c = t.entity(GkeCluster, { ...definition(t), dataplane_v2: false, spot: true, logging: true, monitoring: true, release_channel: "none" });
    let body: any;
    t.http.use(`POST ${API}/projects/:project/locations/:zone/clusters`, (req, next) => {
        body = req.json();
        return next();
    });
    c.create();
    expect(body.cluster.networkConfig).toBeUndefined();
    expect(body.cluster.nodePools[0].config.spot).toBe(true);
    expect(body.cluster.loggingService).toBe("logging.googleapis.com/kubernetes");
    expect(body.cluster.monitoringService).toBe("monitoring.googleapis.com/kubernetes");
    expect(body.cluster.releaseChannel).toEqual({ channel: "UNSPECIFIED" });
}, { explore: false });

test("a region or a bad name is refused before anything is created", (t) => {
    gke(t, RECORDED);
    const region = t.entity(GkeCluster, { ...definition(t), location: "europe-west1" });
    expect(() => region.create()).toThrow(/zonal clusters/);
    const bad = t.entity(GkeCluster, { ...definition(t), name: "Bad_Name" });
    expect(() => bad.create()).toThrow(/not a valid cluster name/);
    expect(t.http.requests()).toEqual([]);
}, { explore: false });

test("a cluster that already exists is adopted, and left in place", (t) => {
    gke(t, RECORDED);
    t.http.use(`GET ${CLUSTER}`, () => json(200, {
        name: "monk-entities-test-gke", location: "europe-west1-b", status: "RUNNING",
        endpoint: "203.0.113.20", masterAuth: { clusterCaCertificate: "Q0E=" },
        currentMasterVersion: "1.33.5-gke.1", currentNodeCount: 3,
        nodePools: [{ name: "default-pool", initialNodeCount: 3 }],
        resourceLabels: { team: "platform" },
    }));
    const c = cluster(t);
    c.create();
    expect(c.state.existing).toBe(true);
    expect(c.state.node_count).toBe(3);
    expect(c.state.gke_cluster).toBe("monk-entities-test-gke");
    c.checkReadiness();
    c.update(); // an adopted cluster is not changed
    c.waitDeleted();
    expect(t.http.requests().filter((r) => r.startsWith("POST") || r.startsWith("DELETE"))).toEqual([]);
}, { explore: false });

test("force_ownership deletes a cluster that already existed", (t) => {
    gke(t, RECORDED);
    let gone = false;
    t.http.use(`* ${CLUSTER}`, (req) => {
        if (req.method === "DELETE") {
            gone = true;
            return json(200, { name: "op-del", operationType: "DELETE_CLUSTER", status: "RUNNING" });
        }
        if (gone) return json(404, { error: { code: 404, message: "not found" } });
        return json(200, { name: "monk-entities-test-gke", status: "RUNNING", resourceLabels: {} });
    });
    const c = t.entity(GkeCluster, { ...definition(t), force_ownership: true });
    c.create();
    expect(c.state.existing).toBe(false);
    c.waitDeleted();
    expect(t.http.requests().filter((r) => r.startsWith("DELETE")).length).toBe(1);
}, { explore: false });

test("a create whose operation fails says why", (t) => {
    gke(t, RECORDED);
    const c = cluster(t);
    c.create();
    t.http.use(`GET ${OPERATION}`, (req, next) => withJson(next(), (b) => {
        b.status = "DONE";
        b.error = { code: 8, message: "Insufficient regional quota to satisfy request: resource \"SSD_TOTAL_GB\"" };
    }));
    expect(() => c.checkReadiness()).toThrow(/failed: Insufficient regional quota/);
}, { explore: false });

test("a cluster is not ready while GCP is still creating it", (t) => {
    gke(t, RECORDED);
    const c = cluster(t);
    c.create();
    let checks = 0;
    t.http.use(`GET ${CLUSTER}`, (req, next) => withJson(next(), (b) => {
        checks++;
        if (checks <= 1) b.status = "PROVISIONING";
    }));
    expect(() => c.checkReadiness()).toThrow();
    // The create operation runs first, then the cluster provisions.
    expect(c.output.join("\n")).toMatch(/CREATE_CLUSTER is RUNNING|is PROVISIONING/);
    c.waitReady(100);
    expect(c.state.status).toBe("RUNNING");
}, { explore: false });

test("a cluster in ERROR says why", (t) => {
    gke(t, RECORDED);
    const c = readyCluster(t);
    t.http.use(`GET ${CLUSTER}`, (req, next) => withJson(next(), (b) => {
        b.status = "ERROR";
        b.statusMessage = "node pool failed";
    }));
    expect(() => c.checkReadiness()).toThrow(/ERROR: node pool failed/);
}, { explore: false });

test("changing what cannot change in place leaves the cluster alone", (t) => {
    gke(t, RECORDED);
    const c = readyCluster(t);
    const before = t.http.requests().length;
    c.redefine({ ...c.definition, machine_type: "e2-standard-4", dataplane_v2: false });
    c.update();
    expect(c.output.join("\n")).toMatch(/machine_type, dataplane_v2 cannot change in place/);
    expect(t.http.requests().slice(before).filter((r) => r.startsWith("POST"))).toEqual([]);
}, { explore: false });

test("a resize before labels: labels wait for the next update", (t) => {
    gke(t, RECORDED);
    const c = readyCluster(t);
    c.redefine({ ...c.definition, node_count: 2, labels: { purpose: "changed" } });
    c.update();
    expect(c.output.join("\n")).toContain("set by the next update");
    expect(t.http.requests().filter((r) => r.includes(":setResourceLabels"))).toEqual([]);
    expect(t.http.requests().filter((r) => r.includes(":setSize")).length).toBeGreaterThan(0);
}, { explore: false });

test("a pool scaled to 0 is ready, though GKE leaves out the zero counts", (t) => {
    gke(t, RECORDED);
    const c = readyCluster(t);
    let size: any;
    t.http.handle(`POST ${CLUSTER}/nodePools/default-pool:setSize`, (req) => {
        size = req.json();
        return json(200, { name: "op-size", operationType: "SET_NODE_POOL_SIZE", status: "RUNNING" });
    });
    t.http.handle(`GET ${OPERATION}`, () => json(200, { name: "op-size", operationType: "SET_NODE_POOL_SIZE", status: "DONE" }));
    c.redefine({ ...c.definition, node_count: 0 });
    c.update();
    expect(size.nodeCount).toBe(0);
    // Resized to 0: as proto3 JSON does, the fields whose value is 0 are
    // not there.
    t.http.use(`GET ${CLUSTER}`, (req, next) => withJson(next(), (b) => {
        delete b.currentNodeCount;
        for (const p of b.nodePools ?? []) delete p.initialNodeCount;
    }));
    c.waitReady(5);
    expect(c.state.node_count).toBe(0);
    c.do("costs");
    expect(Number(JSON.parse(c.output.join("\n")).costs.hour.amount ?? 0)).toBe(0);
}, { explore: false });

test("labels are set with the cluster's fingerprint", (t) => {
    gke(t, RECORDED);
    const c = readyCluster(t);
    t.http.use(`GET ${CLUSTER}`, (req, next) => withJson(next(), (b) => { b.labelFingerprint = "fp-1"; }));
    let body: any;
    t.http.handle(`POST ${CLUSTER}:setResourceLabels`, (req) => {
        body = req.json();
        return json(200, { name: "op-labels", operationType: "SET_LABELS", status: "RUNNING" });
    });
    c.redefine({ ...c.definition, labels: { purpose: "changed" } });
    c.update();
    expect(body.labelFingerprint).toBe("fp-1");
    expect(body.resourceLabels.purpose).toBe("changed");
    expect(body.resourceLabels["monk-owner"]).toBeTruthy();
}, { explore: false });

test("deleting a cluster that is already gone succeeds", (t) => {
    const api = gke(t, RECORDED);
    const c = readyCluster(t);
    api.fault("DELETE /projects/:project/locations/:zone/clusters/:cluster", 404, { body: { error: { code: 404, message: "not found" } } });
    c.delete();
    expect(c.output.join("\n")).toContain("already deleted");
}, { explore: false });

test("get-kubeconfig prints the exec form with gke-gcloud-auth-plugin", (t) => {
    gke(t, RECORDED);
    const c = readyCluster(t);
    c.do("get-kubeconfig");
    const out = c.output.join("\n");
    expect(out).toContain("command: gke-gcloud-auth-plugin");
    expect(out).toContain("certificate-authority-data: " + c.state.ca_certificate);
    expect(out).toContain("server: https://" + c.state.endpoint);
    expect(out).toContain(`current-context: gke_${definition(t).project}_${definition(t).location}_monk-entities-test-gke`);
}, { explore: false });

test("get-info prints the cluster, and costs are reported per hour and per month", (t) => {
    gke(t, RECORDED);
    const c = readyCluster(t);
    c.do("get-info");
    expect(JSON.parse(c.output.join("\n")).name).toBe("monk-entities-test-gke");
    c.do("costs");
    const out = JSON.parse(c.output.join("\n"));
    expect(out.type).toBe("gcp-gke-cluster");
    expect(out.costs.hour.currency).toBe("USD");
    c.do("get-cost-estimate");
    expect(c.output.join("\n")).toContain("ESTIMATED MONTHLY COST:");
    expect(c.output.join("\n")).toContain("first zonal cluster per billing account");
}, { explore: false });
