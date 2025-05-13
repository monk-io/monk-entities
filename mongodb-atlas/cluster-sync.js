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

function getCluster(def, token) {
    let res = http.get(BASE_URL + "/groups/" + def.project_id + "/clusters/" + def.name,
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
        throw new Error("Error getting cluster: " + res.status + ", body " + res.body);
    }
    return {id: resObj.id, name: resObj.name, existing: true};
}

function createCluster(def, token) {
    const body = {
        "name": def.name,
        "clusterType": "REPLICASET",
        "replicationSpecs": [
            {
                "regionConfigs": [
                    {
                        "electableSpecs": {
                            // "diskIOPS": 0,
                            // "ebsVolumeType": "STANDARD",
                            "instanceSize": def.instance_size,
                            "nodeCount": def.node_count
                        },
                        // "priority": 7,
                        "providerName": "TENANT",
                        "backingProviderName": def.provider,
                        "regionName": def.region
                    }
                ]
            }
        ]
    };

    if (def.organization) {
        const org = getOrganization(def.organization, token);
        body.orgId = org.id;
    }

    let res = http.post(BASE_URL + "/groups/" + def.project_id + "/clusters",
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

    return {id: resObj.id, name: resObj.name};
}

function updateCluster(def, state, token) {
    return state
}

function ensureAccessList(def, token) {
    let res = http.get(BASE_URL + "/groups/" + def.project_id + "/accessList",
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

    let toAdd = def.allow_ips;

    for (let i = 0; i < resObj.results.length; i++) {
        const entry = resObj.results[i];
        if (entry.comment !== def.name + " access list") {
            continue
        }

        let element = entry.ipAddress;
        if (entry.cidrBlock) {
            element = entry.cidrBlock;
        }

        const idx = toAdd.indexOf(element);
        if (idx !== -1) {
            toAdd.splice(idx, 1);
        } else {
            res = http.delete(BASE_URL + "/groups/" + def.project_id + "/accessList/" + element,
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
    }

    let bodyArr = [];

    for (let i = 0; i < toAdd.length; i++) {
        const entry = toAdd[i];

        let obj = {
            "comment": def.name + " access list",
        };

        if (entry.includes("/")) {
            obj.cidrBlock = entry;
        } else {
            obj.ipAddress = entry;
        }

        bodyArr.push(obj);
    }

    res = http.post(BASE_URL + "/groups/" + def.project_id + "/accessList",
        {
            headers: {
                "content-type": API_VERSION,
                "accept": API_VERSION,
                "authorization": "Bearer " + token,
            },
            body: JSON.stringify(bodyArr)
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function checkReady(def, state, token) {
    let res = http.get(BASE_URL + "/groups/" + def.project_id + "/clusters/" + def.name,
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
        throw new Error("Error getting cluster: " + res.status + ", body " + res.body);
    }

    if (resObj.stateName === "IDLE" && resObj.connectionStrings) {
        state.connection_standard = resObj.connectionStrings.standard;
        state.connection_srv = resObj.connectionStrings.standardSrv;
    } else {
        throw new Error("Cluster is not ready: " + res.status + ", body " + res.body);
    }

    return state;
}

function deleteCluster(def, state, token) {
    res = http.delete(BASE_URL + "/groups/" + def.project_id + "/clusters/" + state.name,
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
                const ex = getCluster(def, token);
                state = ex;
                break
            } catch {
            }

            state = createCluster(def, token)
            ensureAccessList(def, token);
            break;
        case "check-readiness":
            state = checkReady(def, state, token)
            break;
        case "get":
            getCluster(def, token);
            break;
        case "update":
            updateCluster(def, state, token);
            ensureAccessList(def, token);
            break;
        case "purge":
            if (state.id) {
                deleteCluster(def, state, token);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
