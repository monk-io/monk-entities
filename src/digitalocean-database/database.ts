import { action, Args } from "monkec/base";
import { DOProviderEntity, DOProviderDefinitionBase, DOProviderStateBase } from "./do-provider-base.ts";
import { 
    DatabaseEngine, 
    DatabaseRegion, 
    DatabaseSize, 
    DatabaseStatus,
    validateDatabaseEngine,
    validateDatabaseRegion,
    validateDatabaseSize
} from "./common.ts";
import cli from "cli";

/**
 * Defines the immutable configuration properties for a DigitalOcean Database entity.
 */
export interface DatabaseDefinition extends DOProviderDefinitionBase {
    /**
     * Database cluster name
     * @description Name of the database cluster (3-63 characters, alphanumeric and hyphens only)
     */
    name: string;

    /**
     * Database engine type
     * @description The database engine to use (mysql, pg, valkey, mongodb, kafka, opensearch)
     */
    engine: DatabaseEngine;

    /**
     * Database engine version
     * @description Version of the database engine (optional, uses latest if not specified)
     */
    version?: string;

    /**
     * Number of nodes in the cluster
     * @description Number of nodes for the database cluster (1 for single node, 2+ for cluster)
     * @minimum 1
     * @maximum 10
     */
    num_nodes: number;

    /**
     * Database region
     * @description The DigitalOcean region where the database will be created
     */
    region: DatabaseRegion;

    /**
     * Database size
     * @description The size/performance tier of the database cluster
     */
    size: DatabaseSize;

    /**
     * Optional tags for the database
     * @description Tags to apply to the database cluster
     */
    tags?: string[];

    /**
     * Private networking VPC UUID
     * @description VPC UUID for private networking (optional)
     */
    private_network_uuid?: string;

    /**
     * Database configuration settings
     * @description Engine-specific configuration settings
     */
    db_config?: Record<string, any>;
}

/**
 * Represents the mutable runtime state of a DigitalOcean Database.
 */
export interface DigitalOceanDatabaseState extends DOProviderStateBase {
    /**
     * Database cluster ID
     */
    id?: string;

    /**
     * Database cluster name
     */
    name?: string;

    /**
     * Database engine
     */
    engine?: string;

    /**
     * Database version
     */
    version?: string;

    /**
     * Current status of the database
     */
    status?: DatabaseStatus;

    /**
     * Number of nodes
     */
    num_nodes?: number;

    /**
     * Database region
     */
    region?: string;

    /**
     * Database size
     */
    size?: string;

    /**
     * Database connection details
     */
    connection?: { // outdated: use connection_* instead
        uri?: string;
        host?: string;
        port?: number;
        user?: string;
        password?: string;
        database?: string;
        ssl?: boolean;
    };
    connection_uri?: string;
    connection_password?: string;
    connection_host?: string;
    connection_port?: number;
    connection_user?: string;
    connection_database?: string;
    connection_ssl?: boolean;

    /**
     * Creation timestamp
     */
    created_at?: string;

    /**
     * Tags applied to the database
     */
    tags?: string[];
}

/**
 * DigitalOcean Database cluster entity for managing database instances.
 * 
 * This entity provides complete lifecycle management for DigitalOcean database clusters
 * including creation, updates, deletion, and monitoring operations.
 */
export class Database extends DOProviderEntity<
    DatabaseDefinition,
    DigitalOceanDatabaseState
> {

    protected getEntityName(): string {
        return `DigitalOcean Database: ${this.definition.name}`;
    }

    create(): void {
        cli.output(`🚀 Creating DigitalOcean database cluster: ${this.definition.name}`);

        // Validate configuration
        const validatedEngine = validateDatabaseEngine(this.definition.engine);
        const validatedRegion = validateDatabaseRegion(this.definition.region);
        const validatedSize = validateDatabaseSize(this.definition.size);

        // Check if database already exists
        const existingDatabase = this.findExistingDatabase();
        if (existingDatabase) {
            cli.output(`✅ Database cluster ${this.definition.name} already exists`);
            this.state.existing = true;
            this.updateStateFromDatabase(existingDatabase);
            return;
        }

        // Prepare database creation request
        const createRequest = {
            name: this.definition.name,
            engine: validatedEngine,
            version: this.definition.version,
            region: validatedRegion,
            size: validatedSize,
            num_nodes: this.definition.num_nodes,
            tags: this.definition.tags || [],
            private_network_uuid: this.definition.private_network_uuid,
            db_config: this.definition.db_config || {}
        };

        // Remove undefined values
        Object.keys(createRequest).forEach(key => {
            if (createRequest[key as keyof typeof createRequest] === undefined) {
                delete createRequest[key as keyof typeof createRequest];
            }
        });

        try {
            const response = this.makeRequest("POST", "/databases", createRequest);
            
            if (response.database) {
                this.updateStateFromDatabase(response.database);
                cli.output(`✅ Database cluster creation initiated: ${this.state.id}`);
            } else {
                throw new Error("Invalid response from DigitalOcean API - no database object returned");
            }
        } catch (error) {
            throw new Error(`Failed to create database cluster: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    update(): void {
        if (!this.state.id) {
            throw new Error("Cannot update database - no database ID in state");
        }

        cli.output(`🔄 Checking for DigitalOcean database cluster updates: ${this.state.id}`);

        let hasUpdates = false;

        // Check if size changed - use resize endpoint
        if (this.definition.size !== this.state.size) {
            cli.output(`📏 Resizing database cluster to: ${this.definition.size}`);
            try {
                this.makeRequest("PUT", `/databases/${this.state.id}/resize`, {
                    size: validateDatabaseSize(this.definition.size),
                    num_nodes: this.definition.num_nodes
                });
                cli.output(`✅ Database cluster resize initiated`);
                hasUpdates = true;
            } catch (error) {
                throw new Error(`Failed to resize database cluster: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        // Check if node count changed (only if size didn't change)
        else if (this.definition.num_nodes !== this.state.num_nodes) {
            cli.output(`🔢 Changing node count to: ${this.definition.num_nodes}`);
            try {
                this.makeRequest("PUT", `/databases/${this.state.id}/resize`, {
                    size: this.state.size,
                    num_nodes: this.definition.num_nodes
                });
                cli.output(`✅ Database cluster node count change initiated`);
                hasUpdates = true;
            } catch (error) {
                throw new Error(`Failed to change node count: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        // Tags cannot be updated via API for DigitalOcean databases
        if (JSON.stringify(this.definition.tags || []) !== JSON.stringify(this.state.tags || [])) {
            cli.output(`⚠️  Note: Tags cannot be updated for existing DigitalOcean database clusters`);
            cli.output(`   Current tags will remain: ${(this.state.tags || []).join(', ')}`);
        }

        if (!hasUpdates) {
            cli.output("⚪ No supported changes detected, skipping update");
            return;
        }

        // Wait for the resize operation to complete
        cli.output("⏳ Waiting for database cluster update to complete...");
        this.waitForDatabaseStatus(this.state.id!, "online", 60); // 60 attempts
        
        // Refresh state after update
        try {
            const response = this.makeRequest("GET", `/databases/${this.state.id}`);
            if (response.database) {
                this.updateStateFromDatabase(response.database);
                cli.output(`✅ Database cluster updated successfully`);
            }
        } catch (error) {
            cli.output(`⚠️  Update completed but failed to refresh state: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    delete(): void {
        if (!this.state.id) {
            cli.output("⚪ No database ID in state, nothing to delete");
            return;
        }

        this.deleteResource(`/databases/${this.state.id}`, `database cluster ${this.state.name || this.state.id}`);
        
        // Clear state after successful deletion
        this.state.id = undefined;
        this.state.status = undefined;
        this.state.connection = undefined;
    }

    checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        try {
            const response = this.makeRequest("GET", `/databases/${this.state.id}`);
            
            if (response.database) {
                this.updateStateFromDatabase(response.database);
                
                const isReady = this.state.status === "online";
                if (isReady) {
                    cli.output(`✅ Database cluster ${this.state.id} is ready`);
                } else {
                    cli.output(`⏳ Database cluster ${this.state.id} status: ${this.state.status}`);
                }
                
                return isReady;
            }
            
            return false;
        } catch (error) {
            cli.output(`❌ Failed to check database readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    /**
     * Get current database information
     */
    @action("getDatabase")
    getDatabase(_args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        try {
            const response = this.makeRequest("GET", `/databases/${this.state.id}`);
            
            if (response.database) {
                this.updateStateFromDatabase(response.database);
                
                cli.output(`📊 Database Information:`);
                cli.output(`   ID: ${response.database.id}`);
                cli.output(`   Name: ${response.database.name}`);
                cli.output(`   Engine: ${response.database.engine} v${response.database.version}`);
                cli.output(`   Status: ${response.database.status}`);
                cli.output(`   Region: ${response.database.region}`);
                cli.output(`   Size: ${response.database.size}`);
                cli.output(`   Nodes: ${response.database.num_nodes}`);
                cli.output(`   Created: ${response.database.created_at}`);
                
                if (response.database.connection) {
                    cli.output(`\n🔗 Connection Details:`);
                    cli.output(`   Host: ${response.database.connection.host}`);
                    cli.output(`   Port: ${response.database.connection.port}`);
                    cli.output(`   User: ${response.database.connection.user}`);
                    cli.output(`   SSL: ${response.database.connection.ssl ? 'enabled' : 'disabled'}`);
                }
            } else {
                throw new Error("Database not found");
            }
        } catch (error) {
            throw new Error(`Failed to get database info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all databases for users in the cluster
     */
    @action("listDatabases")
    listDatabases(_args: Args): string {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        try {
            const response = this.makeRequest("GET", `/databases/${this.state.id}/dbs`);
            const databases = response.dbs || [];
            
            cli.output(`📋 Databases in cluster "${this.state.name}" (${databases.length} total):`);
            
            if (databases.length === 0) {
                cli.output("   No databases found");
            } else {
                databases.forEach((db: any, index: number) => {
                    cli.output(`   ${index + 1}. ${db.name}`);
                });
            }
            
            cli.output(`\nCluster ID: ${this.state.id}`);
            cli.output(`Engine: ${this.state.engine}`);
            
            // Return formatted string
            let result = `📋 Databases in cluster "${this.state.name}" (${databases.length} total):\n`;
            
            if (databases.length === 0) {
                result += "   No databases found\n";
            } else {
                databases.forEach((db: any, index: number) => {
                    result += `   ${index + 1}. ${db.name}\n`;
                });
            }
            
            result += `\nCluster ID: ${this.state.id}\n`;
            result += `Engine: ${this.state.engine}`;
            
            return result;
        } catch (error) {
            throw new Error(`Failed to list databases: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a new database within the cluster
     */
    @action("createDatabase")
    createDatabase(args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        const dbName = args.db_name;
        if (!dbName) {
            throw new Error("Database name is required (use --db_name=your_database_name)");
        }

        try {
            this.makeRequest("POST", `/databases/${this.state.id}/dbs`, {
                name: dbName
            });
            
            cli.output(`✅ Successfully created database "${dbName}"`);
            cli.output(`   Cluster: ${this.state.name}`);
            cli.output(`   Engine: ${this.state.engine}`);
            cli.output(`   Cluster ID: ${this.state.id}`);
        } catch (error) {
            throw new Error(`Failed to create database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete a database from the cluster
     */
    @action("deleteDatabase")
    deleteDatabase(args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        const dbName = args.db_name;
        if (!dbName) {
            throw new Error("Database name is required (use --db_name=your_database_name)");
        }

        try {
            this.makeRequest("DELETE", `/databases/${this.state.id}/dbs/${dbName}`);
            
            cli.output(`✅ Successfully deleted database "${dbName}"`);
            cli.output(`   Cluster: ${this.state.name}`);
            cli.output(`   Cluster ID: ${this.state.id}`);
        } catch (error) {
            throw new Error(`Failed to delete database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get database connection information
     */
    @action("getConnectionInfo")
    getConnectionInfo(_args: Args): void {
        if (!this.state.connection) {
            throw new Error("No connection information available");
        }

        cli.output(`🔗 Connection Information for "${this.state.name}":`);
        cli.output(`   Engine: ${this.state.engine}`);
        cli.output(`   Host: ${this.state.connection_host}`);
        cli.output(`   Port: ${this.state.connection_port}`);
        cli.output(`   User: ${this.state.connection_user}`);
        cli.output(`   Database: ${this.state.connection_database}`);
        cli.output(`   SSL: ${this.state.connection_ssl ? 'enabled' : 'disabled'}`);
        
        if (this.state.connection_uri) {
            cli.output(`\n📋 Connection URI:`);
            cli.output(`   ${this.state.connection_uri}`);
        }
    }

    /**
     * Resize database cluster
     */
    @action("resizeCluster")
    resizeCluster(args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        const newSize = args.size;
        const newNodeCount = args.num_nodes;

        if (!newSize && !newNodeCount) {
            throw new Error("Either size or num_nodes parameter is required (use --size=db-s-2vcpu-4gb or --num_nodes=3)");
        }

        const resizeRequest: any = {
            size: newSize || this.state.size,
            num_nodes: newNodeCount ? parseInt(newNodeCount) : this.state.num_nodes
        };

        try {
            cli.output(`📏 Resizing database cluster...`);
            cli.output(`   Current: ${this.state.size} with ${this.state.num_nodes} nodes`);
            cli.output(`   New: ${resizeRequest.size} with ${resizeRequest.num_nodes} nodes`);
            
            this.makeRequest("PUT", `/databases/${this.state.id}/resize`, resizeRequest);
            
            cli.output(`✅ Database cluster resize initiated`);
            cli.output(`⏳ This operation may take several minutes to complete`);
            cli.output(`   Use 'monk do <entity>/get-database' to check status`);
        } catch (error) {
            throw new Error(`Failed to resize database cluster: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // ==================== BACKUP & RESTORE ACTIONS ====================

    /**
     * Get backup configuration and status for the database cluster.
     * DigitalOcean managed databases have automatic daily backups with 7-day retention.
     */
    @action("get-backup-info")
    getBackupInfo(_args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        cli.output(`💾 Backup Information for "${this.state.name}":`);
        cli.output(`   Cluster ID: ${this.state.id}`);
        cli.output(`   Engine: ${this.state.engine} v${this.state.version}`);
        cli.output(`\n📅 Backup Configuration:`);
        cli.output(`   Automatic Backups: Enabled (always on)`);
        cli.output(`   Backup Frequency: Daily`);
        cli.output(`   Retention Period: 7 days`);
        cli.output(`   Backup Window: Managed by DigitalOcean`);
        
        // Check engine-specific PITR support
        const supportsPitr = this.state.engine === "pg" || this.state.engine === "mysql";
        cli.output(`\n⏱️  Point-in-Time Recovery (PITR):`);
        if (supportsPitr) {
            cli.output(`   Status: Supported`);
            cli.output(`   Recovery Window: Up to 7 days`);
            cli.output(`   Note: Use restore action with restore_time parameter`);
        } else {
            cli.output(`   Status: Not supported for ${this.state.engine}`);
            cli.output(`   Note: Only PostgreSQL and MySQL support PITR`);
        }
        
        cli.output(`\n🔄 Restore Options:`);
        cli.output(`   Fork from backup: Creates a new cluster from backup`);
        cli.output(`   In-place restore: Not supported (use fork instead)`);
        
        cli.output(`\n💡 Use 'list-backups' to see available backup points`);
    }

    /**
     * List all available backups for the database cluster.
     * Returns backup timestamps that can be used for restore operations.
     */
    @action("list-backups")
    listBackups(_args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        try {
            const response = this.makeRequest("GET", `/databases/${this.state.id}/backups`);
            const backups = response.backups || [];
            
            cli.output(`💾 Available Backups for "${this.state.name}":`);
            cli.output(`   Cluster ID: ${this.state.id}`);
            cli.output(`   Engine: ${this.state.engine}`);
            cli.output(`   Total Backups: ${backups.length}`);
            cli.output(``);
            
            if (backups.length === 0) {
                cli.output(`   No backups found yet.`);
                cli.output(`   Note: First backup may take up to 24 hours after cluster creation.`);
            } else {
                cli.output(`📋 Backup List:`);
                backups.forEach((backup: any, index: number) => {
                    const createdAt = backup.created_at || "Unknown";
                    const sizeGb = backup.size_gigabytes ? `${backup.size_gigabytes} GB` : "N/A";
                    cli.output(`   ${index + 1}. Created: ${createdAt}`);
                    cli.output(`      Size: ${sizeGb}`);
                    if (index < backups.length - 1) {
                        cli.output(``);
                    }
                });
            }
            
            cli.output(`\n💡 To restore from a backup, use:`);
            cli.output(`   monk do <entity>/restore --new_cluster_name=<name> --backup_created_at=<timestamp>`);
        } catch (error) {
            throw new Error(`Failed to list backups: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get details of a specific backup by timestamp.
     * @param backup_created_at - The timestamp of the backup (from list-backups)
     */
    @action("describe-backup")
    describeBackup(args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        const backupCreatedAt = args.backup_created_at;
        if (!backupCreatedAt) {
            throw new Error("backup_created_at is required (use --backup_created_at=2024-01-15T00:00:00Z)");
        }

        try {
            const response = this.makeRequest("GET", `/databases/${this.state.id}/backups`);
            const backups = response.backups || [];
            
            // Find the specific backup by timestamp
            const backup = backups.find((b: any) => b.created_at === backupCreatedAt);
            
            if (!backup) {
                cli.output(`❌ Backup not found with timestamp: ${backupCreatedAt}`);
                cli.output(`\n💡 Use 'list-backups' to see available backup timestamps`);
                return;
            }
            
            cli.output(`💾 Backup Details:`);
            cli.output(`   Cluster: ${this.state.name}`);
            cli.output(`   Cluster ID: ${this.state.id}`);
            cli.output(`   Engine: ${this.state.engine} v${this.state.version}`);
            cli.output(``);
            cli.output(`📋 Backup Information:`);
            cli.output(`   Created At: ${backup.created_at}`);
            cli.output(`   Size: ${backup.size_gigabytes ? `${backup.size_gigabytes} GB` : 'N/A'}`);
            
            cli.output(`\n🔄 To restore this backup:`);
            cli.output(`   monk do <entity>/restore --new_cluster_name=my-restored-db --backup_created_at=${backupCreatedAt}`);
        } catch (error) {
            throw new Error(`Failed to describe backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Restore (fork) a new database cluster from a backup.
     * This creates a NEW cluster - it does not restore in-place.
     * 
     * @param new_cluster_name - Name for the new forked cluster (required)
     * @param backup_created_at - Backup timestamp for exact backup restore (optional for PITR engines)
     * @param restore_time - Point-in-time to restore to (ISO 8601, only for pg/mysql)
     * @param size - Size for new cluster (optional, defaults to source size)
     * @param num_nodes - Number of nodes for new cluster (optional, defaults to 1)
     * @param region - Region for new cluster (optional, defaults to source region)
     */
    @action("restore")
    restore(args: Args): void {
        if (!this.state.id) {
            throw new Error("No database ID available");
        }

        const newClusterName = args.new_cluster_name;
        if (!newClusterName) {
            throw new Error("new_cluster_name is required (use --new_cluster_name=my-restored-db)");
        }

        const backupCreatedAt = args.backup_created_at;
        const restoreTime = args.restore_time;

        // Validate restore point timestamps
        const supportsPitr = this.state.engine === "pg" || this.state.engine === "mysql";
        
        if (!backupCreatedAt && !restoreTime) {
            // No timestamp provided at all
            if (supportsPitr) {
                throw new Error("Either backup_created_at or restore_time is required. Use --backup_created_at=<timestamp> for backup restore or --restore_time=<timestamp> for point-in-time recovery.");
            } else {
                throw new Error(`backup_created_at is required for ${this.state.engine}. Use --backup_created_at=<timestamp> from list-backups.`);
            }
        }
        
        if (!supportsPitr && !backupCreatedAt) {
            // Non-PITR engine but only restore_time provided
            throw new Error(`backup_created_at is required for ${this.state.engine} (only PostgreSQL and MySQL support point-in-time recovery)`);
        }

        // Build the fork request
        const forkRequest: any = {
            name: newClusterName,
            engine: this.state.engine,
            version: this.state.version,
            region: args.region || this.state.region,
            size: args.size || this.state.size,
            num_nodes: args.num_nodes ? parseInt(args.num_nodes) : 1,
            backup_restore: {
                database_name: this.state.name
            }
        };

        // Add backup timestamp or restore time
        // PITR (restore_time) takes precedence over backup_created_at for PITR-supporting engines
        let actualRestorePoint: string | undefined;
        let isPitrRestore = false;
        
        if (restoreTime && supportsPitr) {
            // PITR takes precedence for engines that support it
            forkRequest.backup_restore.backup_created_at = restoreTime;
            actualRestorePoint = restoreTime;
            isPitrRestore = true;
        } else if (backupCreatedAt) {
            forkRequest.backup_restore.backup_created_at = backupCreatedAt;
            actualRestorePoint = backupCreatedAt;
        }

        try {
            cli.output(`🔄 Initiating database restore (fork)...`);
            cli.output(`   Source Cluster: ${this.state.name}`);
            cli.output(`   New Cluster Name: ${newClusterName}`);
            cli.output(`   Engine: ${this.state.engine} v${this.state.version}`);
            cli.output(`   Region: ${forkRequest.region}`);
            cli.output(`   Size: ${forkRequest.size}`);
            cli.output(`   Nodes: ${forkRequest.num_nodes}`);
            if (actualRestorePoint) {
                if (isPitrRestore) {
                    cli.output(`   Restore Point (PITR): ${actualRestorePoint}`);
                } else {
                    cli.output(`   Restore Point: ${actualRestorePoint}`);
                }
            }
            
            const response = this.makeRequest("POST", "/databases", forkRequest);
            
            if (response.database) {
                cli.output(`\n✅ Database fork initiated successfully!`);
                cli.output(`   New Cluster ID: ${response.database.id}`);
                cli.output(`   Status: ${response.database.status}`);
                cli.output(`\n⏳ The fork operation may take several minutes.`);
                cli.output(`   Use 'get-restore-status --cluster_id=${response.database.id}' to check progress.`);
                cli.output(`\n⚠️  Important: The new cluster is independent and not managed by this entity.`);
                cli.output(`   To manage it with Monk, create a new entity definition.`);
            } else {
                throw new Error("Invalid response from DigitalOcean API - no database object returned");
            }
        } catch (error) {
            throw new Error(`Failed to restore database: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check the status of a restore (fork) operation.
     * @param cluster_id - The ID of the new forked cluster
     */
    @action("get-restore-status")
    getRestoreStatus(args: Args): void {
        const clusterId = args.cluster_id;
        if (!clusterId) {
            throw new Error("cluster_id is required (use --cluster_id=<new-cluster-id>)");
        }

        try {
            const response = this.makeRequest("GET", `/databases/${clusterId}`);
            
            if (response.database) {
                const db = response.database;
                cli.output(`🔄 Restore Status for cluster: ${db.name}`);
                cli.output(`   Cluster ID: ${db.id}`);
                cli.output(`   Status: ${db.status}`);
                cli.output(`   Engine: ${db.engine} v${db.version}`);
                cli.output(`   Region: ${db.region}`);
                cli.output(`   Size: ${db.size}`);
                cli.output(`   Nodes: ${db.num_nodes}`);
                cli.output(`   Created: ${db.created_at}`);
                
                if (db.status === "online") {
                    cli.output(`\n✅ Restore completed! Cluster is online and ready.`);
                    if (db.connection) {
                        cli.output(`\n🔗 Connection Details:`);
                        cli.output(`   Host: ${db.connection.host}`);
                        cli.output(`   Port: ${db.connection.port}`);
                        cli.output(`   User: ${db.connection.user}`);
                    }
                } else if (db.status === "forking") {
                    cli.output(`\n⏳ Restore in progress... This may take several minutes.`);
                } else if (db.status === "creating") {
                    cli.output(`\n⏳ Cluster is being created...`);
                } else {
                    cli.output(`\n⏳ Current status: ${db.status}`);
                }
            } else {
                throw new Error("Database cluster not found");
            }
        } catch (error) {
            throw new Error(`Failed to get restore status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find existing database by name
     */
    private findExistingDatabase(): any | null {
        try {
            const response = this.makeRequest("GET", "/databases");
            
            if (response.databases && Array.isArray(response.databases)) {
                return response.databases.find(
                    (db: any) => db.name === this.definition.name
                );
            }
            
            return null;
        } catch (error) {
            // If we can't list databases, assume it doesn't exist
            return null;
        }
    }

    /**
     * Update internal state from database object
     */
    private updateStateFromDatabase(database: any): void {
        this.state.id = database.id;
        this.state.name = database.name;
        this.state.engine = database.engine;
        this.state.version = database.version;
        this.state.status = database.status;
        this.state.num_nodes = database.num_nodes;
        this.state.region = database.region;
        this.state.size = database.size;
        this.state.created_at = database.created_at;
        this.state.tags = database.tags;
        if (!this.state.connection_uri) {
            this.state.connection_uri = database.connection.uri;
        }
        if (!this.state.connection_password) {
            this.state.connection_password = database.connection.password;
        }
        this.state.connection_host = database.connection.host;
        this.state.connection_port = database.connection.port;
        this.state.connection_user = database.connection.user;
        this.state.connection_database = database.connection.database;
        this.state.connection_ssl = database.connection.ssl;

        // Update connection information if available
        if (database.connection) {
            const connection = this.state.connection || {};
            // Never overwrite once set in state
            if (!connection.uri) {
                    connection.uri = database.connection.uri;

            }
            if (!connection.password) {
                connection.password = database.connection.password
            }

            // Merge others: use API value when present, otherwise keep previous
            connection.host = database.connection.host !== undefined ? database.connection.host : connection.host,
            connection.port = database.connection.port !== undefined ? database.connection.port : connection.port,
            connection.user = database.connection.user !== undefined ? database.connection.user : connection.user,
            connection.database = database.connection.database !== undefined ? database.connection.database : connection.database,
            connection.ssl = database.connection.ssl !== undefined ? database.connection.ssl : connection.ssl
            this.state.connection = connection;
        }
    }
}