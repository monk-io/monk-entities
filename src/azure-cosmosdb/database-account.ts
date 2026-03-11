import { AzureCosmosDBEntity, AzureCosmosDBDefinition, AzureCosmosDBState } from "./azure-cosmosdb-base.ts";
import cli from "cli";
import secret from "secret";
import http from "http";
import { action, Args } from "monkec/base";

/**
 * Location configuration for Cosmos DB account
 */
export interface LocationConfig {
    /**
     * @description The name of the region
     */
    location_name: string;

    /**
     * @description The failover priority (0 for write region, higher for read regions)
     * @minimum 0
     */
    failover_priority: number;

    /**
     * @description Whether this region is zone redundant
     * @default false
     */
    is_zone_redundant?: boolean;
}

/**
 * Consistency policy configuration
 */
export interface ConsistencyPolicy {
    /**
     * @description Default consistency level
     */
    default_consistency_level: "Eventual" | "ConsistentPrefix" | "Session" | "BoundedStaleness" | "Strong";

    /**
     * @description Max staleness prefix (required for BoundedStaleness)
     * @minimum 1
     * @maximum 2147483647
     */
    max_staleness_prefix?: number;

    /**
     * @description Max interval in seconds (required for BoundedStaleness)
     * @minimum 5
     * @maximum 86400
     */
    max_interval_in_seconds?: number;
}

/**
 * Backup policy configuration for Cosmos DB account
 * Continuous backup enables point-in-time restore (PITR)
 * Periodic backup is the default and requires Azure Support for restore
 */
export interface BackupPolicy {
    /**
     * @description Backup policy type
     * - Continuous: Enables point-in-time restore with 7 or 30 day retention
     * - Periodic: Traditional backup with configurable interval (requires support ticket to restore)
     */
    backup_type: "Continuous" | "Periodic";

    /**
     * @description Continuous backup tier (only applicable for Continuous backup type)
     * - Continuous7Days: 7-day point-in-time restore window
     * - Continuous30Days: 30-day point-in-time restore window
     * @default "Continuous7Days"
     */
    continuous_tier?: "Continuous7Days" | "Continuous30Days";

    /**
     * @description Periodic backup interval in minutes (only applicable for Periodic backup type)
     * @minimum 60
     * @maximum 1440
     * @default 240
     */
    periodic_interval_minutes?: number;

    /**
     * @description Periodic backup retention in hours (only applicable for Periodic backup type)
     * @minimum 8
     * @maximum 720
     * @default 8
     */
    periodic_retention_hours?: number;

    /**
     * @description Backup storage redundancy
     * - Geo: Geo-redundant backup storage (default)
     * - Local: Locally redundant backup storage
     * - Zone: Zone-redundant backup storage
     * @default "Geo"
     */
    backup_storage_redundancy?: "Geo" | "Local" | "Zone";
}

/**
 * Database restore configuration for point-in-time restore
 */
export interface DatabaseRestoreResource {
    /**
     * @description Name of the database to restore
     */
    database_name: string;

    /**
     * @description List of container names to restore (empty or undefined restores all containers)
     */
    container_names?: string[];
}

/**
 * Represents a Cosmos DB database account entity.
 * This entity allows interaction with Azure Cosmos DB database accounts via the Azure Resource Manager API.
 */
export interface DatabaseAccountDefinition extends AzureCosmosDBDefinition {
    /**
     * @description Cosmos DB database account name
     * @minLength 3
     * @maxLength 50
     * @pattern ^[a-z0-9]+(-[a-z0-9]+)*$
     */
    account_name: string;

    /**
     * @description The offer type for the database
     * @default "Standard"
     */
    database_account_offer_type?: "Standard";

    /**
     * @description An array that contains the georeplication locations enabled for the Cosmos DB account
     */
    locations?: LocationConfig[];

    /**
     * @description Indicates the type of database account
     * @default "GlobalDocumentDB"
     */
    account_kind?: "GlobalDocumentDB" | "MongoDB" | "Parse";

    /**
     * @description The consistency policy for the Cosmos DB account
     */
    consistency_policy?: ConsistencyPolicy;

    /**
     * @description Enable automatic failover of the write region
     * @default false
     */
    enable_automatic_failover?: boolean;

    /**
     * @description Enable multiple write locations
     * @default false
     */
    enable_multiple_write_locations?: boolean;

    /**
     * @description Flag to indicate whether to enable storage analytics
     * @default false
     */
    enable_analytical_storage?: boolean;

    /**
     * @description Whether requests from Public Network are allowed
     * @default "Enabled"
     */
    public_network_access?: "Enabled" | "Disabled" | "SecuredByPerimeter";

    /**
     * @description Opt-out of local authentication and ensure only MSI and AAD can be used exclusively for authentication
     * @default false
     */
    disable_local_auth?: boolean;

    /**
     * @description The location of the resource group to which the resource belongs
     */
    location?: string;

    /**
     * @description Tags for the resource
     */
    tags?: Record<string, string>;


    /**
     * @description Secret reference for Cosmos DB primary access key
     * If provided, the primary key will be saved to this secret on account creation
     */
    primary_key_secret_ref?: string;

    /**
     * @description Secret reference for Cosmos DB secondary access key
     * If provided, the secondary key will be saved to this secret on account creation
     */
    secondary_key_secret_ref?: string;

    /**
     * @description Backup policy configuration
     * Configure either Continuous (for point-in-time restore) or Periodic backup
     * Note: Once Continuous backup is enabled, it cannot be changed back to Periodic
     */
    backup_policy?: BackupPolicy;
}

/**
 * Represents the mutable runtime state of a Cosmos DB database account entity.
 */
export interface DatabaseAccountState extends AzureCosmosDBState {
    /**
     * @description Database account name (primary identifier)
     */
    account_name?: string;

    /**
     * @description Document endpoint URL
     */
    document_endpoint?: string;

    /**
     * @description Write locations
     */
    write_locations?: unknown[];

    /**
     * @description Read locations
     */
    read_locations?: unknown[];

    /**
     * @description Whether secrets have been populated (to avoid duplicate attempts)
     */
    secrets_populated?: boolean;

    /**
     * @description Current backup policy type configured on the account
     */
    backup_policy_type?: "Continuous" | "Periodic";

    /**
     * @description Continuous backup tier if applicable
     */
    continuous_backup_tier?: string;

    /**
     * @description Instance ID for restorable database accounts (used for restore operations)
     */
    restorable_instance_id?: string;

    /**
     * @description Earliest restore time for continuous backup (ISO 8601 format)
     */
    earliest_restore_time?: string;
}

/**
 * @description Azure Cosmos DB Account entity.
 * Creates and manages Azure Cosmos DB database accounts for globally distributed NoSQL data.
 * Supports SQL API, MongoDB API, and multi-region replication.
 * 
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: secret names from `primary_key_secret_ref`, `secondary_key_secret_ref` properties - Account keys (if specified)
 * 
 * ## State Fields for Composition
 * - `state.id` - Account resource ID
 * - `state.name` - Account name
 * - `state.endpoint` - Document endpoint URL
 * - `state.connection_strings` - Available connection strings
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `azure-cosmosdb/database` - Create databases within the account
 * - `azure-cosmosdb/container` - Create containers within databases
 */
export class DatabaseAccount extends AzureCosmosDBEntity<DatabaseAccountDefinition, DatabaseAccountState> {

    protected getEntityName(): string {
        return this.definition.account_name;
    }

    protected getResourceType(): string {
        return "databaseAccounts";
    }

    private extractArrayFromIndexedFields(obj: unknown, fieldName: string): unknown[] {
        // First check if the field is already a direct array
        if (obj && typeof obj === 'object' && (obj as any)[fieldName] && Array.isArray((obj as any)[fieldName])) {
            return (obj as any)[fieldName];
        }
        
        // Otherwise, extract from indexed notation (field!0, field!1, etc.)
        const result: unknown[] = [];
        let index = 0;
        
        while (obj && typeof obj === 'object' && (obj as any)[`${fieldName}!${index}`] !== undefined) {
            let item = (obj as any)[`${fieldName}!${index}`];
            
            // For each extracted item, recursively process any nested indexed fields
            item = this.processNestedIndexedFields(item);
            
            result.push(item);
            index++;
        }
        
        // Filter out null/undefined values to prevent API errors
        return result.filter(item => item != null);
    }

    private processNestedIndexedFields(obj: unknown): unknown {
        if (!obj || typeof obj !== 'object') {
            return obj;
        }
        
        const processedObj = { ...obj as Record<string, unknown> };
        
        // Look for nested indexed fields and convert them to arrays
        const indexedFields = new Set<string>();
        
        // Find all indexed field patterns in the object
        for (const key in processedObj) {
            const match = key.match(/^(.+)!(\d+)$/);
            if (match) {
                const [, fieldName] = match;
                indexedFields.add(fieldName);
            }
        }
        
        // Process each indexed field found
        for (const fieldName of indexedFields) {
            const extractedArray = this.extractArrayFromIndexedFields(processedObj, fieldName);
            
            // Remove the indexed entries and add the array
            let index = 0;
            while (processedObj[`${fieldName}!${index}`] !== undefined) {
                delete processedObj[`${fieldName}!${index}`];
                index++;
            }
            
            if (extractedArray.length > 0) {
                processedObj[fieldName] = extractedArray;
            }
        }
        
        return processedObj;
    }

    /** Create a new Cosmos DB database account */
    override create(): void {
        // Extract locations array from indexed fields
        const locationsArray = this.extractArrayFromIndexedFields(this.definition, 'locations') as LocationConfig[];
        
        if (!locationsArray || locationsArray.length === 0) {
            throw new Error("At least one location must be specified for the Cosmos DB account");
        }
        
        // Check if account already exists
        const existingAccount = this.checkResourceExists(this.definition.account_name);

        if (existingAccount) {
            // Account already exists, use it
            const properties = existingAccount.properties as Record<string, unknown> | undefined;
            const provisioningState = typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined;
            
            this.state = {
                account_name: typeof existingAccount.name === 'string' ? existingAccount.name : this.definition.account_name,
                provisioning_state: provisioningState,
                document_endpoint: typeof properties?.documentEndpoint === 'string' ? properties.documentEndpoint : undefined,
                write_locations: Array.isArray(properties?.writeLocations) ? properties.writeLocations : undefined,
                read_locations: Array.isArray(properties?.readLocations) ? properties.readLocations : undefined,
                existing: true
            };
            cli.output(`✅ Database account ${this.definition.account_name} already exists`);
            
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
            cli.output(`⚠️  Database account ${this.definition.account_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body for account creation
        const body: {
            kind?: string;
            location?: string;
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            kind: this.definition.account_kind || "GlobalDocumentDB",
            location: this.definition.location || locationsArray[0]?.location_name || "East US",
            properties: {
                databaseAccountOfferType: this.definition.database_account_offer_type || "Standard",
                locations: locationsArray.map(loc => ({
                    locationName: loc.location_name,
                    failoverPriority: loc.failover_priority,
                    isZoneRedundant: loc.is_zone_redundant || false
                }))
            }
        };

        // Add optional properties
        if (this.definition.consistency_policy) {
            const consistencyPolicy: Record<string, unknown> = {
                defaultConsistencyLevel: this.definition.consistency_policy.default_consistency_level
            };
            
            if (this.definition.consistency_policy.max_staleness_prefix !== undefined) {
                consistencyPolicy.maxStalenessPrefix = this.definition.consistency_policy.max_staleness_prefix;
            }
            
            if (this.definition.consistency_policy.max_interval_in_seconds !== undefined) {
                consistencyPolicy.maxIntervalInSeconds = this.definition.consistency_policy.max_interval_in_seconds;
            }

            body.properties.consistencyPolicy = consistencyPolicy;
        }

        if (this.definition.enable_automatic_failover !== undefined) {
            body.properties.enableAutomaticFailover = this.definition.enable_automatic_failover;
        }

        if (this.definition.enable_multiple_write_locations !== undefined) {
            body.properties.enableMultipleWriteLocations = this.definition.enable_multiple_write_locations;
        }

        if (this.definition.enable_analytical_storage !== undefined) {
            body.properties.enableAnalyticalStorage = this.definition.enable_analytical_storage;
        }

        if (this.definition.public_network_access !== undefined) {
            body.properties.publicNetworkAccess = this.definition.public_network_access;
        }

        if (this.definition.disable_local_auth !== undefined) {
            body.properties.disableLocalAuth = this.definition.disable_local_auth;
        }

        if (this.definition.tags) {
            body.tags = this.definition.tags;
        }

        // Add backup policy if specified
        if (this.definition.backup_policy) {
            if (this.definition.backup_policy.backup_type === "Continuous") {
                body.properties.backupPolicy = {
                    type: "Continuous",
                    continuousModeProperties: {
                        tier: this.definition.backup_policy.continuous_tier || "Continuous7Days"
                    }
                };
            } else {
                // Periodic backup policy
                const periodicModeProperties: Record<string, unknown> = {
                    backupIntervalInMinutes: this.definition.backup_policy.periodic_interval_minutes || 240,
                    backupRetentionIntervalInHours: this.definition.backup_policy.periodic_retention_hours || 8
                };
                
                if (this.definition.backup_policy.backup_storage_redundancy) {
                    periodicModeProperties.backupStorageRedundancy = this.definition.backup_policy.backup_storage_redundancy;
                }

                body.properties.backupPolicy = {
                    type: "Periodic",
                    periodicModeProperties
                };
            }
        }

        // Create the account
        const path = this.buildResourcePath(this.definition.account_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create database account: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Set state from created account
        const properties = responseData?.properties as Record<string, unknown> | undefined;
        this.state = {
            account_name: this.definition.account_name,
            provisioning_state: typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined,
            document_endpoint: typeof properties?.documentEndpoint === 'string' ? properties.documentEndpoint : undefined,
            write_locations: Array.isArray(properties?.writeLocations) ? properties.writeLocations : undefined,
            read_locations: Array.isArray(properties?.readLocations) ? properties.readLocations : undefined,
            existing: false
        };

        cli.output(`✅ Created Cosmos DB database account: ${this.definition.account_name}`);
    }

    override update(): void {
        if (!this.state.account_name) {
            this.create();
            return;
        }

        // Extract locations array from indexed fields
        const locationsArray = this.extractArrayFromIndexedFields(this.definition, 'locations') as LocationConfig[];

        // For Cosmos DB, most properties cannot be updated after creation
        // We can update certain properties like consistency policy, failover policies, etc.
        const body: {
            location: string;
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            location: this.definition.location || locationsArray[0]?.location_name || "East US",
            properties: {
                databaseAccountOfferType: this.definition.database_account_offer_type || "Standard"
            }
        };

        let hasChanges = false;

        // Update consistency policy if provided
        if (this.definition.consistency_policy) {
            const consistencyPolicy: Record<string, unknown> = {
                defaultConsistencyLevel: this.definition.consistency_policy.default_consistency_level
            };
            
            if (this.definition.consistency_policy.max_staleness_prefix !== undefined) {
                consistencyPolicy.maxStalenessPrefix = this.definition.consistency_policy.max_staleness_prefix;
            }
            
            if (this.definition.consistency_policy.max_interval_in_seconds !== undefined) {
                consistencyPolicy.maxIntervalInSeconds = this.definition.consistency_policy.max_interval_in_seconds;
            }

            body.properties.consistencyPolicy = consistencyPolicy;
            hasChanges = true;
        }

        // Update locations (failover priorities can be changed)
        if (locationsArray && locationsArray.length > 0) {
            body.properties.locations = locationsArray.map(loc => ({
                locationName: loc.location_name,
                failoverPriority: loc.failover_priority,
                isZoneRedundant: loc.is_zone_redundant || false
            }));
            hasChanges = true;
        }

        // Update other modifiable properties
        if (this.definition.enable_automatic_failover !== undefined) {
            body.properties.enableAutomaticFailover = this.definition.enable_automatic_failover;
            hasChanges = true;
        }

        if (this.definition.enable_multiple_write_locations !== undefined) {
            body.properties.enableMultipleWriteLocations = this.definition.enable_multiple_write_locations;
            hasChanges = true;
        }

        if (this.definition.public_network_access !== undefined) {
            body.properties.publicNetworkAccess = this.definition.public_network_access;
            hasChanges = true;
        }

        if (this.definition.disable_local_auth !== undefined) {
            body.properties.disableLocalAuth = this.definition.disable_local_auth;
            hasChanges = true;
        }

        // Update tags
        if (this.definition.tags) {
            body.tags = this.definition.tags;
            hasChanges = true;
        }

        // Skip update if nothing has changed
        if (!hasChanges) {
            cli.output(`ℹ️  No changes detected for database account: ${this.definition.account_name}`);
            return;
        }

        const path = this.buildResourcePath(this.definition.account_name);
        const response = this.makeAzureRequest("PATCH", path, body);

        if (response.error) {
            throw new Error(`Failed to update database account: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Update state
        if (responseData) {
            const properties = responseData.properties as Record<string, unknown> | undefined;
            this.state.provisioning_state = typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined;
            this.state.document_endpoint = typeof properties?.documentEndpoint === 'string' ? properties.documentEndpoint : undefined;
            this.state.write_locations = Array.isArray(properties?.writeLocations) ? properties.writeLocations : undefined;
            this.state.read_locations = Array.isArray(properties?.readLocations) ? properties.readLocations : undefined;
        }

        cli.output(`✅ Updated Cosmos DB database account: ${this.definition.account_name}`);
    }

    override delete(): void {
        if (!this.state.account_name) {
            cli.output("Database account does not exist, nothing to delete");
            return;
        }

        this.deleteResource(this.definition.account_name);
    }

    override checkReadiness(): boolean {
        if (!this.state.account_name) {
            return false;
        }

        // If create_when_missing is false and resource doesn't exist, consider it ready
        if (this.definition.create_when_missing === false && !this.state.existing) {
            return true;
        }

        try {
            // Check if account exists and is ready
            const account = this.checkResourceExists(this.definition.account_name);
            
            if (!account) {
                cli.output(`⏳ Database account ${this.definition.account_name} not found`);
                return false;
            }

            const properties = account.properties as Record<string, unknown> | undefined;
            const provisioningState = typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined;
            const isReady = provisioningState === "Succeeded";
            
            if (isReady) {
                cli.output(`✅ Database account ${this.definition.account_name} is ready (status: ${provisioningState})`);
                
                // Update state with current information
                this.state.provisioning_state = provisioningState;
                this.state.document_endpoint = typeof properties?.documentEndpoint === 'string' ? properties.documentEndpoint : undefined;
                this.state.write_locations = Array.isArray(properties?.writeLocations) ? properties.writeLocations : undefined;
                this.state.read_locations = Array.isArray(properties?.readLocations) ? properties.readLocations : undefined;
                
                // Populate secrets when account is ready (only once)
                if (!this.state.secrets_populated) {
                    cli.output(`🔑 Account is ready, attempting to populate secrets...`);
                    this.populateAccountSecrets();
                    this.state.secrets_populated = true;
                }
            } else {
                cli.output(`⏳ Database account ${this.definition.account_name} not ready yet (status: ${provisioningState || 'unknown'})`);
            }
            
            return isReady;
        } catch (error) {
            cli.output(`⚠️  Failed to check database account readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            !this.definition.secondary_key_secret_ref) {
            return; // No secrets to populate
        }

        // Fetch and save access keys if key secret references are provided
        if (this.definition.primary_key_secret_ref || this.definition.secondary_key_secret_ref) {
            try {
                // Construct the listKeys path properly (without appending to a path that already has query params)
                const keysPath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DocumentDB/databaseAccounts/${this.definition.account_name}/listKeys?api-version=${this.apiVersion}`;
                const keysResponse = this.makeAzureRequest("POST", keysPath);

                if (keysResponse.error) {
                    cli.output(`⚠️  Failed to retrieve access keys: ${keysResponse.error}`);
                    return;
                }

                const keysData = this.parseResponseBody(keysResponse) as Record<string, unknown> | null;
                
                if (keysData) {
                    // Save primary key if reference is provided
                    if (this.definition.primary_key_secret_ref && typeof keysData.primaryMasterKey === 'string') {
                        try {
                            secret.set(this.definition.primary_key_secret_ref, keysData.primaryMasterKey);
                            cli.output(`🔑 Saved primary key to secret: ${this.definition.primary_key_secret_ref}`);
                        } catch (error) {
                            cli.output(`⚠️  Failed to save primary key to secret: ${this.definition.primary_key_secret_ref}`);
                        }
                    }

                    // Save secondary key if reference is provided
                    if (this.definition.secondary_key_secret_ref && typeof keysData.secondaryMasterKey === 'string') {
                        try {
                            secret.set(this.definition.secondary_key_secret_ref, keysData.secondaryMasterKey);
                            cli.output(`🔑 Saved secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                        } catch (error) {
                            cli.output(`⚠️  Failed to save secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                        }
                    }
                } else {
                    cli.output(`⚠️  No keys data received from Azure API`);
                }
            } catch (error) {
                cli.output(`⚠️  Failed to fetch access keys from Azure: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
    }

    // ========================================
    // Cost Estimation
    // ========================================

    /**
     * Make an external HTTP request (for Azure Retail Prices API)
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
     * Fetch Cosmos DB pricing from Azure Retail Prices API
     */
    private fetchCosmosDBPricing(location: string): {
        ruPerHourPer100: number;
        storagePerGbMonth: number;
        multiRegionWriteMultiplier: number;
        source: string;
    } {
        try {
            const baseUrl = 'https://prices.azure.com/api/retail/prices';
            const armRegionName = location.toLowerCase().replace(/\s+/g, '');

            const filter = `serviceName eq 'Azure Cosmos DB' and armRegionName eq '${armRegionName}'`;
            const encodedFilter = encodeURIComponent(filter);
            const url = `${baseUrl}?$filter=${encodedFilter}`;

            const response = this.makeExternalRequest(url);

            if (response && response.Items && Array.isArray(response.Items)) {
                let ruRate = 0;
                let storageRate = 0;

                for (const item of response.Items as Array<{
                    meterName?: string;
                    productName?: string;
                    unitPrice?: number;
                    unitOfMeasure?: string;
                }>) {
                    const meterName = (item.meterName || '').toLowerCase();
                    const productName = (item.productName || '').toLowerCase();
                    const price = item.unitPrice || 0;

                    if (price <= 0) continue;

                    // RU pricing: "100 RU/s" or "100 Request Units"
                    if (meterName.includes('100 ru') && !productName.includes('serverless') && !meterName.includes('multi-region')) {
                        if (ruRate === 0) ruRate = price;
                    }
                    // Storage pricing
                    else if (meterName.includes('data stored') && !meterName.includes('analytical') && !meterName.includes('backup')) {
                        if (storageRate === 0) storageRate = price;
                    }
                }

                // Also look for multi-region write pricing to derive the multiplier
                let multiRegionRuRate = 0;
                for (const item of response.Items as Array<{
                    meterName?: string;
                    productName?: string;
                    unitPrice?: number;
                    unitOfMeasure?: string;
                }>) {
                    const meterName = (item.meterName || '').toLowerCase();
                    const price = item.unitPrice || 0;
                    if (price <= 0) continue;
                    if (meterName.includes('100 ru') && meterName.includes('multi-region') && !meterName.includes('serverless')) {
                        if (multiRegionRuRate === 0) multiRegionRuRate = price;
                    }
                }

                if (ruRate > 0 || storageRate > 0) {
                    if (ruRate <= 0 || storageRate <= 0) {
                        const missing: string[] = [];
                        if (ruRate <= 0) missing.push('RU');
                        if (storageRate <= 0) missing.push('storage');
                        throw new Error(`Incomplete Cosmos DB pricing from Azure API: missing rates for ${missing.join(', ')}`);
                    }
                    // Derive multi-region write multiplier from API data if available
                    const multiRegionWriteMultiplier = (multiRegionRuRate > 0 && ruRate > 0)
                        ? multiRegionRuRate / ruRate
                        : 1; // If we can't determine the multiplier, don't apply one
                    return {
                        ruPerHourPer100: ruRate,
                        storagePerGbMonth: storageRate,
                        multiRegionWriteMultiplier,
                        source: 'Azure Retail Prices API'
                    };
                }
            }
        } catch (error) {
            throw new Error(`Failed to fetch Cosmos DB pricing from Azure API: ${(error as Error).message}`);
        }

        throw new Error('Could not retrieve Cosmos DB pricing from Azure Retail Prices API');
    }

    /**
     * Get account throughput and storage metrics
     */
    private getAccountMetrics(): {
        totalRUs: number;
        regionCount: number;
        multiRegionWrites: boolean;
        storageSizeGb: number;
        storageMetricAvailable: boolean;
    } {
        const account = this.checkResourceExists(this.definition.account_name);
        if (!account) {
            throw new Error(`Cosmos DB account '${this.definition.account_name}' not found. Cannot estimate costs without account data.`);
        }

        const properties = account.properties as Record<string, unknown> | undefined;
        const writeLocations = properties?.writeLocations as unknown[] | undefined;
        const readLocations = properties?.readLocations as unknown[] | undefined;
        const multiRegionWrites = properties?.enableMultipleWriteLocations === true;

        const regionCount = Math.max(
            (writeLocations?.length || 0) + (readLocations?.length || 0),
            1
        );

        // Try to get throughput settings from the account
        let totalRUs = 0;
        const basePath = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.DocumentDB/databaseAccounts/${this.definition.account_name}`;

        // 1. Try account-level throughput first
        try {
            const throughputPath = `${basePath}/throughputSettings/default?api-version=${this.apiVersion}`;
            const throughputResponse = this.makeAzureRequest("GET", throughputPath);
            if (!throughputResponse.error && throughputResponse.body) {
                const throughputData = JSON.parse(throughputResponse.body);
                const throughputProps = throughputData?.properties?.resource;
                if (throughputProps?.throughput) {
                    totalRUs = throughputProps.throughput;
                } else if (throughputProps?.autoscaleSettings?.maxThroughput) {
                    totalRUs = throughputProps.autoscaleSettings.maxThroughput;
                }
            }
        } catch {
            // Throughput may be set at database/container level — will enumerate below
        }

        // 2. If no account-level throughput, enumerate databases and containers
        //    to sum per-database and per-container provisioned RU/s.
        //    This covers the common case where throughput is set at the database or container level.
        if (totalRUs <= 0) {
            totalRUs = this.enumerateDatabaseAndContainerThroughput(basePath);
        }

        if (totalRUs <= 0) {
            throw new Error(
                'Could not determine Cosmos DB throughput (RU/s). ' +
                'No throughput found at account, database, or container level.'
            );
        }

        // Try to get storage usage from Azure Monitor metrics
        // When DataUsage returns 0, this may indicate a new account with no data yet,
        // or that Azure Monitor metrics are not yet populated. We track this separately
        // so callers can distinguish "0 GB actual usage" from "metric unavailable".
        let storageSizeGb = 0;
        let storageMetricAvailable = false;
        try {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const metricsPath = `${basePath}/providers/Microsoft.Insights/metrics?api-version=2023-10-01&metricnames=DataUsage&timespan=${thirtyDaysAgo.toISOString()}/${now.toISOString()}&aggregation=Average`;
            const metricsResponse = this.makeAzureRequest("GET", metricsPath);
            if (!metricsResponse.error && metricsResponse.body) {
                const metricsData = JSON.parse(metricsResponse.body);
                const metrics = metricsData?.value || [];
                for (const metric of metrics) {
                    const timeseries = metric.timeseries || [];
                    for (const ts of timeseries) {
                        const dataPoints = ts.data || [];
                        for (const point of dataPoints) {
                            storageMetricAvailable = true;
                            const avg = point.average || 0;
                            if (avg > 0) {
                                storageSizeGb = avg / (1024 * 1024 * 1024);
                            }
                        }
                    }
                }
            }
        } catch {
            // Storage metrics may not be available
        }

        return { totalRUs, regionCount, multiRegionWrites, storageSizeGb, storageMetricAvailable };
    }

    /**
     * Enumerate databases and containers to sum per-database and per-container provisioned RU/s.
     * Called when no account-level throughput is configured (the common case for per-database
     * or per-container throughput provisioning).
     * 
     * Uses the Azure Management API:
     * - GET .../sqlDatabases to list databases
     * - GET .../sqlDatabases/{db}/throughputSettings/default for database-level throughput
     * - GET .../sqlDatabases/{db}/containers to list containers
     * - GET .../sqlDatabases/{db}/containers/{c}/throughputSettings/default for container-level throughput
     * 
     * Also checks MongoDB databases/collections if the account kind is MongoDB.
     */
    private enumerateDatabaseAndContainerThroughput(basePath: string): number {
        let totalRUs = 0;
        const accountKind = (this.definition.account_kind || 'GlobalDocumentDB').toLowerCase();

        // Determine the API path prefix based on account kind
        const dbType = accountKind === 'mongodb' ? 'mongodbDatabases' : 'sqlDatabases';
        const containerType = accountKind === 'mongodb' ? 'collections' : 'containers';

        try {
            // List databases
            const dbListPath = `${basePath}/${dbType}?api-version=${this.apiVersion}`;
            const dbListResponse = this.makeAzureRequest("GET", dbListPath);
            if (dbListResponse.error || !dbListResponse.body) return totalRUs;

            const dbListData = JSON.parse(dbListResponse.body);
            const databases = dbListData?.value || [];

            for (const db of databases) {
                const dbName = db.name as string;
                if (!dbName) continue;
                const dbPath = `${basePath}/${dbType}/${dbName}`;

                // Try database-level throughput
                let dbHasThroughput = false;
                try {
                    const dbThroughputPath = `${dbPath}/throughputSettings/default?api-version=${this.apiVersion}`;
                    const dbThroughputResponse = this.makeAzureRequest("GET", dbThroughputPath);
                    if (!dbThroughputResponse.error && dbThroughputResponse.body) {
                        const dbThroughputData = JSON.parse(dbThroughputResponse.body);
                        const dbThroughputProps = dbThroughputData?.properties?.resource;
                        if (dbThroughputProps?.throughput) {
                            totalRUs += dbThroughputProps.throughput;
                            dbHasThroughput = true;
                        } else if (dbThroughputProps?.autoscaleSettings?.maxThroughput) {
                            totalRUs += dbThroughputProps.autoscaleSettings.maxThroughput;
                            dbHasThroughput = true;
                        }
                    }
                } catch {
                    // Database-level throughput not set
                }

                // If database has shared throughput, skip container enumeration
                // (all containers share the database throughput)
                if (dbHasThroughput) continue;

                // List containers and check per-container throughput
                try {
                    const containerListPath = `${dbPath}/${containerType}?api-version=${this.apiVersion}`;
                    const containerListResponse = this.makeAzureRequest("GET", containerListPath);
                    if (containerListResponse.error || !containerListResponse.body) continue;

                    const containerListData = JSON.parse(containerListResponse.body);
                    const containers = containerListData?.value || [];

                    for (const container of containers) {
                        const containerName = container.name as string;
                        if (!containerName) continue;

                        try {
                            const containerThroughputPath = `${dbPath}/${containerType}/${containerName}/throughputSettings/default?api-version=${this.apiVersion}`;
                            const containerThroughputResponse = this.makeAzureRequest("GET", containerThroughputPath);
                            if (!containerThroughputResponse.error && containerThroughputResponse.body) {
                                const containerThroughputData = JSON.parse(containerThroughputResponse.body);
                                const containerThroughputProps = containerThroughputData?.properties?.resource;
                                if (containerThroughputProps?.throughput) {
                                    totalRUs += containerThroughputProps.throughput;
                                } else if (containerThroughputProps?.autoscaleSettings?.maxThroughput) {
                                    totalRUs += containerThroughputProps.autoscaleSettings.maxThroughput;
                                }
                            }
                        } catch {
                            // Container-level throughput not set
                        }
                    }
                } catch {
                    // Failed to list containers
                }
            }
        } catch {
            // Failed to list databases
        }

        return totalRUs;
    }

    /**
     * Get detailed cost estimate for the Cosmos DB account
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        const accountName = this.definition.account_name;

        cli.output(`\n💰 Cost Estimate for Cosmos DB Account: ${accountName}`);
        cli.output(`${'='.repeat(60)}`);

        const locationsArray = this.extractArrayFromIndexedFields(this.definition, 'locations') as LocationConfig[];
        const location = this.definition.location || locationsArray[0]?.location_name || 'East US';
        const multiRegionWrites = this.definition.enable_multiple_write_locations || false;

        cli.output(`\n📊 Account Configuration:`);
        cli.output(`   Account Name: ${accountName}`);
        cli.output(`   Primary Location: ${location}`);
        cli.output(`   Account Kind: ${this.definition.account_kind || 'GlobalDocumentDB'}`);
        cli.output(`   Multi-Region Writes: ${multiRegionWrites}`);
        cli.output(`   Regions: ${locationsArray.length || 1}`);
        if (this.definition.consistency_policy) {
            cli.output(`   Consistency: ${this.definition.consistency_policy.default_consistency_level}`);
        }

        const pricing = this.fetchCosmosDBPricing(location);
        const metrics = this.getAccountMetrics();
        const hoursPerMonth = 730;

        cli.output(`\n💵 Pricing (${pricing.source}):`);
        cli.output(`   Per 100 RU/s/hour: $${pricing.ruPerHourPer100.toFixed(4)}`);
        cli.output(`   Storage: $${pricing.storagePerGbMonth.toFixed(2)}/GB/month`);

        cli.output(`\n📈 Account Metrics:`);
        cli.output(`   Provisioned RU/s: ${metrics.totalRUs}`);
        cli.output(`   Regions: ${metrics.regionCount}`);
        cli.output(`   Multi-Region Writes: ${metrics.multiRegionWrites}`);

        // Calculate RU cost
        const ruUnits = metrics.totalRUs / 100;
        let ruMonthlyCost = ruUnits * pricing.ruPerHourPer100 * hoursPerMonth;

        // Multi-region write multiplier
        if (metrics.multiRegionWrites && metrics.regionCount > 1) {
            ruMonthlyCost *= pricing.multiRegionWriteMultiplier;
            cli.output(`   Multi-region write multiplier: ${pricing.multiRegionWriteMultiplier}x`);
        }

        // Multi-region replication cost (each additional region adds the same RU cost)
        const regionMultiplier = Math.max(metrics.regionCount, 1);
        const totalRuCost = ruMonthlyCost * regionMultiplier;

        cli.output(`\n💵 Cost Breakdown (Monthly):`);
        cli.output(`   Throughput (${metrics.totalRUs} RU/s x ${regionMultiplier} regions): $${totalRuCost.toFixed(2)}`);

        // Storage cost from actual usage metrics
        const storageCost = metrics.storageSizeGb * pricing.storagePerGbMonth * regionMultiplier;
        if (metrics.storageSizeGb > 0) {
            cli.output(`   Storage (${metrics.storageSizeGb.toFixed(2)} GB x ${regionMultiplier} regions): $${storageCost.toFixed(2)}`);
        } else if (metrics.storageMetricAvailable) {
            cli.output(`   Storage: $0.00 (Azure Monitor DataUsage metric returned 0 — account may be empty or newly created)`);
        } else {
            cli.output(`   Storage: $0.00 (Azure Monitor DataUsage metric unavailable — storage cost not included)`);
        }

        const totalMonthlyCost = totalRuCost + storageCost;

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - Throughput cost is the primary cost driver for Cosmos DB`);
        cli.output(`   - Storage cost ($${pricing.storagePerGbMonth.toFixed(2)}/GB/month from API) based on actual data volume`);
        cli.output(`   - Consider autoscale to optimize costs for variable workloads`);
        cli.output(`   - Free tier: 1000 RU/s and 25 GB storage (first account per subscription)`);
        cli.output(`   - Backup costs vary by policy type (Continuous vs Periodic)`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        try {
            const locationsArray = this.extractArrayFromIndexedFields(this.definition, 'locations') as LocationConfig[];
            const location = this.definition.location || locationsArray[0]?.location_name || 'East US';

            const pricing = this.fetchCosmosDBPricing(location);
            const metrics = this.getAccountMetrics();
            const hoursPerMonth = 730;

            const ruUnits = metrics.totalRUs / 100;
            let ruMonthlyCost = ruUnits * pricing.ruPerHourPer100 * hoursPerMonth;

            if (metrics.multiRegionWrites && metrics.regionCount > 1) {
                ruMonthlyCost *= pricing.multiRegionWriteMultiplier;
            }

            const regionMultiplier = Math.max(metrics.regionCount, 1);
            const ruTotalCost = ruMonthlyCost * regionMultiplier;

            // Include storage cost in total
            const storageCost = metrics.storageSizeGb * pricing.storagePerGbMonth * regionMultiplier;

            const totalMonthlyCost = ruTotalCost + storageCost;

            const result = {
                type: "azure-cosmosdb-account",
                costs: {
                    month: {
                        amount: totalMonthlyCost.toFixed(2),
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "azure-cosmosdb-account",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD",
                        error: (error as Error).message
                    }
                }
            };
            cli.output(JSON.stringify(result));
        }
    }

    // ========================================
    // Backup & Restore Actions
    // ========================================

    /**
     * Get backup information for the current database account
     * Displays the backup policy configuration and earliest restore time (if applicable)
     * 
     * Usage:
     *   monk do namespace/account get-backup-info
     */
    @action("get-backup-info")
    getBackupInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Backup Information for: ${this.definition.account_name}`);
        cli.output(`==================================================`);

        if (!this.state.account_name) {
            throw new Error("Account does not exist. Create the account first.");
        }

        try {
            const account = this.checkResourceExists(this.definition.account_name);
            
            if (!account) {
                throw new Error(`Account ${this.definition.account_name} not found`);
            }

            const properties = account.properties as Record<string, unknown> | undefined;
            const backupPolicy = properties?.backupPolicy as Record<string, unknown> | undefined;

            if (!backupPolicy) {
                cli.output(`\n⚠️  No backup policy information available`);
                cli.output(`==================================================`);
                return;
            }

            const backupType = backupPolicy.type as string;
            cli.output(`\n🔧 Backup Policy Type: ${backupType}`);

            if (backupType === "Continuous") {
                const continuousProps = backupPolicy.continuousModeProperties as Record<string, unknown> | undefined;
                const tier = continuousProps?.tier || "Unknown";
                cli.output(`   Tier: ${tier}`);
                
                // Update state with backup info
                this.state.backup_policy_type = "Continuous";
                this.state.continuous_backup_tier = String(tier);

                // Get restorable account info for earliest restore time
                this.fetchRestorableAccountInfo();
            } else if (backupType === "Periodic") {
                const periodicProps = backupPolicy.periodicModeProperties as Record<string, unknown> | undefined;
                cli.output(`   Backup Interval: ${periodicProps?.backupIntervalInMinutes || 240} minutes`);
                cli.output(`   Backup Retention: ${periodicProps?.backupRetentionIntervalInHours || 8} hours`);
                cli.output(`   Storage Redundancy: ${periodicProps?.backupStorageRedundancy || "Geo"}`);
                cli.output(`\n⚠️  Note: Periodic backup restore requires Azure Support ticket`);
                
                this.state.backup_policy_type = "Periodic";
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get backup info`);
            throw new Error(`Get backup info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Fetch restorable account info and update state with instance ID and earliest restore time
     */
    private fetchRestorableAccountInfo(): void {
        try {
            const path = `/subscriptions/${this.definition.subscription_id}/providers/Microsoft.DocumentDB/restorableDatabaseAccounts?api-version=${this.apiVersion}`;
            const response = this.makeAzureRequest("GET", path);

            if (response.error) {
                cli.output(`⚠️  Could not fetch restorable account info: ${response.error}`);
                return;
            }

            const data = this.parseResponseBody(response) as Record<string, unknown> | null;
            const accounts = data?.value as unknown[] | undefined;

            if (!accounts || accounts.length === 0) {
                cli.output(`   No restorable accounts found`);
                return;
            }

            // Find the restorable account matching our account name
            for (const acc of accounts) {
                const account = acc as Record<string, unknown>;
                const accName = account.name as string;
                const props = account.properties as Record<string, unknown> | undefined;
                const accountName = props?.accountName as string;

                if (accountName === this.definition.account_name) {
                    this.state.restorable_instance_id = accName;
                    
                    const oldestTime = props?.oldestRestorableTime as string;
                    if (oldestTime) {
                        this.state.earliest_restore_time = oldestTime;
                        cli.output(`   Restorable Instance ID: ${accName}`);
                        cli.output(`   Earliest Restore Time: ${oldestTime}`);
                    }
                    
                    const location = account.location as string;
                    if (location) {
                        cli.output(`   Location: ${location}`);
                    }
                    return;
                }
            }

            cli.output(`   Account not found in restorable accounts list`);
        } catch (error) {
            cli.output(`⚠️  Error fetching restorable account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all restorable database accounts in the subscription
     * These are accounts with continuous backup that can be restored from
     * 
     * Usage:
     *   monk do namespace/account list-restorable-accounts
     *   monk do namespace/account list-restorable-accounts location="East US"
     * 
     * @param args Optional arguments:
     *   - location: Filter by Azure region
     */
    @action("list-restorable-accounts")
    listRestorableAccounts(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📋 Restorable Database Accounts`);
        cli.output(`Subscription: ${this.definition.subscription_id}`);
        cli.output(`==================================================`);

        try {
            let path: string;
            const location = args?.location as string | undefined;

            if (location) {
                // Location-specific endpoint
                const encodedLocation = location.replace(/ /g, '%20');
                path = `/subscriptions/${this.definition.subscription_id}/providers/Microsoft.DocumentDB/locations/${encodedLocation}/restorableDatabaseAccounts?api-version=${this.apiVersion}`;
                cli.output(`Filter: Location = ${location}\n`);
            } else {
                // All restorable accounts in subscription
                path = `/subscriptions/${this.definition.subscription_id}/providers/Microsoft.DocumentDB/restorableDatabaseAccounts?api-version=${this.apiVersion}`;
            }

            const response = this.makeAzureRequest("GET", path);

            if (response.error) {
                throw new Error(`API error: ${response.error}, body: ${response.body}`);
            }

            const data = this.parseResponseBody(response) as Record<string, unknown> | null;
            const accounts = data?.value as unknown[] | undefined;

            if (!accounts || accounts.length === 0) {
                cli.output(`\nNo restorable accounts found.`);
                cli.output(`\nNote: Only accounts with Continuous backup mode appear here.`);
                cli.output(`==================================================`);
                return;
            }

            cli.output(`\nFound ${accounts.length} restorable account(s):\n`);

            for (let i = 0; i < accounts.length; i++) {
                const account = accounts[i] as Record<string, unknown>;
                const props = account.properties as Record<string, unknown> | undefined;
                
                cli.output(`📁 Account #${i + 1}`);
                cli.output(`   Instance ID: ${account.name}`);
                cli.output(`   Account Name: ${props?.accountName || 'N/A'}`);
                cli.output(`   Location: ${account.location || 'N/A'}`);
                cli.output(`   API Type: ${props?.apiType || 'N/A'}`);
                cli.output(`   Oldest Restorable Time: ${props?.oldestRestorableTime || 'N/A'}`);
                cli.output(`   Creation Time: ${props?.creationTime || 'N/A'}`);
                
                if (props?.deletionTime) {
                    cli.output(`   ⚠️  Deletion Time: ${props.deletionTime} (deleted account)`);
                }
                cli.output(``);
            }

            cli.output(`==================================================`);
            cli.output(`\n💡 Use the Instance ID as 'source_id' with 'list-restorable-databases' action`);
            cli.output(`   to see which databases can be restored.`);
        } catch (error) {
            cli.output(`\n❌ Failed to list restorable accounts`);
            throw new Error(`List restorable accounts failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List restorable databases for a specific restorable account
     * 
     * Usage:
     *   monk do namespace/account list-restorable-databases source_id="xxx" location="East US"
     * 
     * @param args Required arguments:
     *   - source_id: The restorable account instance ID (from list-restorable-accounts)
     *   - location: Azure region where the account exists
     */
    @action("list-restorable-databases")
    listRestorableDatabases(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📋 Restorable Databases`);
        cli.output(`==================================================`);

        const instanceId = (args?.source_id || args?.instance_id) as string | undefined; // Support both for backward compatibility
        const location = args?.location as string | undefined;

        if (!instanceId) {
            throw new Error(
                "Required argument 'source_id' not provided.\n" +
                "Usage: monk do namespace/account list-restorable-databases source_id=\"xxx\" location=\"East US\"\n" +
                "\nTo find source IDs, run: monk do namespace/account list-restorable-accounts"
            );
        }

        if (!location) {
            throw new Error(
                "Required argument 'location' not provided.\n" +
                "Usage: monk do namespace/account list-restorable-databases source_id=\"xxx\" location=\"East US\""
            );
        }

        try {
            const encodedLocation = location.replace(/ /g, '%20');
            const path = `/subscriptions/${this.definition.subscription_id}/providers/Microsoft.DocumentDB/locations/${encodedLocation}/restorableDatabaseAccounts/${instanceId}/restorableSqlDatabases?api-version=${this.apiVersion}`;

            cli.output(`Source ID: ${instanceId}`);
            cli.output(`Location: ${location}\n`);

            const response = this.makeAzureRequest("GET", path);

            if (response.error) {
                throw new Error(`API error: ${response.error}, body: ${response.body}`);
            }

            const data = this.parseResponseBody(response) as Record<string, unknown> | null;
            const databases = data?.value as unknown[] | undefined;

            if (!databases || databases.length === 0) {
                cli.output(`\nNo restorable databases found for this account.`);
                cli.output(`==================================================`);
                return;
            }

            cli.output(`Found ${databases.length} restorable database(s):\n`);

            for (let i = 0; i < databases.length; i++) {
                const db = databases[i] as Record<string, unknown>;
                const props = db.properties as Record<string, unknown> | undefined;
                const resource = props?.resource as Record<string, unknown> | undefined;

                cli.output(`📂 Database #${i + 1}`);
                cli.output(`   Database Name: ${resource?.ownerId || 'N/A'}`);
                cli.output(`   Resource ID (rid): ${resource?._rid || 'N/A'}`);
                cli.output(`   Operation Type: ${resource?.operationType || 'N/A'}`);
                cli.output(`   Event Timestamp: ${resource?.eventTimestamp || 'N/A'}`);
                cli.output(``);
            }

            cli.output(`==================================================`);
            cli.output(`\n💡 Use 'list-restorable-containers' to see containers in each database`);
        } catch (error) {
            cli.output(`\n❌ Failed to list restorable databases`);
            throw new Error(`List restorable databases failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List restorable containers for a specific database
     * 
     * Usage:
     *   monk do namespace/account list-restorable-containers source_id="xxx" location="East US" database_rid="xxx"
     * 
     * @param args Required arguments:
     *   - source_id: The restorable account instance ID
     *   - location: Azure region
     *   - database_rid: The database resource ID (_rid from list-restorable-databases)
     */
    @action("list-restorable-containers")
    listRestorableContainers(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📋 Restorable Containers`);
        cli.output(`==================================================`);

        const instanceId = (args?.source_id || args?.instance_id) as string | undefined; // Support both for backward compatibility
        const location = args?.location as string | undefined;
        const databaseRid = args?.database_rid as string | undefined;

        if (!instanceId || !location) {
            throw new Error(
                "Required arguments 'source_id' and 'location' not provided.\n" +
                "Usage: monk do namespace/account list-restorable-containers source_id=\"xxx\" location=\"East US\" database_rid=\"xxx\""
            );
        }

        try {
            const encodedLocation = location.replace(/ /g, '%20');
            let path = `/subscriptions/${this.definition.subscription_id}/providers/Microsoft.DocumentDB/locations/${encodedLocation}/restorableDatabaseAccounts/${instanceId}/restorableSqlContainers?api-version=${this.apiVersion}`;

            // Add database filter if provided
            if (databaseRid) {
                path += `&restorableSqlDatabaseRid=${databaseRid}`;
                cli.output(`Database RID filter: ${databaseRid}`);
            }

            cli.output(`Source ID: ${instanceId}`);
            cli.output(`Location: ${location}\n`);

            const response = this.makeAzureRequest("GET", path);

            if (response.error) {
                throw new Error(`API error: ${response.error}, body: ${response.body}`);
            }

            const data = this.parseResponseBody(response) as Record<string, unknown> | null;
            const containers = data?.value as unknown[] | undefined;

            if (!containers || containers.length === 0) {
                cli.output(`\nNo restorable containers found.`);
                cli.output(`==================================================`);
                return;
            }

            cli.output(`Found ${containers.length} restorable container(s):\n`);

            for (let i = 0; i < containers.length; i++) {
                const container = containers[i] as Record<string, unknown>;
                const props = container.properties as Record<string, unknown> | undefined;
                const resource = props?.resource as Record<string, unknown> | undefined;

                cli.output(`📄 Container #${i + 1}`);
                cli.output(`   Container Name: ${resource?.ownerId || 'N/A'}`);
                cli.output(`   Resource ID (rid): ${resource?._rid || 'N/A'}`);
                cli.output(`   Operation Type: ${resource?.operationType || 'N/A'}`);
                cli.output(`   Event Timestamp: ${resource?.eventTimestamp || 'N/A'}`);
                cli.output(``);
            }

            cli.output(`==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to list restorable containers`);
            throw new Error(`List restorable containers failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Restore a Cosmos DB account from a point-in-time backup
     * 
     * ⚠️ IMPORTANT: This creates a NEW account with the restored data.
     * The original account remains unchanged.
     * 
     * Usage:
     *   monk do namespace/account restore target_id="restored-cosmos" source_id="xxx" location="East US" restore_timestamp="2024-12-01T10:00:00Z"
     * 
     * @param args Required/Optional arguments:
     *   - target_id: Name for the new restored account (required)
     *   - source_id: Restorable account instance ID (required, from list-restorable-accounts)
     *   - location: Azure region for the restored account (required)
     *   - restore_timestamp: Point-in-time to restore to in ISO 8601 format (required)
     *   - target_resource_group: Resource group for restored account (default: current resource group)
     *   - databases_to_restore: JSON array of database names to restore (optional, restores all if not specified)
     */
    @action("restore")
    restoreAccount(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`🔄 RESTORE OPERATION`);
        cli.output(`==================================================`);

        // Validate required arguments (support old param names for backward compatibility)
        const targetAccountName = (args?.target_id || args?.target_account_name) as string | undefined;
        const instanceId = (args?.source_id || args?.instance_id) as string | undefined;
        const location = args?.location as string | undefined;
        const restoreTimestamp = args?.restore_timestamp as string | undefined;

        if (!targetAccountName) {
            throw new Error(
                "Required argument 'target_id' not provided.\n" +
                "This is the name for the NEW account that will be created with restored data.\n\n" +
                "Usage: monk do namespace/account restore target_id=\"restored-cosmos\" source_id=\"xxx\" location=\"East US\" restore_timestamp=\"2024-12-01T10:00:00Z\""
            );
        }

        if (!instanceId) {
            throw new Error(
                "Required argument 'source_id' not provided.\n" +
                "Get the source ID by running: monk do namespace/account list-restorable-accounts"
            );
        }

        if (!location) {
            throw new Error(
                "Required argument 'location' not provided.\n" +
                "Specify the Azure region for the restored account (e.g., location=\"East US\")"
            );
        }

        if (!restoreTimestamp) {
            throw new Error(
                "Required argument 'restore_timestamp' not provided.\n" +
                "Specify the point-in-time to restore to in ISO 8601 format (e.g., restore_timestamp=\"2024-12-01T10:00:00Z\")"
            );
        }

        const targetResourceGroup = (args?.target_resource_group as string) || this.definition.resource_group_name;
        const databasesToRestore = args?.databases_to_restore as string | undefined;

        cli.output(`\n⚠️  This will create a NEW Cosmos DB account with restored data.`);
        cli.output(`   The original account will NOT be modified.\n`);
        cli.output(`   Target Account Name: ${targetAccountName}`);
        cli.output(`   Target Resource Group: ${targetResourceGroup}`);
        cli.output(`   Source ID: ${instanceId}`);
        cli.output(`   Location: ${location}`);
        cli.output(`   Restore Timestamp: ${restoreTimestamp}`);

        try {
            // Build the restore request body
            const encodedLocation = location.replace(/ /g, '%20');
            const restoreSource = `/subscriptions/${this.definition.subscription_id}/providers/Microsoft.DocumentDB/locations/${encodedLocation}/restorableDatabaseAccounts/${instanceId}`;

            const restoreParameters: Record<string, unknown> = {
                restoreMode: "PointInTime",
                restoreSource: restoreSource,
                restoreTimestampInUtc: restoreTimestamp
            };

            // Parse and add databases to restore if specified
            if (databasesToRestore) {
                try {
                    const dbList = JSON.parse(databasesToRestore) as DatabaseRestoreResource[];
                    if (Array.isArray(dbList) && dbList.length > 0) {
                        restoreParameters.databasesToRestore = dbList.map(db => ({
                            databaseName: db.database_name,
                            collectionNames: db.container_names || []
                        }));
                        cli.output(`   Databases to restore: ${dbList.map(d => d.database_name).join(', ')}`);
                    }
                } catch (parseError) {
                    cli.output(`⚠️  Could not parse databases_to_restore, restoring all databases`);
                }
            } else {
                cli.output(`   Restoring: All databases and containers`);
            }

            const body = {
                location: location,
                properties: {
                    createMode: "Restore",
                    databaseAccountOfferType: "Standard",
                    locations: [{
                        locationName: location,
                        failoverPriority: 0
                    }],
                    restoreParameters: restoreParameters
                }
            };

            cli.output(`\n🚀 Initiating restore operation...`);
            cli.output(`==================================================`);

            const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${targetResourceGroup}/providers/Microsoft.DocumentDB/databaseAccounts/${targetAccountName}?api-version=${this.apiVersion}`;
            const response = this.makeAzureRequest("PUT", path, body);

            if (response.error) {
                throw new Error(`Restore failed: ${response.error}, body: ${response.body}`);
            }

            const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
            const properties = responseData?.properties as Record<string, unknown> | undefined;
            const provisioningState = properties?.provisioningState as string | undefined;

            cli.output(`\n✅ Restore operation initiated successfully!`);
            cli.output(`   New Account Name: ${targetAccountName}`);
            cli.output(`   Provisioning State: ${provisioningState || 'Creating'}`);
            cli.output(`\n⏳ Restore may take several minutes to hours depending on data size.`);
            cli.output(`   Monitor progress in Azure Portal or use Azure CLI:`);
            cli.output(`   az cosmosdb show --name ${targetAccountName} --resource-group ${targetResourceGroup}`);
            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Restore operation failed`);
            throw new Error(`Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
