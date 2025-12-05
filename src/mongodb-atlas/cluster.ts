import { MongoDBAtlasEntity, MongoDBAtlasEntityDefinition, MongoDBAtlasEntityState } from "./base.ts";
import cli from "cli";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;
type Args = MonkecBase.Args;

/**
 * Represents a MongoDB Atlas cluster entity.
 * This entity allows interaction with MongoDB Atlas clusters via its API.
 * @interface ClusterDefinition
 */
export interface ClusterDefinition extends MongoDBAtlasEntityDefinition {
    /**
     * @description Cluster name
     * @minLength 1
     * @maxLength 100
     */
    name: string;

    /**
     * @description Project ID where the cluster will be created
     * @minLength 1
     * @maxLength 24
     */
    project_id: string;

    /**
     * @description Cloud provider
     */
    provider: "AWS" | "GCP" | "AZURE";

    /**
     * @description Cloud provider region
     */
    region: string;

    /**
     * @description Instance size/tier
     */
    instance_size: "M0" | "M2" | "M5" | "M10" | "M20" | "M30" | "M40" | "M50" | "M60" | "M80";

    /**
     * @description Array of IP addresses allowed to access the cluster
     */
    allow_ips?: string[];
}

/**
 * Represents the mutable runtime state of a MongoDB Atlas cluster entity.
 * This state can change during the entity's lifecycle.
 * @interface ClusterState
 */
export interface ClusterState extends MongoDBAtlasEntityState {
    /**
     * @description Cluster ID
     */
    id?: string;

    /**
     * @description Cluster Name
     */
    name?: string;

    /**
     * @description Standard connection string
     */
    connection_standard?: string;

    /**
     * @description SRV connection string
     */
    connection_srv?: string;
}

export class Cluster extends MongoDBAtlasEntity<ClusterDefinition, ClusterState> {
    
    /**
     * Readiness check configuration
     * M10+ clusters can take 5-10 minutes to provision
     * - period: Check every 30 seconds
     * - initialDelay: Wait 60 seconds before first check
     * - attempts: Try for up to 15 minutes (30 attempts × 30 seconds)
     */
    static readiness = {
        period: 30,        // seconds between checks
        initialDelay: 60,  // seconds before first check
        attempts: 30       // max attempts (30 × 30s = 15 min)
    };
    
    protected getEntityName(): string {
        return this.definition.name;
    }

    /**
     * Check if the cluster tier is a shared tier (M0, M2, M5)
     * Shared tiers use "TENANT" provider, dedicated tiers use direct provider name
     */
    private isSharedTier(): boolean {
        const sharedTiers = ["M0", "M2", "M5"];
        return sharedTiers.includes(this.definition.instance_size);
    }

    /** Create a new MongoDB Atlas cluster */
    override create(): void {
        // Build region config based on cluster tier
        const regionConfig: Record<string, unknown> = {
            "electableSpecs": {
                "instanceSize": this.definition.instance_size,
                "nodeCount": 3
            },
            "regionName": this.definition.region
        };

        // Shared tiers (M0, M2, M5) use TENANT provider
        // Dedicated tiers (M10+) use direct provider name
        if (this.isSharedTier()) {
            regionConfig.providerName = "TENANT";
            regionConfig.backingProviderName = this.definition.provider;
        } else {
            regionConfig.providerName = this.definition.provider;
            regionConfig.priority = 7;
        }

        const body: Record<string, unknown> = {
            "name": this.definition.name,
            "clusterType": "REPLICASET",
            "replicationSpecs": [
                {
                    "regionConfigs": [regionConfig]
                }
            ]
        };

        // Enable Cloud Backup for dedicated clusters (M10+)
        // This is required for backup API operations
        if (!this.isSharedTier()) {
            body.backupEnabled = true;
        }

        const resObj = this.makeRequest("POST", `/groups/${this.definition.project_id}/clusters`, body);

        this.state = {
            id: resObj.id,
            name: resObj.name
        };

        // Configure IP access list if provided
        if (this.definition.allow_ips && this.definition.allow_ips.length > 0) {
            this.configureIPAccessList();
        }
    }

    /** Configure IP access list for the cluster */
    private configureIPAccessList(): void {
        if (!this.definition.allow_ips || this.definition.allow_ips.length === 0) {
            return;
        }

        const accessList = this.definition.allow_ips.map(ip => ({
            "ipAddress": ip,
            "comment": "Added by MonkeC entity"
        }));

        try {
            this.makeRequest("POST", `/groups/${this.definition.project_id}/accessList`, accessList);
        } catch (error) {
            cli.output(`Warning: Failed to configure IP access list: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // Check current cluster state
        const clusterData = this.checkResourceExists(`/groups/${this.definition.project_id}/clusters/${this.definition.name}`);
        
        if (clusterData) {
            this.state = {
                ...this.state,
                id: clusterData.id,
                name: clusterData.name,
                connection_standard: clusterData.connectionStrings?.standard,
                connection_srv: clusterData.connectionStrings?.standardSrv
            };
        }
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Cluster does not exist, nothing to delete");
            return;
        }

        this.deleteResource(`/groups/${this.definition.project_id}/clusters/${this.definition.name}`, "Cluster");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        const clusterData = this.checkResourceExists(`/groups/${this.definition.project_id}/clusters/${this.definition.name}`);
        
        if (!clusterData) {
            return false;
        }

        // Cluster is only ready when both state is IDLE AND connection strings are available
        if (clusterData.stateName === "IDLE" && clusterData.connectionStrings) {
            this.state.connection_standard = clusterData.connectionStrings.standard;
            this.state.connection_srv = clusterData.connectionStrings.standardSrv;
            return true;
        }

        return false;
    }

    override checkLiveness(): boolean {
        const clusterData = this.checkResourceExists(`/groups/${this.definition.project_id}/clusters/${this.definition.name}`);
        if (!clusterData) {
            throw new Error(`Cluster ${this.definition.name} not found`);
        }
        const hasConn = Boolean(clusterData.connectionStrings?.standard || clusterData.connectionStrings?.standardSrv);
        const state = String(clusterData.stateName || "");
        if (!hasConn) {
            throw new Error("Connection strings are not available yet");
        }
        const live = (state === "IDLE" || state === "UPDATING" || state === "MAINTENANCE" || state === "RESUMING");
        if (!live) {
            throw new Error(`Cluster is not available (state: ${state})`);
        }
        return true;
    }

    /**
     * Validate if the cluster tier supports backup operations
     * Backups are only available for M10+ (dedicated) clusters
     */
    private validateBackupSupport(): void {
        if (this.isSharedTier()) {
            throw new Error(
                `Backup operations are not supported for shared cluster tier ${this.definition.instance_size}. ` +
                `Backups require a dedicated cluster (M10 or higher).`
            );
        }
    }

    /**
     * Create an on-demand backup snapshot of the cluster
     * 
     * Backups are only available for M10+ (dedicated) clusters.
     * Snapshots are stored according to your backup retention policy.
     * 
     * Usage:
     * - monk do namespace/cluster backup
     * - monk do namespace/cluster backup description="Pre-migration backup"
     * - monk do namespace/cluster backup description="Before upgrade" retentionInDays=14
     * 
     * @param args Optional arguments:
     *   - description: Description for the snapshot (default: "Manual backup at <timestamp>")
     *   - retentionInDays: Number of days to retain the snapshot (default: 7)
     */
    @action("backup")
    backupCluster(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Creating backup snapshot for cluster: ${this.definition.name}`);
        cli.output(`Project ID: ${this.definition.project_id}`);
        cli.output(`==================================================`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        if (!this.state.id) {
            throw new Error("Cluster ID is not available. Ensure the cluster is created and ready.");
        }

        const description = args?.description || `Manual backup at ${new Date().toISOString()}`;
        const retentionInDays = Number(args?.retentionInDays) || 7;

        cli.output(`Description: ${description}`);
        cli.output(`Retention: ${retentionInDays} days`);

        const body = {
            description: description,
            retentionInDays: retentionInDays
        };

        try {
            const response = this.makeRequest(
                "POST",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/snapshots`,
                body
            );

            cli.output(`\n✅ Snapshot creation initiated successfully!`);
            cli.output(`Snapshot ID: ${response.id}`);
            cli.output(`Status: ${response.status}`);
            cli.output(`Type: ${response.type || 'onDemand'}`);
            cli.output(`Created at: ${response.createdAt}`);
            cli.output(`Expires at: ${response.expiresAt}`);
            cli.output(`\nNote: Snapshot creation may take several minutes depending on cluster size.`);
            cli.output(`Use 'monk do namespace/cluster list-snapshots' to check status.`);
            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to create backup snapshot`);
            throw new Error(`Backup operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all available backup snapshots for the cluster
     * 
     * Shows both automated (scheduled) and on-demand snapshots.
     * Use this to find snapshot IDs for restore operations.
     * 
     * Usage:
     * - monk do namespace/cluster list-snapshots
     * - monk do namespace/cluster list-snapshots limit=20
     * 
     * @param args Optional arguments:
     *   - limit: Maximum number of snapshots to display (default: 10)
     */
    @action("list-snapshots")
    listSnapshots(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Listing backup snapshots for cluster: ${this.definition.name}`);
        cli.output(`Project ID: ${this.definition.project_id}`);
        cli.output(`==================================================`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        if (!this.state.id) {
            throw new Error("Cluster ID is not available. Ensure the cluster is created and ready.");
        }

        const limit = Number(args?.limit) || 10;

        try {
            const response = this.makeRequest(
                "GET",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/snapshots`
            );

            const snapshots = response.results || [];
            const totalCount = response.totalCount || snapshots.length;

            cli.output(`\nTotal snapshots available: ${totalCount}`);
            cli.output(`Showing: ${Math.min(snapshots.length, limit)} snapshot(s)\n`);

            if (snapshots.length === 0) {
                cli.output(`No snapshots found for this cluster.`);
                cli.output(`Create a snapshot using: monk do namespace/cluster backup`);
            } else {
                const displaySnapshots = snapshots.slice(0, limit);
                
                for (let i = 0; i < displaySnapshots.length; i++) {
                    const snapshot = displaySnapshots[i];
                    cli.output(`\n📸 Snapshot #${i + 1}`);
                    cli.output(`   ID: ${snapshot.id}`);
                    cli.output(`   Status: ${snapshot.status}`);
                    cli.output(`   Type: ${snapshot.type || 'scheduled'}`);
                    cli.output(`   Created: ${snapshot.createdAt}`);
                    cli.output(`   Expires: ${snapshot.expiresAt || 'N/A'}`);
                    
                    if (snapshot.description) {
                        cli.output(`   Description: ${snapshot.description}`);
                    }
                    
                    if (snapshot.storageSizeBytes) {
                        const sizeGB = (snapshot.storageSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
                        cli.output(`   Size: ${sizeGB} GB`);
                    }
                }

                if (snapshots.length > limit) {
                    cli.output(`\n... and ${snapshots.length - limit} more snapshot(s)`);
                    cli.output(`Increase limit with: monk do namespace/cluster list-snapshots limit=${snapshots.length}`);
                }
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to list backup snapshots`);
            throw new Error(`List snapshots operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Restore the cluster from a snapshot or point-in-time
     * 
     * ⚠️ WARNING: The target cluster will become READ-ONLY during restore!
     * This operation may take several hours depending on data size.
     * 
     * Usage:
     * - monk do namespace/cluster restore snapshotId="xxx"
     * - monk do namespace/cluster restore snapshotId="xxx" targetClusterName="new-cluster"
     * - monk do namespace/cluster restore pointInTimeUTCSeconds=1700000000
     * 
     * @param args Required/Optional arguments:
     *   - snapshotId: ID of the snapshot to restore (required unless using pointInTimeUTCSeconds)
     *   - pointInTimeUTCSeconds: Unix timestamp for point-in-time restore (alternative to snapshotId)
     *   - targetClusterName: Target cluster name (default: current cluster - WARNING: overwrites data!)
     *   - targetProjectId: Target project ID (default: current project)
     */
    @action("restore")
    restoreCluster(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`⚠️  RESTORE OPERATION - READ CAREFULLY!`);
        cli.output(`==================================================`);
        cli.output(`Cluster: ${this.definition.name}`);
        cli.output(`Project ID: ${this.definition.project_id}`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        if (!this.state.id) {
            throw new Error("Cluster ID is not available. Ensure the cluster is created and ready.");
        }

        // Validate required parameters
        const snapshotId = args?.snapshotId as string | undefined;
        const pointInTimeUTCSeconds = args?.pointInTimeUTCSeconds ? Number(args.pointInTimeUTCSeconds) : undefined;

        if (!snapshotId && !pointInTimeUTCSeconds) {
            throw new Error(
                "Either 'snapshotId' or 'pointInTimeUTCSeconds' is required.\n" +
                "Usage:\n" +
                "  monk do namespace/cluster restore snapshotId=\"your-snapshot-id\"\n" +
                "  monk do namespace/cluster restore pointInTimeUTCSeconds=1700000000\n" +
                "\nTo find snapshot IDs, run: monk do namespace/cluster list-snapshots"
            );
        }

        const targetClusterName = (args?.targetClusterName as string) || this.definition.name;
        const targetProjectId = (args?.targetProjectId as string) || this.definition.project_id;

        // Show warnings
        cli.output(`\n⚠️  WARNING: This operation will:`);
        if (targetClusterName === this.definition.name) {
            cli.output(`   - OVERWRITE ALL DATA in cluster '${targetClusterName}'`);
        } else {
            cli.output(`   - Restore data to cluster '${targetClusterName}'`);
        }
        cli.output(`   - Make the target cluster READ-ONLY during restore`);
        cli.output(`   - May take several hours depending on data size`);

        // Build restore request body
        const body: Record<string, unknown> = {
            deliveryType: "automated",
            targetClusterName: targetClusterName,
            targetGroupId: targetProjectId
        };

        if (snapshotId) {
            body.snapshotId = snapshotId;
            cli.output(`\nRestoring from Snapshot ID: ${snapshotId}`);
        } else if (pointInTimeUTCSeconds) {
            body.deliveryType = "pointInTime";
            body.pointInTimeUTCSeconds = pointInTimeUTCSeconds;
            const restoreDate = new Date(pointInTimeUTCSeconds * 1000).toISOString();
            cli.output(`\nRestoring to Point-in-Time: ${restoreDate}`);
        }

        cli.output(`Target Cluster: ${targetClusterName}`);
        cli.output(`Target Project: ${targetProjectId}`);
        cli.output(`==================================================`);

        try {
            const response = this.makeRequest(
                "POST",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/restoreJobs`,
                body
            );

            cli.output(`\n✅ Restore job created successfully!`);
            cli.output(`Restore Job ID: ${response.id}`);
            cli.output(`Status: ${response.status || 'IN_PROGRESS'}`);
            cli.output(`Delivery Type: ${response.deliveryType}`);
            cli.output(`Created at: ${response.createdAt}`);
            
            if (response.snapshotId) {
                cli.output(`Snapshot ID: ${response.snapshotId}`);
            }
            if (response.pointInTimeUTCSeconds) {
                cli.output(`Point-in-Time: ${new Date(response.pointInTimeUTCSeconds * 1000).toISOString()}`);
            }
            
            cli.output(`\n📋 To check restore progress:`);
            cli.output(`   monk do namespace/cluster restore-status jobId="${response.id}"`);
            cli.output(`\n⏳ Restore may take several hours. The cluster will be read-only until complete.`);
            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to create restore job`);
            throw new Error(`Restore operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Check the status of a restore job
     * 
     * Usage:
     * - monk do namespace/cluster restore-status jobId="xxx"
     * 
     * @param args Required arguments:
     *   - jobId: ID of the restore job to check
     */
    @action("restore-status")
    getRestoreStatus(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Checking restore job status`);
        cli.output(`Cluster: ${this.definition.name}`);
        cli.output(`==================================================`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        const jobId = args?.jobId as string | undefined;
        if (!jobId) {
            throw new Error(
                "'jobId' is required.\n" +
                "Usage: monk do namespace/cluster restore-status jobId=\"your-job-id\"\n" +
                "\nTo find job IDs, run: monk do namespace/cluster list-restore-jobs"
            );
        }

        try {
            const response = this.makeRequest(
                "GET",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/restoreJobs/${jobId}`
            );

            cli.output(`\n🔄 Restore Job Details`);
            cli.output(`   Job ID: ${response.id}`);
            cli.output(`   Status: ${response.status || 'UNKNOWN'}`);
            cli.output(`   Delivery Type: ${response.deliveryType}`);
            cli.output(`   Target Cluster: ${response.targetClusterName}`);
            cli.output(`   Created: ${response.createdAt}`);
            
            if (response.finishedAt) {
                cli.output(`   Finished: ${response.finishedAt}`);
            } else {
                cli.output(`   Finished: In progress...`);
            }

            if (response.snapshotId) {
                cli.output(`   Snapshot ID: ${response.snapshotId}`);
            }
            if (response.pointInTimeUTCSeconds) {
                cli.output(`   Point-in-Time: ${new Date(response.pointInTimeUTCSeconds * 1000).toISOString()}`);
            }

            // Show status-specific messages
            const status = String(response.status || '').toUpperCase();
            if (status === 'COMPLETED' || status === 'FINISHED') {
                cli.output(`\n✅ Restore completed successfully!`);
                cli.output(`   The cluster is now available for read/write operations.`);
            } else if (status === 'IN_PROGRESS' || status === 'PENDING') {
                cli.output(`\n⏳ Restore is still in progress...`);
                cli.output(`   The cluster is READ-ONLY until restore completes.`);
                cli.output(`   Check again later with: monk do namespace/cluster restore-status jobId="${jobId}"`);
            } else if (status === 'FAILED' || status === 'CANCELLED') {
                cli.output(`\n❌ Restore ${status.toLowerCase()}!`);
                if (response.statusMessage) {
                    cli.output(`   Message: ${response.statusMessage}`);
                }
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get restore job status`);
            throw new Error(`Get restore status failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all restore jobs for the cluster
     * 
     * Usage:
     * - monk do namespace/cluster list-restore-jobs
     * - monk do namespace/cluster list-restore-jobs limit=20
     * 
     * @param args Optional arguments:
     *   - limit: Maximum number of jobs to display (default: 10)
     */
    @action("list-restore-jobs")
    listRestoreJobs(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Listing restore jobs for cluster: ${this.definition.name}`);
        cli.output(`Project ID: ${this.definition.project_id}`);
        cli.output(`==================================================`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        const limit = Number(args?.limit) || 10;

        try {
            const response = this.makeRequest(
                "GET",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/restoreJobs`
            );

            const jobs = response.results || [];
            const totalCount = response.totalCount || jobs.length;

            cli.output(`\nTotal restore jobs: ${totalCount}`);
            cli.output(`Showing: ${Math.min(jobs.length, limit)} job(s)\n`);

            if (jobs.length === 0) {
                cli.output(`No restore jobs found for this cluster.`);
                cli.output(`Create a restore job using: monk do namespace/cluster restore snapshotId="xxx"`);
            } else {
                const displayJobs = jobs.slice(0, limit);
                
                for (let i = 0; i < displayJobs.length; i++) {
                    const job = displayJobs[i];
                    const statusIcon = this.getStatusIcon(job.status);
                    
                    cli.output(`\n${statusIcon} Restore Job #${i + 1}`);
                    cli.output(`   Job ID: ${job.id}`);
                    cli.output(`   Status: ${job.status}`);
                    cli.output(`   Target Cluster: ${job.targetClusterName}`);
                    cli.output(`   Delivery Type: ${job.deliveryType}`);
                    cli.output(`   Created: ${job.createdAt}`);
                    
                    if (job.finishedAt) {
                        cli.output(`   Finished: ${job.finishedAt}`);
                    }
                    
                    if (job.snapshotId) {
                        cli.output(`   Snapshot ID: ${job.snapshotId}`);
                    }
                }

                if (jobs.length > limit) {
                    cli.output(`\n... and ${jobs.length - limit} more job(s)`);
                    cli.output(`Increase limit with: monk do namespace/cluster list-restore-jobs limit=${jobs.length}`);
                }
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to list restore jobs`);
            throw new Error(`List restore jobs failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get status icon for restore job status
     */
    private getStatusIcon(status: string): string {
        const statusUpper = String(status || '').toUpperCase();
        switch (statusUpper) {
            case 'COMPLETED':
            case 'FINISHED':
                return '✅';
            case 'IN_PROGRESS':
            case 'PENDING':
            case 'QUEUED':
                return '⏳';
            case 'FAILED':
            case 'CANCELLED':
                return '❌';
            default:
                return '🔄';
        }
    }
}

