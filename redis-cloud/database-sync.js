const cli = require("cli");
const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.redislabs.com/v1";

const FIELD_MAPPING = {
    // Basic fields
    name: "name",
    protocol: "protocol",
    port: "port",
    dataset_size_in_gb: "datasetSizeInGb",
    support_oss_cluster_api: "supportOSSClusterApi",
    resp_version: "respVersion",
    use_external_endpoint_for_oss_cluster_api: "useExternalEndpointForOSSClusterApi",

    // Essentials specific
    enable_database_clustering: "enableDatabaseClustering",
    number_of_shards: "numberOfShards",
    periodic_backup_path: "periodicBackupPath",
    regex_rules: "regexRules",

    // General settings
    data_persistence: "dataPersistence",
    data_eviction_policy: "dataEvictionPolicy",
    replication: "replication",
    replica: {
        newKey: "replica",
        fields: {
            sync_sources: {
                newKey: "syncSources",
                items: {
                    endpoint: "endpoint",
                    encryption: "encryption",
                    server_cert: "serverCert"
                }
            }
        }
    },
    client_tls_certificates: {
        newKey: "clientTlsCertificates",
        items: {
            public_certificate_pem_string: "publicCertificatePEMString",
        }
    },
    enable_tls: "enableTls",
    source_ips: "sourceIps",
    alerts: {
        newKey: "alerts",
        items: {
            name: "name",
            value: "value",
        }
    },
    modules: {
        newKey: "modules",
        items: {
            name: "name",
            parameters: "parameters",
        }
    },

    // Pro specific fields
    throughput_measurement: {
        newKey: "throughputMeasurement",
        fields: {
            by: "by",
            value: "value"
        }
    },
    local_throughput_measurement: {
        newKey: "localThroughputMeasurement",
        items: {
            region: "region",
            write_operations_per_second: "writeOperationsPerSecond",
            read_operations_per_second: "readOperationsPerSecond",
        }
    },
    average_item_size_in_bytes: "averageItemSizeInBytes",
    remote_backup: {
        newKey: "remoteBackup",
        fields: {
            active: "active",
            interval: "interval",
            time_utc: "timeUTC",
            storage_type: "storageType",
            storage_path: "storagePath"
        }
    },
    sasl_username: "saslUsername",
    sharding_type: "shardingType",
    query_performance_factor: "queryPerformanceFactor",


    provider: "provider",
    region: "region",
};

function convertExclamationArrays(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key.includes("!")) {
            const [base, index] = key.split("!");
            const idx = parseInt(index, 10);
            if (!result[base]) result[base] = [];
            if (typeof value === "object" && value !== null) {
                result[base][idx] = convertExclamationArrays(value);
            } else {
                result[base][idx] = value;
            }
        } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            result[key] = convertExclamationArrays(value);
        } else {
            result[key] = value;
        }
    }
    return result;
}

function mapDatabaseDefinition(def) {
    const normalizedDef = convertExclamationArrays(def);
    function processValue(value, mapping) {
        if (Array.isArray(value)) {
            if (mapping.newKey && mapping.items) {
                return { [mapping.newKey]: value.map(item => processObject(item, mapping.items)) };
            }
            return value.map(item => {
                if (typeof item === 'object' && item !== null && mapping.items) {
                    return processObject(item, mapping.items);
                }
                return item;
            });
        }

        if (typeof value === 'object' && value !== null) {
            if (typeof mapping === 'string') {
                return { [mapping]: value };
            }
            if (mapping.newKey) {
                return { [mapping.newKey]: processObject(value, mapping.fields || {}) };
            }
            return processObject(value, mapping);
        }
        return value;
    }

    function processObject(obj, mapping) {
        const result = {};

        for (const [sourceKey, targetKey] of Object.entries(mapping)) {
            if (obj[sourceKey] !== undefined) {
                if (typeof targetKey === 'object') {
                    const nestedValue = obj[sourceKey];
                    const nestedResult = processValue(nestedValue, targetKey);
                    Object.assign(result, nestedResult);
                } else {
                    result[targetKey] = obj[sourceKey];
                }
            }
        }

        return result;
    }

    return processObject(normalizedDef, FIELD_MAPPING);
}

function syncDatabase(def, state, update) {
    const accountKey = secret.get(def.account_key_secret);
    const userKey = secret.get(def.user_key_secret);
    let subscriptionPrefix = ""
    if (def.subscription_type === "essentials") {
        subscriptionPrefix = "/fixed"
    }

    const body = mapDatabaseDefinition(def);

    try {
        body.password = secret.get(def["password_secret"]);
    } catch (error) {
        secret.set(def["password_secret"], secret.randString(32));
        body.password = secret.get(def["password_secret"]);
    }

    const req = {
        headers: {
            "accept": "application/json",
            "x-api-key": accountKey,
            "x-api-secret-key": userKey,
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    };
    let res;
    if (update) {
        res = http.put(BASE_URL + subscriptionPrefix + "/subscriptions/" + def.subscription_id + "/databases/" + state.id, req);
    } else {
        res = http.post(BASE_URL + subscriptionPrefix + "/subscriptions/" + def.subscription_id + "/databases", req);
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const resObj = JSON.parse(res.body);
    const resourceId = waitTask(resObj.taskId, accountKey, userKey);

    res = http.get(BASE_URL + subscriptionPrefix + "/subscriptions/" + def.subscription_id + "/databases/" + resourceId, {
        headers: {
            "accept": "application/json",
            "x-api-key": accountKey,
            "x-api-secret-key": userKey,
            "content-type": "application/json"
        },
    });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const dbObj = JSON.parse(res.body);

    return {
        ready: dbObj.status === "active",
        id: dbObj.databaseId,
        name: dbObj.name,
        publicEndpoint: dbObj.publicEndpoint,
        username: "default"
    };
}

function deleteDatabase(def, state) {
    const accountKey = secret.get(def.account_key_secret);
    const userKey = secret.get(def.user_key_secret);
    let subscriptionPrefix = ""
    if (def.subscription_type === "essentials") {
        subscriptionPrefix = "/fixed"
    }

    const res = http.delete(BASE_URL + subscriptionPrefix + "/subscriptions/" + def.subscription_id + "/databases/" + state.id,
        {
            headers: {
                "accept": "application/json",
                "x-api-key": accountKey,
                "x-api-secret-key": userKey,
                "content-type": "application/json"
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const resObj = JSON.parse(res.body);

    waitTask(resObj.taskId, accountKey, userKey);

    try {
        secret.remove(def["password_secret"]);
    } catch (error) {}
}


function waitTask(taskId, accountKey, userKey) {
    while (true) {
        let res = http.get(BASE_URL + "/tasks/" + taskId, {
            headers: {
                "accept": "application/json",
                "x-api-key": accountKey,
                "x-api-secret-key": userKey,
                "content-type": "application/json"
            },
        });
        if (res.error) {
            throw new Error(res.error + ", body " + res.body);
        }

        console.log(res.body);

        let task = JSON.parse(res.body);
        if (task.status === "processing-completed") {
            return task.response.resourceId;
        }
        if (task.status === "processing-error") {
            throw new Error("Error processing task: " + JSON.stringify(task.response.error));
        }
    }
}

function checkReadiness(def, state) {
    const accountKey = secret.get(def.account_key_secret);
    const userKey = secret.get(def.user_key_secret);
    let subscriptionPrefix = ""
    if (def.subscription_type === "essentials") {
        subscriptionPrefix = "/fixed"
    }

    const res = http.get(BASE_URL + subscriptionPrefix + "/subscriptions/" + def.subscription_id + "/databases/" + state.id,
        {
            headers: {
                "accept": "application/json",
                "x-api-key": accountKey,
                "x-api-secret-key": userKey,
                "content-type": "application/json"
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const resObj = JSON.parse(res.body);
    if (resObj.status === "active") {
        state.publicEndpoint = resObj.publicEndpoint
        state.ready = true;
        return state;
    }

    throw new Error("not ready");
}


function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            state = syncDatabase(def, state, false);
            break;
        case "update":
            if (state.id) {
                state = syncDatabase(def, state, true);
            } else {
                state = syncDatabase(def, state, false);
            }
            break;
        case "purge":
            if (state.id) {
                deleteDatabase(def, state);
            }
            break;
        case "check-readiness":
            checkReadiness(def, state);
            break;
        default:
            // no action defined
            return;
    }

    return state;
}