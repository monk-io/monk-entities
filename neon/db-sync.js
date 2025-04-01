const http = require("http");
const secret = require("secret");

const BASE_URL = "https://console.neon.tech/api/v2";

function createDatabase(def) {
    const token = secret.get(def.secret_ref);

    const endpoint = getEndpoint(def, token);
    const body = {
        database: {
            name: def.name,
            owner_name: def.role_name,
        }
    };

    let res = http.post(BASE_URL + "/projects/" + def.project_id + "/branches/" + def.branch_id + "/databases",
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

    return {
        id: resObj.database.id,
        name: resObj.database.name,
        owner_name: resObj.database.owner_name,
        endpoint: endpoint
    };
}

function getEndpoint(def, token) {
    let res = http.get(BASE_URL + "/projects/" + def.project_id + "/branches/" + def.branch_id + "/endpoints",
        {
            headers: {
                "authorization": "Bearer " + token,
                "accept": "application/json"
            }
        });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    for (let i = 0; i < resObj.endpoints.length; i++) {
        if (resObj.endpoints[i].type === "read_write") {
            return resObj.endpoints[i].host;
        }
    }

    throw new Error("No read_write endpoint found");
}

function updateDatabase(def, state) {
    const token = secret.get(def.secret_ref);

    const endpoint = getEndpoint(def, token);

    if (def.name === state.name && def.role_name === state.owner_name) {
        if (endpoint !== state.endpoint) {
            state.endpoint = endpoint;
        }
        return state;
    }

    const body = {
        database: {}
    };

    if (def.name !== state.name) {
        body.database.name = def.name;
    }

    if (def.role_name !== state.owner_name) {
        body.database.owner_name = def.role_name;
    }

    let res = http.do(BASE_URL + "/projects/" + def.project_id + "/branches/" + state.id + "/databases/" + state.name,
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

    return {
        id: resObj.database.id,
        name: resObj.database.name,
        owner_name: resObj.database.owner_name,
        endpoint: endpoint
    };
}

function deleteDatabase(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(BASE_URL + "/projects/" + def.project_id + "/branches/" + state.id + "/databases/" + state.name,
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
            state = createDatabase(def)
            break;
        case "update":
            if (state.id) {
                state = updateDatabase(def, state);
            } else {
                state = createDatabase(def);
            }
            break;
        case "purge":
            if (state.id) {
                deleteDatabase(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
