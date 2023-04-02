let aws = require("cloud/aws");
let cli = require("cli");
let http = require("http");
let secret = require("secret");
const parser = require("parser");
const { stat } = require("fs");

function encodeQueryData(data) {
    const ret = [];
    for (let d in data)
        ret.push(encodeURIComponent(d) + '=' + encodeURIComponent(data[d]));
    return ret.join('&');
}

let createSubnetRequest = function (vpcId, obj) {
    let param = {
        "VpcId": vpcId,
        "CidrBlock": obj["cidr"],
        "AvailabilityZone": obj["az"],
        "Version": "2016-11-15",
        "Action": "CreateSubnet",
        "TagSpecification.1.Tag.1.Key": "Name",
        "TagSpecification.1.Tag.1.Value": obj["name"],
        "TagSpecification.1.ResourceType": "subnet"
    }
    return encodeQueryData(param);
}


let createAttachInternetGateway = function (def, internetGatewayId, vpcId) {
    let param = {
        "InternetGatewayId": internetGatewayId,
        "VpcId": vpcId,
        "Version": "2016-11-15",
        "Action": "AttachInternetGateway"
    };

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error(errorMessage);
    }

    let status = parser.xmlquery(res.body, "//AttachInternetGatewayResponse/return");

   return {
        "attachment": status
   };
}

let getAttachInternetGateway = function (def, state) {
    let param = {
        "Version": "2016-11-15",
        "Action": "DescribeInternetGateways",
        "Filter.1.internet-gateway-id": state["internetGatewayId"],
        "Filter.1.vpc-id": def["vpc-id"]
    };

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error(errorMessage);
    }

    let attach = parser.xmlquery(res.body, "//DescribeInternetGatewaysResponse/internetGatewaySet/item")[1];
    let status = parser.xmlquery(attach, "//attachmentSet/item/state");
    return status;
}

let detachInternetGateway = function (def, state) {
    let param = {
        "Version": "2016-11-15",
        "Action": "DetachInternetGateway",
        "InternetGatewayId": state["internetGatewayId"],
        "VpcId": def["vpc-id"]
    };

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error(errorMessage);
    }

    let status = parser.xmlquery(res.body, "//DetachInternetGatewayResponse/return");
    return status;
}

let createGateway = function (def) {
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "Version": "2016-11-15",
        "Action": "CreateInternetGateway",
        "TagSpecification.1.Tag.1.Key": "Name",
        "TagSpecification.1.Tag.1.Value": def["name"],
        "TagSpecification.1.ResourceType": "internet-gateway"
    }

    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString());
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });
    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error(errorMessage);
    }
    let internetGatewayId = parser.xmlquery(res.body, "//CreateInternetGatewayResponse/internetGateway/internetGatewayId")[0]
    if (def["vpc-id"]) {
        let attach = createAttachInternetGateway(def, internetGatewayId, def["vpc-id"]); 
        return {
            "internetGatewayId": internetGatewayId,
            "gatewayName": def["name"],
            "status": "available"
        };
    } else {
        return {
            "status": "available",
            "internetGatewayId": internetGatewayId,
            "gatewayName": def["name"]
        };
    }

}

let deleteGateway = function (def, state) {
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    if (def["vpc-id"]) {
        let status = detachInternetGateway(def, state);
        if (!status) {
            throw new Error("Internet Gateway is not available");
        }
    }

    let param = {
        "Version": "2016-11-15",
        "Action": "DeleteInternetGateway",
        "InternetGatewayId": state["internetGatewayId"],
    }

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });
    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString());
    }
}


let getGateway = function (def, state) {
    let data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let publicSubnets = [];

    let param = {
        "InternetGatewayId.1": state['internetGatewayId'],
        "Version": "2016-11-15",
        "Action": "DescribeInternetGateways",
    }

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString());
    }

    let item = parser.xmlquery(res.body, "//DescribeInternetGatewaysResponse/internetGatewaySet/item");
    let internetGatewayId = parser.xmlquery(item, "//internetGatewayId")[0]

    return {
        "subnetStatus": "available",
        "internetGatewayId": internetGatewayId,
    };
}

let checkReadiness = function (def, state) {
    let internetGateway = getGateway(def, state);
    if (def['vpc-id']) {
        let attach = getAttachInternetGateway(def, state);
        if (attach == "available") {
            return {
                "status": "available",
                "internetGatewayId": internetGateway["internetGatewayId"],
                "gatewayName": def["name"]
            };
        } else {
            return {
                "status": "pending",
                "internetGatewayId": internetGateway["internetGatewayId"],
                "gatewayName": def["name"]
            };
        }
    }
    return {
        "status": "available",
        "internetGatewayId": internetGateway["internetGatewayId"],
        "gatewayName": def["name"]
    };
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            state = createGateway(def)
            break;
        case "purge":
            state = deleteGateway(def, state);
            state = {}
            break;
        case "get":
            state = getGateway(def, state);
            break;
        case "check-readiness":
            state = checkReadiness(def, state);
            break;
        default:
            // no action defined
            return;
    }

    return state;
}