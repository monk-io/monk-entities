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

let createEFS = function (def) {
    cli.output("createRDS");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        }, 
        "service": "elasticfilesystem",
        "region": def["region"]
    };

    let param = {
        "CreationToken": def["token"],
        "PerformanceMode": def["performance_mode"],
        "Encrypted": def["encrypted"],
        "SizeInBytes": {
            "Value": def["size"],
        }
    }

    if (def["backup"]) {
        param["backup"] = def["backup"];
    }

    cli.output("https://elasticfilesystem." + def["region"] + ".amazonaws.com/2015-02-01/file-systems" );
    // Create aws rds instance
    let res = aws.post("https://elasticfilesystem." + def["region"] + ".amazonaws.com/2015-02-01/file-systems", {
            "headers": data.headers,
            "service": data.service,
            "region": data.region, 
            "body": JSON.stringify(param)
        });

    if (res.error)  {
        throw new Error(res.error + ", body " + res.body);
    }
    return res.body
}


let deleteEFS = function (def) {
    let efs = getEFS(def);
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        }, 
        "service": "elasticfilesystem",
        "region": def["region"]
    };
    cli.output(efs.FileSystemId);
    let res = aws.delete("https://elasticfilesystem." + def["region"] + ".amazonaws.com/2015-02-01/file-systems/" + efs.FileSystemId, {
            "headers": data.headers,
            "service": data.service,
            "region": data.region  
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return res
}

let getEFS = function (def) {
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        }, 
        "service": "elasticfilesystem",
        "region": def["region"]
    };

    let param = {
        "CreationToken": def["identifier"],
        "Version": "2014-09-01"
    }
    // Create aws rds instance
    let res = aws.get("https://elasticfilesystem." + def["region"] + ".amazonaws.com/2015-02-01/file-systems?CreationToken=" + def["token"], {
            "headers": data.headers,
            "service": data.service,
            "region": data.region  
        });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return JSON.parse(res.body).FileSystems[0]
    
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            createEFS(def)
            break;
        case "purge":
            res = deleteEFS(def);
            state["status"] = "deleted";
            break;
        case "check-readiness": {
            res = getEFS(def);
            if (res.LifeCycleState !== "available") {
                throw new Error("function is not active yet" + res.LifeCycleState );
            }
            break;
        }
        case "update": {
            res = getEFS(def);
            state["status"] = res.LifeCycleState;
            state["fsId"] = res.FileSystemId;
            break;
        }
        case "get":
            res = getEFS(def);
            break;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return state;
}