let gcp = require("cloud/gcp");
let cli = require("cli");
let http = require("http");

function encodeQueryData(data) {
    const ret = [];
    for (let d in data)
      ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
 }

let createBucket = function (def) {
    cli.output("createBucket");

    let urlParam = {
        "project": gcp.getProject(),
        "alt": "json"
    };
    if (def["predefined-acl"]) {
        param["predefinedAcl"] = def["predefined-acl"];
    }
    if (def["predefined-default-object-acl"]) {
        param["predefinedDefaultObjectAcl"] = def["predefined-default-object-acl"];
    }
    if (def["projection"]) {
        param["projection"] = def["projection"];
    }

    let data = {
        "name": def["name"]
    };
    cli.output("https://storage.googleapis.com/storage/v1/b?" + encodeQueryData(urlParam))
    let res = gcp.post("https://storage.googleapis.com/storage/v1/b?" + encodeQueryData(urlParam), {
            "body": JSON.stringify(data),
            "headers": {
                "Content-Type": "application/json"
            }
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return JSON.parse(res.body)

}


let deleteBucket = function (def) {
    let res = gcp.delete("https://storage.googleapis.com/storage/v1/b/" + def["name"]);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return res
}

let getBucket = function (def) {
    let res = gcp.get("https://storage.googleapis.com/storage/v1/b/" + def["name"]);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return JSON.parse(res.body)
    
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            createBucket(def)
            break;
        case "purge":
            res = deleteBucket(def);
            state["status"] = "deleted";
            break;
        case "get":
            res = getBucket(def);
            break;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return state;
}