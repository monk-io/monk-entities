const http = require("http");
const secret = require("secret");
const BASE_URL = "https://api.supabase.com/v1";

function buildURL(project_id, branch_id) {
    let u = BASE_URL + "/projects/" + project_id + "/branches";
    if (branch_id) {
        u += "/" + branch_id;
    }
    return u;
}

// API Docs: https://api.supabase.com/api/v1#tag/environments/GET/v1/branches/{branch_id}
function get(token, project_id, branch_id) {
    let res = http.do(buildURL(project_id, branch_id), {
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
    return obj;
}

// API Docs: https://api.supabase.com/api/v1#tag/environments/POST/v1/projects/{ref}/branches
function create(def) {
    const token = secret.get(def.secret_ref);

    // if specified, all management will be delegated to supabase dashboard
    if (def.slug) {
        return get(token, def.project_id, def.slug);
    }

    const body = {
        branch_name: def.name
    };

    if (def.git_branch) {
        body.git_branch = def.git_branch;
    }

    if (def.persistent) {
        body.persistent = def.persistent;
    }

    if (def.region) {
        body.region = def.region;
    }

    if (def.desired_instance_size) {
        body.desired_instance_size = def.desired_instance_size;
    }
    
    if (def.release_channel) {
        body.release_channel = def.release_channel;
    }

    let res = http.post(buildURL(def.project_id), {
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

    let obj = JSON.parse(res.body);
    return obj;
}

function update(def, state) {
    // if specified, all management will be delegated to supabase dashboard
    if (def.slug) {
        return get(token, def.project_id, def.slug);
    }

    // API does not support updating the project
    return state;

    const token = secret.get(def.secret_ref);

    if (def.name === state.name) {
        return state
    }

    const body = {
        branch: {
            name: def.name
        }
    };

    let res = http.do(buildURL(def.project_id, state.id), {
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

    return JSON.parse(res.body);
}

// API Docs: https://api.supabase.com/api/v1#tag/environments/DELETE/v1/branches/{branch_id}
function purge(def, state) {
    const token = secret.get(def.secret_ref);

    // if specified, all management will be delegated to supabase dashboard
    if (!def.slug) {
        res = http.delete(buildURL(def.project_id, state.id), {
            headers: {
                "authorization": "Bearer " + token,
                "accept": "application/json"
            },
        });

        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }
}


function main(def, state, ctx) {
    if (!def.secret_ref) {
        def.secret_ref = "default-supabase-token";
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
