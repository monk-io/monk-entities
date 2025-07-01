import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./base.ts";
import cli from "cli";

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
     * Optional. Password to access the database
     * If not set, random 32-character password will be generated
     * Can only be set if protocol is 'redis'
     */
    password?: string;

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
     * Database password
     */
    password?: string;

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
        const password = this.getOrGeneratePassword();

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

        this.state.id = response.resourceId;
        this.state.name = this.definition.name;
        this.state.status = "pending";
        this.state.task_id = response.taskId;
        this.state.password = password;
        this.state.memory_limit_in_mb = (this.definition.dataset_size_in_gb || 1) * 1024;

        // Set clustering state if configured
        if (this.definition.support_oss_cluster_api) {
            this.state.cluster_info = {
                shard_count: this.definition.throughput_measurement?.value,
                status: "initializing"
            };
        }

        cli.output(`✅ Pro database creation initiated: ${this.state.name} (${this.state.id})`);
        cli.output(`📋 Task ID: ${this.state.task_id}`);
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

    private getOrGeneratePassword(): string {
        // Use explicit password first
        if (this.definition.password) {
            return this.definition.password;
        }
        
        // Generate a random password
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
        let password = "";
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    override start(): void {
        super.start();
        
        // Wait for database creation to complete
        if (this.state.task_id) {
            try {
                this.waitForTask(this.state.task_id);
                cli.output(`✅ Pro database ${this.state.name} is ready`);
            } catch (error) {
                cli.output(`⚠️ Database creation may still be in progress: ${error}`);
            }
        }
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
} 