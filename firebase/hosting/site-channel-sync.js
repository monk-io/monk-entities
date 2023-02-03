let gcp = require("cloud/gcp")
let cli = require("cli")
let BASE_URL = "https://firebasehosting.googleapis.com/v1beta1"

let createSiteChannel = function (def) {
    let body = {
        retainedReleaseCount: 10,
    };
    let retain = parseInt(def["retained-release-count"], 10);
    if (!isNaN(retain) && retain > 0) {
        body.retainedReleaseCount = retain;
    }
    if (def["ttl"]) {
        body.ttl = def["ttl"];
    }
    if (def["labels"]) {
        body.labels = def["labels"];
    }
    return gcp.post(BASE_URL + "/sites/" + def["site"] + "/channels?channelId=" + def["name"],
        {"body": JSON.stringify(body)});
};

let deleteSiteChannel = function (def) {
    return gcp.delete(BASE_URL + "/sites/" + def["site"] +
        "/channels/" + def["name"]);
};

let listReleases = function (def) {
    return gcp.get(BASE_URL + "/sites/" + def["site"] +
        "/channels/" + def["name"] + "/releases");
};

function main(def, state, ctx) {
    let res = {};
    switch (ctx.action) {
        case "create":
            res = createSiteChannel(def);
            break;
        case "purge":
            res = deleteSiteChannel(state.name);
            break;
        case "list-releases":
            res = listReleases(def)
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            let body = JSON.parse(res.body);
            if (body.releases) {
                cli.output("Releases: " + JSON.stringify(body.releases));
            } else {
                cli.output("Releases: none");
            }

            return;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    // set instance result to state
    cli.output(res.body);
    let body = JSON.parse(res.body);
    return {"name": body.name, "url": body.url};
}
