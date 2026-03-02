import { AzureStorageEntity, AzureStorageDefinition, AzureStorageState } from "./azure-storage-account-base.ts";
import cli from "cli";
import secret from "secret";
import { action, Args } from "monkec/base";

/**
 * SKU configuration for Storage Account
 */
export interface SkuConfig {
    /**
     * @description Storage account SKU name
     * - Standard_LRS: Locally redundant storage
     * - Standard_GRS: Geo-redundant storage
     * - Standard_RAGRS: Read-access geo-redundant storage
     * - Standard_ZRS: Zone-redundant storage
     * - Premium_LRS: Premium locally redundant storage
     * - Premium_ZRS: Premium zone-redundant storage
     * - Standard_GZRS: Geo-zone-redundant storage
     * - Standard_RAGZRS: Read-access geo-zone-redundant storage
     */
    name: "Standard_LRS" | "Standard_GRS" | "Standard_RAGRS" | "Standard_ZRS" | "Premium_LRS" | "Premium_ZRS" | "Standard_GZRS" | "Standard_RAGZRS";
}

/**
 * Network rule set configuration
 */
export interface NetworkRuleSet {
    /**
     * @description Default action when no rule matches
     * @default "Allow"
     */
    default_action?: "Allow" | "Deny";

    /**
     * @description IP rules for firewall
     */
    ip_rules?: IpRule[];

    /**
     * @description Virtual network rules
     */
    virtual_network_rules?: VirtualNetworkRule[];

    /**
     * @description Bypass options for Azure services
     * @default "AzureServices"
     */
    bypass?: string;
}

/**
 * IP rule for network access
 */
export interface IpRule {
    /**
     * @description IP address or CIDR range
     */
    value: string;

    /**
     * @description Action for this rule
     * @default "Allow"
     */
    action?: "Allow";
}

/**
 * Virtual network rule for network access
 */
export interface VirtualNetworkRule {
    /**
     * @description Full resource ID of the subnet
     */
    id: string;

    /**
     * @description Action for this rule
     * @default "Allow"
     */
    action?: "Allow";
}

/**
 * Encryption configuration for Storage Account
 */
export interface EncryptionConfig {
    /**
     * @description Enable encryption for blob service
     * @default true
     */
    blob_enabled?: boolean;

    /**
     * @description Enable encryption for file service
     * @default true
     */
    file_enabled?: boolean;

    /**
     * @description Enable encryption for table service
     * @default true
     */
    table_enabled?: boolean;

    /**
     * @description Enable encryption for queue service
     * @default true
     */
    queue_enabled?: boolean;

    /**
     * @description Key source for encryption
     * @default "Microsoft.Storage"
     */
    key_source?: "Microsoft.Storage" | "Microsoft.Keyvault";
}

/**
 * Definition interface for Azure Storage Account.
 * Configures storage account properties including SKU, access tier, and network rules.
 * @interface StorageAccountDefinition
 */
export interface StorageAccountDefinition extends AzureStorageDefinition {
    /**
     * @description Storage account name (3-24 chars, lowercase letters and numbers only)
     * @minLength 3
     * @maxLength 24
     * @pattern ^[a-z0-9]+$
     */
    account_name: string;

    /**
     * @description Azure region for the storage account
     */
    location: string;

    /**
     * @description Storage account kind
     * - StorageV2: General-purpose v2 (recommended)
     * - Storage: General-purpose v1
     * - BlobStorage: Blob-only storage
     * - BlockBlobStorage: Premium block blob storage
     * - FileStorage: Premium file storage
     * @default "StorageV2"
     */
    account_kind?: "StorageV2" | "Storage" | "BlobStorage" | "BlockBlobStorage" | "FileStorage";

    /**
     * @description Storage account SKU configuration
     */
    sku: SkuConfig;

    /**
     * @description Access tier for blob storage
     * - Hot: Optimized for frequently accessed data
     * - Cool: Optimized for infrequently accessed data
     * - Premium: Premium performance tier (only for Premium SKUs)
     * @default "Hot"
     */
    access_tier?: "Hot" | "Cool" | "Premium";

    /**
     * @description Enable hierarchical namespace (Data Lake Storage Gen2)
     * @default false
     */
    enable_hns?: boolean;

    /**
     * @description Minimum TLS version for secure connections
     * @default "TLS1_2"
     */
    minimum_tls_version?: "TLS1_0" | "TLS1_1" | "TLS1_2";

    /**
     * @description Allow public access to blobs
     * @default false
     */
    allow_blob_public_access?: boolean;

    /**
     * @description Allow shared key access
     * @default true
     */
    allow_shared_key_access?: boolean;

    /**
     * @description Enable HTTPS traffic only
     * @default true
     */
    https_only?: boolean;

    /**
     * @description Network rule set configuration
     */
    network_rule_set?: NetworkRuleSet;

    /**
     * @description Encryption configuration
     */
    encryption?: EncryptionConfig;

    /**
     * @description Tags for the resource
     */
    tags?: Record<string, string>;

    /**
     * @description Secret reference for primary access key
     * If provided, the primary key will be saved to this secret on account creation
     */
    primary_key_secret_ref?: string;

    /**
     * @description Secret reference for secondary access key
     * If provided, the secondary key will be saved to this secret on account creation
     */
    secondary_key_secret_ref?: string;

    /**
     * @description Secret reference for primary connection string
     * If provided, the primary connection string will be saved to this secret
     */
    connection_string_secret_ref?: string;
}

/**
 * State interface for Azure Storage Account.
 * Contains runtime information about the created storage account.
 * @interface StorageAccountState
 */
export interface StorageAccountState extends AzureStorageState {
    /**
     * @description Storage account name (primary identifier)
     */
    account_name?: string;

    /**
     * @description Primary blob endpoint URL
     */
    primary_blob_endpoint?: string;

    /**
     * @description Primary file endpoint URL
     */
    primary_file_endpoint?: string;

    /**
     * @description Primary queue endpoint URL
     */
    primary_queue_endpoint?: string;

    /**
     * @description Primary table endpoint URL
     */
    primary_table_endpoint?: string;

    /**
     * @description Primary Data Lake Storage endpoint URL
     */
    primary_dfs_endpoint?: string;

    /**
     * @description Primary web endpoint URL
     */
    primary_web_endpoint?: string;

    /**
     * @description Storage account location
     */
    location?: string;

    /**
     * @description Whether secrets have been populated (to avoid duplicate attempts)
     */
    secrets_populated?: boolean;
}

/**
 * @description Azure Storage Account entity.
 * Creates and manages Azure Storage Accounts for blob, file, queue, and table storage.
 * Supports various redundancy options, access tiers, and network security configurations.
 * 
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: secret names from `primary_key_secret_ref`, `secondary_key_secret_ref`, `connection_string_secret_ref` properties - Account keys and connection string (if specified)
 * 
 * ## State Fields for Composition
 * - `state.account_name` - Storage account name
 * - `state.primary_blob_endpoint` - Primary blob service endpoint URL
 * - `state.primary_file_endpoint` - Primary file service endpoint URL
 * - `state.primary_queue_endpoint` - Primary queue service endpoint URL
 * - `state.primary_table_endpoint` - Primary table service endpoint URL
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `azure-storage-account/blob-container` - Create blob containers within the storage account
 */
export class StorageAccount extends AzureStorageEntity<StorageAccountDefinition, StorageAccountState> {

    protected getEntityName(): string {
        return this.definition.account_name;
    }

    protected getResourceType(): string {
        return "storageAccounts";
    }

    /** Create a new Azure Storage Account */
    override create(): void {
        // Check if account already exists
        const existingAccount = this.checkResourceExists(this.definition.account_name);

        if (existingAccount) {
            // Account already exists, use it
            const properties = existingAccount.properties as Record<string, unknown> | undefined;
            const provisioningState = typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined;
            const primaryEndpoints = properties?.primaryEndpoints as Record<string, string> | undefined;
            
            this.state = {
                account_name: typeof existingAccount.name === 'string' ? existingAccount.name : this.definition.account_name,
                provisioning_state: provisioningState,
                location: typeof existingAccount.location === 'string' ? existingAccount.location : undefined,
                primary_blob_endpoint: primaryEndpoints?.blob,
                primary_file_endpoint: primaryEndpoints?.file,
                primary_queue_endpoint: primaryEndpoints?.queue,
                primary_table_endpoint: primaryEndpoints?.table,
                primary_dfs_endpoint: primaryEndpoints?.dfs,
                primary_web_endpoint: primaryEndpoints?.web,
                existing: true
            };
            cli.output(`✅ Storage account ${this.definition.account_name} already exists`);
            
            // If existing account is ready, populate secrets immediately
            if (provisioningState === "Succeeded") {
                cli.output(`🔑 Existing account is ready, attempting to populate secrets...`);
                this.populateAccountSecrets();
                this.state.secrets_populated = true;
            }
            return;
        }

        // Skip creation if create_when_missing is false and resource doesn't exist
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Storage account ${this.definition.account_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body for account creation
        const body: {
            kind: string;
            location: string;
            sku: { name: string };
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            kind: this.definition.account_kind || "StorageV2",
            location: this.definition.location,
            sku: {
                name: this.definition.sku.name
            },
            properties: {}
        };

        // Add optional properties
        if (this.definition.access_tier !== undefined) {
            body.properties.accessTier = this.definition.access_tier;
        }

        if (this.definition.enable_hns !== undefined) {
            body.properties.isHnsEnabled = this.definition.enable_hns;
        }

        if (this.definition.minimum_tls_version !== undefined) {
            body.properties.minimumTlsVersion = this.definition.minimum_tls_version;
        }

        if (this.definition.allow_blob_public_access !== undefined) {
            body.properties.allowBlobPublicAccess = this.definition.allow_blob_public_access;
        }

        if (this.definition.allow_shared_key_access !== undefined) {
            body.properties.allowSharedKeyAccess = this.definition.allow_shared_key_access;
        }

        if (this.definition.https_only !== undefined) {
            body.properties.supportsHttpsTrafficOnly = this.definition.https_only;
        }

        // Add network rule set if specified
        if (this.definition.network_rule_set) {
            const networkRuleSet: Record<string, unknown> = {
                defaultAction: this.definition.network_rule_set.default_action || "Allow"
            };

            if (this.definition.network_rule_set.bypass) {
                networkRuleSet.bypass = this.definition.network_rule_set.bypass;
            }

            if (this.definition.network_rule_set.ip_rules) {
                networkRuleSet.ipRules = this.definition.network_rule_set.ip_rules.map(rule => ({
                    value: rule.value,
                    action: rule.action || "Allow"
                }));
            }

            if (this.definition.network_rule_set.virtual_network_rules) {
                networkRuleSet.virtualNetworkRules = this.definition.network_rule_set.virtual_network_rules.map(rule => ({
                    id: rule.id,
                    action: rule.action || "Allow"
                }));
            }

            body.properties.networkAcls = networkRuleSet;
        }

        // Add encryption configuration if specified
        if (this.definition.encryption) {
            const encryption: Record<string, unknown> = {
                services: {
                    blob: { enabled: this.definition.encryption.blob_enabled !== false },
                    file: { enabled: this.definition.encryption.file_enabled !== false },
                    table: { enabled: this.definition.encryption.table_enabled !== false },
                    queue: { enabled: this.definition.encryption.queue_enabled !== false }
                },
                keySource: this.definition.encryption.key_source || "Microsoft.Storage"
            };
            body.properties.encryption = encryption;
        }

        if (this.definition.tags) {
            body.tags = this.definition.tags;
        }

        // Create the account
        const path = this.buildResourcePath(this.definition.account_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create storage account: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Set state from created account
        const properties = responseData?.properties as Record<string, unknown> | undefined;
        const primaryEndpoints = properties?.primaryEndpoints as Record<string, string> | undefined;
        
        this.state = {
            account_name: this.definition.account_name,
            provisioning_state: typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined,
            location: this.definition.location,
            primary_blob_endpoint: primaryEndpoints?.blob,
            primary_file_endpoint: primaryEndpoints?.file,
            primary_queue_endpoint: primaryEndpoints?.queue,
            primary_table_endpoint: primaryEndpoints?.table,
            primary_dfs_endpoint: primaryEndpoints?.dfs,
            primary_web_endpoint: primaryEndpoints?.web,
            existing: false
        };

        cli.output(`✅ Created Azure Storage account: ${this.definition.account_name}`);
    }

    override update(): void {
        if (!this.state.account_name) {
            this.create();
            return;
        }

        // Prepare update body - only include modifiable properties
        const body: {
            sku?: { name: string };
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            properties: {}
        };

        let hasChanges = false;

        // Update access tier if provided
        if (this.definition.access_tier !== undefined) {
            body.properties.accessTier = this.definition.access_tier;
            hasChanges = true;
        }

        // Update minimum TLS version if provided
        if (this.definition.minimum_tls_version !== undefined) {
            body.properties.minimumTlsVersion = this.definition.minimum_tls_version;
            hasChanges = true;
        }

        // Update blob public access if provided
        if (this.definition.allow_blob_public_access !== undefined) {
            body.properties.allowBlobPublicAccess = this.definition.allow_blob_public_access;
            hasChanges = true;
        }

        // Update shared key access if provided
        if (this.definition.allow_shared_key_access !== undefined) {
            body.properties.allowSharedKeyAccess = this.definition.allow_shared_key_access;
            hasChanges = true;
        }

        // Update HTTPS only if provided
        if (this.definition.https_only !== undefined) {
            body.properties.supportsHttpsTrafficOnly = this.definition.https_only;
            hasChanges = true;
        }

        // Update network rules if provided
        if (this.definition.network_rule_set) {
            const networkRuleSet: Record<string, unknown> = {
                defaultAction: this.definition.network_rule_set.default_action || "Allow"
            };

            if (this.definition.network_rule_set.bypass) {
                networkRuleSet.bypass = this.definition.network_rule_set.bypass;
            }

            if (this.definition.network_rule_set.ip_rules) {
                networkRuleSet.ipRules = this.definition.network_rule_set.ip_rules.map(rule => ({
                    value: rule.value,
                    action: rule.action || "Allow"
                }));
            }

            if (this.definition.network_rule_set.virtual_network_rules) {
                networkRuleSet.virtualNetworkRules = this.definition.network_rule_set.virtual_network_rules.map(rule => ({
                    id: rule.id,
                    action: rule.action || "Allow"
                }));
            }

            body.properties.networkAcls = networkRuleSet;
            hasChanges = true;
        }

        // Update tags
        if (this.definition.tags) {
            body.tags = this.definition.tags;
            hasChanges = true;
        }

        // Skip update if nothing has changed
        if (!hasChanges) {
            cli.output(`ℹ️  No changes detected for storage account: ${this.definition.account_name}`);
            return;
        }

        const path = this.buildResourcePath(this.definition.account_name);
        const response = this.makeAzureRequest("PATCH", path, body);

        if (response.error) {
            throw new Error(`Failed to update storage account: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Update state
        if (responseData) {
            const properties = responseData.properties as Record<string, unknown> | undefined;
            const primaryEndpoints = properties?.primaryEndpoints as Record<string, string> | undefined;
            
            this.state.provisioning_state = typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined;
            this.state.primary_blob_endpoint = primaryEndpoints?.blob;
            this.state.primary_file_endpoint = primaryEndpoints?.file;
            this.state.primary_queue_endpoint = primaryEndpoints?.queue;
            this.state.primary_table_endpoint = primaryEndpoints?.table;
            this.state.primary_dfs_endpoint = primaryEndpoints?.dfs;
            this.state.primary_web_endpoint = primaryEndpoints?.web;
        }

        cli.output(`✅ Updated Azure Storage account: ${this.definition.account_name}`);
    }

    override delete(): void {
        if (!this.state.account_name) {
            cli.output("Storage account does not exist, nothing to delete");
            return;
        }

        this.deleteResource(this.definition.account_name);
    }

    override checkReadiness(): boolean {
        // If create_when_missing is false and resource doesn't exist, consider it ready
        // Check this first before checking state.account_name since state may only have { existing: false }
        if (this.definition.create_when_missing === false && this.state.existing === false) {
            cli.output(`✅ Storage account ${this.definition.account_name} not created (create_when_missing is false)`);
            return true;
        }

        if (!this.state.account_name) {
            cli.output(`⏳ Storage account not yet created`);
            return false;
        }

        try {
            // Check if account exists and is ready
            const account = this.checkResourceExists(this.definition.account_name);
            
            if (!account) {
                cli.output(`⏳ Storage account ${this.definition.account_name} not found`);
                return false;
            }

            const properties = account.properties as Record<string, unknown> | undefined;
            const provisioningState = typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined;
            const isReady = provisioningState === "Succeeded";
            
            if (isReady) {
                cli.output(`✅ Storage account ${this.definition.account_name} is ready (status: ${provisioningState})`);
                
                // Update state with current information
                const primaryEndpoints = properties?.primaryEndpoints as Record<string, string> | undefined;
                this.state.provisioning_state = provisioningState;
                this.state.primary_blob_endpoint = primaryEndpoints?.blob;
                this.state.primary_file_endpoint = primaryEndpoints?.file;
                this.state.primary_queue_endpoint = primaryEndpoints?.queue;
                this.state.primary_table_endpoint = primaryEndpoints?.table;
                this.state.primary_dfs_endpoint = primaryEndpoints?.dfs;
                this.state.primary_web_endpoint = primaryEndpoints?.web;
                
                // Populate secrets when account is ready (only once)
                if (!this.state.secrets_populated) {
                    cli.output(`🔑 Account is ready, attempting to populate secrets...`);
                    this.populateAccountSecrets();
                    this.state.secrets_populated = true;
                }
            } else {
                cli.output(`⏳ Storage account ${this.definition.account_name} not ready yet (status: ${provisioningState || 'unknown'})`);
            }
            
            return isReady;
        } catch (error) {
            cli.output(`⚠️  Failed to check storage account readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { 
        return this.checkReadiness(); 
    }

    /**
     * Populate secrets with account credentials if secret references are provided
     */
    private populateAccountSecrets(): void {
        // Check if any secret references are provided
        if (!this.definition.primary_key_secret_ref && 
            !this.definition.secondary_key_secret_ref &&
            !this.definition.connection_string_secret_ref) {
            return; // No secrets to populate
        }

        try {
            // Fetch access keys
            const keysPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.account_name}/listKeys?api-version=${this.apiVersion}`;
            const keysResponse = this.makeAzureRequest("POST", keysPath);

            if (keysResponse.error) {
                cli.output(`⚠️  Failed to retrieve access keys: ${keysResponse.error}`);
                return;
            }

            const keysData = this.parseResponseBody(keysResponse) as Record<string, unknown> | null;
            const keys = keysData?.keys as Array<{ keyName: string; value: string }> | undefined;
            
            if (keys && keys.length > 0) {
                const primaryKey = keys.find(k => k.keyName === 'key1')?.value || keys[0]?.value;
                const secondaryKey = keys.find(k => k.keyName === 'key2')?.value || keys[1]?.value;

                // Save primary key if reference is provided
                if (this.definition.primary_key_secret_ref && primaryKey) {
                    try {
                        secret.set(this.definition.primary_key_secret_ref, primaryKey);
                        cli.output(`🔑 Saved primary key to secret: ${this.definition.primary_key_secret_ref}`);
                    } catch (error) {
                        cli.output(`⚠️  Failed to save primary key to secret: ${this.definition.primary_key_secret_ref}`);
                    }
                }

                // Save secondary key if reference is provided
                if (this.definition.secondary_key_secret_ref && secondaryKey) {
                    try {
                        secret.set(this.definition.secondary_key_secret_ref, secondaryKey);
                        cli.output(`🔑 Saved secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                    } catch (error) {
                        cli.output(`⚠️  Failed to save secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                    }
                }

                // Save connection string if reference is provided
                if (this.definition.connection_string_secret_ref && primaryKey) {
                    try {
                        const connectionString = `DefaultEndpointsProtocol=https;AccountName=${this.definition.account_name};AccountKey=${primaryKey};EndpointSuffix=core.windows.net`;
                        secret.set(this.definition.connection_string_secret_ref, connectionString);
                        cli.output(`🔑 Saved connection string to secret: ${this.definition.connection_string_secret_ref}`);
                    } catch (error) {
                        cli.output(`⚠️  Failed to save connection string to secret: ${this.definition.connection_string_secret_ref}`);
                    }
                }
            } else {
                cli.output(`⚠️  No keys data received from Azure API`);
            }
        } catch (error) {
            cli.output(`⚠️  Failed to fetch access keys from Azure: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // ========================================
    // Custom Actions
    // ========================================

    /**
     * Get detailed information about the storage account
     * 
     * Usage:
     *   monk do namespace/storage-account get-info
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Storage Account Information`);
        cli.output(`==================================================`);

        if (!this.state.account_name) {
            throw new Error("Storage account does not exist. Create the account first.");
        }

        try {
            const account = this.checkResourceExists(this.definition.account_name);
            
            if (!account) {
                throw new Error(`Storage account ${this.definition.account_name} not found`);
            }

            const properties = account.properties as Record<string, unknown> | undefined;
            const sku = account.sku as Record<string, unknown> | undefined;
            const primaryEndpoints = properties?.primaryEndpoints as Record<string, string> | undefined;

            cli.output(`\n📋 Basic Information:`);
            cli.output(`   Name: ${account.name}`);
            cli.output(`   Location: ${account.location}`);
            cli.output(`   Kind: ${account.kind}`);
            cli.output(`   SKU: ${sku?.name}`);
            cli.output(`   Provisioning State: ${properties?.provisioningState}`);
            cli.output(`   Creation Time: ${properties?.creationTime}`);

            cli.output(`\n🔗 Endpoints:`);
            if (primaryEndpoints?.blob) cli.output(`   Blob: ${primaryEndpoints.blob}`);
            if (primaryEndpoints?.file) cli.output(`   File: ${primaryEndpoints.file}`);
            if (primaryEndpoints?.queue) cli.output(`   Queue: ${primaryEndpoints.queue}`);
            if (primaryEndpoints?.table) cli.output(`   Table: ${primaryEndpoints.table}`);
            if (primaryEndpoints?.dfs) cli.output(`   Data Lake: ${primaryEndpoints.dfs}`);
            if (primaryEndpoints?.web) cli.output(`   Web: ${primaryEndpoints.web}`);

            cli.output(`\n🔒 Security Settings:`);
            cli.output(`   HTTPS Only: ${properties?.supportsHttpsTrafficOnly}`);
            cli.output(`   Minimum TLS Version: ${properties?.minimumTlsVersion}`);
            cli.output(`   Allow Blob Public Access: ${properties?.allowBlobPublicAccess}`);
            cli.output(`   Allow Shared Key Access: ${properties?.allowSharedKeyAccess}`);

            const networkAcls = properties?.networkAcls as Record<string, unknown> | undefined;
            if (networkAcls) {
                cli.output(`\n🌐 Network Rules:`);
                cli.output(`   Default Action: ${networkAcls.defaultAction}`);
                cli.output(`   Bypass: ${networkAcls.bypass}`);
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get storage account info`);
            throw new Error(`Get info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Regenerate storage account access keys
     * 
     * Usage:
     *   monk do namespace/storage-account regenerate-key key_name="key1"
     * 
     * @param args Required arguments:
     *   - key_name: The key to regenerate ("key1" or "key2")
     */
    @action("regenerate-key")
    regenerateKey(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🔄 Regenerate Access Key`);
        cli.output(`==================================================`);

        if (!this.state.account_name) {
            throw new Error("Storage account does not exist. Create the account first.");
        }

        const keyName = args?.key_name as string | undefined;
        if (!keyName || (keyName !== "key1" && keyName !== "key2")) {
            throw new Error(
                "Required argument 'key_name' not provided or invalid.\n" +
                "Usage: monk do namespace/storage-account regenerate-key key_name=\"key1\"\n" +
                "Valid values: key1, key2"
            );
        }

        try {
            const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.account_name}/regenerateKey?api-version=${this.apiVersion}`;
            const body = { keyName };
            
            const response = this.makeAzureRequest("POST", path, body);

            if (response.error) {
                throw new Error(`API error: ${response.error}, body: ${response.body}`);
            }

            cli.output(`\n✅ Successfully regenerated ${keyName}`);
            cli.output(`\n⚠️  Note: Update any applications using the old key.`);
            
            // Re-populate secrets with new keys
            if (this.definition.primary_key_secret_ref || 
                this.definition.secondary_key_secret_ref ||
                this.definition.connection_string_secret_ref) {
                cli.output(`\n🔑 Updating secrets with new keys...`);
                this.state.secrets_populated = false;
                this.populateAccountSecrets();
                this.state.secrets_populated = true;
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to regenerate key`);
            throw new Error(`Regenerate key failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List blob containers in the storage account
     * 
     * Usage:
     *   monk do namespace/storage-account list-containers
     */
    @action("list-containers")
    listContainers(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📋 Blob Containers`);
        cli.output(`==================================================`);

        if (!this.state.account_name) {
            throw new Error("Storage account does not exist. Create the account first.");
        }

        try {
            const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.account_name}/blobServices/default/containers?api-version=${this.apiVersion}`;
            
            const response = this.makeAzureRequest("GET", path);

            if (response.error) {
                throw new Error(`API error: ${response.error}, body: ${response.body}`);
            }

            const data = this.parseResponseBody(response) as Record<string, unknown> | null;
            const containers = data?.value as unknown[] | undefined;

            if (!containers || containers.length === 0) {
                cli.output(`\nNo blob containers found.`);
                cli.output(`\n==================================================`);
                return;
            }

            cli.output(`\nFound ${containers.length} container(s):\n`);

            for (let i = 0; i < containers.length; i++) {
                const container = containers[i] as Record<string, unknown>;
                const props = container.properties as Record<string, unknown> | undefined;
                
                cli.output(`📁 Container #${i + 1}`);
                cli.output(`   Name: ${container.name}`);
                cli.output(`   Public Access: ${props?.publicAccess || 'None'}`);
                cli.output(`   Last Modified: ${props?.lastModifiedTime || 'N/A'}`);
                cli.output(`   Lease State: ${props?.leaseState || 'N/A'}`);
                cli.output(``);
            }

            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to list containers`);
            throw new Error(`List containers failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
