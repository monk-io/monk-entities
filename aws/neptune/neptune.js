let aws = require("cloud/aws");
let cli = require("cli");
let http = require("http");
let secret = require("secret");
const parser = require("parser");

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

let createNeptune = function (def) {
    cli.output("createNeptune");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "rds",
        "region": def["region"]
    };

    let param = {
        "DBClusterIdentifier": def["identifier"],
        "DBInstanceClass": def["instance"],
        "Engine": "neptune",
        "Version": "2014-10-31",
        "SignatureVersion": def["signature-version"],
        "SignatureMethod": def["signature-method"]
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBCluster&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBCluster&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });


    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }
    let state = {
        "status": parser.xmlquery(res.body, "//CreateDBClusterResponse/CreateDBClusterResult/DBCluster/Status")[0],
        "enpoint": parser.xmlquery(res.body, "//CreateDBClusterResponse/CreateDBClusterResult/DBCluster/Endpoint")[0],
        "arn": parser.xmlquery(res.body, "//CreateDBClusterResponse/CreateDBClusterResult/DBCluster/DBClusterArn")[0],
        "port": parser.xmlquery(res.body, "//CreateDBClusterResponse/CreateDBClusterResult/DBCluster/Port")[0],
        "username": parser.xmlquery(res.body, "//CreateDBClusterResponse/CreateDBClusterResult/DBCluster/MasterUsername")[0],     
    }
    return state
}

let createSnapshot = function (def) {
    cli.output("createRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "rds",
        "region": def["region"]
    };

    let param = {
        "DBClusterIdentifier": def["identifier"],
        "DBClusterSnapshotIdentifier": def["identifier"] + "-" + getDateString(),
        "Version": "2014-10-31",
        "SignatureVersion": def["signature-version"],
        "SignatureMethod": def["signature-method"]
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBClusterSnapshot&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBClusterSnapshot&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }

    return res
}

let deleteNeptune = function (def) {
    cli.output("deleteNeptune");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "rds",
        "region": def["region"]
    };

    let param = {
        "DBClusterIdentifier": def["identifier"],
        "Version": "2014-10-31",
        "SkipFinalSnapshot": def["skip-final-snapshot"]
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=DeleteDBCluster&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=DeleteDBCluster&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    return {
        "status": "deleted"
    }

}

let getNeptune = function (def) {
    cli.output("getNeptune");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "rds",
        "region": def["region"]
    };

    let param = {
        "DBClusterIdentifier": def["identifier"],
        "Version": "2014-10-31"
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=DescribeDBClusters&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=DescribeDBClusters&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }
    let state = {
        "status": parser.xmlquery(res.body, "//DescribeDBClustersResponse/DescribeDBClustersResult/DBClusters/DBCluster/Status")[0],
        "endpoint": parser.xmlquery(res.body, "//DescribeDBClustersResponse/DescribeDBClustersResult/DBClusters/DBCluster/Endpoint")[0],
        "port": parser.xmlquery(res.body, "//DescribeDBClustersResponse/DescribeDBClustersResult/DBClusters/DBCluster/Port")[0],
    }
    return state

}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            state = createNeptune(def)
            break;
        case "purge":
            state = deleteNeptune(def);
            break;
        case "create-snapshot":
            res = createSnapshot(def);
            break;
        case "get":
            state = getNeptune(def);
            break;
        case "show-password":
            res = showPassword(def);
            break;
        case "check-readiness": {
            state = getNeptune(def);
            if (state.status !== "available") {
                throw new Error("RDS instance is not ready yet");
            }
            break;
        }
        default:
            // no action defined
            return;
    }

    return state;
}
