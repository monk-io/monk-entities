import { AzurePostgreSQLEntity, AzurePostgreSQLDefinition, AzurePostgreSQLState } from "./azure-postgresql-base.ts";
import cli from "cli";
import secret from "secret";
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
        if (!this.state.server_name) {
            cli.output("PostgreSQL Flexible Server does not exist, nothing to delete");
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
        if (this.definition.vnet_integration) {
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
}
