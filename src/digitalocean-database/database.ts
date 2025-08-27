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
     * @description The database engine to use (mysql, pg, redis, mongodb, kafka, opensearch)
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