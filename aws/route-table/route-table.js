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

let createTable = function (def) {
    cli.output("createTable");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "VpcId": def["vpc-id"],
        "Action": "CreateRouteTable",
        "Version": "2016-11-15"
    }

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }

    let state = {
        "routeTableId": parser.xmlquery(res.body, "//CreateRouteTableResponse/routeTable/routeTableId")[0],
    }
    return state
}


let deleteTable = function (def, state) {
    cli.output("deleteTable");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "RouteTableId": state["routeTableId"],
        "Action": "DeleteRouteTable",
        "Version": "2016-11-15"
    }

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString());
    }
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            state = createTable(def)
            break;
        case "purge":
            state = deleteTable(def, state);
            break;
        default:
            // no action defined
            return;
    }

    return state;
}