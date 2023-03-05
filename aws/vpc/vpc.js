let aws = require("cloud/aws");
let cli = require("cli");
let http = require("http");

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

    return res
}


let getVPC = function (def) {
    cli.output("createVPC");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        }, 
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "Filter.1.Name": "cidr",
        "Filter.1.Value": def["cidr"],
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://ec2." + def["region"] + ".amazonaws.com/?Action=DescribeVpcs&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://ec2." + def["region"] + ".amazonaws.com/?Action=DescribeVpcs&" + searchParams.toString(), {
            "headers": data.headers,
            "service": data.service,
            "region": data.region  
        });

    return res
    
}
 

let deleteVPC = function (def) {
    cli.output("createVPC");
    let VpcId = getVPC(def);
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        }, 
        "service": "ec2",
        "region": def["region"]
    };

    let param = {
        "VpcId": VpcId,
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

    return res
    
}


function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            createVPC(def)
            break;
        case "purge":
            res = deleteRDS(def);
            break;
        case "create-snapshot":
            res = createSnapshot(def);
            break;

        case "get":
            res = getRDS(def);
            break;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return res.body;
}