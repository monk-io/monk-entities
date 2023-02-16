let gcp = require("cloud/gcp");
let cli = require("cli");
let fs = require("fs");
let http = require("http");

let BASE_URL = "https://cloudfunctions.googleapis.com/v1"

let prepareBody = function (def, storageUrl) {
    const firebaseConfig = {
        "projectId": def["project"],
        "databaseURL": "https://" + def["project"] + "-default-rtdb.firebaseio.com",
        "storageBucket": def["project"] + ".appspot.com",
        "locationId": def["location"]
    }

    let body = {
        name: "projects/" + def["project"] + "/locations/" + def["location"] + "/functions/" + def["name"],
        runtime: def["build"]["runtime"],
        entryPoint: def["build"]["entrypoint"],
        dockerRegistry: "ARTIFACT_REGISTRY",
        sourceUploadUrl: storageUrl,
        environmentVariables: {
            FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
            GCLOUD_PROJECT: def["project"]
        }
    };

    if (def["service"]["max-instance-count"] > 0) {
        body.maxInstances = def["service"]["max-instance-count"];
    }

    if (def["service"]["timeout-seconds"] > 0) {
        body.timeout = def["service"]["timeout-seconds"] + "s";
    }

    if (def["service"]["available-memory"] > 0) {
        body.availableMemoryMb = def["service"]["available-memory"];
    }

    if (def["event-trigger"]) {
        body.eventTrigger = {
            eventType: def["event-trigger"]["event-type"],
            resource: def["event-trigger"]["resource"]
        };
    }

    return body
}

let createFunc = function (def, storage) {
    let body = prepareBody(def, storage);

    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions",
        {"body": JSON.stringify(body)});
};

let patchFunc = function (def, storage) {
    const body = prepareBody(def, storage);

    return gcp.do(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions/" + def["name"],
        {"method": "PATCH", "body": JSON.stringify(body)});
};

let getFunc = function (def) {
    return gcp.get(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions/" + def["name"]);
};

let deleteFunc = function (def) {
    return gcp.delete(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions/" + def["name"]);
};

let generateUploadFunc = function (def) {
    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions:generateUploadUrl");
};

let uploadFuncFiles = function (def) {
    let res = generateUploadFunc(def);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    let body = JSON.parse(res.body);

    // zip files that we need to upload
    let zippedBody = fs.zip(...fs.ls());

    // use http without authorization because uploadUrl contains auth already
    res = http.put(body.uploadUrl, {
        headers: {
            "content-type": "application/zip",
            "x-goog-content-length-range": "0,104857600"
        }, body: zippedBody
    })
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return body.uploadUrl;
};

function main(def, state, ctx) {
    let res = {};
    switch (ctx.action) {
        case "create":
            res = createFunc(def, uploadFuncFiles(def));
            break;
        case "patch":
            res = patchFunc(def, uploadFuncFiles(def));
            break;
        case "purge":
            res = deleteFunc(def);
            break;
        case "get":
            res = getFunc(def);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            cli.output(res.body);
            return;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    // set result operation to state
    let body = JSON.parse(res.body)
    state["last-operation"] = body.name;

    return state;
}
