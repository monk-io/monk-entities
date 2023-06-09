let aws = require("cloud/aws")
let cli = require("cli")
let parser = require("parser")
let BASE_URL = "https://iam.amazonaws.com/"

let createGroup = function (def) {
    const name = def.name;

    let res = aws.post(BASE_URL + `?Action=CreateGroup&Version=2010-05-08&GroupName=${def.name}&Path=${def.path}`);
    if (res.error && !res.error.includes("409")) {
        throw new Error(res.error + ", body " + res.body);
    }

    if (def.policyArn) {
        res = aws.get(BASE_URL + `?Action=ListAttachedGroupPolicies&Version=2010-05-08&GroupName=${name}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }

        let ex = parser.xmlquery(res.body, "//AttachedPolicies/member/PolicyArn");
        if (ex.includes(def.policyArn)) {
            return;
        }

        res = aws.post(BASE_URL + `?Action=AttachGroupPolicy&Version=2010-05-08&GroupName=${name}&PolicyArn=${def.policyArn}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }
}

let deleteGroup = function (name) {
    let res = aws.get(BASE_URL + `?Action=ListAttachedGroupPolicies&Version=2010-05-08&GroupName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    arns = parser.xmlquery(res.body, "//PolicyArn");

    arns.forEach(function (arn) {
        res = aws.post(BASE_URL + `?Action=DetachGroupPolicy&Version=2010-05-08&GroupName=${name}&PolicyArn=${arn}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    });

    res = aws.post(BASE_URL + `?Action=DeleteGroup&Version=2010-05-08&GroupName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            createGroup(def);
            return {"name": def.name, "path": def.path, "policyArn": def.policyArn};
        case "purge":
            deleteGroup(def.name);
            break
    }
}
