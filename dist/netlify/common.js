// Generated by MonkEC - targeting Goja runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// input/netlify/common.ts
var common_exports = {};
__export(common_exports, {
  API_BASE_URL: () => API_BASE_URL,
  API_VERSION: () => API_VERSION,
  buildTeamPath: () => buildTeamPath,
  formatDeployTime: () => formatDeployTime,
  getApiToken: () => getApiToken,
  getDeployStatusEmoji: () => getDeployStatusEmoji,
  validateDeployId: () => validateDeployId,
  validateSiteId: () => validateSiteId
});
module.exports = __toCommonJS(common_exports);
var import_secret = __toESM(require("secret"));
var API_BASE_URL = "https://api.netlify.com/api/v1";
var API_VERSION = "v1";
function getApiToken(secretRef) {
  const token = import_secret.default.get(secretRef);
  if (!token) {
    throw new Error(`API token not found in secret: ${secretRef}`);
  }
  return token;
}
function buildTeamPath(teamSlug) {
  return teamSlug ? `/${teamSlug}` : "";
}
function validateSiteId(siteId) {
  return /^[a-zA-Z0-9-]+$/.test(siteId);
}
function validateDeployId(deployId) {
  return /^[a-zA-Z0-9]+$/.test(deployId);
}
function formatDeployTime(seconds) {
  if (!seconds) return "Unknown";
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    return `${hours}h ${minutes}m`;
  }
}
function getDeployStatusEmoji(state) {
  switch (state) {
    case "ready":
    case "published":
      return "\u2705";
    case "building":
    case "preparing":
      return "\u{1F504}";
    case "error":
    case "failed":
      return "\u274C";
    case "cancelled":
      return "\u23F9\uFE0F";
    case "locked":
      return "\u{1F512}";
    default:
      return "\u2753";
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  API_BASE_URL,
  API_VERSION,
  buildTeamPath,
  formatDeployTime,
  getApiToken,
  getDeployStatusEmoji,
  validateDeployId,
  validateSiteId
});
