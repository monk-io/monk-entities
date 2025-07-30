let cli = require("cli")
let parser = require("parser")
let BASE_URL = "https://iam.amazonaws.com/"

let createRole = function (def) {
    const name = def.name;

    cli.output(def.assumeRolePolicyDocument);
    
    let url = BASE_URL + `?Action=CreateRole&Version=2010-05-08&RoleName=${name}&Path=${def.path}`;
    if (def.assumeRolePolicyDocument) {
        url += `&AssumeRolePolicyDocument=${def.assumeRolePolicyDocument}`;
    }
    cli.output(url);

    // Create the role
    let res = aws.post(url);
    if (res.error && !res.error.includes("409")) {
        throw new Error(res.error + ", body " + res.body);
    }

    // Get the role ARN from response if role was just created
    let arn;
    if (!res.error) {
        arn = parser.xmlquery(res.body, "//Arn");
        if (arn.length > 0) {
            arn = arn[0];
        }
    } else {
        // Role already exists, get its ARN
        res = aws.get(BASE_URL + `?Action=GetRole&Version=2010-05-08&RoleName=${name}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
        arn = parser.xmlquery(res.body, "//Arn");
        if (arn.length > 0) {
            arn = arn[0];
        }
    }

    // Attach managed policy if specified
    if (def.policyArn) {
        res = aws.get(BASE_URL + `?Action=ListAttachedRolePolicies&Version=2010-05-08&RoleName=${name}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }

        let existingPolicies = parser.xmlquery(res.body, "//AttachedPolicies/member/PolicyArn");
        if (!existingPolicies.includes(def.policyArn)) {
            res = aws.post(BASE_URL + `?Action=AttachRolePolicy&Version=2010-05-08&RoleName=${name}&PolicyArn=${def.policyArn}`);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
        }
    }

    return arn;
}

let deleteRole = function (def) {
    const name = def.name;

    // First detach all attached managed policies
    let res = aws.get(BASE_URL + `?Action=ListAttachedRolePolicies&Version=2010-05-08&RoleName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    let attachedPolicies = parser.xmlquery(res.body, "//PolicyArn");
    attachedPolicies.forEach(function (policyArn) {
        res = aws.post(BASE_URL + `?Action=DetachRolePolicy&Version=2010-05-08&RoleName=${name}&PolicyArn=${policyArn}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    });

    // Delete inline policies if any
    res = aws.get(BASE_URL + `?Action=ListRolePolicies&Version=2010-05-08&RoleName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    let inlinePolicies = parser.xmlquery(res.body, "//PolicyNames/member");
    inlinePolicies.forEach(function (policyName) {
        res = aws.post(BASE_URL + `?Action=DeleteRolePolicy&Version=2010-05-08&RoleName=${name}&PolicyName=${policyName}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    });

    // Finally delete the role
    res = aws.post(BASE_URL + `?Action=DeleteRole&Version=2010-05-08&RoleName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            let arn = createRole(def);
            return {"name": def.name, "arn": arn};
        case "purge":
            deleteRole(def);
            break
    }
} 