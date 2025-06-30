const cli = require("cli");
const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.render.com/v1";

function syncService(def, state, update) {
    const apiKey = secret.get(def.api_key_secret);
    const body = {
        ownerId: def.workspace_id,
        type: def.service_type,
        name: def.name,
        repo: def.repo,
        autoDeploy: def.auto_deploy,
        branch: def.branch,
        rootDir: def.root_dir,
        image: def.image ? {
            ownerId: def.image.workspace_id,
            registryCredentialId: def.image.registry_credential_id,
            imagePath: def.image.image_path,
        } : undefined,
        serviceDetails: def.service_details ? {
            buildCommand: def.service_details.build_command,
            publishPath: def.service_details.publish_path,
            runtime: def.service_details.runtime,
            region: def.service_details.region,
            plan: def.service_details.plan,
            envSpecificDetails: def.service_details.env_specific_details ? {
                buildCommand: def.service_details.env_specific_details.build_command,
                startCommand: def.service_details.env_specific_details.start_command,
                dockerCommand: def.service_details.env_specific_details.docker_command,
                dockerContext: def.service_details.env_specific_details.docker_context,
                dockerfilePath: def.service_details.env_specific_details.dockerfile_path,
                registryCredentialId: def.service_details.env_specific_details.registry_credential_id,
            } : undefined,
        } : undefined,
    }

    console.log(JSON.stringify(body));

    const req = {
        headers: {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": "Bearer " + apiKey
        },
        body: JSON.stringify(body)
    };

    let res;
    if (update) {
        res = http.patch(BASE_URL + "/services/" + state.id, req);
    } else {
        res = http.post(BASE_URL + "/services", req);
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const resObj = JSON.parse(res.body);

    return {
        ready: false,
        id: resObj.service.id,
        deployId: resObj.deployId,
        slug: resObj.slug,
    };
}

function deleteService(def, state) {
    const apiKey = secret.get(def.api_key_secret);

    const res = http.delete(BASE_URL + "/services/"+ state.id,
        {
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": "Bearer " + apiKey
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function checkReadiness(def, state) {
    const apiKey = secret.get(def.api_key_secret);

    const res = http.get(BASE_URL + "/services/" + state.id + "/deploys/" + state.deployId,
        {
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "authorization": "Bearer " + apiKey
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const resObj = JSON.parse(res.body);
    if (resObj.status === "live") {
        state.ready = true;
        return state;
    }

    throw new Error("not ready");
}


function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            state = syncService(def, state, false);
            break;
        case "update":
            if (state.id) {
                state = syncService(def, state, true);
            } else {
                state = syncService(def, state, false);
            }
            break;
        case "purge":
            if (state.id) {
                deleteService(def, state);
            }
            break;
        case "check-readiness":
            checkReadiness(def, state);
            break;
        default:
            // no action defined
            return;
    }

    return state;
}