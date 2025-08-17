var cli = require("cli")
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

// API Docs: https://api.supabase.com/api/v1#tag/organizations/GET/v1/organizations
function list(def) {
    const token = secret.get(def.secret_ref);

    let res = http.do(buildURL(), {
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

    const orgs = JSON.parse(res.body);
    for (let i = 0; i < orgs.length; i++) {
        const org = get(token, orgs[i].id);
        cli.output(" | " + org.name + " | " + org.id + " | " + org.plan + " | ")
    }
}

function main(def, state, ctx) {
    if (!def.secret_ref) {
        def.secret_ref = "supabase-token";
    }

    switch (ctx.action) {
        case "list":
            list(def)
        default:
            // no action defined
            return;
    }

    return state;
}