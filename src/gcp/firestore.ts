/**
 * GCP Firestore Database Entity
 *
 * Creates and manages Cloud Firestore databases. Firestore is a flexible,
 * scalable NoSQL cloud database for mobile, web, and server development.
 *
 * @see https://firebase.google.com/docs/firestore
 * @see https://cloud.google.com/firestore/docs/reference/rest
 */

import { action, Args } from "monkec/base";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import cli from "cli";
import { FIRESTORE_API_URL, GcpRegion } from "./common.ts";

/**
 * Firestore database type
 */
export type FirestoreType =
    /** Native Firestore mode (recommended for new projects) */
    | "FIRESTORE_NATIVE"
    /** Datastore mode (for Datastore compatibility) */
    | "DATASTORE_MODE";

/**
 * Firestore concurrency mode
 */
export type FirestoreConcurrencyMode =
    /** Optimistic concurrency control (default for Native mode) */
    | "OPTIMISTIC"
    /** Optimistic concurrency with entity groups (Datastore mode) */
    | "OPTIMISTIC_WITH_ENTITY_GROUPS"
    /** Pessimistic concurrency (not recommended) */
    | "PESSIMISTIC";

/**
 * Firestore point-in-time recovery enablement
 */
export type FirestorePitrState =
    /** PITR enabled */
    | "POINT_IN_TIME_RECOVERY_ENABLED"
    /** PITR disabled */
    | "POINT_IN_TIME_RECOVERY_DISABLED";

/**
 * Firestore delete protection state
 */
export type FirestoreDeleteProtectionState =
    /** Delete protection enabled */
    | "DELETE_PROTECTION_ENABLED"
    /** Delete protection disabled */
    | "DELETE_PROTECTION_DISABLED";

/**
 * Firestore Database entity definition
 * @interface FirestoreDefinition
 */
export interface FirestoreDefinition extends GcpEntityDefinition {
    /**
     * @description Database ID. Use "(default)" for the default database.
     * Custom database IDs must be lowercase, start with a letter,
     * and contain only letters, numbers, and hyphens.
     * @default "(default)"
     */
    database_id?: string;

    /**
     * @description Location for the database
     * Multi-region: "nam5" (US), "eur3" (Europe)
     * Regional: us-central1, europe-west1, etc.
     * @see GcpRegion
     */
    location: GcpRegion | "nam5" | "eur3";

    /**
     * @description Database type
     * - FIRESTORE_NATIVE: Full Firestore functionality (recommended)
     * - DATASTORE_MODE: Datastore compatibility mode
     * @default FIRESTORE_NATIVE
     */
    database_type?: FirestoreType;

    /**
     * @description Concurrency mode for the database
     * @default OPTIMISTIC
     */
    concurrency_mode?: FirestoreConcurrencyMode;

    /**
     * @description Application tag for billing attribution
     */
    app_engine_integration_mode?: "ENABLED" | "DISABLED";

    /**
     * @description Point-in-time recovery configuration.
     * Enables recovery to any point in the last 7 days.
     * Use POINT_IN_TIME_RECOVERY_ENABLED to enable.
     */
    point_in_time_recovery?: FirestorePitrState;

    /**
     * @description Delete protection for the database.
     * When enabled, database cannot be deleted without first disabling.
     * Use DELETE_PROTECTION_ENABLED to enable.
     */
    delete_protection?: FirestoreDeleteProtectionState;

    /**
     * @description Whether to keep the database on delete
     * @default false
     */
    keep_on_delete?: boolean;
}

/**
 * Firestore Database entity state
 * @interface FirestoreState
 */
export interface FirestoreState extends GcpEntityState {
    /**
     * @description Full resource name
     */
    name?: string;

    /**
     * @description Database ID
     */
    database_id?: string;

    /**
     * @description Location/region
     */
    location?: string;

    /**
     * @description Database type
     */
    type?: string;

    /**
     * @description Concurrency mode
     */
    concurrency_mode?: string;

    /**
     * @description Database creation time
     */
    create_time?: string;

    /**
     * @description Database update time
     */
    update_time?: string;

    /**
     * @description Key prefix for datastore mode
     */
    key_prefix?: string;

    /**
     * @description Database UID
     */
    uid?: string;

    /**
     * @description PITR state
     */
    point_in_time_recovery?: string;

    /**
     * @description Delete protection state
     */
    delete_protection?: string;

    /**
     * @description Earliest PITR recovery time
     */
    earliest_version_time?: string;
}

/**
 * GCP Firestore Database Entity
 *
 * Manages Cloud Firestore databases which provide a flexible NoSQL document
 * database with real-time synchronization, offline support, and scalability.
 *
 * ## Database Types
 * - **FIRESTORE_NATIVE**: Full Firestore functionality including real-time
 *   listeners, offline support, and rich querying. Recommended for new projects.
 * - **DATASTORE_MODE**: Datastore compatibility mode for existing Datastore
 *   applications. Cannot use Firestore client libraries in this mode.
 *
 * ## Locations
 * - **Multi-region**: "nam5" (US), "eur3" (Europe) - highest availability
 * - **Regional**: us-central1, europe-west1, etc. - lower latency, lower cost
 *
 * ## Secrets
 * This entity does NOT write any secrets.
 * Use a service account with appropriate roles for access.
 *
 * ## Dependencies
 * Required APIs:
 * - `firestore.googleapis.com`
 *
 * ## State Fields for Composition
 * - `state.name` - Full resource name for IAM/access
 * - `state.database_id` - Database ID for SDK configuration
 * - `state.location` - Database location
 * - `state.type` - Database type (Native vs Datastore mode)
 *
 * ## Composing with Other Entities
 * - `gcp/service-account` - Create SA with `roles/datastore.user` or `roles/datastore.owner`
 * - `gcp/service-usage` - Enable firestore.googleapis.com
 * - `gcp/cloud-function` - Functions triggered by Firestore document changes
 *
 * @see https://firebase.google.com/docs/firestore
 *
 * @example Default database in Native mode
 * ```yaml
 * my-firestore:
 *   defines: gcp/firestore
 *   location: nam5  # US multi-region
 * ```
 *
 * @example Regional database with PITR
 * ```yaml
 * prod-firestore:
 *   defines: gcp/firestore
 *   database_id: prod-db
 *   location: us-central1
 *   type: FIRESTORE_NATIVE
 *   point_in_time_recovery: POINT_IN_TIME_RECOVERY_ENABLED
 *   delete_protection: DELETE_PROTECTION_ENABLED
 * ```
 *
 * @example Datastore mode database
 * ```yaml
 * datastore-db:
 *   defines: gcp/firestore
 *   database_id: legacy-db
 *   location: us-central1
 *   type: DATASTORE_MODE
 * ```
 *
 * @example With service account for access
 * ```yaml
 * # Firestore database
 * app-db:
 *   defines: gcp/firestore
 *   location: us-central1
 *
 * # Service account with Firestore access
 * app-sa:
 *   defines: gcp/service-account
 *   name: my-app-firestore
 *   roles:
 *     - roles/datastore.user
 *
 * # Generate key for application
 * app-sa-key:
 *   defines: gcp/service-account-key
 *   service_account_id: <- connection-target("sa") entity-state get-member("unique_id")
 *   secret: firestore-credentials
 *   permitted-secrets:
 *     firestore-credentials: true
 *   connections:
 *     sa:
 *       runnable: gcp/service-account/app-sa
 *       service: service-account
 * ```
 */
export class Firestore extends GcpEntity<FirestoreDefinition, FirestoreState> {

    static readonly readiness = { period: 10, initialDelay: 5, attempts: 60 };

    protected getEntityName(): string {
        return `Firestore Database ${this.getDatabaseId()}`;
    }

    /**
     * Get the database ID (defaults to "(default)")
     */
    private getDatabaseId(): string {
        return this.definition.database_id || "(default)";
    }

    /**
     * Get the base API URL for databases
     */
    private getBaseUrl(): string {
        return `${FIRESTORE_API_URL}/projects/${this.projectId}/databases`;
    }

    /**
     * Get full database resource URL
     */
    private getDatabaseUrl(): string {
        return `${this.getBaseUrl()}/${this.getDatabaseId()}`;
    }

    /**
     * Get database details from API
     */
    private getDatabase(): any | null {
        return this.checkResourceExists(this.getDatabaseUrl());
    }

    /**
     * Populate state from database response
     */
    private populateState(db: any): void {
        this.state.name = db.name;
        this.state.database_id = db.name?.split("/").pop();
        this.state.location = db.locationId;
        this.state.type = db.type;
        this.state.concurrency_mode = db.concurrencyMode;
        this.state.create_time = db.createTime;
        this.state.update_time = db.updateTime;
        this.state.key_prefix = db.keyPrefix;
        this.state.uid = db.uid;
        this.state.point_in_time_recovery = db.pointInTimeRecoveryEnablement;
        this.state.delete_protection = db.deleteProtectionState;
        this.state.earliest_version_time = db.earliestVersionTime;
    }

    /**
     * Wait for database operation to complete
     */
    private waitForDatabaseOperation(operationName: string): any {
        const operationUrl = `${FIRESTORE_API_URL}/${operationName}`;
        return this.waitForOperation(operationUrl, 120, 10000); // 20 minutes max
    }

    override create(): void {
        // Check if database already exists
        const existing = this.getDatabase();

        if (existing) {
            cli.output(`Database ${this.getDatabaseId()} already exists, adopting...`);
            this.state.existing = true;
            this.populateState(existing);
            return;
        }

        // Build request body
        const body: any = {
            locationId: this.definition.location,
            type: this.definition.database_type || "FIRESTORE_NATIVE",
        };

        if (this.definition.concurrency_mode) {
            body.concurrencyMode = this.definition.concurrency_mode;
        }

        if (this.definition.app_engine_integration_mode) {
            body.appEngineIntegrationMode = this.definition.app_engine_integration_mode;
        }

        if (this.definition.point_in_time_recovery) {
            body.pointInTimeRecoveryEnablement = this.definition.point_in_time_recovery;
        }

        if (this.definition.delete_protection) {
            body.deleteProtectionState = this.definition.delete_protection;
        }

        // Create database
        cli.output(`Creating Firestore database: ${this.getDatabaseId()} in ${this.definition.location}`);
        const url = `${this.getBaseUrl()}?databaseId=${encodeURIComponent(this.getDatabaseId())}`;
        const operation = this.post(url, body);

        // Wait for operation if returned
        if (operation?.name && operation.name.includes("operations")) {
            cli.output(`Waiting for database creation...`);
            this.waitForDatabaseOperation(operation.name);
        }

        // Get final database state
        const db = this.getDatabase();
        if (db) {
            this.populateState(db);
            this.state.existing = false;
            cli.output(`Database ${this.getDatabaseId()} created in ${this.state.location}`);
        }
    }

    override update(): void {
        const existing = this.getDatabase();

        if (!existing) {
            cli.output("Database not found, creating...");
            this.create();
            return;
        }

        // Build update body with allowed fields
        const body: any = {};
        const updateMask: string[] = [];

        if (this.definition.point_in_time_recovery) {
            body.pointInTimeRecoveryEnablement = this.definition.point_in_time_recovery;
            updateMask.push("pointInTimeRecoveryEnablement");
        }

        if (this.definition.delete_protection) {
            body.deleteProtectionState = this.definition.delete_protection;
            updateMask.push("deleteProtectionState");
        }

        if (this.definition.concurrency_mode) {
            body.concurrencyMode = this.definition.concurrency_mode;
            updateMask.push("concurrencyMode");
        }

        if (updateMask.length > 0) {
            const url = `${this.getDatabaseUrl()}?updateMask=${updateMask.join(",")}`;
            const operation = this.patch(url, body);

            if (operation?.name && operation.name.includes("operations")) {
                cli.output(`Waiting for database update...`);
                this.waitForDatabaseOperation(operation.name);
            }

            const db = this.getDatabase();
            if (db) {
                this.populateState(db);
            }
            cli.output(`Database ${this.getDatabaseId()} updated`);
        } else {
            this.populateState(existing);
            cli.output(`Database ${this.getDatabaseId()} unchanged`);
        }
    }

    override delete(): void {
        if (this.definition.keep_on_delete) {
            cli.output(`Database ${this.getDatabaseId()} has keep_on_delete=true, skipping delete`);
            return;
        }

        if (this.state.existing) {
            cli.output(`Database ${this.getDatabaseId()} was not created by this entity, skipping delete`);
            return;
        }

        const existing = this.getDatabase();
        if (!existing) {
            cli.output(`Database ${this.getDatabaseId()} does not exist`);
            return;
        }

        // Check delete protection
        if (existing.deleteProtectionState === "DELETE_PROTECTION_ENABLED") {
            cli.output(`Database ${this.getDatabaseId()} has delete protection enabled. Disabling first...`);
            this.patch(this.getDatabaseUrl() + "?updateMask=deleteProtectionState", {
                deleteProtectionState: "DELETE_PROTECTION_DISABLED",
            });
        }

        cli.output(`Deleting Firestore database: ${this.getDatabaseId()}`);
        const operation = this.httpDelete(this.getDatabaseUrl());

        if (operation?.name && operation.name.includes("operations")) {
            cli.output(`Waiting for database deletion...`);
            this.waitForDatabaseOperation(operation.name);
        }

        cli.output(`Database ${this.getDatabaseId()} deleted`);
    }

    override checkReadiness(): boolean {
        const db = this.getDatabase();
        if (!db) {
            cli.output("Database not found");
            return false;
        }

        this.populateState(db);
        cli.output(`Database ${this.getDatabaseId()} is ready in ${this.state.location}`);
        return true;
    }

    checkLiveness(): boolean {
        return this.getDatabase() !== null;
    }

    @action("get")
    getInfo(_args?: Args): void {
        const db = this.getDatabase();
        if (!db) {
            throw new Error("Database not found");
        }
        cli.output(JSON.stringify(db, null, 2));
    }

    @action("list-indexes")
    listIndexes(_args?: Args): void {
        const url = `${this.getDatabaseUrl()}/collectionGroups/-/indexes`;
        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("list-fields")
    listFields(args?: Args): void {
        const collectionGroup = args?.collection || "-";
        const url = `${this.getDatabaseUrl()}/collectionGroups/${collectionGroup}/fields`;
        const result = this.get(url);
        cli.output(JSON.stringify(result, null, 2));
    }

    @action("export-documents")
    exportDocuments(args?: Args): void {
        if (!args?.output_uri_prefix) {
            throw new Error("output_uri_prefix argument is required (gs://bucket/path)");
        }

        const url = `${this.getDatabaseUrl()}:exportDocuments`;
        const body: any = {
            outputUriPrefix: args.output_uri_prefix,
        };

        if (args.collection_ids) {
            body.collectionIds = args.collection_ids.split(",").map((s: string) => s.trim());
        }

        const operation = this.post(url, body);
        cli.output(`Export started: ${operation.name}`);
        cli.output(`Output: ${args.output_uri_prefix}`);
    }

    @action("import-documents")
    importDocuments(args?: Args): void {
        if (!args?.input_uri_prefix) {
            throw new Error("input_uri_prefix argument is required (gs://bucket/path)");
        }

        const url = `${this.getDatabaseUrl()}:importDocuments`;
        const body: any = {
            inputUriPrefix: args.input_uri_prefix,
        };

        if (args.collection_ids) {
            body.collectionIds = args.collection_ids.split(",").map((s: string) => s.trim());
        }

        const operation = this.post(url, body);
        cli.output(`Import started: ${operation.name}`);
    }

    // =========================================================================
    // Backup & Restore Interface
    // =========================================================================

    /**
     * Get backup configuration and status information for the Firestore database
     *
     * Shows current backup settings including Point-in-Time Recovery (PITR) status
     * and earliest restore time if PITR is enabled.
     *
     * Usage:
     * - monk do namespace/firestore get-backup-info
     */
    @action("get-backup-info")
    getBackupInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Backup Information for Firestore database`);
        cli.output(`Database: ${this.getDatabaseId()}`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`==================================================`);

        const db = this.getDatabase();
        if (!db) {
            throw new Error(`Database ${this.getDatabaseId()} not found`);
        }

        cli.output(`\n🔧 Database Configuration:`);
        cli.output(`   Location: ${db.locationId || this.definition.location}`);
        cli.output(`   Type: ${db.type || 'FIRESTORE_NATIVE'}`);

        const pitrEnabled = db.pointInTimeRecoveryEnablement === 'POINT_IN_TIME_RECOVERY_ENABLED';
        cli.output(`   Point-in-Time Recovery: ${pitrEnabled ? '✅ Enabled' : '❌ Disabled'}`);

        if (db.earliestVersionTime) {
            cli.output(`   Earliest Restore Time: ${db.earliestVersionTime}`);
        }

        cli.output(`   Delete Protection: ${db.deleteProtectionState === 'DELETE_PROTECTION_ENABLED' ? '✅ Enabled' : '❌ Disabled'}`);

        if (!pitrEnabled) {
            cli.output(`\n⚠️  Note: Enable point_in_time_recovery in definition for document-level time travel`);
            cli.output(`   PITR allows reading document versions from the last 7 days`);
        } else {
            cli.output(`\n💡 With PITR enabled, you can read historical document versions`);
            cli.output(`   from the last 7 days using the Firestore client SDK or REST API.`);
        }

        cli.output(`\n📋 Available backup operations:`);
        cli.output(`   monk do namespace/firestore list-backups location="${db.locationId || this.definition.location}"`);
        cli.output(`   monk do namespace/firestore export-documents output_uri_prefix="gs://bucket/path"`);
        cli.output(`   monk do namespace/firestore restore backup_name="..." target_database="new-db"`);
        cli.output(`\n==================================================`);
    }

    /**
     * List all available backups for this Firestore database
     *
     * Lists backups in the specified location. Use this to find backup IDs
     * for restore operations.
     *
     * Usage:
     * - monk do namespace/firestore list-backups location="us-central1"
     * - monk do namespace/firestore list-backups location="nam5" limit=20
     *
     * @param args Required/Optional arguments:
     *   - location: GCP location to list backups from (required)
     *   - limit: Maximum number of backups to display (default: 10)
     */
    @action("list-backups")
    listBackups(args?: Args): void {
        const location = (args?.location as string) || this.definition.location;
        if (!location) {
            throw new Error(
                "'location' is required.\n" +
                "Usage: monk do namespace/firestore list-backups location=\"us-central1\"\n"
            );
        }

        cli.output(`==================================================`);
        cli.output(`Listing Firestore backups`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`Location: ${location}`);
        cli.output(`==================================================`);

        const limit = Number(args?.limit) || 10;

        try {
            const url = `${FIRESTORE_API_URL}/projects/${this.projectId}/locations/${location}/backups`;
            const response = this.get(url);
            const backups = response.backups || [];

            cli.output(`\nTotal backups found: ${backups.length}`);
            cli.output(`Showing: ${Math.min(backups.length, limit)} backup(s)\n`);

            if (backups.length === 0) {
                cli.output(`No backups found in location ${location}.`);
                cli.output(`\n📋 To create a backup, use export-documents:`);
                cli.output(`   monk do namespace/firestore export-documents output_uri_prefix="gs://bucket/path"`);
            } else {
                const displayBackups = backups.slice(0, limit);

                for (let i = 0; i < displayBackups.length; i++) {
                    const backup = displayBackups[i];
                    const statusIcon = this.getBackupStatusIcon(backup.state);
                    const backupId = backup.name?.split('/').pop() || 'unknown';

                    cli.output(`${statusIcon} Backup #${i + 1}`);
                    cli.output(`   ID: ${backupId}`);
                    cli.output(`   Name: ${backup.name}`);
                    cli.output(`   State: ${backup.state || 'UNKNOWN'}`);
                    cli.output(`   Database: ${backup.database || 'N/A'}`);
                    cli.output(`   Snapshot Time: ${backup.snapshotTime || 'N/A'}`);
                    cli.output(`   Expire Time: ${backup.expireTime || 'N/A'}`);
                    cli.output(``);
                }

                if (backups.length > limit) {
                    cli.output(`... and ${backups.length - limit} more backup(s)`);
                    cli.output(`Increase limit with: monk do namespace/firestore list-backups location="${location}" limit=${backups.length}`);
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
     * - monk do namespace/firestore describe-backup backup_name="projects/my-project/locations/us-central1/backups/backup-id"
     *
     * @param args Required arguments:
     *   - backup_name: Full backup resource name
     */
    @action("describe-backup")
    describeBackup(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📸 Backup Details`);
        cli.output(`==================================================`);

        const backupName = args?.backup_name as string | undefined;
        if (!backupName) {
            throw new Error(
                "'backup_name' is required.\n" +
                "Usage: monk do namespace/firestore describe-backup backup_name=\"projects/.../backups/backup-id\"\n" +
                "\nTo find backup names, run: monk do namespace/firestore list-backups location=\"us-central1\""
            );
        }

        try {
            const url = `${FIRESTORE_API_URL}/${backupName}`;
            const backup = this.get(url);
            const statusIcon = this.getBackupStatusIcon(backup.state);

            cli.output(`\n${statusIcon} Backup Information`);
            cli.output(`--------------------------------------------------`);
            cli.output(`Name: ${backup.name}`);
            cli.output(`State: ${backup.state || 'UNKNOWN'}`);
            cli.output(`Database: ${backup.database}`);
            cli.output(`Database UID: ${backup.databaseUid || 'N/A'}`);
            cli.output(`Snapshot Time: ${backup.snapshotTime || 'N/A'}`);
            cli.output(`Expire Time: ${backup.expireTime || 'N/A'}`);

            if (backup.state === 'READY') {
                cli.output(`\n📋 To restore from this backup:`);
                cli.output(`   monk do namespace/firestore restore backup_name="${backupName}" target_database="restored-db"`);
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
     * - monk do namespace/firestore delete-backup backup_name="projects/.../backups/backup-id"
     *
     * @param args Required arguments:
     *   - backup_name: Full backup resource name
     */
    @action("delete-backup")
    deleteBackup(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🗑️ DELETE BACKUP - READ CAREFULLY!`);
        cli.output(`==================================================`);

        const backupName = args?.backup_name as string | undefined;
        if (!backupName) {
            throw new Error(
                "'backup_name' is required.\n" +
                "Usage: monk do namespace/firestore delete-backup backup_name=\"projects/.../backups/backup-id\"\n" +
                "\nTo find backup names, run: monk do namespace/firestore list-backups location=\"us-central1\""
            );
        }

        try {
            // First verify the backup exists
            const url = `${FIRESTORE_API_URL}/${backupName}`;
            const backup = this.get(url);

            cli.output(`\n⚠️  WARNING: This will permanently delete the backup!`);
            cli.output(`   Backup: ${backupName}`);
            cli.output(`   Database: ${backup.database}`);
            cli.output(`   Snapshot Time: ${backup.snapshotTime || 'N/A'}`);
            cli.output(`--------------------------------------------------`);

            // Delete the backup
            this.httpDelete(url);

            cli.output(`\n✅ Backup deleted successfully!`);
            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to delete backup`);
            throw new Error(`Delete backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Restore a Firestore database from a backup or point-in-time
     *
     * Creates a NEW database by restoring from a backup or using PITR.
     * The original database is NOT affected.
     *
     * Usage:
     * - monk do namespace/firestore restore backup_name="projects/.../backups/backup-id" target_database="restored-db"
     * - monk do namespace/firestore restore restore_time="2024-01-15T10:00:00Z" target_database="pitr-db"
     *
     * @param args Required/Optional arguments:
     *   - backup_name: Full backup resource name (required unless using restore_time)
     *   - restore_time: ISO 8601 timestamp for point-in-time restore (alternative to backup_name)
     *   - target_database: ID for the new restored database (required, 4-63 chars)
     */
    @action("restore")
    restoreDatabase(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🔄 RESTORE FIRESTORE DATABASE`);
        cli.output(`==================================================`);
        cli.output(`Project: ${this.projectId}`);

        const backupName = args?.backup_name as string | undefined;
        const targetDatabase = args?.target_database as string | undefined;

        if (!backupName) {
            throw new Error(
                "'backup_name' is required.\n" +
                "Usage:\n" +
                "  monk do namespace/firestore restore backup_name=\"projects/.../backups/...\" target_database=\"new-db\"\n" +
                "\nTo find backup names, run: monk do namespace/firestore list-backups location=\"us-central1\"\n" +
                "\n⚠️  Note: Firestore does not support database-level PITR restore.\n" +
                "   For point-in-time data recovery, use export-documents with a specific timestamp,\n" +
                "   or read historical document versions directly (if PITR is enabled)."
            );
        }

        if (!targetDatabase) {
            throw new Error(
                "'target_database' is required.\n" +
                "Specify an ID for the new restored database (4-63 characters, starting with a letter)."
            );
        }

        // Validate target database ID
        if (targetDatabase.length < 4 || targetDatabase.length > 63) {
            throw new Error("target_database must be 4-63 characters long");
        }

        cli.output(`\n📋 Restore Configuration:`);
        cli.output(`   Source: Backup`);
        cli.output(`   Backup Name: ${backupName}`);
        cli.output(`   Target Database: ${targetDatabase}`);
        cli.output(`--------------------------------------------------`);

        cli.output(`\n⚠️  NOTE: This will create a NEW database.`);
        cli.output(`   The original database will NOT be affected.`);

        const body = {
            databaseId: targetDatabase,
            backup: backupName,
        };

        try {
            const url = `${FIRESTORE_API_URL}/projects/${this.projectId}/databases:restore`;
            const operation = this.post(url, body);

            cli.output(`\n✅ Restore operation initiated successfully!`);
            cli.output(`Operation: ${operation.name}`);
            cli.output(`\n⏳ The new database is being restored. This may take several minutes.`);
            cli.output(`   The database will be unavailable until the operation completes.`);
            cli.output(`\n📋 To check restore progress:`);
            cli.output(`   monk do namespace/firestore get-restore-status operation_name="${operation.name}"`);
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to restore database`);
            throw new Error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check the status of a restore operation
     *
     * Usage:
     * - monk do namespace/firestore get-restore-status operation_name="projects/.../operations/..."
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
            throw new Error(
                "'operation_name' is required.\n" +
                "Usage: monk do namespace/firestore get-restore-status operation_name=\"projects/.../operations/...\"\n"
            );
        }

        cli.output(`Operation: ${operationName}`);
        cli.output(`--------------------------------------------------`);

        try {
            const url = `${FIRESTORE_API_URL}/${operationName}`;
            const operation = this.get(url);

            cli.output(`\n📋 Operation Details`);
            cli.output(`   Name: ${operation.name}`);
            cli.output(`   Done: ${operation.done ? '✅ Yes' : '⏳ No'}`);

            if (operation.metadata) {
                const metadata = operation.metadata;
                if (metadata.database) {
                    cli.output(`   Database: ${metadata.database}`);
                }
                if (metadata.operationType) {
                    cli.output(`   Operation Type: ${metadata.operationType}`);
                }
                if (metadata.progressPercentage !== undefined) {
                    cli.output(`   Progress: ${metadata.progressPercentage}%`);
                }
            }

            if (operation.done) {
                if (operation.error) {
                    cli.output(`\n❌ Operation failed!`);
                    cli.output(`   Error: ${operation.error.message || JSON.stringify(operation.error)}`);
                } else {
                    cli.output(`\n✅ Operation completed successfully!`);
                    if (operation.response) {
                        cli.output(`   Restored Database: ${operation.response.name || 'Created'}`);
                    }
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
     * Get status icon for backup state
     */
    private getBackupStatusIcon(state?: string): string {
        const stateUpper = (state || '').toUpperCase();
        switch (stateUpper) {
            case 'READY':
                return '📸';
            case 'CREATING':
                return '⏳';
            case 'NOT_AVAILABLE':
                return '❌';
            default:
                return '📷';
        }
    }
}
