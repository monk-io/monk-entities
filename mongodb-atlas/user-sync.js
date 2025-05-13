const http = require("http");
const secret = require("secret");
const cli = require("cli");

const BASE_URL = "https://cloud.mongodb.com/api/atlas/v2";
const API_VERSION = "application/vnd.atlas.2025-03-12+json";

function getToken(def) {
    const now = new Date();
    let cached_token = '';
    let cached_token_expires = '';

    try {
        cached_token = secret.get(def.secret_ref + "_cached_token");
        cached_token_expires = secret.get(def.secret_ref + "_cached_token_expires");
    } catch (e) {
    }

    if (cached_token && cached_token_expires) {
        const expires = new Date(cached_token_expires);
        if (now < expires) {
            return cached_token;
        }
    }

    let token = secret.get(def.secret_ref);
    if (!token) {
        throw new Error("Token not found");
    }

    if (!token.startsWith("mdb_sa")) {
        throw new Error("Token is not a service account token");
    }

    let res = http.post("https://cloud.mongodb.com/api/oauth/token",
        {
            headers: {
                "accept": "application/json",
                "content-type": "application/x-www-form-urlencoded",
                "cache-control": "no-cache",
                "authorization": "Basic " + btoa(token),
            },
            body: "grant_type=client_credentials"
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    if (res.status >= 400) {
        throw new Error("Error getting token: " + res.status + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);
    if (!resObj.access_token) {
        throw new Error("Error getting token: " + res.status + ", body " + res.body);
    }

    if (resObj.expires_in) {
        const expires_in = new Date(now.getTime() + resObj.expires_in * 1000);
        secret.set(def.secret_ref + "_cached_token", resObj.access_token);
        secret.set(def.secret_ref + "_cached_token_expires", expires_in.toISOString());
    }


    return resObj.access_token;
}

function getUser(def, token) {
    let res = http.get(BASE_URL + "/groups/" + def.project_id + "/databaseUsers/admin/" + def.name,
        {
            headers: {
                "accept": API_VERSION,
                "authorization": "Bearer " + token,
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);
    if (!resObj.username) {
        throw new Error("Error getting user: " + res.status + ", body " + res.body);
    }
    return {name: resObj.username, existing: true};
}

function createUser(def, token) {
    let password = '';
    try {
        password = secret.get(def.password_secret_ref);
    } catch (e) {
        password = secret.randString(16);
        secret.set(def.password_secret_ref, password);
    }

    let role = def.role;
    if (!role) {
        role = "readWriteAnyDatabase";
    }

    const body = {
        "username": def.name,
        "databaseName": "admin",
        "password": password,
        "roles": [
            {
                "databaseName": "admin",
                "roleName": role
            }
        ]
    };

    let res = http.post(BASE_URL + "/groups/" + def.project_id + "/databaseUsers",
        {
            headers: {
                "content-type": API_VERSION,
                "accept": API_VERSION,
                "authorization": "Bearer " + token,
            },
            body: JSON.stringify(body)
        });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    return {name: resObj.username};
}

function updateUser(def, state, token) {
    return state
}

function deleteUser(def, state, token) {
    res = http.delete(BASE_URL + "/groups/" + def.project_id + "/databaseUsers/admin/" + state.name,
        {
            headers: {
                "authorization": "Bearer " + token,
                "accept": API_VERSION,
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}


function main(def, state, ctx) {
    const token = getToken(def);

    if (ctx.action === "update" && !state.name) {
        ctx.action = "create";
    }
    switch (ctx.action) {
        case "create":
            try {
                const ex = getUser(def, token);
                state = ex;
                break
            } catch {
            }

            state = createUser(def, token)
            break;
        case "update":
            updateUser(def, state, token);
            break;
        case "purge":
            if (state.id) {
                deleteUser(def, state, token);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
