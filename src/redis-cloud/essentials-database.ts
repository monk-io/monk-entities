import secret from "secret";
import cli from "cli";

import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./base.ts";

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
     * Password to access the database
     * If not set, a random 32-character alphanumeric password will be automatically generated
     */
    password?: string;

    /**
     * Database password secret name (alternative to password field)
     */
    password_secret?: string;

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

    /**
     * Database password (temporary, used during creation)
     */
    password?: string;
}

/**
 * Essentials Database Entity
 * Manages Redis Cloud databases for Essentials subscriptions with API-compliant configuration options.
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
            password: this.getOrGeneratePassword()
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
        this.state.password = body.password;

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

    private getOrGeneratePassword(): string {
        // Use explicitly provided password first
        if (this.definition.password) {
            return this.definition.password;
        }

        // Try to get password from secret
        if (this.definition.password_secret) {
            try {
                const passwordFromSecret = secret.get(this.definition.password_secret);
                if (passwordFromSecret) {
                    return passwordFromSecret;
                }
            } catch (error) {
                cli.output(`⚠️ Could not retrieve password from secret, generating new one`);
            }
        }
        
        // Generate a random 32-character alphanumeric password (as per API docs)
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let password = "";
        for (let i = 0; i < 32; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
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
} 