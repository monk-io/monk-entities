let aws = require("cloud/aws");
let cli = require("cli");
let http = require("http");
let secret = require("secret");

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

let createCluster = function (def) {
    cli.output("createCluster");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "redshift",
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
        "ClusterIdentifier": def["identifier"],
        "NodeType": def["instance"],
        "MasterUsername": def["username"],
        "MasterUserPassword": password,
        "NumberOfNodes": def["nodes"],
        "Version": "2012-12-01",
        "SignatureVersion": def["signature-version"],
        "SignatureMethod": def["signature-method"]

    }

    const searchParams = encodeQueryData(param);
    cli.output("https://redshift." + def["region"] + ".amazonaws.com/?Action=CreateCluster&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://redshift." + def["region"] + ".amazonaws.com/?Action=CreateCluster&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    return res
}

let createSnapshot = function (def) {
    cli.output("createRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "redshift",
        "region": def["region"]
    };

    let param = {
        "ClusterIdentifier": def["identifier"],
        "SnapshotIdentifier": def["identifier"] + "-" + getDateString(),
        "Version": "2012-12-01",
        "SignatureVersion": def["signature-version"],
        "SignatureMethod": def["signature-method"]
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://redshift." + def["region"] + ".amazonaws.com/?Action=CreateClusterSnapshot&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://rds." + def["region"] + ".amazonaws.com/?Action=CreateDBSnapshot&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    return res
}

let deleteCluster = function (def) {
    cli.output("createRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "redshift",
        "region": def["region"]
    };

    let param = {
        "ClusterIdentifier": def["identifier"],
        "Version": "2012-12-01",
        "SkipFinalClusterSnapshot": def["skip-final-snapshot"],
        "SignatureVersion": def["signature-version"],
        "SignatureMethod": def["signature-method"]
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://redshift." + def["region"] + ".amazonaws.com/?Action=DeleteCluster&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.post("https://redshift." + def["region"] + ".amazonaws.com/?Action=DeleteCluster&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    try {
        secret.remove(def["password-secret"]);
    } catch (error) {
        cli.output("Password secret not found");
    }

    return res

}

let getCluster = function (def) {
    cli.output("getRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "redshift",
        "region": def["region"]
    };

    let param = {
        "ClusterIdentifier": def["identifier"],
        "Version": "2012-12-01"
    }

    const searchParams = encodeQueryData(param);
    cli.output("https://redshift." + def["region"] + ".amazonaws.com/?Action=DescribeClusters&" + searchParams.toString());
    // Create aws rds instance
    let res = aws.get("https://redshift." + def["region"] + ".amazonaws.com/?Action=DescribeClusters&" + searchParams.toString(), {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });

    return res

}

let showPassword = function (def) {
    cli.output("showPassword");
    let password = "";
    try {
        password = secret.get(def["password-secret"]);
    } catch (error) {
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
            createCluster(def)
            break;
        case "purge":
            res = deleteCluster(def);
            break;
        case "create-snapshot":
            res = createSnapshot(def);
            break;
        case "get":
            res = getCluster(def);
            break;
        case "show-password":
            res = showPassword(def);
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