import { AzurePostgreSQLEntity, AzurePostgreSQLDefinition, AzurePostgreSQLState } from "./azure-postgresql-base.ts";
import cli from "cli";
import secret from "secret";
import http from "http";
import { action, Args } from "monkec/base";

/**
 * SKU configuration for PostgreSQL Flexible Server
 */
export interface SkuConfig {
    /**
     * @description The name of the SKU (e.g., Standard_B1ms, Standard_D2s_v3)
     */
    name: string;

    /**
     * @description The tier of the SKU
     * @default "GeneralPurpose"
     */
    tier?: "Burstable" | "GeneralPurpose" | "MemoryOptimized";
}

/**
 * Storage configuration for PostgreSQL Flexible Server
 */
export interface StorageConfig {
    /**
     * @description Storage size in GB
     * @minimum 32
     * @maximum 16384
     * @default 32
     */
    storage_size_gb?: number;

    /**
     * @description Storage auto grow enabled
     * @default "Disabled"
     */
    auto_grow?: "Enabled" | "Disabled";

    /**
     * @description Storage tier (P4, P6, P10, P15, P20, P30, P40, P50, P60, P70, P80)
     */
    storage_tier?: string;
}

/**
 * Backup configuration for PostgreSQL Flexible Server
 */
export interface BackupConfig {
    /**
     * @description Backup retention days (7-35)
     * @minimum 7
     * @maximum 35
     * @default 7
     */
    backup_retention_days?: number;

    /**
     * @description Geo-redundant backup
     * @default "Disabled"
     */
    geo_redundant_backup?: "Enabled" | "Disabled";
}

/**
 * High availability configuration for PostgreSQL Flexible Server
 */
export interface HighAvailabilityConfig {
    /**
     * @description High availability mode
     * @default "Disabled"
     */
    mode?: "Disabled" | "ZoneRedundant" | "SameZone";

    /**
     * @description Standby availability zone
     */
    standby_availability_zone?: string;
}

/**
 * Network configuration for PostgreSQL Flexible Server
 */
export interface NetworkConfig {
    /**
     * @description Delegated subnet resource ID for private access
     */
    delegated_subnet_resource_id?: string;

    /**
     * @description Private DNS zone resource ID
     */
    private_dns_zone_resource_id?: string;

    /**
     * @description Public network access
     * @default "Enabled"
     */
    public_network_access?: "Enabled" | "Disabled";
}

/**
 * VNet integration configuration for automatic private network setup.
 * When provided, the entity will automatically create:
 * - A delegated subnet for PostgreSQL
 * - A private DNS zone
 * - A DNS zone VNet link
 */
export interface VNetIntegrationConfig {
    /**
     * @description Name of the existing Virtual Network to integrate with
     */
    vnet_name: string;

    /**
     * @description Resource group containing the VNet (defaults to server's resource group)
     */
    vnet_resource_group?: string;

    /**
     * @description Name for the delegated subnet to create (defaults to "postgres-subnet")
     */
    subnet_name?: string;

    /**
     * @description Address prefix for the delegated subnet (e.g., "172.17.0.0/24")
     * Must be within the VNet's address space
     */
    subnet_address_prefix: string;

    /**
     * @description Name for the private DNS zone link (defaults to "postgres-dns-link")
     */
    dns_link_name?: string;
}

/**
 * Authentication configuration for PostgreSQL Flexible Server
 */
export interface AuthConfig {
    /**
     * @description Enable Active Directory authentication
     * @default false
     */
    active_directory_auth_enabled?: boolean;

    /**
     * @description Enable password authentication
     * @default true
     */
    password_auth_enabled?: boolean;

    /**
     * @description Tenant ID for Active Directory authentication
     */
    tenant_id?: string;
}

/**
 * Definition interface for Azure PostgreSQL Flexible Server.
 * Configures the server properties including compute, storage, and networking.
 * @interface FlexibleServerDefinition
 */
export interface FlexibleServerDefinition extends AzurePostgreSQLDefinition {
    /**
     * @description PostgreSQL Flexible Server name (3-63 chars, lowercase, alphanumeric and hyphens)
     */
    server_name: string;

    /**
     * @description Azure region for the server
     */
    location: string;

    /**
     * @description PostgreSQL version
     * @default "16"
     */
    version?: "11" | "12" | "13" | "14" | "15" | "16";

    /**
     * @description SKU configuration (compute tier and size)
     */
    sku?: SkuConfig;

    /**
     * @description Storage configuration
     */
    storage?: StorageConfig;

    /**
     * @description Backup configuration
     */
    backup?: BackupConfig;

    /**
     * @description High availability configuration
     */
    high_availability?: HighAvailabilityConfig;

    /**
     * @description Network configuration (manual - use either this OR vnet_integration)
     */
    network?: NetworkConfig;

    /**
     * @description VNet integration configuration for automatic private network setup.
     * When provided, automatically creates delegated subnet, private DNS zone, and DNS link.
     * Use this for simple VNet integration - just provide VNet name and subnet address prefix.
     * Cannot be used together with network.delegated_subnet_resource_id.
     */
    vnet_integration?: VNetIntegrationConfig;

    /**
     * @description Authentication configuration
     */
    auth_config?: AuthConfig;

    /**
     * @description Administrator login name
     * @default "postgres"
     */
    administrator_login?: string;

    /**
     * @description Secret reference for administrator password.
     * If the secret exists, the password will be read from it.
     * If the secret doesn't exist, a secure password will be auto-generated and saved to this secret.
     */
    administrator_password_secret_ref: string;

    /**
     * @description Availability zone for the server
     */
    availability_zone?: string;

    /**
     * @description Resource tags
     */
    tags?: Record<string, string>;

    /**
     * @description Secret reference to store the connection string
     * If provided, the connection string will be saved to this secret
     */
    connection_string_secret_ref?: string;
}

/**
 * State interface for Azure PostgreSQL Flexible Server.
 * Contains runtime information about the created server.
 * @interface FlexibleServerState
 */
export interface FlexibleServerState extends AzurePostgreSQLState {
    /**
     * @description Server name (primary identifier)
     */
    server_name?: string;

    /**
     * @description Fully qualified domain name for the server
     */
    fqdn?: string;

    /**
     * @description Server state (Ready, Stopped, etc.)
     */
    server_state?: string;

    /**
     * @description PostgreSQL version
     */
    version?: string;

    /**
     * @description Administrator login name
     */
    administrator_login?: string;

    /**
     * @description Whether connection string secret has been populated
     */
    connection_string_populated?: boolean;

    /**
     * @description Resource ID of the created delegated subnet (for cleanup)
     */
    created_subnet_id?: string;

    /**
     * @description Resource ID of the created private DNS zone (for cleanup)
     */
    created_dns_zone_id?: string;

    /**
     * @description Resource ID of the created DNS zone VNet link (for cleanup)
     */
    created_dns_link_id?: string;

    /**
     * @description Counter for consecutive "NotFound" responses during readiness check
     * Used to detect async creation failures
     */
    not_found_count?: number;
}

/**
 * @description Azure PostgreSQL Flexible Server entity.
 * Creates and manages Azure Database for PostgreSQL Flexible Servers with configurable compute, storage, and networking.
 * Supports high availability, backup policies, and both public and private network access.
 * 
 * ## Secrets
 * - Reads: secret name from `administrator_password_secret_ref` property - Administrator password
 * - Writes: 
 *   - Administrator password to `administrator_password_secret_ref` (auto-generated if secret doesn't exist)
 *   - Connection string to `connection_string_secret_ref` (if specified)
 * 
 * ## State Fields for Composition
 * - `state.server_name` - Server name for database operations
 * - `state.fqdn` - Fully qualified domain name for connections
 * - `state.administrator_login` - Admin username for connections
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `azure-postgresql/database` - Create databases within the server
 * - `azure-postgresql/access-list` - Manage firewall rules dynamically at runtime (for public access)
 * 
 * ---
 * ## Azure PostgreSQL Access Patterns
 * 
 * Choose pattern based on where client runs and security requirements:
 * 
 * ### Pattern 1: VNet Integration (Private Access) - Maximum Security
 * Use when client runs on Azure nodes in the same or peered VNet.
 * Server has no public IP - accessible only from within VNet.
 * 
 * ```yaml
 * postgres-server:
 *   defines: azure-postgresql/flexible-server
 *   subscription_id: "your-subscription-id"
 *   resource_group_name: "your-resource-group"
 *   server_name: "my-pg-server"
 *   location: "West Europe"
 *   
 *   # AUTOMATIC VNet Integration - just provide VNet name and subnet prefix
 *   vnet_integration:
 *     vnet_name: "my-rgwesteurope-vn"      # Format: {resource_group}{region}-vn
 *     subnet_address_prefix: "172.17.0.0/24"  # Must be within VNet's address space
 *   
 *   administrator_login: pgadmin
 *   administrator_password_secret_ref: postgres-admin-password  # Required - auto-generates if secret doesn't exist
 * ```
 * 
 * **Requirements for VNet Integration:**
 * - Client must run on Azure nodes in the same VNet or a peered VNet
 * - VNet naming convention: `{resource_group}{region}-vn` (no spaces in region)
 * 
 * ### Pattern 2: Public Access with IP Firewall (Cross-Cloud)
 * Use when client runs on other cloud providers, different regions, or on-prem.
 * Server has public IP with firewall rules controlling access.
 * 
 * ```yaml
 * postgres-server:
 *   defines: azure-postgresql/flexible-server
 *   subscription_id: "your-subscription-id"
 *   resource_group_name: "your-resource-group"
 *   server_name: "my-pg-server"
 *   location: "West Europe"
 *   
 *   # PUBLIC ACCESS - No VNet integration
 *   network:
 *     public_network_access: Enabled
 *   
 *   administrator_login: pgadmin
 *   administrator_password_secret_ref: postgres-admin-password  # Required - auto-generates if secret doesn't exist
 * 
 * access-list:
 *   defines: azure-postgresql/access-list
 *   server_name: <- connection-target("server") entity-state get-member("server_name")
 *   allowed_cidr_blocks: <- runnable-peers-public-ips("ns/client")  # Dynamic IPs
 *   depends:
 *     wait-for:
 *       runnables: [ns/postgres-server, ns/client]  # MUST wait for both
 * ```
 * 
 * ### Deployment Order (CRITICAL for Public Access)
 * 1. **PostgreSQL Server** → creates DB with public endpoint
 * 2. **Client** → deploys to nodes (gets public IPs)
 * 3. **Access List** → reads client's node IPs, creates firewall rules
 * 
 * access-list MUST depend on both server AND client.
 * If deployed before client: `runnable-peers-public-ips()` returns empty → no firewall rules → connection fails.
 * 
 * ### When to use each pattern:
 * | Client Location | Server Config | Access Method |
 * |-----------------|---------------|---------------|
 * | Azure (same VNet) | `vnet_integration` | Direct private access |
 * | Other cloud/region | `network.public_network_access: Enabled` | `access-list` with `runnable-peers-public-ips` |
 * 
 * ---
 */
export class FlexibleServer extends AzurePostgreSQLEntity<FlexibleServerDefinition, FlexibleServerState> {

    protected getEntityName(): string {
        return this.definition.server_name;
    }

    protected getResourceType(): string {
        return "flexibleServers";
    }

    /** 
     * Get or create password for the PostgreSQL server.
     * If a password exists in the secret, use it.
     * Otherwise, generate a secure random password and save it to the secret.
     * @returns The administrator password
     */
    private getOrCreatePassword(): string {
        const secretRef = this.definition.administrator_password_secret_ref;
        
        try {
            const storedPassword = secret.get(secretRef);
            if (storedPassword) {
                cli.output(`🔑 Using existing password from secret: ${secretRef}`);
                return storedPassword;
            }
        } catch (_e) {
            // Secret doesn't exist, will generate new password
        }
        
        // Generate a secure random password (16 characters)
        // Azure PostgreSQL password requirements:
        // - 8-128 characters
        // - Must contain characters from at least 3 of: uppercase, lowercase, digits, special chars
        const password = secret.randString(16);
        secret.set(secretRef, password);
        cli.output(`🔑 Generated new password and saved to secret: ${secretRef}`);
        return password;
    }

    /** Create a new PostgreSQL Flexible Server */
    override create(): void {
        // Check if server already exists
        const existingServer = this.checkResourceExists(this.definition.server_name);

        if (existingServer) {
            // Server already exists, use it
            const properties = existingServer.properties as Record<string, unknown> | undefined;
            const state = typeof properties?.state === 'string' ? properties.state : undefined;
            
            this.state = {
                server_name: typeof existingServer.name === 'string' ? existingServer.name : this.definition.server_name,
                provisioning_state: state,
                server_state: state,
                fqdn: typeof properties?.fullyQualifiedDomainName === 'string' ? properties.fullyQualifiedDomainName : undefined,
                version: typeof properties?.version === 'string' ? properties.version : undefined,
                administrator_login: typeof properties?.administratorLogin === 'string' ? properties.administratorLogin : undefined,
                existing: true
            };
            cli.output(`✅ PostgreSQL Flexible Server ${this.definition.server_name} already exists`);
            
            // If existing server is ready, populate connection string
            if (state === "Ready") {
                this.populateConnectionString();
            }
            return;
        }

        // Skip creation if create_when_missing is false and resource doesn't exist
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  PostgreSQL Flexible Server ${this.definition.server_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Get or create administrator password
        // If password exists in secret, use it. Otherwise, generate and save a new one.
        const administratorPassword = this.getOrCreatePassword();

        // Prepare request body for server creation
        const body: {
            location: string;
            sku?: Record<string, unknown>;
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            location: this.definition.location,
            properties: {
                version: this.definition.version || "16",
                createMode: "Create"
            }
        };

        // Add SKU configuration
        if (this.definition.sku) {
            body.sku = {
                name: this.definition.sku.name,
                tier: this.definition.sku.tier || "GeneralPurpose"
            };
        } else {
            // Default SKU
            body.sku = {
                name: "Standard_B1ms",
                tier: "Burstable"
            };
        }

        // Add storage configuration
        if (this.definition.storage) {
            body.properties.storage = {
                storageSizeGB: this.definition.storage.storage_size_gb || 32,
                autoGrow: this.definition.storage.auto_grow || "Disabled"
            };
            if (this.definition.storage.storage_tier) {
                (body.properties.storage as Record<string, unknown>).tier = this.definition.storage.storage_tier;
            }
        } else {
            body.properties.storage = {
                storageSizeGB: 32,
                autoGrow: "Disabled"
            };
        }

        // Add backup configuration
        if (this.definition.backup) {
            body.properties.backup = {
                backupRetentionDays: this.definition.backup.backup_retention_days || 7,
                geoRedundantBackup: this.definition.backup.geo_redundant_backup || "Disabled"
            };
        }

        // Add high availability configuration
        if (this.definition.high_availability) {
            body.properties.highAvailability = {
                mode: this.definition.high_availability.mode || "Disabled"
            };
            if (this.definition.high_availability.standby_availability_zone) {
                (body.properties.highAvailability as Record<string, unknown>).standbyAvailabilityZone = 
                    this.definition.high_availability.standby_availability_zone;
            }
        }

        // Setup VNet integration if configured (creates subnet, DNS zone, DNS link)
        let vnetNetworkConfig: { delegatedSubnetResourceId: string; privateDnsZoneArmResourceId: string; dnsLinkId: string } | null = null;
        if (this.definition.vnet_integration) {
            // Validate that manual network config isn't also specified
            if (this.definition.network?.delegated_subnet_resource_id || this.definition.network?.private_dns_zone_resource_id) {
                throw new Error("Cannot use both vnet_integration and manual network.delegated_subnet_resource_id/private_dns_zone_resource_id. Choose one approach.");
            }
            
            try {
                vnetNetworkConfig = this.setupVNetIntegration();
            } catch (error) {
                // If VNet setup fails partway through, clean up any resources that were created
                cli.output(`\n⚠️  VNet integration setup failed, cleaning up partial resources...`);
                this.cleanupVNetIntegration();
                throw error;
            }
        }

        // Add network configuration
        if (vnetNetworkConfig) {
            // Use auto-created VNet integration resources
            body.properties.network = {
                delegatedSubnetResourceId: vnetNetworkConfig.delegatedSubnetResourceId,
                privateDnsZoneArmResourceId: vnetNetworkConfig.privateDnsZoneArmResourceId,
                publicNetworkAccess: "Disabled"
            };
        } else if (this.definition.network) {
            // Use manual network configuration
            const networkConfig: Record<string, unknown> = {};
            if (this.definition.network.delegated_subnet_resource_id) {
                networkConfig.delegatedSubnetResourceId = this.definition.network.delegated_subnet_resource_id;
            }
            if (this.definition.network.private_dns_zone_resource_id) {
                networkConfig.privateDnsZoneArmResourceId = this.definition.network.private_dns_zone_resource_id;
            }
            if (this.definition.network.public_network_access) {
                networkConfig.publicNetworkAccess = this.definition.network.public_network_access;
            }
            if (Object.keys(networkConfig).length > 0) {
                body.properties.network = networkConfig;
            }
        }

        // Add authentication configuration
        if (this.definition.auth_config) {
            body.properties.authConfig = {
                activeDirectoryAuth: this.definition.auth_config.active_directory_auth_enabled ? "Enabled" : "Disabled",
                passwordAuth: this.definition.auth_config.password_auth_enabled !== false ? "Enabled" : "Disabled"
            };
            if (this.definition.auth_config.tenant_id) {
                (body.properties.authConfig as Record<string, unknown>).tenantId = this.definition.auth_config.tenant_id;
            }
        }

        // Add administrator credentials
        // Azure requires both administratorLogin and administratorLoginPassword for password-based auth (default)
        const adminLogin = this.definition.administrator_login || "postgres";
        body.properties.administratorLogin = adminLogin;
        if (administratorPassword) {
            body.properties.administratorLoginPassword = administratorPassword;
        }

        // Add availability zone
        if (this.definition.availability_zone) {
            body.properties.availabilityZone = this.definition.availability_zone;
        }

        // Add tags
        if (this.definition.tags) {
            body.tags = this.definition.tags;
        }

        // Note: VNet resource IDs are already stored in state by setupVNetIntegration()
        // This enables cleanup if any step fails (VNet setup or server creation)

        // Create the server - wrap in try-catch to clean up VNet resources on failure
        const path = this.buildResourcePath(this.definition.server_name);
        
        try {
            const response = this.makeAzureRequest("PUT", path, body);

            if (response.error) {
                throw new Error(`Failed to create PostgreSQL Flexible Server: ${response.error}, body: ${response.body}`);
            }

            const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
            
            // Set full state from created server (preserving VNet resource IDs already set)
            const properties = responseData?.properties as Record<string, unknown> | undefined;
            this.state.server_name = this.definition.server_name;
            this.state.provisioning_state = typeof properties?.state === 'string' ? properties.state : "Creating";
            this.state.server_state = typeof properties?.state === 'string' ? properties.state : "Creating";
            this.state.fqdn = typeof properties?.fullyQualifiedDomainName === 'string' ? properties.fullyQualifiedDomainName : undefined;
            this.state.version = typeof properties?.version === 'string' ? properties.version : this.definition.version || "16";
            this.state.administrator_login = adminLogin;
            this.state.existing = false;

            cli.output(`✅ Created PostgreSQL Flexible Server: ${this.definition.server_name}`);
        } catch (error) {
            // Clean up VNet resources if server creation fails
            if (vnetNetworkConfig) {
                cli.output(`\n⚠️  Server creation failed, cleaning up VNet resources...`);
                this.cleanupVNetIntegration();
            }
            throw error;
        }
    }

    override update(): void {
        if (!this.state.server_name) {
            this.create();
            return;
        }

        // Prepare update body
        const body: {
            sku?: Record<string, unknown>;
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            properties: {}
        };

        let hasChanges = false;

        // Update SKU if provided
        if (this.definition.sku) {
            body.sku = {
                name: this.definition.sku.name,
                tier: this.definition.sku.tier || "GeneralPurpose"
            };
            hasChanges = true;
        }

        // Update storage if provided - only include fields that are explicitly set
        if (this.definition.storage) {
            const storageUpdate: Record<string, unknown> = {};
            if (this.definition.storage.storage_size_gb !== undefined) {
                storageUpdate.storageSizeGB = this.definition.storage.storage_size_gb;
            }
            if (this.definition.storage.auto_grow !== undefined) {
                storageUpdate.autoGrow = this.definition.storage.auto_grow;
            }
            if (this.definition.storage.storage_tier !== undefined) {
                storageUpdate.tier = this.definition.storage.storage_tier;
            }
            if (Object.keys(storageUpdate).length > 0) {
                body.properties.storage = storageUpdate;
                hasChanges = true;
            }
        }

        // Update backup if provided - only include fields that are explicitly set
        if (this.definition.backup) {
            const backupUpdate: Record<string, unknown> = {};
            if (this.definition.backup.backup_retention_days !== undefined) {
                backupUpdate.backupRetentionDays = this.definition.backup.backup_retention_days;
            }
            if (this.definition.backup.geo_redundant_backup !== undefined) {
                backupUpdate.geoRedundantBackup = this.definition.backup.geo_redundant_backup;
            }
            if (Object.keys(backupUpdate).length > 0) {
                body.properties.backup = backupUpdate;
                hasChanges = true;
            }
        }

        // Update high availability if provided - only include fields that are explicitly set
        if (this.definition.high_availability && this.definition.high_availability.mode !== undefined) {
            body.properties.highAvailability = {
                mode: this.definition.high_availability.mode
            };
            hasChanges = true;
        }

        // Update tags
        if (this.definition.tags) {
            body.tags = this.definition.tags;
            hasChanges = true;
        }

        if (!hasChanges) {
            cli.output(`ℹ️  No changes detected for PostgreSQL Flexible Server: ${this.definition.server_name}`);
            return;
        }

        const path = this.buildResourcePath(this.definition.server_name);
        const response = this.makeAzureRequest("PATCH", path, body);

        if (response.error) {
            throw new Error(`Failed to update PostgreSQL Flexible Server: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Update state
        if (responseData) {
            const properties = responseData.properties as Record<string, unknown> | undefined;
            this.state.provisioning_state = typeof properties?.state === 'string' ? properties.state : undefined;
            this.state.server_state = typeof properties?.state === 'string' ? properties.state : undefined;
            this.state.fqdn = typeof properties?.fullyQualifiedDomainName === 'string' ? properties.fullyQualifiedDomainName : undefined;
        }

        cli.output(`✅ Updated PostgreSQL Flexible Server: ${this.definition.server_name}`);
    }

    override delete(): void {
        // Check if there are VNet resources to clean up even if server doesn't exist
        // This handles the case where server creation failed after VNet setup succeeded
        const hasVNetResources = this.state.created_subnet_id || this.state.created_dns_link_id || this.state.created_dns_zone_id;

        if (!this.state.server_name) {
            if (hasVNetResources) {
                cli.output("PostgreSQL Flexible Server does not exist, but VNet resources need cleanup");
                this.cleanupVNetIntegration();
            } else {
                cli.output("PostgreSQL Flexible Server does not exist, nothing to delete");
            }
            return;
        }

        // Skip deletion for pre-existing servers (not created by this entity)
        if (this.state.existing) {
            cli.output(`PostgreSQL Flexible Server ${this.definition.server_name} wasn't created by this entity, skipping delete`);
            return;
        }

        // Delete the PostgreSQL server first
        this.deleteResource(this.definition.server_name);

        // Wait for server deletion to complete before cleaning up VNet resources
        // The subnet has a service association link that can't be deleted until server is gone
        if (hasVNetResources) {
            cli.output(`⏳ Waiting for server deletion to complete before cleaning up VNet resources...`);
            this.waitForServerDeletion();
        }

        // Clean up VNet integration resources (subnet, DNS zone, DNS link)
        this.cleanupVNetIntegration();
    }

    /**
     * Wait for the PostgreSQL server to be fully deleted
     * Polls until the server returns 404 Not Found
     * Only treats definitive 404 responses as "deleted" - transient errors are retried
     */
    private waitForServerDeletion(): void {
        const maxAttempts = 60; // 60 attempts * 30 seconds = 30 minutes max
        const pollIntervalMs = 30000; // 30 seconds

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const checkResult = this.checkResourceExistsWithStatus(this.definition.server_name);
            
            if (checkResult.notFound) {
                // Definitive 404 - server is deleted
                cli.output(`✅ Server deletion confirmed (attempt ${attempt})`);
                return;
            }
            
            if (checkResult.resource) {
                // Server still exists
                const properties = checkResult.resource.properties as Record<string, unknown> | undefined;
                const state = typeof properties?.state === 'string' ? properties.state : 'unknown';
                cli.output(`⏳ Server still exists (state: ${state}), waiting... (attempt ${attempt}/${maxAttempts})`);
            } else {
                // Transient API error - not a definitive deletion confirmation
                cli.output(`⚠️  API error checking server status: ${checkResult.error || 'Unknown error'} (attempt ${attempt}/${maxAttempts})`);
            }
            
            // Sleep before next check
            sleep(pollIntervalMs);
        }

        cli.output(`⚠️  Server deletion timed out after ${maxAttempts} attempts. Attempting VNet cleanup anyway...`);
    }


    override checkReadiness(): boolean {
        // If create_when_missing is false and resource doesn't exist, consider it ready
        // This check must come first because state.server_name won't be set in this case
        if (this.definition.create_when_missing === false && this.state.existing === false) {
            return true;
        }

        if (!this.state.server_name) {
            return false;
        }

        try {
            // Check if server exists and is ready
            const checkResult = this.checkResourceExistsWithStatus(this.definition.server_name);
            
            if (!checkResult.resource) {
                // Only count definitive 404 "not found" responses toward the threshold
                // Transient errors (500, 429, network issues) should NOT trigger VNet cleanup
                if (checkResult.notFound) {
                    // Server definitively not found (404) - track consecutive NotFound responses
                    // This happens when Azure accepts the request but async provisioning fails
                    this.state.not_found_count = (this.state.not_found_count || 0) + 1;
                    
                    // After 5 consecutive NotFound responses (with 30s period = ~2.5 minutes),
                    // assume async creation failed and clean up VNet resources
                    const notFoundThreshold = 5;
                    if (this.state.not_found_count >= notFoundThreshold && this.definition.vnet_integration) {
                        cli.output(`❌ PostgreSQL Flexible Server ${this.definition.server_name} not found after ${this.state.not_found_count} checks - async creation likely failed`);
                        cli.output(`🧹 Cleaning up VNet integration resources...`);
                        this.cleanupVNetIntegration();
                        
                        this.state.provisioning_state = "Failed";
                        this.state.server_state = "Failed";
                        
                        throw new Error(`PostgreSQL Flexible Server ${this.definition.server_name} creation failed - server not found after ${this.state.not_found_count} readiness checks. VNet resources have been cleaned up.`);
                    }
                    
                    cli.output(`⏳ PostgreSQL Flexible Server ${this.definition.server_name} not found - may still be provisioning (check ${this.state.not_found_count}/${notFoundThreshold})`);
                    
                    // Update state to reflect the server doesn't exist
                    this.state.provisioning_state = "NotFound";
                    this.state.server_state = "NotFound";
                } else {
                    // Transient API error (500, 429, etc.) - do NOT count toward not_found threshold
                    // This prevents VNet cleanup due to temporary Azure API issues
                    cli.output(`⚠️  API error checking PostgreSQL Flexible Server ${this.definition.server_name}: ${checkResult.error || 'Unknown error'} (not counting toward failure threshold)`);
                }
                
                return false;
            }
            
            // Reset not_found_count when server is found
            this.state.not_found_count = 0;
            const server = checkResult.resource;

            const properties = server.properties as Record<string, unknown> | undefined;
            const serverState = typeof properties?.state === 'string' ? properties.state : undefined;
            
            // Update state with current information regardless of readiness
            this.state.provisioning_state = serverState;
            this.state.server_state = serverState;
            this.state.fqdn = typeof properties?.fullyQualifiedDomainName === 'string' ? properties.fullyQualifiedDomainName : undefined;
            this.state.version = typeof properties?.version === 'string' ? properties.version : undefined;
            this.state.administrator_login = typeof properties?.administratorLogin === 'string' ? properties.administratorLogin : undefined;
            
            // Check for failed states - clean up VNet resources and throw error to stop retrying
            const failedStates = ["Failed", "Dropped", "Disabled"];
            if (serverState && failedStates.includes(serverState)) {
                cli.output(`❌ PostgreSQL Flexible Server ${this.definition.server_name} is in failed state: ${serverState}`);
                
                // Clean up VNet resources on failure (only if VNet integration was configured)
                if (this.definition.vnet_integration) {
                    cli.output(`🧹 Cleaning up VNet integration resources...`);
                    this.cleanupVNetIntegration();
                    throw new Error(`PostgreSQL Flexible Server ${this.definition.server_name} is in failed state: ${serverState}. VNet resources have been cleaned up.`);
                }
                
                throw new Error(`PostgreSQL Flexible Server ${this.definition.server_name} is in failed state: ${serverState}.`);
            }
            
            const isReady = serverState === "Ready";
            
            if (isReady) {
                cli.output(`✅ PostgreSQL Flexible Server ${this.definition.server_name} is ready (state: ${serverState})`);
                
                // Populate connection string when server is ready (only once)
                if (!this.state.connection_string_populated) {
                    this.populateConnectionString();
                    this.state.connection_string_populated = true;
                }
            } else {
                cli.output(`⏳ PostgreSQL Flexible Server ${this.definition.server_name} not ready yet (state: ${serverState || 'unknown'})`);
            }
            
            return isReady;
        } catch (error) {
            // Re-throw intentional fail-fast errors so they propagate properly
            // These include: "is in failed state" and "creation failed"
            if (error instanceof Error && 
                (error.message.includes("is in failed state") || error.message.includes("creation failed"))) {
                throw error;
            }
            cli.output(`⚠️  Failed to check PostgreSQL Flexible Server readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    /**
     * Populate connection string secret if reference is provided
     * Format: postgresql://username:password@host:5432/database?sslmode=require
     */
    private populateConnectionString(): void {
        if (!this.definition.connection_string_secret_ref || !this.state.fqdn) {
            return;
        }

        try {
            const adminLogin = this.state.administrator_login || this.definition.administrator_login || "postgres";
            
            // Get password from the password secret
            let password = "";
            if (this.definition.administrator_password_secret_ref) {
                try {
                    const secretValue = secret.get(this.definition.administrator_password_secret_ref);
                    if (secretValue) {
                        password = secretValue;
                    }
                } catch {
                    cli.output(`⚠️  Could not retrieve password from secret for connection string`);
                }
            }
            
            // URL-encode the password to handle special characters
            const encodedPassword = encodeURIComponent(password);
            
            // Build connection string with password
            const connectionString = password 
                ? `postgresql://${adminLogin}:${encodedPassword}@${this.state.fqdn}:5432/postgres?sslmode=require`
                : `postgresql://${adminLogin}@${this.state.fqdn}:5432/postgres?sslmode=require`;
            
            secret.set(this.definition.connection_string_secret_ref, connectionString);
            cli.output(`🔑 Saved connection string to secret: ${this.definition.connection_string_secret_ref}`);
        } catch (error) {
            cli.output(`⚠️  Failed to save connection string to secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // ========================================
    // VNet Integration Helpers
    // ========================================

    private readonly networkApiVersion = "2024-05-01";
    private readonly privateDnsApiVersion = "2024-06-01";

    /**
     * Setup VNet integration by creating subnet, DNS zone, and DNS link
     * Returns all created resource IDs for state storage and cleanup
     * 
     * Note: Resource IDs are stored in state immediately after creation
     * to enable cleanup of partial resources if a later step fails.
     */
    private setupVNetIntegration(): { 
        delegatedSubnetResourceId: string; 
        privateDnsZoneArmResourceId: string;
        dnsLinkId: string;
    } | null {
        const vnetConfig = this.definition.vnet_integration;
        if (!vnetConfig) {
            return null;
        }

        cli.output(`\n🔧 Setting up VNet integration for ${vnetConfig.vnet_name}...`);

        const vnetResourceGroup = vnetConfig.vnet_resource_group || this.definition.resource_group_name;
        const subnetName = vnetConfig.subnet_name || `postgres-subnet-${this.definition.server_name}`;
        const dnsLinkName = vnetConfig.dns_link_name || `postgres-dns-link-${this.definition.server_name}`;
        const dnsZoneName = "privatelink.postgres.database.azure.com";

        // Step 1: Create delegated subnet
        // Store ID in state immediately for cleanup if later steps fail
        cli.output(`\n📡 Step 1: Creating delegated subnet '${subnetName}'...`);
        const subnetId = this.createDelegatedSubnet(
            vnetResourceGroup,
            vnetConfig.vnet_name,
            subnetName,
            vnetConfig.subnet_address_prefix
        );
        this.state.created_subnet_id = subnetId;

        // Step 2: Create private DNS zone (or use existing)
        // Store ID in state immediately for cleanup if later steps fail
        cli.output(`\n📡 Step 2: Creating private DNS zone '${dnsZoneName}'...`);
        const dnsZoneId = this.createPrivateDnsZone(dnsZoneName);
        this.state.created_dns_zone_id = dnsZoneId;

        // Step 3: Create DNS zone VNet link
        // Store ID in state immediately for cleanup if later steps fail
        cli.output(`\n📡 Step 3: Creating DNS zone VNet link '${dnsLinkName}'...`);
        const dnsLinkId = this.createDnsZoneVNetLink(
            dnsZoneName,
            dnsLinkName,
            vnetResourceGroup,
            vnetConfig.vnet_name
        );
        this.state.created_dns_link_id = dnsLinkId;

        cli.output(`\n✅ VNet integration setup complete!`);
        cli.output(`   Subnet ID: ${subnetId}`);
        cli.output(`   DNS Zone ID: ${dnsZoneId}`);
        cli.output(`   DNS Link ID: ${dnsLinkId}`);

        return {
            delegatedSubnetResourceId: subnetId,
            privateDnsZoneArmResourceId: dnsZoneId,
            dnsLinkId: dnsLinkId
        };
    }

    /**
     * Create a delegated subnet for PostgreSQL Flexible Server
     */
    private createDelegatedSubnet(
        resourceGroup: string,
        vnetName: string,
        subnetName: string,
        addressPrefix: string
    ): string {
        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/${subnetName}?api-version=${this.networkApiVersion}`;
        
        const body = {
            properties: {
                addressPrefix: addressPrefix,
                delegations: [
                    {
                        name: "Microsoft.DBforPostgreSQL.flexibleServers",
                        properties: {
                            serviceName: "Microsoft.DBforPostgreSQL/flexibleServers"
                        }
                    }
                ]
            }
        };

        const response = this.makeAzureRequest("PUT", path, body);

        // Accept 200, 201, or 202 (async operation accepted)
        if (response.error && response.statusCode !== 200 && response.statusCode !== 201 && response.statusCode !== 202) {
            throw new Error(`Failed to create delegated subnet: ${response.error}, body: ${response.body}`);
        }

        // Try to get ID from response body first
        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        let subnetId = responseData?.id as string;
        
        // If response is empty (202 async), construct the ID manually and poll for completion
        if (!subnetId) {
            subnetId = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/${subnetName}`;
            cli.output(`   ⏳ Subnet creation accepted (async): ${subnetName}`);
            
            // Wait for the subnet to be created by polling
            const checkPath = `${subnetId}?api-version=${this.networkApiVersion}`;
            const maxAttempts = 30;
            const pollInterval = 2000; // 2 seconds
            for (let i = 0; i < maxAttempts; i++) {
                const pollResponse = this.makeAzureRequest("GET", checkPath);
                if (!pollResponse.error && pollResponse.statusCode === 200) {
                    const pollData = this.parseResponseBody(pollResponse) as Record<string, unknown> | null;
                    const provisioningState = (pollData?.properties as Record<string, unknown>)?.provisioningState as string;
                    if (provisioningState === "Succeeded") {
                        cli.output(`   ✅ Created delegated subnet: ${subnetName}`);
                        return subnetId;
                    }
                    if (provisioningState === "Failed") {
                        throw new Error(`Delegated subnet ${subnetName} provisioning failed`);
                    }
                }
                // Sleep before next poll
                sleep(pollInterval);
            }
            // If we get here, assume it's created (the server creation will fail if not)
            cli.output(`   ⚠️  Subnet creation may still be in progress: ${subnetName}`);
            return subnetId;
        }

        cli.output(`   ✅ Created delegated subnet: ${subnetName}`);
        return subnetId;
    }

    /**
     * Create a private DNS zone for PostgreSQL
     */
    private createPrivateDnsZone(zoneName: string): string {
        // First check if the DNS zone already exists
        const checkPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Network/privateDnsZones/${zoneName}?api-version=${this.privateDnsApiVersion}`;
        const checkResponse = this.makeAzureRequest("GET", checkPath);
        
        if (!checkResponse.error && checkResponse.statusCode === 200) {
            const existingZone = this.parseResponseBody(checkResponse) as Record<string, unknown> | null;
            const existingId = existingZone?.id as string;
            if (existingId) {
                cli.output(`   ℹ️  Private DNS zone already exists: ${zoneName}`);
                return existingId;
            }
        }

        // Create the DNS zone
        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Network/privateDnsZones/${zoneName}?api-version=${this.privateDnsApiVersion}`;
        
        const body = {
            location: "global"
        };

        const response = this.makeAzureRequest("PUT", path, body);

        // Accept 200, 201, or 202 (async operation accepted)
        if (response.error && response.statusCode !== 200 && response.statusCode !== 201 && response.statusCode !== 202) {
            throw new Error(`Failed to create private DNS zone: ${response.error}, body: ${response.body}`);
        }

        // Try to get ID from response body first
        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        let zoneId = responseData?.id as string;
        
        // If response is empty (202 async), construct the ID manually
        if (!zoneId) {
            zoneId = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Network/privateDnsZones/${zoneName}`;
            cli.output(`   ⏳ Private DNS zone creation accepted (async): ${zoneName}`);
            
            // Wait for the zone to be created by polling
            const maxAttempts = 30;
            const pollInterval = 2000; // 2 seconds
            for (let i = 0; i < maxAttempts; i++) {
                const pollResponse = this.makeAzureRequest("GET", checkPath);
                if (!pollResponse.error && pollResponse.statusCode === 200) {
                    const pollData = this.parseResponseBody(pollResponse) as Record<string, unknown> | null;
                    const provisioningState = (pollData?.properties as Record<string, unknown>)?.provisioningState as string;
                    if (provisioningState === "Succeeded") {
                        cli.output(`   ✅ Created private DNS zone: ${zoneName}`);
                        return zoneId;
                    }
                    if (provisioningState === "Failed") {
                        throw new Error(`Private DNS zone ${zoneName} provisioning failed`);
                    }
                }
                // Sleep before next poll
                sleep(pollInterval);
            }
            // If we get here, assume it's created (the server creation will fail if not)
            cli.output(`   ⚠️  DNS zone creation may still be in progress: ${zoneName}`);
            return zoneId;
        }

        cli.output(`   ✅ Created private DNS zone: ${zoneName}`);
        return zoneId;
    }

    /**
     * Create a VNet link for the private DNS zone
     */
    private createDnsZoneVNetLink(
        zoneName: string,
        linkName: string,
        vnetResourceGroup: string,
        vnetName: string
    ): string {
        // First check if the link already exists
        const checkPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Network/privateDnsZones/${zoneName}/virtualNetworkLinks/${linkName}?api-version=${this.privateDnsApiVersion}`;
        const checkResponse = this.makeAzureRequest("GET", checkPath);
        
        if (!checkResponse.error && checkResponse.statusCode === 200) {
            const existingLink = this.parseResponseBody(checkResponse) as Record<string, unknown> | null;
            const existingId = existingLink?.id as string;
            if (existingId) {
                cli.output(`   ℹ️  DNS zone VNet link already exists: ${linkName}`);
                return existingId;
            }
        }

        const vnetId = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${vnetResourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}`;
        
        const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Network/privateDnsZones/${zoneName}/virtualNetworkLinks/${linkName}?api-version=${this.privateDnsApiVersion}`;
        
        const body = {
            location: "global",
            properties: {
                virtualNetwork: {
                    id: vnetId
                },
                registrationEnabled: false
            }
        };

        const response = this.makeAzureRequest("PUT", path, body);

        // Accept 200, 201, or 202 (async operation accepted)
        if (response.error && response.statusCode !== 200 && response.statusCode !== 201 && response.statusCode !== 202) {
            throw new Error(`Failed to create DNS zone VNet link: ${response.error}, body: ${response.body}`);
        }

        // Try to get ID from response body first
        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        let linkId = responseData?.id as string;
        
        // If response is empty (202 async), construct the ID manually
        if (!linkId) {
            linkId = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Network/privateDnsZones/${zoneName}/virtualNetworkLinks/${linkName}`;
            cli.output(`   ⏳ DNS zone VNet link creation accepted (async): ${linkName}`);
            
            // Wait for the link to be created by polling
            const maxAttempts = 30;
            const pollInterval = 2000; // 2 seconds
            for (let i = 0; i < maxAttempts; i++) {
                const pollResponse = this.makeAzureRequest("GET", checkPath);
                if (!pollResponse.error && pollResponse.statusCode === 200) {
                    const pollData = this.parseResponseBody(pollResponse) as Record<string, unknown> | null;
                    const provisioningState = (pollData?.properties as Record<string, unknown>)?.provisioningState as string;
                    if (provisioningState === "Succeeded") {
                        cli.output(`   ✅ Created DNS zone VNet link: ${linkName}`);
                        return linkId;
                    }
                    if (provisioningState === "Failed") {
                        throw new Error(`DNS zone VNet link ${linkName} provisioning failed`);
                    }
                }
                // Sleep before next poll
                sleep(pollInterval);
            }
            // If we get here, assume it's created (the server creation will fail if not)
            cli.output(`   ⚠️  DNS link creation may still be in progress: ${linkName}`);
            return linkId;
        }

        cli.output(`   ✅ Created DNS zone VNet link: ${linkName}`);
        return linkId;
    }

    /**
     * Clean up VNet integration resources created by this entity
     * Only clears state tracking for resources that were successfully deleted
     */
    private cleanupVNetIntegration(): void {
        // Skip cleanup if resources weren't created by us (pre-existing server)
        if (this.state.existing) {
            cli.output(`ℹ️  Skipping VNet integration cleanup - server was pre-existing`);
            return;
        }

        // Check if there are any VNet resources to clean up based on state, not definition.
        // This handles the case where vnet_integration was removed from definition after creation.
        const hasVNetResources = this.state.created_subnet_id || this.state.created_dns_link_id || this.state.created_dns_zone_id;
        if (!hasVNetResources) {
            return;
        }

        cli.output(`\n🧹 Cleaning up VNet integration resources...`);

        // Delete DNS zone VNet link first (must be deleted before DNS zone)
        if (this.state.created_dns_link_id) {
            const deleted = this.deleteResourceById(this.state.created_dns_link_id, this.privateDnsApiVersion, "DNS zone VNet link");
            if (deleted) {
                this.state.created_dns_link_id = undefined;
            }
        }

        // Note: We don't delete the private DNS zone as it's shared across servers
        // and may be used by other PostgreSQL instances
        if (this.state.created_dns_zone_id) {
            cli.output(`   ℹ️  Keeping private DNS zone (shared resource)`);
            this.state.created_dns_zone_id = undefined;
        }

        // Delete delegated subnet
        if (this.state.created_subnet_id) {
            const deleted = this.deleteResourceById(this.state.created_subnet_id, this.networkApiVersion, "delegated subnet");
            if (deleted) {
                this.state.created_subnet_id = undefined;
            }
        }

        cli.output(`✅ VNet integration cleanup complete`);
    }

    /**
     * Delete an Azure resource by its full resource ID
     * @returns true if resource was deleted or didn't exist, false if deletion failed
     */
    private deleteResourceById(resourceId: string, apiVersion: string, resourceType: string): boolean {
        try {
            const path = `${resourceId}?api-version=${apiVersion}`;
            const response = this.makeAzureRequest("DELETE", path);
            
            // Check for success: 200, 202, 204 are success; 404 means already deleted
            const isSuccess = response.statusCode === 200 || response.statusCode === 202 || response.statusCode === 204;
            const isNotFound = response.statusCode === 404;
            
            if (isNotFound) {
                cli.output(`   ℹ️  ${resourceType} not found (may have been already deleted)`);
                return true;
            }
            
            // Check for failure: either explicit error OR non-success status code
            if (response.error || !isSuccess) {
                cli.output(`⚠️  Failed to delete ${resourceType}: ${response.error || `status ${response.statusCode}`}`);
                cli.output(`   ⚠️  Resource ID retained in state for manual cleanup: ${resourceId}`);
                return false;
            }
            
            cli.output(`   ✅ Deleted ${resourceType}`);
            return true;
        } catch (error) {
            cli.output(`⚠️  Error deleting ${resourceType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            cli.output(`   ⚠️  Resource ID retained in state for manual cleanup: ${resourceId}`);
            return false;
        }
    }

    // ========================================
    // Custom Actions
    // ========================================

    /**
     * Get server information
     * 
     * Usage:
     *   monk do namespace/server get-info
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📊 PostgreSQL Flexible Server Information`);
        cli.output(`==================================================`);

        if (!this.state.server_name) {
            throw new Error("Server does not exist. Create the server first.");
        }

        try {
            const server = this.checkResourceExists(this.definition.server_name);
            
            if (!server) {
                throw new Error(`Server ${this.definition.server_name} not found`);
            }

            const properties = server.properties as Record<string, unknown> | undefined;
            const sku = server.sku as Record<string, unknown> | undefined;

            cli.output(`\n📋 Basic Information:`);
            cli.output(`   Server Name: ${server.name}`);
            cli.output(`   Location: ${server.location}`);
            cli.output(`   State: ${properties?.state || 'Unknown'}`);
            cli.output(`   FQDN: ${properties?.fullyQualifiedDomainName || 'N/A'}`);
            cli.output(`   PostgreSQL Version: ${properties?.version || 'N/A'}`);
            cli.output(`   Administrator Login: ${properties?.administratorLogin || 'N/A'}`);

            cli.output(`\n💻 Compute:`);
            cli.output(`   SKU Name: ${sku?.name || 'N/A'}`);
            cli.output(`   SKU Tier: ${sku?.tier || 'N/A'}`);

            const storage = properties?.storage as Record<string, unknown> | undefined;
            if (storage) {
                cli.output(`\n💾 Storage:`);
                cli.output(`   Size: ${storage.storageSizeGB || 'N/A'} GB`);
                cli.output(`   Auto Grow: ${storage.autoGrow || 'N/A'}`);
            }

            const backup = properties?.backup as Record<string, unknown> | undefined;
            if (backup) {
                cli.output(`\n📦 Backup:`);
                cli.output(`   Retention Days: ${backup.backupRetentionDays || 'N/A'}`);
                cli.output(`   Geo-Redundant: ${backup.geoRedundantBackup || 'N/A'}`);
            }

            const ha = properties?.highAvailability as Record<string, unknown> | undefined;
            if (ha) {
                cli.output(`\n🔄 High Availability:`);
                cli.output(`   Mode: ${ha.mode || 'Disabled'}`);
                cli.output(`   State: ${ha.state || 'N/A'}`);
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get server info`);
            throw new Error(`Get info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Start a stopped server
     * 
     * Usage:
     *   monk do namespace/server start-server
     */
    @action("start-server")
    startServer(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`▶️  Starting PostgreSQL Flexible Server`);
        cli.output(`==================================================`);

        if (!this.state.server_name) {
            throw new Error("Server does not exist. Create the server first.");
        }

        try {
            const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${this.definition.server_name}/start?api-version=${this.apiVersion}`;
            const response = this.makeAzureRequest("POST", path);

            if (response.error) {
                throw new Error(`Start failed: ${response.error}, body: ${response.body}`);
            }

            cli.output(`\n✅ Server start initiated successfully`);
            cli.output(`   Server will be available shortly`);
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to start server`);
            throw new Error(`Start server failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Stop a running server
     * 
     * Usage:
     *   monk do namespace/server stop-server
     */
    @action("stop-server")
    stopServer(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`⏹️  Stopping PostgreSQL Flexible Server`);
        cli.output(`==================================================`);

        if (!this.state.server_name) {
            throw new Error("Server does not exist. Create the server first.");
        }

        try {
            const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${this.definition.server_name}/stop?api-version=${this.apiVersion}`;
            const response = this.makeAzureRequest("POST", path);

            if (response.error) {
                throw new Error(`Stop failed: ${response.error}, body: ${response.body}`);
            }

            cli.output(`\n✅ Server stop initiated successfully`);
            cli.output(`   Note: Stopped servers do not incur compute charges`);
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to stop server`);
            throw new Error(`Stop server failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Restart the server
     * 
     * Usage:
     *   monk do namespace/server restart-server
     *   monk do namespace/server restart-server failover_mode="PlannedFailover"
     *   monk do namespace/server restart-server failover_mode="ForcedFailover"
     * 
     * @param args.failover_mode - Optional failover mode: "PlannedFailover" or "ForcedFailover"
     *                             When specified, triggers a restart with failover (for HA-enabled servers)
     */
    @action("restart-server")
    restartServer(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🔄 Restarting PostgreSQL Flexible Server`);
        cli.output(`==================================================`);

        if (!this.state.server_name) {
            throw new Error("Server does not exist. Create the server first.");
        }

        try {
            const failoverMode = args?.failover_mode as string | undefined;
            const body: Record<string, unknown> = {};
            
            if (failoverMode) {
                // Azure RestartParameter API expects:
                // - restartWithFailover: boolean (whether to restart with failover)
                // - failoverMode: string ("PlannedFailover" or "ForcedFailover")
                body.restartWithFailover = true;
                body.failoverMode = failoverMode;
                cli.output(`   Restart with Failover: true`);
                cli.output(`   Failover Mode: ${failoverMode}`);
            }

            const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${this.definition.server_name}/restart?api-version=${this.apiVersion}`;
            const response = this.makeAzureRequest("POST", path, Object.keys(body).length > 0 ? body : undefined);

            if (response.error) {
                throw new Error(`Restart failed: ${response.error}, body: ${response.body}`);
            }

            cli.output(`\n✅ Server restart initiated successfully`);
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to restart server`);
            throw new Error(`Restart server failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get connection string for the server
     * 
     * Usage:
     *   monk do namespace/server get-connection-string
     *   monk do namespace/server get-connection-string database="mydb"
     */
    @action("get-connection-string")
    getConnectionString(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🔗 PostgreSQL Connection String`);
        cli.output(`==================================================`);

        if (!this.state.server_name || !this.state.fqdn) {
            throw new Error("Server does not exist or is not ready. Create the server first and wait for it to be ready.");
        }

        const database = (args?.database as string) || "postgres";
        const adminLogin = this.state.administrator_login || this.definition.administrator_login || "postgres";

        cli.output(`\n📋 Connection Details:`);
        cli.output(`   Host: ${this.state.fqdn}`);
        cli.output(`   Port: 5432`);
        cli.output(`   Database: ${database}`);
        cli.output(`   Username: ${adminLogin}`);
        cli.output(`   SSL Mode: require`);

        cli.output(`\n🔗 Connection Strings:`);
        cli.output(`\n   PostgreSQL URI:`);
        cli.output(`   postgresql://${adminLogin}@${this.state.fqdn}:5432/${database}?sslmode=require`);

        cli.output(`\n   JDBC:`);
        cli.output(`   jdbc:postgresql://${this.state.fqdn}:5432/${database}?sslmode=require&user=${adminLogin}`);

        cli.output(`\n   psql:`);
        cli.output(`   psql "host=${this.state.fqdn} port=5432 dbname=${database} user=${adminLogin} sslmode=require"`);

        cli.output(`\n==================================================`);
    }

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Get estimated monthly cost for this Azure PostgreSQL Flexible Server
     * 
     * Calculates costs based on:
     * - Compute (vCores and memory based on SKU tier)
     * - Storage (provisioned storage GB)
     * - Backup storage (beyond included amount)
     * - High availability (doubles compute cost if enabled)
     * - Network egress
     * 
     * Uses Azure Retail Prices API (free, no authentication required)
     * 
     * Usage:
     *   monk do namespace/server get-cost-estimate
     * 
     * Required permissions:
     * - Microsoft.DBforPostgreSQL/flexibleServers/read
     * - Microsoft.Insights/metrics/read (for Azure Monitor metrics)
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`💰 Cost Estimate for Azure PostgreSQL Flexible Server`);
        cli.output(`Server: ${this.definition.server_name}`);
        cli.output(`==================================================`);

        // Get server details
        const server = this.checkResourceExists(this.definition.server_name);
        if (!server) {
            throw new Error(`Server ${this.definition.server_name} not found`);
        }

        const properties = server.properties as Record<string, unknown> | undefined;
        const sku = server.sku as Record<string, unknown> | undefined;
        const skuName = (sku?.name as string) || this.definition.sku?.name || 'Standard_B1ms';
        const skuTier = (sku?.tier as string) || this.definition.sku?.tier || 'Burstable';
        const location = (server.location as string) || this.definition.location;
        const version = (properties?.version as string) || this.definition.version || '16';

        // Get storage configuration
        const storageConfig = properties?.storage as Record<string, unknown> | undefined;
        const storageSizeGb = (storageConfig?.storageSizeGB as number) || this.definition.storage?.storage_size_gb || 32;

        // Get HA configuration
        const haConfig = properties?.highAvailability as Record<string, unknown> | undefined;
        const haMode = (haConfig?.mode as string) || this.definition.high_availability?.mode || 'Disabled';
        const isHaEnabled = haMode !== 'Disabled';

        // Get backup configuration
        const backupConfig = properties?.backup as Record<string, unknown> | undefined;
        const backupRetentionDays = (backupConfig?.backupRetentionDays as number) || this.definition.backup?.backup_retention_days || 7;
        const geoRedundantBackup = (backupConfig?.geoRedundantBackup as string) || this.definition.backup?.geo_redundant_backup || 'Disabled';

        cli.output(`\n📊 Server Configuration:`);
        cli.output(`   Location: ${location}`);
        cli.output(`   PostgreSQL Version: ${version}`);
        cli.output(`   SKU: ${skuName} (${skuTier})`);
        cli.output(`   Storage: ${storageSizeGb} GB`);
        cli.output(`   High Availability: ${haMode}`);
        cli.output(`   Backup Retention: ${backupRetentionDays} days`);
        cli.output(`   Geo-Redundant Backup: ${geoRedundantBackup}`);

        // Parse SKU to get vCores and memory
        const skuSpecs = this.parseSkuSpecs(skuName, skuTier);
        cli.output(`   vCores: ${skuSpecs.vCores}`);
        cli.output(`   Memory: ${skuSpecs.memoryGb} GB`);

        // Get pricing from Azure Retail Prices API (pass SKU name for Burstable tier)
        const pricing = this.getPostgreSQLPricing(location, skuTier, skuName);

        if (!pricing) {
            cli.output(`\n❌ Error: Could not fetch pricing from Azure Retail Prices API`);
            cli.output(`   Location: ${location}`);
            cli.output(`   Tier: ${skuTier}`);
            cli.output(`   SKU: ${skuName}`);
            cli.output(`\nPlease check that the Azure Retail Prices API is accessible.`);
            return;
        }

        // Get Azure Monitor metrics
        const metrics = this.getPostgreSQLMetrics();

        // Calculate compute costs
        // Burstable tier is priced per-instance, not per-vCore
        const hoursPerMonth = 730;
        let computeCost: number;
        let computeDescription: string;
        
        if (pricing.isBurstable) {
            // Burstable: price is per instance
            computeCost = pricing.computePerVCoreHour * hoursPerMonth;
            computeDescription = `${skuName} @ $${pricing.computePerVCoreHour.toFixed(4)}/hr × ${hoursPerMonth} hrs`;
        } else {
            // General Purpose / Memory Optimized: price is per vCore
            computeCost = skuSpecs.vCores * pricing.computePerVCoreHour * hoursPerMonth;
            computeDescription = `${skuSpecs.vCores} vCores × $${pricing.computePerVCoreHour.toFixed(4)}/hr × ${hoursPerMonth} hrs`;
        }
        
        // HA doubles compute cost
        const haMultiplier = isHaEnabled ? 2 : 1;
        computeCost *= haMultiplier;
        if (haMultiplier > 1) {
            computeDescription += ` × ${haMultiplier}x (HA)`;
        }

        // Calculate storage costs
        const storageCost = storageSizeGb * pricing.storagePerGbMonth;

        // Calculate backup costs
        // First backup storage equal to provisioned storage is free
        // Estimate additional backup storage based on retention
        const estimatedBackupGb = Math.max(0, (storageSizeGb * backupRetentionDays / 7) - storageSizeGb);
        let backupCost = estimatedBackupGb * pricing.backupPerGbMonth;
        if (geoRedundantBackup === 'Enabled') {
            backupCost *= 2; // Geo-redundant backup doubles the cost
        }

        // Calculate network egress costs
        const egressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
        const networkCost = this.calculateEgressCost(egressGb);

        // Total cost
        const totalCost = computeCost + storageCost + backupCost + networkCost;

        cli.output(`\n💵 Cost Breakdown (Monthly):`);
        cli.output(`   Compute: $${computeCost.toFixed(2)}`);
        cli.output(`      └─ ${computeDescription} = $${computeCost.toFixed(2)}`);
        cli.output(`   Storage: $${storageCost.toFixed(2)}`);
        cli.output(`      └─ ${storageSizeGb} GB × $${pricing.storagePerGbMonth.toFixed(4)}/GB = $${storageCost.toFixed(2)}`);
        cli.output(`   Backup: $${backupCost.toFixed(2)}`);
        cli.output(`      └─ ~${estimatedBackupGb.toFixed(0)} GB additional × $${pricing.backupPerGbMonth.toFixed(4)}/GB${geoRedundantBackup === 'Enabled' ? ' × 2 (geo-redundant)' : ''}`);
        cli.output(`   Network Egress: $${networkCost.toFixed(2)}`);
        cli.output(`      └─ ${egressGb.toFixed(2)} GB egress`);
        cli.output(`   ─────────────────────────────`);
        cli.output(`   TOTAL: $${totalCost.toFixed(2)}/month`);

        cli.output(`\n📈 Azure Monitor Metrics (last 30 days):`);
        cli.output(`   CPU Utilization: ${metrics.cpuPercent.toFixed(1)}%`);
        cli.output(`   Memory Utilization: ${metrics.memoryPercent.toFixed(1)}%`);
        cli.output(`   Storage Used: ${this.formatBytes(metrics.storageUsedBytes)}`);
        cli.output(`   Active Connections: ${metrics.activeConnections}`);
        cli.output(`   Network Egress: ${this.formatBytes(metrics.networkEgressBytes)}`);
        cli.output(`   Network Ingress: ${this.formatBytes(metrics.networkIngressBytes)}`);

        // Output JSON summary
        const summary = {
            server: {
                name: this.definition.server_name,
                subscription_id: this.definition.subscription_id,
                resource_group: this.definition.resource_group_name,
                location: location,
                version: version,
                sku: skuName,
                tier: skuTier,
                vcores: skuSpecs.vCores,
                memory_gb: skuSpecs.memoryGb,
                storage_gb: storageSizeGb,
                high_availability: haMode,
                backup_retention_days: backupRetentionDays,
                geo_redundant_backup: geoRedundantBackup
            },
            pricing_rates: {
                source: pricing.source,
                currency: 'USD',
                compute_per_vcore_hour: pricing.computePerVCoreHour,
                storage_per_gb_month: pricing.storagePerGbMonth,
                backup_per_gb_month: pricing.backupPerGbMonth
            },
            cost_breakdown: {
                compute_monthly: parseFloat(computeCost.toFixed(2)),
                storage_monthly: parseFloat(storageCost.toFixed(2)),
                backup_monthly: parseFloat(backupCost.toFixed(2)),
                network_monthly: parseFloat(networkCost.toFixed(2)),
                total_monthly: parseFloat(totalCost.toFixed(2))
            },
            metrics: {
                period_days: 30,
                cpu_percent: parseFloat(metrics.cpuPercent.toFixed(1)),
                memory_percent: parseFloat(metrics.memoryPercent.toFixed(1)),
                storage_used_bytes: metrics.storageUsedBytes,
                active_connections: metrics.activeConnections,
                network_egress_bytes: metrics.networkEgressBytes,
                network_ingress_bytes: metrics.networkIngressBytes
            },
            disclaimer: "Pricing from Azure Retail Prices API. Metrics from Azure Monitor. Actual costs may vary based on reserved capacity and additional features."
        };

        cli.output(`\n📋 JSON Summary:`);
        cli.output(JSON.stringify(summary, null, 2));
        cli.output(`\n==================================================`);
    }

    /**
     * Returns cost information in the format expected by Monk billing system.
     * This lifecycle method is called automatically by the core to collect entity costs.
     * 
     * Returns JSON in format:
     * {
     *   "type": "azure-postgresql-flexible-server",
     *   "costs": {
     *     "month": {
     *       "amount": "X.XX",
     *       "currency": "USD"
     *     }
     *   }
     * }
     */
    @action("costs")
    costs(_args?: Args): void {
        // Get server details from Azure
        const serverPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${this.definition.server_name}?api-version=${this.apiVersion}`;
        const serverResponse = this.makeAzureRequest("GET", serverPath);

        if (serverResponse.error || !serverResponse.body) {
            // Return zero cost if server doesn't exist
            const result = {
                type: "azure-postgresql-flexible-server",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        const serverData = JSON.parse(serverResponse.body);
        const sku = serverData.sku || {};
        const properties = serverData.properties || {};
        const storage = properties.storage || {};
        const ha = properties.highAvailability || {};

        const skuName = sku.name || this.definition.sku?.name || 'Standard_B1ms';
        const tier = sku.tier || this.definition.sku?.tier || 'Burstable';
        const location = serverData.location || this.definition.location;
        const storageSizeGb = storage.storageSizeGB || this.definition.storage?.storage_size_gb || 32;
        const haMode = ha.mode || 'Disabled';
        const backupConfig = properties.backup as Record<string, unknown> | undefined;
        const backupRetentionDays = (backupConfig?.backupRetentionDays as number) || this.definition.backup?.backup_retention_days || 7;
        const geoRedundantBackup = (backupConfig?.geoRedundantBackup as string) || this.definition.backup?.geo_redundant_backup || 'Disabled';

        // Parse SKU to get vCores and memory
        const skuSpecs = this.parseSkuSpecs(skuName, tier);

        // Get pricing from Azure Retail Prices API (pass SKU name for Burstable tier)
        const pricing = this.getPostgreSQLPricing(location, tier, skuName);

        if (!pricing) {
            // Return error result if pricing is unavailable
            const errorResult = {
                type: "azure-postgresql-flexible-server",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD",
                        error: "Could not fetch pricing from Azure Retail Prices API"
                    }
                }
            };
            cli.output(JSON.stringify(errorResult));
            return;
        }

        // Calculate compute cost
        // Burstable tier is priced per-instance, not per-vCore
        let computeCost: number;
        if (pricing.isBurstable) {
            computeCost = pricing.computePerVCoreHour * 730;
        } else {
            computeCost = skuSpecs.vCores * pricing.computePerVCoreHour * 730;
        }
        
        // Double compute cost for Zone Redundant HA
        if (haMode === 'ZoneRedundant') {
            computeCost *= 2;
        }

        // Calculate storage cost
        const storageCost = storageSizeGb * pricing.storagePerGbMonth;

        // Calculate backup cost using actual retention days from server configuration
        // First backup storage equal to provisioned storage is free
        // Estimate additional backup storage based on retention
        const estimatedBackupGb = Math.max(0, (storageSizeGb * backupRetentionDays / 7) - storageSizeGb);
        let backupCost = estimatedBackupGb * pricing.backupPerGbMonth;
        if (geoRedundantBackup === 'Enabled') {
            backupCost *= 2; // Geo-redundant backup doubles the cost
        }

        // Get network metrics for data transfer cost
        const metrics = this.getPostgreSQLMetrics();
        const egressGb = metrics.networkEgressBytes / (1024 * 1024 * 1024);
        const networkCost = this.calculateEgressCost(egressGb);

        // Total cost
        const totalCost = computeCost + storageCost + backupCost + networkCost;

        // Return in the format expected by Monk billing system
        const result = {
            type: "azure-postgresql-flexible-server",
            costs: {
                month: {
                    amount: totalCost.toFixed(2),
                    currency: "USD"
                }
            }
        };

        cli.output(JSON.stringify(result));
    }

    /**
     * Parse SKU name to extract vCores and memory
     */
    private parseSkuSpecs(skuName: string, tier: string): { vCores: number; memoryGb: number } {
        // Azure PostgreSQL Flexible Server SKU naming:
        // Burstable: Standard_B1ms, Standard_B2s, Standard_B2ms, Standard_B4ms, etc.
        // General Purpose: Standard_D2s_v3, Standard_D4s_v3, Standard_D8s_v3, etc.
        // Memory Optimized: Standard_E2s_v3, Standard_E4s_v3, Standard_E8s_v3, etc.

        const skuLower = skuName.toLowerCase();
        
        // Burstable tier
        if (tier === 'Burstable' || skuLower.includes('_b')) {
            if (skuLower.includes('b1ms')) return { vCores: 1, memoryGb: 2 };
            if (skuLower.includes('b2s')) return { vCores: 2, memoryGb: 4 };
            if (skuLower.includes('b2ms')) return { vCores: 2, memoryGb: 8 };
            if (skuLower.includes('b4ms')) return { vCores: 4, memoryGb: 16 };
            if (skuLower.includes('b8ms')) return { vCores: 8, memoryGb: 32 };
            if (skuLower.includes('b12ms')) return { vCores: 12, memoryGb: 48 };
            if (skuLower.includes('b16ms')) return { vCores: 16, memoryGb: 64 };
            if (skuLower.includes('b20ms')) return { vCores: 20, memoryGb: 80 };
        }

        // General Purpose (D-series) - 4 GB RAM per vCore
        if (tier === 'GeneralPurpose' || skuLower.includes('_d')) {
            const match = skuLower.match(/d(\d+)/);
            if (match) {
                const vCores = parseInt(match[1], 10);
                return { vCores, memoryGb: vCores * 4 };
            }
        }

        // Memory Optimized (E-series) - 8 GB RAM per vCore
        if (tier === 'MemoryOptimized' || skuLower.includes('_e')) {
            const match = skuLower.match(/e(\d+)/);
            if (match) {
                const vCores = parseInt(match[1], 10);
                return { vCores, memoryGb: vCores * 8 };
            }
        }

        // Fail fast for unknown SKU patterns instead of guessing
        throw new Error(`Unknown PostgreSQL SKU: '${skuName}' (tier: ${tier}). Cannot determine vCore/memory specs. Supported patterns: Standard_B{n}ms, Standard_B{n}s, Standard_D{n}s_v{x}, Standard_E{n}s_v{x}`);
    }

    /**
     * Get Azure PostgreSQL pricing from Azure Retail Prices API
     */
    private getPostgreSQLPricing(location: string, tier: string, skuName?: string): {
        computePerVCoreHour: number;
        storagePerGbMonth: number;
        backupPerGbMonth: number;
        source: string;
        isBurstable: boolean;
    } | null {
        try {
            const apiPricing = this.fetchPostgreSQLRetailPrices(location, tier, skuName);
            if (apiPricing) {
                return { ...apiPricing, source: 'Azure Retail Prices API' };
            }
        } catch (error) {
            cli.output(`Warning: Failed to fetch pricing from Azure API: ${(error as Error).message}`);
        }

        return null;
    }

    /**
     * Fetch PostgreSQL pricing from Azure Retail Prices API
     * 
     * Note: Burstable tier is priced per-instance, not per-vCore.
     * General Purpose and Memory Optimized tiers are priced per-vCore.
     */
    private fetchPostgreSQLRetailPrices(location: string, tier: string, skuName?: string): {
        computePerVCoreHour: number;
        storagePerGbMonth: number;
        backupPerGbMonth: number;
        isBurstable: boolean;
    } | null {
        // Azure Retail Prices API is free and doesn't require authentication
        const baseUrl = 'https://prices.azure.com/api/retail/prices';
        
        // Normalize location to armRegionName format (lowercase, no spaces)
        // The API expects lowercase region names like 'eastus', not 'East US'
        const armRegionName = location.toLowerCase().replace(/\s+/g, '');

        // Build filter for PostgreSQL Flexible Server pricing
        const filter = `serviceName eq 'Azure Database for PostgreSQL' and armRegionName eq '${armRegionName}'`;
        const encodedFilter = encodeURIComponent(filter);
        const url = `${baseUrl}?$filter=${encodedFilter}`;

        try {
            // Use http module for external API call
            const response = this.makeExternalRequest(url);
            
            if (!response || !response.Items) {
                return null;
            }

            const items = response.Items as Array<{
                skuName?: string;
                productName?: string;
                meterName?: string;
                unitPrice?: number;
                unitOfMeasure?: string;
            }>;

            let computePerVCoreHour = 0;
            let storagePerGbMonth = 0;
            let backupPerGbMonth = 0;
            const isBurstable = tier.toLowerCase() === 'burstable';

            // Map tier to product name pattern
            const tierPattern = tier.toLowerCase();

            // For Burstable tier, extract SKU suffix (e.g., "B1ms" from "Standard_B1ms")
            let burstableSkuSuffix = '';
            if (isBurstable && skuName) {
                const match = skuName.match(/_(B\d+\w*)/i);
                if (match) {
                    burstableSkuSuffix = match[1].toUpperCase();
                }
            }

            for (const item of items) {
                const productName = (item.productName || '').toLowerCase();
                const meterName = (item.meterName || '').toLowerCase();
                const itemSkuName = (item.skuName || '').toUpperCase();
                const price = item.unitPrice || 0;

                // Skip if not Flexible Server
                if (!productName.includes('flexible')) {
                    continue;
                }

                // Compute pricing - different logic for Burstable vs other tiers
                if (isBurstable) {
                    // Burstable tier: match exact SKU name (e.g., "B1MS")
                    // These are priced per-instance, not per-vCore
                    if (productName.includes('burstable') && burstableSkuSuffix && itemSkuName === burstableSkuSuffix) {
                        // Store as "per instance" price, but we'll return it as computePerVCoreHour
                        // and set isBurstable=true so caller knows not to multiply by vCores
                        computePerVCoreHour = price;
                    }
                } else {
                    // General Purpose and Memory Optimized: priced per vCore
                    if (meterName.includes('vcore') && productName.includes(tierPattern)) {
                        computePerVCoreHour = price;
                    }
                }

                // Storage pricing
                if (meterName.includes('storage') && meterName.includes('data stored')) {
                    storagePerGbMonth = price;
                }

                // Backup pricing
                if (meterName.includes('backup') && meterName.includes('storage')) {
                    backupPerGbMonth = price;
                }
            }

            // Only return if we found compute pricing
            if (computePerVCoreHour > 0) {
                // Fail if storage or backup pricing is missing - do not use hardcoded fallbacks
                if (storagePerGbMonth <= 0 || backupPerGbMonth <= 0) {
                    const missing: string[] = [];
                    if (storagePerGbMonth <= 0) missing.push('storage');
                    if (backupPerGbMonth <= 0) missing.push('backup');
                    throw new Error(`Incomplete PostgreSQL pricing from Azure API: missing rates for ${missing.join(', ')}`);
                }
                return {
                    computePerVCoreHour,
                    storagePerGbMonth,
                    backupPerGbMonth,
                    isBurstable
                };
            }

            return null;
        } catch (error) {
            cli.output(`Error fetching Azure retail prices: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Make an external HTTP request (for Azure Retail Prices API which doesn't need Azure auth)
     */
    private makeExternalRequest(url: string): Record<string, unknown> | null {
        try {
            const response = http.get(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (response.body) {
                return JSON.parse(response.body);
            }
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get metrics from Azure Monitor for PostgreSQL
     */
    private getPostgreSQLMetrics(): {
        cpuPercent: number;
        memoryPercent: number;
        storageUsedBytes: number;
        activeConnections: number;
        networkEgressBytes: number;
        networkIngressBytes: number;
    } {
        const defaultMetrics = {
            cpuPercent: 0,
            memoryPercent: 0,
            storageUsedBytes: 0,
            activeConnections: 0,
            networkEgressBytes: 0,
            networkIngressBytes: 0
        };

        try {
            // Get the time range for last 30 days
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const timespan = `${thirtyDaysAgo.toISOString()}/${now.toISOString()}`;

            // Metrics to fetch
            const metricNames = 'cpu_percent,memory_percent,storage_used,active_connections,network_bytes_egress,network_bytes_ingress';
            
            const metricsPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${this.definition.server_name}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=${metricNames}&timespan=${timespan}&interval=P1D&aggregation=Average,Total`;
            
            const response = this.makeAzureRequest("GET", metricsPath);

            if (response.error || !response.body) {
                return defaultMetrics;
            }

            const data = JSON.parse(response.body);
            const metrics = data.value || [];

            const results = { ...defaultMetrics };

            for (const metric of metrics) {
                const metricName = metric.name?.value;
                const timeseries = metric.timeseries || [];
                
                let total = 0;
                let count = 0;
                let lastValue = 0;
                
                for (const ts of timeseries) {
                    const dataPoints = ts.data || [];
                    for (const point of dataPoints) {
                        if (point.average !== undefined) {
                            total += point.average;
                            count++;
                        }
                        if (point.total !== undefined) {
                            lastValue += point.total;
                        }
                    }
                }

                const average = count > 0 ? total / count : 0;

                switch (metricName) {
                    case 'cpu_percent':
                        results.cpuPercent = average;
                        break;
                    case 'memory_percent':
                        results.memoryPercent = average;
                        break;
                    case 'storage_used':
                        results.storageUsedBytes = lastValue || average;
                        break;
                    case 'active_connections':
                        results.activeConnections = Math.round(average);
                        break;
                    case 'network_bytes_egress':
                        results.networkEgressBytes = lastValue;
                        break;
                    case 'network_bytes_ingress':
                        results.networkIngressBytes = lastValue;
                        break;
                }
            }

            return results;
        } catch (error) {
            cli.output(`Warning: Could not fetch Azure Monitor metrics: ${(error as Error).message}`);
            return defaultMetrics;
        }
    }

    /**
     * Fetch Azure egress pricing tiers from Azure Retail Prices API
     */
    private fetchEgressPricingTiers(): { limit: number; rate: number }[] {
        const baseUrl = 'https://prices.azure.com/api/retail/prices';
        const location = (this.definition.location || 'eastus').toLowerCase().replace(/\s+/g, '');
        const filter = `serviceName eq 'Bandwidth' and armRegionName eq '${location}' and meterName eq 'Standard Data Transfer Out'`;
        const encodedFilter = encodeURIComponent(filter);
        const url = `${baseUrl}?$filter=${encodedFilter}`;

        const response = this.makeExternalRequest(url);
        if (response && response.Items && Array.isArray(response.Items)) {
            const tiers: { limit: number; rate: number }[] = [];
            for (const item of response.Items as Array<{ tierMinimumUnits?: number; unitPrice?: number; unitOfMeasure?: string }>) {
                const price = item.unitPrice || 0;
                if (price > 0) {
                    const tierMin = item.tierMinimumUnits || 0;
                    tiers.push({ limit: tierMin, rate: price });
                }
            }
            if (tiers.length > 0) {
                tiers.sort((a, b) => a.limit - b.limit);
                return tiers;
            }
        }

        throw new Error('Could not retrieve Azure egress pricing from Azure Retail Prices API');
    }

    /**
     * Calculate egress cost with tiered pricing from Azure Retail Prices API
     */
    private calculateEgressCost(egressGb: number): number {
        if (egressGb <= 5) {
            return 0; // First 5 GB free
        }

        const tiers = this.fetchEgressPricingTiers();
        const billableGb = egressGb - 5;
        let cost = 0;
        let remaining = billableGb;

        for (let i = 0; i < tiers.length && remaining > 0; i++) {
            const tierLimit = i + 1 < tiers.length ? (tiers[i + 1].limit - tiers[i].limit) : Infinity;
            const tierGb = Math.min(remaining, tierLimit);
            cost += tierGb * tiers[i].rate;
            remaining -= tierGb;
        }

        return cost;
    }

    /**
     * Format bytes to human-readable string
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}
