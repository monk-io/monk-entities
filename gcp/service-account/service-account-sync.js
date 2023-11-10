let cli = require("cli")
let BASE_URL = "https://iam.googleapis.com/v1"

function createServiceAccount(def, projectId) {
    let data = {
        "accountId": def.name,
        "serviceAccount": {
            "displayName": def.name
        }
    }

    let res = gcp.post(
        BASE_URL + `/projects/${projectId}/serviceAccounts`,
        {
            "body": JSON.stringify(data),
        }
    );
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    const body = JSON.parse(res.body);

    if (def.roles && def.roles.length > 0) {
        res = gcp.post(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
        data = JSON.parse(res.body);
        def.roles.forEach(role => {
            data.bindings.push({"role": role, "members": [`serviceAccount:${body.email}`]});
        })

        cli.output("Updating project IAM policy");
        res = gcp.post(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`, {
            "body": JSON.stringify({"policy": data}),
        });
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }

    return body
}

function deleteServiceAccount(def, state, projectId) {
    let res = gcp.delete(BASE_URL + `/projects/${projectId}/serviceAccounts/${state.uniqueId}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    if (def.roles && def.roles.length > 0) {
        res = gcp.post(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:getIamPolicy`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
        data = JSON.parse(res.body);

        const name = `serviceAccount:${state.email}`;

        for (let i = 0; i < data.bindings.length; i++) {
            const binding = data.bindings[i];
            binding.members = binding.members.filter(member => !member.includes(name));
            if (binding.members.length === 0) {
                data.bindings.splice(i, 1);
                i--;
            }
        }

        cli.output("Updating project IAM policy");
        res = gcp.post(`https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}:setIamPolicy`, {
            "body": JSON.stringify({"policy": data}),
        });
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }
}

function main(def, state, ctx) {
    const project = gcp.getProject();

    switch (ctx.action) {
        case "create":
            let res = createServiceAccount(def, project);
            return {"uniqueId": res.uniqueId, "email": res.email};
        case "purge":
            deleteServiceAccount(def, state, project);
            break;
    }
}
