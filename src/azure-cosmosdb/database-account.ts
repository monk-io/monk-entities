import { AzureCosmosDBEntity, AzureCosmosDBDefinition, AzureCosmosDBState } from "./azure-cosmosdb-base.ts";
import cli from "cli";
import secret from "secret";

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
}

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
            this.state = {
                account_name: typeof existingAccount.name === 'string' ? existingAccount.name : this.definition.account_name,
                provisioning_state: typeof properties?.provisioningState === 'string' ? properties.provisioningState : undefined,
                document_endpoint: typeof properties?.documentEndpoint === 'string' ? properties.documentEndpoint : undefined,
                write_locations: Array.isArray(properties?.writeLocations) ? properties.writeLocations : undefined,
                read_locations: Array.isArray(properties?.readLocations) ? properties.readLocations : undefined,
                existing: true
            };
            cli.output(`✅ Database account ${this.definition.account_name} already exists`);
            
            // Populate secrets if secret references are provided
            this.populateAccountSecrets();
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
        
        // Populate secrets if secret references are provided
        this.populateAccountSecrets();
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
            properties: Record<string, unknown>;
            tags?: Record<string, string>;
        } = {
            properties: {}
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
                        } catch (_error) {
                            cli.output(`⚠️  Failed to save primary key to secret: ${this.definition.primary_key_secret_ref}`);
                        }
                    }

                    // Save secondary key if reference is provided
                    if (this.definition.secondary_key_secret_ref && typeof keysData.secondaryMasterKey === 'string') {
                        try {
                            secret.set(this.definition.secondary_key_secret_ref, keysData.secondaryMasterKey);
                            cli.output(`🔑 Saved secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                        } catch (_error) {
                            cli.output(`⚠️  Failed to save secondary key to secret: ${this.definition.secondary_key_secret_ref}`);
                        }
                    }
                } else {
                    cli.output(`⚠️  No keys data received from Azure API`);
                }
            } catch (_error) {
                cli.output(`⚠️  Failed to fetch access keys from Azure`);
            }
        }
    }
}
