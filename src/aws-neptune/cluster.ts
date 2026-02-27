import {
    AWSNeptuneEntity,
    AWSNeptuneDefinition,
    AWSNeptuneState,
    action
} from "./neptune-base.ts";
import cli from "cli";
import {
    ClusterStatus,
    validateClusterIdentifier,
    NEPTUNE_DEFAULT_PORT,
    NEPTUNE_ENGINE,
    createSecurityGroup,
    findSecurityGroupByName,
    checkSecurityGroupExists,
    deleteSecurityGroup,
    findVpcByName
} from "./common.ts";

/**
 * Definition interface for AWS Neptune Cluster entity.
 * Configures cluster properties including identifier, engine version, and networking.
 * @interface ClusterDefinition
 */
export interface ClusterDefinition extends AWSNeptuneDefinition {
    /** @description Unique identifier for the Neptune cluster (1-63 chars, starts with letter) */
    db_cluster_identifier: string;
    
    /** @description Neptune engine version (e.g., 1.2.1.0) */
    engine_version?: string;
    
    /** @description Port number for the cluster (default: 8182) */
    port?: number;
    
    /** @description DB subnet group name for VPC configuration */
    db_subnet_group_name?: string;
    
    /** @description VPC security group IDs to associate with the cluster */
    vpc_security_group_ids?: string[];
    
    /** @description DB cluster parameter group name */
    db_cluster_parameter_group_name?: string;
    
    /** @description Backup retention period in days (1-35) */
    backup_retention_period?: number;
    
    /** @description Preferred backup window (UTC, hh24:mi-hh24:mi) */
    preferred_backup_window?: string;
    
    /** @description Preferred maintenance window (UTC, ddd:hh24:mi-ddd:hh24:mi) */
    preferred_maintenance_window?: string;
    
    /** @description Enable storage encryption */
    storage_encrypted?: boolean;
    
    /** @description KMS key ID for encryption */
    kms_key_id?: string;
    
    /** @description Enable IAM database authentication */
    iam_database_authentication_enabled?: boolean;
    
    /** @description Enable deletion protection */
    deletion_protection?: boolean;
    
    /** @description Skip final snapshot on delete */
    skip_final_snapshot?: boolean;
    
    /** @description Final snapshot identifier when not skipping */
    final_db_snapshot_identifier?: string;
    
    /** @description Enable CloudWatch logs exports (audit, slowquery) */
    enable_cloudwatch_logs_exports?: string[];
    
    /** @description Enable serverless v2 scaling configuration */
    serverless_v2_scaling_configuration?: {
        min_capacity: number;
        max_capacity: number;
    };
    
    /** @description Resource tags for the cluster */
    tags?: Record<string, string>;
    
    /** @description Auto-create a security group for the cluster (default: true if no vpc_security_group_ids provided) */
    auto_create_security_group?: boolean;
    
    /** @description Name for the auto-created security group */
    security_group_name?: string;
    
    /** @description VPC ID for the auto-created security group (uses default VPC if not specified) */
    vpc_id?: string;
    
    /** @description VPC name (tag:Name) to look up VPC ID - alternative to vpc_id */
    vpc_name?: string;
}

/**
 * State interface for AWS Neptune Cluster entity.
 * Contains runtime information about the created cluster.
 * @interface ClusterState
 */
export interface ClusterState extends AWSNeptuneState {
    /** @description Full ARN of the cluster */
    db_cluster_arn?: string;
    
    /** @description Cluster identifier */
    db_cluster_identifier?: string;
    
    /** @description Current status of the cluster */
    status?: ClusterStatus;
    
    /** @description Cluster endpoint address */
    endpoint?: string;
    
    /** @description Reader endpoint address */
    reader_endpoint?: string;
    
    /** @description Cluster port */
    port?: number;
    
    /** @description Engine version */
    engine_version?: string;
    
    /** @description Whether storage is encrypted */
    storage_encrypted?: boolean;
    
    /** @description Cluster creation timestamp */
    cluster_create_time?: string;
    
    /** @description Hosted zone ID for the cluster endpoint */
    hosted_zone_id?: string;
    
    /** @description Resource ID */
    db_cluster_resource_id?: string;
    
    /** @description ID of the auto-created security group (if any) */
    created_security_group_id?: string;
    
    /** @description Whether the used security group pre-existed */
    created_security_group_existing?: boolean;
    
    /** @description VPC ID where the cluster is deployed */
    vpc_id?: string;
}

/**
 * @description AWS Neptune Cluster entity.
 * Creates and manages Amazon Neptune graph database clusters.
 * Neptune is a fully managed graph database service supporting Gremlin and SPARQL queries.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.db_cluster_arn` - Cluster ARN for IAM policies and cross-service references
 * - `state.db_cluster_identifier` - Cluster identifier for instance creation
 * - `state.endpoint` - Writer endpoint for graph queries
 * - `state.reader_endpoint` - Reader endpoint for read-only queries
 * - `state.port` - Connection port (default 8182)
 * - `state.created_security_group_id` - ID of auto-created security group (for use with neptune-access-list)
 * - `state.vpc_id` - VPC ID where the cluster is deployed
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-neptune/instance` - Add instances to this cluster
 * - `aws-neptune/subnet-group` - VPC subnet configuration
 * - `aws-neptune/cluster-parameter-group` - Cluster parameter configuration
 * - `aws-neptune/access-list` - Manage security group rules for client access
 * - `aws-iam/role` - Grant cluster access to Lambda or other services
 */
export class Cluster extends AWSNeptuneEntity<ClusterDefinition, ClusterState> {
    
    static readonly readiness = { period: 10, initialDelay: 30, attempts: 60 };

    private validateDefinition(): void {
        if (!validateClusterIdentifier(this.definition.db_cluster_identifier)) {
            throw new Error(
                `Invalid cluster identifier: ${this.definition.db_cluster_identifier}. ` +
                `Must be 1-63 characters, start with a letter, contain only letters, numbers, and hyphens.`
            );
        }
    }

    override create(): void {
        this.validateDefinition();
        
        // Check if cluster already exists
        try {
            const existing = this.getClusterInfo(this.definition.db_cluster_identifier);
            if (existing) {
                this.state = {
                    db_cluster_arn: existing.db_cluster_arn,
                    db_cluster_identifier: existing.db_cluster_identifier,
                    status: existing.status,
                    endpoint: existing.endpoint,
                    reader_endpoint: existing.reader_endpoint,
                    port: existing.port,
                    engine_version: existing.engine_version,
                    storage_encrypted: existing.storage_encrypted,
                    cluster_create_time: existing.cluster_create_time,
                    hosted_zone_id: existing.hosted_zone_id,
                    db_cluster_resource_id: existing.db_cluster_resource_id,
                    existing: true
                };
                return;
            }
        } catch (error) {
            if (!this.isNotFoundError(error)) {
                throw error;
            }
        }

        // Build create parameters
        const params: Record<string, any> = {
            DBClusterIdentifier: this.definition.db_cluster_identifier,
            Engine: NEPTUNE_ENGINE
        };

        if (this.definition.engine_version) {
            params.EngineVersion = this.definition.engine_version;
        }

        params.Port = this.definition.port || NEPTUNE_DEFAULT_PORT;

        if (this.definition.db_subnet_group_name) {
            params.DBSubnetGroupName = this.definition.db_subnet_group_name;
        }

        // Handle security groups - either use provided IDs or auto-create
        const securityGroupIds = this.getOrCreateSecurityGroups();
        if (securityGroupIds.length > 0) {
            params.VpcSecurityGroupIds = securityGroupIds;
        }

        if (this.definition.db_cluster_parameter_group_name) {
            params.DBClusterParameterGroupName = this.definition.db_cluster_parameter_group_name;
        }

        if (this.definition.backup_retention_period !== undefined) {
            params.BackupRetentionPeriod = this.definition.backup_retention_period;
        }

        if (this.definition.preferred_backup_window) {
            params.PreferredBackupWindow = this.definition.preferred_backup_window;
        }

        if (this.definition.preferred_maintenance_window) {
            params.PreferredMaintenanceWindow = this.definition.preferred_maintenance_window;
        }

        if (this.definition.storage_encrypted !== undefined) {
            params.StorageEncrypted = this.definition.storage_encrypted;
        }

        if (this.definition.kms_key_id) {
            params.KmsKeyId = this.definition.kms_key_id;
        }

        if (this.definition.iam_database_authentication_enabled !== undefined) {
            params.EnableIAMDatabaseAuthentication = this.definition.iam_database_authentication_enabled;
        }

        if (this.definition.deletion_protection !== undefined) {
            params.DeletionProtection = this.definition.deletion_protection;
        }

        if (this.definition.enable_cloudwatch_logs_exports && this.definition.enable_cloudwatch_logs_exports.length > 0) {
            params.EnableCloudwatchLogsExports = this.definition.enable_cloudwatch_logs_exports;
        }

        if (this.definition.serverless_v2_scaling_configuration) {
            params.ServerlessV2ScalingConfiguration = {
                MinCapacity: this.definition.serverless_v2_scaling_configuration.min_capacity,
                MaxCapacity: this.definition.serverless_v2_scaling_configuration.max_capacity
            };
        }

        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            params.Tags = Object.entries(this.definition.tags).map(([key, value]) => ({
                Key: key,
                Value: value
            }));
        }

        const response = this.makeNeptuneRequest("CreateDBCluster", params);
        
        // Parse response
        const clusterArn = this.extractXmlValue(response, 'DBClusterArn');
        const port = this.extractXmlValue(response, 'Port');

        this.state = {
            db_cluster_arn: clusterArn,
            db_cluster_identifier: this.definition.db_cluster_identifier,
            status: 'creating',
            port: port ? parseInt(port) : (this.definition.port || NEPTUNE_DEFAULT_PORT),
            existing: false,
            created_security_group_id: this.state.created_security_group_id,
            created_security_group_existing: this.state.created_security_group_existing,
            vpc_id: this.definition.vpc_id
        };
    }

    override checkReadiness(): boolean {
        if (!this.state.db_cluster_identifier) {
            return false;
        }

        try {
            const info = this.getClusterInfo(this.state.db_cluster_identifier);
            if (!info) {
                return false;
            }

            // Update state with latest info
            this.state.status = info.status;
            this.state.endpoint = info.endpoint;
            this.state.reader_endpoint = info.reader_endpoint;
            this.state.engine_version = info.engine_version;
            this.state.storage_encrypted = info.storage_encrypted;
            this.state.cluster_create_time = info.cluster_create_time;
            this.state.hosted_zone_id = info.hosted_zone_id;
            this.state.db_cluster_resource_id = info.db_cluster_resource_id;

            return info.status === 'available';
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    override update(): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        this.validateDefinition();

        const params: Record<string, any> = {
            DBClusterIdentifier: this.state.db_cluster_identifier
        };

        let hasChanges = false;

        if (this.definition.db_cluster_parameter_group_name) {
            params.DBClusterParameterGroupName = this.definition.db_cluster_parameter_group_name;
            hasChanges = true;
        }

        if (this.definition.backup_retention_period !== undefined) {
            params.BackupRetentionPeriod = this.definition.backup_retention_period;
            hasChanges = true;
        }

        if (this.definition.preferred_backup_window) {
            params.PreferredBackupWindow = this.definition.preferred_backup_window;
            hasChanges = true;
        }

        if (this.definition.preferred_maintenance_window) {
            params.PreferredMaintenanceWindow = this.definition.preferred_maintenance_window;
            hasChanges = true;
        }

        if (this.definition.iam_database_authentication_enabled !== undefined) {
            params.EnableIAMDatabaseAuthentication = this.definition.iam_database_authentication_enabled;
            hasChanges = true;
        }

        if (this.definition.deletion_protection !== undefined) {
            params.DeletionProtection = this.definition.deletion_protection;
            hasChanges = true;
        }

        if (this.definition.vpc_security_group_ids && this.definition.vpc_security_group_ids.length > 0) {
            params.VpcSecurityGroupIds = this.definition.vpc_security_group_ids;
            hasChanges = true;
        }

        if (this.definition.serverless_v2_scaling_configuration) {
            params.ServerlessV2ScalingConfiguration = {
                MinCapacity: this.definition.serverless_v2_scaling_configuration.min_capacity,
                MaxCapacity: this.definition.serverless_v2_scaling_configuration.max_capacity
            };
            hasChanges = true;
        }

        if (hasChanges) {
            this.makeNeptuneRequest("ModifyDBCluster", params);
        }
    }

    override delete(): void {
        if (!this.state.db_cluster_identifier) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            // First, disable deletion protection if enabled
            try {
                this.makeNeptuneRequest("ModifyDBCluster", {
                    DBClusterIdentifier: this.state.db_cluster_identifier,
                    DeletionProtection: false
                });
                this.delay(5);
            } catch (_error) {
                // Ignore errors when disabling deletion protection
            }

            const params: Record<string, any> = {
                DBClusterIdentifier: this.state.db_cluster_identifier,
                SkipFinalSnapshot: this.definition.skip_final_snapshot !== false
            };

            if (!params.SkipFinalSnapshot && this.definition.final_db_snapshot_identifier) {
                params.FinalDBSnapshotIdentifier = this.definition.final_db_snapshot_identifier;
            }

            this.makeNeptuneRequest("DeleteDBCluster", params);
            this.state.status = 'deleting';
            
            // Clean up auto-created security group
            this.cleanupCreatedSecurityGroup();
        } catch (error) {
            if (this.isNotFoundError(error)) {
                // Still try to clean up security group
                this.cleanupCreatedSecurityGroup();
                return;
            }
            throw error;
        }
    }

    /**
     * Get cluster information from AWS
     */
    private getClusterInfo(clusterIdentifier: string): ClusterState | null {
        try {
            const response = this.makeNeptuneRequest("DescribeDBClusters", {
                DBClusterIdentifier: clusterIdentifier
            });

            const status = this.extractXmlValue(response, 'Status');
            if (!status) {
                return null;
            }

            return {
                db_cluster_arn: this.extractXmlValue(response, 'DBClusterArn'),
                db_cluster_identifier: this.extractXmlValue(response, 'DBClusterIdentifier'),
                status: status as ClusterStatus,
                endpoint: this.extractXmlValue(response, 'Endpoint'),
                reader_endpoint: this.extractXmlValue(response, 'ReaderEndpoint'),
                port: parseInt(this.extractXmlValue(response, 'Port') || String(NEPTUNE_DEFAULT_PORT)),
                engine_version: this.extractXmlValue(response, 'EngineVersion'),
                storage_encrypted: this.extractXmlValue(response, 'StorageEncrypted') === 'true',
                cluster_create_time: this.extractXmlValue(response, 'ClusterCreateTime'),
                hosted_zone_id: this.extractXmlValue(response, 'HostedZoneId'),
                db_cluster_resource_id: this.extractXmlValue(response, 'DbClusterResourceId')
            };
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    // ==================== Actions ====================

    /**
     * Get detailed cluster information
     */
    @action("get-info")
    getInfo(): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        const info = this.getClusterInfo(this.state.db_cluster_identifier);
        if (!info) {
            throw new Error(`Cluster ${this.state.db_cluster_identifier} not found`);
        }

        cli.output("==================================================");
        cli.output(`Neptune Cluster: ${info.db_cluster_identifier}`);
        cli.output("==================================================");
        cli.output(`ARN: ${info.db_cluster_arn}`);
        cli.output(`Status: ${info.status}`);
        cli.output(`Engine Version: ${info.engine_version}`);
        cli.output(`Port: ${info.port}`);
        cli.output("");
        cli.output("Endpoints:");
        cli.output(`  Writer: ${info.endpoint}`);
        cli.output(`  Reader: ${info.reader_endpoint}`);
        cli.output("");
        cli.output(`Storage Encrypted: ${info.storage_encrypted}`);
        cli.output(`Created: ${info.cluster_create_time}`);
        cli.output("==================================================");
    }

    /**
     * List all instances in this cluster
     */
    @action("list-instances")
    listInstances(): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        const response = this.makeNeptuneRequest("DescribeDBInstances", {
            Filters: [{
                Name: 'db-cluster-id',
                Values: [this.state.db_cluster_identifier]
            }]
        });

        cli.output("==================================================");
        cli.output(`Instances in Cluster: ${this.state.db_cluster_identifier}`);
        cli.output("==================================================");

        const instanceIds = this.extractXmlValues(response, 'DBInstanceIdentifier');
        const statuses = this.extractXmlValues(response, 'DBInstanceStatus');
        const classes = this.extractXmlValues(response, 'DBInstanceClass');

        if (instanceIds.length > 0) {
            cli.output(`Total: ${instanceIds.length} instance(s)`);
            cli.output("");

            for (let i = 0; i < instanceIds.length; i++) {
                cli.output(`📊 ${instanceIds[i]}`);
                cli.output(`   Status: ${statuses[i] || 'unknown'}`);
                cli.output(`   Class: ${classes[i] || 'unknown'}`);
                cli.output("");
            }
        } else {
            cli.output("No instances found in this cluster.");
            cli.output("");
            cli.output("💡 Add instances with aws-neptune/instance entity");
        }

        cli.output("==================================================");
    }

    /**
     * Create a manual snapshot of the cluster
     */
    @action("create-snapshot")
    createSnapshot(args: { snapshot_identifier: string }): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        if (!args.snapshot_identifier) {
            throw new Error("snapshot_identifier is required");
        }

        this.makeNeptuneRequest("CreateDBClusterSnapshot", {
            DBClusterIdentifier: this.state.db_cluster_identifier,
            DBClusterSnapshotIdentifier: args.snapshot_identifier
        });

        cli.output(`✅ Snapshot ${args.snapshot_identifier} creation initiated`);
    }

    /**
     * List cluster snapshots
     */
    @action("list-snapshots")
    listSnapshots(): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        const response = this.makeNeptuneRequest("DescribeDBClusterSnapshots", {
            DBClusterIdentifier: this.state.db_cluster_identifier
        });

        cli.output("==================================================");
        cli.output(`Snapshots for Cluster: ${this.state.db_cluster_identifier}`);
        cli.output("==================================================");

        const snapshotIds = this.extractXmlValues(response, 'DBClusterSnapshotIdentifier');
        const statuses = this.extractXmlValues(response, 'Status');
        const types = this.extractXmlValues(response, 'SnapshotType');

        if (snapshotIds.length > 0) {
            cli.output(`Total: ${snapshotIds.length} snapshot(s)`);
            cli.output("");

            for (let i = 0; i < snapshotIds.length; i++) {
                cli.output(`📸 ${snapshotIds[i]}`);
                cli.output(`   Status: ${statuses[i] || 'unknown'}`);
                cli.output(`   Type: ${types[i] || 'unknown'}`);
                cli.output("");
            }
        } else {
            cli.output("No snapshots found.");
        }

        cli.output("==================================================");
    }

    /**
     * Failover the cluster to a replica
     */
    @action("failover")
    failover(args?: { target_instance?: string }): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        const params: Record<string, any> = {
            DBClusterIdentifier: this.state.db_cluster_identifier
        };

        if (args?.target_instance) {
            params.TargetDBInstanceIdentifier = args.target_instance;
        }

        this.makeNeptuneRequest("FailoverDBCluster", params);

        cli.output(`✅ Failover initiated for cluster ${this.state.db_cluster_identifier}`);
    }

    /**
     * Start a stopped cluster
     */
    @action("start")
    start(): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        // Check current status - only start if stopped
        const info = this.getClusterInfo(this.state.db_cluster_identifier);
        if (info && info.status === 'available') {
            cli.output(`✅ Cluster ${this.state.db_cluster_identifier} is already running`);
            return;
        }
        
        if (info && info.status !== 'stopped') {
            cli.output(`⏳ Cluster ${this.state.db_cluster_identifier} is in ${info.status} state, waiting...`);
            return;
        }

        this.makeNeptuneRequest("StartDBCluster", {
            DBClusterIdentifier: this.state.db_cluster_identifier
        });

        cli.output(`✅ Cluster ${this.state.db_cluster_identifier} is starting`);
    }

    /**
     * Stop a running cluster
     */
    @action("stop")
    stop(): void {
        if (!this.state.db_cluster_identifier) {
            throw new Error("Cluster not created yet");
        }

        this.makeNeptuneRequest("StopDBCluster", {
            DBClusterIdentifier: this.state.db_cluster_identifier
        });

        cli.output(`✅ Cluster ${this.state.db_cluster_identifier} is stopping`);
    }

    // ==================== Security Group Management ====================

    /**
     * Gets or creates security groups for the cluster
     */
    private getOrCreateSecurityGroups(): string[] {
        // If explicit security group IDs are provided, use them
        if (this.definition.vpc_security_group_ids && this.definition.vpc_security_group_ids.length > 0) {
            return [...this.definition.vpc_security_group_ids];
        }

        // Check if auto-create is explicitly disabled
        if (this.definition.auto_create_security_group === false) {
            return [];
        }

        // Auto-create a security group
        try {
            const groupName = this.definition.security_group_name || 
                `neptune-${this.definition.db_cluster_identifier}-sg`;
            const description = `Security group for Neptune cluster ${this.definition.db_cluster_identifier}`;
            
            // Resolve VPC: use vpc_id, or look up by vpc_name, or use default
            let vpcId = this.definition.vpc_id;
            if (!vpcId && this.definition.vpc_name) {
                vpcId = findVpcByName(this.definition.region, this.definition.vpc_name) || undefined;
                if (!vpcId) {
                    throw new Error(`VPC with name '${this.definition.vpc_name}' not found`);
                }
            }

            let groupId: string;
            let isExisting = false;

            // Check if security group already exists
            const existingGroupId = findSecurityGroupByName(this.definition.region, groupName, vpcId);
            if (existingGroupId) {
                groupId = existingGroupId;
                isExisting = true;
            } else {
                // Create a new security group
                groupId = createSecurityGroup(this.definition.region, groupName, description, vpcId);
            }

            // Store in state
            this.state.created_security_group_id = groupId;
            this.state.created_security_group_existing = isExisting;
            this.state.vpc_id = vpcId;

            return [groupId];
        } catch (error) {
            throw new Error(`Failed to create or find security group: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Cleans up the auto-created security group
     */
    private cleanupCreatedSecurityGroup(): void {
        if (this.state.created_security_group_id && !this.state.created_security_group_existing) {
            try {
                cli.output(`Deleting created security group: ${this.state.created_security_group_id}`);
                if (checkSecurityGroupExists(this.definition.region, this.state.created_security_group_id)) {
                    deleteSecurityGroup(this.definition.region, this.state.created_security_group_id);
                }
                this.state.created_security_group_id = undefined;
                this.state.created_security_group_existing = false;
            } catch (error) {
                cli.output(`Warning: Could not delete security group ${this.state.created_security_group_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }
}
