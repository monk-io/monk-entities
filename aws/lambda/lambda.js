let aws = require("cloud/aws");
let cli = require("cli");
let fs = require("fs");
let http = require("http");


let createFunc = function (def) {
    let code;
    if (def['s3bucket'] !== 'undefined') {
        code = {
            "S3Bucket": def['s3bucket'],
            "S3Key": def['s3key']
        };
    } else {
        let zip = uploadFuncFiles();
        code = {
            "ZipFile": zip
        };
    }
    
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "lambda",
        "region": def["region"],
        "body": {
            "Architecture": def["architecture"],
            "FunctionName": def["name"],
            "Runtime": def["runtime"],
            "Handler": def["handler"],
            "Code": code,
            "Role": 'arn:aws:iam::042018946306:role/service-role/demo-role-m48zma6q',
            "Description": "Lambda function created by the Monk",
            "Timeout": 3,
            "MemorySize": 128,
            "Publish": true
        }
    }
    return aws.post("https://lambda." + def["region"] + ".amazonaws.com/2015-03-31/functions/", {
        "headers": data.headers,
        "service": data.service,
        "region": data.region,
        "action": data.action,
        "Version": data.Version,
        "Role": data.Role,
        "body": JSON.stringify(data.body)
    });
};

let patchFunc = function (def) {
    
    cli.output("patchFunc");
    data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "lambda",
        "region": def["region"],
        "body": {
            "Architecture": def["architecture"],
            "Handler": def["handler"],
            "Role": 'arn:aws:iam::042018946306:role/service-role/demo-role-m48zma6q',
            "Description": "Lambda function created by the Monk",
            "Timeout": 3,
            "MemorySize": 128,
            "Publish": true
        }
    }

    let code;
    if (def['s3bucket'] !== 'undefined') {
        code = {
            "S3Bucket": def['s3bucket'],
            "S3Key": def['s3key']
        };
        data.body["S3Bucket"] = def['s3bucket'];
        data.body["S3Key"] = def['s3key'];
    } else {
        let zip = uploadFuncFiles();
        data.body["ZipFile"] = zip;
    }

    return aws.put("https://lambda." + def["region"] + ".amazonaws.com/2015-03-31/functions/"+ def['name'] + "/code", {
        "headers": data.headers,
        "service": data.service,
        "region": data.region,
        "action": data.action,
        "Version": data.Version,
        "Role": data.Role,
        "body": JSON.stringify(data.body)
    });
};

let getFunc = function (def) {
    return gcp.get(BASE_URL + "/projects/" + def["project"] +
        "/locations/" + def["location"] + "/functions/" + def["name"]);
};

let deleteFunc = function (def) {
    let data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "lambda",
        "region": def["region"]
    };
    cli.output(JSON.stringify(data));
    res = aws.delete("https://lambda." + def["region"] + ".amazonaws.com/2015-03-31/functions/" + def["name"], {
        "headers": data.headers,
        "service": data.service,
        "region": data.region
    });
    return res;
};


let createRole = function (def) {
    let roleName = def["name"] + "-lambda-role";
    cli.output("createRole");
    let data = {
        "headers": {
            "Content-Type": "application/x-amz-json-1.0"
        },
        "service": "iam",
        "region": def["region"]
    };
    let role = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": "logs:CreateLogGroup",
                "Resource": "arn:aws:logs:eu-north-1:042018946306:*"
            },
            {
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                ],
                "Resource": [
                    "arn:aws:logs:eu-north-1:042018946306:log-group:/aws/lambda/*"
                ]
            }
        ]
    }
    encodedRole = encodeURIComponent(role);
    let res = aws.get("https://iam.amazonaws.com/?Action=CreateRole&RoleName=" + roleName + "&AssumeRolePolicyDocument=" + role + "&Version=2010-05-08",{
        "headers": data.headers,
        "service": data.service    
    });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return res;
};

let uploadFuncFiles = function () {
    // zip files that we need to upload
    let zippedBody = fs.zip(...fs.ls());
    return "UEsDBBQACAAIAMMLWlYAAAAAAAAAAMIAAAAIACAAaW5kZXguanNVVA0AB+6L+mOij/pjoI/6Y3V4CwABBPUBAAAEFAAAAD2NTwuCQBDF736K6aRCpHRU7FKHiGgP9QVWd0xh/8jsGEn03dsUfJd5vPd+DL4HRwyNs56hk1ZpJKhA+sk2Cb7QcgrVAT4RBGUZPMRJQG8GjSZ0c7qwhH4IBgO8jP/yLHn0R6ewgH2eb9eidmoq4HIXt51n6u2zb6ckPqPWDlpyBq7S1Epu4nRhvuV8CHkku/4qo5D/AFBLBwg+fa0jlgAAAMIAAABQSwMEFAAIAAgAwwtaVgAAAAAAAAAAowAAABMAIABfX01BQ09TWC8uX2luZGV4LmpzVVQNAAfui/pjoo/6Y+Wo+mN1eAsAAQT1AQAABBQAAABjYBVjZ2BiYPBNTFbwD1aIUIACkBgDJxAbAXEhEIP4ixmIAo4hIUFQJkjHDCDmRlPCiBAXTc7P1UssKMhJ1Ssoyi9LzUvMS04FKbhfdHiu2mf5NwBQSwcIw5OF7lQAAACjAAAAUEsBAhQDFAAIAAgAwwtaVj59rSOWAAAAwgAAAAgAIAAAAAAAAAAAAKSBAAAAAGluZGV4LmpzVVQNAAfui/pjoo/6Y6CP+mN1eAsAAQT1AQAABBQAAABQSwECFAMUAAgACADDC1pWw5OF7lQAAACjAAAAEwAgAAAAAAAAAAAApIHsAAAAX19NQUNPU1gvLl9pbmRleC5qc1VUDQAH7ov6Y6KP+mPlqPpjdXgLAAEE9QEAAAQUAAAAUEsFBgAAAAACAAIAtwAAAKEBAAAAAA==";
};

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create":
            // role = createRole(def);
            
            res = createFunc(def);
            break;
        case "purge":
            res = deleteFunc(def);
            break;
        case "update":
            res = patchFunc(def);
            break;
        default:
            // no action defined
            return;
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    return ctx.action;
}
