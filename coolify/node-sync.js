const cm = require("cloud/manager");
const secret = require("secret");
const crypto = require("crypto");
const http = require("http");

function getNode(def) {
    const manager = cm.init(def.provider);

    const n = manager.getNode(def.name, def.region);

    return n;
}

function createNode(def) {
    const manager = cm.init(def.provider);

    const opts = {};

    if (!def.apiUrl) { // if no apiUrl is provided, we assume this is root node
        const password = secret.get(def.rootUser.passwordSecret).replace("\"", "\\\"");

        const token = secret.randString(16);
        secret.set(def.tokenSecret, "1|" + token);

        const tokenHash = crypto.sha256(token);

        opts.startupScript = `#!/usr/bin/sh
set -e
wget https://cdn.coollabs.io/coolify/install.sh -O /tmp/install.sh
chmod +x /tmp/install.sh
ROOT_USERNAME="${def.rootUser.username}" \
ROOT_USER_EMAIL="${def.rootUser.email}" \
ROOT_USER_PASSWORD="${password}" \
/tmp/install.sh
docker exec coolify-db psql -U coolify -c "UPDATE instance_settings set is_api_enabled=true"
docker exec coolify-db psql -U coolify -c "INSERT INTO personal_access_tokens \
(tokenable_type, tokenable_id, name, token, team_id, abilities, created_at) \
VALUES ('App\\Models\\User', 0, 'Monk token', '${tokenHash}', 0, '[\\"root\\"]', NOW())"
`;
    } else { // if apiUrl is provided, we add root node public key to allow ssh access
        const token = secret.get(def.tokenSecret);
        const privKey = getPrivateKey(def.apiUrl, token);
        opts.sshPublicKey = privKey.public_key;
    }

    if (def.os) {
        opts.os = def.os;
    }
    if (def.diskSize) {
        opts.diskSize = def.diskSize;
    }
    if (def.diskType) {
        opts.diskType = def.diskType;
    }

    const n = manager.createNode(def.name, def.region, def.instance, opts);

    if (def.publicPorts) {
        manager.addPorts(def.name, def.region, def.publicPorts);
    }

    let state = {
        id: n.id,
        name: def.name,
        region: def.region,
        ip: n.ip,
        publicPorts: def.publicPorts
    }
    if (!def.apiUrl) {
        state.apiUrl = "http://" + n.ip + ":8000";
    }

    return state
}

function updateNode(def, state) {
    const manager = cm.init(def.provider);

    if (def.publicPorts !== state.publicPorts) {
        manager.addPorts(def.name, def.region, def.publicPorts);
    }

    state.publicPorts = def.publicPorts;

    return state;
}

function deleteNode(def, state) {
    const manager = cm.init(def.provider);

    return manager.deleteNode(def.name, def.region);
}

function getPrivateKey(apiUrl, token) {
    let res = http.get(apiUrl + "/api/v1/security/keys",
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            }
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    if (res.statusCode !== 200) {
        throw new Error("Error getting SSH public key: " + res.statusCode + ", body " + res.body);
    }

    resArr = JSON.parse(res.body);
    for (let i = 0; i < resArr.length; i++) {
        if (resArr[i].id === 0) {
            return resArr[i];
        }
    }

    throw new Error("No private key found");
}

function getServerByIP(apiUrl, token, ip) {
    let res = http.get(apiUrl + "/api/v1/servers",
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            }
        });
    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }
    if (res.statusCode !== 200) {
        throw new Error("Error getting servers: " + res.statusCode + ", body " + res.body);
    }
    let resArr = JSON.parse(res.body);
    for (let i = 0; i < resArr.length; i++) {
        if (resArr[i].ip === ip) {
            return resArr[i];
        }
    }

    return null;
}

function joinRoot(def, state) {
    if (state.uuid) {
        return state;
    }

    const token = secret.get(def.tokenSecret);

    let uuid = "";
    const srv = getServerByIP(def.apiUrl, token, state.ip);
    if (srv !== null) {
        uuid = srv.uuid;
    } else {
        const privKey = getPrivateKey(def.apiUrl, token);

        const body = {
            name: def.name,
            ip: state.ip,
            port: 22,
            user: "monkd",
            private_key_uuid: privKey.uuid,
        };

        let res = http.post(def.apiUrl + "/api/v1/servers",
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

        if (res.statusCode !== 200) {
            throw new Error("Error getting SSH public key: " + res.statusCode + ", body " + res.body);
        }
        let resObj = JSON.parse(res.body);

        uuid = resObj.uuid;
    }

    let resVal = http.get(def.apiUrl + "/api/v1/servers/" + uuid + "/validate",
        {
            headers: {
                "authorization": "Bearer " + token,
                "content-type": "application/json"
            }
        });
    if (resVal.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    if (resVal.statusCode >= 400) {
        throw new Error("Error validating node: " + resVal.statusCode + ", body " + resVal.body);
    }

    state.uuid = uuid;

    return state;
}

function main(def, state, ctx) {
    if (ctx.action === "update" && !state.name) {
        ctx.action = "create";
    }
    switch (ctx.action) {
        case "create":
            state = createNode(def)
            break;
        case "update":
            state = updateNode(def, state)
            break;
        case "purge":
            if (state.name) {
                deleteNode(def, state);
            }
            break;
        case "check-readiness":
            if (!def.apiUrl) {
                try {
                    const token = secret.get(def.tokenSecret);
                    const privKey = getPrivateKey(state.apiUrl, token);
                    state.sshPublicKey = privKey.public_key;
                } catch (e) {
                    console.log("Error getting SSH public key: " + e.message);
                    throw e;
                }
            } else {
                try {
                    state = joinRoot(def, state);
                } catch (e) {
                    console.log("Error joining root: " + e.message);
                    throw e;
                }
            }
            break
        default:
            // no action defined
            return;
    }

    return state;
}
