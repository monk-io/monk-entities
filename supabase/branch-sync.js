const http = require("http");
const secret = require("secret");

function baseURL(project_id) {
    return "https://api.supabase.com/v1/projects/" + project_id + "/branches";
}

// API Docs: https://api.supabase.com/api/v1#tag/environments/POST/v1/projects/{ref}/branches
function create(def) {
    const token = secret.get(def.secret_ref);

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

    let res = http.post(baseURL(def.project_id), {
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

    resObj = JSON.parse(res.body);

    return {id: resObj.branch.id, name: resObj.branch.name};
}

function update(def, state) {
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

    let res = http.do(baseURL(def.project_id) + "/" + state.id, {
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

function purge(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(baseURL(def.project_id) + "/" + state.id, {
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
