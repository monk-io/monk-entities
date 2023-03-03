let gcp = require("cloud/gcp");
let cli = require("cli");
let fs = require("fs");
let http = require("http");

let BASE_URL = "https://cloudfunctions.googleapis.com/v1"

let prepareBody = function (def, storageUrl) {
    const firebaseConfig = {
        "projectId": def["project"],
        "databaseURL": "https://" + def["database"] + ".firebaseio.com",
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
    } else {
        body.httpsTrigger = {}
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
            let exRes = getFunc(def);
            if (!exRes.error) {
                // use existing function
                res = exRes;
                break
            }
            res = createFunc(def, uploadFuncFiles(def));
            break;
        case "update":
        case "patch":
            res = patchFunc(def, uploadFuncFiles(def));
            break;
        case "purge":
            res = deleteFunc(def);
            if (res.error && res.error.includes("response code 404")) {
                // resource is removed
                return;
            }
            break;
        case "get":
            res = getFunc(def);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            cli.output(res.body);
            return;
        case "check-readiness":
            res = getFunc(def);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            let body = JSON.parse(res.body);
            if (body.status !== "ACTIVE") {
                throw new Error("function is not active yet");
            }

            if (body.httpsTrigger !== undefined) {
                state["url"] = body.httpsTrigger.url;
            }

            state["status"] = body.status;
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
