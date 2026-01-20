/**
 * GCP Memorystore for Redis Entity
 *
 * Creates and manages Memorystore for Redis instances, including export/import
 * operations for snapshot-style backups.
 */

import { action, Args } from "monkec/base";
import cli from "cli";
import { GcpEntity, GcpEntityDefinition, GcpEntityState } from "./gcp-base.ts";
import {
    GcpRegion,
    MEMORYSTORE_REDIS_API_URL,
    RedisConnectMode,
    RedisInstanceState,
    RedisPersistenceMode,
    RedisRdbSnapshotPeriod,
    RedisReadReplicasMode,
    RedisTier,
    RedisTransitEncryptionMode,
    RedisVersion,
    isOperationDone,
    isOperationFailed,
} from "./common.ts";

type WeekDay =
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY";

interface TimeOfDay {
    /** @description Hours in 24h format */
    hours: number;
    /** @description Minutes */
    minutes: number;
    /** @description Seconds */
    seconds?: number;
    /** @description Nanos */
    nanos?: number;
}

interface WeeklyMaintenanceWindow {
    /** @description Day of the week for maintenance */
    day: WeekDay;
    /** @description Start time of the maintenance window */
    start_time: TimeOfDay;
}

interface MaintenancePolicy {
    /** @description Optional maintenance policy description */
    description?: string;
    /** @description Weekly maintenance window preferences */
    weekly_maintenance_window?: ReadonlyArray<WeeklyMaintenanceWindow>;
}

interface PersistenceConfig {
    /** @description Persistence mode */
    persistence_mode?: RedisPersistenceMode;
    /** @description RDB snapshot period */
    rdb_snapshot_period?: RedisRdbSnapshotPeriod;
    /** @description RDB snapshot start time (RFC3339) */
    rdb_snapshot_start_time?: string;
}

/**
 * Definition interface for Memorystore for Redis entity.
 * @interface MemorystoreRedisDefinition
 */
export interface MemorystoreRedisDefinition extends GcpEntityDefinition {
    /**
     * @description Instance ID (unique within the region)
     */
    name: string;

    /**
     * @description GCP region for the instance
     * @default us-central1
     */
    region?: GcpRegion;

    /**
     * @description Display name for the instance
     */
    display_name?: string;

    /**
     * @description Service tier
     * @default BASIC
     */
    tier?: RedisTier;

    /**
     * @description Memory size in GB
     * @minimum 1
     */
    memory_size_gb: number;

    /**
     * @description Redis software version (e.g., REDIS_7_0)
     */
    redis_version?: RedisVersion;

    /**
     * @description Authorized VPC network (full resource name)
     */
    authorized_network?: string;

    /**
     * @description Connect mode (DIRECT_PEERING or PRIVATE_SERVICE_ACCESS)
     */
    connect_mode?: RedisConnectMode;

    /**
     * @description Reserved IP range for the instance
     */
    reserved_ip_range?: string;

    /**
     * @description Enable Redis AUTH
     * @default false
     */
    auth_enabled?: boolean;

    /**
     * @description Transit encryption mode
     */
    transit_encryption_mode?: RedisTransitEncryptionMode;

    /**
     * @description Redis configuration parameters
     */
    redis_configs?: Record<string, string>;

    /**
     * @description Persistence configuration (RDB snapshots)
     */
    persistence_config?: PersistenceConfig;

    /**
     * @description Maintenance policy for weekly maintenance windows
     */
    maintenance_policy?: MaintenancePolicy;

    /**
     * @description Enable/disable read replicas
     */
    read_replicas_mode?: RedisReadReplicasMode;

    /**
     * @description Number of read replicas when enabled
     */
    replica_count?: number;

    /**
     * @description Labels to apply to the instance
     */
    labels?: Record<string, string>;
}

/**
 * State interface for Memorystore for Redis entity.
 * @interface MemorystoreRedisState
 */
export interface MemorystoreRedisState extends GcpEntityState {
    /** @description Full resource name of the instance */
    id?: string;
    /** @description Redis host for connections */
    host?: string;
    /** @description Redis port for connections */
    port?: number;
    /** @description Instance readiness status */
    status?: RedisInstanceState | string;
    /** @description Read endpoint (if available) */
    read_endpoint?: string;
    /** @description Service account used for import/export */
    persistence_iam_identity?: string;
}

/**
 * @description GCP Memorystore for Redis entity.
 * Manages Memorystore for Redis instances and supports export/import operations
 * for snapshot-style backups and restores.
 *
 * ## Secrets
 * - Reads: none (authenticated via GCP provider)
 * - Writes: none
 *
 * ## State Fields for Composition
 * - `state.host` - Redis host for client connections
 * - `state.port` - Redis port (typically 6379)
 * - `state.read_endpoint` - Read endpoint for replicas (if enabled)
 *
 * ## Composing with Other Entities
 * Works with:
 * - `gcp/service-usage` - Enable `redis.googleapis.com` API before create
 */
export class MemorystoreRedis extends GcpEntity<MemorystoreRedisDefinition, MemorystoreRedisState> {
    static readonly readiness = { period: 15, initialDelay: 10, attempts: 80 };

    protected getEntityName(): string {
        return `Memorystore Redis ${this.definition.name}`;
    }

    private get region(): string {
        return this.definition.region || "us-central1";
    }

    private get apiUrl(): string {
        return `${MEMORYSTORE_REDIS_API_URL}/projects/${this.projectId}`;
    }

    private get instanceUrl(): string {
        return `${this.apiUrl}/locations/${this.region}/instances/${this.definition.name}`;
    }

    private get operationsUrl(): string {
        return `${this.apiUrl}/locations/${this.region}/operations`;
    }

    private getOperationUrl(operationName: string): string {
        if (operationName.startsWith("projects/")) {
            return `${MEMORYSTORE_REDIS_API_URL}/${operationName}`;
        }
        return `${this.operationsUrl}/${operationName}`;
    }

    private mapPersistenceConfig(config?: PersistenceConfig): any | undefined {
        if (!config) {
            return undefined;
        }
        const mapped: any = {};
        if (config.persistence_mode !== undefined) {
            mapped.persistenceMode = config.persistence_mode;
        }
        if (config.rdb_snapshot_period !== undefined) {
            mapped.rdbSnapshotPeriod = config.rdb_snapshot_period;
        }
        if (config.rdb_snapshot_start_time !== undefined) {
            mapped.rdbSnapshotStartTime = config.rdb_snapshot_start_time;
        }
        return Object.keys(mapped).length > 0 ? mapped : undefined;
    }

    private mapMaintenancePolicy(policy?: Readonly<MaintenancePolicy>): any | undefined {
        if (!policy) {
            return undefined;
        }
        const mapped: any = {};
        if (policy.description) {
            mapped.description = policy.description;
        }
        if (policy.weekly_maintenance_window) {
            mapped.weeklyMaintenanceWindow = policy.weekly_maintenance_window.map((window) => ({
                day: window.day,
                startTime: window.start_time,
            }));
        }
        return Object.keys(mapped).length > 0 ? mapped : undefined;
    }

    private buildInstanceRequest(): any {
        const body: any = {
            name: this.definition.name,
            tier: this.definition.tier || "BASIC",
            memorySizeGb: this.definition.memory_size_gb,
        };

        if (this.definition.display_name) {
            body.displayName = this.definition.display_name;
        }
        if (this.definition.redis_version) {
            body.redisVersion = this.definition.redis_version;
        }
        if (this.definition.authorized_network) {
            body.authorizedNetwork = this.definition.authorized_network;
        }
        if (this.definition.connect_mode) {
            body.connectMode = this.definition.connect_mode;
        }
        if (this.definition.reserved_ip_range) {
            body.reservedIpRange = this.definition.reserved_ip_range;
        }
        if (this.definition.auth_enabled !== undefined) {
            body.authEnabled = this.definition.auth_enabled;
        }
        if (this.definition.transit_encryption_mode) {
            body.transitEncryptionMode = this.definition.transit_encryption_mode;
        }
        if (this.definition.redis_configs) {
            body.redisConfigs = this.definition.redis_configs;
        }
        if (this.definition.persistence_config) {
            const persistenceConfig = this.mapPersistenceConfig(this.definition.persistence_config);
            if (persistenceConfig) {
                body.persistenceConfig = persistenceConfig;
            }
        }
        if (this.definition.maintenance_policy) {
            const maintenancePolicy = this.mapMaintenancePolicy(this.definition.maintenance_policy);
            if (maintenancePolicy) {
                body.maintenancePolicy = maintenancePolicy;
            }
        }
        if (this.definition.read_replicas_mode) {
            body.readReplicasMode = this.definition.read_replicas_mode;
        }
        if (this.definition.replica_count !== undefined) {
            body.replicaCount = this.definition.replica_count;
        }
        if (this.definition.labels) {
            body.labels = this.definition.labels;
        }

        return body;
    }

    private buildUpdateRequest(): { body: any; updateMask: string[] } {
        const body: any = { name: this.definition.name };
        const updateMask: string[] = [];

        if (this.definition.display_name !== undefined) {
            body.displayName = this.definition.display_name;
            updateMask.push("displayName");
        }
        if (this.definition.tier !== undefined) {
            body.tier = this.definition.tier;
            updateMask.push("tier");
        }
        if (this.definition.memory_size_gb !== undefined) {
            body.memorySizeGb = this.definition.memory_size_gb;
            updateMask.push("memorySizeGb");
        }
        if (this.definition.redis_version !== undefined) {
            body.redisVersion = this.definition.redis_version;
            updateMask.push("redisVersion");
        }
        if (this.definition.authorized_network !== undefined) {
            body.authorizedNetwork = this.definition.authorized_network;
            updateMask.push("authorizedNetwork");
        }
        if (this.definition.connect_mode !== undefined) {
            body.connectMode = this.definition.connect_mode;
            updateMask.push("connectMode");
        }
        if (this.definition.reserved_ip_range !== undefined) {
            body.reservedIpRange = this.definition.reserved_ip_range;
            updateMask.push("reservedIpRange");
        }
        if (this.definition.auth_enabled !== undefined) {
            body.authEnabled = this.definition.auth_enabled;
            updateMask.push("authEnabled");
        }
        if (this.definition.transit_encryption_mode !== undefined) {
            body.transitEncryptionMode = this.definition.transit_encryption_mode;
            updateMask.push("transitEncryptionMode");
        }
        if (this.definition.redis_configs !== undefined) {
            body.redisConfigs = this.definition.redis_configs;
            updateMask.push("redisConfigs");
        }
        if (this.definition.persistence_config !== undefined) {
            const persistenceConfig = this.mapPersistenceConfig(this.definition.persistence_config);
            if (persistenceConfig) {
                body.persistenceConfig = persistenceConfig;
                updateMask.push("persistenceConfig");
            }
        }
        if (this.definition.maintenance_policy !== undefined) {
            const maintenancePolicy = this.mapMaintenancePolicy(this.definition.maintenance_policy);
            if (maintenancePolicy) {
                body.maintenancePolicy = maintenancePolicy;
                updateMask.push("maintenancePolicy");
            }
        }
        if (this.definition.read_replicas_mode !== undefined) {
            body.readReplicasMode = this.definition.read_replicas_mode;
            updateMask.push("readReplicasMode");
        }
        if (this.definition.replica_count !== undefined) {
            body.replicaCount = this.definition.replica_count;
            updateMask.push("replicaCount");
        }
        if (this.definition.labels !== undefined) {
            body.labels = this.definition.labels;
            updateMask.push("labels");
        }

        return { body, updateMask };
    }

    private getInstance(): any | null {
        return this.checkResourceExists(this.instanceUrl);
    }

    private updateStateFromInstance(instance: any): void {
        this.state.id = instance.name;
        this.state.host = instance.host;
        this.state.port = instance.port;
        this.state.status = instance.state;
        this.state.read_endpoint = instance.readEndpoint;
        this.state.persistence_iam_identity = instance.persistenceIamIdentity;
    }

    override create(): void {
        const existing = this.getInstance();
        if (existing) {
            cli.output(`Memorystore instance ${this.definition.name} already exists, adopting...`);
            this.state.existing = true;
            this.updateStateFromInstance(existing);
            return;
        }

        const body = this.buildInstanceRequest();
        const url = `${this.apiUrl}/locations/${this.region}/instances?instanceId=${this.definition.name}`;

        cli.output(`Creating Memorystore instance: ${this.definition.name}`);
        cli.output(`Tier: ${body.tier}, Memory: ${body.memorySizeGb}GB, Region: ${this.region}`);

        const result = this.post(url, body);
        this.state.operation_name = result.name;
        this.state.existing = false;
    }

    override update(): void {
        const existing = this.getInstance();
        if (!existing) {
            cli.output(`Instance ${this.definition.name} not found, creating...`);
            this.create();
            return;
        }

        const { body, updateMask } = this.buildUpdateRequest();
        if (updateMask.length === 0) {
            cli.output(`No updates detected for ${this.definition.name}`);
            this.updateStateFromInstance(existing);
            return;
        }

        const url = `${this.instanceUrl}?updateMask=${updateMask.join(",")}`;
        cli.output(`Updating Memorystore instance: ${this.definition.name}`);
        cli.output(`Update fields: ${updateMask.join(", ")}`);

        const result = this.patch(url, body);
        this.state.operation_name = result.name;
    }

    override delete(): void {
        this.deleteResource(this.instanceUrl, `Memorystore instance ${this.definition.name}`);
    }

    override checkReadiness(): boolean {
        if (this.state.operation_name) {
            try {
                const operation = this.get(this.getOperationUrl(this.state.operation_name));
                if (isOperationDone(operation)) {
                    if (isOperationFailed(operation)) {
                        cli.output(`Operation failed: ${JSON.stringify(operation.error)}`);
                        this.state.operation_name = undefined;
                        return false;
                    }
                    cli.output("Operation completed successfully");
                    this.state.operation_name = undefined;
                } else {
                    cli.output(`Operation in progress`);
                    return false;
                }
            } catch (error) {
                cli.output(`Error checking operation: ${error}`);
                return false;
            }
        }

        const instance = this.getInstance();
        if (!instance) {
            cli.output(`Instance ${this.definition.name} not found`);
            return false;
        }

        this.updateStateFromInstance(instance);
        if (instance.state !== "READY") {
            cli.output(`Instance state: ${instance.state}`);
            return false;
        }

        if (!instance.host) {
            cli.output(`Instance host is not available yet`);
            return false;
        }

        cli.output(`Instance ready at ${instance.host}:${instance.port}`);
        return true;
    }

    checkLiveness(): boolean {
        const instance = this.getInstance();
        return instance?.state === "READY";
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        const instance = this.getInstance();
        if (!instance) {
            throw new Error("Instance not found");
        }
        cli.output(JSON.stringify(instance, null, 2));
    }

    // =========================================================================
    // Backup & Restore Interface (Export/Import)
    // =========================================================================

    /**
     * Get backup configuration and status information for the Redis instance
     *
     * Shows persistence (RDB snapshot) settings and export/import guidance.
     *
     * Usage:
     * - monk do namespace/instance get-backup-info
     */
    @action("get-backup-info")
    getBackupInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Backup Information for Memorystore Redis`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`Region: ${this.region}`);
        cli.output(`==================================================`);

        const instance = this.getInstance();
        if (!instance) {
            throw new Error(`Instance ${this.definition.name} not found`);
        }

        const persistence = instance.persistenceConfig || {};
        cli.output(`\n🔧 Persistence Configuration:`);
        cli.output(`   Mode: ${persistence.persistenceMode || "DISABLED"}`);
        if (persistence.rdbSnapshotPeriod) {
            cli.output(`   Snapshot Period: ${persistence.rdbSnapshotPeriod}`);
        }
        if (persistence.rdbSnapshotStartTime) {
            cli.output(`   Snapshot Start Time: ${persistence.rdbSnapshotStartTime}`);
        }

        if (instance.persistenceIamIdentity) {
            cli.output(`   Export/Import Service Account: ${instance.persistenceIamIdentity}`);
        }

        if (!persistence.persistenceMode || persistence.persistenceMode === "DISABLED") {
            cli.output(`\n⚠️  Note: RDB snapshots are disabled. Configure persistence_config to enable.`);
        }

        cli.output(`\n📋 Available operations:`);
        cli.output(`   monk do namespace/instance create-snapshot output_uri="gs://bucket/path/backup.rdb"`);
        cli.output(`   monk do namespace/instance list-snapshots`);
        cli.output(`   monk do namespace/instance restore source_uri="gs://bucket/path/backup.rdb"`);
        cli.output(`   monk do namespace/instance get-restore-status operation_name="projects/.../operations/..."`);
        cli.output(`\n==================================================`);
    }

    /**
     * Export data to a Cloud Storage RDB file (snapshot backup)
     *
     * Usage:
     * - monk do namespace/instance create-snapshot output_uri="gs://bucket/path/backup.rdb"
     * - monk do namespace/instance create-snapshot backup_path="gs://bucket/path/backup.rdb"
     */
    @action("create-snapshot")
    createSnapshot(args?: Args): void {
        const outputUri = (args?.output_uri || args?.backup_path) as string | undefined;
        if (!outputUri) {
            throw new Error(
                "'output_uri' is required.\n" +
                "Usage: monk do namespace/instance create-snapshot output_uri=\"gs://bucket/path/backup.rdb\""
            );
        }

        cli.output(`==================================================`);
        cli.output(`Creating Memorystore export snapshot`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Destination: ${outputUri}`);
        cli.output(`==================================================`);

        const body = {
            outputConfig: {
                gcsDestination: {
                    uri: outputUri,
                },
            },
        };

        const operation = this.post(`${this.instanceUrl}:export`, body);
        cli.output(`Export started: ${operation.name}`);
        cli.output(`\n📋 Check status with:`);
        cli.output(`   monk do namespace/instance get-restore-status operation_name="${operation.name}"`);
    }

    /**
     * List recent export/import operations for this location
     *
     * This lists operations and highlights export/import operations where possible.
     *
     * Usage:
     * - monk do namespace/instance list-snapshots
     * - monk do namespace/instance list-snapshots limit=20
     * - monk do namespace/instance list-snapshots filter="metadata.operationType:EXPORT_INSTANCE"
     */
    @action("list-snapshots")
    listSnapshots(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Listing Memorystore export/import operations`);
        cli.output(`Project: ${this.projectId}`);
        cli.output(`Region: ${this.region}`);
        cli.output(`==================================================`);

        const limit = Number(args?.limit) || 10;
        const filter = args?.filter as string | undefined;
        const url = filter
            ? `${this.operationsUrl}?filter=${encodeURIComponent(filter)}`
            : this.operationsUrl;

        try {
            const response = this.get(url);
            const operations = response.operations || [];
            const relevant = operations.filter((op: any) => {
                const opType = op.metadata?.operationType || "";
                return opType.includes("EXPORT") || opType.includes("IMPORT");
            });

            const displayOps = relevant.length > 0 ? relevant : operations;
            cli.output(`\nTotal operations found: ${displayOps.length}`);
            cli.output(`Showing: ${Math.min(displayOps.length, limit)} operation(s)\n`);

            if (displayOps.length === 0) {
                cli.output(`No operations found in ${this.region}.`);
            } else {
                const list = displayOps.slice(0, limit);
                list.forEach((op: any, index: number) => {
                    const type = op.metadata?.operationType || "UNKNOWN";
                    const status = op.done ? "DONE" : "RUNNING";
                    cli.output(`🔹 Operation #${index + 1}`);
                    cli.output(`   Name: ${op.name}`);
                    cli.output(`   Type: ${type}`);
                    cli.output(`   Status: ${status}`);
                    if (op.metadata?.startTime) {
                        cli.output(`   Start Time: ${op.metadata.startTime}`);
                    }
                    if (op.metadata?.endTime) {
                        cli.output(`   End Time: ${op.metadata.endTime}`);
                    }
                    cli.output(``);
                });
            }

            if (displayOps.length > limit) {
                cli.output(`... and ${displayOps.length - limit} more operation(s)`);
            }

            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to list operations`);
            throw new Error(`List snapshots failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }

    /**
     * Import data from a Cloud Storage RDB file (restore)
     *
     * WARNING: This will overwrite existing data in the instance.
     *
     * Usage:
     * - monk do namespace/instance restore source_uri="gs://bucket/path/backup.rdb"
     * - monk do namespace/instance restore input_uri="gs://bucket/path/backup.rdb"
     */
    @action("restore")
    restore(args?: Args): void {
        const sourceUri = (args?.source_uri || args?.input_uri) as string | undefined;
        if (!sourceUri) {
            throw new Error(
                "'source_uri' is required.\n" +
                "Usage: monk do namespace/instance restore source_uri=\"gs://bucket/path/backup.rdb\""
            );
        }

        cli.output(`==================================================`);
        cli.output(`⚠️  RESTORE OPERATION - READ CAREFULLY!`);
        cli.output(`==================================================`);
        cli.output(`Instance: ${this.definition.name}`);
        cli.output(`Source: ${sourceUri}`);
        cli.output(`--------------------------------------------------`);
        cli.output(`⚠️  This will OVERWRITE all existing data in the instance.`);
        cli.output(`--------------------------------------------------`);

        const body = {
            inputConfig: {
                gcsSource: {
                    uri: sourceUri,
                },
            },
        };

        const operation = this.post(`${this.instanceUrl}:import`, body);
        cli.output(`Import started: ${operation.name}`);
        cli.output(`\n📋 Check status with:`);
        cli.output(`   monk do namespace/instance get-restore-status operation_name="${operation.name}"`);
    }

    /**
     * Check the status of an export/import operation
     *
     * Usage:
     * - monk do namespace/instance get-restore-status operation_name="projects/.../locations/.../operations/..."
     */
    @action("get-restore-status")
    getRestoreStatus(args?: Args): void {
        const operationName = args?.operation_name as string | undefined;
        if (!operationName) {
            throw new Error(
                "'operation_name' is required.\n" +
                "Usage: monk do namespace/instance get-restore-status operation_name=\"projects/.../operations/...\""
            );
        }

        cli.output(`==================================================`);
        cli.output(`🔄 OPERATION STATUS`);
        cli.output(`==================================================`);
        cli.output(`Operation: ${operationName}`);
        cli.output(`--------------------------------------------------`);

        const operation = this.get(this.getOperationUrl(operationName));
        const status = operation.done ? "DONE" : "RUNNING";
        cli.output(`Status: ${status}`);

        if (operation.error) {
            cli.output(`\n❌ Operation failed`);
            cli.output(`${JSON.stringify(operation.error, null, 2)}`);
        } else if (operation.done) {
            cli.output(`\n✅ Operation completed successfully`);
        } else {
            cli.output(`\n⏳ Operation is still in progress`);
        }

        cli.output(`\n==================================================`);
    }
}
