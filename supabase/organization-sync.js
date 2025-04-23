const http = require("http");
const secret = require("secret");
const BASE_URL = "https://api.supabase.com/v1/organizations";

// API Docs: https://api.supabase.com/api/v1#tag/organizations/GET/v1/organizations/{slug}
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

    return JSON.parse(res.body)
}

// API Docs: https://api.supabase.com/api/v1#tag/organizations/POST/v1/organizations
function create(def) {
    const token = secret.get(def.secret_ref);

    // if provided organization id, this mean organization will be managed via UI
    if (def.id) {
        return get(token, def.id);
    }

    const body = {
        name: def.name,
    };

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
    const token = secret.get(def.secret_ref);

    // if provided organization id, this mean organization will be managed via UI
    if (def.id) {
        return get(token, def.id);
    }

    const o = get(token, state.id);

    if (o.name === def.name) {
        // no change
        return state;
    }

    throw new Error("Unimplemented on the API side");

    const body = {
        name: def.name,
    };

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

    const r = JSON.parse(res.body);
    return get(token, r.id);
}

function purge(def, state) {
    const token = secret.get(def.secret_ref);

    // if provided organization id, this mean organization will be managed via UI
    if (def.id) {
        return get(token, def.id);
    }

    let res = http.do(BASE_URL + "/" + state.id, {
        method: "DELETE",
        headers: {
            "authorization": "Bearer " + token,
            "content-type": "application/json",
            "accept": "application/json"
        }
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return {}
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