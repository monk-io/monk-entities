const cli = require("cli");
const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.redislabs.com/v1";

function selectPlan(accountKey, userKey, def) {
    let subscriptionPrefix = ""
    if (def.subscription_type === "essentials") {
        subscriptionPrefix = "/fixed"
    }

    const res = http.get(BASE_URL + subscriptionPrefix + "/plans?provider=" + def.provider + "&redisFlex=" + def.redis_flex, {
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

    const resObj = JSON.parse(res.body);
    const plans = resObj.plans || [];

    for (const plan of plans) {
        let isMatch = true;

        if (def.provider && plan.provider !== def.provider) {
            isMatch = false;
            continue;
        }
        if (def.region && plan.region !== def.region) {
            isMatch = false;
            continue;
        }
        if (def.redis_flex !== undefined && plan.redisFlex !== def.redis_flex) {
            isMatch = false;
            continue;
        }
        if (def.size && plan.size !== def.size) {
            isMatch = false;
            continue;
        }
        if (def.availability && plan.availability !== def.availability) {
            isMatch = false;
            continue;
        }
        if (def.support_data_persistence !== undefined && plan.supportDataPersistence !== def.support_data_persistence) {
            isMatch = false;
            continue;
        }
        if (def.support_instant_and_daily_backups !== undefined && plan.supportInstantAndDailyBackups !== def.support_instant_and_daily_backups) {
            isMatch = false;
            continue;
        }
        if (def.support_replication !== undefined && plan.supportReplication !== def.support_replication) {
            isMatch = false;
            continue;
        }
        if (def.support_clustering !== undefined && plan.supportClustering !== def.support_clustering) {
            isMatch = false;
            continue;
        }
        if (def.support_ssl !== undefined && plan.supportSsl !== def.support_ssl) {
            isMatch = false;
            continue;
        }

        if (isMatch) {
            console.log(plan);
            return plan.id;
        }
    }

    throw new Error("No matching plan found for the given subscription definition");
}

function selectPaymentMethod(accountKey, userKey, def) {
    const res = http.get(BASE_URL + "/payment-methods", {
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

    const resObj = JSON.parse(res.body);
    const paymentMethods = resObj.paymentMethods || [];

    for (const paymentMethod of paymentMethods) {
        if (def.payment_method_type && paymentMethod.type === def.payment_method_type) {
            console.log(JSON.stringify(paymentMethod))
            return paymentMethod.id
        }
    }

    throw new Error("No matching payment method found for the given subscription definition");
}

function syncSubscription(def, state, update) {
    const accountKey = secret.get(def.account_key_secret);
    const userKey = secret.get(def.user_key_secret);
    let subscriptionPrefix = ""
    if (def.subscription_type === "essentials") {
        subscriptionPrefix = "/fixed"
    }

    const planID = selectPlan(accountKey, userKey, def);
    let paymentMethodID = def.payment_method_id
    if (!paymentMethodID && def.payment_method_type) {
        paymentMethodID = selectPaymentMethod(accountKey, userKey, def);
    }

    const body = {
        name: def.name,
        planId: planID,
        paymentMethod: def.payment_method,
        paymentMethodId: paymentMethodID,
    }

    const req = {
        headers: {
            "accept": "application/json",
            "x-api-key": accountKey,
            "x-api-secret-key": userKey,
            "content-type": "application/json"
        },
        body: JSON.stringify(body)
    }

    let res;
    if (update) {
        res = http.put(BASE_URL + subscriptionPrefix + "/subscriptions/" + state.id, req);
    }
    else {
        res = http.post(BASE_URL + subscriptionPrefix + "/subscriptions", req);
    }
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    console.log(res.body);

    const resObj = JSON.parse(res.body);
    const resourceId = waitTask(resObj.taskId, accountKey, userKey);

    res = http.get(BASE_URL + subscriptionPrefix + "/subscriptions/" + resourceId, {
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

    const subObj = JSON.parse(res.body);
    subObj.ready = subObj.status === "active";
    subObj.type = def.subscription_type;
    delete subObj.links;

    return subObj;
}

function deleteSubscription(def, state) {
    const accountKey = secret.get(def.account_key_secret);
    const userKey = secret.get(def.user_key_secret);
    let subscriptionPrefix = ""
    if (def.subscription_type === "essentials") {
        subscriptionPrefix = "/fixed"
    }
    // Delete all databases in the subscription
    let res = http.get(BASE_URL + subscriptionPrefix + "/subscriptions/" + state.id + "/databases",
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

    let resObj = JSON.parse(res.body);
    if (resObj.subscription.databases.length > 0) {
        for (let i = 0; i < resObj.subscription.databases.length; i++) {
            const db = resObj.subscription.databases[i];
            res = http.delete(BASE_URL + subscriptionPrefix + "/subscriptions/" + state.id + "/databases/" + db.databaseId,
                {
                    headers: {
                        "accept": "application/json",
                        "x-api-key": accountKey,
                        "x-api-secret-key": userKey,
                        "content-type": "application/json"
                    },
                });
            if (res.error) {
                console.log(res.error + ", body " + res.body);
                continue
            }
            console.log(res.body);
            const taskObj = JSON.parse(res.body);
            try {
                waitTask(taskObj.taskId, accountKey, userKey);
            } catch (e) {
                console.log("Error waiting task processing: " + e);
            }
        }
    }

    res = http.delete(BASE_URL + subscriptionPrefix + "/subscriptions/" + state.id,
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
    resObj = JSON.parse(res.body);
    waitTask(resObj.taskId, accountKey, userKey);
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

    const res = http.get(BASE_URL + subscriptionPrefix + "/subscriptions/" + state.id,
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
        state.ready = true;
        return state;
    }

    throw new Error("not ready");
}


function main(def, state, ctx) {
    switch (ctx.action) {
        case "create":
            state = syncSubscription(def, state, false)
            break;
        case "update":
            if (state.id) {
                state = syncSubscription(def, state, true);
            } else {
                state = syncSubscription(def, state, false);
            }
            break;
        case "purge":
            if (state.id) {
                deleteSubscription(def, state);
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