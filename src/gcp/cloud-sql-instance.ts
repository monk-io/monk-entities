/**
 * GCP Cloud SQL Instance Entity
 *
 * Creates and manages Google Cloud SQL database instances.
 * Supports PostgreSQL, MySQL, and SQL Server.
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { CLOUD_SQL_API_URL, getDefaultPort, DatabaseVersion } from "./common.ts";

/**
 * Cloud SQL Instance entity definition
 * @interface CloudSqlInstanceDefinition
 */
export interface CloudSqlInstanceDefinition extends GcpEntityDefinition {
    /**
     * @description Name of the Cloud SQL instance (must be unique within the project)
     */
    name: string;

    /**
     * @description Database version
     * @default POSTGRES_14
     */
    database_version?: DatabaseVersion;

    /**
     * @description Machine tier for the instance
     * @default db-f1-micro
     */
    tier?: string;

    /**
     * @description GCP region for the instance
     * @default us-central1
     */
    region?: string;

    /**
     * @description Allow connections from any IP address (0.0.0.0/0) - use with caution
     * @default false
     */
    allow_all?: boolean;

    /**
     * @description Root password for the instance (optional, generates random if not provided)
     */
    root_password?: string;

    /**
     * @description Enable deletion protection
     * @default false
     */
    deletion_protection?: boolean;

    /**
     * @description Storage type (PD_SSD or PD_HDD)
     * @default PD_SSD
     */
    storage_type?: string;

    /**
     * @description Initial storage size in GB
     * @default 10
     */
    storage_size_gb?: number;

    /**
     * @description Enable storage auto-resize
     * @default true
     */
    storage_auto_resize?: boolean;

    /**
     * @description Enable binary logging (for MySQL replication)
     * @default false
     */
    binary_log_enabled?: boolean;

    /**
     * @description Enable point-in-time recovery
     * @default false
     */
    point_in_time_recovery_enabled?: boolean;

    /**
     * @description Backup start time in HH:MM format (24-hour)
     */
    backup_start_time?: string;

    /**
     * @description Availability type (ZONAL or REGIONAL)
     * @default ZONAL
     */
    availability_type?: string;
}

/**
 * Cloud SQL Instance entity state
 * @interface CloudSqlInstanceState
 */
export interface CloudSqlInstanceState extends GcpEntityState {
    /**
     * @description Public IP address of the instance
     */
    address?: string;

    /**
     * @description Database port
     */
    port?: number;

    /**
     * @description Instance connection name (project:region:instance)
     */
    connection_name?: string;

    /**
     * @description Instance self-link URL
     */
    self_link?: string;

    /**
     * @description Instance state (RUNNABLE, SUSPENDED, etc.)
     */
    instance_state?: string;

    /**
     * @description Database version that was created
     */
    database_version?: string;
}

/**
 * Cloud SQL Instance entity
 *
 * Creates and manages Google Cloud SQL database instances (PostgreSQL, MySQL, SQL Server).
 *
 * ## Secrets
 * This entity does NOT write any secrets.
 *
 * ## Dependencies
 * - Requires `sqladmin.googleapis.com` API to be enabled (use `gcp/service-usage` entity)
 *
 * ## State Fields for Composition
 * The following state fields can be used by other entities:
 * - `state.address` - Public IP address for database connections
 * - `state.port` - Database port (5432 for PostgreSQL, 3306 for MySQL, 1433 for SQL Server)
 * - `state.connection_name` - Instance connection name for Cloud SQL Proxy (format: project:region:instance)
 * - `state.database_version` - The database engine version
 *
 * ## Composing with Other Entities
 * This entity is typically composed with:
 * - `gcp/cloud-sql-database` - Pass `definition.name` to its `instance` field
 * - `gcp/cloud-sql-user` - Pass `definition.name` to its `instance` field
 *
 * @see https://cloud.google.com/sql/docs/postgres/create-instance
 *
 * @example Basic PostgreSQL instance
 * ```yaml
 * my-postgres:
 *   defines: gcp/cloud-sql-instance
 *   name: my-postgres-instance
 *   database_version: POSTGRES_14
 *   tier: db-f1-micro
 *   region: us-central1
 *   allow_all: true
 * ```
 *
 * @example Full stack with database and user
 * ```yaml
 * # Enable the Cloud SQL API first
 * enable-sql-api:
 *   defines: gcp/service-usage
 *   name: sqladmin.googleapis.com
 *
 * # Create the instance
 * my-instance:
 *   defines: gcp/cloud-sql-instance
 *   name: my-postgres
 *   database_version: POSTGRES_15
 *   tier: db-custom-2-4096
 *   region: us-central1
 *   depends:
 *     wait-for:
 *       runnables:
 *         - gcp/service-usage/enable-sql-api
 *       timeout: 300
 *
 * # Create a database (uses instance name)
 * my-database:
 *   defines: gcp/cloud-sql-database
 *   instance: <- connection-target("instance") entity get-member("name")
 *   name: myapp_db
 *   connections:
 *     instance:
 *       runnable: gcp/cloud-sql-instance/my-instance
 *       service: instance
 *
 * # Create a user (uses instance name, writes password to secret)
 * my-user:
 *   defines: gcp/cloud-sql-user
 *   instance: <- connection-target("instance") entity get-member("name")
 *   name: app_user
 *   password_secret: db-password
 *   permitted-secrets:
 *     db-password: true
 *   connections:
 *     instance:
 *       runnable: gcp/cloud-sql-instance/my-instance
 *       service: instance
 * ```
 */
export class CloudSqlInstance extends GcpEntity<CloudSqlInstanceDefinition, CloudSqlInstanceState> {

    static readonly readiness = { period: 15, initialDelay: 10, attempts: 80 };

    protected getEntityName(): string {
        return `Cloud SQL Instance ${this.definition.name}`;
    }

    /**
     * Get the API base URL for this project
     */
    private get apiUrl(): string {
        return `${CLOUD_SQL_API_URL}/projects/${this.projectId}`;
    }

    /**
     * Get instance details from API
     */
    private getInstance(): any | null {
        return this.checkResourceExists(`${this.apiUrl}/instances/${this.definition.name}`);
    }

    /**
     * Extract primary IP address from instance data
     */
    private getAddress(instance: any): string {
        if (!instance.ipAddresses) {
            return "";
        }

        for (const ip of instance.ipAddresses) {
            if (ip.type === "PRIMARY") {
                return ip.ipAddress;
            }
        }

        return "";
    }

    override create(): void {
        // Check if instance already exists
        const existing = this.getInstance();

        if (existing) {
            cli.output(`Cloud SQL instance ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.state.address = this.getAddress(existing);
            this.state.port = getDefaultPort(existing.databaseVersion || "POSTGRES_14");
            this.state.connection_name = existing.connectionName;
            this.state.self_link = existing.selfLink;
            this.state.instance_state = existing.state;
            this.state.database_version = existing.databaseVersion;
            return;
        }

        // Build instance configuration
        const databaseVersion = this.definition.database_version || "POSTGRES_14";
        const region = this.definition.region || "us-central1";
        const tier = this.definition.tier || "db-f1-micro";

        const body: any = {
            name: this.definition.name,
            databaseVersion: databaseVersion,
            region: region,
            settings: {
                tier: tier,
                storageAutoResize: this.definition.storage_auto_resize !== false,
                dataDiskType: this.definition.storage_type || "PD_SSD",
                dataDiskSizeGb: this.definition.storage_size_gb?.toString() || "10",
                availabilityType: this.definition.availability_type || "ZONAL",
                deletionProtectionEnabled: this.definition.deletion_protection || false,
            },
        };

        // Configure IP settings
        if (this.definition.allow_all) {
            body.settings.ipConfiguration = {
                authorizedNetworks: [
                    { name: "allow-all", value: "0.0.0.0/0" }
                ],
                ipv4Enabled: true,
            };
        } else {
            body.settings.ipConfiguration = {
                ipv4Enabled: true,
            };
        }

        // Configure backup settings
        if (this.definition.backup_start_time) {
            body.settings.backupConfiguration = {
                enabled: true,
                startTime: this.definition.backup_start_time,
                pointInTimeRecoveryEnabled: this.definition.point_in_time_recovery_enabled || false,
            };

            if (databaseVersion.includes("MYSQL") && this.definition.binary_log_enabled) {
                body.settings.backupConfiguration.binaryLogEnabled = true;
            }
        }

        // Set root password if provided
        if (this.definition.root_password) {
            body.rootPassword = this.definition.root_password;
        }

        cli.output(`Creating Cloud SQL instance: ${this.definition.name}`);
        cli.output(`Database version: ${databaseVersion}, Tier: ${tier}, Region: ${region}`);

        const result = this.post(`${this.apiUrl}/instances`, body);

        // Store operation for readiness tracking
        this.state.operation_name = result.name;
        this.state.port = getDefaultPort(databaseVersion);
        this.state.database_version = databaseVersion;
        this.state.existing = false;

        cli.output(`Instance creation started, operation: ${result.name}`);
    }

    override update(): void {
        if (!this.state.address) {
            // Instance doesn't exist, create it
            this.create();
            return;
        }

        cli.output(`Cloud SQL instance ${this.definition.name} update requested`);

        // Check if instance exists
        const existing = this.getInstance();
        if (!existing) {
            cli.output("Instance not found, recreating...");
            this.create();
            return;
        }

        // Update settings that can be changed
        const body: any = {
            settings: {
                tier: this.definition.tier || existing.settings?.tier,
                deletionProtectionEnabled: this.definition.deletion_protection,
            },
        };

        if (this.definition.allow_all !== undefined) {
            if (this.definition.allow_all) {
                body.settings.ipConfiguration = {
                    authorizedNetworks: [
                        { name: "allow-all", value: "0.0.0.0/0" }
                    ],
                    ipv4Enabled: true,
                };
            } else {
                body.settings.ipConfiguration = {
                    authorizedNetworks: [],
                    ipv4Enabled: true,
                };
            }
        }

        const result = this.patch(`${this.apiUrl}/instances/${this.definition.name}`, body);
        this.state.operation_name = result.name;

        cli.output(`Instance update started, operation: ${result.name}`);
    }

    override delete(): void {
        if (this.state.existing) {
            cli.output(`Instance ${this.definition.name} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getInstance();
        if (!existing) {
            cli.output(`Instance ${this.definition.name} does not exist`);
            return;
        }

        cli.output(`Deleting Cloud SQL instance: ${this.definition.name}`);
        this.httpDelete(`${this.apiUrl}/instances/${this.definition.name}`);
        cli.output(`Instance ${this.definition.name} deletion started`);
    }

    override checkReadiness(): boolean {
        // Check operation status if we have one pending
        if (this.state.operation_name) {
            const operationUrl = `${this.apiUrl}/operations/${this.state.operation_name}`;

            try {
                const operation = this.get(operationUrl);

                if (operation.status === "DONE") {
                    if (operation.error) {
                        cli.output(`Operation failed: ${JSON.stringify(operation.error)}`);
                        return false;
                    }
                    cli.output("Operation completed successfully");
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

        // Get instance details
        const instance = this.getInstance();
        if (!instance) {
            cli.output("Instance not found");
            return false;
        }

        // Check instance state
        if (instance.state !== "RUNNABLE") {
            cli.output(`Instance state: ${instance.state}`);
            return false;
        }

        // Check for IP address
        const address = this.getAddress(instance);
        if (!address) {
            cli.output("Instance has no IP address yet");
            return false;
        }

        // Update state
        this.state.address = address;
        this.state.connection_name = instance.connectionName;
        this.state.self_link = instance.selfLink;
        this.state.instance_state = instance.state;

        cli.output(`Instance ready at ${address}:${this.state.port}`);
        return true;
    }

    checkLiveness(): boolean {
        const instance = this.getInstance();
        return instance?.state === "RUNNABLE";
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error("Instance not found");
        }
        cli.output(JSON.stringify(instance, null, 2));
    }

    @action("restart")
    restart(_args?: Args): void {
        cli.output(`Restarting instance: ${this.definition.name}`);
        this.post(`${this.apiUrl}/instances/${this.definition.name}/restart`);
        cli.output("Restart initiated");
    }

    @action("stop")
    stopInstance(_args?: Args): void {
        cli.output(`Stopping instance: ${this.definition.name}`);

        const body = {
            settings: {
                activationPolicy: "NEVER",
            },
        };

        this.patch(`${this.apiUrl}/instances/${this.definition.name}`, body);
        cli.output("Stop initiated");
    }

    @action("start")
    startInstance(_args?: Args): void {
        cli.output(`Starting instance: ${this.definition.name}`);

        const body = {
            settings: {
                activationPolicy: "ALWAYS",
            },
        };

        this.patch(`${this.apiUrl}/instances/${this.definition.name}`, body);
        cli.output("Start initiated");
    }
}
