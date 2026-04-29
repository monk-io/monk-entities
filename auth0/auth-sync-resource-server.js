const http = require("http");
const secret = require("secret");

function describeAuth0Error(res) {
  let detail = res.body;
  try {
    const parsed = JSON.parse(res.body);
    const parts = [];
    if (parsed.statusCode) parts.push(`statusCode=${parsed.statusCode}`);
    if (parsed.error) parts.push(`error=${parsed.error}`);
    if (parsed.errorCode) parts.push(`errorCode=${parsed.errorCode}`);
    if (parsed.message) parts.push(`message=${parsed.message}`);
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      parts.push(`errors=${JSON.stringify(parsed.errors)}`);
    }
    if (parts.length > 0) detail = parts.join(" | ");
  } catch (_) {
    // body is not JSON; keep raw body
  }
  return `status=${res.status} transport=${res.error || "none"} body=${detail}`;
}

function isHttpFailure(res) {
  if (res.error) return true;
  if (typeof res.status === "number" && res.status >= 400) return true;
  return false;
}

function getManagementToken(def) {
  console.log(`Obtaining Management API token`);
  let clientID = secret.get(def["management-client-id-secret"]);
  if (!clientID) {
    throw new Error(
      `Management client ID secret not found: ${def["management-client-id-secret"]}`
    );
  }
  let clientSecret = secret.get(def["management-client-token-secret"]);
  if (!clientSecret) {
    throw new Error(
      `Management client secret not found: ${def["management-client-token-secret"]}`
    );
  }
  const tokenPayload = {
    client_id: clientID,
    client_secret: clientSecret,
    audience: `${def["management-api"]}/api/v2/`,
    grant_type: "client_credentials",
  };
  const tokenResponse = http.post(`${def["management-api"]}/oauth/token`, {
    body: JSON.stringify(tokenPayload),
    headers: { "Content-Type": "application/json" },
  });
  if (isHttpFailure(tokenResponse)) {
    throw new Error(
      `Failed to obtain Management API token: ${describeAuth0Error(tokenResponse)}`
    );
  }
  return JSON.parse(tokenResponse.body).access_token;
}

function createResourceServer(def, managementToken) {
  const body = {
    name: def.name,
    identifier: def.audience,
    scopes: def.scopes || [],
    skip_consent_for_verifiable_first_party_clients: true,
  };

  const req = {
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };

  console.log("Creating resource server:", JSON.stringify(body, null, 2));
  const res = http.post(
    `${def["management-api"]}/api/v2/resource-servers`,
    req
  );

  if (isHttpFailure(res)) {
    throw new Error(
      `Failed to create resource server (audience=${def.audience} name=${def.name}): ${describeAuth0Error(res)}`
    );
  }

  return JSON.parse(res.body);
}

function updateResourceServer(def, state, managementToken) {
  const body = {
    name: def.name,
    scopes: def.scopes || [],
  };

  const req = {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };

  console.log("Updating resource server:", JSON.stringify(body, null, 2));
  const res = http.do(
    `${def["management-api"]}/api/v2/resource-servers/${state["resource-server-id"]}`,
    req
  );

  if (isHttpFailure(res)) {
    throw new Error(
      `Failed to update resource server (id=${state["resource-server-id"]}): ${describeAuth0Error(res)}`
    );
  }

  return JSON.parse(res.body);
}

function deleteResourceServer(def, state, managementToken) {
  const req = {
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  console.log("Deleting resource server:", state["resource-server-id"]);
  const res = http.delete(
    `${def["management-api"]}/api/v2/resource-servers/${state["resource-server-id"]}`,
    req
  );

  if (isHttpFailure(res) && res.status !== 404) {
    throw new Error(
      `Failed to delete resource server (id=${state["resource-server-id"]}): ${describeAuth0Error(res)}`
    );
  }
}

function createClientGrant(def, state, managementToken) {
  const body = {
    client_id: def["client-id"],
    audience: state.audience,
    scope: def.scopes || [],
  };

  const req = {
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };

  console.log("Creating client grant:", JSON.stringify(body, null, 2));
  const res = http.post(`${def["management-api"]}/api/v2/client-grants`, req);

  if (isHttpFailure(res)) {
    throw new Error(
      `Failed to create client grant (client-id=${def["client-id"]} audience=${state.audience}): ${describeAuth0Error(res)}`
    );
  }

  return JSON.parse(res.body);
}

function updateClientGrant(def, state, managementToken) {
  const body = {
    scope: def.scopes || [],
  };

  const req = {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };

  console.log("Updating client grant:", JSON.stringify(body, null, 2));
  const res = http.do(
    `${def["management-api"]}/api/v2/client-grants/${state["grant-id"]}`,
    req
  );

  if (isHttpFailure(res)) {
    throw new Error(
      `Failed to update client grant (grant-id=${state["grant-id"]}): ${describeAuth0Error(res)}`
    );
  }

  return JSON.parse(res.body);
}

function deleteClientGrant(def, state, managementToken) {
  const req = {
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };

  console.log("Deleting client grant:", state["grant-id"]);
  const res = http.delete(
    `${def["management-api"]}/api/v2/client-grants/${state["grant-id"]}`,
    req
  );

  if (isHttpFailure(res) && res.status !== 404) {
    throw new Error(
      `Failed to delete client grant (grant-id=${state["grant-id"]}): ${describeAuth0Error(res)}`
    );
  }
}

function syncResourceServer(def, state, update = false) {
  const managementToken = getManagementToken(def);

  try {
    if (update && state["resource-server-id"]) {
      // Update existing resource server
      const resourceServer = updateResourceServer(def, state, managementToken);

      // Update client grant if it exists
      if (state["grant-id"]) {
        const clientGrant = updateClientGrant(def, state, managementToken);
        return {
          ...state,
          name: resourceServer.name,
          audience: resourceServer.identifier,
          scopes: resourceServer.scopes,
          "grant-id": clientGrant.id,
          "resource-server-id": resourceServer.id,
        };
      }

      return {
        ...state,
        name: resourceServer.name,
        audience: resourceServer.identifier,
        scopes: resourceServer.scopes,
        "resource-server-id": resourceServer.id,
      };
    } else {
      // Create new resource server
      const resourceServer = createResourceServer(def, managementToken);

      // Create client grant
      const clientGrant = createClientGrant(
        def,
        { ...state, audience: resourceServer.identifier },
        managementToken
      );

      return {
        ready: true,
        name: resourceServer.name,
        audience: resourceServer.identifier,
        scopes: resourceServer.scopes,
        "grant-id": clientGrant.id,
        "resource-server-id": resourceServer.id,
      };
    }
  } catch (error) {
    console.error("Error syncing resource server:", error);
    throw error;
  }
}

function deleteResourceServerAndGrant(def, state) {
  const managementToken = getManagementToken(def);

  try {
    // Delete client grant first if it exists
    if (state["grant-id"]) {
      deleteClientGrant(def, state, managementToken);
    }

    // Then delete resource server
    if (state["resource-server-id"]) {
      deleteResourceServer(def, state, managementToken);
    }
  } catch (error) {
    console.error("Error deleting resource server and grant:", error);
    throw error;
  }
}

function checkReadiness(def, state) {
  const res = http.get(
    `https://${def.domain}/.well-known/openid-configuration`,
    {
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (res.status !== 200) {
    throw new Error(
      `Auth0 domain unavailable: status ${res.status}, body ${res.body}`
    );
  }

  console.log("Auth0 domain is ready");
  state.ready = true;
  return state;
}

function main(def, state, ctx) {
  switch (ctx.action) {
    case "create":
      state = syncResourceServer(def, state, false);
      break;
    case "update":
      state = syncResourceServer(def, state, true);
      break;
    case "purge":
      deleteResourceServerAndGrant(def, state);
      break;
    case "check-readiness":
      state = checkReadiness(def, state);
      break;
    case "patch":
      state = syncResourceServer(def, state, true);
      break;
    default:
      return state;
  }

  return state;
}
