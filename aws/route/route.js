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

let createRoute = function (def) {
    cli.output("createTable");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "RouteTableId": def["route-table-id"],
        "Action": "CreateRoute",
        "Version": "2016-11-15"
    }
    
    if(def["carrier-gateway-id"]){
        param["CarrierGatewayId"] = def["carrier-gateway-id"];
    }

    if(def["destination-cidr-block"]){
        param["DestinationCidrBlock"] = def["destination-cidr-block"];
    }
    if(def["destination-ipv6-cidr-block"]){
        param["DestinationIpv6CidrBlock"] = def["destination-ipv6-cidr-block"];
    }
    if(def["egress-only-internet-gateway-id"]){
        param["EgressOnlyInternetGatewayId"] = def["egress-only-internet-gateway-id"];
    }
    if(def["gateway-id"]){
        param["GatewayId"] = def["gateway-id"];
    }
    if(def["instance-id"]){
        param["InstanceId"] = def["instance-id"];
    }
    if(def["local-gateway-id"]){
        param["LocalGatewayId"] = def["local-gateway-id"];
    }
    if(def["nat-gateway-id"]){
        param["NatGatewayId"] = def["nat-gateway-id"];
    }
    if(def["network-interface-id"]){
        param["NetworkInterfaceId"] = def["network-interface-id"];
    }
    if(def["transit-gateway-id"]){
        param["TransitGatewayId"] = def["transit-gateway-id"];
    }
    if(def["vpc-peering-connection-id"]){
        param["VpcPeeringConnectionId"] = def["vpc-peering-connection-id"];
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

    return state
}


let deleteRoute = function (def, state) {
    cli.output("deleteTable");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "ec2",
        "region": def["region"]
    };
    let param = {
        "RouteTableId": def["route-table-id"],
        "Action": "DeleteRoute",
        "DestinationCidrBlock": def["destination-cidr-block"],
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
            state = createRoute(def)
            break;
        case "purge":
            state = deleteRoute(def, state);
            break;
        default:
            // no action defined
            return;
    }

    return state;
}