let aws = require("cloud/aws");
let cli = require("cli");
let http = require("http");
let secret = require("secret");
const parser = require("parser");
const { stat } = require("fs");

function getDateString() {
    let date = new Date();
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let year = date.getFullYear();
    let hour = date.getHours();
    let minute = date.getMinutes();
    let second = date.getSeconds();
    return year + "" + month + "" + day + "-" + hour + "" + minute + "" + second;
}
function encodeQueryData(data) {
    const ret = [];
    for (let d in data)
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
}


let createVPC = function (def) {
    cli.output("createVPC");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "CidrBlock": def["cidr"],
        "Version": "2016-11-15"
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?Action=CreateVpc&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?Action=CreateVpc&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }

    let state = {
        "vpcStatus": parser.xmlquery(res.body, "//CreateVpcResponse/vpc/state")[0],
        "vpcId": parser.xmlquery(res.body, "//CreateVpcResponse/vpc/vpcId")[0],
    }
    return state
}



let deleteVPC = function (def, state) {
    cli.output("deleteVPC");

    cli.output(JSON.stringify(state));
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "VpcId": state["vpcId"],
        "Version": "2016-11-15"
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?Action=DeleteVpc&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?Action=DeleteVpc&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }

    return {
        "status": "deleted"
    }

}

let getVPC = function (def, state) {
    cli.output("getVPC");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "VpcId.1": state["vpcId"],
        "Version": "2016-11-15"
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?Action=DescribeVpcs&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?Action=DescribeVpcs&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }
    let lastState = {
        "vpcStatus": parser.xmlquery(res.body, "//DescribeVpcsResponse/vpcSet/item/state")[0],
        "vpcId": parser.xmlquery(res.body, "//DescribeVpcsResponse/vpcSet/item/vpcId")[0],
    }
    return lastState;

}

let modifyVPCRequest = function (def, state, key, value) {
    cli.output("getVPC");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "VpcId": state["vpcId"],
        "Version": "2016-11-15",
        [key]: value
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?Action=ModifyVpcAttribute&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?Action=ModifyVpcAttribute&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        return false;
    }
    return true;

}

let modifyVPC = function (def, state) {
    if (def['dns-resolution']) {
        state["dnsResolution"] = modifyVPCRequest(def, state,  "EnableDnsSupport.Value", def['dns-resolution']);
    }

    if (def['dns-hostnames']) {
        state["dnsHostnames"] = modifyVPCRequest(def, state, "EnableDnsHostnames.Value", def['dns-hostnames']);
    }
    return state;
}

let checkReadiness = function (def, state) {
    cli.output("checkReadiness");
    state = getVPC(def, state);
    if (state.vpcStatus !== "available") {
        throw new Error("VPC is not ready yet. Current status: " + state.vpcStatus);
    }
    return modifyVPC(def, state);
}


function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            state = createVPC(def)
            break;
        case "purge":
            state = deleteVPC(def, state);
            break;
        case "get":
            state = getVPC(def, state);
            break;
        case "modify": {
            state = modifyVPC(def, state)
            break;
        }
        case "check-readiness": {
            state = checkReadiness(def, state)
            break;
        }
        default:
            // no action defined
            return;
    }

    return state;
}
