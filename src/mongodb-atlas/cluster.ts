import { MongoDBAtlasEntity, MongoDBAtlasEntityDefinition, MongoDBAtlasEntityState } from "./base.ts";
import cli from "cli";

/**
 * Represents a MongoDB Atlas cluster entity.
 * This entity allows interaction with MongoDB Atlas clusters via its API.
 * @interface ClusterDefinition
 */
export interface ClusterDefinition extends MongoDBAtlasEntityDefinition {
    /**
     * Cluster name
     * @minLength 1
     * @maxLength 100
     */
    name: string;

    /**
     * Project ID where the cluster will be created
     * @minLength 1
     * @maxLength 24
     */
    project_id: string;

    /**
     * Cloud provider
     */
    provider: "AWS" | "GCP" | "AZURE";

    /**
     * Cloud provider region
     */
    region: string;

    /**
     * Instance size/tier
     */
    instance_size: "M0" | "M2" | "M5" | "M10" | "M20" | "M30" | "M40" | "M50" | "M60" | "M80";

    /**
     * Array of IP addresses allowed to access the cluster
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
     * Cluster ID
     */
    id?: string;

    /**
     * Cluster Name
     */
    name?: string;

    /**
     * Standard connection string
     */
    connection_standard?: string;

    /**
     * SRV connection string
     */
    connection_srv?: string;
}

export class Cluster extends MongoDBAtlasEntity<ClusterDefinition, ClusterState> {
    
    protected getEntityName(): string {
        return this.definition.name;
    }

    /** Create a new MongoDB Atlas cluster */
    override create(): void {
        const body = {
            "name": this.definition.name,
            "clusterType": "REPLICASET",
            "replicationSpecs": [
                {
                    "regionConfigs": [
                        {
                            "electableSpecs": {
                                "instanceSize": this.definition.instance_size,
                                "nodeCount": 3
                            },
                            "providerName": "TENANT",
                            "backingProviderName": this.definition.provider,
                            "regionName": this.definition.region
                        }
                    ]
                }
            ]
        };

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
}

