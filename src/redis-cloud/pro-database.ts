import cli from "cli";
import secret from "secret";
import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./base.ts";
import { action, Args } from "monkec/base";

/**
 * Pro database definition - full-featured schema for Pro subscriptions
 * @interface ProDatabaseDefinition
 */
export interface ProDatabaseDefinition extends RedisCloudEntityDefinition {
    /**
     * Database name (limited to 40 characters, letters, digits, hyphens only)
     * Must start with letter and end with letter or digit
     * @minLength 1
     * @maxLength 40
     * @pattern ^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$
     */
    name: string;

    /**
     * Subscription ID where the database will be created
     * @minLength 1
     */
    subscription_id: string;

    /**
     * Optional. When 'false': Creates and deploys, when 'true': creates read-only plan
     * @default false
     */
    dry_run?: boolean;

    /**
     * Protocol for Redis database
     * @default "redis"
     */
    protocol?: "redis" | "memcached";

    /**
     * Optional. TCP port on which the database is available (10000-19999)
     * Generated automatically if not set
     * @minimum 10000
     * @maximum 19999
     */
    port?: number;

    /**
     * Optional. Maximum amount of data in the dataset in GB
     * If replication is true, total memory will be twice this value
     * @minimum 0.1
     */
    dataset_size_in_gb?: number;

    /**
     * Optional. Redis database version
     * If omitted, will use default version
     */
    redis_version?: string;

    /**
     * Optional. Redis Serialization Protocol version
     * Must be compatible with Redis version
     */
    resp_version?: "resp2" | "resp3";

    /**
     * Optional. Support OSS Cluster API
     * @default false
     */
    support_oss_cluster_api?: boolean;

    /**
     * Optional. Use external endpoint for OSS Cluster API
     * Blocks database's private endpoint. Can only be set if supportOSSClusterAPI is true
     * @default false
     */
    use_external_endpoint_for_oss_cluster_api?: boolean;

    /**
     * Optional. Type and rate of data persistence
     * @default "none"
     */
    data_persistence?: "none" | "aof-every-1-second" | "aof-every-write" | "snapshot-every-1-hour" | "snapshot-every-6-hours" | "snapshot-every-12-hours";

    /**
     * Optional. Data eviction policy
     * @default "volatile-lru"
     */
    data_eviction_policy?: "allkeys-lru" | "allkeys-lfu" | "allkeys-random" | "volatile-lru" | "volatile-lfu" | "volatile-random" | "volatile-ttl" | "noeviction";

    /**
     * Optional. Sets database replication
     * @default true
     */
    replication?: boolean;

    /**
     * Optional. Changes Replica Of (Active-Passive) configuration
     */
    replica?: {
        sync_sources: Array<{
            /**
             * Redis URI of source database
             * Example: 'redis://user:password@host:port' or 'redis://endpoint1:6379'
             */
            endpoint: string;
            /**
             * Optional. Use encryption to connect to sync source
             */
            encryption?: boolean;
            /**
             * Optional. TLS/SSL certificate chain of sync source
             */
            server_cert?: string;
        }>;
    };

    /**
     * Optional. Throughput measurement method
     */
    throughput_measurement?: {
        /**
         * Throughput measurement method
         * Use 'operations-per-second' for all new databases
         */
        by: "operations-per-second" | "number-of-shards";
        /**
         * Throughput value in selected measurement method
         */
        value: number;
    };

    /**
     * Optional. Expected throughput per region for Active-Active database
     * Default: 1000 read and write ops/sec for each region
     */
    local_throughput_measurement?: Array<{
        /**
         * Cloud provider region for the subscription
         */
        region: string;
        /**
         * Write operations per second for this region
         * @default 1000
         */
        write_operations_per_second?: number;
        /**
         * Read operations per second for this region
         * @default 1000
         */
        read_operations_per_second?: number;
    }>;

    /**
     * Optional. Average size in bytes of items stored in database
     * Relevant only for ram-and-flash (Auto Tiering) subscriptions
     * @default 1000
     */
    average_item_size_in_bytes?: number;

    /**
     * Optional. Remote backup configuration
     */
    remote_backup?: {
        /**
         * Optional. Determine if backup should be active
         */
        active?: boolean;
        /**
         * Required when active is true. Interval between backups
         * Format: 'every-x-hours' where x is 1, 2, 4, 6, 12, or 24
         */
        interval?: "every-1-hours" | "every-2-hours" | "every-4-hours" | "every-6-hours" | "every-12-hours" | "every-24-hours";
        /**
         * Optional. Hour when backup starts (UTC)
         * Available only for "every-12-hours" and "every-24-hours"
         * Example: "14:00"
         */
        time_utc?: string;
        /**
         * Required when active is true. Type of storage for backup files
         */
        storage_type?: "aws-s3" | "google-blob-storage" | "azure-blob-storage" | "ftp";
        /**
         * Required when active is true. Path to backup storage location
         */
        storage_path?: string;
    };

    /**
     * Optional. List of source IP addresses or subnet masks to allow
     * Example: ['192.168.10.0/32', '192.168.12.0/24']
     */
    source_ip?: string[];

    /**
     * Optional. List of client TLS/SSL certificates
     * If specified, mTLS authentication will be required
     */
    client_tls_certificates?: Array<{
        /**
         * Client certificate public key in PEM format
         * New line characters should be replaced with '\n'
         */
        public_certificate_pem_string: string;
    }>;

    /**
     * Optional. When true, requires TLS authentication for all connections
     * @default false
     */
    enable_tls?: boolean;

    /**
     * Optional. Memcached (SASL) Username
     * If not set, will be 'mc-' prefix + random 5 characters
     * Can only be set if protocol is 'memcached'
     */
    sasl_username?: string;

    /**
     * Optional. Memcached (SASL) Password
     * If not set, random 32-character password will be generated
     * Can only be set if protocol is 'memcached'
     */
    sasl_password?: string;

    /**
     * Optional. Redis database alert details
     */
    alerts?: Array<{
        /**
         * Alert type
         */
        name: "dataset-size" | "datasets-size" | "throughput-higher-than" | "throughput-lower-than" | "latency" | "syncsource-error" | "syncsource-lag" | "connections-limit";
        /**
         * Value over which alert will be sent
         */
        value: number;
    }>;

    /**
     * Optional. Redis advanced capabilities (modules) to provision
     */
    modules?: Array<{
        /**
         * Redis advanced capability name
         */
        name: string;
        /**
         * Optional. Redis advanced capability parameters
         */
        parameters?: Record<string, any>;
    }>;

    /**
     * Optional. Database hashing policy
     */
    sharding_type?: "default-regex-rules" | "custom-regex-rules" | "redis-oss-hashing";

    /**
     * Optional. Query performance factor for search and query databases
     * Adds extra compute power to increase queries per second
     */
    query_performance_factor?: string;

    /**
     * Database password secret name
     */
    password_secret_ref?: string;
}

/**
 * Pro database state with advanced features
 * @interface ProDatabaseState
 */
export interface ProDatabaseState extends RedisCloudEntityState {
    /**
     * Database ID
     */
    id?: string;

    /**
     * Database name
     */
    name?: string;

    /**
     * Database status
     */
    status?: string;

    /**
     * Public endpoint for the database
     */
    public_endpoint?: string;

    /**
     * Private endpoint for the database
     */
    private_endpoint?: string;

    /**
     * Database port
     */
    port?: number;

    /**
     * Current memory usage in MB
     */
    memory_usage_in_mb?: number;

    /**
     * Current memory limit in MB
     */
    memory_limit_in_mb?: number;

    /**
     * Task ID for database creation
     */
    task_id?: string;

    /**
     * High availability status
     */
    high_availability_status?: string;

    /**
     * Replication status
     */
    replication_status?: string;

    /**
     * Cluster information
     */
    cluster_info?: {
        /**
         * Number of shards
         */
        shard_count?: number;

        /**
         * Cluster status
         */
        status?: string;
    };

    /**
     * SSL certificate details
     */
    ssl_certificate?: {
        /**
         * Certificate ID
         */
        id?: string;
        
        /**
         * Certificate name
         */
        name?: string;
    };

    /**
     * Backup details
     */
    backup?: {
        /**
         * Backup path
         */
        path?: string;
        
        /**
         * Last backup timestamp
         */
        last_backup?: string;

        /**
         * Backup status
         */
        status?: string;
    };

    /**
     * Enabled modules
     */
    enabled_modules?: string[];

    /**
     * Advanced alert status
     */
    current_alerts?: {
        /**
         * Memory usage alert enabled
         */
        memory_usage_enabled?: boolean;

        /**
         * Throughput alert enabled
         */
        throughput_enabled?: boolean;

        /**
         * Connection limit alert enabled
         */
        connection_limit_enabled?: boolean;

        /**
         * Latency alert enabled
         */
        latency_enabled?: boolean;
    };
}

/**
 * Pro Database Entity
 * Manages Redis Cloud databases for Pro subscriptions with full-featured configuration options.
 */
export class ProDatabase extends RedisCloudEntity<ProDatabaseDefinition, ProDatabaseState> {
    
    protected getEntityName(): string {
        return `Pro Database: ${this.definition.name}`;
    }

    /** Create a new Redis Cloud Pro database */
    override create(): void {
        // Check if database already exists
        const existingDatabase = this.findExistingDatabase();
        if (existingDatabase) {
            this.state.existing = true;
            this.state.id = existingDatabase.databaseId;
            this.state.name = existingDatabase.name;
            this.state.status = existingDatabase.status;
            this.state.public_endpoint = existingDatabase.publicEndpoint;
            this.state.private_endpoint = existingDatabase.privateEndpoint;
            this.state.port = existingDatabase.port;
            this.state.memory_limit_in_mb = existingDatabase.memoryLimitInMb;
            cli.output(`✅ Using existing Pro database: ${existingDatabase.name} (${existingDatabase.databaseId})`);
            return;
        }

        // Generate password if not provided
        const password = this.getOrCreatePassword();

        const body: any = {
            name: this.definition.name,
            protocol: this.definition.protocol || "redis",
            dryRun: this.definition.dry_run || false
        };

        // Handle memory configuration
        if (this.definition.dataset_size_in_gb !== undefined) {
            body.datasetSizeInGb = this.definition.dataset_size_in_gb;
        }

        // Optional configurations
        if (this.definition.port !== undefined) {
            body.port = this.definition.port;
        }

        if (this.definition.redis_version !== undefined) {
            body.redisVersion = this.definition.redis_version;
        }

        if (this.definition.resp_version !== undefined) {
            body.respVersion = this.definition.resp_version;
        }

        body.supportOSSClusterApi = this.definition.support_oss_cluster_api || false;
        body.useExternalEndpointForOSSClusterApi = this.definition.use_external_endpoint_for_oss_cluster_api || false;
        body.dataPersistence = this.mapDataPersistence();
        body.dataEvictionPolicy = this.definition.data_eviction_policy || "volatile-lru";
        body.replication = this.definition.replication ?? true;
        body.password = password;
        body.sourceIp = this.definition.source_ip || [];
        
        // Handle modules
        if (this.definition.modules && this.definition.modules.length > 0) {
            body.modules = [...this.definition.modules];
        }

        // Handle alerts
        if (this.definition.alerts && this.definition.alerts.length > 0) {
            body.alerts = [...this.definition.alerts];
        }

        // Handle replica configuration
        if (this.definition.replica) {
            body.replica = {
                syncSources: this.definition.replica.sync_sources.map(source => ({
                    endpoint: source.endpoint,
                    encryption: source.encryption,
                    serverCert: source.server_cert
                }))
            };
        }

        // Handle throughput measurement
        if (this.definition.throughput_measurement) {
            body.throughputMeasurement = {
                by: this.definition.throughput_measurement.by,
                value: this.definition.throughput_measurement.value
            };
        }

        // Handle local throughput measurement for Active-Active
        if (this.definition.local_throughput_measurement) {
            body.localThroughputMeasurement = this.definition.local_throughput_measurement.map(ltp => ({
                region: ltp.region,
                writeOperationsPerSecond: ltp.write_operations_per_second || 1000,
                readOperationsPerSecond: ltp.read_operations_per_second || 1000
            }));
        }

        // Handle average item size
        if (this.definition.average_item_size_in_bytes !== undefined) {
            body.averageItemSizeInBytes = this.definition.average_item_size_in_bytes;
        }

        // Handle backup configuration
        if (this.definition.remote_backup) {
            body.remoteBackup = {
                active: this.definition.remote_backup.active,
                interval: this.definition.remote_backup.interval,
                timeUTC: this.definition.remote_backup.time_utc,
                storageType: this.definition.remote_backup.storage_type,
                storagePath: this.definition.remote_backup.storage_path
            };
        }

        // Handle TLS certificates
        if (this.definition.client_tls_certificates) {
            body.clientTlsCertificates = this.definition.client_tls_certificates.map(cert => ({
                publicCertificatePEMString: cert.public_certificate_pem_string
            }));
        }

        if (this.definition.enable_tls !== undefined) {
            body.enableTls = this.definition.enable_tls;
        }

        // Handle memcached SASL
        if (this.definition.protocol === "memcached") {
            if (this.definition.sasl_username !== undefined) {
                body.saslUsername = this.definition.sasl_username;
            }
            if (this.definition.sasl_password !== undefined) {
                body.saslPassword = this.definition.sasl_password;
            }
        }

        // Handle sharding type
        if (this.definition.sharding_type !== undefined) {
            body.shardingType = this.definition.sharding_type;
        }

        // Handle query performance factor
        if (this.definition.query_performance_factor !== undefined) {
            body.queryPerformanceFactor = this.definition.query_performance_factor;
        }

        const response = this.makeRequest("POST", `/subscriptions/${this.definition.subscription_id}/databases`, body);

        // Initial response contains taskId, not resourceId
        this.state.task_id = response.taskId;
        this.state.name = this.definition.name;
        this.state.memory_limit_in_mb = (this.definition.dataset_size_in_gb || 1) * 1024;

        cli.output(`✅ Pro database creation initiated: ${this.state.name}`);
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
            const databaseData = this.makeRequest("GET", `/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
            
            if (databaseData) {
                this.state.status = databaseData.status;
                this.state.public_endpoint = databaseData.publicEndpoint;
                this.state.private_endpoint = databaseData.privateEndpoint;
                this.state.port = databaseData.port;
                this.state.memory_usage_in_mb = databaseData.memoryUsageInMb;
                
                // Set clustering state if configured
                if (this.definition.support_oss_cluster_api && databaseData.clustering) {
                    this.state.cluster_info = {
                        shard_count: databaseData.clustering.numberOfShards,
                        status: databaseData.clustering.status
                    };
                }
                
                cli.output(`✅ Pro database ready: ${this.state.name} (${databaseData.status})`);
            }
        } else {
            throw new Error("Task completed but no resource ID was returned");
        }
    }

    private mapDataPersistence(): string {
        return this.definition.data_persistence || "none";
    }

    private findExistingDatabase(): any {
        try {
            const response = this.makeRequest("GET", `/subscriptions/${this.definition.subscription_id}/databases`);
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

        // Check current database state
        const databaseData = this.checkResourceExists(`/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
        
        if (databaseData) {
            this.state.status = databaseData.status;
            this.state.public_endpoint = databaseData.publicEndpoint;
            this.state.private_endpoint = databaseData.privateEndpoint;
            this.state.port = databaseData.port;
            this.state.memory_usage_in_mb = databaseData.memoryUsageInMb;
            
            // Update Pro-specific state
            if (databaseData.clustering) {
                this.state.cluster_info = {
                    shard_count: databaseData.clustering.numberOfShards,
                    status: databaseData.clustering.status
                };
            }

            if (databaseData.modules) {
                this.state.enabled_modules = databaseData.modules.map((m: any) => m.name);
            }

            // Update alerts if needed
            if (this.definition.alerts && this.definition.alerts.length > 0) {
                this.updateAdvancedAlerts();
            }
        }
    }

    private updateAdvancedAlerts(): void {
        if (!this.state.id) return;
        
        const alerts = this.definition.alerts || [];
        if (alerts.length > 0) {
            try {
                this.makeRequest("PUT", `/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/alerts`, { alerts });
                cli.output(`✅ Updated alerts for Pro database ${this.state.name}`);
            } catch (error) {
                cli.output(`⚠️ Failed to update alerts: ${error}`);
            }
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Pro database does not exist, nothing to delete");
            return;
        }

        this.deleteResource(`/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`, `Pro Database ${this.state.name}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        const databaseData = this.checkResourceExists(`/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
        
        if (!databaseData) {
            return false;
        }

        // Database is ready when status is "active"
        if (databaseData.status === "active") {
            this.state.status = "active";
            this.state.public_endpoint = databaseData.publicEndpoint;
            this.state.private_endpoint = databaseData.privateEndpoint;
            this.state.port = databaseData.port;
            this.state.memory_usage_in_mb = databaseData.memoryUsageInMb;
            
            // Update Pro-specific readiness state
            if (databaseData.clustering) {
                this.state.cluster_info = {
                    shard_count: databaseData.clustering.numberOfShards,
                    status: databaseData.clustering.status
                };
            }

            if (databaseData.modules) {
                this.state.enabled_modules = databaseData.modules.map((m: any) => m.name);
            }

            return true;
        }

        this.state.status = databaseData.status;
        return false;
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    /**
     * Get backup configuration and status information for the database
     * 
     * Shows current backup settings including remote backup configuration
     * and last backup status.
     * 
     * Usage:
     * - monk do namespace/database-instance get-backup-info
     */
    @action("get-backup-info")
    getBackupInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Backup Information for Pro database: ${this.state.name}`);
        cli.output(`==================================================`);
        cli.output(`Database ID: ${this.state.id}`);
        cli.output(`Subscription ID: ${this.definition.subscription_id}`);

        if (!this.state.id) {
            throw new Error("Database ID is not available. Ensure the database is created and ready.");
        }

        try {
            const databaseData = this.checkResourceExists(`/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`);
            
            if (!databaseData) {
                throw new Error(`Database ${this.state.name} not found`);
            }

            cli.output(`\n🔧 Backup Configuration:`);
            
            // Show remote backup config from definition
            if (this.definition.remote_backup) {
                cli.output(`   Remote Backup: ${this.definition.remote_backup.active ? '✅ Enabled' : '❌ Disabled'}`);
                if (this.definition.remote_backup.interval) {
                    cli.output(`   Backup Interval: ${this.definition.remote_backup.interval}`);
                }
                if (this.definition.remote_backup.storage_type) {
                    cli.output(`   Storage Type: ${this.definition.remote_backup.storage_type}`);
                }
                if (this.definition.remote_backup.storage_path) {
                    cli.output(`   Storage Path: ${this.definition.remote_backup.storage_path}`);
                }
                if (this.definition.remote_backup.time_utc) {
                    cli.output(`   Backup Time (UTC): ${this.definition.remote_backup.time_utc}`);
                }
            } else {
                cli.output(`   Remote Backup: ❌ Not configured`);
            }
            
            // Show backup state if available
            if (this.state.backup) {
                cli.output(`\n📅 Last Backup Status:`);
                if (this.state.backup.status) cli.output(`   Status: ${this.state.backup.status}`);
                if (this.state.backup.last_backup) cli.output(`   Last Backup: ${this.state.backup.last_backup}`);
                if (this.state.backup.path) cli.output(`   Path: ${this.state.backup.path}`);
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
     * Create a manual backup snapshot of the Pro database
     * Backs up to the remoteBackup storage path configured for this database,
     * or to a custom location if backup_path is provided in args
     * 
     * For Active-Active databases, you must back up each region separately using region_name parameter
     * 
     * Usage:
     * - monk do namespace/database-instance create-snapshot
     * - monk do namespace/database-instance create-snapshot backup_path="s3://my-bucket/adhoc-backup/"
     * - monk do namespace/database-instance create-snapshot region_name="us-east-1" (for Active-Active)
     * - monk do namespace/database-instance create-snapshot region_name="us-east-1" backup_path="s3://custom-path/"
     */
    @action("create-snapshot")
    createSnapshot(args?: Args): void {
        cli.output(`Initiating backup for Pro database: ${this.state.name}`);
        
        if (!this.state.id) {
            throw new Error("Database ID is not available. Cannot initiate backup.");
        }

        // Support both old and new parameter names for backward compatibility
        const backupPath = args?.backup_path || args?.adhocBackupPath;
        const regionName = args?.region_name || args?.regionName;

        if (!this.definition.remote_backup?.storage_path && !backupPath) {
            throw new Error("remote_backup.storage_path is not configured for this database, and no backup_path was provided. Cannot initiate backup.");
        }

        const body: any = {};
        if (regionName) {
            body.regionName = regionName as string;
        }
        if (backupPath) {
            body.adhocBackupPath = backupPath as string;
        }

        try {
            const response = this.makeRequest(
                "POST",
                `/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/backup`,
                Object.keys(body).length > 0 ? body : undefined
            );

            if (response && response.taskId) {
                cli.output(`✅ Backup initiated. Task ID: ${response.taskId}`);
                this.waitForTask(response.taskId);
                cli.output(`✅ Backup task ${response.taskId} completed successfully.`);
            } else {
                cli.output(`⚠️  Backup request sent but no task ID returned. Response: ${JSON.stringify(response)}`);
            }
        } catch (error) {
            throw new Error(`Failed to initiate backup for Pro database ${this.state.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
     * monk do namespace/pro-database restore source_type="aws-s3" source_uri="s3://bucket/backup.rdb"
     * 
     * # Restore from Google Cloud Storage
     * monk do namespace/pro-database restore source_type="google-blob-storage" source_uri="gs://bucket/backup.rdb"
     * 
     * # Import from another Redis instance
     * monk do namespace/pro-database restore source_type="redis" source_uri="redis://password@host:6379"
     * ```
     */
    @action("restore")
    restore(args?: any): void {
        cli.output(`==================================================`);
        cli.output(`🔄 RESTORE PRO DATABASE FROM BACKUP`);
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
            // Note: importFromUri must be an array
            const endpoint = `/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/import`;
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
            throw new Error(`Failed to restore Pro database ${this.state.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
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
                if (backup.regionName) cli.output(`  Region: ${backup.regionName}`);
            });
            
            cli.output(`\n==================================================`);
        }
    }

    /**
     * List all backups/snapshots for this Pro database
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
        cli.output(`📋 Listing backups for Pro database: ${this.state.name}`);
        cli.output(`==================================================`);
        cli.output(`Database ID: ${this.state.id}`);
        cli.output(`Subscription ID: ${this.definition.subscription_id}`);
        
        if (!this.state.id) {
            cli.output(`ERROR: Database ID is not available`);
            throw new Error("Database ID is not available. Cannot list backups.");
        }

        try {
            const endpoint = `/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/backup`;
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
                    
                    if (Array.isArray(backupData)) {
                        this.displayBackups(backupData);
                    } else if (backupData.backups && Array.isArray(backupData.backups)) {
                        this.displayBackups(backupData.backups);
                    } else {
                        cli.output(`📋 Task result:`);
                        cli.output(JSON.stringify(taskResult, null, 2));
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
            throw new Error(`Failed to list backups for Pro database ${this.state.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
     * monk do namespace/pro-database/get-restore-status task_id="abc123"
     * ```
     */
    @action("get-restore-status")
    getRestoreStatus(args?: Args): void {
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