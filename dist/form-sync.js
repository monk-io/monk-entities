
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

// input/netlify/form.ts
const netlifyBase = require("netlify/netlify-base");
const NetlifyEntity = netlifyBase.NetlifyEntity;
const base = require("monkec/base");
const action = base.action;
const cli = require("cli");
var _listAllForms_dec, _deleteSubmission_dec, _markSubmissionHam_dec, _markSubmissionSpam_dec, _getSubmission_dec, _listSubmissions_dec, _getForm_dec, _a, _init;
var _Form = class _Form extends (_a = NetlifyEntity, _getForm_dec = [action("get-form")], _listSubmissions_dec = [action("list-submissions")], _getSubmission_dec = [action("get-submission")], _markSubmissionSpam_dec = [action("mark-submission-spam")], _markSubmissionHam_dec = [action("mark-submission-ham")], _deleteSubmission_dec = [action("delete-submission")], _listAllForms_dec = [action("list-all-forms")], _a) {
  constructor() {
    super(...arguments);
    __runInitializers(_init, 5, this);
  }
  getEntityName() {
    return `Form ${this.definition.name} on site ${this.definition.site_id}`;
  }
  /** Create or find a Netlify form */
  create() {
    const forms = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms`);
    const existingForm = forms.find((form) => form.name === this.definition.name);
    if (existingForm) {
      this.state = {
        id: existingForm.id,
        site_id: existingForm.site_id,
        name: existingForm.name,
        paths: existingForm.paths,
        submission_count: existingForm.submission_count,
        fields: existingForm.fields,
        created_at: existingForm.created_at,
        existing: true
      };
      cli.output(`Form ${this.definition.name} already exists on site ${this.definition.site_id}`);
      return;
    }
    throw new Error(`Form ${this.definition.name} not found on site ${this.definition.site_id}. Forms are created automatically when HTML forms are deployed.`);
  }
  update() {
    if (!this.state.id) {
      this.create();
      return;
    }
    cli.output("Forms are typically managed through HTML updates and redeploys");
  }
  delete() {
    if (!this.state.id) {
      cli.output("Form does not exist, nothing to delete");
      return;
    }
    this.deleteResource(`/sites/${this.definition.site_id}/forms/${this.state.id}`, "Form");
  }
  checkReadiness() {
    if (!this.state.id) {
      return false;
    }
    try {
      const form = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms/${this.state.id}`);
      return !!form.id;
    } catch (error) {
      return false;
    }
  }
  getForm() {
    if (!this.state.id) {
      throw new Error("Form does not exist");
    }
    const form = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms/${this.state.id}`);
    cli.output(`Form: ${form.name}`);
    cli.output(`ID: ${form.id}`);
    cli.output(`Site ID: ${form.site_id}`);
    cli.output(`Submission count: ${form.submission_count}`);
    cli.output(`Created: ${form.created_at}`);
    if (form.paths && form.paths.length > 0) {
      cli.output(`Paths: ${form.paths.join(", ")}`);
    }
    if (form.fields && form.fields.length > 0) {
      cli.output("Fields:");
      form.fields.forEach((field) => {
        cli.output(`  - ${field.name} (${field.type})`);
      });
    }
  }
  listSubmissions(args) {
    if (!this.state.id) {
      throw new Error("Form does not exist");
    }
    const page = args?.page || "1";
    const perPage = args?.per_page || "10";
    const state = args?.state || "verified";
    const submissions = this.makeRequest("GET", `/forms/${this.state.id}/submissions?page=${page}&per_page=${perPage}&state=${state}`);
    cli.output(`Submissions for form ${this.state.name} (${state}):`);
    submissions.forEach((submission, index) => {
      cli.output(`${index + 1}. ${submission.id} - ${submission.email || "No email"} - ${submission.created_at}`);
    });
  }
  getSubmission(args) {
    if (!this.state.id) {
      throw new Error("Form does not exist");
    }
    const submissionId = args?.submission_id;
    if (!submissionId) {
      throw new Error("submission_id argument is required");
    }
    const submission = this.makeRequest("GET", `/submissions/${submissionId}`);
    cli.output(`Submission: ${submission.id}`);
    cli.output(`Number: ${submission.number}`);
    cli.output(`Email: ${submission.email || "No email"}`);
    cli.output(`Name: ${submission.name || "No name"}`);
    cli.output(`Created: ${submission.created_at}`);
    if (submission.data) {
      cli.output("Data:");
      Object.entries(submission.data).forEach(([key, value]) => {
        cli.output(`  ${key}: ${value}`);
      });
    }
  }
  markSubmissionSpam(args) {
    if (!this.state.id) {
      throw new Error("Form does not exist");
    }
    const submissionId = args?.submission_id;
    if (!submissionId) {
      throw new Error("submission_id argument is required");
    }
    this.makeRequest("PUT", `/submissions/${submissionId}/spam`);
    cli.output(`\u2705 Marked submission ${submissionId} as spam`);
  }
  markSubmissionHam(args) {
    if (!this.state.id) {
      throw new Error("Form does not exist");
    }
    const submissionId = args?.submission_id;
    if (!submissionId) {
      throw new Error("submission_id argument is required");
    }
    this.makeRequest("PUT", `/submissions/${submissionId}/ham`);
    cli.output(`\u2705 Marked submission ${submissionId} as verified`);
  }
  deleteSubmission(args) {
    if (!this.state.id) {
      throw new Error("Form does not exist");
    }
    const submissionId = args?.submission_id;
    if (!submissionId) {
      throw new Error("submission_id argument is required");
    }
    this.makeRequest("DELETE", `/submissions/${submissionId}`);
    cli.output(`\u2705 Deleted submission ${submissionId}`);
  }
  listAllForms() {
    const forms = this.makeRequest("GET", `/sites/${this.definition.site_id}/forms`);
    cli.output(`Forms on site ${this.definition.site_id}:`);
    forms.forEach((form, index) => {
      cli.output(`${index + 1}. ${form.name} (${form.id}) - ${form.submission_count} submissions`);
    });
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "getForm", _getForm_dec, _Form);
__decorateElement(_init, 1, "listSubmissions", _listSubmissions_dec, _Form);
__decorateElement(_init, 1, "getSubmission", _getSubmission_dec, _Form);
__decorateElement(_init, 1, "markSubmissionSpam", _markSubmissionSpam_dec, _Form);
__decorateElement(_init, 1, "markSubmissionHam", _markSubmissionHam_dec, _Form);
__decorateElement(_init, 1, "deleteSubmission", _deleteSubmission_dec, _Form);
__decorateElement(_init, 1, "listAllForms", _listAllForms_dec, _Form);
__decoratorMetadata(_init, _Form);
__name(_Form, "Form");
var Form = _Form;



function main(def, state, ctx) {
  const entity = new Form(def, state, ctx);
  return entity.main(ctx);
}
