const cli = require("cli");
const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.redislabs.com/v1";

function getPaymentMethods(def) {
    const accountKey = secret.get(def.account_key_secret);
    const userKey = secret.get(def.user_key_secret);

    return http.get(BASE_URL + "/payment-methods", {
        headers: {
            "accept": "application/json",
            "x-api-key": accountKey,
            "x-api-secret-key": userKey,
            "content-type": "application/json"
        },
    });
}

function getPlans(def, subscriptionType, cloudProvider, region) {
    const accountKey = secret.get(def.account_key_secret);
    const userKey = secret.get(def.user_key_secret);
    let subscriptionPrefix = ""
    if (subscriptionType === "essentials") {
        subscriptionPrefix = "/fixed"
    }

    const res = http.get(BASE_URL + subscriptionPrefix + "/plans?provider=" + cloudProvider + "&redisFlex=false", {
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
    const filteredPlans = resObj.plans.filter(plan => plan.region === region);

    cli.output("Plans: " + JSON.stringify(filteredPlans, null, 2));
}

function main(def, state, ctx) {
    switch (ctx.action) {
        case "get-payment-methods":
            const res = getPaymentMethods(def);
            if (res.error) {
                throw new Error(res.error + ", body " + res.body);
            }
            cli.output("Payment methods: " + res.body);
            return;
        case "get-plans":
            getPlans(def, ctx.args.subscription_type, ctx.args.cloud_provider, ctx.args.region);
            return;
        default:
            // no action defined
            return;
    }
}