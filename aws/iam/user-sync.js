let aws = require("cloud/aws")
let cli = require("cli")
let parser = require("parser")
let BASE_URL = "https://iam.amazonaws.com/"

let createUser = function (def) {
    let res = aws.post(BASE_URL + `?Action=CreateUser&Version=2010-05-08&UserName=${def.name}&Path=${def.path}`);
    if (res.error && !res.error.includes("409")) {
        throw new Error(res.error + ", body " + res.body);
    }

    if (def.group) {
        res = aws.post(BASE_URL + `?Action=AddUserToGroup&Version=2010-05-08&UserName=${def.name}&GroupName=${def.group}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }

    if (def.policyArn) {
        res = aws.get(BASE_URL + `?Action=ListAttachedUserPolicies&Version=2010-05-08&UserName=${def.name}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }

        let ex = parser.xmlquery(res.body, "//AttachedPolicies/member/PolicyArn");
        if (!ex.includes(def.policyArn)) {
            res = aws.post(BASE_URL + `?Action=AttachUserPolicy&Version=2010-05-08&UserName=${def.name}&PolicyArn=${def.policyArn}`);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
        }
    }
}

let deleteUser = function (def) {
    const name = def.name;

    let res = aws.get(BASE_URL + `?Action=ListAttachedUserPolicies&Version=2010-05-08&UserName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    arns = parser.xmlquery(res.body, "//PolicyArn");

    arns.forEach(function (arn) {
        res = aws.post(BASE_URL + `?Action=DetachUserPolicy&Version=2010-05-08&UserName=${name}&PolicyArn=${arn}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    });

    res = aws.get(BASE_URL + `?Action=ListAccessKeys&Version=2010-05-08&UserName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    keys = parser.xmlquery(res.body, "//AccessKeyId");
    keys.forEach(function (keyId) {
        res = aws.post(BASE_URL + `?Action=DeleteAccessKey&Version=2010-05-08&UserName=${name}&AccessKeyId=${keyId}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    });

    if (def.group) {
        res = aws.post(BASE_URL + `?Action=RemoveUserFromGroup&Version=2010-05-08&UserName=${name}&GroupName=${def.group}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }

    res = aws.post(BASE_URL + `?Action=DeleteUser&Version=2010-05-08&UserName=${name}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            createUser(def);
            return {"name": def.name};
        case "purge":
            deleteUser(def);
            break
    }
}
