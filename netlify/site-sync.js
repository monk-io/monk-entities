const http = require("http");
const secret = require("secret");

const BASE_URL = "https://api.netlify.com/api/v1";

function getSite(def) {
    const token = secret.get(def.secret_ref);

    let res = http.get(BASE_URL + "/sites?name=" + def.name,
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            }
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resArr = JSON.parse(res.body);
    for (let i = 0; i < resArr.length; i++) {
        if (resArr[i].name === def.name) {
            return {id: resArr[i].id, name: resArr[i].name, url: resArr[i].url};
        }
    }

    return null;
}

function createSite(def) {
    const token = secret.get(def.secret_ref);

    const body = {
        name: def.name,
        custom_domain: def.custom_domain,
        password: def.password,
        force_ssl: def.force_ssl,
        created_via: "monk.io"
    };

    let res = http.post(BASE_URL + "/sites",
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            },
            body: JSON.stringify(body)
        });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    resObj = JSON.parse(res.body);

    return {id: resObj.id, name: resObj.name, url: resObj.url};
}

function updateSite(def, state) {
    const token = secret.get(def.secret_ref);

    const body = {
        name: def.name,
        custom_domain: def.custom_domain,
        password: def.password,
        force_ssl: def.force_ssl
    };

    let res = http.put(BASE_URL + "/sites/" + state.id,
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            },
            body: JSON.stringify(body)
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}

function deleteSite(def, state) {
    const token = secret.get(def.secret_ref);

    res = http.delete(BASE_URL + "/sites/" + state.id,
        {
            headers: {
                "authorization": "Bearer " + token,
            },
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
}


function main(def, state, ctx) {
    if (!def.secret_ref) {
        def.secret_ref = "default-netlify-pat";
    }
    switch (ctx.action) {
        case "create":
            const ex = getSite(def);
            if (ex !== null) {
                state = ex;
                state.existing = true
                updateSite(def, state);
                break
            }

            state = createSite(def)
            break;
        case "update":
            updateSite(def, state);
            break;
        case "purge":
            if (!state.existing && state.id) {
                deleteSite(def, state);
            }
            break;
        default:
            // no action defined
            return;
    }

    return state;
}
