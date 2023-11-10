let cli = require("cli");

let BASE_URL = "https://runtimeconfig.googleapis.com/v1beta1"

function setVariablesRecursive(
    projectId,
    configId,
    varPath,
    val
) {
    let parsed = val;
    if (typeof val === "string") {
        try {
            // Only attempt to parse 'val' if it is a String (takes care of unparsed JSON, numbers, quoted string, etc.)
            parsed = JSON.parse(val);
        } catch (e) {
            // 'val' is just a String
        }
    }
    // If 'parsed' is object, call again
    if (typeof parsed === "object" && parsed !== null) {
        Object.entries(parsed).map(([key, item]) => {
            const newVarPath = varPath ? [varPath, key].join("/") : key;
            return setVariablesRecursive(projectId, configId, newVarPath, item);
        })
        return
    }

    // 'val' wasn't more JSON, i.e. is a leaf node; set and return
    return setVariable(projectId, configId, varPath, val);
}

function setVariable(
    projectId,
    configId,
    varPath,
    val
) {
    if (configId === "" || varPath === "") {
        const msg = "Config value must have a 2-part key (e.g. foo.bar)";
        throw new Error(msg);
    }

    let body = {
        name: "/projects/" + projectId +
            "/configs/" + configId + "/variables/" + varPath,
        text: val,
    };

    let res = gcp.post(BASE_URL + "/projects/" + projectId +
        "/configs/" + configId + "/variables",
        {"body": JSON.stringify(body)});

    if (res.error && res.error.includes("409")) {
        res = gcp.put(BASE_URL + "/projects/" + projectId +
            "/configs/" + configId + "/variables/" + varPath,
            {"body": JSON.stringify(body)});
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    } else if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

let createFunc = function (def) {
    const body = {
        name: "projects/" + def["project"] + "/configs/" + def["name"]
    };

    let res = gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/configs",
        {"body": JSON.stringify(body)});
    if (res.error && !res.error.includes("409")) {
        throw new Error(res.error + ", body " + res.body);
    }

    setVariablesRecursive(def["project"], def["name"], "", def["vars"]);
};

let updateFunc = function (def) {
    const body = prepareBody(def, storage);

    return gcp.put(BASE_URL + "/projects/" + def["project"] +
        "/configs/" + def["name"],
        {"body": JSON.stringify(body)});
};

let getFunc = function (def) {
    return gcp.get(BASE_URL + "/projects/" + def["project"] +
        "/configs/" + def["name"]);
};

let deleteFunc = function (def) {
    return gcp.delete(BASE_URL + "/projects/" + def["project"] +
        "/configs/" + def["name"]);
};

function main(def, state, ctx) {
    let res = {};
    switch (ctx.action) {
        case "create":
            createRes = createFunc(def);
            if (createRes) {
                res = createRes;
            }
            break;
        case "update":
            res = updateFunc(def);
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
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}
