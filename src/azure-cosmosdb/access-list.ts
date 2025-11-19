import { AzureCosmosDBEntity, AzureCosmosDBDefinition, AzureCosmosDBState } from "./azure-cosmosdb-base.ts";
import cli from "cli";

/**
 * Virtual Network rule configuration
 */
export interface VirtualNetworkRule {
    /**
     * @description Full resource ID of the subnet
     * Format: /subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.Network/virtualNetworks/{vnet-name}/subnets/{subnet-name}
     */
    subnet_id: string;

    /**
     * @description Ignore missing VNet service endpoint
     * @default false
     */
    ignore_missing_vnet_service_endpoint?: boolean;
}

/**
 * IP firewall rule configuration
 */
export interface IPRule {
    /**
     * @description IP address or CIDR range to allow
     * Examples: "203.0.113.5", "198.51.100.0/24", "0.0.0.0/0"
     */
    ip_address_or_range: string;
}

/**
 * Azure Cosmos DB Access List entity for managing network access control.
 * This entity configures both Virtual Network service endpoints and IP firewall rules
 * to restrict access to a Cosmos DB account from specific networks and IP addresses.
 */
export interface AccessListDefinition extends AzureCosmosDBDefinition {
    /**
     * @description Cosmos DB database account name to configure access for
     */
    account_name: string;

    /**
     * @description Array of virtual network rules to configure
     */
    virtual_network_rules?: VirtualNetworkRule[];

    /**
     * @description Array of IP firewall rules to configure (IP addresses or CIDR ranges)
     */
    ip_rules?: IPRule[];

    /**
     * @description Enable virtual network filtering on the account
     * @default true
     */
    enable_virtual_network_filter?: boolean;
}

/**
 * Represents the runtime state of an Access List entity
 */
export interface AccessListState extends AzureCosmosDBState {
    /**
     * @description Account name being managed
     */
    account_name?: string;

    /**
     * @description Number of virtual network rules configured
     */
    vnet_rules_count?: number;

    /**
     * @description List of subnet IDs currently configured
     */
    configured_subnet_ids?: string[];

    /**
     * @description Number of IP firewall rules configured
     */
    ip_rules_count?: number;

    /**
     * @description List of IP addresses/ranges currently configured
     */
    configured_ip_ranges?: string[];
}

export class AccessList extends AzureCosmosDBEntity<AccessListDefinition, AccessListState> {

    static readonly readiness = { period: 5, initialDelay: 2, attempts: 30 };

    protected getEntityName(): string {
        return this.definition.account_name;
    }

    protected getResourceType(): string {
        return "databaseAccounts";
    }

    /**
     * Extract array from indexed fields (e.g., field!0, field!1, etc.)
     */
    private extractArrayFromIndexedFields(fieldName: string): unknown[] {
        const result: unknown[] = [];
        let index = 0;
        
        while ((this.definition as any)[`${fieldName}!${index}`] !== undefined) {
            result.push((this.definition as any)[`${fieldName}!${index}`]);
            index++;
        }
        
        return result;
    }

    override create(): void {
        cli.output(`🔒 Configuring Virtual Network access for Cosmos DB account: ${this.definition.account_name}`);

        // Validate account exists
        const accountPath = this.buildResourcePath(this.definition.account_name);
        const accountResponse = this.makeAzureRequest("GET", accountPath);

        if (accountResponse.error) {
            throw new Error(`Cosmos DB account ${this.definition.account_name} not found: ${accountResponse.error}`);
        }

        const accountData = this.parseResponseBody(accountResponse) as Record<string, unknown> | null;
        if (!accountData) {
            throw new Error(`Failed to retrieve Cosmos DB account ${this.definition.account_name}`);
        }

        // Configure network access (VNet + IP firewall)
        this.configureNetworkAccess();

        // Set state
        const vnetRules = this.extractArrayFromIndexedFields('virtual_network_rules') as VirtualNetworkRule[];
        const ipRules = this.extractArrayFromIndexedFields('ip_rules') as IPRule[];
        this.state = {
            account_name: this.definition.account_name,
            vnet_rules_count: vnetRules.length,
            configured_subnet_ids: vnetRules.map(rule => rule.subnet_id),
            ip_rules_count: ipRules.length,
            configured_ip_ranges: ipRules.map(rule => rule.ip_address_or_range)
        };

        cli.output(`✅ Network access configured for ${this.definition.account_name} (${vnetRules.length} VNet rules, ${ipRules.length} IP rules)`);
    }

    override start(): void {
        // No-op: access list doesn't have a running state
    }

    override stop(): void {
        // No-op: access list doesn't have a running state
    }

    override update(): void {
        cli.output(`🔄 Updating network access for Cosmos DB account: ${this.definition.account_name}`);
        this.configureNetworkAccess();

        // Update state
        const vnetRules = this.extractArrayFromIndexedFields('virtual_network_rules') as VirtualNetworkRule[];
        const ipRules = this.extractArrayFromIndexedFields('ip_rules') as IPRule[];
        this.state.vnet_rules_count = vnetRules.length;
        this.state.configured_subnet_ids = vnetRules.map(rule => rule.subnet_id);
        this.state.ip_rules_count = ipRules.length;
        this.state.configured_ip_ranges = ipRules.map(rule => rule.ip_address_or_range);

        cli.output(`✅ Network access updated for ${this.definition.account_name} (${vnetRules.length} VNet rules, ${ipRules.length} IP rules)`);
    }

    override delete(): void {
        cli.output(`🗑️  Removing network access configuration for: ${this.definition.account_name}`);

        try {
            // Remove all virtual network and IP rules
            const accountPath = this.buildResourcePath(this.definition.account_name);
            
            // Get current config to preserve location and offer type
            const getResponse = this.makeAzureRequest("GET", accountPath);
            const accountData = this.parseResponseBody(getResponse) as Record<string, unknown> | null;
            const properties = accountData?.properties as Record<string, unknown> | undefined;
            const location = (accountData?.location as string) || "eastus";
            const databaseAccountOfferType = (properties?.databaseAccountOfferType as string) || "Standard";
            const locations = properties?.locations;
            
            const body = {
                location: location,
                properties: {
                    databaseAccountOfferType: databaseAccountOfferType,
                    locations: locations,
                    isVirtualNetworkFilterEnabled: false,
                    virtualNetworkRules: [],
                    ipRules: []
                }
            };

            const response = this.makeAzureRequest("PATCH", accountPath, body);

            if (response.error) {
                cli.output(`⚠️  Warning: Failed to remove network rules: ${response.error}`);
            } else {
                cli.output(`✅ Network access configuration removed`);
            }
        } catch (error) {
            cli.output(`⚠️  Warning: Failed to clean up network rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Configure network access by enabling service endpoints and updating account rules (VNet + IP firewall)
     */
    private configureNetworkAccess(): void {
        // Extract arrays from indexed fields
        const vnetRules = this.extractArrayFromIndexedFields('virtual_network_rules') as VirtualNetworkRule[];
        const ipRules = this.extractArrayFromIndexedFields('ip_rules') as IPRule[];

        if (vnetRules.length === 0 && ipRules.length === 0) {
            cli.output(`⚠️  No network rules specified (neither VNet nor IP rules)`);
            return;
        }

        // Step 1: Enable service endpoints on subnets (if VNet rules specified)
        if (vnetRules.length > 0) {
            cli.output(`🔧 Enabling service endpoints on ${vnetRules.length} subnet(s)...`);
            for (const rule of vnetRules) {
                this.enableServiceEndpointOnSubnet(rule.subnet_id);
            }
        }

        // Step 2: Update Cosmos DB account with network rules (VNet + IP)
        cli.output(`🔧 Configuring network access rules...`);
        this.updateCosmosDBNetworkRules(vnetRules, ipRules);
    }

    /**
     * Enable Microsoft.AzureCosmosDB service endpoint on a subnet
     */
    private enableServiceEndpointOnSubnet(subnetId: string): void {
        try {
            cli.output(`  📍 Enabling service endpoint for subnet: ${this.extractSubnetName(subnetId)}`);

            // Get current subnet configuration - Network API uses different api-version
            const networkApiVersion = "2023-11-01";
            const subnetUrl = `${subnetId}?api-version=${networkApiVersion}`;
            const getResponse = this.makeAzureRequest("GET", subnetUrl);
            if (getResponse.error) {
                throw new Error(`Failed to get subnet: ${getResponse.error}`);
            }

            const subnetData = this.parseResponseBody(getResponse) as Record<string, unknown> | null;
            if (!subnetData || !subnetData.properties) {
                throw new Error(`Invalid subnet data received`);
            }

            const properties = subnetData.properties as Record<string, unknown>;
            const currentEndpoints = (properties.serviceEndpoints as unknown[] | undefined) || [];
            
            // Check if Microsoft.AzureCosmosDB endpoint already exists
            const hasCosmosEndpoint = currentEndpoints.some((endpoint: unknown) => {
                if (endpoint && typeof endpoint === 'object') {
                    const ep = endpoint as Record<string, unknown>;
                    return ep.service === 'Microsoft.AzureCosmosDB';
                }
                return false;
            });

            if (hasCosmosEndpoint) {
                cli.output(`    ✅ Service endpoint already enabled`);
                return;
            }

            // Add Microsoft.AzureCosmosDB service endpoint
            const updatedEndpoints = [
                ...currentEndpoints,
                { service: 'Microsoft.AzureCosmosDB' }
            ];

            const updateBody = {
                properties: {
                    ...properties,
                    serviceEndpoints: updatedEndpoints
                }
            };

            const subnetUrlWithVersion = `${subnetId}?api-version=${networkApiVersion}`;
            const updateResponse = this.makeAzureRequest("PUT", subnetUrlWithVersion, updateBody);
            if (updateResponse.error) {
                throw new Error(`Failed to update subnet: ${updateResponse.error}`);
            }

            cli.output(`    ✅ Service endpoint enabled successfully`);

        } catch (error) {
            cli.output(`    ⚠️  Warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Don't fail the entire operation if one subnet fails
        }
    }

    /**
     * Update Cosmos DB account with network rules (VNet + IP firewall)
     */
    private updateCosmosDBNetworkRules(vnetRules: readonly VirtualNetworkRule[], ipRules: readonly IPRule[]): void {
        const accountPath = this.buildResourcePath(this.definition.account_name);

        // Get current account configuration
        const getResponse = this.makeAzureRequest("GET", accountPath);
        if (getResponse.error) {
            throw new Error(`Failed to get account: ${getResponse.error}`);
        }

        const accountData = this.parseResponseBody(getResponse) as Record<string, unknown> | null;
        if (!accountData || !accountData.properties) {
            throw new Error(`Invalid account data received`);
        }

        const properties = accountData.properties as Record<string, unknown>;
        const location = (accountData.location as string) || this.getLocationFromAccountData(accountData);

        // Build virtual network rules for the API
        const virtualNetworkRules = vnetRules.map(rule => ({
            id: rule.subnet_id,
            ignoreMissingVNetServiceEndpoint: rule.ignore_missing_vnet_service_endpoint || false
        }));

        // Build IP firewall rules for the API
        const ipFirewallRules = ipRules.map(rule => ({
            ipAddressOrRange: rule.ip_address_or_range
        }));

        // Get current rules to preserve existing ones if any
        const currentVnetRules = (properties.virtualNetworkRules as unknown[] | undefined) || [];
        const currentIpRules = (properties.ipRules as unknown[] | undefined) || [];
        
        // Merge new VNet rules with existing ones (avoid duplicates by subnet_id)
        const existingSubnetIds = new Set(
            currentVnetRules.map((rule: any) => rule.id).filter((id: any) => typeof id === 'string')
        );
        const newVnetRules = virtualNetworkRules.filter(rule => !existingSubnetIds.has(rule.id));
        const allVnetRules = [...currentVnetRules, ...newVnetRules];

        // Merge new IP rules with existing ones (avoid duplicates by IP/range)
        const existingIpRanges = new Set(
            currentIpRules.map((rule: any) => rule.ipAddressOrRange).filter((ip: any) => typeof ip === 'string')
        );
        const newIpRules = ipFirewallRules.filter(rule => !existingIpRanges.has(rule.ipAddressOrRange));
        const allIpRules = [...currentIpRules, ...newIpRules];

        // Get required properties from current account
        const databaseAccountOfferType = (properties.databaseAccountOfferType as string) || "Standard";
        const locations = properties.locations as unknown[] | undefined;

        // Update account with network rules - include required properties
        const updateBody = {
            location: location,
            properties: {
                databaseAccountOfferType: databaseAccountOfferType,
                locations: locations,
                isVirtualNetworkFilterEnabled: this.definition.enable_virtual_network_filter !== false,
                virtualNetworkRules: allVnetRules,
                ipRules: allIpRules
            }
        };

        const updateResponse = this.makeAzureRequest("PATCH", accountPath, updateBody);
        if (updateResponse.error) {
            throw new Error(`Failed to update Cosmos DB account: ${updateResponse.error}`);
        }

        cli.output(`✅ Added ${vnetRules.length} VNet rule(s) and ${ipRules.length} IP rule(s) to Cosmos DB account`);
    }

    /**
     * Extract location from account data
     */
    private getLocationFromAccountData(accountData: Record<string, unknown>): string {
        // Try to get location from locations array
        const locations = accountData.properties as Record<string, unknown> | undefined;
        if (locations && Array.isArray(locations.locations) && locations.locations.length > 0) {
            const firstLocation = locations.locations[0] as Record<string, unknown>;
            if (firstLocation.locationName && typeof firstLocation.locationName === 'string') {
                return firstLocation.locationName;
            }
        }
        // Fallback to default
        return "eastus";
    }

    /**
     * Extract subnet name from subnet ID for logging
     */
    private extractSubnetName(subnetId: string): string {
        const parts = subnetId.split('/');
        return parts[parts.length - 1] || subnetId;
    }
}

