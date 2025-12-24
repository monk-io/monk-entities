import secret from "secret";
import cli from "cli";
import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./base.ts";
import { action } from "monkec/base";

/**
 * Client TLS certificate specification
 */
interface DatabaseCertificateSpec {
    /**
     * Certificate name
     */
    name?: string;
    
    /**
     * Certificate content
     */
    certificate: string;
}

/**
 * Database alert specification
 */
interface DatabaseAlertSpec {
    /**
     * Alert name
     */
    name: string;
    
    /**
     * Alert threshold value
     */
    value: number;
}

/**
 * Database module specification
 */
interface DatabaseModuleSpec {
    /**
     * Module name
     */
    name: string;
    
    /**
     * Module parameters
     */
    parameters?: Record<string, any>;
}

/**
 * Replica configuration specification
 */
interface ReplicaOfSpec {
    /**
     * Source database URIs
     */
    uris?: string[];
    
    /**
     * Encryption in transit
     */
    encryptionInTransit?: boolean;
}

/**
 * Essentials database definition - matches Redis Cloud API schema for creating Essentials databases
 * @interface EssentialsDatabaseDefinition
 */
export interface EssentialsDatabaseDefinition extends RedisCloudEntityDefinition {
    /**
     * Database name (required)
     * Database name is limited to 40 characters or less and must include only letters, digits, and hyphens ('-'). 
     * It must start with a letter and end with a letter or digit.
     * @minLength 1
     * @maxLength 40
     */
    name: string;

    /**
     * Subscription ID where the database will be created
     * @minLength 1
     */
    subscription_id: string;

    /**
     * Database protocol
     * Use 'stack' to get all of Redis' advanced capabilities. 
     * Only use 'redis' for Pay-as-you-go or Redis Flex subscriptions. 
     * Default: 'stack' for most subscriptions, 'redis' for Redis Flex subscriptions.
     */
    protocol?: "redis" | "memcached" | "stack";

    /**
     * (Pay-as-you-go subscriptions only) The maximum amount of data in the dataset for this database in GB.
     * You cannot set both datasetSizeInGb and memoryLimitInGb.
     * If 'replication' is 'true', the database's total memory will be twice as large as the datasetSizeInGb.
     * @minimum 0.1
     */
    dataset_size_in_gb?: number;

    /**
     * (Pay-as-you-go subscriptions only) Total memory in GB, including replication and other overhead.
     * You cannot set both datasetSizeInGb and memoryLimitInGb.
     * @minimum 0.1
     * @deprecated Use dataset_size_in_gb instead
     */
    memory_limit_in_gb?: number;

    /**
     * (Pay-as-you-go subscriptions only) Support Redis OSS Cluster API
     */
    support_oss_cluster_api?: boolean;

    /**
     * Redis database version
     * If omitted, the Redis version will be set to the default version
     */
    redis_version?: string;

    /**
     * Redis Serialization Protocol version
     * Must be compatible with Redis version
     */
    resp_version?: "resp2" | "resp3";

    /**
     * (Pay-as-you-go subscriptions only) If set to 'true', the database will use the external endpoint for OSS Cluster API.
     * This setting blocks the database's private endpoint. Can only be set if 'support_oss_cluster_api' is 'true'.
     */
    use_external_endpoint_for_oss_cluster_api?: boolean;

    /**
     * (Pay-as-you-go subscriptions only) Distributes database data to different cloud instances
     */
    enable_database_clustering?: boolean;

    /**
     * (Pay-as-you-go subscriptions only) Specifies the number of master shards
     */
    number_of_shards?: number;

    /**
     * Type and rate of data persistence in persistent storage
     */
    data_persistence?: "none" | "aof-every-1-second" | "aof-every-write" | "snapshot-every-1-hour" | "snapshot-every-6-hours" | "snapshot-every-12-hours";

    /**
     * Data eviction policy
     */
    data_eviction_policy?: "allkeys-lru" | "allkeys-lfu" | "allkeys-random" | "volatile-lru" | "volatile-lfu" | "volatile-random" | "volatile-ttl" | "noeviction";

    /**
     * Sets database replication
     */
    replication?: boolean;

    /**
     * The path to a backup storage location. 
     * If specified, the database will back up every 24 hours to this location, and you can manually back up the database to this location at any time.
     */
    periodic_backup_path?: string;

    /**
     * List of source IP addresses or subnet masks to allow.
     * If specified, Redis clients will be able to connect to this database only from within the specified source IP addresses ranges.
     * Example: ['192.168.10.0/32', '192.168.12.0/24']
     */
    source_ips?: string[];

    /**
     * (Pay-as-you-go subscriptions only) Hashing policy Regex rules. 
     * Used only if 'enable_database_clustering' is set to 'true'
     */
    regex_rules?: string[];

    /**
     * Changes Replica Of (also known as Active-Passive) configuration details
     */
    replica?: ReplicaOfSpec;

    /**
     * A list of client TLS/SSL certificates
     * If specified, mTLS authentication will be required to authenticate user connections
     */
    client_tls_certificates?: DatabaseCertificateSpec[];

    /**
     * When 'true', requires TLS authentication for all connections
     * mTLS with valid clientTlsCertificates, regular TLS when clientTlsCertificates is not provided
     */
    enable_tls?: boolean;

    /**
     * Database password secret name
     */
    password_secret_ref?: string;

    /**
     * Redis database alert details
     */
    alerts?: DatabaseAlertSpec[];

    /**
     * Redis advanced capabilities (also known as modules) to be provisioned in the database
     * Can only be set if 'protocol' is 'redis'
     */
    modules?: DatabaseModuleSpec[];
}

/**
 * Essentials database state
 * @interface EssentialsDatabaseState
 */
export interface EssentialsDatabaseState extends RedisCloudEntityState {
    /**
     * Database ID
     */
    id?: string;

    /**
     * Database name
     */
    name?: string;

    /**
     * Database username (typically "default")
     */
    username?: string;

    /**
     * Public endpoint for the database (host:port format)
     */
    publicEndpoint?: string;

    /**
     * Public endpoint host
     */
    publicEndpointHost?: string;

    /**
     * Public endpoint port
     */
    publicEndpointPort?: string;

    /**
     * Task ID for database creation (temporary, used during creation)
     */
    task_id?: string;
}

/**
 * @description Redis Cloud Essentials Database entity.
 * Creates and manages Redis Cloud databases in Essentials (pay-as-you-go) subscriptions.
 * Provides a cost-effective option for development and smaller workloads.
 * 
 * ## Secrets
 * - Reads: secret names from `account_key_secret_ref`, `secret_key_secret_ref` properties - Redis Cloud API credentials
 * - Writes: secret name from `password_secret_ref` property - Database password (if specified)
 * 
 * ## State Fields for Composition
 * - `state.id` - Database ID
 * - `state.public_endpoint` - Public endpoint for connections
 * - `state.status` - Database status (active, pending, etc.)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `redis-cloud/essentials-subscription` - The parent subscription for this database
 */
export class EssentialsDatabase extends RedisCloudEntity<EssentialsDatabaseDefinition, EssentialsDatabaseState> {

    protected getEntityName(): string {
        return `Essentials Database: ${this.definition.name}`;
    }

    /** Create a new Redis Cloud Essentials database */
    override create(): void {
        // Check if database already exists
        const existingDatabase = this.findExistingDatabase();
        if (existingDatabase) {
            this.state.existing = true;
            this.state.id = existingDatabase.databaseId;
            this.state.name = existingDatabase.name;
            this.state.username = "default";
            this.state.publicEndpoint = existingDatabase.publicEndpoint;
            
            // Parse publicEndpoint to extract host and port
            if (existingDatabase.publicEndpoint) {
                const endpointParts = existingDatabase.publicEndpoint.split(":");
                this.state.publicEndpointHost = endpointParts[0];
                this.state.publicEndpointPort = endpointParts[1];
            }
            
            cli.output(`✅ Using existing Essentials database: ${existingDatabase.name} (${existingDatabase.databaseId})`);
            return;
        }

        // Build request body matching API schema
        const body: any = {
            name: this.definition.name,
            protocol: this.definition.protocol || "stack",
            password: this.getOrCreatePassword()
        };

        // Add optional fields only if defined
        if (this.definition.dataset_size_in_gb !== undefined) {
            body.datasetSizeInGb = this.definition.dataset_size_in_gb;
        }
        
        if (this.definition.memory_limit_in_gb !== undefined) {
            body.memoryLimitInGb = this.definition.memory_limit_in_gb;
        }

        if (this.definition.support_oss_cluster_api !== undefined) {
            body.supportOSSClusterApi = this.definition.support_oss_cluster_api;
        }

        if (this.definition.redis_version) {
            body.redisVersion = this.definition.redis_version;
        }

        if (this.definition.resp_version) {
            body.respVersion = this.definition.resp_version;
        }

        if (this.definition.use_external_endpoint_for_oss_cluster_api !== undefined) {
            body.useExternalEndpointForOSSClusterApi = this.definition.use_external_endpoint_for_oss_cluster_api;
        }

        if (this.definition.enable_database_clustering !== undefined) {
            body.enableDatabaseClustering = this.definition.enable_database_clustering;
        }

        if (this.definition.number_of_shards !== undefined) {
            body.numberOfShards = this.definition.number_of_shards;
        }

        if (this.definition.data_persistence) {
            body.dataPersistence = this.definition.data_persistence;
        }

        if (this.definition.data_eviction_policy) {
            body.dataEvictionPolicy = this.definition.data_eviction_policy;
        }

        if (this.definition.replication !== undefined) {
            body.replication = this.definition.replication;
        }

        if (this.definition.periodic_backup_path) {
            body.periodicBackupPath = this.definition.periodic_backup_path;
        }

        if (this.definition.source_ips && this.definition.source_ips.length > 0) {
            body.sourceIps = this.definition.source_ips;
        }

        if (this.definition.regex_rules && this.definition.regex_rules.length > 0) {
            body.regexRules = this.definition.regex_rules;
        }

        if (this.definition.replica) {
            body.replica = {
                uris: this.definition.replica.uris,
                encryptionInTransit: this.definition.replica.encryptionInTransit
            };
        }

        if (this.definition.client_tls_certificates && this.definition.client_tls_certificates.length > 0) {
            body.clientTlsCertificates = this.definition.client_tls_certificates.map(cert => ({
                name: cert.name,
                certificate: cert.certificate
            }));
        }

        if (this.definition.enable_tls !== undefined) {
            body.enableTls = this.definition.enable_tls;
        }

        if (this.definition.alerts && this.definition.alerts.length > 0) {
            body.alerts = this.definition.alerts.map(alert => ({
                name: alert.name,
                value: alert.value
            }));
        }

        if (this.definition.modules && this.definition.modules.length > 0) {
            body.modules = this.definition.modules.map(module => ({
                name: module.name,
                parameters: module.parameters
            }));
        }

        const response = this.makeRequest("POST", `/fixed/subscriptions/${this.definition.subscription_id}/databases`, body);

        // Initial response contains taskId, not resourceId
        this.state.task_id = response.taskId;
        this.state.name = this.definition.name;

        cli.output(`✅ Essentials database creation initiated: ${this.state.name}`);
        cli.output(`📋 Task ID: ${this.state.task_id}`);

        // Wait for the task to complete and get the resource ID
        if (!this.state.task_id) {
            throw new Error("No task ID returned from database creation request");
        }
        const taskResult = this.waitForTask(this.state.task_id);
        
        if (taskResult && taskResult.response && taskResult.response.resourceId) {
            this.state.id = taskResult.response.resourceId;
            cli.output(`✅ Database created with ID: ${this.state.id}`);
            
            // Now fetch the complete database details to get the endpoint
            const databaseData = this.makeRequest("GET", `/fixed/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
            
            if (databaseData) {
                this.state.username = "default";
                this.state.publicEndpoint = databaseData.publicEndpoint;
                
                // Parse publicEndpoint to extract host and port
                if (databaseData.publicEndpoint) {
                    const endpointParts = databaseData.publicEndpoint.split(":");
                    this.state.publicEndpointHost = endpointParts[0];
                    this.state.publicEndpointPort = endpointParts[1];
                }
                
                cli.output(`✅ Essentials database ready: ${this.state.name} (${databaseData.status})`);
            }
        } else {
            throw new Error("Task completed but no resource ID was returned");
        }
    }

    private findExistingDatabase(): any {
        try {
            const response = this.makeRequest("GET", `/fixed/subscriptions/${this.definition.subscription_id}/databases`);
            return response.databases?.find((db: any) => db.name === this.definition.name);
        } catch (error) {
            cli.output(`⚠️ Could not check for existing databases: ${error}`);
            return null;
        }
    }

    private getOrCreatePassword(): string {
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

    override start(): void {
        super.start();
        // Task waiting is now handled directly in the create method
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // Check current database state - only update essential fields
        const databaseData = this.checkResourceExists(`/fixed/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
        
        if (databaseData) {
            this.state.publicEndpoint = databaseData.publicEndpoint;
            
            // Parse publicEndpoint to extract host and port
            if (databaseData.publicEndpoint) {
                const endpointParts = databaseData.publicEndpoint.split(":");
                this.state.publicEndpointHost = endpointParts[0];
                this.state.publicEndpointPort = endpointParts[1];
            }
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Essentials database does not exist, nothing to delete");
            return;
        }

        if (this.state.existing) {
            cli.output(`Essentials Database ${this.state.name} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            const response = this.makeRequest("DELETE", `/fixed/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
            
            if (response && response.taskId) {
                cli.output(`🗑️ Essentials database deletion initiated: ${this.state.name}`);
                cli.output(`📋 Delete Task ID: ${response.taskId}`);
                
                // Wait for the deletion task to complete
                this.waitForTask(response.taskId);
                cli.output(`✅ Essentials database deleted successfully: ${this.state.name}`);
            } else {
                cli.output(`✅ Essentials database deleted successfully: ${this.state.name}`);
            }
        } catch (error) {
            throw new Error(`Failed to delete Essentials Database ${this.state.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        const databaseData = this.checkResourceExists(`/fixed/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
        
        if (!databaseData) {
            return false;
        }

        // Database is ready when status is "active"
        if (databaseData.status === "active") {
            this.state.publicEndpoint = databaseData.publicEndpoint;
            
            // Parse publicEndpoint to extract host and port
            if (databaseData.publicEndpoint) {
                const endpointParts = databaseData.publicEndpoint.split(":");
                this.state.publicEndpointHost = endpointParts[0];
                this.state.publicEndpointPort = endpointParts[1];
            }
            
            return true;
        }

        return false;
    }

    override checkLiveness(): boolean { return this.checkReadiness(); }

    /**
     * Get backup configuration and status information for the database
     * 
     * Shows current backup settings including periodic backup path configuration.
     * 
     * Usage:
     * - monk do namespace/database-instance get-backup-info
     */
    @action("get-backup-info")
    getBackupInfo(_args?: any): void {
        cli.output(`==================================================`);
        cli.output(`📦 Backup Information for Essentials database: ${this.state.name}`);
        cli.output(`==================================================`);
        cli.output(`Database ID: ${this.state.id}`);
        cli.output(`Subscription ID: ${this.definition.subscription_id}`);

        if (!this.state.id) {
            throw new Error("Database ID is not available. Ensure the database is created and ready.");
        }

        try {
            cli.output(`\n🔧 Backup Configuration:`);
            
            if (this.definition.periodic_backup_path) {
                cli.output(`   Periodic Backup: ✅ Enabled`);
                cli.output(`   Backup Path: ${this.definition.periodic_backup_path}`);
                cli.output(`   Interval: Every 24 hours`);
            } else {
                cli.output(`   Periodic Backup: ❌ Not configured`);
                cli.output(`   Note: Set periodic_backup_path to enable automatic backups`);
            }
            
            cli.output(`\n📋 To create a manual snapshot:`);
            cli.output(`   monk do namespace/database create-snapshot`);
            cli.output(`\n📋 To list all backups:`);
            cli.output(`   monk do namespace/database list-snapshots`);
            
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get backup info`);
            throw new Error(`Get backup info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a manual backup snapshot of the Essentials database
     * Backs up to the periodicBackupPath configured for this database,
     * or to a custom location if backup_path is provided in args
     * 
     * Usage:
     * - monk do namespace/database-instance create-snapshot
     * - monk do namespace/database-instance create-snapshot backup_path="s3://my-bucket/adhoc-backup/"
     */
    @action("create-snapshot")
    createSnapshot(args?: any): void {
        cli.output(`==================================================`);
        cli.output(`Starting backup for database: ${this.state.name}`);
        cli.output(`Database ID: ${this.state.id}`);
        cli.output(`Subscription ID: ${this.definition.subscription_id}`);
        cli.output(`Backup path: ${this.definition.periodic_backup_path || 'not set'}`);
        cli.output(`==================================================`);
        
        if (!this.state.id) {
            cli.output(`ERROR: Database ID is not available`);
            throw new Error("Database ID is not available. Cannot initiate backup.");
        }

        // Support both old and new parameter names for backward compatibility
        const backupPath = args?.backup_path || args?.adhocBackupPath;

        if (!this.definition.periodic_backup_path && !backupPath) {
            cli.output(`ERROR: No backup path configured`);
            throw new Error("periodic_backup_path is not configured for this database, and no backup_path was provided. Cannot initiate backup.");
        }

        const body: any = {};
        if (backupPath) {
            body.adhocBackupPath = backupPath as string;
            cli.output(`Using ad-hoc backup path: ${backupPath}`);
        } else {
            cli.output(`Using configured periodic backup path`);
        }

        try {
            const endpoint = `/fixed/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/backup`;
            cli.output(`Making request to: POST ${endpoint}`);
            
            if (Object.keys(body).length > 0) {
                cli.output(`Request body: ${JSON.stringify(body)}`);
            } else {
                cli.output(`Request body: (empty - using configured path)`);
            }
            
            const response = this.makeRequest(
                "POST",
                endpoint,
                Object.keys(body).length > 0 ? body : undefined
            );

            cli.output(`Response received: ${JSON.stringify(response)}`);

            if (response && response.taskId) {
                cli.output(`--------------------------------------------------`);
                cli.output(`✅ Backup task created!`);
                cli.output(`Task ID: ${response.taskId}`);
                cli.output(`Waiting for task to complete...`);
                
                this.waitForTask(response.taskId);
                
                cli.output(`--------------------------------------------------`);
                cli.output(`✅ BACKUP COMPLETED SUCCESSFULLY`);
                cli.output(`Database: ${this.state.name}`);
                cli.output(`Task ID: ${response.taskId}`);
                cli.output(`==================================================`);
            } else {
                cli.output(`--------------------------------------------------`);
                cli.output(`⚠️  WARNING: No task ID in response!`);
                cli.output(`Response was: ${JSON.stringify(response)}`);
                cli.output(`==================================================`);
            }
        } catch (error) {
            cli.output(`--------------------------------------------------`);
            cli.output(`❌ BACKUP FAILED`);
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            cli.output(`==================================================`);
            throw new Error(`Failed to initiate backup for Essentials database ${this.state.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Restore/Import database from backup
     * 
     * This action imports data from an external storage location into the database.
     * WARNING: This will OVERWRITE all existing data in the database!
     * 
     * @param args.source_type - Type of storage (aws-s3, ftp, google-blob-storage, azure-blob-storage, redis, http)
     * @param args.source_uri - URI to the backup file
     * 
     * @example
     * ```bash
     * # Restore from S3
     * monk do namespace/essentials-database restore source_type="aws-s3" source_uri="s3://bucket/backup.rdb"
     * 
     * # Restore from Google Cloud Storage
     * monk do namespace/essentials-database restore source_type="google-blob-storage" source_uri="gs://bucket/backup.rdb"
     * ```
     */
    @action("restore")
    restore(args?: any): void {
        cli.output(`==================================================`);
        cli.output(`🔄 RESTORE DATABASE FROM BACKUP`);
        cli.output(`==================================================`);
        cli.output(`Database: ${this.state.name}`);
        cli.output(`Database ID: ${this.state.id}`);
        cli.output(`Subscription ID: ${this.definition.subscription_id}`);
        cli.output(`--------------------------------------------------`);

        if (!this.state.id) {
            cli.output(`❌ ERROR: Database does not exist, cannot restore`);
            throw new Error("Database does not exist, cannot restore");
        }

        // Extract and validate parameters (support both old and new param names for backward compatibility)
        const sourceType = (args?.source_type || args?.sourceType) as string;
        const importFromUri = (args?.source_uri || args?.importFromUri) as string;

        if (!sourceType || !importFromUri) {
            cli.output(`❌ ERROR: Missing required parameters`);
            cli.output(`Required parameters:`);
            cli.output(`  - source_type: Type of storage (aws-s3, ftp, google-blob-storage, azure-blob-storage, redis, http)`);
            cli.output(`  - source_uri: URI to the backup file`);
            cli.output(`--------------------------------------------------`);
            cli.output(`Example usage:`);
            cli.output(`  monk do <namespace>/<database> restore source_type="aws-s3" source_uri="s3://bucket/backup.rdb"`);
            cli.output(`==================================================`);
            throw new Error("Both source_type and source_uri are required parameters");
        }

        // Validate sourceType
        const validSourceTypes = ['aws-s3', 'ftp', 'google-blob-storage', 'azure-blob-storage', 'redis', 'http'];
        if (!validSourceTypes.includes(sourceType)) {
            cli.output(`❌ ERROR: Invalid source_type: ${sourceType}`);
            cli.output(`Valid source types: ${validSourceTypes.join(', ')}`);
            cli.output(`==================================================`);
            throw new Error(`Invalid source_type: ${sourceType}`);
        }

        // Display warning
        cli.output(`⚠️  WARNING: DESTRUCTIVE OPERATION!`);
        cli.output(`⚠️  This will OVERWRITE ALL EXISTING DATA in the database!`);
        cli.output(`⚠️  Ensure you have a backup before proceeding.`);
        cli.output(`--------------------------------------------------`);
        cli.output(`Source Type: ${sourceType}`);
        cli.output(`Import From: ${importFromUri}`);
        cli.output(`--------------------------------------------------`);

        try {
            // Use the Essentials (fixed) endpoint for import
            const endpoint = `/fixed/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/import`;
            cli.output(`Making request to: POST ${endpoint}`);
            
            const body = {
                sourceType: sourceType,
                importFromUri: [importFromUri]  // Must be an array
            };
            
            cli.output(`Request body: ${JSON.stringify(body, null, 2)}`);
            
            const response = this.makeRequest("POST", endpoint, body);

            cli.output(`Response received: ${JSON.stringify(response)}`);

            if (response && response.taskId) {
                cli.output(`--------------------------------------------------`);
                cli.output(`✅ Import task created!`);
                cli.output(`Task ID: ${response.taskId}`);
                cli.output(`⏳ Waiting for import to complete...`);
                cli.output(`Note: Large datasets may take several minutes to import.`);
                
                this.waitForTask(response.taskId);
                
                cli.output(`--------------------------------------------------`);
                cli.output(`✅ RESTORE COMPLETED SUCCESSFULLY`);
                cli.output(`Database: ${this.state.name}`);
                cli.output(`Database ID: ${this.state.id}`);
                cli.output(`Source: ${importFromUri}`);
                cli.output(`Task ID: ${response.taskId}`);
                cli.output(`==================================================`);
            } else {
                cli.output(`--------------------------------------------------`);
                cli.output(`⚠️  WARNING: No task ID in response!`);
                cli.output(`Response was: ${JSON.stringify(response)}`);
                cli.output(`==================================================`);
            }
        } catch (error) {
            cli.output(`--------------------------------------------------`);
            cli.output(`❌ FAILED to restore database`);
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            cli.output(`==================================================`);
            throw new Error(`Failed to restore Essentials database ${this.state.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    /**
     * Helper method to display backup information
     */
    private displayBackups(backups: any[]): void {
        if (backups.length === 0) {
            cli.output(`--------------------------------------------------`);
            cli.output(`ℹ️  No backups found for this database`);
            cli.output(`==================================================`);
        } else {
            cli.output(`--------------------------------------------------`);
            cli.output(`✅ Found ${backups.length} backup(s):`);
            cli.output(`--------------------------------------------------`);
            
            backups.forEach((backup: any, index: number) => {
                cli.output(`\n📦 Backup #${index + 1}:`);
                if (backup.backupId) cli.output(`  ID: ${backup.backupId}`);
                if (backup.status) cli.output(`  Status: ${backup.status}`);
                if (backup.timestamp) cli.output(`  Timestamp: ${backup.timestamp}`);
                if (backup.size) cli.output(`  Size: ${backup.size}`);
                if (backup.path) cli.output(`  Path: ${backup.path}`);
                if (backup.type) cli.output(`  Type: ${backup.type}`);
            });
            
            cli.output(`\n==================================================`);
        }
    }

    /**
     * List all backups/snapshots for this Essentials database
     * 
     * This action retrieves the list of available backups for the database.
     * 
     * @example
     * ```bash
     * monk do namespace/database-instance list-snapshots
     * ```
     */
    @action("list-snapshots")
    listSnapshots(): void {
        cli.output(`==================================================`);
        cli.output(`📋 Listing backups for database: ${this.state.name}`);
        cli.output(`==================================================`);
        cli.output(`Database ID: ${this.state.id}`);
        cli.output(`Subscription ID: ${this.definition.subscription_id}`);
        
        if (!this.state.id) {
            cli.output(`ERROR: Database ID is not available`);
            throw new Error("Database ID is not available. Cannot list backups.");
        }

        try {
            const endpoint = `/fixed/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/backup`;
            cli.output(`Making request to: GET ${endpoint}`);
            cli.output(`--------------------------------------------------`);
            
            const response = this.makeRequest("GET", endpoint);
            
            cli.output(`📥 Response received`);
            
            // Check if response is a task (async operation)
            if (response && response.taskId) {
                cli.output(`⏳ Backup listing is processing (Task ID: ${response.taskId})`);
                cli.output(`Waiting for task to complete...`);
                
                const taskResult = this.waitForTask(response.taskId);
                
                cli.output(`--------------------------------------------------`);
                
                // Extract backup data from task result
                if (taskResult && taskResult.response) {
                    const backupData = taskResult.response;
                    
                    // Handle different response formats
                    if (Array.isArray(backupData)) {
                        this.displayBackups(backupData);
                    } else if (backupData.backups && Array.isArray(backupData.backups)) {
                        this.displayBackups(backupData.backups);
                    } else if (backupData.resource && backupData.resource.lastBackupTime) {
                        // Essentials database - shows last backup time only
                        cli.output(`📦 Last backup time: ${backupData.resource.lastBackupTime}`);
                        cli.output(`ℹ️  Note: Essentials databases only track the last backup time.`);
                        cli.output(`   For detailed backup history, upgrade to a Pro subscription.`);
                        cli.output(`==================================================`);
                    } else {
                        cli.output(`📋 Backup status:`);
                        cli.output(JSON.stringify(taskResult.response, null, 2));
                        cli.output(`==================================================`);
                    }
                } else {
                    cli.output(`📋 Task completed but no backup data found in response`);
                    cli.output(`Full task result:`);
                    cli.output(JSON.stringify(taskResult, null, 2));
                    cli.output(`==================================================`);
                }
            } else if (response && Array.isArray(response)) {
                this.displayBackups(response);
            } else if (response && response.backups && Array.isArray(response.backups)) {
                this.displayBackups(response.backups);
            } else {
                cli.output(`--------------------------------------------------`);
                cli.output(`📋 Backup information:`);
                cli.output(JSON.stringify(response, null, 2));
                cli.output(`==================================================`);
            }
        } catch (error) {
            cli.output(`--------------------------------------------------`);
            cli.output(`❌ FAILED TO LIST BACKUPS`);
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            cli.output(`==================================================`);
            throw new Error(`Failed to list backups for Essentials database ${this.state.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get the status of a restore/import task
     * 
     * Check the progress of an ongoing restore operation using its task ID.
     * 
     * @param args Required arguments:
     *   - task_id: The task ID returned from a restore operation
     * 
     * @example
     * ```bash
     * monk do namespace/essentials-database/get-restore-status task_id="abc123"
     * ```
     */
    @action("get-restore-status")
    getRestoreStatus(args?: any): void {
        cli.output(`==================================================`);
        cli.output(`🔄 RESTORE TASK STATUS`);
        cli.output(`==================================================`);
        cli.output(`Database: ${this.state.name}`);
        cli.output(`Database ID: ${this.state.id}`);
        cli.output(`--------------------------------------------------`);

        const taskId = (args?.task_id || args?.job_id || args?.taskId) as string | undefined;

        if (!taskId) {
            cli.output(`❌ ERROR: Missing required parameter 'task_id'`);
            cli.output(`\nUsage:`);
            cli.output(`  monk do namespace/database/get-restore-status task_id="your-task-id"`);
            cli.output(`\nThe task_id is returned when you run a restore operation.`);
            cli.output(`==================================================`);
            throw new Error("task_id is required");
        }

        try {
            const taskData = this.makeRequest("GET", `/tasks/${taskId}`);

            cli.output(`\n📋 Task Information`);
            cli.output(`   Task ID: ${taskId}`);
            cli.output(`   Status: ${this.getTaskStatusIcon(taskData.status)} ${taskData.status}`);
            
            if (taskData.commandType) {
                cli.output(`   Command: ${taskData.commandType}`);
            }
            
            if (taskData.description) {
                cli.output(`   Description: ${taskData.description}`);
            }

            if (taskData.timestamp) {
                cli.output(`   Timestamp: ${taskData.timestamp}`);
            }

            if (taskData.response) {
                cli.output(`\n📦 Response Details:`);
                if (taskData.response.resourceId) {
                    cli.output(`   Resource ID: ${taskData.response.resourceId}`);
                }
                if (taskData.response.error) {
                    cli.output(`   ❌ Error: ${JSON.stringify(taskData.response.error)}`);
                }
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get task status`);
            cli.output(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            cli.output(`==================================================`);
            throw new Error(`Get restore status failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get status icon for task status
     */
    private getTaskStatusIcon(status: string): string {
        switch (status) {
            case 'processing-completed':
                return '✅';
            case 'processing-in-progress':
            case 'received':
                return '⏳';
            case 'processing-error':
                return '❌';
            default:
                return '🔄';
        }
    }
} 