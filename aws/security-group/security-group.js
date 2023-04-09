let aws = require("cloud/aws");
let cli = require("cli");
let http = require("http");
let secret = require("secret");
const parser = require("parser");

function encodeQueryData(data) {
    const ret = [];
    for (let d in data)
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
}

let createSG = function (def) {
    cli.output("createSG");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "Action": "CreateSecurityGroup",
        "Version": "2016-11-15",
        "GroupName": def["name"],
        "GroupDescription": def["group-description"],
        "VpcId": def["vpc-id"]
    }
    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString())
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });


    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message")[0];
        throw new Error(errorMessage);
    }
    
    return {
        "securityGroupId": parser.xmlquery(res.body, "//CreateSecurityGroupResponse/groupId")[0],
    }
}


let getSG = function (def) {
    cli.output("getSG");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "GroupName.1": def["name"],
        "Action": "DescribeSecurityGroups",
        "Version": "2016-11-15"
    }

    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString())
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message")[0];
        throw new Error(errorMessage);
    }
    return {
        "securityGroupId": parser.xmlquery(res.body, "//DescribeSecurityGroupsResponse/securityGroupInfo/item/groupId")[0],
    }
}

let deleteSG = function (def, state) {
    cli.output("deleteSG");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "GroupId": state["securityGroupId"],
        "Action": "DeleteSecurityGroup",
        "Version": "2016-11-15"
    }

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message")[0];
        throw new Error(errorMessage);
    }
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            state = createSG(def)
            break;
        case "get":
            state = getSG(def);
            break;
        case "purge":
            state = deleteSG(def, state);
            break;
        default:
            // no action defined
            return;
    }

    return state;
}