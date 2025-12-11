let cli = require("cli");
let fs = require("fs");
let http = require("http");

let BASE_URL = "https://cloudfunctions.googleapis.com/v2"

let prepareBody = function (def, storage) {
    const firebaseConfig = {
        "projectId": def["project"],
        "databaseURL": "https://" + def["project"] + "-default-rtdb.firebaseio.com",
        "storageBucket": def["project"] + ".appspot.com",
        "locationId": def["location"]
    }

    let body = {
        buildConfig: {
            source: {
                storageSource: storage
            },
            runtime: def["build"]["runtime"],
            entryPoint: def["build"]["entrypoint"]
        },
        serviceConfig: {
            maxInstanceCount: def["service"]["max-instance-count"],
            availableMemory: def["service"]["available-memory"],
            timeoutSeconds: def["service"]["timeout-seconds"],
            environmentVariables: {
                FIREBASE_CONFIG: JSON.stringify(firebaseConfig),
                GCLOUD_PROJECT: def["project"]
            }
        }
    };

    if (def["event-trigger"]) {
        body.eventTrigger = {
            eventType: def["event-trigger"]["event-type"],
            eventFilters: [],
        };

        for (const [key, value] of Object.entries(def["event-trigger"]["event-filters"])) {
            body.eventTrigger.eventFilters.push({attribute: key, value: value});
        }

        body.serviceConfig.environmentVariables.FUNCTION_SIGNATURE_TYPE = "cloudevent";
        body.serviceConfig.environmentVariables.EVENTARC_CLOUD_EVENT_SOURCE = "projects/" +
            def["project"] + "/locations/" + def["location"] + "/services/" + def["name"];
    }

    return body
}

let createFunc = function (def, storage) {
    let body = prepareBody(def, storage);

    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions?functionId=" + def["name"],
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
    res = http.put(body.uploadUrl, {headers: {"content-type": "application/zip"}, body: zippedBody})
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return body.storageSource;
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
