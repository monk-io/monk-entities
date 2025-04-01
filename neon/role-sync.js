const http = require("http");
const secret = require("secret");

const BASE_URL = "https://console.neon.tech/api/v2";

function createRole(def) {
    const token = secret.get(def.secret_ref);

    const body = {
        role: {
            name: def.name
        }
    };

    let res = http.post(BASE_URL + "/projects/" + def.project_id + "/branches/" + def.branch_id + "/roles",
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

    let passwordRes = http.get(BASE_URL + "/projects/" + def.project_id + "/branches/" + def.branch_id + "/roles/" + def.name + "/reveal_password",
        {
            headers: {
                "authorization": "Bearer " + token,
                "accept": "application/json"
            }
        });

    if (passwordRes.error) {
        throw new Error(res.error + ", body " + passwordRes.body);
    }

    passwordResObj = JSON.parse(passwordRes.body);

    secret.set(def.password_secret_ref, passwordResObj.password);

    return {name: resObj.role.name};
}

function deleteRole(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(BASE_URL + "/projects/" + def.project_id + "/branches/" + state.id + "/roles/" + state.id,
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
    if (!def.branch) {
        def.branch = "main"
    }
    switch (ctx.action) {
        case "create":
            state = createRole(def)
            break;
        case "update":
            if (!state.name) {
                state = createRole(def);
            }
            break;
        case "purge":
            if (state.id) {
                deleteRole(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
