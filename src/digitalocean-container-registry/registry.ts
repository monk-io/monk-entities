import { action, Args } from "monkec/base";
import { DOProviderEntity, DOProviderDefinitionBase, DOProviderStateBase } from "./do-provider-base.ts";
import { 
    RegistryRegion, 
    RegistrySubscriptionTier,
    validateRegistryRegion,
    validateSubscriptionTier,
    validateGarbageCollectionType
} from "./common.ts";
import cli from "cli";

/**
 * Defines the immutable configuration properties for a DigitalOcean Container Registry entity.
 */
export interface DigitalOceanContainerRegistryDefinition extends DOProviderDefinitionBase {
    /**
     * Registry name
     * @description Name of the container registry (3-63 characters, alphanumeric and hyphens only)
     */
    name: string;

    /**
     * Registry region
     * @description The DigitalOcean region where the registry will be created
     */
    region: RegistryRegion;

    /**
     * Subscription tier
     * @description The subscription tier for the registry (basic or professional). Note: starter tier only available via web interface.
     */
    subscription_tier: RegistrySubscriptionTier;

    /**
     * Storage quota in bytes (professional tier only)
     * @description Storage quota for the registry in bytes
     */
    storage_quota_bytes?: number;
}

/**
 * Represents the mutable runtime state of a DigitalOcean Container Registry.
 */
export interface DigitalOceanContainerRegistryState extends DOProviderStateBase {
    /**
     * Registry name
     */
    name?: string;

    /**
     * Registry region
     */
    region?: string;

    /**
     * Registry subscription tier
     */
    subscription_tier?: string;

    /**
     * Storage quota in bytes
     */
    storage_quota_bytes?: number;

    /**
     * Current storage usage in bytes
     */
    storage_usage_bytes?: number;

    /**
     * Registry endpoint URL
     */
    server_url?: string;

    /**
     * Creation timestamp
     */
    created_at?: string;
}

/**
 * DigitalOcean Container Registry entity for managing private Docker registries.
 * 
 * This entity provides complete lifecycle management for DigitalOcean container registries
 * including creation, updates, deletion, and monitoring operations.
 */
export class DigitalOceanContainerRegistry extends DOProviderEntity<
    DigitalOceanContainerRegistryDefinition,
    DigitalOceanContainerRegistryState
> {

    protected getEntityName(): string {
        return `DigitalOcean Container Registry: ${this.definition.name}`;
    }

    create(): void {
        cli.output(`🚀 Creating DigitalOcean Container Registry: ${this.definition.name}`);

        // Validate configuration
        const validatedRegion = validateRegistryRegion(this.definition.region);
        const validatedTier = validateSubscriptionTier(this.definition.subscription_tier);

        // Check if registry already exists
        const existingRegistry = this.findExistingRegistry();
        if (existingRegistry) {
            cli.output(`✅ Container Registry ${this.definition.name} already exists`);
            this.state.existing = true;
            this.updateStateFromRegistry(existingRegistry);
            return;
        }

        // Prepare registry creation request
        const createRequest: any = {
            name: this.definition.name,
            region: validatedRegion,
            subscription_tier_slug: validatedTier
        };

        // Add storage quota for professional tier
        if (validatedTier === "professional" && this.definition.storage_quota_bytes) {
            createRequest.storage_quota_bytes = this.definition.storage_quota_bytes;
        }

        try {
            const response = this.makeRequest("POST", "/registry", createRequest);
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                cli.output(`✅ Container Registry created successfully: ${this.state.name}`);
                cli.output(`   Region: ${this.state.region}`);
                if (this.state.server_url) {
                    cli.output(`   Server URL: ${this.state.server_url}`);
                } else {
                    cli.output(`   Server URL: (will be available shortly)`);
                }
                
                // Log subscription info if available
                if (response.subscription) {
                    cli.output(`   Subscription Tier: ${response.subscription.tier.name} (${response.subscription.tier.slug})`);
                    cli.output(`   Monthly Price: $${response.subscription.tier.monthly_price_in_cents / 100}`);
                }
            } else {
                throw new Error("Invalid response from DigitalOcean API - no registry object returned");
            }
        } catch (error) {
            throw new Error(`Failed to create container registry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    update(): void {
        // First, try to get current registry info if state is not initialized
        if (!this.state.name) {
            cli.output(`🔍 Registry state not initialized, fetching current registry info...`);
            const existingRegistry = this.findExistingRegistry();
            if (existingRegistry) {
                this.updateStateFromRegistry(existingRegistry);
                this.state.existing = true;
            } else {
                cli.output("⚪ No existing registry found, nothing to update");
                return;
            }
        }

        cli.output(`🔄 Checking for DigitalOcean Container Registry updates: ${this.state.name}`);

        let hasUpdates = false;

        // Check if subscription tier changed
        if (this.definition.subscription_tier !== this.state.subscription_tier) {
            cli.output(`📊 Updating subscription tier to: ${this.definition.subscription_tier}`);
            try {
                const updateRequest: any = {
                    subscription_tier_slug: validateSubscriptionTier(this.definition.subscription_tier)
                };

                // Add storage quota for professional tier
                if (this.definition.subscription_tier === "professional" && this.definition.storage_quota_bytes) {
                    updateRequest.storage_quota_bytes = this.definition.storage_quota_bytes;
                }

                this.makeRequest("PATCH", "/registry", updateRequest);
                cli.output(`✅ Registry subscription tier updated`);
                hasUpdates = true;
            } catch (error) {
                throw new Error(`Failed to update subscription tier: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        // Check if storage quota changed (professional tier only)
        else if (this.definition.subscription_tier === "professional" && 
                 this.definition.storage_quota_bytes && 
                 this.definition.storage_quota_bytes !== this.state.storage_quota_bytes) {
            cli.output(`💾 Updating storage quota to: ${this.definition.storage_quota_bytes} bytes`);
            try {
                this.makeRequest("PATCH", "/registry", {
                    storage_quota_bytes: this.definition.storage_quota_bytes
                });
                cli.output(`✅ Registry storage quota updated`);
                hasUpdates = true;
            } catch (error) {
                throw new Error(`Failed to update storage quota: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }

        if (!hasUpdates) {
            cli.output("⚪ No supported changes detected, skipping update");
            return;
        }

        // Refresh state after update
        try {
            const response = this.makeRequest("GET", "/registry");
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                cli.output(`✅ Container Registry updated successfully`);
            }
        } catch (error) {
            cli.output(`⚠️  Update completed but failed to refresh state: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    delete(): void {
        if (!this.state.name) {
            cli.output("⚪ No registry name in state, nothing to delete");
            return;
        }

        this.deleteResource(`/registry`, `container registry ${this.state.name}`);
        
        // Clear state after successful deletion
        this.state.name = undefined;
        this.state.server_url = undefined;
        this.state.storage_usage_bytes = undefined;
    }

    checkReadiness(): boolean {
        if (!this.state.name) {
            return false;
        }

        try {
            const response = this.makeRequest("GET", "/registry");
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                
                // Registry is ready if it has a server URL
                const isReady = !!this.state.server_url;
                if (isReady) {
                    cli.output(`✅ Container Registry ${this.state.name} is ready`);
                } else {
                    cli.output(`⏳ Container Registry ${this.state.name} is still being set up`);
                }
                
                return isReady;
            }
            
            return false;
        } catch (error) {
            cli.output(`❌ Failed to check registry readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    /**
     * Get current registry information
     */
    @action()
    getRegistry(_args: Args): any {
        cli.output("🔍 Starting getRegistry action...");
        try {
            cli.output("📡 Making API request to /registry...");
            const response = this.makeRequest("GET", "/registry");
            cli.output(`📦 Got response: ${JSON.stringify(response, null, 2)}`);
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                
                cli.output(`📊 Container Registry Information:`);
                cli.output(`   Name: ${response.registry.name}`);
                cli.output(`   Region: ${response.registry.region}`);
                cli.output(`   Subscription Tier: ${response.registry.subscription_tier}`);
                cli.output(`   Server URL: ${response.registry.server_url}`);
                cli.output(`   Created: ${response.registry.created_at}`);
                
                if (response.registry.storage_quota_bytes) {
                    cli.output(`   Storage Quota: ${response.registry.storage_quota_bytes} bytes`);
                }
                
                if (response.registry.storage_usage_bytes !== undefined) {
                    cli.output(`   Storage Usage: ${response.registry.storage_usage_bytes} bytes`);
                }
                
                const result = `Registry: ${response.registry.name} in ${response.registry.region}`;
                cli.output(`🎯 Returning result: ${result}`);
                return result;
            } else {
                cli.output("❌ No registry found in response");
                throw new Error("Registry not found");
            }
        } catch (error) {
            cli.output(`💥 Error in getRegistry: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`Failed to get registry info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all repositories in the registry
     */
    @action()
    listRepositories(_args: Args): any {
        try {
            const response = this.makeRequest("GET", "/registry/repositories");
            const repositories = response.repositories || [];
            
            cli.output(`📋 Repositories in registry "${this.state.name}" (${repositories.length} total):`);
            
            if (repositories.length === 0) {
                cli.output("   No repositories found");
            } else {
                repositories.forEach((repo: any, index: number) => {
                    cli.output(`   ${index + 1}. ${repo.name} (${repo.tag_count} tags)`);
                });
            }
            
            cli.output(`\nRegistry: ${this.state.name}`);
            cli.output(`Server URL: ${this.state.server_url}`);
            
            return response;
        } catch (error) {
            throw new Error(`Failed to list repositories: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get Docker credentials for the registry
     */
    @action()
    getDockerCredentials(_args: Args): any {
        try {
            const response = this.makeRequest("GET", "/registry/docker-credentials");
            
            cli.output(`🔑 Docker Credentials for registry "${this.state.name}":`);
            
            if (response.auths) {
                Object.keys(response.auths).forEach(server => {
                    const auth = response.auths[server];
                    cli.output(`\n   Server: ${server}`);
                    cli.output(`   Username: ${auth.username || 'N/A'}`);
                    cli.output(`   Password: ${auth.password ? '[HIDDEN]' : 'N/A'}`);
                    cli.output(`   Auth: ${auth.auth ? '[HIDDEN]' : 'N/A'}`);
                });
            }
            
            cli.output(`\n💡 Use these credentials to authenticate with your registry:`);
            cli.output(`   docker login ${this.state.server_url}`);
            
            return response;
        } catch (error) {
            throw new Error(`Failed to get Docker credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Run garbage collection on the registry
     */
    @action()
    runGarbageCollection(args: Args): void {
        const gcType = args.type || "untagged_manifests_only";
        
        try {
            const validatedType = validateGarbageCollectionType(gcType);
            
            cli.output(`🗑️  Starting garbage collection...`);
            cli.output(`   Type: ${validatedType}`);
            
            const response = this.makeRequest("POST", "/registry/garbage-collection", {
                type: validatedType
            });
            
            if (response.garbage_collection) {
                cli.output(`✅ Garbage collection started successfully`);
                cli.output(`   UUID: ${response.garbage_collection.uuid}`);
                cli.output(`   Status: ${response.garbage_collection.status}`);
                cli.output(`   Created: ${response.garbage_collection.created_at}`);
            }
        } catch (error) {
            throw new Error(`Failed to run garbage collection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get storage usage statistics
     */
    @action()
    getStorageUsage(_args: Args): any {
        try {
            const response = this.makeRequest("GET", "/registry");
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                
                const usageMB = response.registry.storage_usage_bytes !== undefined ? 
                    Math.round(response.registry.storage_usage_bytes / (1024 * 1024)) : null;
                const quotaMB = response.registry.storage_quota_bytes ? 
                    Math.round(response.registry.storage_quota_bytes / (1024 * 1024)) : null;
                const usagePercent = (response.registry.storage_usage_bytes !== undefined && response.registry.storage_quota_bytes) ? 
                    Math.round((response.registry.storage_usage_bytes / response.registry.storage_quota_bytes) * 100) : null;
                
                cli.output(`💾 Storage Usage for registry "${response.registry.name}":`);
                
                if (response.registry.storage_usage_bytes !== undefined) {
                    cli.output(`   Current Usage: ${response.registry.storage_usage_bytes} bytes (${usageMB} MB)`);
                } else {
                    cli.output(`   Current Usage: Not available`);
                }
                
                if (response.registry.storage_quota_bytes) {
                    cli.output(`   Storage Quota: ${response.registry.storage_quota_bytes} bytes (${quotaMB} MB)`);
                    
                    if (usagePercent !== null) {
                        cli.output(`   Usage Percentage: ${usagePercent}%`);
                    }
                } else {
                    cli.output(`   Storage Quota: Unlimited (Basic tier)`);
                }
                
                return response;
            }
        } catch (error) {
            throw new Error(`Failed to get storage usage: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Create a new container registry
     */
    @action()
    createRegistry(args: Args): any {
        cli.output("🚀 Creating Container Registry via action...");
        
        // Use definition values or args for configuration
        const registryName = args.name || this.definition.name;
        const region = args.region || this.definition.region;
        const subscriptionTier = args.subscription_tier || this.definition.subscription_tier;
        const storageQuota = args.storage_quota_bytes || this.definition.storage_quota_bytes;
        
        try {
            // Check if registry already exists
            const existingRegistry = this.findExistingRegistry();
            if (existingRegistry) {
                cli.output(`✅ Container Registry already exists: ${existingRegistry.name}`);
                this.updateStateFromRegistry(existingRegistry);
                return {
                    status: "exists",
                    registry: existingRegistry
                };
            }

            if (!registryName || !region || !subscriptionTier) {
                throw new Error("Missing required parameters: name, region, and subscription_tier are required");
            }

            // Validate configuration
            const validatedRegion = validateRegistryRegion(region);
            const validatedTier = validateSubscriptionTier(subscriptionTier);

            // Prepare registry creation request
            const createRequest: any = {
                name: registryName,
                region: validatedRegion,
                subscription_tier_slug: validatedTier
            };

            // Add storage quota for professional tier
            if (validatedTier === "professional" && storageQuota) {
                createRequest.storage_quota_bytes = storageQuota;
            }

            cli.output(`📋 Creating registry with configuration:`);
            cli.output(`   Name: ${registryName}`);
            cli.output(`   Region: ${validatedRegion}`);
            cli.output(`   Subscription Tier: ${validatedTier}`);
            if (createRequest.storage_quota_bytes) {
                cli.output(`   Storage Quota: ${createRequest.storage_quota_bytes} bytes`);
            }

            const response = this.makeRequest("POST", "/registry", createRequest);
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                cli.output(`✅ Container Registry created successfully: ${response.registry.name}`);
                cli.output(`   Region: ${response.registry.region}`);
                if (response.registry.server_url) {
                    cli.output(`   Server URL: ${response.registry.server_url}`);
                } else {
                    cli.output(`   Server URL: (will be available shortly)`);
                }
                
                // Log subscription info if available
                if (response.subscription) {
                    cli.output(`   Subscription Tier: ${response.subscription.tier.name} (${response.subscription.tier.slug})`);
                    cli.output(`   Monthly Price: $${response.subscription.tier.monthly_price_in_cents / 100}`);
                }
                
                return {
                    status: "created",
                    registry: response.registry,
                    subscription: response.subscription
                };
            } else {
                throw new Error("Invalid response from DigitalOcean API - no registry object returned");
            }
        } catch (error) {
            // Handle specific error cases
            if (error instanceof Error) {
                // Handle 409 Conflict - registry name already exists
                if (error.message.includes("409") && error.message.includes("Conflict")) {
                    cli.output(`⚠️  Registry name already exists. This might be due to:`);
                    cli.output(`   1. Registry exists in another region`);
                    cli.output(`   2. Registry name is reserved`);
                    cli.output(`   3. Registry was recently deleted (names have cooldown period)`);
                    
                    // Try to get the existing registry info with more detailed error handling
                    try {
                        const existingRegistry = this.findExistingRegistry();
                        if (existingRegistry) {
                            cli.output(`✅ Found existing registry: ${existingRegistry.name}`);
                            this.updateStateFromRegistry(existingRegistry);
                            return {
                                status: "exists",
                                registry: existingRegistry,
                                message: "Registry with this name already exists"
                            };
                        } else {
                            cli.output(`❌ No registry found in account, but name "${registryName}" is not available`);
                            return {
                                status: "name_unavailable",
                                message: `Registry name "${registryName}" is not available. Try a different name or check if it was recently deleted.`,
                                suggested_action: "Try a different registry name"
                            };
                        }
                    } catch (checkError) {
                        cli.output(`⚠️  Unable to check existing registries: ${checkError instanceof Error ? checkError.message : 'Unknown error'}`);
                        return {
                            status: "name_unavailable",
                            message: `Registry name "${registryName}" is not available. Try a different name.`,
                            suggested_action: "Try a different registry name"
                        };
                    }
                }
                
                cli.output(`❌ Failed to create registry: ${error.message}`);
                throw new Error(`Failed to create container registry: ${error.message}`);
            }
            
            throw error;
        }
    }

    /**
     * Delete the container registry
     */
    @action()
    deleteRegistry(_args: Args): any {
        cli.output("🗑️  Deleting Container Registry via action...");
        
        try {
            // Check if registry exists
            const existingRegistry = this.findExistingRegistry();
            if (!existingRegistry) {
                cli.output("⚪ No registry found to delete");
                return {
                    status: "not_found",
                    message: "No registry found to delete"
                };
            }

            cli.output(`🔍 Found registry to delete: ${existingRegistry.name}`);
            
            // Perform deletion
            this.makeRequest("DELETE", "/registry");
            
            // Clear state after successful deletion
            this.state.name = undefined;
            this.state.server_url = undefined;
            this.state.storage_usage_bytes = undefined;
            this.state.region = undefined;
            this.state.subscription_tier = undefined;
            this.state.storage_quota_bytes = undefined;
            this.state.created_at = undefined;
            
            cli.output(`✅ Container Registry deleted successfully: ${existingRegistry.name}`);
            
            return {
                status: "deleted",
                registry_name: existingRegistry.name
            };
        } catch (error) {
            cli.output(`❌ Failed to delete registry: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`Failed to delete container registry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all container registries (DigitalOcean allows only one per account)
     */
    @action()
    listRegistries(_args: Args): any {
        cli.output("📋 Listing Container Registries...");
        
        try {
            const existingRegistry = this.findExistingRegistry();
            
            if (!existingRegistry) {
                cli.output("⚪ No container registries found");
                return {
                    registries: [],
                    count: 0
                };
            }

            cli.output(`📊 Container Registry Information:`);
            cli.output(`   Name: ${existingRegistry.name}`);
            cli.output(`   Region: ${existingRegistry.region}`);
            cli.output(`   Subscription Tier: ${existingRegistry.subscription_tier}`);
            cli.output(`   Server URL: ${existingRegistry.server_url}`);
            cli.output(`   Created: ${existingRegistry.created_at}`);
            
            if (existingRegistry.storage_quota_bytes) {
                const quotaMB = Math.round(existingRegistry.storage_quota_bytes / (1024 * 1024));
                cli.output(`   Storage Quota: ${existingRegistry.storage_quota_bytes} bytes (${quotaMB} MB)`);
            }
            
            if (existingRegistry.storage_usage_bytes !== undefined) {
                const usageMB = Math.round(existingRegistry.storage_usage_bytes / (1024 * 1024));
                cli.output(`   Storage Usage: ${existingRegistry.storage_usage_bytes} bytes (${usageMB} MB)`);
            }

            return {
                registries: [existingRegistry],
                count: 1
            };
        } catch (error) {
            cli.output(`❌ Failed to list registries: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`Failed to list container registries: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find existing registry (DigitalOcean allows only one registry per account)
     */
    private findExistingRegistry(): any | null {
        try {
            cli.output("🔍 Checking for existing registry...");
            const response = this.makeRequest("GET", "/registry");
            
            // DigitalOcean only allows one registry per account
            if (response.registry) {
                cli.output(`✅ Found existing registry: ${response.registry.name} in ${response.registry.region}`);
                return response.registry;
            }
            
            cli.output("⚪ No existing registry found");
            return null;
        } catch (error) {
            // If we can't get registry info, assume it doesn't exist
            if (error instanceof Error) {
                cli.output(`⚠️  Error checking for existing registry: ${error.message}`);
                
                // If it's a 404, that's expected when no registry exists
                if (error.message.includes("404")) {
                    cli.output("⚪ No registry configured for this account (404 response)");
                    return null;
                }
            }
            
            cli.output("⚠️  Unable to check for existing registry, assuming none exists");
            return null;
        }
    }

    /**
     * Update internal state from registry object
     */
    private updateStateFromRegistry(registry: any): void {
        this.state.name = registry.name;
        this.state.region = registry.region;
        this.state.subscription_tier = registry.subscription_tier;
        this.state.storage_quota_bytes = registry.storage_quota_bytes;
        this.state.storage_usage_bytes = registry.storage_usage_bytes;
        this.state.server_url = registry.server_url;
        this.state.created_at = registry.created_at;
    }
}
