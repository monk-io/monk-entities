const http = require("http");
const secret = require("secret");

const BASE_URL = "https://console.neon.tech/api/v2";

function createBranch(def) {
    const token = secret.get(def.secret_ref);

    const body = {
        branch: {
            name: def.name
        }
    };

    if (def.parent_id) {
        body.branch.parent_id = def.parent_id;
    }

    if (def.endpoints) {
        body.endpoints = [];
        for (let i = 0; i < def.endpoints.length; i++) {
            body.endpoints.push({
                type: def.endpoints[i],
            });
        }
    }

    let res = http.post(BASE_URL + "/projects/" + def.project_id + "/branches",
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json",
                "accept": "application/json"
            },
            body: JSON.stringify(body)
        });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    return {id: resObj.branch.id, name: resObj.branch.name};
}

function updateBranch(def, state) {
    const token = secret.get(def.secret_ref);

    if (def.name === state.name) {
        return state
    }

    const body = {
        branch: {
            name: def.name
        }
    };

    let res = http.do(BASE_URL + "/projects/" + def.project_id + "/branches/" + state.id,
        {
            method: "PATCH",
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json",
                "accept": "application/json"
            },
            body: JSON.stringify(body)
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    return {id: resObj.branch.id, name: resObj.branch.name};
}

function deleteBranch(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(BASE_URL + "/projects/" + def.project_id + "/branches/" + state.id,
        {
            headers: {
                "authorization": "Bearer " + token,
                "accept": "application/json"
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}


function main(def, state, ctx) {
    if (!def.secret_ref) {
        def.secret_ref = "default-neon-token";
    }
    switch (ctx.action) {
        case "create":
            state = createBranch(def)
            break;
        case "update":
            if (state.id) {
                state = updateBranch(def, state);
            } else {
                state = createBranch(def);
            }
            break;
        case "purge":
            if (state.id) {
                deleteBranch(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
