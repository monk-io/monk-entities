let gcp = require("cloud/gcp")
let cli = require("cli")
let BASE_URL = "https://firebasedatabase.googleapis.com/v1beta"

let createDBInstance = function (def) {
    let body = {
        type: "USER_DATABASE"
    };

    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/instances?databaseId=" + def["name"],
        {"body": JSON.stringify(body)});
};

let getDBInstance = function (def) {
    return gcp.get(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/instances/" + def["name"]);
};

let disableDBInstance = function (def) {
    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/instances/" + def["name"] + ":disable");
};

let reenableDBInstance = function (def) {
    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/instances/" + def["name"] + ":reenable");
};

let deleteDBInstance = function (def) {
    return gcp.delete(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/instances/" + def["name"]);
};

let undeleteDBInstance = function (def) {
    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/instances/" + def["name"] + ":undelete");
};

let getRules = function (url) {
    return gcp.get(url + "/.settings/rules.json");
}


let setRules = function (url, rules) {
    return gcp.put(url + "/.settings/rules.json", {"body": rules});
}

let get = function (url, path) {
    if (path === undefined) {
        path = "/"
    }
    return gcp.get(url + path + ".json");
}

let set = function (url, path, value) {
    if (path === undefined) {
        throw new Error("path is required")
    }
    return gcp.put(url + path + ".json", {"body": value});
}

let push = function (url, path, value) {
    if (path === undefined) {
        throw new Error("path is required")
    }
    return gcp.post(url + path + ".json", {"body": value});
}

let remove = function (url, path) {
    if (path === undefined) {
        throw new Error("path is required")
    }
    return gcp.delete(url + path + ".json");
}

function main(def, state, ctx) {
    let res = {};
    switch (ctx.action) {
        case "create":
            let exRes = getDBInstance(def);
            if (!exRes.error) {
                let body = JSON.parse(exRes.body);
                if (body.state === "DELETED") {
                    // restore deleted instance
                    res = undeleteDBInstance(def);
                    break;
                }
                // use existing instance
                // we could return "already exists" error here
                res = exRes;
                break
            }
            // create a new instance
            res = createDBInstance(def);
            break;
        case "disable":
            res = disableDBInstance(def);
            break;
        case "reenable":
            res = reenableDBInstance(def);
            break;
        case "purge":
            if (state.state !== "DISABLED") {
                throw new Error("Database has to be disabled before remove!");
            }
            res = deleteDBInstance(def);
            break;
        case "get-rules":
            res = getRules(state.url);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            cli.output("Rules: " + res.body);
            return;
        case "set-rules":
            res = setRules(state.url, ctx.args.rules);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            return;
        case "get":
            res = get(state.url, ctx.args.path);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            cli.output("Data: " + res.body);
            return;
        case "set":
            res = set(state.url, ctx.args.path, ctx.args.value);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            return;
        case "push":
            res = push(state.url, ctx.args.path, ctx.args.value);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            return;
        case "remove":
            res = remove(state.url, ctx.args.path);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            return;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error);
    }
    // set instance result to state
    let body = JSON.parse(res.body)
    return {"name": body.name, "url": body.databaseUrl, "state": body.state};
}
