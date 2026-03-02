import { AzureStorageEntity, AzureStorageDefinition, AzureStorageState } from "./azure-storage-account-base.ts";
import cli from "cli";
import { action, Args } from "monkec/base";

/**
 * Definition interface for Azure Blob Container.
 * Configures blob container properties including access level and metadata.
 * @interface BlobContainerDefinition
 */
export interface BlobContainerDefinition extends AzureStorageDefinition {
    /**
     * @description Name of the parent storage account
     */
    storage_account_name: string;

    /**
     * @description Blob container name (3-63 chars, lowercase letters, numbers, and hyphens)
     * @minLength 3
     * @maxLength 63
     * @pattern ^[a-z0-9](-?[a-z0-9])*$
     */
    container_name: string;

    /**
     * @description Public access level for the container
     * - None: No public access (default)
     * - Blob: Public read access for blobs only
     * - Container: Public read access for container and blobs
     * @default "None"
     */
    public_access?: "None" | "Blob" | "Container";

    /**
     * @description Default encryption scope for the container
     */
    default_encryption_scope?: string;

    /**
     * @description Deny encryption scope override (requires default_encryption_scope to be set)
     */
    deny_encryption_scope_override?: boolean;

    /**
     * @description Enable immutable storage with versioning
     */
    enable_immutable_storage_with_versioning?: boolean;

    /**
     * @description Container metadata as key-value pairs
     */
    metadata?: Record<string, string>;
}

/**
 * State interface for Azure Blob Container.
 * Contains runtime information about the created blob container.
 * @interface BlobContainerState
 */
export interface BlobContainerState extends AzureStorageState {
    /**
     * @description Container name (primary identifier)
     */
    container_name?: string;

    /**
     * @description Parent storage account name
     */
    storage_account_name?: string;

    /**
     * @description Container ETag
     */
    etag?: string;

    /**
     * @description Last modified time
     */
    last_modified?: string;

    /**
     * @description Lease state of the container
     */
    lease_state?: string;

    /**
     * @description Public access level
     */
    public_access?: string;

    /**
     * @description Whether the container has immutability policy
     */
    has_immutability_policy?: boolean;

    /**
     * @description Whether the container has legal hold
     */
    has_legal_hold?: boolean;
}

/**
 * @description Azure Blob Container entity.
 * Creates and manages Azure Blob Storage containers within a storage account.
 * Supports public access configuration, encryption scopes, and immutable storage.
 * 
 * ## Secrets
 * - Reads: none (authenticated via Azure provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.container_name` - Blob container name
 * - `state.storage_account_name` - Parent storage account name
 * - `state.public_access` - Current public access level
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `azure-storage-account/storage-account` - Parent storage account
 */
export class BlobContainer extends AzureStorageEntity<BlobContainerDefinition, BlobContainerState> {

    protected getEntityName(): string {
        return `${this.definition.storage_account_name}/${this.definition.container_name}`;
    }

    protected getResourceType(): string {
        return "storageAccounts";
    }

    /**
     * Build the resource path for blob container API calls
     */
    protected override buildResourcePath(containerName: string): string {
        return `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.storage_account_name}/blobServices/default/containers/${containerName}?api-version=${this.apiVersion}`;
    }

    /** Create a new Azure Blob Container */
    override create(): void {
        // Check if container already exists
        const existingContainer = this.checkResourceExists(this.definition.container_name);

        if (existingContainer) {
            // Container already exists, use it
            const properties = existingContainer.properties as Record<string, unknown> | undefined;
            
            this.state = {
                container_name: typeof existingContainer.name === 'string' ? existingContainer.name : this.definition.container_name,
                storage_account_name: this.definition.storage_account_name,
                etag: typeof existingContainer.etag === 'string' ? existingContainer.etag : undefined,
                last_modified: typeof properties?.lastModifiedTime === 'string' ? properties.lastModifiedTime : undefined,
                lease_state: typeof properties?.leaseState === 'string' ? properties.leaseState : undefined,
                public_access: typeof properties?.publicAccess === 'string' ? properties.publicAccess : 'None',
                has_immutability_policy: typeof properties?.hasImmutabilityPolicy === 'boolean' ? properties.hasImmutabilityPolicy : false,
                has_legal_hold: typeof properties?.hasLegalHold === 'boolean' ? properties.hasLegalHold : false,
                existing: true
            };
            cli.output(`✅ Blob container ${this.definition.container_name} already exists`);
            return;
        }

        // Skip creation if create_when_missing is false and resource doesn't exist
        if (this.definition.create_when_missing === false) {
            cli.output(`⚠️  Blob container ${this.definition.container_name} does not exist and create_when_missing is false`);
            this.state = { existing: false };
            return;
        }

        // Prepare request body for container creation
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {}
        };

        // Add public access level
        if (this.definition.public_access !== undefined) {
            body.properties.publicAccess = this.definition.public_access;
        }

        // Add encryption scope settings (only if encryption scope is specified)
        if (this.definition.default_encryption_scope) {
            body.properties.defaultEncryptionScope = this.definition.default_encryption_scope;
            // Only set deny override if encryption scope is specified
            if (this.definition.deny_encryption_scope_override === true) {
                body.properties.denyEncryptionScopeOverride = true;
            }
        }

        // Add immutable storage setting (only if explicitly enabled)
        if (this.definition.enable_immutable_storage_with_versioning === true) {
            body.properties.immutableStorageWithVersioning = {
                enabled: true
            };
        }

        // Add metadata
        if (this.definition.metadata) {
            body.properties.metadata = this.definition.metadata;
        }

        // Create the container
        const path = this.buildResourcePath(this.definition.container_name);
        const response = this.makeAzureRequest("PUT", path, body);

        if (response.error) {
            throw new Error(`Failed to create blob container: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Set state from created container
        const properties = responseData?.properties as Record<string, unknown> | undefined;
        
        this.state = {
            container_name: this.definition.container_name,
            storage_account_name: this.definition.storage_account_name,
            etag: typeof responseData?.etag === 'string' ? responseData.etag : undefined,
            last_modified: typeof properties?.lastModifiedTime === 'string' ? properties.lastModifiedTime : undefined,
            lease_state: typeof properties?.leaseState === 'string' ? properties.leaseState : undefined,
            public_access: typeof properties?.publicAccess === 'string' ? properties.publicAccess : 'None',
            has_immutability_policy: typeof properties?.hasImmutabilityPolicy === 'boolean' ? properties.hasImmutabilityPolicy : false,
            has_legal_hold: typeof properties?.hasLegalHold === 'boolean' ? properties.hasLegalHold : false,
            existing: false
        };

        cli.output(`✅ Created Azure Blob container: ${this.definition.container_name}`);
    }

    override update(): void {
        if (!this.state.container_name) {
            this.create();
            return;
        }

        // Prepare update body
        const body: {
            properties: Record<string, unknown>;
        } = {
            properties: {}
        };

        let hasChanges = false;

        // Update public access level
        if (this.definition.public_access !== undefined) {
            body.properties.publicAccess = this.definition.public_access;
            hasChanges = true;
        }

        // Update metadata
        if (this.definition.metadata) {
            body.properties.metadata = this.definition.metadata;
            hasChanges = true;
        }

        // Skip update if nothing has changed
        if (!hasChanges) {
            cli.output(`ℹ️  No changes detected for blob container: ${this.definition.container_name}`);
            return;
        }

        const path = this.buildResourcePath(this.definition.container_name);
        const response = this.makeAzureRequest("PATCH", path, body);

        if (response.error) {
            throw new Error(`Failed to update blob container: ${response.error}, body: ${response.body}`);
        }

        const responseData = this.parseResponseBody(response) as Record<string, unknown> | null;
        
        // Update state
        if (responseData) {
            const properties = responseData.properties as Record<string, unknown> | undefined;
            this.state.etag = typeof responseData.etag === 'string' ? responseData.etag : undefined;
            this.state.last_modified = typeof properties?.lastModifiedTime === 'string' ? properties.lastModifiedTime : undefined;
            this.state.public_access = typeof properties?.publicAccess === 'string' ? properties.publicAccess : 'None';
        }

        cli.output(`✅ Updated Azure Blob container: ${this.definition.container_name}`);
    }

    override delete(): void {
        if (!this.state.container_name) {
            cli.output("Blob container does not exist, nothing to delete");
            return;
        }

        this.deleteResource(this.definition.container_name);
    }

    override checkReadiness(): boolean {
        // If create_when_missing is false and resource doesn't exist, consider it ready
        // Check this first before checking state.container_name since state may only have { existing: false }
        if (this.definition.create_when_missing === false && this.state.existing === false) {
            cli.output(`✅ Blob container ${this.definition.container_name} not created (create_when_missing is false)`);
            return true;
        }

        if (!this.state.container_name) {
            cli.output(`⏳ Blob container not yet created`);
            return false;
        }

        try {
            // Check if container exists
            const container = this.checkResourceExists(this.definition.container_name);
            
            if (!container) {
                cli.output(`⏳ Blob container ${this.definition.container_name} not found`);
                return false;
            }

            // Containers are ready immediately after creation
            cli.output(`✅ Blob container ${this.definition.container_name} is ready`);
            
            // Update state with current information
            const properties = container.properties as Record<string, unknown> | undefined;
            this.state.etag = typeof container.etag === 'string' ? container.etag : undefined;
            this.state.last_modified = typeof properties?.lastModifiedTime === 'string' ? properties.lastModifiedTime : undefined;
            this.state.lease_state = typeof properties?.leaseState === 'string' ? properties.leaseState : undefined;
            this.state.public_access = typeof properties?.publicAccess === 'string' ? properties.publicAccess : 'None';
            
            return true;
        } catch (error) {
            cli.output(`⚠️  Failed to check blob container readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { 
        return this.checkReadiness(); 
    }

    // ========================================
    // Custom Actions
    // ========================================

    /**
     * Get detailed information about the blob container
     * 
     * Usage:
     *   monk do namespace/blob-container get-info
     */
    @action("get-info")
    getInfo(_args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`📦 Blob Container Information`);
        cli.output(`==================================================`);

        if (!this.state.container_name) {
            throw new Error("Blob container does not exist. Create the container first.");
        }

        try {
            const container = this.checkResourceExists(this.definition.container_name);
            
            if (!container) {
                throw new Error(`Blob container ${this.definition.container_name} not found`);
            }

            const properties = container.properties as Record<string, unknown> | undefined;

            cli.output(`\n📋 Basic Information:`);
            cli.output(`   Name: ${container.name}`);
            cli.output(`   Storage Account: ${this.definition.storage_account_name}`);
            cli.output(`   ETag: ${container.etag}`);
            cli.output(`   Last Modified: ${properties?.lastModifiedTime || 'N/A'}`);

            cli.output(`\n🔒 Access Settings:`);
            cli.output(`   Public Access: ${properties?.publicAccess || 'None'}`);
            cli.output(`   Lease State: ${properties?.leaseState || 'N/A'}`);
            cli.output(`   Lease Status: ${properties?.leaseStatus || 'N/A'}`);

            cli.output(`\n📊 Policies:`);
            cli.output(`   Has Immutability Policy: ${properties?.hasImmutabilityPolicy || false}`);
            cli.output(`   Has Legal Hold: ${properties?.hasLegalHold || false}`);
            cli.output(`   Immutable Storage with Versioning: ${properties?.immutableStorageWithVersioning ? 'Enabled' : 'Disabled'}`);

            if (properties?.defaultEncryptionScope) {
                cli.output(`\n🔐 Encryption:`);
                cli.output(`   Default Encryption Scope: ${properties.defaultEncryptionScope}`);
                cli.output(`   Deny Encryption Scope Override: ${properties.denyEncryptionScopeOverride || false}`);
            }

            const metadata = properties?.metadata as Record<string, string> | undefined;
            if (metadata && Object.keys(metadata).length > 0) {
                cli.output(`\n🏷️  Metadata:`);
                for (const [key, value] of Object.entries(metadata)) {
                    cli.output(`   ${key}: ${value}`);
                }
            }

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to get blob container info`);
            throw new Error(`Get info failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Set legal hold on the container
     * 
     * Usage:
     *   monk do namespace/blob-container set-legal-hold enabled="true"
     * 
     * @param args Required arguments:
     *   - enabled: Whether to enable or disable legal hold ("true" or "false")
     */
    @action("set-legal-hold")
    setLegalHold(args?: Args): void {
        cli.output(`==================================================`);
        cli.output(`⚖️  Set Legal Hold`);
        cli.output(`==================================================`);

        if (!this.state.container_name) {
            throw new Error("Blob container does not exist. Create the container first.");
        }

        const enabled = args?.enabled as string | undefined;
        if (enabled === undefined || (enabled !== "true" && enabled !== "false")) {
            throw new Error(
                "Required argument 'enabled' not provided or invalid.\n" +
                "Usage: monk do namespace/blob-container set-legal-hold enabled=\"true\"\n" +
                "Valid values: true, false"
            );
        }

        try {
            // Azure requires different endpoints for setting vs clearing legal hold
            // setLegalHold only adds tags, clearLegalHold removes them
            if (enabled === "true") {
                const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.storage_account_name}/blobServices/default/containers/${this.definition.container_name}/setLegalHold?api-version=${this.apiVersion}`;
                const body = { tags: ["legal-hold"] };
                
                const response = this.makeAzureRequest("POST", path, body);

                if (response.error) {
                    throw new Error(`API error: ${response.error}, body: ${response.body}`);
                }
            } else {
                // Use clearLegalHold endpoint to remove legal hold tags
                const path = `/subscriptions/${this.definition.subscription_id}/resourceGroups/${this.definition.resource_group_name}/providers/Microsoft.Storage/storageAccounts/${this.definition.storage_account_name}/blobServices/default/containers/${this.definition.container_name}/clearLegalHold?api-version=${this.apiVersion}`;
                const body = { tags: ["legal-hold"] };
                
                const response = this.makeAzureRequest("POST", path, body);

                if (response.error) {
                    throw new Error(`API error: ${response.error}, body: ${response.body}`);
                }
            }

            cli.output(`\n✅ Legal hold ${enabled === "true" ? "enabled" : "disabled"} on container ${this.definition.container_name}`);
            this.state.has_legal_hold = enabled === "true";

            cli.output(`\n==================================================`);
        } catch (error) {
            cli.output(`\n❌ Failed to set legal hold`);
            throw new Error(`Set legal hold failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
