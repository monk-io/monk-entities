const http = require("http");
const secret = require("secret");

const FIELD_MAPPING = {
  "app-name": "name",
  "app-type": "app_type",
  "callback-url": "callbacks",
  description: "description",
  "allowed-logout-urls": "allowed_logout_urls",
  "web-origins": "web_origins",
  "logo-uri": "logo_uri",
  "allowed-origins": "allowed_origins",
  "cross-origin-authentication": "cross_origin_authentication",
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
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      result[key] = convertExclamationArrays(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function mapApplicationDefinition(def, isUpdate = false) {
  const normalizedDef = convertExclamationArrays(def);

  function processValue(value, mapping) {
    if (Array.isArray(value)) {
      if (mapping.newKey && mapping.items) {
        return {
          [mapping.newKey]: value.map((item) =>
            processObject(item, mapping.items)
          ),
        };
      }
      return value.map((item) => {
        if (typeof item === "object" && item !== null && mapping.items) {
          return processObject(item, mapping.items);
        }
        return item;
      });
    }

    if (typeof value === "object" && value !== null) {
      if (typeof mapping === "string") {
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
        if (typeof targetKey === "object") {
          const nestedValue = obj[sourceKey];
          const nestedResult = processValue(nestedValue, targetKey);
          Object.assign(result, nestedResult);
        } else {
          if (sourceKey === "callback-url") {
            result[targetKey] = [obj[sourceKey]]; // Auth0 expects callbacks as an array
          } else if (
            sourceKey === "allowed_logout_urls" ||
            sourceKey === "web_origins"
          ) {
            result[targetKey] =
              obj[sourceKey].length > 0 ? obj[sourceKey] : undefined;
          } else {
            result[targetKey] = obj[sourceKey];
          }
        }
      }
    }

    // Add static fields for creation
    if (!isUpdate) {
      if (!result.grant_types)
        result.grant_types = ["authorization_code", "refresh_token"];
      if (!result.token_endpoint_auth_method)
        result.token_endpoint_auth_method = "client_secret_post";
    }

    return result;
  }

  return processObject(normalizedDef, FIELD_MAPPING);
}

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

function syncApplication(def, state, update) {
  const managementToken = getManagementToken(def);
  const body = mapApplicationDefinition(def, update);
  console.log("Request body:", JSON.stringify(body, null, 2));

  const req = {
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };

  console.log(`request ${req}`);

  let res;
  try {
    if (update && state["client-id"]) {
      const fieldsToUpdate = [
        "name",
        "app-type",
        "callbacks",
        "allowed-logout-urls",
        "web-origins",
        "description",
        "logo-uri",
        "allowed-origins",
        "cross-origin-authentication",
      ];
      const currentState = {
        name: state.name,
        "app-type": state["app-type"],
        callbacks: state["callbacks"],
        "allowed-logout-urls": state["allowed-logout-urls"],
        "web-origins": state["web-origins"],
        description: state["description"],
        "logo-uri": state["logo-uri"],
        "allowed-origins": state["allowed-origins"],
        "cross-origin-authentication": state["cross-origin-authentication"],
      };
      const newConfig = mapApplicationDefinition(def);
      let needsUpdate = false;
      for (const field of fieldsToUpdate) {
        if (
          JSON.stringify(currentState[field]) !==
          JSON.stringify(newConfig[field])
        ) {
          needsUpdate = true;
          break;
        }
      }
      if (needsUpdate) {
        req.method = "PATCH";
        console.log(
          "Application configuration changed, updating via PATCH /api/v2/clients/{id}"
        );
        res = http.do(
          `${def["management-api"]}/api/v2/clients/${state["client-id"]}`,
          req
        );
      } else {
        console.log("No changes detected, skipping update");
        return state;
      }
    } else {
      console.log("Creating new Auth0 application via POST /api/v2/clients");
      res = http.post(`${def["management-api"]}/api/v2/clients`, req);
    }
  } catch (err) {
    console.error("HTTP request failed:", err.message);
    throw err;
  }

  console.log("Response status:", res.statusCode);
  console.log("Response body:", res.body);

  if (res.error) {
    throw new Error(`API error: status ${res.status}, body: ${res.body}`);
  }

  let appObj;
  try {
    appObj = JSON.parse(res.body);
  } catch (err) {
    throw new Error(
      `Failed to parse response: ${err.message}, body: ${res.body}`
    );
  }

  return {
    ready: true,
    "client-id": appObj.client_id,
    name: appObj.name,
    "client-secret": appObj.client_secret,
    "app-type": appObj.app_type,
    callbacks: appObj.callbacks,
    "allowed-logout-urls": appObj.allowed_logout_urls,
    "web-origins": appObj.web_origins,
    audience: appObj.audience,
    description: appObj.description,
    "logo-uri": appObj.logo_uri,
    "allowed-origins": appObj.allowed_origins,
    "cross-origin-authentication": appObj.cross_origin_authentication,
  };
}

function deleteApplication(def, state) {
  const managementToken = getManagementToken(def);
  console.log("Deleting application with ID:", state["client-id"]);

  const res = http.delete(
    `${def["management-api"]}/api/v2/clients/${state["client-id"]}`,
    {
      headers: {
        Authorization: `Bearer ${managementToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    }
  );

  console.log("Delete response status:", res.status);
  console.log("Delete response body:", res.body);

  if (res.status >= 400) {
    throw new Error(
      `Failed to delete application: status ${res.status}, body: ${res.body}`
    );
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

function patchApplication(def, state, ctx) {
  if (!state["client-id"]) {
    throw new Error("No client-id found in state for patching application");
  }
  // todo: update
  let mergedDef = { ...def };
  const arrayFields = [
    "callback-url",
    "allowed-logout-urls",
    "web-origins",
    "allowed-origins",
  ];

  // Smart merge: Handle ctx.args, converting strings to arrays for array fields
  for (const [key, value] of Object.entries(ctx.args)) {
    console.log(`Processing key: ${key}, value: ${value} ${typeof value}`);
    if (arrayFields.includes(key) && typeof value === "string") {
      // Split by comma if present, otherwise use as single-element array
      mergedDef[key] = value.includes(",")
        ? value.split(",").map((item) => item.trim())
        : [value];
    } else {
      mergedDef[key] = value; // Override with ctx.args value for non-array fields
    }
  }

  const managementToken = getManagementToken(mergedDef);
  const body = mapApplicationDefinition(mergedDef, true);
  console.log("Patch request body:", JSON.stringify(body, null, 2));

  const req = {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${managementToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  };

  const fieldsToUpdate = [
    "name",
    "app-type",
    "callbacks",
    "allowed-logout-urls",
    "web-origins",
    "description",
    "logo-uri",
    "allowed-origins",
    "cross-origin-authentication",
  ];
  const currentState = {
    name: state.name,
    "app-type": "state.app-type",
    callbacks: "state.callbacks",
    "allowed-logout-urls": state["allowed-logout-urls"],
    "web-origins": state["web-origins"],
    description: state["description"],
    "logo-uri": state["logo-uri"],
    "allowed-origins": state["allowed-origins"],
    "cross-origin-authentication": state["cross-origin-authentication"],
  };
  const newConfig = mapApplicationDefinition(mergedDef);
  let needsUpdate = false;
  for (const field of fieldsToUpdate) {
    if (
      JSON.stringify(currentState[field]) !== JSON.stringify(newConfig[field])
    ) {
      needsUpdate = true;
      break;
    }
  }

  if (!needsUpdate) {
    console.log("No changes detected, skipping update");
    return state;
  }

  req.method = "PATCH";
  console.log(
    "Application configuration changed, updating via PATCH /api/v2/clients/{id}"
  );
  let res = http.do(
    `${def["management-api"]}/api/v2/clients/${state["client-id"]}`,
    req
  );
  if (res.error) {
    throw new Error(`API error: status ${res.status}, body: ${res.body}`);
  }

  let appObj;
  try {
    appObj = JSON.parse(res.body);
  } catch (err) {
    throw new Error(
      `Failed to parse response: ${err.message}, body: ${res.body}`
    );
  }

  return {
    ready: true,
    "client-id": appObj.client_id,
    name: appObj.name,
    "client-secret": appObj.client_secret,
    "app-type": appObj.app_type,
    callbacks: appObj.callbacks,
    "allowed-logout-urls": appObj.allowed_logout_urls,
    "web-origins": appObj.web_origins,
    audience: appObj.audience,
    description: appObj.description,
    "logo-uri": appObj.logo_uri,
    "allowed-origins": appObj.allowed_origins,
    "cross-origin-authentication": appObj.cross_origin_authentication,
  };
}

function main(def, state, ctx) {
  switch (ctx.action) {
    case "create":
      state = syncApplication(def, state, false);
      break;
    case "update":
      if (state["client-id"]) {
        state = syncApplication(def, state, true);
      } else {
        state = syncApplication(def, state, false);
      }
      break;
    case "purge":
      if (state["client-id"]) {
        deleteApplication(def, state);
      }
      break;
    case "check-readiness":
      state = checkReadiness(def, state);
      break;
    case "patch":
      state = patchApplication(def, state, ctx);
      break;
    default:
      return state;
  }

  return state;
}
