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

    if (def["subnets"]) {
        let publicSubnets = [];
        for (const [key, value] of Object.entries(def["subnets"])) {
            let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + createSubnetRequest(def['vpc-id'], value).toString(), {
                "headers": data.headers,
                "service": data.service,
                "region": data.region
            });
            if (res.error) {
                errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
                cli.output(errorMessage);
            }
            publicSubnets.push({
                "subnetStatus": parser.xmlquery(res.body, "//CreateSubnetResponse/subnet/state")[0],
                "subnetId": parser.xmlquery(res.body, "//CreateSubnetResponse/subnet/subnetId")[0],
                "subnetName": value["name"]
            });
        }
        state["subnets"] = publicSubnets;
    }

    return state
}

let deleteSubnets = function (def, state) {
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };

    if (def["subnets"]) {
        let vpcId = def["vpc-id"];
        state["subnets"].forEach(item => {
            let param = {
                "SubnetId": item['subnetId'],
                "Version": "2016-11-15",
                "Action": "DeleteSubnet",
            }
            let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
                "headers": data.headers,
                "service": data.service,
                "region": data.region
            });

            if (res.error) {
                errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
                cli.output(errorMessage);
            }
        });
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
        "Version": "2016-11-15",
        "Action": "DescribeSubnets",
    }

    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?" + encodeQueryData(param).toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    let hasItem = true;
    let i = 0;
    while (hasItem) {
        try {
            let item = parser.xmlquery(res.body, "//DescribeSubnetsResponse/subnetSet/item");
            let subnetId = parser.xmlquery(item, "//subnetId")[i]
            if (!subnetId) {
                hasItem = false;
            } else {
                publicSubnets.push({
                    "subnetStatus": parser.xmlquery(item, "//state")[i],
                    "subnetId": parser.xmlquery(item, "//subnetId")[i],
                });
            }
        } catch (error) {
            hasItem = false;
        }
        i++;
    }
    state['subnets'] = publicSubnets;
    return state
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