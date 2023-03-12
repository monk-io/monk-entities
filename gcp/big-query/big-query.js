let gcp = require("cloud/gcp");
let cli = require("cli");
let http = require("http");

let createDataset = function (def) {
    cli.output("createBucket");
    let projectId = gcp.getProject();
    let data = {
        "datasetReference": {
            "datasetId": def["dataset"],
            "projectId": projectId,
        }
    };

    let res = gcp.post("https://bigquery.googleapis.com/bigquery/v2/projects/" + projectId + "/datasets", {
        "body": JSON.stringify(data),
        "headers": {
            "Content-Type": "application/json"
        }
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    cli.output(JSON.stringify(res.body));

    return JSON.parse(res.body)

}


let deleteDataset = function (def) {

    let tables = listTables(def);
    if (tables["totalItems"] && tables["totalItems"] > 0) {
        deleteTables(def);
    }
    let projectId = gcp.getProject();
    let res = gcp.delete("https://bigquery.googleapis.com/bigquery/v2/projects/"+projectId+"/datasets/"+def["dataset"]);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return res;
}

let getDataset = function (def) {
    let projectId = gcp.getProject();
    let res = gcp.get("https://bigquery.googleapis.com/bigquery/v2/projects/"+projectId+"/datasets/"+def["dataset"]);
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return JSON.parse(res.body)
}

let createTable = function (def) {
    cli.output("createTable");
    let tables = JSON.parse(def["tables"]);
    for (let i = 0; i < tables.length; i++) {
        let table = tables[i];
        cli.output("createTable" + i);
        let projectId = gcp.getProject();
        let data = {
            "tableReference": {
                "projectId": projectId,
                "datasetId": def["dataset"],
                "tableId": table["name"]
            },
            "schema": {
                "fields": table["fields"]
            }
        };
        let res = gcp.post("https://bigquery.googleapis.com/bigquery/v2/projects/" + projectId + "/datasets/" + def["dataset"] + "/tables", {
            "body": JSON.stringify(data),
            "headers": {
                "Content-Type": "application/json"
            }
        });

        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }
}

let deleteTables = function (def) {
    cli.output("deleteTables");
    let tables = JSON.parse(def["tables"]);
    for (let i = 0; i < tables.length; i++) {
        let table = tables[i];
        cli.output("deleteTable" + i);
        let projectId = gcp.getProject();
        let res = gcp.delete("https://bigquery.googleapis.com/bigquery/v2/projects/" + projectId + "/datasets/" + def["dataset"] + "/tables/" + table["name"]);
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }
    }
}

let listTables = function (def) {
    cli.output("listTables");
    let projectId = gcp.getProject();
    let res = gcp.get("https://bigquery.googleapis.com/bigquery/v2/projects/" + projectId + "/datasets/" + def["dataset"] + "/tables");
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    return JSON.parse(res.body);
}

function main(def, state, ctx) {
    cli.output(ctx.action);
    let res = {};
    switch (ctx.action) {
        case "recreate":
        case "create": {
            res = createDataset(def)
            state["datasetId"] = res["id"];
            break;
        }
        case "purge":
            res = deleteDataset(def);
            state["status"] = "deleted";
            break;
        case "get":
            res = getDataset(def);
            break;
        case "create-table": {
            res = createTable(def)
            break;
        }
        case "delete-table": {
            res = deleteTables(def);
            break;
        }
        default:
            // no action defined
            return;
    }

    return state;
}