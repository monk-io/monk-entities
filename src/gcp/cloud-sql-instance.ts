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

    /**
     * @description Cloud SQL edition. ENTERPRISE is standard, ENTERPRISE_PLUS offers
     * enhanced performance. Note: ENTERPRISE_PLUS requires compatible tiers (db-perf-optimized-*).
     * @default ENTERPRISE
     */
    edition?: "ENTERPRISE" | "ENTERPRISE_PLUS";
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

        // Determine edition - default to ENTERPRISE to avoid tier compatibility issues
        const edition = this.definition.edition || "ENTERPRISE";

        // Validate tier compatibility with edition
        // Enterprise Plus supports: db-perf-optimized-N-* (N2) and db-c4a-highmem-* (C4A Axion)
        const isEnterprisePlusTier = tier.startsWith("db-perf-optimized-") || tier.startsWith("db-c4a-highmem-");
        if (edition === "ENTERPRISE_PLUS" && !isEnterprisePlusTier) {
            throw new Error(
                `Invalid tier '${tier}' for ENTERPRISE_PLUS edition. ` +
                `Enterprise Plus requires 'db-perf-optimized-N-*' (e.g., db-perf-optimized-N-2) or ` +
                `'db-c4a-highmem-*' (e.g., db-c4a-highmem-2) tiers. ` +
                `Use edition: ENTERPRISE for standard tiers like db-f1-micro or db-custom-*.`
            );
        }

        const body: any = {
            name: this.definition.name,
            databaseVersion: databaseVersion,
            region: region,
            settings: {
                tier: tier,
                edition: edition,
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
        cli.output(`Database version: ${databaseVersion}, Tier: ${tier}, Region: ${region}, Edition: ${edition}`);

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

    // =========================================================================
    // Backup & Restore Interface
    // =========================================================================

    /**
     * Get backup configuration and status information for the Cloud SQL instance
     *
     * Shows current backup settings including automated backup configuration,
     * backup window, and point-in-time recovery status.
     *
     * Usage:
     * - monk do namespace/instance get-backup-info
     */
    @action("get-backup-info")
    getBackupInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Backup Information for Cloud SQL instance`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`==================================================`);

        const instance = this.getInstance();
        if (!instance) {
            throw new Error(`Instance ${this.definition.name} not found`);
        }

        const settings = instance.settings || {};
        const backupConfig = settings.backupConfiguration || {};

        cli.output(`\n🔧 Backup Configuration:`);
        cli.output(`   Automated Backups: ${backupConfig.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        cli.output(`   Backup Start Time: ${backupConfig.startTime || 'Not set'}`);
        cli.output(`   Point-in-Time Recovery: ${backupConfig.pointInTimeRecoveryEnabled ? '✅ Enabled' : '❌ Disabled'}`);

        if (backupConfig.binaryLogEnabled !== undefined) {
            cli.output(`   Binary Logging: ${backupConfig.binaryLogEnabled ? '✅ Enabled' : '❌ Disabled'}`);
        }

        cli.output(`   Backup Location: ${backupConfig.location || 'Default'}`);
        cli.output(`   Transaction Log Retention: ${backupConfig.transactionLogRetentionDays || 7} days`);
        cli.output(`   Backup Retention: ${backupConfig.backupRetentionSettings?.retainedBackups || 7} backups`);

        if (!backupConfig.enabled) {
            cli.output(`\n⚠️  Note: Set backup_start_time in definition to enable automated backups`);
        }

        cli.output(`\n📋 To create an on-demand backup:`);
        cli.output(`   monk do namespace/instance create-backup`);
        cli.output(`\n📋 To list all backups:`);
        cli.output(`   monk do namespace/instance list-backups`);
        cli.output(`\n==================================================`);
    }

    /**
     * Create an on-demand backup of the Cloud SQL instance
     *
     * Creates a manual backup that persists until explicitly deleted.
     * Automated backups are separate and controlled by backup_start_time.
     *
     * Usage:
     * - monk do namespace/instance create-backup
     * - monk do namespace/instance create-backup description="Pre-migration backup"
     *
     * @param args Optional arguments:
     *   - description: Description for the backup
     */
    @action("create-backup")
    createBackup(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Creating on-demand backup for Cloud SQL instance`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`==================================================`);

        const instance = this.getInstance();
        if (!instance) {
            throw new Error(`Instance ${this.definition.name} not found`);
        }

        const description = args?.description as string || `On-demand backup at ${new Date().toISOString()}`;
        cli.output(`Description: ${description}`);

        const body: any = {
            instance: this.definition.name,
        };

        if (description) {
            body.description = description;
        }

        try {
            const result = this.post(`${this.apiUrl}/instances/${this.definition.name}/backupRuns`, body);

            cli.output(`\n✅ Backup creation initiated successfully!`);
            cli.output(`Operation: ${result.name}`);
            cli.output(`Status: ${result.status || 'PENDING'}`);
            cli.output(`\n📋 Note: Backup creation may take several minutes.`);
            cli.output(`Use 'monk do namespace/instance list-backups' to check status.`);
            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to create backup`);
            throw new Error(`Backup creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all available backups for this Cloud SQL instance
     *
     * Shows both automated and on-demand backups.
     * Use this to find backup IDs for restore operations.
     *
     * Usage:
     * - monk do namespace/instance list-backups
     * - monk do namespace/instance list-backups limit=20
     *
     * @param args Optional arguments:
     *   - limit: Maximum number of backups to display (default: 10)
     */
    @action("list-backups")
    listBackups(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Listing backups for Cloud SQL instance`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`==================================================`);

        const limit = Number(args?.limit) || 10;

        try {
            const response = this.get(`${this.apiUrl}/instances/${this.definition.name}/backupRuns`);
            const backups = response.items || [];

            cli.output(`\nTotal backups found: ${backups.length}`);
            cli.output(`Showing: ${Math.min(backups.length, limit)} backup(s)\n`);

            if (backups.length === 0) {
                cli.output(`No backups found for this instance.`);
                cli.output(`Create a backup using: monk do namespace/instance create-backup`);
            } else {
                const displayBackups = backups.slice(0, limit);

                for (let i = 0; i < displayBackups.length; i++) {
                    const backup = displayBackups[i];
                    const statusIcon = this.getBackupStatusIcon(backup.status);

                    cli.output(`${statusIcon} Backup #${i + 1}`);
                    cli.output(`   ID: ${backup.id}`);
                    cli.output(`   Status: ${backup.status || 'unknown'}`);
                    cli.output(`   Type: ${backup.type || 'AUTOMATED'}`);
                    cli.output(`   Start Time: ${backup.startTime || 'N/A'}`);
                    cli.output(`   End Time: ${backup.endTime || 'In progress'}`);
                    cli.output(`   Location: ${backup.location || 'N/A'}`);

                    if (backup.description) {
                        cli.output(`   Description: ${backup.description}`);
                    }

                    if (backup.error) {
                        cli.output(`   Error: ${backup.error.message || 'Unknown error'}`);
                    }

                    cli.output(``);
                }

                if (backups.length > limit) {
                    cli.output(`... and ${backups.length - limit} more backup(s)`);
                    cli.output(`Increase limit with: monk do namespace/instance list-backups limit=${backups.length}`);
                }
            }

            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to list backups`);
            throw new Error(`List backups failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get detailed information about a specific backup
     *
     * Usage:
     * - monk do namespace/instance describe-backup backup_id="123456789"
     *
     * @param args Required arguments:
     *   - backup_id: The backup run ID to describe
     */
    @action("describe-backup")
    describeBackup(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📸 Backup Details`);
        cli.output(`==================================================`);

        const backupId = args?.backup_id as string | undefined;
        if (!backupId) {
            throw new Error(
                "'backup_id' is required.\n" +
                "Usage: monk do namespace/instance describe-backup backup_id=\"123456789\"\n" +
                "\nTo find backup IDs, run: monk do namespace/instance list-backups"
            );
        }

        try {
            const backup = this.get(`${this.apiUrl}/instances/${this.definition.name}/backupRuns/${backupId}`);
            const statusIcon = this.getBackupStatusIcon(backup.status);

            cli.output(`\n${statusIcon} Backup Information`);
            cli.output(`--------------------------------------------------`);
            cli.output(`ID: ${backup.id}`);
            cli.output(`Instance: ${backup.instance}`);
            cli.output(`Status: ${backup.status}`);
            cli.output(`Type: ${backup.type || 'AUTOMATED'}`);
            cli.output(`Backup Kind: ${backup.backupKind || 'SNAPSHOT'}`);
            cli.output(`Start Time: ${backup.startTime || 'N/A'}`);
            cli.output(`End Time: ${backup.endTime || 'In progress'}`);
            cli.output(`Enqueued Time: ${backup.enqueuedTime || 'N/A'}`);
            cli.output(`Location: ${backup.location || 'N/A'}`);
            cli.output(`Database Version: ${backup.databaseVersion || 'N/A'}`);

            if (backup.description) {
                cli.output(`Description: ${backup.description}`);
            }

            if (backup.windowStartTime) {
                cli.output(`Window Start: ${backup.windowStartTime}`);
            }

            if (backup.error) {
                cli.output(`\n❌ Error: ${backup.error.message || JSON.stringify(backup.error)}`);
            }

            if (backup.status === 'SUCCESSFUL') {
                cli.output(`\n📋 To restore from this backup:`);
                cli.output(`   monk do namespace/instance restore backup_id="${backupId}"`);
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get backup details`);
            throw new Error(`Describe backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete a backup
     *
     * ⚠️ WARNING: This permanently deletes the backup. This action cannot be undone.
     *
     * Usage:
     * - monk do namespace/instance delete-backup backup_id="123456789"
     *
     * @param args Required arguments:
     *   - backup_id: The backup run ID to delete
     */
    @action("delete-backup")
    deleteBackup(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🗑️ DELETE BACKUP - READ CAREFULLY!`);
        cli.output(`==================================================`);

        const backupId = args?.backup_id as string | undefined;
        if (!backupId) {
            throw new Error(
                "'backup_id' is required.\n" +
                "Usage: monk do namespace/instance delete-backup backup_id=\"123456789\"\n" +
                "\nTo find backup IDs, run: monk do namespace/instance list-backups"
            );
        }

        try {
            // First verify the backup exists
            const backup = this.get(`${this.apiUrl}/instances/${this.definition.name}/backupRuns/${backupId}`);

            cli.output(`\n⚠️  WARNING: This will permanently delete the backup!`);
            cli.output(`   Backup ID: ${backupId}`);
            cli.output(`   Type: ${backup.type || 'AUTOMATED'}`);
            cli.output(`   Start Time: ${backup.startTime || 'N/A'}`);
            cli.output(`--------------------------------------------------`);

            // Delete the backup
            this.httpDelete(`${this.apiUrl}/instances/${this.definition.name}/backupRuns/${backupId}`);

            cli.output(`\n✅ Backup deletion initiated successfully!`);
            cli.output(`   Backup ID: ${backupId}`);
            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to delete backup`);
            throw new Error(`Delete backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Restore the Cloud SQL instance from a backup
     *
     * ⚠️ WARNING: This will OVERWRITE all data in the target instance!
     * The instance will restart during the restore operation.
     *
     * Usage:
     * - monk do namespace/instance restore backup_id="123456789"
     * - monk do namespace/instance restore backup_id="123456789" target_instance="other-instance"
     * - monk do namespace/instance restore backup_id="123456789" target_project="other-project"
     *
     * @param args Required/Optional arguments:
     *   - backup_id: ID of the backup to restore from (required)
     *   - target_instance: Target instance to restore to (default: current instance)
     *   - target_project: Target project for the restore (default: current project)
     */
    @action("restore")
    restoreBackup(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`⚠️  RESTORE OPERATION - READ CAREFULLY!`);
        cli.output(`==================================================`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Project: ${this.projectId}`);

        const backupId = args?.backup_id as string | undefined;
        if (!backupId) {
            throw new Error(
                "'backup_id' is required.\n" +
                "Usage: monk do namespace/instance restore backup_id=\"123456789\"\n" +
                "\nTo find backup IDs, run: monk do namespace/instance list-backups"
            );
        }

        const targetInstance = (args?.target_instance as string) || this.definition.name;
        const targetProject = (args?.target_project as string) || this.projectId;

        // Show warnings
        cli.output(`\n⚠️  WARNING: This operation will:`);
        cli.output(`   - OVERWRITE ALL DATA in instance '${targetInstance}'`);
        cli.output(`   - RESTART the target instance`);
        cli.output(`   - May take several minutes to complete`);

        cli.output(`\nRestoring from Backup ID: ${backupId}`);
        cli.output(`Target Instance: ${targetInstance}`);
        cli.output(`Target Project: ${targetProject}`);
        cli.output(`--------------------------------------------------`);

        const body = {
            restoreBackupContext: {
                kind: "sql#restoreBackupContext",
                backupRunId: parseInt(backupId, 10),
                instanceId: this.definition.name,
                project: this.projectId,
            },
        };

        try {
            const result = this.post(
                `https://sqladmin.googleapis.com/v1/projects/${targetProject}/instances/${targetInstance}/restoreBackup`,
                body
            );

            cli.output(`\n✅ Restore operation initiated successfully!`);
            cli.output(`Operation: ${result.name}`);
            cli.output(`Status: ${result.status || 'PENDING'}`);
            cli.output(`\n⏳ The instance is being restored. This may take several minutes.`);
            cli.output(`   The instance will restart during this process.`);
            cli.output(`\n📋 To check restore progress:`);
            cli.output(`   monk do namespace/instance get-restore-status operation_name="${result.name}"`);
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to restore from backup`);
            throw new Error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check the status of a restore operation
     *
     * Usage:
     * - monk do namespace/instance get-restore-status operation_name="operation-id"
     *
     * @param args Required arguments:
     *   - operation_name: The operation name returned from restore
     */
    @action("get-restore-status")
    getRestoreStatus(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🔄 RESTORE STATUS CHECK`);
        cli.output(`==================================================`);

        const operationName = args?.operation_name as string | undefined;
        if (!operationName) {
            // If no operation name, check instance status
            cli.output(`Checking instance status: ${this.definition.name}`);

            const instance = this.getInstance();
            if (!instance) {
                throw new Error(`Instance ${this.definition.name} not found`);
            }

            cli.output(`\n📋 Instance Status`);
            cli.output(`   State: ${this.getRestoreStatusIcon(instance.state)} ${instance.state}`);
            cli.output(`   Database Version: ${instance.databaseVersion}`);

            if (instance.state === 'RUNNABLE') {
                cli.output(`\n✅ Instance is ready and available!`);
            } else {
                cli.output(`\n⏳ Instance is still processing...`);
            }

            cli.output(`\n==================================================`);
            return;
        }

        cli.output(`Operation: ${operationName}`);
        cli.output(`--------------------------------------------------`);

        try {
            const operation = this.get(`${this.apiUrl}/operations/${operationName}`);

            cli.output(`\n📋 Operation Details`);
            cli.output(`   Name: ${operation.name}`);
            cli.output(`   Type: ${operation.operationType}`);
            cli.output(`   Status: ${this.getRestoreStatusIcon(operation.status)} ${operation.status}`);
            cli.output(`   Target: ${operation.targetId}`);
            cli.output(`   Start Time: ${operation.startTime || 'N/A'}`);

            if (operation.endTime) {
                cli.output(`   End Time: ${operation.endTime}`);
            }

            if (operation.status === 'DONE') {
                if (operation.error) {
                    cli.output(`\n❌ Operation failed!`);
                    cli.output(`   Error: ${operation.error.message || JSON.stringify(operation.error)}`);
                } else {
                    cli.output(`\n✅ Operation completed successfully!`);
                    cli.output(`   The instance should now be available.`);
                }
            } else {
                cli.output(`\n⏳ Operation is still in progress...`);
                cli.output(`   Check again later with the same command.`);
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get operation status`);
            throw new Error(`Get restore status failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get status icon for backup status
     */
    private getBackupStatusIcon(status?: string): string {
        const statusUpper = (status || '').toUpperCase();
        switch (statusUpper) {
            case 'SUCCESSFUL':
                return '📸';
            case 'RUNNING':
            case 'ENQUEUED':
            case 'PENDING':
                return '⏳';
            case 'FAILED':
            case 'SKIPPED':
                return '❌';
            case 'DELETED':
            case 'DELETION_PENDING':
                return '🗑️';
            default:
                return '📷';
        }
    }

    /**
     * Get status icon for restore/operation status
     */
    private getRestoreStatusIcon(status?: string): string {
        const statusUpper = (status || '').toUpperCase();
        switch (statusUpper) {
            case 'DONE':
            case 'RUNNABLE':
                return '✅';
            case 'RUNNING':
            case 'PENDING':
            case 'MAINTENANCE':
            case 'PENDING_CREATE':
                return '⏳';
            case 'FAILED':
            case 'SUSPENDED':
            case 'UNKNOWN_STATE':
                return '❌';
            default:
                return '🔄';
        }
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Get estimated monthly cost for this Cloud SQL instance
     * 
     * Calculates costs based on:
     * - Instance tier (vCPU + memory)
     * - Storage type and size
     * - High availability (REGIONAL vs ZONAL)
     * - Network egress (from Cloud Monitoring)
     * - Backup storage
     * 
     * Usage:
     * - monk do namespace/instance get-cost-estimate
     * 
     * Required IAM permissions:
     * - cloudbilling.skus.list (for pricing)
     * - monitoring.timeSeries.list (for metrics)
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`💰 Cost Estimate for Cloud SQL Instance`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`==================================================`);

        // Get instance details
        const instance = this.getInstance();
        if (!instance) {
            throw new Error(`Instance ${this.definition.name} not found`);
        }

        const settings = instance.settings || {};
        const tier = settings.tier || this.definition.tier || 'db-f1-micro';
        const region = instance.region || this.definition.region || 'us-central1';
        const databaseVersion = instance.databaseVersion || this.definition.database_version || 'POSTGRES_14';
        const storageType = settings.dataDiskType || this.definition.storage_type || 'PD_SSD';
        const storageSizeGb = parseInt(settings.dataDiskSizeGb || this.definition.storage_size_gb || '10', 10);
        const availabilityType = settings.availabilityType || this.definition.availability_type || 'ZONAL';
        const edition = settings.edition || this.definition.edition || 'ENTERPRISE';

        // Determine database engine
        const engine = this.getDatabaseEngine(databaseVersion);

        cli.output(`\n📊 Instance Configuration:`);
        cli.output(`   Tier: ${tier}`);
        cli.output(`   Region: ${region}`);
        cli.output(`   Database: ${databaseVersion} (${engine})`);
        cli.output(`   Edition: ${edition}`);
        cli.output(`   Storage: ${storageSizeGb} GB (${storageType})`);
        cli.output(`   Availability: ${availabilityType}`);

        // Get pricing from Cloud Billing Catalog API
        const pricing = this.getCloudSQLPricing(tier, region, engine, storageType, edition);

        // Get CloudWatch-equivalent metrics from Cloud Monitoring
        const metrics = this.getCloudMonitoringMetrics(instance);

        // Calculate costs
        const hoursPerMonth = 730;
        const isHA = availabilityType === 'REGIONAL';
        const haMultiplier = isHA ? 2 : 1;

        // Instance cost (vCPU + memory)
        const instanceCostMonthly = pricing.instanceHourly * hoursPerMonth * haMultiplier;

        // Storage cost
        const storageCostMonthly = storageSizeGb * pricing.storagePerGbMonth * haMultiplier;

        // Network egress cost (using API tiered rates)
        const networkEgressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
        const networkCostMonthly = this.calculateNetworkEgressCost(networkEgressGb, pricing.networkEgressPerGb, pricing.networkEgressTiers);

        // Backup storage cost based on actual backup configuration
        // Cloud SQL includes 7 free backups up to instance storage size.
        // Additional backup storage beyond that is charged.
        const backupConfig = settings.backupConfiguration || {};
        const backupEnabled = backupConfig.enabled || false;
        const retainedBackups = backupConfig.backupRetentionSettings?.retainedBackups || 7;
        // Estimate: each backup is roughly equal to the storage size.
        // First 7 backups are free (up to instance storage size). Additional backups are charged.
        const chargeableBackups = Math.max(0, retainedBackups - 7);
        const estimatedBackupGb = backupEnabled ? chargeableBackups * storageSizeGb : 0;
        const backupCostMonthly = estimatedBackupGb * pricing.backupPerGbMonth;

        // Total cost
        const totalCostMonthly = instanceCostMonthly + storageCostMonthly + networkCostMonthly + backupCostMonthly;

        cli.output(`\n💵 Cost Breakdown (Monthly):`);
        cli.output(`   Instance (${tier}): $${instanceCostMonthly.toFixed(2)}`);
        cli.output(`      └─ $${pricing.instanceHourly.toFixed(4)}/hr × ${hoursPerMonth} hrs${isHA ? ' × 2 (HA)' : ''}`);
        cli.output(`   Storage (${storageType}): $${storageCostMonthly.toFixed(2)}`);
        cli.output(`      └─ ${storageSizeGb} GB × $${pricing.storagePerGbMonth.toFixed(3)}/GB${isHA ? ' × 2 (HA)' : ''}`);
        cli.output(`   Network Egress: $${networkCostMonthly.toFixed(2)}`);
        cli.output(`      └─ ${networkEgressGb.toFixed(2)} GB egress`);
        if (backupEnabled) {
            cli.output(`   Backup Storage: $${backupCostMonthly.toFixed(2)}`);
            cli.output(`      └─ ~${estimatedBackupGb.toFixed(1)} GB × $${pricing.backupPerGbMonth.toFixed(3)}/GB`);
        }
        cli.output(`   ─────────────────────────────`);
        cli.output(`   TOTAL: $${totalCostMonthly.toFixed(2)}/month`);

        cli.output(`\n📈 Cloud Monitoring Metrics (last 30 days):`);
        cli.output(`   CPU Utilization (avg): ${metrics.cpuUtilization.toFixed(2)}%`);
        cli.output(`   Memory Utilization (avg): ${metrics.memoryUtilization.toFixed(2)}%`);
        cli.output(`   Disk Read IOPS (avg): ${metrics.diskReadOps.toFixed(0)}`);
        cli.output(`   Disk Write IOPS (avg): ${metrics.diskWriteOps.toFixed(0)}`);
        cli.output(`   Network Egress: ${(metrics.networkEgressBytes / (1024 * 1024)).toFixed(2)} MB`);
        cli.output(`   Network Ingress: ${(metrics.networkIngressBytes / (1024 * 1024)).toFixed(2)} MB`);
        cli.output(`   Database Connections (avg): ${metrics.connections.toFixed(0)}`);

        // Output JSON summary
        const summary = {
            instance: {
                name: this.definition.name,
                project: this.projectId,
                tier: tier,
                region: region,
                database_version: databaseVersion,
                engine: engine,
                edition: edition,
                storage_type: storageType,
                storage_size_gb: storageSizeGb,
                availability_type: availabilityType,
                is_ha: isHA
            },
            pricing_rates: {
                source: pricing.source,
                currency: 'USD',
                instance_hourly: pricing.instanceHourly,
                storage_per_gb_month: pricing.storagePerGbMonth,
                network_egress_per_gb: pricing.networkEgressPerGb,
                backup_per_gb_month: pricing.backupPerGbMonth
            },
            cost_breakdown: {
                instance_monthly: parseFloat(instanceCostMonthly.toFixed(2)),
                storage_monthly: parseFloat(storageCostMonthly.toFixed(2)),
                network_monthly: parseFloat(networkCostMonthly.toFixed(2)),
                backup_monthly: parseFloat(backupCostMonthly.toFixed(2)),
                total_monthly: parseFloat(totalCostMonthly.toFixed(2))
            },
            metrics: {
                period_days: 30,
                cpu_utilization_percent: parseFloat(metrics.cpuUtilization.toFixed(2)),
                memory_utilization_percent: parseFloat(metrics.memoryUtilization.toFixed(2)),
                disk_read_ops: parseFloat(metrics.diskReadOps.toFixed(0)),
                disk_write_ops: parseFloat(metrics.diskWriteOps.toFixed(0)),
                network_egress_bytes: metrics.networkEgressBytes,
                network_ingress_bytes: metrics.networkIngressBytes,
                connections_avg: parseFloat(metrics.connections.toFixed(0))
            },
            disclaimer: "Pricing from GCP Cloud Billing Catalog API. Metrics from Cloud Monitoring. Actual costs may vary based on committed use discounts, sustained use discounts, and additional features."
        };

        cli.output(`\n📋 JSON Summary:`);
        cli.output(JSON.stringify(summary, null, 2));
        cli.output(`\n==================================================`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     * 
     * Output format:
     * {
     *   "type": "gcp-cloud-sql-instance",
     *   "costs": {
     *     "month": {
     *       "amount": "85.50",
     *       "currency": "USD"
     *     }
     *   }
     * }
     */
    @action("costs")
    costs(): void {
        // Get instance details
        const instance = this.getInstance();
        if (!instance) {
            // Return zero cost if instance doesn't exist
            const result = {
                type: "gcp-cloud-sql-instance",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const settings = instance.settings || {};
            const tier = settings.tier || this.definition.tier || 'db-f1-micro';
            const region = instance.region || this.definition.region || 'us-central1';
            const databaseVersion = instance.databaseVersion || this.definition.database_version || 'POSTGRES_14';
            const storageType = settings.dataDiskType || this.definition.storage_type || 'PD_SSD';
            const storageSizeGb = parseInt(settings.dataDiskSizeGb || this.definition.storage_size_gb || '10', 10);
            const availabilityType = settings.availabilityType || this.definition.availability_type || 'ZONAL';
            const edition = settings.edition || this.definition.edition || 'ENTERPRISE';

            // Determine database engine
            const engine = this.getDatabaseEngine(databaseVersion);

            // Get pricing from Cloud Billing Catalog API
            const pricing = this.getCloudSQLPricing(tier, region, engine, storageType, edition);

            // Get metrics from Cloud Monitoring
            const metrics = this.getCloudMonitoringMetrics(instance);

            // Calculate costs
            const hoursPerMonth = 730;
            const isHA = availabilityType === 'REGIONAL';
            const haMultiplier = isHA ? 2 : 1;

            // Instance cost (vCPU + memory)
            const instanceCostMonthly = pricing.instanceHourly * hoursPerMonth * haMultiplier;

            // Storage cost
            const storageCostMonthly = storageSizeGb * pricing.storagePerGbMonth * haMultiplier;

            // Network egress cost (using API tiered rates)
            const networkEgressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
            const networkCostMonthly = this.calculateNetworkEgressCost(networkEgressGb, pricing.networkEgressPerGb, pricing.networkEgressTiers);

            // Backup storage cost based on actual backup configuration
            const backupConfig = settings.backupConfiguration || {};
            const backupEnabled = backupConfig.enabled || false;
            const retainedBackups = backupConfig.backupRetentionSettings?.retainedBackups || 7;
            const chargeableBackups = Math.max(0, retainedBackups - 7);
            const estimatedBackupGb = backupEnabled ? chargeableBackups * storageSizeGb : 0;
            const backupCostMonthly = estimatedBackupGb * pricing.backupPerGbMonth;

            // Total cost
            const totalCostMonthly = instanceCostMonthly + storageCostMonthly + networkCostMonthly + backupCostMonthly;

            const result = {
                type: "gcp-cloud-sql-instance",
                costs: {
                    month: {
                        amount: totalCostMonthly.toFixed(2),
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));

        } catch (error) {
            // Return zero cost on error
            const result = {
                type: "gcp-cloud-sql-instance",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD",
                        error: (error as Error).message
                    }
                }
            };
            cli.output(JSON.stringify(result));
        }
    }

    /**
     * Get database engine from version string
     */
    private getDatabaseEngine(databaseVersion: string): string {
        if (databaseVersion.startsWith('POSTGRES')) {
            return 'PostgreSQL';
        } else if (databaseVersion.startsWith('MYSQL')) {
            return 'MySQL';
        } else if (databaseVersion.startsWith('SQLSERVER')) {
            return 'SQL Server';
        }
        return 'Unknown';
    }

    /**
     * Get Cloud SQL pricing from GCP Cloud Billing Catalog API
     */
    private getCloudSQLPricing(
        tier: string,
        region: string,
        engine: string,
        storageType: string,
        edition: string
    ): {
        instanceHourly: number;
        storagePerGbMonth: number;
        networkEgressPerGb: number;
        networkEgressTiers: { limitGb: number; ratePerGb: number }[];
        backupPerGbMonth: number;
        source: string;
    } {
        try {
            const apiPricing = this.fetchCloudSQLPricingFromAPI(tier, region, engine, storageType, edition);
            if (apiPricing) {
                return { ...apiPricing, source: 'GCP Cloud Billing Catalog API' };
            }
        } catch (error) {
            cli.output(`Warning: Failed to fetch pricing from GCP API: ${(error as Error).message}`);
        }

        // If API fails, throw error (no hardcoded fallback)
        throw new Error(
            'Failed to fetch pricing from GCP Cloud Billing Catalog API. ' +
            'Ensure the Cloud Billing API is enabled and you have cloudbilling.skus.list permission.'
        );
    }

    /**
     * Fetch Cloud SQL pricing from GCP Cloud Billing Catalog API
     */
    private fetchCloudSQLPricingFromAPI(
        tier: string,
        region: string,
        engine: string,
        storageType: string,
        _edition: string
    ): {
        instanceHourly: number;
        storagePerGbMonth: number;
        networkEgressPerGb: number;
        networkEgressTiers: { limitGb: number; ratePerGb: number }[];
        backupPerGbMonth: number;
    } | null {
        const billingApiUrl = 'https://cloudbilling.googleapis.com/v1';
        
        // Cloud SQL service ID
        const cloudSqlServiceId = '9662-B51E-5089'; // Cloud SQL service ID
        
        // Parse tier to get vCPU and memory
        const tierSpec = this.parseTier(tier);
        
        try {
            // Fetch SKUs for Cloud SQL
            const skusUrl = `${billingApiUrl}/services/${cloudSqlServiceId}/skus?currencyCode=USD`;
            const response = this.get(skusUrl);
            
            if (!response.skus || !Array.isArray(response.skus)) {
                return null;
            }

            const skus = response.skus;
            
            // Find instance pricing (vCPU + RAM)
            let vcpuHourly = 0;
            let ramHourly = 0;
            let storageMonthly = 0;
            let networkEgress = 0;
            let networkEgressTiers: { limitGb: number; ratePerGb: number }[] = [];
            let backupMonthly = 0;

            for (const sku of skus) {
                const desc = (sku.description || '').toLowerCase();
                const category = sku.category?.resourceFamily || '';
                
                // Check if SKU matches our region
                const serviceRegions = sku.serviceRegions || [];
                if (!serviceRegions.includes(region) && !serviceRegions.includes('global')) {
                    continue;
                }

                // vCPU pricing
                if (desc.includes('vcpu') && desc.includes(engine.toLowerCase()) && category === 'Compute') {
                    const price = this.extractPriceFromSku(sku);
                    if (price > 0) {
                        vcpuHourly = price;
                    }
                }

                // RAM pricing
                if (desc.includes('ram') && desc.includes(engine.toLowerCase()) && category === 'Compute') {
                    const price = this.extractPriceFromSku(sku);
                    if (price > 0) {
                        ramHourly = price;
                    }
                }

                // Storage pricing
                if (desc.includes('storage') && desc.includes(engine.toLowerCase())) {
                    if ((storageType === 'PD_SSD' && desc.includes('ssd')) ||
                        (storageType === 'PD_HDD' && desc.includes('hdd'))) {
                        const price = this.extractPriceFromSku(sku);
                        if (price > 0) {
                            storageMonthly = price;
                        }
                    }
                }

                // Backup pricing
                if (desc.includes('backup') && desc.includes(engine.toLowerCase())) {
                    const price = this.extractPriceFromSku(sku);
                    if (price > 0) {
                        backupMonthly = price;
                    }
                }

                // Network egress - extract full tiered rates
                if (desc.includes('network') && desc.includes('egress')) {
                    const price = this.extractPriceFromSku(sku);
                    if (price > 0) {
                        networkEgress = price;
                        networkEgressTiers = this.extractTieredRatesFromSku(sku);
                    }
                }
            }

            // Calculate instance hourly cost based on tier
            // If we couldn't get exact pricing from the API, return null
            if (vcpuHourly === 0 || ramHourly === 0 || storageMonthly === 0) {
                return null;
            }

            // Calculate total instance cost: (vCPU × count) + (RAM GB × count)
            const instanceHourly = (vcpuHourly * tierSpec.vcpu) + (ramHourly * tierSpec.memoryGb);

            return {
                instanceHourly: instanceHourly,
                storagePerGbMonth: storageMonthly,
                networkEgressPerGb: networkEgress,
                networkEgressTiers,
                backupPerGbMonth: backupMonthly
            };
        } catch (error) {
            cli.output(`Error fetching pricing: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Parse tier string to get vCPU and memory specifications
     */
    private parseTier(tier: string): { vcpu: number; memoryGb: number } {
        // Shared-core tiers
        if (tier === 'db-f1-micro') {
            return { vcpu: 0.6, memoryGb: 0.614 }; // Shared vCPU
        }
        if (tier === 'db-g1-small') {
            return { vcpu: 0.5, memoryGb: 1.7 }; // Shared vCPU
        }

        // Custom tiers: db-custom-{vCPU}-{memoryMB}
        const customMatch = tier.match(/^db-custom-(\d+)-(\d+)$/);
        if (customMatch) {
            return {
                vcpu: parseInt(customMatch[1], 10),
                memoryGb: parseInt(customMatch[2], 10) / 1024
            };
        }

        // High-memory tiers: db-n1-highmem-{vCPU}
        const highmemMatch = tier.match(/^db-n1-highmem-(\d+)$/);
        if (highmemMatch) {
            const vcpu = parseInt(highmemMatch[1], 10);
            return { vcpu: vcpu, memoryGb: vcpu * 6.5 }; // ~6.5GB per vCPU
        }

        // Standard tiers: db-n1-standard-{vCPU}
        const standardMatch = tier.match(/^db-n1-standard-(\d+)$/);
        if (standardMatch) {
            const vcpu = parseInt(standardMatch[1], 10);
            return { vcpu: vcpu, memoryGb: vcpu * 3.75 }; // ~3.75GB per vCPU
        }

        // Enterprise Plus tiers: db-perf-optimized-N-{vCPU}
        const perfMatch = tier.match(/^db-perf-optimized-N-(\d+)$/);
        if (perfMatch) {
            const vcpu = parseInt(perfMatch[1], 10);
            return { vcpu: vcpu, memoryGb: vcpu * 8 }; // ~8GB per vCPU for perf-optimized
        }

        // Fail fast for unknown tier strings instead of guessing
        throw new Error(`Unknown Cloud SQL tier: '${tier}'. Cannot determine vCPU/memory specs. Supported formats: db-f1-micro, db-g1-small, db-custom-{vCPU}-{memoryMB}, db-n1-highmem-{vCPU}, db-n1-standard-{vCPU}, db-perf-optimized-N-{vCPU}`);
    }

    /**
     * Extract price from SKU pricing info
     */
    private extractPriceFromSku(sku: any): number {
        try {
            const pricingInfo = sku.pricingInfo;
            if (!pricingInfo || !Array.isArray(pricingInfo) || pricingInfo.length === 0) {
                return 0;
            }

            const pricing = pricingInfo[0];
            const tieredRates = pricing.pricingExpression?.tieredRates;
            if (!tieredRates || !Array.isArray(tieredRates) || tieredRates.length === 0) {
                return 0;
            }

            // Get the first non-zero rate
            for (const rate of tieredRates) {
                const unitPrice = rate.unitPrice;
                if (unitPrice) {
                    const units = parseInt(unitPrice.units || '0', 10);
                    const nanos = parseInt(unitPrice.nanos || '0', 10);
                    const price = units + (nanos / 1e9);
                    if (price > 0) {
                        return price;
                    }
                }
            }
            return 0;
        } catch {
            return 0;
        }
    }

    /**
     * Extract full tiered rates from a SKU's pricing info.
     * Returns an array of { limitGb, ratePerGb } sorted by tier start usage.
     */
    private extractTieredRatesFromSku(sku: any): { limitGb: number; ratePerGb: number }[] {
        try {
            const pricingInfo = sku.pricingInfo;
            if (!pricingInfo || !Array.isArray(pricingInfo) || pricingInfo.length === 0) {
                return [];
            }

            const pricing = pricingInfo[0];
            const tieredRates = pricing.pricingExpression?.tieredRates;
            if (!tieredRates || !Array.isArray(tieredRates) || tieredRates.length === 0) {
                return [];
            }

            const tiers: { startUsageAmount: number; ratePerGb: number }[] = [];
            for (const rate of tieredRates) {
                const unitPrice = rate.unitPrice;
                const startUsageAmount = rate.startUsageAmount || 0;
                let price = 0;
                if (unitPrice) {
                    const units = parseInt(unitPrice.units || '0', 10);
                    const nanos = parseInt(unitPrice.nanos || '0', 10);
                    price = units + (nanos / 1e9);
                }
                tiers.push({ startUsageAmount, ratePerGb: price });
            }

            tiers.sort((a, b) => a.startUsageAmount - b.startUsageAmount);

            const result: { limitGb: number; ratePerGb: number }[] = [];
            for (let i = 0; i < tiers.length; i++) {
                const nextStart = i + 1 < tiers.length ? tiers[i + 1].startUsageAmount : Infinity;
                result.push({
                    limitGb: nextStart,
                    ratePerGb: tiers[i].ratePerGb
                });
            }

            return result;
        } catch {
            return [];
        }
    }

    /**
     * Calculate network egress cost with tiered pricing from the API.
     * Uses actual tiered rates from the GCP Cloud Billing API when available,
     * otherwise falls back to the single rate (flat pricing).
     */
    private calculateNetworkEgressCost(
        egressGb: number,
        ratePerGb: number,
        egressTiers?: { limitGb: number; ratePerGb: number }[]
    ): number {
        if (egressGb <= 0) return 0;

        // If we have actual tiered rates from the API, use them
        if (egressTiers && egressTiers.length > 1) {
            let cost = 0;
            let remaining = egressGb;

            for (const tier of egressTiers) {
                if (remaining <= 0) break;

                const tierCapacity = tier.limitGb === Infinity ? remaining : tier.limitGb;
                const usageInTier = Math.min(remaining, tierCapacity);

                cost += usageInTier * tier.ratePerGb;
                remaining -= usageInTier;
            }

            return cost;
        }

        // Fallback: use flat rate (no tiered discount approximation)
        return egressGb * ratePerGb;
    }

    /**
     * Get metrics from Cloud Monitoring API
     */
    private getCloudMonitoringMetrics(_instance: any): {
        cpuUtilization: number;
        memoryUtilization: number;
        diskReadOps: number;
        diskWriteOps: number;
        networkEgressBytes: number;
        networkIngressBytes: number;
        connections: number;
    } {
        const defaultMetrics = {
            cpuUtilization: 0,
            memoryUtilization: 0,
            diskReadOps: 0,
            diskWriteOps: 0,
            networkEgressBytes: 0,
            networkIngressBytes: 0,
            connections: 0
        };

        try {
            const monitoringApiUrl = 'https://monitoring.googleapis.com/v3';
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            
            const endTime = now.toISOString();
            const startTime = thirtyDaysAgo.toISOString();

            // Cloud SQL metric types
            const metricTypes = [
                'cloudsql.googleapis.com/database/cpu/utilization',
                'cloudsql.googleapis.com/database/memory/utilization',
                'cloudsql.googleapis.com/database/disk/read_ops_count',
                'cloudsql.googleapis.com/database/disk/write_ops_count',
                'cloudsql.googleapis.com/database/network/sent_bytes_count',
                'cloudsql.googleapis.com/database/network/received_bytes_count',
                'cloudsql.googleapis.com/database/network/connections'
            ];

            const results: Record<string, number> = {};

            for (const metricType of metricTypes) {
                try {
                    const filter = `metric.type="${metricType}" AND resource.labels.database_id="${this.projectId}:${this.definition.name}"`;
                    const encodedFilter = encodeURIComponent(filter);
                    
                    const url = `${monitoringApiUrl}/projects/${this.projectId}/timeSeries?` +
                        `filter=${encodedFilter}&` +
                        `interval.startTime=${startTime}&` +
                        `interval.endTime=${endTime}&` +
                        `aggregation.alignmentPeriod=86400s&` +
                        `aggregation.perSeriesAligner=ALIGN_MEAN`;

                    const response = this.get(url);
                    
                    if (response.timeSeries && response.timeSeries.length > 0) {
                        const points = response.timeSeries[0].points || [];
                        if (points.length > 0) {
                            // Calculate average across all points
                            let sum = 0;
                            for (const point of points) {
                                const value = point.value?.doubleValue || 
                                             point.value?.int64Value || 
                                             point.value?.distributionValue?.mean || 0;
                                sum += parseFloat(value.toString());
                            }
                            results[metricType] = sum / points.length;
                        }
                    }
                } catch (metricError) {
                    // Continue with other metrics if one fails
                    cli.output(`Warning: Could not fetch metric ${metricType}`);
                }
            }

            return {
                cpuUtilization: (results['cloudsql.googleapis.com/database/cpu/utilization'] || 0) * 100,
                memoryUtilization: (results['cloudsql.googleapis.com/database/memory/utilization'] || 0) * 100,
                diskReadOps: results['cloudsql.googleapis.com/database/disk/read_ops_count'] || 0,
                diskWriteOps: results['cloudsql.googleapis.com/database/disk/write_ops_count'] || 0,
                networkEgressBytes: (results['cloudsql.googleapis.com/database/network/sent_bytes_count'] || 0) * 30 * 24 * 3600, // Convert rate to total
                networkIngressBytes: (results['cloudsql.googleapis.com/database/network/received_bytes_count'] || 0) * 30 * 24 * 3600,
                connections: results['cloudsql.googleapis.com/database/network/connections'] || 0
            };
        } catch (error) {
            cli.output(`Warning: Could not fetch Cloud Monitoring metrics: ${(error as Error).message}`);
            return defaultMetrics;
        }
    }
}
