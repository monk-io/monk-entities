let secret = require("secret");
let BASE_URL = "https://iam.googleapis.com/v1";

function createServiceAccountKey(def, projectId) {
    let data = {
        "privateKeyType": def["key-type"],
        "keyAlgorithm": def["key-algorithm"]
    }

    const res = gcp.post(
        BASE_URL + `/projects/${projectId}/serviceAccounts/${def["service-account-id"]}/keys`,
        {
            "body": JSON.stringify(data),
        }
    );
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    const body = JSON.parse(res.body);

    // store the secret in the secret store
    secret.set(def.secret, btoa(body.privateKeyData));

    return body
}

function deleteServiceAccountKey(def, state, projectId) {
    const res = gcp.delete(BASE_URL + state.name);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    // remove the secret from the secret store
    secret.remove(def.secret);
}

function main(def, state, ctx) {
    const project = gcp.getProject();

    switch (ctx.action) {
        case "create":
            const res = createServiceAccountKey(def, project);
            return {"name": res.name};
        case "purge":
            deleteServiceAccountKey(def, state, project);
            break;
    }
}
