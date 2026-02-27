import { MonkEntity } from "monkec/base";
import {
    checkSecurityGroupExists,
    getCurrentSecurityGroupRules,
    revokeSecurityGroupIngress,
    updateSecurityGroupRules
} from "./common.ts";
import cli from "cli";

/**
 * Definition interface for AWS Neptune Access List entity.
 * Configures security group ingress rules for Neptune database access.
 * @interface NeptuneAccessListDefinition
 */
export interface NeptuneAccessListDefinition {
    /** @description AWS region for the Neptune cluster */
    region: string;
    
    /** @description Security group ID to manage rules for */
    security_group_id: string;
    
    /** @description Port number for Neptune (default: 8182) */
    port: number;
    
    /** @description CIDR blocks to allow access from */
    allowed_cidr_blocks?: string[];
    
    /** @description Security group names to allow access from (resolved to IDs) */
    allowed_security_group_names?: string[];
    
    /** @description VPC ID for resolving security group names */
    vpc_id?: string;
}

/**
 * State interface for AWS Neptune Access List entity.
 * @interface NeptuneAccessListState
 */
export interface NeptuneAccessListState {
    /** @description Whether the rules pre-existed */
    existing: boolean;
}

/**
 * @description AWS Neptune Access List entity.
 * Manages security group ingress rules for Neptune database access.
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
 * - `aws-neptune/cluster` - The Neptune cluster protected by the security group
 * 
 * ---
 * ## Dynamic Access Control
 * 
 * **This entity is REQUIRED** for proper Neptune access control.
 * 
 * Use this entity to open database access AFTER client is deployed.
 * Choose access method based on where client runs:
 * 
 * ### Option 1: allowed_security_group_names (Private VPC access)
 * Use when client runs on AWS nodes in the same VPC as Neptune.
 * ```yaml
 * access-list:
 *   defines: aws-neptune/access-list
 *   region: <- connection-target("db") entity get-member("region")
 *   security_group_id: <- connection-target("db") entity-state get-member("created_security_group_id")
 *   port: <- connection-target("db") entity-state get-member("port")
 *   allowed_security_group_names: <- runnable-peers("ns/client")
 *   connections:
 *     db:
 *       runnable: ns/neptune-cluster
 *       service: data
 *   depends:
 *     wait-for:
 *       runnables: [ns/neptune-cluster, ns/client]  # MUST wait for both
 *       timeout: 600
 * ```
 * 
 * ### Option 2: allowed_cidr_blocks (VPN/Direct Connect access)
 * Use when client connects via VPN or Direct Connect.
 * ```yaml
 * access-list:
 *   defines: aws-neptune/access-list
 *   region: <- connection-target("db") entity get-member("region")
 *   security_group_id: <- connection-target("db") entity-state get-member("created_security_group_id")
 *   port: <- connection-target("db") entity-state get-member("port")
 *   allowed_cidr_blocks:
 *     - "10.0.0.0/8"  # VPN CIDR
 *   connections:
 *     db:
 *       runnable: ns/neptune-cluster
 *       service: data
 *   depends:
 *     wait-for:
 *       runnables: [ns/neptune-cluster]
 *       timeout: 600
 * ```
 * 
 * ### Why depends on BOTH database AND client?
 * - `security_group_id` comes from database state (needs database deployed first)
 * - `runnable-peers()` returns client's node SGs (needs client deployed first)
 * - If deployed before client: returns empty list → no access rules → connection fails
 * 
 * ### Note on Neptune Access
 * Neptune clusters are always private (no public endpoint). Access is only possible:
 * - From within the same VPC
 * - Via VPN or Direct Connect
 * - Via VPC peering
 * 
 * ---
 */
export class NeptuneAccessList extends MonkEntity<NeptuneAccessListDefinition, NeptuneAccessListState> {
    
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
        // No-op
    }

    override stop(): void {
        // No-op
    }

    override update(): void {        
        this.updateSecurityGroupRules();
    }

    override delete(): void {
        try {
            // Remove all rules we manage from the security group
            const currentAwsRules = getCurrentSecurityGroupRules(
                this.definition.region, 
                this.definition.security_group_id, 
                this.definition.port
            );
            
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
