let gcp = require("cloud/gcp")
let BASE_URL = "https://serviceusage.googleapis.com/v1"

function checkApi(projectId, apiName) {
    const res = gcp.get(
        BASE_URL + `/projects/${projectId}/services/${apiName}`
    );
    if (res.error) {
        throw new Error("checkApi: " + res.error + ", body " + res.body);
    }

    return JSON.parse(res.body).state === "ENABLED";
}

function enableApi(projectId, apiName) {
    const res = gcp.post(
        BASE_URL + `/projects/${projectId}/services/${apiName}:enable`
    );
    if (res.error) {
        throw new Error("enableApi: " + res.error + ", body " + res.body);
    }

    return JSON.parse(res.body);
}

function checkApis(projectId, apiNames) {
    let names = "";
    for (let i = 0, len = apiNames.length; i < len; i++) {
        if (i > 0) {
            names += "&";
        }
        names += `names=projects/${projectId}/services/${apiNames[i]}`;
    }

    const res = gcp.get(
        BASE_URL + `/projects/${projectId}/services/:batchGet?${names}`
    );
    if (res.error) {
        throw new Error("checkApis: " + res.error + ", body " + res.body);
    }
    const body = JSON.parse(res.body);


    for (let i = 0, len = body.services.length; i < len; i++) {
        for (let n = 0, nlen = apiNames.length; n < nlen; n++) {
            if (body.services[i].name.endsWith("/" + apiNames[n]) && body.services[i].state === "ENABLED") {
                apiNames.splice(n, 1);
                break;
            }
        }
    }

    return apiNames;
}

function enableApis(projectId, apiNames) {
    const body = {
        serviceIds: apiNames
    };

    const res = gcp.post(
        BASE_URL + `/projects/${projectId}/services/:batchEnable`,
        {"body": JSON.stringify(body)}
    );
    if (res.error) {
        throw new Error("enableApis: " + res.error + ", body " + res.body);
    }

    return JSON.parse(res.body);
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
        case "update":
            if (def.apis) {
                // process batch
                let toEnable = checkApis(def.project, def.apis)
                if (toEnable.length === 0) {
                    return {ready: true};
                }
                let body = enableApis(def.project, toEnable);
                return {ready: false, operation: body.name}
            } else if (def.name) {
                // process single
                if (checkApi(def.project, def.name)) {
                    return;
                }
                let body = enableApi(def.project, def.name);
                return {ready: false, operation: body.name}
            }

            break;
        case "check-readiness":
            if (state.operation) {
                let res = gcp.get(BASE_URL + `/projects/${def.project}/${state.operation}`);
                if (res.error) {
                    throw new Error(res.error + ", body: " + res.body);
                }
                if (JSON.parse(res.body).status === "DONE") {
                    return {ready: true};
                }

                throw "operation is not done";
            }

            if (def.apis) {
                // process batch
                if (checkApis(def.project, def.apis).length === 0) {
                    return {ready: true};
                }
                throw "APIs aren't enabled yet"
            } else if (def.name) {
                // process single
                if (checkApi(def.project, def.name)) {
                    return {ready: true};
                }
                throw "API is not enabled yet"
            }
            break
    }
}
