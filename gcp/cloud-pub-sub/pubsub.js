let gcp = require("cloud/gcp");
let cli = require("cli");
let http = require("http");

let createSubscription = function (def) {
    cli.output("createSubscription");
    let data = {
        "name": "sub-" + def["name"],
        "topic": "projects/" + gcp.getProject() + "/topics/" + def["name"]
    };
    let res = gcp.put("https://pubsub.googleapis.com/v1/projects/" + gcp.getProject() + "/subscriptions/" + data.name, {
        "body": JSON.stringify(data),
        "headers": {
            "Content-Type": "application/json"
        }
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    cli.output(JSON.stringify(res.body));
    return JSON.parse(res.body)
}

let deleteSubscription = function (def) {
    cli.output("deleteSubscription");
    let data = {
        "name": "sub-" + def["name"],
    };
    let res = gcp.delete("https://pubsub.googleapis.com/v1/projects/" + gcp.getProject() + "/subscriptions/" + data.name, {
        "headers": {
            "Content-Type": "application/json"
        }
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return JSON.parse(res.body)
}

let getSubscription = function (def) {
    let data = {
        "name": "sub-" + def["name"],
    };
    let res = gcp.get("https://pubsub.googleapis.com/v1/projects/" + gcp.getProject() + "/subscriptions/" + data.name, {
        "headers": {
            "Content-Type": "application/json"
        }
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    cli.output(JSON.stringify(res.body));
    return JSON.parse(res.body)
}



let createTopic = function (def) {
    cli.output("createTopic");
    let data = {
        "name": def["name"]
    };
    let res = gcp.put("https://pubsub.googleapis.com/v1/projects/" + gcp.getProject() + "/topics/" + def["name"], {
        "body": JSON.stringify(data),
        "headers": {
            "Content-Type": "application/json"
        },
        "timeout": 60
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return JSON.parse(res.body)

}


let deleteTopic = function (def) {
    let res = gcp.delete("https://pubsub.googleapis.com/v1/projects/" + gcp.getProject() + "/topics/" + def["name"]);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return res
}

let getTopic = function (def) {
    let res = gcp.get("https://pubsub.googleapis.com/v1/projects/" + gcp.getProject() + "/topics/" + def["name"]);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return JSON.parse(res.body)

}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    let resSubs = {};
    cli.output(JSON.stringify(state));
    switch (ctx.action) {
        case "recreate":
        case "create": {
            createTopic(def);
            state["topic_name"] = res["name"];
            break;
        }
        case "purge":
            if (state["subscription_name"]) {
                deleteSubscription(def);
            }
            res = deleteTopic(def);
            state["status"] = "deleted";
            break;
        case "get": {
            res = getTopic(def);
            state["topic_name"] = res["name"];
            break;
        }
        case "create-subscription": {
            resSubs = createSubscription(def);
            state["status"] = "create-subscription";
            state["subscription_name"] =  resSubs["name"];
            break;
        }            
        case "delete-subscription": {
            resSubs = deleteSubscription(def);
            delete state["subscription_name"];
            break;
        } 
        case "get-subscription": {
            resSubs = getSubscription(def);
            state["subscription_name"] =  resSubs["name"];;
            break;
        }
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return state;
}