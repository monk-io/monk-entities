import { AzurePostgreSQLEntity, AzurePostgreSQLDefinition, AzurePostgreSQLState } from "./azure-postgresql-base.ts";
import cli from "cli";

/**
 * Definition interface for Azure PostgreSQL Access List.
 * Configures firewall rules for a Flexible Server based on client IPs.
 * @interface AccessListDefinition
 */
export interface AccessListDefinition extends AzurePostgreSQLDefinition {
    /**
     * @description Name of the parent PostgreSQL Flexible Server
     */
    server_name: string;

    /**
     * @description List of CIDR blocks to allow access from (e.g., from runnable-peers-public-ips)
     * Each IP will create a firewall rule allowing access
     */
    allowed_cidr_blocks?: string[];

    /**
     * @description Prefix for firewall rule names (default: "monk-access")
     * Rules will be named: {prefix}-{index}
     * @default "monk-access"
     */
    rule_name_prefix?: string;
}

/**
 * State interface for Azure PostgreSQL Access List.
 * Contains runtime information about the created firewall rules.
 * @interface AccessListState
 */
export interface AccessListState extends AzurePostgreSQLState {
    /**
     * @description Parent server name
     */
    server_name?: string;

    /**
     * @description List of created firewall rule names
     */
    created_rules?: string[];

    /**
     * @description List of allowed CIDR blocks
     */
    allowed_cidr_blocks?: string[];
}

/**
 * @description Azure PostgreSQL Access List entity.
 * Manages firewall rules for Azure Database for PostgreSQL Flexible Servers.
 * Creates firewall rules dynamically based on client IPs from runnable-peers-public-ips.
 * 
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.server_name` - Parent server name
 * - `state.created_rules` - List of created firewall rule names
 * - `state.allowed_cidr_blocks` - List of allowed CIDR blocks
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `azure-postgresql/flexible-server` - Parent server to configure firewall for (must have `network.public_network_access: Enabled`)
 * 
 * ---
 * ## Dynamic Access Control for Public Access Pattern
 * 
 * **This entity is REQUIRED** for proper PostgreSQL access control with public access.
 * DO NOT hardcode IP addresses - use `runnable-peers-public-ips()` for dynamic access.
 * 
 * Use this entity to open database access AFTER client is deployed.
 * 
 * ### Usage with runnable-peers-public-ips (Cross-cloud access)
 * Use when client runs on other cloud providers, different regions, or on-prem.
 * Requires server with public network access enabled.
 * ```yaml
 * # Server with public access enabled
 * postgres-server:
 *   defines: azure-postgresql/flexible-server
 *   network:
 *     public_network_access: Enabled  # Required for public access
 *   # ... other config
 * 
 * # Access list creates firewall rules for client IPs
 * access-list:
 *   defines: azure-postgresql/access-list
 *   subscription_id: <- connection-target("server") entity get-member("subscription_id")
 *   resource_group_name: <- connection-target("server") entity get-member("resource_group_name")
 *   server_name: <- connection-target("server") entity-state get-member("server_name")
 *   allowed_cidr_blocks: <- runnable-peers-public-ips("ns/client")
 *   connections:
 *     server:
 *       runnable: ns/postgres-server
 *       service: data
 *   depends:
 *     wait-for:
 *       runnables: [ns/postgres-server, ns/client]  # MUST wait for both
 *       timeout: 1800
 * ```
 * 
 * ### Deployment Order (CRITICAL)
 * 1. **PostgreSQL Server** → creates DB with public endpoint
 * 2. **Client** → deploys to nodes (gets public IPs)
 * 3. **Access List** → reads client's node IPs, creates firewall rules
 * 
 * ### Why depends on BOTH server AND client?
 * - `server_name` comes from server state (needs server deployed first)
 * - `runnable-peers-public-ips()` returns client's node IPs (needs client deployed first)
 * - If deployed before client: returns empty list → no firewall rules → connection fails
 * 
 * ### When to use this entity:
 * | Client Location | Server Config | Use access-list? |
 * |-----------------|---------------|------------------|
 * | Azure (same VNet) | `vnet_integration` | NO - use private access |
 * | Other cloud/region | `network.public_network_access: Enabled` | YES |
 * 
 * ---
 */
export class AccessList extends AzurePostgreSQLEntity<AccessListDefinition, AccessListState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 20 };

    protected getEntityName(): string {
        return `${this.definition.server_name}/access-list`;
    }

    protected getResourceType(): string {
        return `flexibleServers/${this.definition.server_name}/firewallRules`;
    }

    /**
     * Build the resource path for firewall rule operations
     */
    private buildFirewallRulePath(ruleName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${this.definition.server_name}/firewallRules/${ruleName}?api-version=${this.apiVersion}`;
    }

    /** Create firewall rules for all allowed CIDR blocks */
    override create(): void {
        const allowedCidrs = this.definition.allowed_cidr_blocks || [];
        const prefix = this.definition.rule_name_prefix || "monk-access";

        if (allowedCidrs.length === 0) {
            cli.output(`⚠️  No CIDR blocks provided for access list on server ${this.definition.server_name}`);
            this.state = {
                server_name: this.definition.server_name,
                created_rules: [],
                allowed_cidr_blocks: [],
                existing: false
            };
            return;
        }

        cli.output(`🔥 Creating ${allowedCidrs.length} firewall rule(s) for server ${this.definition.server_name}`);

        const createdRules: string[] = [];

        for (let i = 0; i < allowedCidrs.length; i++) {
            const cidr = allowedCidrs[i];
            const ruleName = `${prefix}-${i}`;
            
            // Parse CIDR to get IP (Azure firewall rules use start/end IP, not CIDR)
            const ip = this.cidrToIp(cidr);
            
            try {
                this.createFirewallRule(ruleName, ip, ip);
                createdRules.push(ruleName);
                cli.output(`   ✅ Created rule ${ruleName}: ${ip}`);
            } catch (error) {
                cli.output(`   ⚠️  Failed to create rule ${ruleName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        this.state = {
            server_name: this.definition.server_name,
            created_rules: createdRules,
            allowed_cidr_blocks: [...allowedCidrs],
            existing: false
        };

        cli.output(`✅ Created ${createdRules.length} firewall rule(s) for server ${this.definition.server_name}`);
    }

    override update(): void {
        // Get current and desired state
        const currentRules = this.state.created_rules || [];
        const currentCidrs = this.state.allowed_cidr_blocks || [];
        const desiredCidrs = this.definition.allowed_cidr_blocks || [];
        const prefix = this.definition.rule_name_prefix || "monk-access";

        // If no changes, skip
        if (this.arraysEqual(currentCidrs, [...desiredCidrs])) {
            cli.output(`ℹ️  No changes to firewall rules for server ${this.definition.server_name}`);
            return;
        }

        cli.output(`🔄 Updating firewall rules for server ${this.definition.server_name}`);

        // Delete old rules
        for (const ruleName of currentRules) {
            try {
                this.deleteFirewallRule(ruleName);
                cli.output(`   🗑️  Deleted old rule ${ruleName}`);
            } catch (error) {
                cli.output(`   ⚠️  Failed to delete rule ${ruleName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        // Create new rules
        const createdRules: string[] = [];
        for (let i = 0; i < desiredCidrs.length; i++) {
            const cidr = desiredCidrs[i];
            const ruleName = `${prefix}-${i}`;
            const ip = this.cidrToIp(cidr);
            
            try {
                this.createFirewallRule(ruleName, ip, ip);
                createdRules.push(ruleName);
                cli.output(`   ✅ Created rule ${ruleName}: ${ip}`);
            } catch (error) {
                cli.output(`   ⚠️  Failed to create rule ${ruleName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        this.state.created_rules = createdRules;
        this.state.allowed_cidr_blocks = [...desiredCidrs];

        cli.output(`✅ Updated firewall rules: ${createdRules.length} rule(s) active`);
    }

    override delete(): void {
        const rules = this.state.created_rules || [];

        if (rules.length === 0) {
            cli.output(`ℹ️  No firewall rules to delete for server ${this.definition.server_name}`);
            return;
        }

        cli.output(`🗑️  Deleting ${rules.length} firewall rule(s) for server ${this.definition.server_name}`);

        for (const ruleName of rules) {
            try {
                this.deleteFirewallRule(ruleName);
                cli.output(`   ✅ Deleted rule ${ruleName}`);
            } catch (error) {
                cli.output(`   ⚠️  Failed to delete rule ${ruleName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        cli.output(`✅ Deleted firewall rules for server ${this.definition.server_name}`);
    }

    override checkReadiness(): boolean {
        const rules = this.state.created_rules || [];
        
        if (rules.length === 0) {
            // No rules to check - consider ready if no CIDRs were provided
            return (this.definition.allowed_cidr_blocks || []).length === 0;
        }

        // Check if all rules exist
        for (const ruleName of rules) {
            try {
                const path = this.buildFirewallRulePath(ruleName);
                const response = this.makeAzureRequest("GET", path);
                
                if (response.statusCode === 404) {
                    cli.output(`⏳ Firewall rule ${ruleName} not found yet`);
                    return false;
                }
            } catch (error) {
                cli.output(`⚠️  Failed to check rule ${ruleName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return false;
            }
        }

        cli.output(`✅ All ${rules.length} firewall rule(s) are ready`);
        return true;
    }

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * Create a firewall rule
     */
    private createFirewallRule(ruleName: string, startIp: string, endIp: string): void {
        const body = {
            properties: {
                startIpAddress: startIp,
                endIpAddress: endIp
            }
        };

        const path = this.buildFirewallRulePath(ruleName);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error && response.statusCode !== 200 && response.statusCode !== 201 && response.statusCode !== 202) {
            throw new Error(`${response.error}, body: ${response.body}`);
        }
    }

    /**
     * Delete a firewall rule
     */
    private deleteFirewallRule(ruleName: string): void {
        const path = this.buildFirewallRulePath(ruleName);
        const response = this.makeAzureRequest("DELETE", path);

        if (response.error && response.statusCode !== 200 && response.statusCode !== 202 && response.statusCode !== 204 && response.statusCode !== 404) {
            throw new Error(`${response.error}, body: ${response.body}`);
        }
    }

    /**
     * Convert CIDR notation to IP address
     * runnable-peers-public-ips returns IPs in CIDR format (e.g., "1.2.3.4/32")
     */
    private cidrToIp(cidr: string): string {
        // Remove the /XX suffix if present
        const parts = cidr.split('/');
        return parts[0];
    }

    /**
     * Compare two arrays for equality
     */
    private arraysEqual(a: string[], b: string[]): boolean {
        if (a.length !== b.length) return false;
        const sortedA = [...a].sort();
        const sortedB = [...b].sort();
        return sortedA.every((val, idx) => val === sortedB[idx]);
    }
}
