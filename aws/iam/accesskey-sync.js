let parser = require("parser")
let secret = require("secret")
let cli = require("cli")
let BASE_URL = "https://iam.amazonaws.com/"

let createAccessKey = function (def) {
    let res = aws.post(BASE_URL + `?Action=CreateAccessKey&Version=2010-05-08&UserName=${def.user}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    accessKey = parser.xmlquery(res.body, "//AccessKeyId");
    if (accessKey.length == 0) {
        throw new Error("No AccessKeyId found in response body");
    }

    key = parser.xmlquery(res.body, "//SecretAccessKey");
    if (key.length == 0) {
        throw new Error("No SecretAccessKey found in response body");
    }

    // store the secret in the secret store
    secret.set(def.secret, key[0])

    return accessKey[0];
}

let deleteAccessKey = function (def, state) {
    if (state.accessKey == undefined) {
        throw new Error("No accessKey in state");
    }
    let res = aws.post(BASE_URL + `?Action=DeleteAccessKey&Version=2010-05-08&AccessKeyId=${state.accessKey}`);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    // remove the secret from the secret store
    secret.remove(def.secret);
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            let accessKey = createAccessKey(def);
            return {"user": def.user, "accessKey": accessKey};
        case "purge":
            deleteAccessKey(def, state);
            break
    }
}
