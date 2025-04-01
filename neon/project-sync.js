const http = require("http");
const secret = require("secret");

const BASE_URL = "https://console.neon.tech/api/v2";

function createProject(def) {
    const token = secret.get(def.secret_ref);

    const body = {
        name: def.name,
        // defaults
        pg_version: 17,
        region_id: "aws-us-east-2"
    };

    if (def.allowed_ips) {
        body.settings = {allowed_ips: {ips: def.allowed_ips}};
    }

    if (def.pg_version) {
        body.pg_version = def.pg_version;
    }

    if (def.region_id) {
        body.region_id = def.region_id;
    }

    let res = http.post(BASE_URL + "/projects",
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json",
                "accept": "application/json"
            },
            body: JSON.stringify({project: body})
        });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    return {id: resObj.project.id, name: resObj.project.name};
}

function updateProject(def, state) {
    const token = secret.get(def.secret_ref);

    const body = {
        name: def.name
    };

    if (def.allowed_ips) {
        body.settings = {allowed_ips: {ips: def.allowed_ips}};
    }

    let res = http.do(BASE_URL + "/projects/" + state.id,
        {
            method: "PATCH",
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json",
                "accept": "application/json"
            },
            body: JSON.stringify({project: body})
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function deleteProject(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(BASE_URL + "/projects/" + state.id,
        {
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
        def.secret_ref = "default-neon-token";
    }
    switch (ctx.action) {
        case "create":
            state = createProject(def)
            break;
        case "update":
            if (state.id) {
                updateProject(def, state);
            } else {
                state = createProject(def);
            }
            break;
        case "purge":
            if (state.id) {
                deleteProject(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
