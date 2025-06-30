import { RedisCloudEntity, RedisCloudEntityDefinition, RedisCloudEntityState } from "./base.ts";
import cli from "cli";

/**
 * Represents a Redis Cloud database entity.
 * This entity allows interaction with Redis Cloud databases via its API.
 * @interface DatabaseDefinition
 */
export interface DatabaseDefinition extends RedisCloudEntityDefinition {
    /**
     * Database name
     * @minLength 1
     * @maxLength 100
     */
    name: string;

    /**
     * Subscription ID where the database will be created
     * @minLength 1
     */
    subscription_id: string;

    /**
     * Protocol for Redis database
     */
    protocol: "redis" | "memcached";

    /**
     * Memory limit in MB
     * @minimum 1
     * @maximum 51200
     */
    memory_limit_in_mb: number;

    /**
     * Whether to enable high availability
     */
    high_availability?: boolean;

    /**
     * Whether to enable data persistence
     */
    data_persistence?: boolean;

    /**
     * Database password secret name
     */
    password_secret?: string;

    /**
     * Whether to enable multi-zone
     */
    multi_zone?: boolean;

    /**
     * Whether to enable replica
     */
    replica?: boolean;

    /**
     * Number of database replicas
     * @minimum 0
     * @maximum 4
     */
    replica_count?: number;

    /**
     * Data eviction policy
     */
    data_eviction_policy?: "allkeys-lru" | "allkeys-lfu" | "allkeys-random" | "volatile-lru" | "volatile-lfu" | "volatile-random" | "volatile-ttl" | "noeviction";

    /**
     * Whether to enable clustering
     */
    clustering?: boolean;

    /**
     * Number of shards for clustering
     * @minimum 1
     * @maximum 256
     */
    shard_count?: number;

    /**
     * List of Redis modules to enable
     */
    modules?: string[];

    /**
     * List of allowed source IPs
     */
    source_ips?: string[];

    /**
     * Client SSL certificate ID
     */
    client_ssl_certificate?: string;

    /**
     * Periodic backup path
     */
    periodic_backup_path?: string;

    /**
     * Whether to enable database alerts
     */
    enable_alerts?: boolean;

    /**
     * Alert settings
     */
    alerts?: {
        /**
         * Memory usage threshold
         * @minimum 0
         * @maximum 100
         */
        memory_usage_threshold?: number;

        /**
         * Throughput threshold
         * @minimum 0
         */
        throughput_threshold?: number;

        /**
         * Connection limit threshold
         * @minimum 0
         */
        connection_limit_threshold?: number;
    };
}

/**
 * Represents the mutable runtime state of a Redis Cloud database entity.
 * This state can change during the entity's lifecycle.
 * @interface DatabaseState
 */
export interface DatabaseState extends RedisCloudEntityState {
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
    };

    /**
     * Current alert settings
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
    };
}

export class Database extends RedisCloudEntity<DatabaseDefinition, DatabaseState> {
    
    protected getEntityName(): string {
        return this.definition.name;
    }

    /** Create a new Redis Cloud database */
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
            cli.output(`✅ Using existing database: ${existingDatabase.name} (${existingDatabase.databaseId})`);
            return;
        }

        // Generate password if not provided
        const password = this.getOrGeneratePassword();

        const body = {
            name: this.definition.name,
            protocol: this.definition.protocol,
            memoryLimitInMb: this.definition.memory_limit_in_mb,
            supportOSSClusterApi: this.definition.clustering || false,
            useExternalEndpointForOSSClusterApi: false,
            dataPersistence: this.definition.data_persistence ? "aof-every-1-sec" : "none",
            dataEvictionPolicy: this.definition.data_eviction_policy || "volatile-lru",
            replication: this.definition.high_availability || false,
            password: password,
            sourceIps: this.definition.source_ips || [],
            modules: this.definition.modules || [],
            alerts: this.buildAlertsConfig()
        };

        const response = this.makeRequest("POST", `/subscriptions/${this.definition.subscription_id}/databases`, body);

        this.state.id = response.resourceId;
        this.state.name = this.definition.name;
        this.state.status = "pending";
        this.state.task_id = response.taskId;
        this.state.password = password;
        this.state.memory_limit_in_mb = this.definition.memory_limit_in_mb;

        cli.output(`✅ Database creation initiated: ${this.state.name} (${this.state.id})`);
        cli.output(`📋 Task ID: ${this.state.task_id}`);
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
        if (this.definition.password_secret) {
            // Try to get existing password from secret
            try {
                return this.credentials.secretKey; // Use existing secret system
            } catch (error) {
                cli.output(`⚠️ Could not retrieve password from secret, generating new one`);
            }
        }
        
        // Generate a random password
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
        let password = "";
        for (let i = 0; i < 16; i++) {
            password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
    }

    private buildAlertsConfig(): any[] {
        if (!this.definition.enable_alerts || !this.definition.alerts) {
            return [];
        }

        const alerts = [];
        
        if (this.definition.alerts.memory_usage_threshold) {
            alerts.push({
                name: "dataset-size",
                value: this.definition.alerts.memory_usage_threshold
            });
        }

        if (this.definition.alerts.throughput_threshold) {
            alerts.push({
                name: "throughput-higher-than",
                value: this.definition.alerts.throughput_threshold
            });
        }

        if (this.definition.alerts.connection_limit_threshold) {
            alerts.push({
                name: "connections-limit",
                value: this.definition.alerts.connection_limit_threshold
            });
        }

        return alerts;
    }

    override start(): void {
        super.start();
        
        // Wait for database creation to complete
        if (this.state.task_id) {
            try {
                this.waitForTask(this.state.task_id);
                cli.output(`✅ Database ${this.state.name} is ready`);
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
            
            // Update alerts if needed
            if (this.definition.enable_alerts && this.definition.alerts) {
                this.updateAlerts();
            }
        }
    }

    private updateAlerts(): void {
        if (!this.state.id) return;
        
        const alerts = this.buildAlertsConfig();
        if (alerts.length > 0) {
            try {
                this.makeRequest("PUT", `/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}/alerts`, { alerts });
                cli.output(`✅ Updated alerts for database ${this.state.name}`);
            } catch (error) {
                cli.output(`⚠️ Failed to update alerts: ${error}`);
            }
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Database does not exist, nothing to delete");
            return;
        }

        this.deleteResource(`/subscriptions/${this.definition.subscription_id}/databases/${this.state.id}`, `Database ${this.state.name}`);
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
            return true;
        }

        this.state.status = databaseData.status;
        return false;
    }
} 