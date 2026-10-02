// Unit tests for the pure cluster identity helpers (ENG-836).
// Kept outside src/ because the monkec compiler compiles every .ts file under a package.
// Run: deno test tests/mongodb-atlas/
import assert from "node:assert/strict";
import {
    atlasErrorStatus,
    clusterOwnership,
    instanceSizeDiffers,
    liveClusterShape,
    OWNER_TAG_KEY,
    ownerTagValue,
    shapeMismatches,
} from "../../src/mongodb-atlas/cluster-identity.ts";

// Shape of makeRequest's own `!response.ok` error.
const err = (status: number, body = "{}") =>
    new Error(`MongoDB Atlas GET request to /groups/p/clusters/c failed: MongoDB Atlas API error: ${status} ERR. Body: ${body}`);

// Shape actually seen at runtime: the Monk http builtin sets `error` on a non-2xx
// response, so HttpClient throws before makeRequest's own check runs.
const clientErr = (status: number, body = "{}") =>
    new Error(
        `MongoDB Atlas GET request to /groups/p/clusters/c failed: GET request to ` +
        `"https://cloud.mongodb.com/api/atlas/v2/groups/p/clusters/c" failed: unexpected response code ${status}. ${body}`,
    );

Deno.test("atlasErrorStatus reads the HTTP status", () => {
    assert.equal(atlasErrorStatus(err(404, '{"errorCode":"CLUSTER_NOT_FOUND"}')), 404);
    assert.equal(atlasErrorStatus(err(401)), 401);
    assert.equal(atlasErrorStatus(err(503)), 503);
});

Deno.test("atlasErrorStatus reads the status from HttpClient's error", () => {
    assert.equal(atlasErrorStatus(clientErr(404, '{"errorCode":"CLUSTER_NOT_FOUND"}')), 404);
    assert.equal(atlasErrorStatus(clientErr(400, '{"errorCode":"INVALID_TAG"}')), 400);
});

Deno.test("atlasErrorStatus is null without an HTTP response", () => {
    assert.equal(atlasErrorStatus(new Error("MongoDB Atlas GET request to /x failed: dial tcp: i/o timeout")), null);
    // A body mentioning NOT_FOUND is not a 404.
    assert.equal(atlasErrorStatus(err(500, '{"detail":"GROUP_NOT_FOUND upstream"}')), 500);
});

Deno.test("ownerTagValue maps the path to allowed characters", () => {
    assert.equal(ownerTagValue("mongodb-test-stack/dev-cluster"), "mongodb-test-stack+dev-cluster");
    assert.equal(ownerTagValue("a/b:c#d"), "a+b_c_d");
    assert.equal(ownerTagValue(""), null);
    assert.equal(ownerTagValue(undefined), null);
    assert.equal(ownerTagValue("x".repeat(300))!.length, 255);
});

Deno.test("clusterOwnership", () => {
    const mine = ownerTagValue("ns/c");
    assert.equal(clusterOwnership([{ key: OWNER_TAG_KEY, value: mine }], mine), "owned");
    assert.equal(clusterOwnership([{ key: OWNER_TAG_KEY, value: "ns+other" }], mine), "foreign");
    assert.equal(clusterOwnership([{ key: "env", value: "prod" }], mine), "untagged");
    assert.equal(clusterOwnership(undefined, mine), "untagged");
    // An entity with no path owns nothing.
    assert.equal(clusterOwnership([{ key: OWNER_TAG_KEY, value: "ns+c" }], null), "foreign");
});

Deno.test("liveClusterShape: M0 on /clusters", () => {
    const shape = liveClusterShape({
        replicationSpecs: [{
            regionConfigs: [{ providerName: "TENANT", backingProviderName: "AWS", regionName: "US_WEST_2", electableSpecs: { instanceSize: "M0" } }],
        }],
    }, false);
    assert.deepEqual(shape, { family: "free", provider: "AWS", region: "US_WEST_2" });
});

Deno.test("liveClusterShape: dedicated on /clusters", () => {
    const shape = liveClusterShape({
        replicationSpecs: [{ regionConfigs: [{ providerName: "GCP", regionName: "CENTRAL_US", electableSpecs: { instanceSize: "M10" } }] }],
    }, false);
    assert.deepEqual(shape, { family: "dedicated", provider: "GCP", region: "CENTRAL_US", instanceSize: "M10" });
});

Deno.test("liveClusterShape: Flex on /flexClusters", () => {
    const shape = liveClusterShape({ providerSettings: { backingProviderName: "AZURE", regionName: "US_EAST_2" } }, true);
    assert.deepEqual(shape, { family: "flex", provider: "AZURE", region: "US_EAST_2" });
});

Deno.test("shapeMismatches flags family, provider and region", () => {
    const want = { family: "free" as const, provider: "AWS", region: "US_WEST_2" };
    assert.deepEqual(shapeMismatches(want, { family: "free", provider: "AWS", region: "US_WEST_2" }), []);
    assert.equal(shapeMismatches(want, { family: "dedicated", provider: "AWS", region: "US_WEST_2", instanceSize: "M10" }).length, 1);
    assert.equal(shapeMismatches(want, { family: "free", provider: "GCP", region: "CENTRAL_US" }).length, 2);
    // Unknown live fields are mismatches: don't adopt what can't be confirmed.
    assert.equal(shapeMismatches(want, {}).length, 3);
});

Deno.test("instanceSizeDiffers only within dedicated", () => {
    assert.equal(instanceSizeDiffers({ family: "dedicated", instanceSize: "M20" }, { family: "dedicated", instanceSize: "M10" }), true);
    assert.equal(instanceSizeDiffers({ family: "dedicated", instanceSize: "M10" }, { family: "dedicated", instanceSize: "M10" }), false);
    assert.equal(instanceSizeDiffers({ family: "dedicated", instanceSize: "M10" }, { family: "dedicated" }), false);
    assert.equal(instanceSizeDiffers({ family: "free" }, { family: "free" }), false);
});
