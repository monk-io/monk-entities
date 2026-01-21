/**
 * GCP Cloud SQL Database Entity
 *
 * Creates and manages databases within a Cloud SQL instance.
 *
 * @see https://cloud.google.com/sql/docs/postgres/create-manage-databases
 */

import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import helpers from "helpers";
import { CLOUD_SQL_API_URL } from "./common.ts";

/**
 * Cloud SQL Database entity definition
 * @interface CloudSqlDatabaseDefinition
 */
export interface CloudSqlDatabaseDefinition extends GcpEntityDefinition {
    /**
     * @description Name of the parent Cloud SQL instance
     */
    instance: string;

    /**
     * @description Name of the database to create
     */
    name: string;

    /**
     * @description Character set for the database (e.g., UTF8)
     */
    charset?: string;

    /**
     * @description Collation for the database
     */
    collation?: string;
}

/**
 * Cloud SQL Database entity state
 * @interface CloudSqlDatabaseState
 */
export interface CloudSqlDatabaseState extends GcpEntityState {
    /**
     * @description Name of the database
     */
    name?: string;

    /**
     * @description Self-link URL
     */
    self_link?: string;
}

/**
 * Cloud SQL Database entity
 *
 * Creates a database within an existing Cloud SQL instance.
 *
 * ## Secrets
 * This entity does NOT write any secrets.
 *
 * ## Dependencies
 * - **REQUIRED**: `gcp/cloud-sql-instance` - Must be created first
 * - Pass the instance name via `instance` field (from instance's `definition.name`)
 *
 * ## State Fields for Composition
 * The following state fields can be used by other entities:
 * - `state.name` - Database name for connection strings
 * - `state.self_link` - Full resource URL
 *
 * ## Definition Fields from Other Entities
 * - `instance` - Get from `gcp/cloud-sql-instance` entity's `definition.name`
 *
 * @see https://cloud.google.com/sql/docs/postgres/create-manage-databases
 *
 * @example Basic database
 * ```yaml
 * my-database:
 *   defines: gcp/cloud-sql-database
 *   instance: <- connection-target("instance") entity get-member("name")
 *   name: myapp_production
 *   connections:
 *     instance:
 *       runnable: gcp/cloud-sql-instance
 *       service: instance
 * ```
 *
 * @example Database with charset and collation
 * ```yaml
 * my-database:
 *   defines: gcp/cloud-sql-database
 *   instance: <- connection-target("instance") entity get-member("name")
 *   name: myapp_db
 *   charset: UTF8
 *   collation: en_US.UTF8
 *   connections:
 *     instance:
 *       runnable: gcp/cloud-sql-instance/my-instance
 *       service: instance
 * ```
 *
 * @example Full connection string composition
 * ```yaml
 * # In your application, compose connection string from:
 * # - Host: gcp/cloud-sql-instance state.address
 * # - Port: gcp/cloud-sql-instance state.port
 * # - Database: gcp/cloud-sql-database state.name
 * # - User: gcp/cloud-sql-user state.name
 * # - Password: from secret specified in gcp/cloud-sql-user password_secret
 * ```
 */
export class CloudSqlDatabase extends GcpEntity<CloudSqlDatabaseDefinition, CloudSqlDatabaseState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 20 };

    protected getEntityName(): string {
        return `Cloud SQL Database ${this.definition.name} on ${this.definition.instance}`;
    }

    /**
     * Get the API base URL for databases
     */
    private get apiUrl(): string {
        return `${CLOUD_SQL_API_URL}/projects/${this.projectId}/instances/${this.definition.instance}/databases`;
    }

    /**
     * Get database details from API
     */
    private getDatabase(): any | null {
        return this.checkResourceExists(`${this.apiUrl}/${this.definition.name}`);
    }

    override create(): void {
        // Check if database already exists
        const existing = this.getDatabase();

        if (existing) {
            cli.output(`Database ${this.definition.name} already exists on ${this.definition.instance}, adopting...`);
            this.state.existing = true;
            this.state.name = existing.name;
            this.state.self_link = existing.selfLink;
            return;
        }

        // Build database configuration
        const body: any = {
            name: this.definition.name,
        };

        if (this.definition.charset) {
            body.charset = this.definition.charset;
        }

        if (this.definition.collation) {
            body.collation = this.definition.collation;
        }

        cli.output(`Creating database ${this.definition.name} on instance ${this.definition.instance}`);

        // Retry logic for 409 (operation in progress) errors
        const maxRetries = 10;
        const retryDelayMs = 30000; // 30 seconds between retries
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = this.post(this.apiUrl, body);
                
                this.state.name = this.definition.name;
                this.state.operation_name = result.name;
                this.state.existing = false;

                cli.output(`Database creation started, operation: ${result.name}`);
                return;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                // Check if it's a 409 conflict (operation in progress)
                if (errorMessage.includes("409")) {
                    if (attempt < maxRetries) {
                        cli.output(`⏳ Another operation is in progress on the instance. Retrying in ${retryDelayMs / 1000}s... (attempt ${attempt}/${maxRetries})`);
                        helpers.sleep(retryDelayMs);
                        continue;
                    }
                }
                
                throw error;
            }
        }
    }

    override update(): void {
        // Databases can't really be updated, just verify it exists
        const existing = this.getDatabase();

        if (!existing) {
            cli.output("Database not found, creating...");
            this.create();
            return;
        }

        cli.output(`Database ${this.definition.name} exists`);
        this.state.name = existing.name;
        this.state.self_link = existing.selfLink;
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Database ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getDatabase();
        if (!existing) {
            cli.output(`Database ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting database ${this.definition.name} from instance ${this.definition.instance}`);
        this.httpDelete(`${this.apiUrl}/${this.definition.name}`);
        cli.output(`Database ${this.definition.name} deleted`);
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

        // Verify database exists
        const database = this.getDatabase();
        if (!database) {
            cli.output("Database not found");
            return false;
        }

        this.state.name = database.name;
        this.state.self_link = database.selfLink;

        cli.output(`Database ${this.definition.name} is ready`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getDatabase() !== null;
    }
}
