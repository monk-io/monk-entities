
// Generated by MonkEC - targeting Goja runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name]() {
    return __privateGet(this, extra);
  }, set [name](x) {
    return __privateSet(this, extra, x);
  } }, name));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name) : __name(target, name);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// input/vercel/project.ts
const vercelBase = require("vercel/vercel-base");
const VercelEntity = vercelBase.VercelEntity;
const base = require("monkec/base");
const action = base.action;
const cli = require("cli");
const common = require("vercel/common");
const VERCEL_API_ENDPOINTS = common.VERCEL_API_ENDPOINTS;
var _removeDomain_dec, _addDomain_dec, _listDomains_dec, _getDeployment_dec, _createDeployment_dec, _listDeployments_dec, _getProject_dec, _a, _init;
var _Project = class _Project extends (_a = VercelEntity, _getProject_dec = [action("get-project")], _listDeployments_dec = [action("list-deployments")], _createDeployment_dec = [action("create-deployment")], _getDeployment_dec = [action("get-deployment")], _listDomains_dec = [action("list-domains")], _addDomain_dec = [action("add-domain")], _removeDomain_dec = [action("remove-domain")], _a) {
  constructor() {
    super(...arguments);
    __runInitializers(_init, 5, this);
  }
  getEntityName() {
    return this.definition.name;
  }
  /** Create a new Vercel project */
  create() {
    const existingProject = this.findExistingProject();
    if (existingProject) {
      this.state = {
        id: existingProject.id,
        name: existingProject.name,
        url: existingProject.url,
        domains: existingProject.domains,
        status: existingProject.status,
        created_at: existingProject.created_at,
        updated_at: existingProject.updated_at,
        account_id: existingProject.account_id,
        latest_deployment: existingProject.latest_deployment,
        framework: existingProject.framework,
        build_command: existingProject.buildCommand,
        output_directory: existingProject.outputDirectory,
        install_command: existingProject.installCommand,
        dev_command: existingProject.devCommand,
        root_directory: existingProject.rootDirectory,
        existing: true
      };
      cli.output(`\u2705 Project ${this.definition.name} already exists, updating configuration`);
      this.update();
      return;
    }
    const body = {
      name: this.definition.name,
      ...this.getTeamBody()
    };
    if (this.definition.framework) {
      body.framework = this.definition.framework;
    }
    if (this.definition.git_repository) {
      body.gitRepository = this.definition.git_repository;
    }
    if (this.definition.root_directory) {
      body.rootDirectory = this.definition.root_directory;
    }
    if (this.definition.build_command) {
      body.buildCommand = this.definition.build_command;
    }
    if (this.definition.output_directory) {
      body.outputDirectory = this.definition.output_directory;
    }
    if (this.definition.install_command) {
      body.installCommand = this.definition.install_command;
    }
    if (this.definition.dev_command) {
      body.devCommand = this.definition.dev_command;
    }
    let createObj;
    try {
      createObj = this.makeRequest("POST", VERCEL_API_ENDPOINTS.PROJECTS_V11, body);
    } catch (error) {
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else {
        errorMessage = "Project creation failed";
      }
      cli.output(`\u274C Project creation failed: ${errorMessage}`);
      if (errorMessage.includes("409") || errorMessage.includes("already exists")) {
        cli.output(`\u{1F504} Project creation failed with 409 (project already exists), trying to find existing project...`);
        const retryProject = this.findExistingProject();
        if (retryProject) {
          this.state = {
            id: retryProject.id,
            name: retryProject.name,
            url: retryProject.url,
            domains: retryProject.domains,
            status: retryProject.status,
            created_at: retryProject.created_at,
            updated_at: retryProject.updated_at,
            account_id: retryProject.account_id,
            latest_deployment: retryProject.latest_deployment,
            framework: retryProject.framework,
            build_command: retryProject.buildCommand,
            output_directory: retryProject.outputDirectory,
            install_command: retryProject.installCommand,
            dev_command: retryProject.devCommand,
            root_directory: retryProject.rootDirectory,
            existing: true
          };
          cli.output(`\u2705 Project ${this.definition.name} already exists (after 409), updating configuration`);
          this.update();
          return;
        }
      }
      throw new Error(`Failed to create project: ${errorMessage}`);
    }
    this.state = {
      id: createObj.id,
      name: createObj.name,
      url: createObj.url,
      domains: createObj.domains,
      status: createObj.status,
      created_at: createObj.created_at,
      updated_at: createObj.updated_at,
      account_id: createObj.account_id,
      latest_deployment: createObj.latest_deployment,
      framework: createObj.framework,
      build_command: createObj.buildCommand,
      output_directory: createObj.outputDirectory,
      install_command: createObj.installCommand,
      dev_command: createObj.devCommand,
      root_directory: createObj.rootDirectory,
      existing: false
    };
    cli.output(`\u2705 Created Vercel project: ${createObj.name} (${createObj.url})`);
  }
  update() {
    if (!this.state.id) {
      this.create();
      return;
    }
    const body = {
      ...this.getTeamBody()
    };
    let hasChanges = false;
    if (this.definition.name !== this.state.name) {
      body.name = this.definition.name;
      hasChanges = true;
    }
    if (this.definition.framework && this.definition.framework !== this.state.framework) {
      body.framework = this.definition.framework;
      hasChanges = true;
    }
    if (this.definition.build_command && this.definition.build_command !== this.state.build_command) {
      body.buildCommand = this.definition.build_command;
      hasChanges = true;
    }
    if (this.definition.output_directory && this.definition.output_directory !== this.state.output_directory) {
      body.outputDirectory = this.definition.output_directory;
      hasChanges = true;
    }
    if (this.definition.install_command && this.definition.install_command !== this.state.install_command) {
      body.installCommand = this.definition.install_command;
      hasChanges = true;
    }
    if (this.definition.dev_command && this.definition.dev_command !== this.state.dev_command) {
      body.devCommand = this.definition.dev_command;
      hasChanges = true;
    }
    if (this.definition.root_directory && this.definition.root_directory !== this.state.root_directory) {
      body.rootDirectory = this.definition.root_directory;
      hasChanges = true;
    }
    if (!hasChanges) {
      cli.output(`\u2139\uFE0F  No changes detected for project: ${this.definition.name}`);
      return;
    }
    const updatedProject = this.makeRequest("PATCH", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`, body);
    this.state = {
      ...this.state,
      name: updatedProject.name,
      url: updatedProject.url,
      domains: updatedProject.domains,
      status: updatedProject.status,
      updated_at: updatedProject.updated_at,
      latest_deployment: updatedProject.latest_deployment,
      framework: updatedProject.framework,
      build_command: updatedProject.buildCommand,
      output_directory: updatedProject.outputDirectory,
      install_command: updatedProject.installCommand,
      dev_command: updatedProject.devCommand,
      root_directory: updatedProject.rootDirectory
    };
    cli.output(`\u2705 Updated Vercel project: ${updatedProject.name}`);
  }
  delete() {
    if (!this.state.id) {
      cli.output("Project does not exist, nothing to delete");
      return;
    }
    this.deleteResource(`${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`, "Project");
  }
  checkReadiness() {
    if (!this.state.id) {
      return false;
    }
    try {
      const project = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`);
      return !!project && !!project.id;
    } catch (error) {
      return false;
    }
  }
  /**
   * Find existing project by name
   */
  findExistingProject() {
    try {
      const teamPath = this.getTeamPath();
      const allProjects = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}${teamPath}`);
      if (allProjects && Array.isArray(allProjects.projects)) {
        return allProjects.projects.find((p) => p.name === this.definition.name);
      }
    } catch (error) {
      cli.output(`\u26A0\uFE0F  Could not check for existing projects: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
    return null;
  }
  getProject() {
    if (!this.state.id) {
      throw new Error("Project ID not available");
    }
    cli.output(`\u{1F4CB} Getting details for project: ${this.definition.name}`);
    const project = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}`);
    cli.output(`\u2705 Project Details:`);
    cli.output(`   ID: ${project.id}`);
    cli.output(`   Name: ${project.name}`);
    cli.output(`   URL: ${project.url}`);
    cli.output(`   Status: ${project.status}`);
    cli.output(`   Created: ${project.created_at}`);
    cli.output(`   Updated: ${project.updated_at}`);
    if (project.domains && project.domains.length > 0) {
      cli.output(`   Domains: ${project.domains.join(", ")}`);
    }
  }
  listDeployments(args) {
    if (!this.state.id) {
      throw new Error("Project ID not available");
    }
    const limit = args?.limit || 10;
    cli.output(`\u{1F4CB} Listing deployments for project: ${this.definition.name} (limit: ${limit})`);
    const teamPath = this.getTeamPath();
    const queryParams = `projectId=${this.state.id}&limit=${limit}`;
    const path = teamPath ? `${VERCEL_API_ENDPOINTS.DEPLOYMENTS}${teamPath}&${queryParams}` : `${VERCEL_API_ENDPOINTS.DEPLOYMENTS}?${queryParams}`;
    const deployments = this.makeRequest("GET", path);
    if (deployments && Array.isArray(deployments.deployments)) {
      cli.output(`\u2705 Found ${deployments.deployments.length} deployments:`);
      deployments.deployments.forEach((deployment, index) => {
        cli.output(`   ${index + 1}. ${deployment.url} (${deployment.state}) - ${deployment.created_at}`);
      });
    } else {
      cli.output(`\u2139\uFE0F  No deployments found`);
    }
  }
  createDeployment(args) {
    if (!this.state.id) {
      throw new Error("Project ID not available");
    }
    const name = args?.name || `deployment-${Date.now()}`;
    cli.output(`\u{1F680} Creating deployment for project: ${this.definition.name}`);
    const body = {
      name,
      projectId: this.state.id,
      ...this.getTeamBody()
    };
    const deployment = this.makeRequest("POST", VERCEL_API_ENDPOINTS.DEPLOYMENTS_V13, body);
    cli.output(`\u2705 Deployment created successfully!`);
    cli.output(`   Deployment ID: ${deployment.id}`);
    cli.output(`   URL: ${deployment.url}`);
    cli.output(`   State: ${deployment.state}`);
  }
  getDeployment(args) {
    if (!this.state.id) {
      throw new Error("Project ID not available");
    }
    const deploymentId = args?.deployment_id;
    if (!deploymentId) {
      throw new Error("deployment_id argument is required");
    }
    cli.output(`\u{1F4CB} Getting deployment details: ${deploymentId}`);
    const deployment = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.DEPLOYMENTS_V13}/${deploymentId}`);
    cli.output(`\u2705 Deployment Details:`);
    cli.output(`   ID: ${deployment.id}`);
    cli.output(`   URL: ${deployment.url}`);
    cli.output(`   State: ${deployment.state}`);
    cli.output(`   Created: ${deployment.created_at}`);
    cli.output(`   Project: ${deployment.project_id}`);
  }
  listDomains() {
    if (!this.state.id) {
      throw new Error("Project ID not available");
    }
    cli.output(`\u{1F4CB} Listing domains for project: ${this.definition.name}`);
    const teamPath = this.getTeamPath();
    const domains = this.makeRequest("GET", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains${teamPath}`);
    if (domains && Array.isArray(domains)) {
      cli.output(`\u2705 Found ${domains.length} domains:`);
      domains.forEach((domain, index) => {
        cli.output(`   ${index + 1}. ${domain.name} (${domain.verification?.status || "unknown"})`);
      });
    } else {
      cli.output(`\u2139\uFE0F  No domains found`);
    }
  }
  addDomain(args) {
    if (!this.state.id) {
      throw new Error("Project ID not available");
    }
    const domain = args?.domain;
    if (!domain) {
      throw new Error("domain argument is required");
    }
    cli.output(`\u{1F310} Adding domain ${domain} to project: ${this.definition.name}`);
    const body = {
      name: domain,
      ...this.getTeamBody()
    };
    const result = this.makeRequest("POST", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains`, body);
    cli.output(`\u2705 Domain added successfully!`);
    cli.output(`   Domain: ${result.name}`);
    cli.output(`   Status: ${result.verification?.status || "unknown"}`);
  }
  removeDomain(args) {
    if (!this.state.id) {
      throw new Error("Project ID not available");
    }
    const domain = args?.domain;
    if (!domain) {
      throw new Error("domain argument is required");
    }
    cli.output(`\u{1F5D1}\uFE0F  Removing domain ${domain} from project: ${this.definition.name}`);
    this.makeRequest("DELETE", `${VERCEL_API_ENDPOINTS.PROJECTS}/${this.state.id}/domains/${domain}`);
    cli.output(`\u2705 Domain removed successfully!`);
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "getProject", _getProject_dec, _Project);
__decorateElement(_init, 1, "listDeployments", _listDeployments_dec, _Project);
__decorateElement(_init, 1, "createDeployment", _createDeployment_dec, _Project);
__decorateElement(_init, 1, "getDeployment", _getDeployment_dec, _Project);
__decorateElement(_init, 1, "listDomains", _listDomains_dec, _Project);
__decorateElement(_init, 1, "addDomain", _addDomain_dec, _Project);
__decorateElement(_init, 1, "removeDomain", _removeDomain_dec, _Project);
__decoratorMetadata(_init, _Project);
__name(_Project, "Project");
var Project = _Project;



function main(def, state, ctx) {
  const entity = new Project(def, state, ctx);
  return entity.main(ctx);
}
