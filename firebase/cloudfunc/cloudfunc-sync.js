let gcp = require("cloud/gcp")
let cli = require("cli")
let BASE_URL = "https://cloudfunctions.googleapis.com/v2"

let createFunc = function (def) {
    let body = {
        buildConfig: {
            source: {
                storageSource: {
                    bucket: def["source"]["bucket"],
                    object: def["source"]["object"]
                }
            },
            runtime: def["build"]["runtime"],
            entryPoint: def["build"]["entrypoint"]
        },
        serviceConfig: {
            maxInstanceCount: def["service"]["max-instance-count"],
            availableMemory: def["service"]["available-memory"],
            timeoutSeconds: def["service"]["timeout-seconds"]
        }
    };

    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions?functionId=" + def["name"],
        {"body": JSON.stringify(body)});
};

let patchFunc = function (def) {
    let body = {
        buildConfig: {
            source: {
                storageSource: {
                    bucket: def["source"]["bucket"],
                    object: def["source"]["object"]
                }
            },
            runtime: def["build"]["runtime"],
            entryPoint: def["build"]["entrypoint"]
        },
        serviceConfig: {
            maxInstanceCount: def["service"]["max-instance-count"],
            availableMemory: def["service"]["available-memory"],
            timeoutSeconds: def["service"]["timeout-seconds"]
        }
    };

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

function main(def, state, ctx) {
    let res = {};
    switch (ctx.action) {
        case "create":
            // check that source is provided
            if (!def.source) {
                res = generateUploadFunc(def);
                if (res.error) {
                    throw new Error(res.error + ", body " + res.body);
                }
                let body = JSON.parse(res.body);
                cli.output("Upload url: " + body.uploadUrl);
                cli.output("Storage source: " + JSON.stringify(body.storageSource));
                cli.output("Please upload and fill-in func sources");
                throw new Error("please, upload sources")
            }
            res = createFunc(def);
            break;
        case "patch":
            // check that source is provided
            res = patchFunc(def);
            break;
        case "purge":
            res = deleteFunc(def);
            break;
        case "generate-upload":
            res = generateUploadFunc(def);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            let body = JSON.parse(res.body);
            cli.output("Upload url: " + body.uploadUrl);
            cli.output("Storage source: " + JSON.stringify(body.storageSource));
            return;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    // set instance result to state
    let body = JSON.parse(res.body)
    return {"operation": body.name};
}
