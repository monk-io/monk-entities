const http = require("http");
const secret = require("secret");
const BASE_URL = "https://api.supabase.com/v1";

function buildURL(organization_id) {
    let u = BASE_URL + "/organizations";
    if (organization_id) {
        u += "/" + organization_id;
    }
    return u;
}

// API Docs: https://api.supabase.com/api/v1#tag/organizations/GET/v1/organizations/{slug}
function get(token, organization_id) {
    let res = http.do(buildURL(organization_id), {
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
    if (def.slug) {
        return get(token, def.slug);
    }

    const body = {
        name: def.name,
    };

    let res = http.post(buildURL(), {
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
    if (def.slug) {
        return get(token, def.slug);
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

    let res = http.do(buildURL(state.id), {
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
    if (!def.slug) {
        throw new Error("Unimplemented on the API side");

        let res = http.delete(buildURL(state.id), {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json",
                "accept": "application/json"
            }
        });

        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
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