import { AzurePostgreSQLEntity, AzurePostgreSQLDefinition, AzurePostgreSQLState } from "./azure-postgresql-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for Azure PostgreSQL Database.
 * Configures the database properties within a Flexible Server.
 * @interface DatabaseDefinition
 */
export interface DatabaseDefinition extends AzurePostgreSQLDefinition {
    /**
     * @description Name of the parent PostgreSQL Flexible Server
     */
    server_name: string;

    /**
     * @description Database name (1-63 chars, alphanumeric and underscores)
     */
    database_name: string;

    /**
     * @description Character set for the database
     * @default "UTF8"
     */
    charset?: string;

    /**
     * @description Collation for the database
     * @default "en_US.utf8"
     */
    collation?: string;
}

/**
 * State interface for Azure PostgreSQL Database.
 * Contains runtime information about the created database.
 * @interface DatabaseState
 */
export interface DatabaseState extends AzurePostgreSQLState {
    /**
     * @description Database name (primary identifier)
     */
    database_name?: string;

    /**
     * @description Parent server name
     */
    server_name?: string;

    /**
     * @description Character set
     */
    charset?: string;

    /**
     * @description Collation
     */
    collation?: string;
}

/**
 * @description Azure PostgreSQL Database entity.
 * Creates and manages databases within Azure Database for PostgreSQL Flexible Servers.
 * 
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.database_name` - Database name for connection strings
 * - `state.server_name` - Parent server name
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `azure-postgresql/flexible-server` - Parent server that hosts the database
 */
export class Database extends AzurePostgreSQLEntity<DatabaseDefinition, DatabaseState> {

    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    protected getEntityName(): string {
        return `${this.definition.server_name}/${this.definition.database_name}`;
    }

    protected getResourceType(): string {
        return `flexibleServers/${this.definition.server_name}/databases`;
    }

    /** Create a new PostgreSQL database */
    override create(): void {
        // Check if database already exists
        const existingDb = this.checkResourceExists(this.definition.database_name);

        if (existingDb) {
            // Database already exists, use it
            const properties = existingDb.properties as Record<string, unknown> | undefined;
            
            this.state = {
                database_name: typeof existingDb.name === 'string' ? existingDb.name : this.definition.database_name,
                server_name: this.definition.server_name,
                charset: typeof properties?.charset === 'string' ? properties.charset : undefined,
                collation: typeof properties?.collation === 'string' ? properties.collation : undefined,
                existing: true
            };
            cli.output(`✅ PostgreSQL Database ${this.definition.database_name} already exists on server ${this.definition.server_name}`);
            return;
        }

        // Skip creation if create_when_missing is false and resource doesn't exist
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  PostgreSQL Database ${this.definition.database_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body for database creation
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {
                charset: this.definition.charset || "UTF8",
                collation: this.definition.collation || "en_US.utf8"
            }
        };

        // Create the database
        const path = this.buildResourcePath(this.definition.database_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create PostgreSQL Database: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Set state from created database
        const properties = responseData?.properties as Record<string, unknown> | undefined;
        this.state = {
            database_name: this.definition.database_name,
            server_name: this.definition.server_name,
            charset: typeof properties?.charset === 'string' ? properties.charset : this.definition.charset || "UTF8",
            collation: typeof properties?.collation === 'string' ? properties.collation : this.definition.collation || "en_US.utf8",
            existing: false
        };

        cli.output(`✅ Created PostgreSQL Database: ${this.definition.database_name} on server ${this.definition.server_name}`);
    }

    override update(): void {
        if (!this.state.database_name) {
            this.create();
            return;
        }

        // PostgreSQL databases have limited update capabilities
        // Charset and collation cannot be changed after creation
        cli.output(`ℹ️  PostgreSQL Database ${this.definition.database_name} - charset and collation cannot be modified after creation`);
    }

    override delete(): void {
        if (!this.state.database_name) {
            cli.output("PostgreSQL Database does not exist, nothing to delete");
            return;
        }

        if (this.state.existing) {
            cli.output(`Database ${this.state.database_name} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            // Use state.database_name for API calls - it contains the canonical name from Azure
            const path = this.buildResourcePath(this.state.database_name);
            const response = this.makeAzureRequest("DELETE", path);
            
            if (response.error) {
                if (response.statusCode === 404) {
                    cli.output(`⚠️  Database ${this.state.database_name} not found, may have been already deleted`);
                    return;
                }
                throw new Error(`${response.error}, body: ${response.body}`);
            }
            
            cli.output(`✅ Successfully initiated deletion of database ${this.state.database_name}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to delete database: ${errorMessage}`);
        }
    }

    override checkReadiness(): boolean {
        // If create_when_missing is false and resource doesn't exist, consider it ready
        // This check must come first because state.database_name won't be set in this case
        if (this.definition.create_when_missing === false && this.state.existing === false) {
            return true;
        }

        if (!this.state.database_name) {
            return false;
        }

        try {
            // Check if database exists - use state.database_name for API calls (canonical name from Azure)
            const db = this.checkResourceExists(this.state.database_name);
            
            if (!db) {
                cli.output(`⏳ PostgreSQL Database ${this.state.database_name} not found`);
                return false;
            }

            // Database exists, it's ready
            cli.output(`✅ PostgreSQL Database ${this.state.database_name} is ready`);
            
            // Update state with current information
            const properties = db.properties as Record<string, unknown> | undefined;
            this.state.charset = typeof properties?.charset === 'string' ? properties.charset : undefined;
            this.state.collation = typeof properties?.collation === 'string' ? properties.collation : undefined;
            
            return true;
        } catch (error) {
            cli.output(`⚠️  Failed to check PostgreSQL Database readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    // ========================================
    // Custom Actions
    // ========================================

    /**
     * Get database information
     * 
     * Usage:
     *   monk do namespace/database get-info
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📊 PostgreSQL Database Information`);
        cli.output(`==================================================`);

        if (!this.state.database_name) {
            throw new Error("Database does not exist. Create the database first.");
        }

        try {
            // Use state.database_name for API calls - it contains the canonical name from Azure
            const db = this.checkResourceExists(this.state.database_name!);
            
            if (!db) {
                throw new Error(`Database ${this.state.database_name} not found`);
            }

            const properties = db.properties as Record<string, unknown> | undefined;

            cli.output(`\n📋 Database Details:`);
            cli.output(`   Database Name: ${db.name}`);
            cli.output(`   Server Name: ${this.definition.server_name}`);
            cli.output(`   Charset: ${properties?.charset || 'N/A'}`);
            cli.output(`   Collation: ${properties?.collation || 'N/A'}`);
            cli.output(`   Resource ID: ${db.id || 'N/A'}`);

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get database info`);
            throw new Error(`Get info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
