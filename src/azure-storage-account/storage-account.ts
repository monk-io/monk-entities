import { AzureStorageEntity, AzureStorageDefinition, AzureStorageState } from "./azure-storage-account-base.ts";
import cli from "cli";
import secret from "secret";
import http from "http";
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
            this.state.secrets_populated = true;
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
                        return;
                    }
                }

                // Save secondary key if reference is provided
                if (this.definition.secondary_key_secret_ref && secondaryKey) {
                    try {
                        secret.set(this.definition.secondary_key_secret_ref, secondaryKey);
                        cli.output(`🔑 Saved secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                    } catch (error) {
                        cli.output(`⚠️  Failed to save secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                        return;
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
                        return;
                    }
                }

                // Only mark as populated after all secrets are successfully saved
                this.state.secrets_populated = true;
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

    // =========================================================================
    // Cost Estimation
    // =========================================================================

    /**
     * Get estimated monthly cost for this Azure Storage Account
     * 
     * Calculates costs based on:
     * - Storage capacity by access tier (Hot, Cool, Archive)
     * - Operations (read, write, list, etc.)
     * - Data transfer (egress)
     * - Redundancy type (LRS, GRS, ZRS, etc.)
     * 
     * Uses Azure Retail Prices API (free, no authentication required)
     * 
     * Usage:
     *   monk do namespace/storage-account get-cost-estimate
     * 
     * Required permissions:
     * - Microsoft.Storage/storageAccounts/read
     * - Microsoft.Insights/metrics/read (for Azure Monitor metrics)
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`💰 Cost Estimate for Azure Storage Account`);
        cli.output(`Account: ${this.definition.account_name}`);
        cli.output(`==================================================`);

        // Get storage account details
        const account = this.checkResourceExists(this.definition.account_name);
        if (!account) {
            throw new Error(`Storage account ${this.definition.account_name} not found`);
        }

        const properties = account.properties as Record<string, unknown> | undefined;
        const sku = account.sku as Record<string, unknown> | undefined;
        const skuName = (sku?.name as string) || this.definition.sku.name;
        const accessTier = (properties?.accessTier as string) || this.definition.access_tier || 'Hot';
        const location = (account.location as string) || this.definition.location;
        const accountKind = (account.kind as string) || this.definition.account_kind || 'StorageV2';

        cli.output(`\n📊 Account Configuration:`);
        cli.output(`   Location: ${location}`);
        cli.output(`   SKU: ${skuName}`);
        cli.output(`   Kind: ${accountKind}`);
        cli.output(`   Access Tier: ${accessTier}`);

        // Get storage statistics
        const storageStats = this.getStorageStatistics();

        cli.output(`\n📦 Storage Statistics:`);
        cli.output(`   Total Containers: ${storageStats.containerCount}`);
        cli.output(`   Total Blobs: ${storageStats.blobCount}`);
        cli.output(`   Total Size: ${this.formatBytes(storageStats.totalBytes)}`);

        // Get pricing from Azure Retail Prices API
        const pricing = this.getAzureStoragePricing(location, skuName, accessTier);

        if (!pricing) {
            cli.output(`\n❌ Error: Could not fetch pricing from Azure Retail Prices API`);
            cli.output(`   Location: ${location}`);
            cli.output(`   SKU: ${skuName}`);
            cli.output(`   Access Tier: ${accessTier}`);
            cli.output(`\nPlease check that the Azure Retail Prices API is accessible.`);
            return;
        }

        // Get Azure Monitor metrics for operations and egress
        const metrics = this.getAzureMonitorMetrics();

        // Calculate storage costs
        const storageGb = storageStats.totalBytes / (1024 * 1024 * 1024);
        const storageCost = storageGb * pricing.storagePerGb;

        // Calculate operations costs
        const writeOps = metrics.writeOperations;
        const readOps = metrics.readOperations;
        const listOps = metrics.listOperations;
        const writeOpsCost = (writeOps / 10000) * pricing.writeOperationsPer10k;
        const readOpsCost = (readOps / 10000) * pricing.readOperationsPer10k;
        const listOpsCost = (listOps / 10000) * pricing.listOperationsPer10k;
        const operationsCost = writeOpsCost + readOpsCost + listOpsCost;

        // Calculate data transfer costs (egress)
        const egressGb = metrics.egressBytes / (1024 * 1024 * 1024);
        const networkCost = this.calculateEgressCost(egressGb);

        // Calculate data retrieval costs (for Cool/Archive tiers)
        let retrievalCost = 0;
        if (accessTier === 'Cool' || accessTier === 'Archive') {
            const retrievalGb = metrics.retrievalBytes / (1024 * 1024 * 1024);
            retrievalCost = retrievalGb * pricing.dataRetrievalPerGb;
        }

        // Total cost
        const totalCost = storageCost + operationsCost + networkCost + retrievalCost;

        cli.output(`\n💵 Cost Breakdown (Monthly):`);
        cli.output(`   Storage: $${storageCost.toFixed(2)}`);
        cli.output(`      └─ ${storageGb.toFixed(2)} GB × $${pricing.storagePerGb.toFixed(4)}/GB = $${storageCost.toFixed(2)}`);
        cli.output(`   Operations: $${operationsCost.toFixed(2)}`);
        cli.output(`      └─ Write: ${writeOps.toLocaleString()} ops × $${pricing.writeOperationsPer10k.toFixed(4)}/10k = $${writeOpsCost.toFixed(2)}`);
        cli.output(`      └─ Read: ${readOps.toLocaleString()} ops × $${pricing.readOperationsPer10k.toFixed(4)}/10k = $${readOpsCost.toFixed(2)}`);
        cli.output(`      └─ List: ${listOps.toLocaleString()} ops × $${pricing.listOperationsPer10k.toFixed(4)}/10k = $${listOpsCost.toFixed(2)}`);
        cli.output(`   Network Egress: $${networkCost.toFixed(2)}`);
        cli.output(`      └─ ${egressGb.toFixed(2)} GB egress`);
        if (retrievalCost > 0) {
            cli.output(`   Data Retrieval: $${retrievalCost.toFixed(2)}`);
        }
        cli.output(`   ─────────────────────────────`);
        cli.output(`   TOTAL: $${totalCost.toFixed(2)}/month`);

        cli.output(`\n📈 Azure Monitor Metrics (last 30 days):`);
        cli.output(`   Write Operations: ${writeOps.toLocaleString()}`);
        cli.output(`   Read Operations: ${readOps.toLocaleString()}`);
        cli.output(`   List Operations: ${listOps.toLocaleString()}`);
        cli.output(`   Egress: ${this.formatBytes(metrics.egressBytes)}`);
        cli.output(`   Ingress: ${this.formatBytes(metrics.ingressBytes)}`);

        // Output JSON summary
        const summary = {
            account: {
                name: this.definition.account_name,
                subscription_id: this.definition.subscription_id,
                resource_group: this.definition.resource_group_name,
                location: location,
                sku: skuName,
                kind: accountKind,
                access_tier: accessTier
            },
            storage_statistics: {
                container_count: storageStats.containerCount,
                blob_count: storageStats.blobCount,
                total_bytes: storageStats.totalBytes,
                total_gb: parseFloat(storageGb.toFixed(2))
            },
            pricing_rates: {
                source: pricing.source,
                currency: 'USD',
                storage_per_gb_month: pricing.storagePerGb,
                write_operations_per_10k: pricing.writeOperationsPer10k,
                read_operations_per_10k: pricing.readOperationsPer10k,
                list_operations_per_10k: pricing.listOperationsPer10k,
                data_retrieval_per_gb: pricing.dataRetrievalPerGb
            },
            cost_breakdown: {
                storage_monthly: parseFloat(storageCost.toFixed(2)),
                operations_monthly: parseFloat(operationsCost.toFixed(2)),
                network_monthly: parseFloat(networkCost.toFixed(2)),
                retrieval_monthly: parseFloat(retrievalCost.toFixed(2)),
                total_monthly: parseFloat(totalCost.toFixed(2))
            },
            metrics: {
                period_days: 30,
                write_operations: writeOps,
                read_operations: readOps,
                list_operations: listOps,
                egress_bytes: metrics.egressBytes,
                ingress_bytes: metrics.ingressBytes
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
     *   "type": "azure-storage-account",
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
        // Get storage account details
        const account = this.checkResourceExists(this.definition.account_name);
        if (!account) {
            // Return zero cost if account doesn't exist
            const result = {
                type: "azure-storage-account",
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

        const properties = account.properties as Record<string, unknown> | undefined;
        const sku = account.sku as Record<string, unknown> | undefined;
        const skuName = (sku?.name as string) || this.definition.sku.name;
        const accessTier = (properties?.accessTier as string) || this.definition.access_tier || 'Hot';
        const location = (account.location as string) || this.definition.location;

        // Get storage statistics
        const storageStats = this.getStorageStatistics();

        // Get pricing from Azure Retail Prices API
        const pricing = this.getAzureStoragePricing(location, skuName, accessTier);

        if (!pricing) {
            // Return error result if pricing is unavailable
            const errorResult = {
                type: "azure-storage-account",
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

        // Get Azure Monitor metrics for operations and egress
        const metrics = this.getAzureMonitorMetrics();

        // Calculate storage costs
        const storageGb = storageStats.totalBytes / (1024 * 1024 * 1024);
        const storageCost = storageGb * pricing.storagePerGb;

        // Calculate operations costs
        const writeOps = metrics.writeOperations;
        const readOps = metrics.readOperations;
        const listOps = metrics.listOperations;
        const writeOpsCost = (writeOps / 10000) * pricing.writeOperationsPer10k;
        const readOpsCost = (readOps / 10000) * pricing.readOperationsPer10k;
        const listOpsCost = (listOps / 10000) * pricing.listOperationsPer10k;
        const operationsCost = writeOpsCost + readOpsCost + listOpsCost;

        // Calculate data transfer costs (egress)
        const egressGb = metrics.egressBytes / (1024 * 1024 * 1024);
        const networkCost = this.calculateEgressCost(egressGb);

        // Calculate data retrieval costs (for Cool/Archive tiers)
        let retrievalCost = 0;
        if (accessTier === 'Cool' || accessTier === 'Archive') {
            const retrievalGb = metrics.retrievalBytes / (1024 * 1024 * 1024);
            retrievalCost = retrievalGb * pricing.dataRetrievalPerGb;
        }

        // Total cost
        const totalCost = storageCost + operationsCost + networkCost + retrievalCost;

        // Return in the format expected by Monk billing system
        const result = {
            type: "azure-storage-account",
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
     * Get storage statistics by listing containers and blobs
     */
    private getStorageStatistics(): {
        containerCount: number;
        blobCount: number;
        totalBytes: number;
    } {
        const stats = {
            containerCount: 0,
            blobCount: 0,
            totalBytes: 0
        };

        try {
            // List containers
            const containersPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.account_name}/blobServices/default/containers?api-version=${this.apiVersion}`;
            const containersResponse = this.makeAzureRequest("GET", containersPath);

            if (!containersResponse.error && containersResponse.body) {
                const containersData = JSON.parse(containersResponse.body);
                const containers = containersData.value || [];
                stats.containerCount = containers.length;

                // Note: Azure Management API doesn't provide blob-level listing
                // For accurate blob counts and sizes, you would need to use the Storage Data Plane API
                // which requires storage account keys. For now, we estimate from metrics.
            }
        } catch (error) {
            cli.output(`Warning: Could not get storage statistics: ${(error as Error).message}`);
        }

        // Try to get used capacity from metrics
        try {
            const metricsPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.account_name}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=UsedCapacity&timespan=PT1H&interval=PT1H`;
            const metricsResponse = this.makeAzureRequest("GET", metricsPath);

            if (!metricsResponse.error && metricsResponse.body) {
                const metricsData = JSON.parse(metricsResponse.body);
                const metrics = metricsData.value || [];
                
                for (const metric of metrics) {
                    if (metric.name?.value === 'UsedCapacity') {
                        const timeseries = metric.timeseries || [];
                        if (timeseries.length > 0) {
                            const data = timeseries[0].data || [];
                            if (data.length > 0) {
                                // Get the most recent value
                                const latestValue = data[data.length - 1];
                                stats.totalBytes = latestValue.average || latestValue.total || 0;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            cli.output(`Warning: Could not get capacity metrics: ${(error as Error).message}`);
        }

        return stats;
    }

    /**
     * Get Azure Storage pricing from Azure Retail Prices API
     */
    private getAzureStoragePricing(location: string, skuName: string, accessTier: string): {
        storagePerGb: number;
        writeOperationsPer10k: number;
        readOperationsPer10k: number;
        listOperationsPer10k: number;
        dataRetrievalPerGb: number;
        source: string;
    } | null {
        try {
            const apiPricing = this.fetchAzureRetailPrices(location, skuName, accessTier);
            if (apiPricing) {
                return { ...apiPricing, source: 'Azure Retail Prices API' };
            }
        } catch (error) {
            cli.output(`Warning: Failed to fetch pricing from Azure API: ${(error as Error).message}`);
        }

        return null;
    }

    /**
     * Fetch pricing from Azure Retail Prices API
     */
    private fetchAzureRetailPrices(location: string, skuName: string, accessTier: string): {
        storagePerGb: number;
        writeOperationsPer10k: number;
        readOperationsPer10k: number;
        listOperationsPer10k: number;
        dataRetrievalPerGb: number;
    } | null {
        // Azure Retail Prices API is free and doesn't require authentication
        const baseUrl = 'https://prices.azure.com/api/retail/prices';
        
        // Normalize location to armRegionName format (lowercase, no spaces)
        // The API expects lowercase region names like 'eastus', not 'East US'
        const armRegionName = location.toLowerCase().replace(/\s+/g, '');

        // Determine redundancy type from SKU
        let redundancy = 'LRS';
        if (skuName.includes('GRS')) redundancy = 'GRS';
        else if (skuName.includes('RAGRS')) redundancy = 'RA-GRS';
        else if (skuName.includes('ZRS')) redundancy = 'ZRS';
        else if (skuName.includes('GZRS')) redundancy = 'GZRS';
        else if (skuName.includes('RAGZRS')) redundancy = 'RA-GZRS';

        // Build filter for storage pricing
        // Note: API uses 'type' not 'priceType' for filtering consumption vs reservation
        const tierFilter = accessTier.toLowerCase();
        const filter = `serviceName eq 'Storage' and armRegionName eq '${armRegionName}'`;
        const encodedFilter = encodeURIComponent(filter);
        const url = `${baseUrl}?$filter=${encodedFilter}`;

        try {
            // Use http module for external API call (Azure Retail Prices doesn't need auth)
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

            let storagePerGb = 0;
            let writeOperationsPer10k = 0;
            let readOperationsPer10k = 0;
            let listOperationsPer10k = 0;
            let dataRetrievalPerGb = 0;

            for (const item of items) {
                const productName = (item.productName || '').toLowerCase();
                const meterName = (item.meterName || '').toLowerCase();
                const itemSkuName = (item.skuName || '').toLowerCase();
                const price = item.unitPrice || 0;

                // Skip if not matching our redundancy type
                if (!itemSkuName.includes(redundancy.toLowerCase().replace('-', ' '))) {
                    continue;
                }

                // Storage capacity pricing
                if (meterName.includes(tierFilter) && meterName.includes('data stored') && productName.includes('blob')) {
                    storagePerGb = price;
                }

                // Operations pricing
                if (meterName.includes(tierFilter) && productName.includes('blob')) {
                    if (meterName.includes('write operations')) {
                        writeOperationsPer10k = price;
                    } else if (meterName.includes('read operations')) {
                        readOperationsPer10k = price;
                    } else if (meterName.includes('list') && meterName.includes('operations')) {
                        listOperationsPer10k = price;
                    } else if (meterName.includes('data retrieval')) {
                        dataRetrievalPerGb = price;
                    }
                }
            }

            // Only return if we found at least storage pricing
            if (storagePerGb > 0) {
                // Fail if operation pricing is missing - do not use hardcoded fallbacks
                if (writeOperationsPer10k <= 0 || readOperationsPer10k <= 0 || listOperationsPer10k <= 0) {
                    const missing: string[] = [];
                    if (writeOperationsPer10k <= 0) missing.push('write operations');
                    if (readOperationsPer10k <= 0) missing.push('read operations');
                    if (listOperationsPer10k <= 0) missing.push('list operations');
                    throw new Error(`Incomplete Azure Storage pricing: missing rates for ${missing.join(', ')}`);
                }
                return {
                    storagePerGb,
                    writeOperationsPer10k,
                    readOperationsPer10k,
                    listOperationsPer10k,
                    dataRetrievalPerGb
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
     * Get metrics from Azure Monitor
     */
    private getAzureMonitorMetrics(): {
        writeOperations: number;
        readOperations: number;
        listOperations: number;
        egressBytes: number;
        ingressBytes: number;
        retrievalBytes: number;
    } {
        const defaultMetrics = {
            writeOperations: 0,
            readOperations: 0,
            listOperations: 0,
            egressBytes: 0,
            ingressBytes: 0,
            retrievalBytes: 0
        };

        try {
            // Get the time range for last 30 days
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const timespan = `${thirtyDaysAgo.toISOString()}/${now.toISOString()}`;
            const resourcePath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.account_name}`;

            const results = { ...defaultMetrics };

            // Fetch Egress and Ingress metrics (no dimension needed)
            const egressIngressPath = `${resourcePath}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=Egress,Ingress&timespan=${timespan}&interval=P1D&aggregation=Total`;
            const egressIngressResponse = this.makeAzureRequest("GET", egressIngressPath);

            if (!egressIngressResponse.error && egressIngressResponse.body) {
                const data = JSON.parse(egressIngressResponse.body);
                const metrics = data.value || [];
                for (const metric of metrics) {
                    const metricName = metric.name?.value;
                    const timeseries = metric.timeseries || [];
                    let total = 0;
                    for (const ts of timeseries) {
                        const dataPoints = ts.data || [];
                        for (const point of dataPoints) {
                            total += point.total || 0;
                        }
                    }
                    if (metricName === 'Egress') {
                        results.egressBytes = total;
                    } else if (metricName === 'Ingress') {
                        results.ingressBytes = total;
                    }
                }
            }

            // Fetch Transactions metric with ApiName dimension to get per-operation-type breakdown
            // Azure Monitor supports filtering Transactions by ApiName dimension which gives actual operation types
            // Write operations: PutBlob, PutBlock, PutBlockList, CopyBlob, SetBlobProperties, SetBlobMetadata, etc.
            // Read operations: GetBlob, GetBlobProperties, GetBlobMetadata, etc.
            // List operations: ListBlobs, ListContainers, etc.
            const transactionsPath = `${resourcePath}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=Transactions&timespan=${timespan}&interval=P1D&aggregation=Total&$filter=ApiName eq '*'`;
            const transactionsResponse = this.makeAzureRequest("GET", transactionsPath);

            if (!transactionsResponse.error && transactionsResponse.body) {
                const data = JSON.parse(transactionsResponse.body);
                const metrics = data.value || [];

                for (const metric of metrics) {
                    const timeseries = metric.timeseries || [];

                    for (const ts of timeseries) {
                        // Each timeseries entry has a metadatavalues array with the dimension value
                        const dimensionValue = (ts.metadatavalues || []).find(
                            (m: { name?: { value?: string }; value?: string }) => m.name?.value === 'apiname'
                        )?.value?.toLowerCase() || '';

                        let total = 0;
                        const dataPoints = ts.data || [];
                        for (const point of dataPoints) {
                            total += point.total || 0;
                        }

                        // Classify operations by API name
                        if (dimensionValue.startsWith('put') || dimensionValue.startsWith('set') ||
                            dimensionValue.startsWith('create') || dimensionValue.startsWith('copy') ||
                            dimensionValue.startsWith('delete') || dimensionValue.startsWith('undelete') ||
                            dimensionValue.startsWith('append') || dimensionValue.startsWith('snapshot')) {
                            results.writeOperations += total;
                        } else if (dimensionValue.startsWith('list')) {
                            results.listOperations += total;
                        } else if (dimensionValue.startsWith('get') || dimensionValue.startsWith('head') ||
                            dimensionValue.startsWith('blob') || dimensionValue.startsWith('query')) {
                            results.readOperations += total;
                        } else if (total > 0) {
                            // Classify unknown operations as reads (most conservative)
                            results.readOperations += total;
                        }
                    }
                }
            }

            // If we couldn't get per-operation breakdown, throw rather than fabricate a distribution
            if (results.readOperations === 0 && results.writeOperations === 0 && results.listOperations === 0) {
                // Try a simpler Transactions query without dimension filter as fallback
                const simpleTxPath = `${resourcePath}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=Transactions&timespan=${timespan}&interval=P1D&aggregation=Total`;
                const simpleTxResponse = this.makeAzureRequest("GET", simpleTxPath);

                if (!simpleTxResponse.error && simpleTxResponse.body) {
                    const data = JSON.parse(simpleTxResponse.body);
                    const metrics = data.value || [];
                    let totalTransactions = 0;
                    for (const metric of metrics) {
                        const timeseries = metric.timeseries || [];
                        for (const ts of timeseries) {
                            const dataPoints = ts.data || [];
                            for (const point of dataPoints) {
                                totalTransactions += point.total || 0;
                            }
                        }
                    }

                    if (totalTransactions > 0) {
                        throw new Error(
                            `Azure Monitor returned ${totalTransactions} total transactions but per-operation-type breakdown ` +
                            `(ApiName dimension) is not available. Cannot accurately estimate operation costs without knowing ` +
                            `the distribution of read, write, and list operations.`
                        );
                    }
                }
                // If totalTransactions is also 0, the account genuinely has no transactions - return zeros
            }

            return results;
        } catch (error) {
            throw new Error(`Failed to fetch Azure Monitor metrics for storage account: ${(error as Error).message}`);
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
