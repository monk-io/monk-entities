import { MonkEntity } from "monkec/base";
import { checkSecurityGroupExists, getCurrentSecurityGroupRules, revokeSecurityGroupIngress, updateSecurityGroupRules } from "./security-group.ts";
import cli from "cli";

export interface AWSRDSAccessListDefinition {
    region: string;
    security_group_id: string;
    port: number;
    allowed_cidr_blocks?: string[];
    allowed_security_group_names?: string[];
    vpc_id?: string;
}

export interface AWSRDSAccessListState {
    existing: boolean;
}

/**
 * @description AWS RDS Access List entity.
 * Manages security group ingress rules for RDS database access.
 * Controls which CIDR blocks and security groups can connect to the database.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.existing` - Whether the rules pre-existed
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-ec2/security-group` - The security group to modify
 * - `aws-rds/instance` - The RDS instance protected by the security group
 */
export class RDSAccessList extends MonkEntity<AWSRDSAccessListDefinition, AWSRDSAccessListState> {
    
    static readonly readiness = { period: 5, initialDelay: 2, attempts: 20 };

    

    override create(): void {
        // Validate that security group exists
        if (!checkSecurityGroupExists(this.definition.region, this.definition.security_group_id)) {
            throw new Error(`Security group ${this.definition.security_group_id} not found`);
        }
        
        // Update security group rules to match definition
        this.updateSecurityGroupRules();
    }

    override start(): void {
        
    }

    override stop(): void {
        
    }

    override update(): void {        
        this.updateSecurityGroupRules();
    }

    override delete(): void {
        try {
            // Remove all rules we manage from the security group
            const currentAwsRules = getCurrentSecurityGroupRules(this.definition.region, this.definition.security_group_id, this.definition.port);
            if (currentAwsRules.cidrs.length > 0 || currentAwsRules.sgIds.length > 0) {
                revokeSecurityGroupIngress(
                    this.definition.region,
                    this.definition.security_group_id, 
                    'tcp', 
                    this.definition.port, 
                    this.definition.port, 
                    currentAwsRules.cidrs, 
                    currentAwsRules.sgIds
                );
            }
        } catch (error) {
            // Log but don't fail if cleanup fails
            cli.output(`Warning: Failed to clean up security group rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected updateSecurityGroupRules(): void {
        const groupId = this.definition.security_group_id;
        const port = this.definition.port;
        const region = this.definition.region;
        const vpcId = this.definition.vpc_id;
        const allowedCidrs = this.definition.allowed_cidr_blocks || [];
        const allowedSgNames = this.definition.allowed_security_group_names || [];
        
        updateSecurityGroupRules(region, groupId, port, [...allowedCidrs], [...allowedSgNames], vpcId);
    }
}