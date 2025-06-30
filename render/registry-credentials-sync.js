const cli = require("cli");
const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.render.com/v1";

function syncRegistryCredentials(def, state, update) {
    const apiKey = secret.get(def.api_key_secret);
    const authToken = secret.get(def.auth_token_secret);
    const body = {
        ownerId: def.workspace_id,
        registry: def.registry,
        name: def.name,
        username: def.username,
        authToken: authToken,
    }

    console.log(JSON.stringify(body));

    const req = {
        headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": "Bearer " + apiKey
        },
        body: JSON.stringify(body)
    };

    let res;
    if (update) {
        res = http.patch(BASE_URL + "/registrycredentials/" + state.id, req);
    } else {
        res = http.post(BASE_URL + "/registrycredentials", req);
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const resObj = JSON.parse(res.body);

    return {
        ready: true,
        id: resObj.id,
    };
}

function deleteRegistryCredentials(def, state) {
    const apiKey = secret.get(def.api_key_secret);

    const res = http.delete(BASE_URL + "/registrycredentials/"+ state.id,
        {
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": "Bearer " + apiKey
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            state = syncRegistryCredentials(def, state, false);
            break;
        case "update":
            if (state.id) {
                state = syncRegistryCredentials(def, state, true);
            } else {
                state = syncRegistryCredentials(def, state, false);
            }
            break;
        case "purge":
            if (state.id) {
                deleteRegistryCredentials(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}