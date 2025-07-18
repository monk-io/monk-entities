
// Generated by MonkEC - targeting Goja runtime
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// input/mongodb-atlas/user.ts
const base = require("mongodb-atlas/base");
const MongoDBAtlasEntity = base.MongoDBAtlasEntity;
const secret = require("secret");
const cli = require("cli");
var _User = class _User extends MongoDBAtlasEntity {
  getEntityName() {
    return this.definition.name;
  }
  /** Create a new MongoDB Atlas database user */
  create() {
    const existingUser = this.getExistingUser();
    if (existingUser) {
      this.state = existingUser;
      return;
    }
    const password = this.getOrCreatePassword();
    const role = this.definition.role || "readWriteAnyDatabase";
    const body = {
      "username": this.definition.name,
      "databaseName": "admin",
      "password": password,
      "roles": [
        {
          "databaseName": "admin",
          "roleName": role
        }
      ]
    };
    const resObj = this.makeRequest("POST", `/groups/${this.definition.project_id}/databaseUsers`, body);
    this.state = {
      name: resObj.username,
      project_id: this.definition.project_id,
      database_name: resObj.databaseName,
      roles: resObj.roles
    };
  }
  /** Get existing user if it exists */
  getExistingUser() {
    const userData = this.checkResourceExists(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`);
    if (!userData || !userData.username) {
      return null;
    }
    return {
      name: userData.username,
      project_id: this.definition.project_id,
      database_name: userData.databaseName,
      roles: userData.roles,
      existing: true
    };
  }
  /** Get or create password for the user */
  getOrCreatePassword() {
    if (!this.definition.password_secret_ref) {
      throw new Error("Password secret reference not defined");
    }
    try {
      const storedPassword = secret.get(this.definition.password_secret_ref);
      if (!storedPassword) {
        throw new Error("Password not found");
      }
      return storedPassword;
    } catch (e) {
      const password = secret.randString(16);
      secret.set(this.definition.password_secret_ref, password);
      return password;
    }
  }
  update() {
    if (!this.state.name) {
      this.create();
      return;
    }
    const userData = this.checkResourceExists(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`);
    if (userData) {
      this.state = {
        ...this.state,
        name: userData.username,
        database_name: userData.databaseName,
        roles: userData.roles
      };
    }
  }
  delete() {
    if (!this.state.name) {
      cli.output("User does not exist, nothing to delete");
      return;
    }
    if (this.state.existing) {
      cli.output(`User ${this.definition.name} was pre-existing, not deleting`);
      return;
    }
    this.deleteResource(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`, "Database User");
  }
  /** Check if user is ready (exists and is active) */
  isReady() {
    if (!this.state.name) {
      return false;
    }
    const userData = this.checkResourceExists(`/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`);
    return userData && userData.username === this.definition.name;
  }
  /** Update user password */
  updatePassword(newPassword) {
    if (!this.state.name) {
      throw new Error("User does not exist, cannot update password");
    }
    const password = newPassword || secret.randString(16);
    const body = {
      "password": password
    };
    this.makeRequest("PATCH", `/groups/${this.definition.project_id}/databaseUsers/admin/${this.definition.name}`, body);
    secret.set(this.definition.password_secret_ref, password);
    cli.output(`Password updated for user: ${this.definition.name}`);
  }
  /** Get the current password for this user */
  getPassword() {
    try {
      const password = secret.get(this.definition.password_secret_ref);
      if (!password) {
        throw new Error("Password not found in secrets");
      }
      return password;
    } catch (e) {
      throw new Error(`Failed to retrieve password for user ${this.definition.name}: ${e instanceof Error ? e.message : "Unknown error"}`);
    }
  }
};
__name(_User, "User");
var User = _User;



function main(def, state, ctx) {
  const entity = new User(def, state, ctx);
  return entity.main(ctx);
}
