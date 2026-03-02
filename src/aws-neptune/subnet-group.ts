import {
    AWSNeptuneEntity,
    AWSNeptuneDefinition,
    AWSNeptuneState,
    action
} from "./neptune-base.ts";
import cli from "cli";

/**
 * Definition interface for AWS Neptune Subnet Group entity.
 * Configures VPC subnet configuration for Neptune clusters.
 * @interface SubnetGroupDefinition
 */
export interface SubnetGroupDefinition extends AWSNeptuneDefinition {
    /** @description Name for the subnet group (1-255 chars) */
    db_subnet_group_name: string;
    
    /** @description Human-readable description of the subnet group */
    db_subnet_group_description?: string;
    
    /** @description List of subnet IDs to include in the group */
    subnet_ids: string[];
    
    /** @description Resource tags for the subnet group */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS Neptune Subnet Group entity.
 * Contains runtime information about the created subnet group.
 * @interface SubnetGroupState
 */
export interface SubnetGroupState extends AWSNeptuneState {
    /** @description Full ARN of the subnet group */
    db_subnet_group_arn?: string;
    
    /** @description Subnet group name */
    db_subnet_group_name?: string;
    
    /** @description VPC ID containing the subnets */
    vpc_id?: string;
    
    /** @description Subnet group status */
    subnet_group_status?: string;
    
    /** @description List of subnet IDs in the group */
    subnet_ids?: string[];
}

/**
 * @description AWS Neptune Subnet Group entity.
 * Creates and manages Neptune DB subnet groups for VPC configuration.
 * Subnet groups define which subnets Neptune clusters can use.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.db_subnet_group_arn` - Subnet group ARN
 * - `state.db_subnet_group_name` - Subnet group name for cluster configuration
 * - `state.vpc_id` - VPC ID containing the subnets
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-neptune/cluster` - Apply this subnet group to clusters
 * - `aws-ec2/subnet` - Subnets to include in the group
 * - `aws-ec2/vpc` - VPC containing the subnets
 */
export class SubnetGroup extends AWSNeptuneEntity<SubnetGroupDefinition, SubnetGroupState> {
    
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 12 };

    override create(): void {
        if (!this.definition.subnet_ids || this.definition.subnet_ids.length < 2) {
            throw new Error("At least 2 subnet IDs are required for a Neptune subnet group");
        }

        // Check if subnet group already exists
        try {
            const existing = this.getSubnetGroupInfo(this.definition.db_subnet_group_name);
            if (existing) {
                this.state = {
                    db_subnet_group_arn: existing.db_subnet_group_arn,
                    db_subnet_group_name: existing.db_subnet_group_name,
                    vpc_id: existing.vpc_id,
                    subnet_group_status: existing.subnet_group_status,
                    subnet_ids: existing.subnet_ids,
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
            DBSubnetGroupName: this.definition.db_subnet_group_name,
            DBSubnetGroupDescription: this.definition.db_subnet_group_description || `Neptune subnet group ${this.definition.db_subnet_group_name}`,
            SubnetIds: this.definition.subnet_ids
        };

        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            params.Tags = Object.entries(this.definition.tags).map(([key, value]) => ({
                Key: key,
                Value: value
            }));
        }

        const response = this.makeNeptuneRequest("CreateDBSubnetGroup", params);
        
        const arn = this.extractXmlValue(response, 'DBSubnetGroupArn');
        const vpcId = this.extractXmlValue(response, 'VpcId');

        this.state = {
            db_subnet_group_arn: arn,
            db_subnet_group_name: this.definition.db_subnet_group_name,
            vpc_id: vpcId,
            subnet_group_status: 'Complete',
            subnet_ids: [...this.definition.subnet_ids],
            existing: false
        };
    }

    override checkReadiness(): boolean {
        if (!this.state.db_subnet_group_name) {
            return false;
        }

        try {
            const info = this.getSubnetGroupInfo(this.state.db_subnet_group_name);
            if (!info) {
                return false;
            }

            this.state.subnet_group_status = info.subnet_group_status;
            return info.subnet_group_status === 'Complete';
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    override update(): void {
        if (!this.state.db_subnet_group_name) {
            throw new Error("Subnet group not created yet");
        }

        if (!this.definition.subnet_ids || this.definition.subnet_ids.length < 2) {
            throw new Error("At least 2 subnet IDs are required for a Neptune subnet group");
        }

        const params: Record<string, any> = {
            DBSubnetGroupName: this.state.db_subnet_group_name,
            SubnetIds: this.definition.subnet_ids
        };

        if (this.definition.db_subnet_group_description) {
            params.DBSubnetGroupDescription = this.definition.db_subnet_group_description;
        }

        this.makeNeptuneRequest("ModifyDBSubnetGroup", params);
        this.state.subnet_ids = [...this.definition.subnet_ids];
    }

    override delete(): void {
        if (!this.state.db_subnet_group_name) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            this.makeNeptuneRequest("DeleteDBSubnetGroup", {
                DBSubnetGroupName: this.state.db_subnet_group_name
            });
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return;
            }
            throw error;
        }
    }

    /**
     * Get subnet group information from AWS
     */
    private getSubnetGroupInfo(groupName: string): SubnetGroupState | null {
        try {
            const response = this.makeNeptuneRequest("DescribeDBSubnetGroups", {
                DBSubnetGroupName: groupName
            });

            const name = this.extractXmlValue(response, 'DBSubnetGroupName');
            if (!name) {
                return null;
            }

            const subnetIds = this.extractXmlValues(response, 'SubnetIdentifier');

            return {
                db_subnet_group_arn: this.extractXmlValue(response, 'DBSubnetGroupArn'),
                db_subnet_group_name: name,
                vpc_id: this.extractXmlValue(response, 'VpcId'),
                subnet_group_status: this.extractXmlValue(response, 'SubnetGroupStatus'),
                subnet_ids: subnetIds
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
     * Get detailed subnet group information
     */
    @action("get-info")
    getInfo(): void {
        if (!this.state.db_subnet_group_name) {
            throw new Error("Subnet group not created yet");
        }

        const info = this.getSubnetGroupInfo(this.state.db_subnet_group_name);
        if (!info) {
            throw new Error(`Subnet group ${this.state.db_subnet_group_name} not found`);
        }

        cli.output("==================================================");
        cli.output(`Subnet Group: ${info.db_subnet_group_name}`);
        cli.output("==================================================");
        cli.output(`ARN: ${info.db_subnet_group_arn}`);
        cli.output(`VPC ID: ${info.vpc_id}`);
        cli.output(`Status: ${info.subnet_group_status}`);
        cli.output("");
        cli.output("Subnets:");
        if (info.subnet_ids && info.subnet_ids.length > 0) {
            for (const subnetId of info.subnet_ids) {
                cli.output(`  - ${subnetId}`);
            }
        } else {
            cli.output("  (none)");
        }
        cli.output("==================================================");
    }

    /**
     * List all subnet groups in the region
     */
    @action("list-subnet-groups")
    listSubnetGroups(): void {
        const response = this.makeNeptuneRequest("DescribeDBSubnetGroups", {});

        cli.output("==================================================");
        cli.output(`Neptune Subnet Groups in ${this.region}`);
        cli.output("==================================================");

        const names = this.extractXmlValues(response, 'DBSubnetGroupName');
        const vpcIds = this.extractXmlValues(response, 'VpcId');
        const statuses = this.extractXmlValues(response, 'SubnetGroupStatus');

        if (names.length > 0) {
            cli.output(`Total: ${names.length} subnet group(s)`);
            cli.output("");

            for (let i = 0; i < names.length; i++) {
                const isCurrent = names[i] === this.state.db_subnet_group_name ? " (current)" : "";
                cli.output(`🌐 ${names[i]}${isCurrent}`);
                cli.output(`   VPC: ${vpcIds[i] || 'unknown'}`);
                cli.output(`   Status: ${statuses[i] || 'unknown'}`);
                cli.output("");
            }
        } else {
            cli.output("No subnet groups found.");
        }

        cli.output("==================================================");
    }
}
