const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.upstash.com/v2/redis";

const FIELD_MAPPING = {
    name: "name",
    region: "region",
    primary_region: "primary_region",
    tls: "tls",
};

function convertExclamationArrays(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key.includes("!")) {
            const [base, index] = key.split("!");
            const idx = parseInt(index, 10);
            if (!result[base]) result[base] = [];
            if (typeof value === "object" && value !== null) {
                result[base][idx] = convertExclamationArrays(value);
            } else {
                result[base][idx] = value;
            }
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            result[key] = convertExclamationArrays(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

function mapDatabaseDefinition(def) {
    const normalizedDef = convertExclamationArrays(def);

    function processValue(value, mapping) {
        if (Array.isArray(value)) {
            if (mapping.newKey && mapping.items) {
                return { [mapping.newKey]: value.map(item => processObject(item, mapping.items)) };
            }
            return value.map(item => {
                if (typeof item === "object" && item !== null && mapping.items) {
                    return processObject(item, mapping.items);
                }
                return item;
            });
        }

        if (typeof value === "object" && value !== null) {
            if (typeof mapping === "string") {
                return { [mapping]: value };
            }
            if (mapping.newKey) {
                return { [mapping.newKey]: processObject(value, mapping.fields || {}) };
            }
            return processObject(value, mapping);
        }
        return value;
    }

    function processObject(obj, mapping) {
        const result = {};

        for (const [sourceKey, targetKey] of Object.entries(mapping)) {
            if (obj[sourceKey] !== undefined) {
                if (typeof targetKey === "object") {
                    const nestedValue = obj[sourceKey];
                    const nestedResult = processValue(nestedValue, targetKey);
                    Object.assign(result, nestedResult);
                } else {
                    result[targetKey] = obj[sourceKey];
                }
            }
        }

        return result;
    }

    return processObject(normalizedDef, FIELD_MAPPING);
}

function syncDatabase(def, state, update) {
    const username = secret.get(def.email_secret)
    const password = secret.get(def.auth_token_secret);
    const authString = btoa(`${username}:${password}`);

    const body = mapDatabaseDefinition(def);
    console.log("Request body:", JSON.stringify(body, null, 2));

    const req = {
        headers: {
            "Authorization": `Basic ${authString}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify(body),
    };

    let res;
    try {
        if (update && state.id) {
            if (state.name !== def.name) {
                console.log("Database name changed, updating state");
                state.name = def.name;
                res = http.post(`${BASE_URL}/rename/${state.id}`, req);
            }else {
                return state;
            }
        } else {
            console.log("Creating new database");
            res = http.post(`${BASE_URL}/database`, req);
        }
    } catch (err) {
        console.error("HTTP request failed:", err.message);
        throw err;
    }

    console.log("Response status:", res.status);
    console.log("Response body:", res.body);

    if (res.error || res.status >= 400) {
        throw new Error(`API error: ${res.error || "Unknown error"}, status: ${res.status}, body: ${res.body}`);
    }

    let dbObj;
    try {
        dbObj = JSON.parse(res.body);
    } catch (err) {
        throw new Error(`Failed to parse response: ${err.message}, body: ${res.body}`);
    }

    return {
        ready: dbObj.state === "active",
        id: dbObj.database_id,
        name: dbObj.database_name,
        password: dbObj.password,
        port: dbObj.port,
        publicEndpoint: dbObj.endpoint,
    };
}

function deleteDatabase(def, state) {
    const username = secret.get(def.email_secret)
    const password = secret.get(def.auth_token_secret);
    const authString = btoa(`${username}:${password}`);
    console.log("Deleting database with ID:", state);

    const res = http.delete(`${BASE_URL}/database/${state.id}`, {
        headers: {
            "Authorization": `Basic ${authString}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);
}

function checkReadiness(def, state) {
    const username = secret.get(def.email_secret)
    const password = secret.get(def.auth_token_secret);
    const authString = btoa(`${username}:${password}`);

    const res = http.get(`${BASE_URL}/database/${state.id}`, {
        headers: {
            "Authorization": `Basic ${authString}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const dbObj = JSON.parse(res.body);
    if (dbObj.state === "active") {
        state.publicEndpoint = dbObj.endpoint;
        state.ready = true;
        return state;
    }

    throw "not ready";
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            state = syncDatabase(def, state, false);
            break;
        case "update":
            if (state.id) {
                state = syncDatabase(def, state, true);
            } else {
                state = syncDatabase(def, state, false);
            }
            break;
        case "purge":
            if (state.id) {
                deleteDatabase(def, state);
            }
            break;
        case "check-readiness":
            checkReadiness(def, state);
            break;
        default:
            return;
    }

    return state;
}