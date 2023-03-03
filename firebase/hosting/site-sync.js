let gcp = require("cloud/gcp")
let cli = require("cli")
let BASE_URL = "https://firebasehosting.googleapis.com/v1beta1"

let createSite = function (def) {
    let body = {
        type: "USER_SITE"
    };

    return gcp.post(BASE_URL + "/projects/" + def["project"] +
        "/sites?siteId=" + def["name"],
        {"body": JSON.stringify(body)});
};

let getSite = function (def) {
    return gcp.get(BASE_URL + "/projects/" + def["project"] +
        "/sites/" + def["name"]);
};

let deleteSite = function (def) {
    return gcp.delete(BASE_URL + "/projects/" + def["project"] +
        "/sites/" + def["name"]);
};

function main(def, state, ctx) {
    let res = {};
    switch (ctx.action) {
        case "create":
            let exRes = getSite(def);
            if (!exRes.error) {
                // use existing website
                res = exRes;
                break;
            }
            res = createSite(def);
            break;
        case "purge":
            res = getSite(def);
            if (res.error && res.error.includes("response code 404")) {
                // resource is removed
                return;
            }
            res = deleteSite(def);
            break;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    // set instance result to state
    let body = JSON.parse(res.body)
    return {"name": body.name, "url": body.defaultUrl};
}
