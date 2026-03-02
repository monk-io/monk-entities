import {
    AWSNeptuneEntity,
    AWSNeptuneDefinition,
    AWSNeptuneState,
    action
} from "./neptune-base.ts";
import cli from "cli";

/**
 * Definition interface for AWS Neptune Cluster Parameter Group entity.
 * Configures cluster-level parameters for Neptune.
 * @interface ClusterParameterGroupDefinition
 */
export interface ClusterParameterGroupDefinition extends AWSNeptuneDefinition {
    /** @description Name for the cluster parameter group (1-255 chars) */
    db_cluster_parameter_group_name: string;
    
    /** @description DB parameter group family (e.g., neptune1, neptune1.2) */
    db_parameter_group_family: string;
    
    /** @description Human-readable description of the parameter group */
    parameter_group_description?: string;
    
    /** @description Parameters to set in the group */
    parameters?: Record<string, string>;
    
    /** @description Resource tags for the parameter group */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS Neptune Cluster Parameter Group entity.
 * Contains runtime information about the created parameter group.
 * @interface ClusterParameterGroupState
 */
export interface ClusterParameterGroupState extends AWSNeptuneState {
    /** @description Full ARN of the parameter group */
    db_cluster_parameter_group_arn?: string;
    
    /** @description Parameter group name */
    db_cluster_parameter_group_name?: string;
    
    /** @description Parameter group family */
    db_parameter_group_family?: string;
}

/**
 * @description AWS Neptune Cluster Parameter Group entity.
 * Creates and manages Neptune cluster parameter groups for configuring cluster-level settings.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.db_cluster_parameter_group_arn` - Parameter group ARN
 * - `state.db_cluster_parameter_group_name` - Parameter group name for cluster configuration
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-neptune/cluster` - Apply this parameter group to clusters
 */
export class ClusterParameterGroup extends AWSNeptuneEntity<ClusterParameterGroupDefinition, ClusterParameterGroupState> {
    
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    override create(): void {
        // Check if parameter group already exists
        try {
            const existing = this.getParameterGroupInfo(this.definition.db_cluster_parameter_group_name);
            if (existing) {
                this.state = {
                    db_cluster_parameter_group_arn: existing.db_cluster_parameter_group_arn,
                    db_cluster_parameter_group_name: existing.db_cluster_parameter_group_name,
                    db_parameter_group_family: existing.db_parameter_group_family,
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
            DBClusterParameterGroupName: this.definition.db_cluster_parameter_group_name,
            DBParameterGroupFamily: this.definition.db_parameter_group_family,
            Description: this.definition.parameter_group_description || `Neptune cluster parameter group ${this.definition.db_cluster_parameter_group_name}`
        };

        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            params.Tags = Object.entries(this.definition.tags).map(([key, value]) => ({
                Key: key,
                Value: value
            }));
        }

        const response = this.makeNeptuneRequest("CreateDBClusterParameterGroup", params);
        
        const arn = this.extractXmlValue(response, 'DBClusterParameterGroupArn');

        this.state = {
            db_cluster_parameter_group_arn: arn,
            db_cluster_parameter_group_name: this.definition.db_cluster_parameter_group_name,
            db_parameter_group_family: this.definition.db_parameter_group_family,
            existing: false
        };

        // Apply parameters if specified
        if (this.definition.parameters && Object.keys(this.definition.parameters).length > 0) {
            this.applyParameters(this.definition.parameters);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.db_cluster_parameter_group_name) {
            return false;
        }

        try {
            const info = this.getParameterGroupInfo(this.state.db_cluster_parameter_group_name);
            return info !== null;
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    override update(): void {
        if (!this.state.db_cluster_parameter_group_name) {
            throw new Error("Parameter group not created yet");
        }

        // Apply parameters if specified
        if (this.definition.parameters && Object.keys(this.definition.parameters).length > 0) {
            this.applyParameters(this.definition.parameters);
        }
    }

    override delete(): void {
        if (!this.state.db_cluster_parameter_group_name) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            this.makeNeptuneRequest("DeleteDBClusterParameterGroup", {
                DBClusterParameterGroupName: this.state.db_cluster_parameter_group_name
            });
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return;
            }
            throw error;
        }
    }

    /**
     * Apply parameters to the parameter group
     */
    private applyParameters(parameters: Record<string, string>): void {
        const paramList = Object.entries(parameters).map(([name, value]) => ({
            ParameterName: name,
            ParameterValue: value,
            ApplyMethod: 'pending-reboot'
        }));

        this.makeNeptuneRequest("ModifyDBClusterParameterGroup", {
            DBClusterParameterGroupName: this.state.db_cluster_parameter_group_name,
            Parameters: paramList
        });
    }

    /**
     * Get parameter group information from AWS
     */
    private getParameterGroupInfo(groupName: string): ClusterParameterGroupState | null {
        try {
            const response = this.makeNeptuneRequest("DescribeDBClusterParameterGroups", {
                DBClusterParameterGroupName: groupName
            });

            const name = this.extractXmlValue(response, 'DBClusterParameterGroupName');
            if (!name) {
                return null;
            }

            return {
                db_cluster_parameter_group_arn: this.extractXmlValue(response, 'DBClusterParameterGroupArn'),
                db_cluster_parameter_group_name: name,
                db_parameter_group_family: this.extractXmlValue(response, 'DBParameterGroupFamily')
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
     * Get detailed parameter group information
     */
    @action("get-info")
    getInfo(): void {
        if (!this.state.db_cluster_parameter_group_name) {
            throw new Error("Parameter group not created yet");
        }

        const info = this.getParameterGroupInfo(this.state.db_cluster_parameter_group_name);
        if (!info) {
            throw new Error(`Parameter group ${this.state.db_cluster_parameter_group_name} not found`);
        }

        cli.output("==================================================");
        cli.output(`Cluster Parameter Group: ${info.db_cluster_parameter_group_name}`);
        cli.output("==================================================");
        cli.output(`ARN: ${info.db_cluster_parameter_group_arn}`);
        cli.output(`Family: ${info.db_parameter_group_family}`);
        cli.output("==================================================");
    }

    /**
     * List all parameters in the group
     */
    @action("list-parameters")
    listParameters(): void {
        if (!this.state.db_cluster_parameter_group_name) {
            throw new Error("Parameter group not created yet");
        }

        const response = this.makeNeptuneRequest("DescribeDBClusterParameters", {
            DBClusterParameterGroupName: this.state.db_cluster_parameter_group_name
        });

        cli.output("==================================================");
        cli.output(`Parameters in: ${this.state.db_cluster_parameter_group_name}`);
        cli.output("==================================================");

        const names = this.extractXmlValues(response, 'ParameterName');
        const values = this.extractXmlValues(response, 'ParameterValue');
        const sources = this.extractXmlValues(response, 'Source');

        if (names.length > 0) {
            for (let i = 0; i < names.length; i++) {
                cli.output(`⚙️ ${names[i]}`);
                cli.output(`   Value: ${values[i] || '(default)'}`);
                cli.output(`   Source: ${sources[i] || 'unknown'}`);
                cli.output("");
            }
        } else {
            cli.output("No parameters found.");
        }

        cli.output("==================================================");
    }

    /**
     * Reset parameters to default values
     */
    @action("reset-parameters")
    resetParameters(args?: { parameter_names?: string }): void {
        if (!this.state.db_cluster_parameter_group_name) {
            throw new Error("Parameter group not created yet");
        }

        const params: Record<string, any> = {
            DBClusterParameterGroupName: this.state.db_cluster_parameter_group_name
        };

        if (args?.parameter_names) {
            // Reset specific parameters
            const names = args.parameter_names.split(',').map(n => n.trim());
            params.Parameters = names.map(name => ({
                ParameterName: name,
                ApplyMethod: 'pending-reboot'
            }));
        } else {
            // Reset all parameters
            params.ResetAllParameters = true;
        }

        this.makeNeptuneRequest("ResetDBClusterParameterGroup", params);

        cli.output(`✅ Parameters reset for ${this.state.db_cluster_parameter_group_name}`);
    }
}
