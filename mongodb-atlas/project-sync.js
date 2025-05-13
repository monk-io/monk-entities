const http = require("http");
const secret = require("secret");
const cli = require("cli");

const BASE_URL = "https://cloud.mongodb.com/api/atlas/v2";
const API_VERSION = "application/vnd.atlas.2023-01-01+json";

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

function getOrganization(name, token) {
    let res = http.get(BASE_URL + "/orgs?envelope=false&name=" + name,
        {
            headers: {
                "accept": API_VERSION,
                "authorization": "Bearer " + token,
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resArr = JSON.parse(res.body);
    if (resArr.length === 0) {
        throw new Error("Error getting organization: " + res.status + ", body " + res.body);
    }

    for (let i = 0; i < resArr.results.length; i++) {
        if (resArr.results[i].name === name) {
            return {id: resArr.results[i].id, name: resArr.results[i].name};
        }
    }

    throw new Error("Error getting organization: " + res.status + ", body " + res.body);
}

function getProject(def, token) {
    let res = http.get(BASE_URL + "/groups/byName/" + def.name,
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
    if (!resObj.id) {
        throw new Error("Error getting project: " + res.status + ", body " + res.body);
    }
    return {id: resObj.id, name: resObj.name, orgId: resObj.orgId, existing: true};
}

function createProject(def, token) {
    const body = {
        "name": def.name,
        "withDefaultAlertsSettings": true
    };

    if (def.organization) {
        const org = getOrganization(def.organization, token);
        body.orgId = org.id;
    }

    let res = http.post(BASE_URL + "/groups",
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

    return {id: resObj.id, name: resObj.name, orgId: resObj.orgId};
}

function updateProject(def, state, token) {
    return state
}

function deleteProject(def, state, token) {
    res = http.delete(BASE_URL + "/groups/" + state.id,
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

    if (ctx.action === "update" && !state.id) {
        ctx.action = "create";
    }
    switch (ctx.action) {
        case "create":
            try {
                const ex = getProject(def, token);
                state = ex;
                break
            } catch {
            }

            state = createProject(def, token)
            break;
        case "update":
            updateProject(def, state, token);
            break;
        case "purge":
            if (!state.existing && state.id) {
                deleteProject(def, state, token);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
