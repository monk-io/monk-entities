let cli = require("cli")
let parser = require("parser")
let BASE_URL = "https://iam.amazonaws.com/"

let createPolicy = function (def) {
    let doc = JSON.stringify({
        "Version": "2012-10-17",
        "Statement": def.statement
    });
    let res = aws.post(BASE_URL + `?Action=CreatePolicy&Version=2010-05-08&PolicyName=${def.name}&PolicyDocument=${doc}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    arn = parser.xmlquery(res.body, "//Arn");
    if (arn.length == 0) {
        throw new Error("No Arn found in response body");
    }

    return arn[0];
}

let deletePolicy = function (arn) {
    let res = aws.get(BASE_URL + `?Action=ListEntitiesForPolicy&Version=2010-05-08&PolicyArn=${arn}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    userNames = parser.xmlquery(res.body, "//UserName");
    groupNames = parser.xmlquery(res.body, "//GroupName");

    userNames.forEach(function (name) {
        res = aws.post(BASE_URL + `?Action=DetachUserPolicy&Version=2010-05-08&UserName=${name}&PolicyArn=${arn}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    });

    groupNames.forEach(function (name) {
        res = aws.post(BASE_URL + `?Action=DetachGroupPolicy&Version=2010-05-08&GroupName=${name}&PolicyArn=${arn}`);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    });

    res = aws.post(BASE_URL + `?Action=DeletePolicy&Version=2010-05-08&PolicyArn=${arn}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            let arn = createPolicy(def);
            return {"name": def.name, "arn": arn};
        case "purge":
            deletePolicy(state.arn);
            break
    }
}
