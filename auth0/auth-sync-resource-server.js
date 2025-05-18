const http = require("http");
const secret = require("secret");

function getManagementToken(def) {
  console.log(`Obtaining Management API token ${def}`, def);
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
  if (tokenResponse.error) {
    throw new Error(
      `Failed to obtain Management API token. Error: ${tokenResponse.error} Body: ${tokenResponse.body}`
    );
  }
  return JSON.parse(tokenResponse.body).access_token;
}

function createResourceServer(def, managementToken) {
  const body = {
    name: def.name,
    identifier: def.audience,
    scopes: def.scopes || [],
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

  if (res.error) {
    throw new Error(
      `Failed to create resource server: ${res.error} ${JSON.stringify(
        res.body
      )}`
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
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };

  console.log("Updating resource server:", JSON.stringify(body, null, 2));
  const res = http.patch(
    `${def["management-api"]}/api/v2/resource-servers/${state.audience}`,
    req
  );

  if (res.error) {
    throw new Error(`Failed to update resource server: ${res.error}`);
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

  console.log("Deleting resource server:", state.audience);
  const res = http.delete(
    `${def["management-api"]}/api/v2/resource-servers/${state.audience}`,
    req
  );

  if (res.error) {
    throw new Error(`Failed to delete resource server: ${res.error}`);
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

  if (res.error) {
    throw new Error(`Failed to create client grant: ${res.error}`);
  }

  return JSON.parse(res.body);
}

function updateClientGrant(def, state, managementToken) {
  const body = {
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

  console.log("Updating client grant:", JSON.stringify(body, null, 2));
  const res = http.patch(
    `${def["management-api"]}/api/v2/client-grants/${state["grant-id"]}`,
    req
  );

  if (res.error) {
    throw new Error(`Failed to update client grant: ${res.error}`);
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

  if (res.error) {
    throw new Error(`Failed to delete client grant: ${res.error}`);
  }
}

function syncResourceServer(def, state, update = false) {
  const managementToken = getManagementToken(def);

  try {
    if (update && state.audience) {
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
        };
      }

      return {
        ...state,
        name: resourceServer.name,
        audience: resourceServer.identifier,
        scopes: resourceServer.scopes,
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
    if (state.audience) {
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
    default:
      return state;
  }

  return state;
}
