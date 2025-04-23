const http = require("http");
const secret = require("secret");
const BASE_URL = "https://api.supabase.com/v1/projects";

// API Docs: https://api.supabase.com/api/v1#tag/projects/GET/v1/projects/{ref}
function get(token, id) {
    let res = http.do(BASE_URL + "/" + id, {
        method: "GET",
        headers: {
            "authorization": "Bearer " + token,
            "content-type": "application/json",
            "accept": "application/json"
        }
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    let obj = JSON.parse(res.body);
    obj.database_host = obj.database.host;
    return obj;
}

// API Docs: https://api.supabase.com/api/v1#tag/projects/POST/v1/projects
function create(def) {
    const token = secret.get(def.secret_ref);
    
    const body = {
        name: def.name,
        organization_id: def.organization_id,
        db_pass: secret.get(def.db_pass_ref),
        region: "us-east-1"
    };

    if (def.region) {
        body.region = def.region;
    }

    let res = http.post(BASE_URL, {
        method: "POST",
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

    const r = JSON.parse(res.body);
    return get(token, r.id);
}

function update(def, state) {
    // API does not support updating the project
    return state;

    const token = secret.get(def.secret_ref);

    const body = {
        name: def.name
    };

    if (def.allowed_ips) {
        body.settings = {allowed_ips: {ips: def.allowed_ips}};
    }

    let res = http.do(BASE_URL + "/" + state.id, {
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

    return state;
}

// API Docs: https://api.supabase.com/api/v1#tag/projects/DELETE/v1/projects/{ref}
function purge(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(BASE_URL + "/" + state.id, {
        method: "DELETE",
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
        def.secret_ref = "supabase-token";
    }

    switch (ctx.action) {
        case "create":
            state = create(def)
            break;
        case "update":
            if (state.id) {
                state = update(def, state);
            } else {
                state = create(def);
            }
            break;
        case "purge":
            if (state.id) {
                purge(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}