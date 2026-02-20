import { AzurePostgreSQLEntity, AzurePostgreSQLDefinition, AzurePostgreSQLState } from "./azure-postgresql-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for Azure PostgreSQL Firewall Rule.
 * Configures firewall rules for a Flexible Server.
 * @interface FirewallRuleDefinition
 */
export interface FirewallRuleDefinition extends AzurePostgreSQLDefinition {
    /**
     * @description Name of the parent PostgreSQL Flexible Server
     */
    server_name: string;

    /**
     * @description Firewall rule name
     */
    rule_name: string;

    /**
     * @description Start IP address of the firewall rule range
     */
    start_ip_address: string;

    /**
     * @description End IP address of the firewall rule range
     */
    end_ip_address: string;
}

/**
 * State interface for Azure PostgreSQL Firewall Rule.
 * Contains runtime information about the created firewall rule.
 * @interface FirewallRuleState
 */
export interface FirewallRuleState extends AzurePostgreSQLState {
    /**
     * @description Firewall rule name (primary identifier)
     */
    rule_name?: string;

    /**
     * @description Parent server name
     */
    server_name?: string;

    /**
     * @description Start IP address
     */
    start_ip_address?: string;

    /**
     * @description End IP address
     */
    end_ip_address?: string;
}

/**
 * @description Azure PostgreSQL Firewall Rule entity.
 * Creates and manages firewall rules for Azure Database for PostgreSQL Flexible Servers.
 * Use this to allow access from specific IP addresses or ranges.
 * 
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.rule_name` - Firewall rule name
 * - `state.server_name` - Parent server name
 * - `state.start_ip_address` - Start of allowed IP range
 * - `state.end_ip_address` - End of allowed IP range
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `azure-postgresql/flexible-server` - Parent server to configure firewall for
 */
export class FirewallRule extends AzurePostgreSQLEntity<FirewallRuleDefinition, FirewallRuleState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 20 };

    protected getEntityName(): string {
        return `${this.definition.server_name}/${this.definition.rule_name}`;
    }

    protected getResourceType(): string {
        return `flexibleServers/${this.definition.server_name}/firewallRules`;
    }

    /**
     * Build the resource path for firewall rule operations
     */
    protected override buildResourcePath(resourceName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${this.definition.server_name}/firewallRules/${resourceName}?api-version=${this.apiVersion}`;
    }

    /** Create a new firewall rule */
    override create(): void {
        // Check if rule already exists
        const existingRule = this.checkResourceExists(this.definition.rule_name);

        if (existingRule) {
            // Rule already exists, use it
            const properties = existingRule.properties as Record<string, unknown> | undefined;
            
            this.state = {
                rule_name: typeof existingRule.name === 'string' ? existingRule.name : this.definition.rule_name,
                server_name: this.definition.server_name,
                start_ip_address: typeof properties?.startIpAddress === 'string' ? properties.startIpAddress : undefined,
                end_ip_address: typeof properties?.endIpAddress === 'string' ? properties.endIpAddress : undefined,
                existing: true
            };
            cli.output(`✅ Firewall rule ${this.definition.rule_name} already exists on server ${this.definition.server_name}`);
            return;
        }

        // Skip creation if create_when_missing is false and resource doesn't exist
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Firewall rule ${this.definition.rule_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body for firewall rule creation
        const body = {
            properties: {
                startIpAddress: this.definition.start_ip_address,
                endIpAddress: this.definition.end_ip_address
            }
        };

        // Create the firewall rule
        const path = this.buildResourcePath(this.definition.rule_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create firewall rule: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Set state from created rule
        const properties = responseData?.properties as Record<string, unknown> | undefined;
        this.state = {
            rule_name: this.definition.rule_name,
            server_name: this.definition.server_name,
            start_ip_address: typeof properties?.startIpAddress === 'string' ? properties.startIpAddress : this.definition.start_ip_address,
            end_ip_address: typeof properties?.endIpAddress === 'string' ? properties.endIpAddress : this.definition.end_ip_address,
            existing: false
        };

        cli.output(`✅ Created firewall rule: ${this.definition.rule_name} (${this.definition.start_ip_address} - ${this.definition.end_ip_address})`);
    }

    override update(): void {
        if (!this.state.rule_name) {
            this.create();
            return;
        }

        // Update the firewall rule (IP range can be changed)
        const body = {
            properties: {
                startIpAddress: this.definition.start_ip_address,
                endIpAddress: this.definition.end_ip_address
            }
        };

        const path = this.buildResourcePath(this.definition.rule_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to update firewall rule: ${response.error}, body: ${response.body}`);
        }

        // Update state
        this.state.start_ip_address = this.definition.start_ip_address;
        this.state.end_ip_address = this.definition.end_ip_address;

        cli.output(`✅ Updated firewall rule: ${this.definition.rule_name} (${this.definition.start_ip_address} - ${this.definition.end_ip_address})`);
    }

    override delete(): void {
        if (!this.state.rule_name) {
            cli.output("Firewall rule does not exist, nothing to delete");
            return;
        }

        if (this.state.existing) {
            cli.output(`Firewall rule ${this.definition.rule_name} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            const path = this.buildResourcePath(this.definition.rule_name);
            const response = this.makeAzureRequest("DELETE", path);
            
            if (response.error) {
                if (response.statusCode === 404) {
                    cli.output(`⚠️  Firewall rule ${this.definition.rule_name} not found, may have been already deleted`);
                    return;
                }
                throw new Error(`${response.error}, body: ${response.body}`);
            }
            
            cli.output(`✅ Successfully deleted firewall rule ${this.definition.rule_name}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Failed to delete firewall rule: ${errorMessage}`);
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.rule_name) {
            return false;
        }

        // If create_when_missing is false and resource doesn't exist, consider it ready
        if (this.definition.create_when_missing === false && !this.state.existing) {
            return true;
        }

        try {
            // Check if rule exists
            const rule = this.checkResourceExists(this.definition.rule_name);
            
            if (!rule) {
                cli.output(`⏳ Firewall rule ${this.definition.rule_name} not found`);
                return false;
            }

            // Rule exists, it's ready
            cli.output(`✅ Firewall rule ${this.definition.rule_name} is ready`);
            
            // Update state with current information
            const properties = rule.properties as Record<string, unknown> | undefined;
            this.state.start_ip_address = typeof properties?.startIpAddress === 'string' ? properties.startIpAddress : undefined;
            this.state.end_ip_address = typeof properties?.endIpAddress === 'string' ? properties.endIpAddress : undefined;
            
            return true;
        } catch (error) {
            cli.output(`⚠️  Failed to check firewall rule readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    // ========================================
    // Custom Actions
    // ========================================

    /**
     * Get firewall rule information
     * 
     * Usage:
     *   monk do namespace/firewall-rule get-info
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🔥 PostgreSQL Firewall Rule Information`);
        cli.output(`==================================================`);

        if (!this.state.rule_name) {
            throw new Error("Firewall rule does not exist. Create the rule first.");
        }

        try {
            const rule = this.checkResourceExists(this.definition.rule_name);
            
            if (!rule) {
                throw new Error(`Firewall rule ${this.definition.rule_name} not found`);
            }

            const properties = rule.properties as Record<string, unknown> | undefined;

            cli.output(`\n📋 Firewall Rule Details:`);
            cli.output(`   Rule Name: ${rule.name}`);
            cli.output(`   Server Name: ${this.definition.server_name}`);
            cli.output(`   Start IP Address: ${properties?.startIpAddress || 'N/A'}`);
            cli.output(`   End IP Address: ${properties?.endIpAddress || 'N/A'}`);
            cli.output(`   Resource ID: ${rule.id || 'N/A'}`);

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get firewall rule info`);
            throw new Error(`Get info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
