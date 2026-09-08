import { MongoDBAtlasEntity, MongoDBAtlasEntityDefinition, MongoDBAtlasEntityState } from "./atlas-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

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
     * @description Instance size/tier. M0 = free (shared/TENANT), FLEX = Flex cluster
     * (replaces the retired M2/M5 shared tiers), M10+ = dedicated. M2/M5 reached
     * End-of-Life on 2026-01-22 and are no longer creatable via the Atlas API.
     */
    instance_size: "M0" | "FLEX" | "M10" | "M20" | "M30" | "M40" | "M50" | "M60" | "M80";

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
     * @description Project (group) ID this cluster was created in
     */
    project_id?: string;

    /**
     * @description Tier family the cluster was created with ("free" = M0, "flex" = FLEX,
     * "dedicated" = M10+). Atlas cannot migrate a cluster between these families in place;
     * used to detect and reject an unsupported instance_size change on update.
     */
    tier_family?: "free" | "flex" | "dedicated";

    /**
     * @description Standard connection string
     */
    connection_standard?: string;

    /**
     * @description SRV connection string
     */
    connection_srv?: string;

    /**
     * @description IP/CIDR values from `allow_ips` currently applied to the project's
     * access list by this entity. Used to reconcile additions/removals on update without
     * touching entries added by other means.
     */
    applied_ips?: string[];
}

/**
 * @description MongoDB Atlas Cluster entity.
 * Creates and manages MongoDB Atlas database clusters for document storage.
 * Supports M0 (free tier), FLEX (Flex cluster), and M10+ (dedicated) cluster tiers.
 * 
 * ## Secrets
 * - Reads: secret name from `secret_ref` property - MongoDB Atlas service account credentials JSON
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.name` - Cluster name
 * - `state.connection_srv` - SRV connection string (mongodb+srv://...)
 * - `state.connection_standard` - Standard connection string
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `mongodb-atlas/user` - Create database users with role-based access
 * - `mongodb-atlas/project` - The parent project containing the cluster
 */
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

    /** Free tier (M0) — created on the /clusters endpoint with the TENANT provider. */
    private isFreeTier(): boolean {
        return this.definition.instance_size === "M0";
    }

    /** Flex tier — created on the dedicated /flexClusters endpoint. */
    private isFlexTier(): boolean {
        return this.definition.instance_size === "FLEX";
    }

    /** Dedicated tier (M10+) — created on the /clusters endpoint with a direct provider. */
    private isDedicatedTier(): boolean {
        return !this.isFreeTier() && !this.isFlexTier();
    }

    /** Tier family implied by the current `instance_size`; used to detect unsupported migrations. */
    private tierFamily(): "free" | "flex" | "dedicated" {
        if (this.isFlexTier()) return "flex";
        if (this.isFreeTier()) return "free";
        return "dedicated";
    }

    /** Collection path for this cluster's tier (Flex uses a separate endpoint). */
    private clustersCollectionPath(): string {
        const base = `/groups/${this.definition.project_id}`;
        return this.isFlexTier() ? `${base}/flexClusters` : `${base}/clusters`;
    }

    /** Resource path for this specific cluster. */
    private clusterResourcePath(): string {
        return `${this.clustersCollectionPath()}/${this.definition.name}`;
    }

    /** Create a new MongoDB Atlas cluster (Flex, free, or dedicated). */
    override create(): void {
        if (this.isFlexTier()) {
            this.createFlexCluster();
        } else {
            this.createClusterResource();
        }

        this.state.project_id = this.definition.project_id;
        this.state.tier_family = this.tierFamily();

        // Configure IP access list if provided (applies to all tiers)
        this.reconcileIPAccessList();
    }

    /** Create a Flex cluster via the /flexClusters endpoint. */
    private createFlexCluster(): void {
        const body: Record<string, unknown> = {
            "name": this.definition.name,
            "providerSettings": {
                "backingProviderName": this.definition.provider,
                "regionName": this.definition.region
            }
        };

        const resObj = this.makeRequest("POST", this.clustersCollectionPath(), body);

        this.state = {
            // Flex clusters are identified by name; fall back to name if no id is returned.
            id: resObj.id || resObj.name || this.definition.name,
            name: resObj.name || this.definition.name
        };
    }

    /** Create a free (M0/TENANT) or dedicated (M10+) cluster via the /clusters endpoint. */
    private createClusterResource(): void {
        const regionConfig: Record<string, unknown> = {
            "electableSpecs": {
                "instanceSize": this.definition.instance_size,
                "nodeCount": 3
            },
            "regionName": this.definition.region
        };

        // M0 (free) uses the TENANT provider; dedicated tiers use the direct provider name.
        if (this.isFreeTier()) {
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

        // Enable Cloud Backup for dedicated clusters (M10+); required for backup API operations.
        if (this.isDedicatedTier()) {
            body.backupEnabled = true;
        }

        const resObj = this.makeRequest("POST", this.clustersCollectionPath(), body);

        this.state = {
            id: resObj.id,
            name: resObj.name
        };
    }

    private accessListCollectionPath(): string {
        return `/groups/${this.definition.project_id}/accessList`;
    }

    /** Single-entry path. CIDR blocks contain "/", which must be URL-encoded. */
    private accessListEntryPath(value: string): string {
        return `${this.accessListCollectionPath()}/${encodeURIComponent(value)}`;
    }

    /** A bare IP goes in `ipAddress`; anything with a "/" is a CIDR block. */
    private classifyIpEntry(value: string): { field: "ipAddress" | "cidrBlock"; value: string } {
        return value.includes("/") ? { field: "cidrBlock", value } : { field: "ipAddress", value };
    }

    /**
     * Reconcile the project's IP access list against `allow_ips`: add entries that are
     * newly desired, and remove entries this entity previously added that are no longer
     * desired. Never touches entries it didn't add — ownership is tracked via
     * `state.applied_ips`, falling back to matching the "Added by MonkeC entity" comment
     * for clusters created before that tracking existed.
     */
    private reconcileIPAccessList(): void {
        const desired = this.definition.allow_ips || [];

        // A failed read must not be treated as "nothing to do" — that would report the
        // update as successful while leaving Atlas unreconciled (the original PRO-877 bug).
        const response = this.makeRequest("GET", this.accessListCollectionPath());
        const existing: any[] = (response && response.results) ? response.results : [];

        // The list endpoint is paginated; reconciling against a partial page would add
        // duplicates (entries that exist on a later page) and miss removals. Fail loudly
        // instead of silently reconciling against incomplete data.
        const totalCount = response?.totalCount ?? existing.length;
        if (existing.length < totalCount) {
            throw new Error(
                `IP access list for project ${this.definition.project_id} has ${totalCount} entries but only ` +
                `${existing.length} were returned by a single page; pagination is not yet supported by allow_ips reconciliation.`
            );
        }

        const existingValues = new Set<string>();
        for (const e of existing) {
            const v = e.ipAddress || e.cidrBlock || e.awsSecurityGroup;
            if (v) existingValues.add(v);
        }

        const managed = new Set<string>(
            this.state.applied_ips ?? existing
                .filter(e => e.comment === "Added by MonkeC entity")
                .map(e => e.ipAddress || e.cidrBlock || e.awsSecurityGroup)
                .filter(Boolean)
        );

        const toAdd = desired.filter(ip => !existingValues.has(ip));
        const toRemove = [...managed].filter(ip => !desired.includes(ip) && existingValues.has(ip));

        if (toAdd.length > 0) {
            const body = toAdd.map(ip => {
                const entry = this.classifyIpEntry(ip);
                return { [entry.field]: entry.value, comment: "Added by MonkeC entity" };
            });
            this.makeRequest("POST", this.accessListCollectionPath(), body);
        }

        for (const ip of toRemove) {
            try {
                this.makeRequest("DELETE", this.accessListEntryPath(ip));
            } catch (error) {
                if (!this.isResourceGoneError(error)) {
                    throw error;
                }
            }
        }

        this.state.applied_ips = [...desired];
    }

    /**
     * Live region/provider (and, for non-Flex tiers, the raw region config) read off the
     * cluster. For M0 (free tier), `providerName` is always the fixed value `"TENANT"` —
     * never compare that against `definition.provider`, only `backingProviderName` reflects
     * the actual cloud. Returns `undefined` rather than a misleading value when the field
     * we need isn't present, so callers can treat "can't tell" as "don't flag a change".
     */
    private liveRegionConfig(clusterData: any): { provider?: string; region?: string; regionConfig?: any } {
        if (this.isFlexTier()) {
            return {
                provider: clusterData.providerSettings?.backingProviderName,
                region: clusterData.providerSettings?.regionName
            };
        }
        const regionConfig = clusterData.replicationSpecs?.[0]?.regionConfigs?.[0];
        const provider = this.isFreeTier()
            ? regionConfig?.backingProviderName
            : regionConfig?.providerName;
        return {
            provider,
            region: regionConfig?.regionName,
            regionConfig
        };
    }

    /**
     * PATCH instance_size/region/provider changes for a dedicated (M10+) cluster.
     * Deep-clones the live `replicationSpecs` and mutates only the fields that changed,
     * so nodeCount/priority/analytics specs set outside this entity are preserved —
     * Atlas replaces the whole array on PATCH rather than merging it.
     */
    private reconcileClusterConfig(clusterData: any): void {
        const replicationSpecs = JSON.parse(JSON.stringify(clusterData.replicationSpecs || []));
        const regionConfig = replicationSpecs?.[0]?.regionConfigs?.[0];
        if (!regionConfig) {
            throw new Error("Unable to read current cluster region configuration; cannot reconcile instance_size/region/provider.");
        }

        if (regionConfig.electableSpecs) {
            regionConfig.electableSpecs.instanceSize = this.definition.instance_size;
        }
        regionConfig.regionName = this.definition.region;
        if (regionConfig.providerName === "TENANT") {
            regionConfig.backingProviderName = this.definition.provider;
        } else {
            regionConfig.providerName = this.definition.provider;
        }

        cli.output(`Updating cluster configuration: instance_size=${this.definition.instance_size}, region=${this.definition.region}, provider=${this.definition.provider}`);
        this.makeRequest("PATCH", this.clusterResourcePath(), { replicationSpecs });
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // Identity fields can't be changed via update — Atlas has no rename/move
        // operation, and the resource path is derived from these values.
        if (this.state.project_id && this.state.project_id !== this.definition.project_id) {
            throw new Error(
                `Cannot change project_id for an existing cluster (was ${this.state.project_id}, now ${this.definition.project_id}). ` +
                `Atlas does not support moving a cluster between projects; delete and recreate it instead.`
            );
        }
        if (this.state.name && this.state.name !== this.definition.name) {
            throw new Error(
                `Cannot rename an existing cluster (was ${this.state.name}, now ${this.definition.name}). ` +
                `Atlas does not support renaming a cluster; delete and recreate it instead.`
            );
        }

        const desiredTierFamily = this.tierFamily();
        if (this.state.tier_family && this.state.tier_family !== desiredTierFamily) {
            throw new Error(
                `Cannot change instance_size from a ${this.state.tier_family} tier to a ${desiredTierFamily} tier ` +
                `(${this.definition.instance_size}) on an existing cluster. Atlas does not support migrating between ` +
                `free/Flex/dedicated tiers via update; delete and recreate the cluster instead.`
            );
        }

        // Check current cluster state
        const clusterData = this.checkResourceExists(this.clusterResourcePath());

        if (clusterData) {
            this.state = {
                ...this.state,
                id: clusterData.id || this.state.id,
                name: clusterData.name,
                project_id: this.definition.project_id,
                tier_family: desiredTierFamily,
                connection_standard: clusterData.connectionStrings?.standard,
                connection_srv: clusterData.connectionStrings?.standardSrv
            };

            // Only flag a change when we can actually read the live value — an absent
            // field means "can't tell", not "different", so it must not trip the
            // M0/Flex "unsupported migration" error below on an unchanged cluster.
            const live = this.liveRegionConfig(clusterData);
            const regionOrProviderChanged = live.region !== undefined && live.provider !== undefined
                && (this.definition.region !== live.region || this.definition.provider !== live.provider);
            const instanceSizeChanged = live.regionConfig?.electableSpecs?.instanceSize !== undefined
                && this.definition.instance_size !== live.regionConfig.electableSpecs.instanceSize;

            if (desiredTierFamily === "dedicated") {
                if (regionOrProviderChanged || instanceSizeChanged) {
                    this.reconcileClusterConfig(clusterData);
                }
            } else if (regionOrProviderChanged) {
                throw new Error(
                    `Cannot change region/provider for a ${desiredTierFamily} cluster after creation. ` +
                    `Atlas does not support region/provider migration for M0/Flex clusters; delete and recreate the cluster instead.`
                );
            }
        }

        this.reconcileIPAccessList();
    }

    /**
     * Remove the access-list entries this entity added via `allow_ips`. Best-effort:
     * a failure here shouldn't block the cluster itself from being torn down, so
     * unexpected errors are logged rather than thrown.
     */
    private removeManagedIpEntries(): void {
        const managed = this.state.applied_ips || [];
        for (const ip of managed) {
            try {
                this.makeRequest("DELETE", this.accessListEntryPath(ip));
            } catch (error) {
                if (!this.isResourceGoneError(error)) {
                    cli.output(`Warning: Failed to remove IP access list entry ${ip}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        this.state.applied_ips = [];
    }

    override delete(): void {
        this.removeManagedIpEntries();

        if (!this.state.id) {
            cli.output("Cluster does not exist, nothing to delete");
            return;
        }

        this.deleteResource(this.clusterResourcePath(), "Cluster");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        const clusterData = this.checkResourceExists(this.clusterResourcePath());

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
        const clusterData = this.checkResourceExists(this.clusterResourcePath());
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
        if (!this.isDedicatedTier()) {
            throw new Error(
                `Backup operations are not supported for cluster tier ${this.definition.instance_size}. ` +
                `On-demand backups require a dedicated cluster (M10 or higher). ` +
                `Flex clusters receive automatic snapshots that are not managed via these actions.`
            );
        }
    }

    /**
     * Get backup configuration and status information for the cluster
     * 
     * Shows current backup settings and cluster backup capability.
     * Backups are only available for M10+ (dedicated) clusters.
     * 
     * Usage:
     * - monk do namespace/cluster get-backup-info
     */
    @action("get-backup-info")
    getBackupInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Backup Information for cluster: ${this.definition.name}`);
        cli.output(`Project ID: ${this.definition.project_id}`);
        cli.output(`==================================================`);

        if (!this.state.id) {
            throw new Error("Cluster ID is not available. Ensure the cluster is created and ready.");
        }

        try {
            const clusterData = this.checkResourceExists(`/groups/${this.definition.project_id}/clusters/${this.definition.name}`);
            
            if (!clusterData) {
                throw new Error(`Cluster ${this.definition.name} not found`);
            }

            cli.output(`\n🔧 Cluster Configuration:`);
            cli.output(`   Cluster Tier: ${this.definition.instance_size}`);
            cli.output(`   Provider: ${this.definition.provider}`);
            cli.output(`   Region: ${this.definition.region}`);
            
            const backupSupported = this.isDedicatedTier();
            cli.output(`   Backup Supported: ${backupSupported ? '✅ Yes (M10+)' : '❌ No (M0/Flex)'}`);
            
            if (clusterData.backupEnabled !== undefined) {
                cli.output(`   Backup Enabled: ${clusterData.backupEnabled ? '✅ Yes' : '❌ No'}`);
            }
            
            if (!backupSupported) {
                cli.output(`\n⚠️  Note: Backups require a dedicated cluster (M10 or higher).`);
                cli.output(`   Current tier ${this.definition.instance_size} does not support on-demand backups.`);
            } else {
                cli.output(`\n📋 To create a manual snapshot:`);
                cli.output(`   monk do namespace/cluster create-snapshot`);
                cli.output(`\n📋 To list all snapshots:`);
                cli.output(`   monk do namespace/cluster list-snapshots`);
            }
            
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get backup info`);
            throw new Error(`Get backup info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create an on-demand backup snapshot of the cluster
     * 
     * Backups are only available for M10+ (dedicated) clusters.
     * Snapshots are stored according to your backup retention policy.
     * 
     * Usage:
     * - monk do namespace/cluster create-snapshot
     * - monk do namespace/cluster create-snapshot description="Pre-migration backup"
     * - monk do namespace/cluster create-snapshot retention_days=14
     * 
     * @param args Optional arguments:
     *   - description: Description for the snapshot (default: "Manual backup at <timestamp>")
     *   - retention_days: Number of days to retain the snapshot (default: 7)
     */
    @action("create-snapshot")
    createSnapshot(args?: Args): void {
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
        const retentionInDays = Number(args?.retention_days || args?.retentionInDays) || 7; // Support both for backward compatibility

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
                cli.output(`Create a snapshot using: monk do namespace/cluster create-snapshot`);
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
     * - monk do namespace/cluster restore snapshot_id="xxx"
     * - monk do namespace/cluster restore snapshot_id="xxx" target_id="new-cluster"
     * - monk do namespace/cluster restore restore_timestamp="2024-12-01T10:00:00Z"
     * 
     * @param args Required/Optional arguments:
     *   - snapshot_id: ID of the snapshot to restore (required unless using restore_timestamp)
     *   - restore_timestamp: ISO 8601 timestamp or Unix seconds for point-in-time restore (alternative to snapshot_id)
     *   - target_id: Target cluster name (default: current cluster - WARNING: overwrites data!)
     *   - target_project_id: Target project ID (default: current project)
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

        // Validate required parameters (support old param names for backward compatibility)
        const snapshotId = (args?.snapshot_id || args?.snapshotId) as string | undefined;
        
        // Handle restore_timestamp - can be ISO 8601 string or Unix seconds
        let pointInTimeUTCSeconds: number | undefined;
        const restoreTimestamp = args?.restore_timestamp || args?.pointInTimeUTCSeconds;
        if (restoreTimestamp) {
            if (typeof restoreTimestamp === 'string' && restoreTimestamp.includes('T')) {
                // ISO 8601 format - convert to Unix seconds
                pointInTimeUTCSeconds = Math.floor(new Date(restoreTimestamp).getTime() / 1000);
            } else {
                pointInTimeUTCSeconds = Number(restoreTimestamp);
            }
        }

        if (!snapshotId && !pointInTimeUTCSeconds) {
            throw new Error(
                "Either 'snapshot_id' or 'restore_timestamp' is required.\n" +
                "Usage:\n" +
                "  monk do namespace/cluster restore snapshot_id=\"your-snapshot-id\"\n" +
                "  monk do namespace/cluster restore restore_timestamp=\"2024-12-01T10:00:00Z\"\n" +
                "\nTo find snapshot IDs, run: monk do namespace/cluster list-snapshots"
            );
        }

        const targetClusterName = (args?.target_id || args?.targetClusterName as string) || this.definition.name;
        const targetProjectId = (args?.target_project_id || args?.targetProjectId as string) || this.definition.project_id;

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
            cli.output(`   monk do namespace/cluster get-restore-status job_id="${response.id}"`);
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
     * - monk do namespace/cluster get-restore-status job_id="xxx"
     * 
     * @param args Required arguments:
     *   - job_id: ID of the restore job to check
     */
    @action("get-restore-status")
    getRestoreStatus(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`Checking restore job status`);
        cli.output(`Cluster: ${this.definition.name}`);
        cli.output(`==================================================`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        const jobId = (args?.job_id || args?.jobId) as string | undefined; // Support both for backward compatibility
        if (!jobId) {
            throw new Error(
                "'job_id' is required.\n" +
                "Usage: monk do namespace/cluster get-restore-status job_id=\"your-job-id\"\n" +
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
                cli.output(`   Check again later with: monk do namespace/cluster get-restore-status job_id="${jobId}"`);
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
                cli.output(`Create a restore job using: monk do namespace/cluster restore snapshot_id="xxx"`);
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
     * Get detailed information about a specific snapshot
     * 
     * Usage:
     * - monk do namespace/cluster/describe-snapshot snapshot_id="xxx"
     * 
     * @param args Required arguments:
     *   - snapshot_id: ID of the snapshot to describe
     */
    @action("describe-snapshot")
    describeSnapshot(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📸 Snapshot Details`);
        cli.output(`==================================================`);
        cli.output(`Cluster: ${this.definition.name}`);
        cli.output(`Project ID: ${this.definition.project_id}`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        const snapshotId = (args?.snapshot_id || args?.snapshotId) as string | undefined;

        if (!snapshotId) {
            throw new Error(
                "Required argument 'snapshot_id' not provided.\n" +
                "Usage: monk do namespace/cluster/describe-snapshot snapshot_id=\"xxx\"\n" +
                "\nTo find snapshot IDs, run: monk do namespace/cluster/list-snapshots"
            );
        }

        try {
            const snapshot = this.makeRequest(
                "GET",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/snapshots/${snapshotId}`
            );

            cli.output(`\n📸 Snapshot Information`);
            cli.output(`--------------------------------------------------`);
            cli.output(`ID: ${snapshot.id}`);
            cli.output(`Status: ${snapshot.status}`);
            cli.output(`Type: ${snapshot.type || 'scheduled'}`);
            cli.output(`Created: ${snapshot.createdAt}`);
            cli.output(`Expires: ${snapshot.expiresAt || 'N/A'}`);
            
            if (snapshot.description) {
                cli.output(`Description: ${snapshot.description}`);
            }
            
            if (snapshot.storageSizeBytes) {
                const sizeGB = (snapshot.storageSizeBytes / (1024 * 1024 * 1024)).toFixed(2);
                cli.output(`Size: ${sizeGB} GB`);
            }

            if (snapshot.mongodVersion) {
                cli.output(`MongoDB Version: ${snapshot.mongodVersion}`);
            }

            if (snapshot.replicaSetName) {
                cli.output(`Replica Set: ${snapshot.replicaSetName}`);
            }

            if (snapshot.snapshotType) {
                cli.output(`Snapshot Type: ${snapshot.snapshotType}`);
            }

            cli.output(`\n📋 To restore from this snapshot:`);
            cli.output(`   monk do namespace/cluster/restore snapshot_id="${snapshotId}"`);
            cli.output(`\n📋 To delete this snapshot:`);
            cli.output(`   monk do namespace/cluster/delete-snapshot snapshot_id="${snapshotId}"`);
            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get snapshot details`);
            throw new Error(`Describe snapshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete a backup snapshot
     * 
     * Usage:
     * - monk do namespace/cluster/delete-snapshot snapshot_id="xxx"
     * 
     * @param args Required arguments:
     *   - snapshot_id: ID of the snapshot to delete
     */
    @action("delete-snapshot")
    deleteSnapshot(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🗑️ DELETE SNAPSHOT`);
        cli.output(`==================================================`);
        cli.output(`Cluster: ${this.definition.name}`);
        cli.output(`Project ID: ${this.definition.project_id}`);

        // Validate cluster tier supports backups
        this.validateBackupSupport();

        const snapshotId = (args?.snapshot_id || args?.snapshotId) as string | undefined;

        if (!snapshotId) {
            throw new Error(
                "Required argument 'snapshot_id' not provided.\n" +
                "Usage: monk do namespace/cluster/delete-snapshot snapshot_id=\"xxx\"\n" +
                "\nTo find snapshot IDs, run: monk do namespace/cluster/list-snapshots"
            );
        }

        cli.output(`\n⚠️  WARNING: This will permanently delete the snapshot.`);
        cli.output(`   Snapshot ID: ${snapshotId}`);
        cli.output(`--------------------------------------------------`);

        try {
            // First verify the snapshot exists
            const snapshot = this.makeRequest(
                "GET",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/snapshots/${snapshotId}`
            );

            cli.output(`Found snapshot: ${snapshot.id}`);
            cli.output(`Type: ${snapshot.type || 'scheduled'}`);
            cli.output(`Created: ${snapshot.createdAt}`);

            // Delete the snapshot
            this.makeRequest(
                "DELETE",
                `/groups/${this.definition.project_id}/clusters/${this.definition.name}/backup/snapshots/${snapshotId}`
            );

            cli.output(`\n✅ Snapshot deleted successfully!`);
            cli.output(`   Snapshot ID: ${snapshotId}`);
            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to delete snapshot`);
            throw new Error(`Delete snapshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

