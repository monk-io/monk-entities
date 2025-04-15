const cli = require("cli");
const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.vercel.com";

function getProject(def) {
    const token = secret.get(def.secret_ref);

    let res = http.get(BASE_URL + "/v9/projects/" + def.name,
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            }
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    return {id: resObj.id, name: resObj.name};
}

function createProject(def) {
    const token = secret.get(def.secret_ref);

    const body = {
        name: def.name
    };

    let res = http.post(BASE_URL + "/v11/projects",
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            },
            body: JSON.stringify(body)
        });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    return {id: resObj.id, name: resObj.name};
}

function getDomain(def, state) {
    const token = secret.get(def.secret_ref);

    let res = http.get(BASE_URL + "/v9/projects/' + state.id +'/domains",
        {headers: {"authorization": "Bearer " + token}});
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);
    if (resObj.length > 0) {
        return resObj[0].domain;
    }

    return "";
}

function updateProject(def, state) {
    const token = secret.get(def.secret_ref);

    if (state.name === def.name) {
        return state;
    }
    state.name = def.name;

    const body = {
        name: def.name
    };

    let res = http.do(BASE_URL + "/v9/projects/" + state.id,
        {
            method: "PATCH",
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            },
            body: JSON.stringify(body)
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return state;
}

function deleteProject(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(BASE_URL + "/v9/projects/" + state.id,
        {
            headers: {
                "authorization": "Bearer " + token,
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}


function main(def, state, ctx) {
    if (!def.secret_ref) {
        def.secret_ref = "default-vercel-token";
    }
    if (ctx.action === "update" && !state.id) {
        ctx.action = "create";
    }
    switch (ctx.action) {
        case "create":
            try {
                const ex = getProject(def);
                state = ex;
                state.existing = true
                break
            } catch {
            }

            state = createProject(def)
            break;
        case "update":
            state = updateProject(def, state);
            break;
        case "purge":
            if (!state.existing && state.id) {
                deleteProject(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
