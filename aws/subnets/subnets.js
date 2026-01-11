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


let createSubnets = function (def) {
    let state = {};
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "VpcId": def["vpc-id"],
        "CidrBlock": def["cidr"],
        "Version": "2016-11-15",
        "Action": "CreateSubnet",
        "TagSpecification.1.Tag.1.Key": "Name",
        "TagSpecification.1.Tag.1.Value": def["name"],
        "TagSpecification.1.ResourceType": "subnet"
    }

    if (def["az"]) {
        param["AvailabilityZone"] = def["az"];
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
    return {
        "subnetStatus": parser.xmlquery(res.body, "//CreateSubnetResponse/subnet/state")[0],
        "subnetId": parser.xmlquery(res.body, "//CreateSubnetResponse/subnet/subnetId")[0],
        "subnetName": def["name"]
    };
}

let deleteSubnets = function (def, state) {
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "SubnetId": state['subnetId'],
        "Version": "2016-11-15",
        "Action": "DeleteSubnet",
    }
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error(errorMessage);
    }
}

let getSubnets = function (def, state) {
    let data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    let publicSubnets = [];

    let param = {
        "Filter.1.Name": "vpc-id",
        "Filter.1.Value.1": def["vpc-id"],
        "SubnetId.1": state['subnetId'],
        "Version": "2016-11-15",
        "Action": "DescribeSubnets",
    }

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    let item = parser.xmlquery(res.body, "//DescribeSubnetsResponse/subnetSet/item");
    let subnetId = parser.xmlquery(item, "//subnetId")[i]

    if (res.error) {
        let errorMessage = parser.xmlquery(res.body, "//Response/Errors/Error/Message");
        throw new Error(errorMessage);
    }

    return {
        "subnetStatus": parser.xmlquery(item, "//state")[i],
        "subnetId": subnetId,
    };
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            state = createSubnets(def)
            break;
        case "purge":
            state = deleteSubnets(def, state);
            break;
        case "get":
            state = getSubnets(def, state);
            break;
        default:
            // no action defined
            return;
    }

    return state;
}