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

let createRDS = function (def) {
    cli.output("createRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "rds",
        "region": def["region"]
    };
    let password = "";
    try {
        password = secret.get(def["password-secret"]);
    } catch (error) {
        // generate password and save to secret if it doesn't exist
        secret.set(def["password-secret"], secret.randString(16));
        password = secret.get(def["password-secret"]);
    }

    let param = {
        "DBInstanceIdentifier": def["identifier"],
        "DBInstanceClass": def["instance"],
        "Engine": def["engine"],
        "MasterUsername": def["username"],
        "MasterUserPassword": password,
        "AllocatedStorage": def["storage"],
        "Version": "2014-09-01",
        "SignatureVersion": def["signature-version"],
        "SignatureMethod": def["signature-method"]

    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBInstance&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBInstance&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });


    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }
    let state = {
        "status": parser.xmlquery(res.body, "//CreateDBInstanceResponse/CreateDBInstanceResult/DBInstance/DBInstanceStatus")[0],
        "arn": parser.xmlquery(res.body, "//CreateDBInstanceResponse/CreateDBInstanceResult/DBInstance/DBInstanceArn"),
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
        "DBInstanceIdentifier": def["identifier"],
        "DBSnapshotIdentifier": def["identifier"] + "-" + getDateString(),
        "Version": "2014-09-01",
        "SignatureVersion": def["signature-version"],
        "SignatureMethod": def["signature-method"]
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBSnapshot&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBSnapshot&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    return res
}

let deleteRDS = function (def) {
    cli.output("createRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "rds",
        "region": def["region"]
    };

    let param = {
        "DBInstanceIdentifier": def["identifier"],
        "Version": "2014-09-01",
        "SkipFinalSnapshot": def["skip-final-snapshot"]
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=DeleteDBInstance&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=DeleteDBInstance&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    try {
        secret.remove(def["password-secret"]);
    } catch (error) {
        cli.output("Secret not found");
    }

    return {
        "status": "deleted"
    }

}

let getRDS = function (def) {
    cli.output("getRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "rds",
        "region": def["region"]
    };

    let param = {
        "DBInstanceIdentifier": def["identifier"],
        "Version": "2014-09-01"
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://rds." + def["region"] + ".amazonaws.com/?Action=DescribeDBInstances&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=DescribeDBInstances&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        errorMessage = parser.xmlquery(res.body, "//ErrorResponse/Error/Message");
        throw new Error(res.error + ", " + errorMessage);
    }
    let state = {
        "status": parser.xmlquery(res.body, "//DescribeDBInstancesResponse/DescribeDBInstancesResult/DBInstances/DBInstance/DBInstanceStatus")[0],
        "endpoint": parser.xmlquery(res.body, "//DescribeDBInstancesResponse/DescribeDBInstancesResult/DBInstances/DBInstance/Endpoint/Address")[0],
        "port": parser.xmlquery(res.body, "//DescribeDBInstancesResponse/DescribeDBInstancesResult/DBInstances/DBInstance/Endpoint/Port")[0],
        "password-secret": def["password-secret"]
    }
    return state

}

let showPassword = function (def) {
    cli.output("showPassword");
    let password = "";
    try {
        password = secret.get(def["password-secret"]);
    } catch (error) {
        // generate password and save to secret if it doesn't exist
        throw new Error("Password secret not found");
    }
    cli.output("Password: " + password);
    return password;
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            state = createRDS(def)
            break;
        case "purge":
            state = deleteRDS(def);
            break;
        case "create-snapshot":
            res = createSnapshot(def);
            break;
        case "get":
            state = getRDS(def);
            break;
        case "show-password":
            res = showPassword(def);
            break;
        case "check-readiness": {
            state = getRDS(def);
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
