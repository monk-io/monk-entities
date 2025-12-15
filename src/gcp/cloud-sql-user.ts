/**
 * GCP Cloud SQL User Entity
 *
 * Creates and manages database users within a Cloud SQL instance.
 *
 * @see https://cloud.google.com/sql/docs/postgres/create-manage-users
 */

import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import secret from "secret";
import cli from "cli";
import { CLOUD_SQL_API_URL } from "./common.ts";

/**
 * Cloud SQL User entity definition
 * @interface CloudSqlUserDefinition
 */
export interface CloudSqlUserDefinition extends GcpEntityDefinition {
    /**
     * @description Name of the parent Cloud SQL instance
     */
    instance: string;

    /**
     * @description Username for the database user
     */
    name: string;

    /**
     * @description Secret reference name to store/retrieve the password
     */
    password_secret: string;

    /**
     * @description Host restriction for the user (MySQL only, % for any host)
     */
    host?: string;

    /**
     * @description User type (BUILT_IN, CLOUD_IAM_USER, CLOUD_IAM_SERVICE_ACCOUNT)
     * @default BUILT_IN
     */
    type?: string;
}

/**
 * Cloud SQL User entity state
 * @interface CloudSqlUserState
 */
export interface CloudSqlUserState extends GcpEntityState {
    /**
     * @description Username
     */
    name?: string;

    /**
     * @description Host restriction
     */
    host?: string;
}

/**
 * Cloud SQL User entity
 *
 * Creates a database user within an existing Cloud SQL instance.
 * Generates a secure random password and stores it in Monk secrets.
 *
 * ## Secrets
 * **⚠️ WRITES SECRETS** - This entity writes the database password to a Monk secret.
 * You MUST add `permitted-secrets` to allow the entity to write the password:
 * ```yaml
 * permitted-secrets:
 *   <password_secret>: true
 * ```
 * The secret name is specified in the `password_secret` definition field.
 * If the secret already contains a password, it will be used; otherwise a new
 * 16-character random password is generated and stored.
 *
 * ## Dependencies
 * - **REQUIRED**: `gcp/cloud-sql-instance` - Must be created first
 * - Pass the instance name via `instance` field (from instance's `definition.name`)
 *
 * ## State Fields for Composition
 * The following state fields can be used by other entities:
 * - `state.name` - Username for database connections
 * - `state.host` - Host restriction (MySQL only, typically "%")
 *
 * ## Definition Fields from Other Entities
 * - `instance` - Get from `gcp/cloud-sql-instance` entity's `definition.name`
 *
 * ## Credentials for Applications
 * To connect to the database, your application needs:
 * - Host: from `gcp/cloud-sql-instance` `state.address`
 * - Port: from `gcp/cloud-sql-instance` `state.port`
 * - Database: from `gcp/cloud-sql-database` `state.name`
 * - Username: from this entity's `state.name`
 * - Password: from Monk secret specified in `password_secret`
 *
 * @see https://cloud.google.com/sql/docs/postgres/create-manage-users
 *
 * @example Basic user with auto-generated password
 * ```yaml
 * my-user:
 *   defines: gcp/cloud-sql-user
 *   instance: <- connection-target("instance") entity get-member("name")
 *   name: app_user
 *   password_secret: my-db-password
 *   permitted-secrets:
 *     my-db-password: true
 *   connections:
 *     instance:
 *       runnable: gcp/cloud-sql-instance
 *       service: instance
 * ```
 *
 * @example MySQL user with host restriction
 * ```yaml
 * mysql-user:
 *   defines: gcp/cloud-sql-user
 *   instance: <- connection-target("instance") entity get-member("name")
 *   name: webapp
 *   host: "%"
 *   password_secret: mysql-app-password
 *   permitted-secrets:
 *     mysql-app-password: true
 *   connections:
 *     instance:
 *       runnable: gcp/cloud-sql-instance/my-mysql
 *       service: instance
 * ```
 *
 * @example IAM-authenticated user (no password needed)
 * ```yaml
 * iam-user:
 *   defines: gcp/cloud-sql-user
 *   instance: <- connection-target("instance") entity get-member("name")
 *   name: my-service-account@my-project.iam.gserviceaccount.com
 *   type: CLOUD_IAM_SERVICE_ACCOUNT
 *   password_secret: unused-placeholder
 *   permitted-secrets:
 *     unused-placeholder: true
 *   connections:
 *     instance:
 *       runnable: gcp/cloud-sql-instance/my-instance
 *       service: instance
 * ```
 */
export class CloudSqlUser extends GcpEntity<CloudSqlUserDefinition, CloudSqlUserState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 20 };

    protected getEntityName(): string {
        return `Cloud SQL User ${this.definition.name} on ${this.definition.instance}`;
    }

    /**
     * Get the API base URL for users
     */
    private get apiUrl(): string {
        return `${CLOUD_SQL_API_URL}/projects/${this.projectId}/instances/${this.definition.instance}/users`;
    }

    /**
     * Get user details from API
     */
    private getUser(): any | null {
        // Users API requires name as query parameter
        const host = this.definition.host || "%";
        const url = `${this.apiUrl}?name=${encodeURIComponent(this.definition.name)}&host=${encodeURIComponent(host)}`;

        try {
            const response = this.get(url);
            // The API returns a list, find our user
            if (response.items) {
                for (const user of response.items) {
                    if (user.name === this.definition.name) {
                        return user;
                    }
                }
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get or generate password from secret
     */
    private getOrGeneratePassword(): string {
        try {
            const password = secret.get(this.definition.password_secret);
            if (password) {
                return password;
            }
        } catch {
            // Secret doesn't exist, will generate
        }

        // Generate a secure random password
        const newPassword = secret.randString(16);
        secret.set(this.definition.password_secret, newPassword);
        cli.output(`Generated new password and stored in secret: ${this.definition.password_secret}`);

        return newPassword;
    }

    override create(): void {
        // Check if user already exists
        const existing = this.getUser();

        if (existing) {
            cli.output(`User ${this.definition.name} already exists on ${this.definition.instance}, adopting...`);
            this.state.existing = true;
            this.state.name = existing.name;
            this.state.host = existing.host;
            return;
        }

        // Get or generate password
        const password = this.getOrGeneratePassword();

        // Build user configuration
        const body: any = {
            name: this.definition.name,
            password: password,
        };

        if (this.definition.host) {
            body.host = this.definition.host;
        }

        if (this.definition.type) {
            body.type = this.definition.type;
        }

        cli.output(`Creating user ${this.definition.name} on instance ${this.definition.instance}`);

        const result = this.post(this.apiUrl, body);

        this.state.name = this.definition.name;
        this.state.host = this.definition.host;
        this.state.operation_name = result.name;
        this.state.existing = false;

        cli.output(`User creation started`);
    }

    override update(): void {
        // Check if user exists
        const existing = this.getUser();

        if (!existing) {
            cli.output("User not found, creating...");
            this.create();
            return;
        }

        // Update password if the secret exists
        try {
            const password = secret.get(this.definition.password_secret);
            if (password) {
                const body = {
                    password: password,
                };

                const host = this.definition.host || "%";
                const url = `${this.apiUrl}?name=${encodeURIComponent(this.definition.name)}&host=${encodeURIComponent(host)}`;

                this.put(url, body);
                cli.output(`User ${this.definition.name} password updated`);
            }
        } catch {
            cli.output("No password update needed");
        }

        this.state.name = existing.name;
        this.state.host = existing.host;
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`User ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getUser();
        if (!existing) {
            cli.output(`User ${this.definition.name} does not exist`);
            return;
        }

        const host = this.definition.host || "%";
        const url = `${this.apiUrl}?name=${encodeURIComponent(this.definition.name)}&host=${encodeURIComponent(host)}`;

        cli.output(`Deleting user ${this.definition.name} from instance ${this.definition.instance}`);
        this.httpDelete(url);

        // Clean up the secret
        try {
            secret.remove(this.definition.password_secret);
            cli.output(`Removed secret: ${this.definition.password_secret}`);
        } catch {
            // Secret might not exist
        }

        cli.output(`User ${this.definition.name} deleted`);
    }

    override checkReadiness(): boolean {
        // Check operation status if we have one pending
        if (this.state.operation_name) {
            const operationUrl = `${CLOUD_SQL_API_URL}/projects/${this.projectId}/operations/${this.state.operation_name}`;

            try {
                const operation = this.get(operationUrl);

                if (operation.status === "DONE") {
                    if (operation.error) {
                        cli.output(`Operation failed: ${JSON.stringify(operation.error)}`);
                        return false;
                    }
                    this.state.operation_name = undefined;
                } else {
                    cli.output(`Operation status: ${operation.status}`);
                    return false;
                }
            } catch (error) {
                cli.output(`Error checking operation: ${error}`);
                return false;
            }
        }

        // Verify user exists
        const user = this.getUser();
        if (!user) {
            cli.output("User not found");
            return false;
        }

        this.state.name = user.name;
        this.state.host = user.host;

        cli.output(`User ${this.definition.name} is ready`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getUser() !== null;
    }
}
