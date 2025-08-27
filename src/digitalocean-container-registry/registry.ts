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

    /**
     * Docker registry username (email)
     */
    username?: string;
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
        // Validate configuration
        const validatedRegion = validateRegistryRegion(this.definition.region);
        const validatedTier = validateSubscriptionTier(this.definition.subscription_tier);

        // Check if any registry already exists (DigitalOcean allows only one per account)
        const existingRegistry = this.findExistingRegistry();
        if (existingRegistry) {
            // If the existing registry has the same name, just use it
            if (existingRegistry.name === this.definition.name) {
                cli.output(`✅ Container Registry ${this.definition.name} already exists in ${existingRegistry.region}`);
                this.state.existing = true;
                this.updateStateFromRegistry(existingRegistry);
                
                // Fetch and store username for Docker authentication
                const username = this.fetchUsername();
                if (username) {
                    this.state.username = username;
                }
                
                return;
            } else {
                // Different name - DigitalOcean only allows one registry per account
                cli.output(`⚠️  Registry "${existingRegistry.name}" already exists. DigitalOcean allows only one registry per account. Using existing registry.`);
                this.state.existing = true;
                this.updateStateFromRegistry(existingRegistry);
                
                // Fetch and store username for Docker authentication
                const username = this.fetchUsername();
                if (username) {
                    this.state.username = username;
                }
                
                return;
            }
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
                
                // Fetch and store username for Docker authentication
                const username = this.fetchUsername();
                if (username) {
                    this.state.username = username;
                }
                
                const serverUrl = this.state.server_url || `registry.digitalocean.com/${this.state.name}`;
                let subscriptionInfo = "";
                if (response.subscription) {
                    subscriptionInfo = ` | Tier: ${response.subscription.tier.name} | Price: $${response.subscription.tier.monthly_price_in_cents / 100}/month`;
                }
                
                cli.output(`✅ Registry created: ${this.state.name} | Region: ${this.state.region} | Server: ${serverUrl}${subscriptionInfo}`);
            } else {
                throw new Error("Invalid response from DigitalOcean API - no registry object returned");
            }
        } catch (error) {
            // Handle 409 Conflict - this means a registry with this name already exists
            if (error instanceof Error && error.message.includes("409") && error.message.includes("Conflict")) {
                // Try to find and use the existing registry
                const conflictRegistry = this.findExistingRegistry();
                if (conflictRegistry) {
                    cli.output(`✅ Using existing registry: ${conflictRegistry.name} in ${conflictRegistry.region}`);
                    this.state.existing = true;
                    this.updateStateFromRegistry(conflictRegistry);
                    
                    // Fetch and store username for Docker authentication
                    const username = this.fetchUsername();
                    if (username) {
                        this.state.username = username;
                    }
                    
                    return;
                } else {
                    throw new Error(`Registry name "${this.definition.name}" is already taken but registry is not accessible`);
                }
            }
            throw new Error(`Failed to create container registry: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    update(): void {
        // First, check if registry exists in DigitalOcean account
        const existingRegistry = this.findExistingRegistry();
        
        if (existingRegistry) {
            // Registry exists, update our state
            this.updateStateFromRegistry(existingRegistry);
            this.state.existing = true;
            
            // Fetch and store username for Docker authentication
            const username = this.fetchUsername();
            if (username) {
                this.state.username = username;
            }
            
            // Check for configuration differences and warn about recreating
            let warnings: string[] = [];
            if (this.definition.subscription_tier !== this.state.subscription_tier) {
                warnings.push("subscription tier change");
            }
            if (this.definition.storage_quota_bytes && 
                this.definition.storage_quota_bytes !== this.state.storage_quota_bytes) {
                warnings.push("storage quota change");
            }
            
            if (warnings.length > 0) {
                cli.output(`⚠️  ${warnings.join(" and ")} requires registry recreation`);
            }
            
            cli.output(`✅ Registry updated: ${existingRegistry.name} in ${existingRegistry.region}`);
        } else {
            // No registry exists, create one
            this.create();
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
        this.state.region = undefined;
        this.state.subscription_tier = undefined;
        this.state.storage_quota_bytes = undefined;
        this.state.created_at = undefined;
        this.state.username = undefined;
    }

    checkReadiness(): boolean {
        if (!this.state.name) {
            return false;
        }

        try {
            const response = this.makeRequest("GET", "/registry");
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                return !!this.state.server_url;
            }
            
            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get current registry information
     */
    @action()
    getRegistry(_args: Args): any {
        try {
            const response = this.makeRequest("GET", "/registry");
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                
                const registry = response.registry;
                const serverUrl = `registry.digitalocean.com/${registry.name}`;
                const subscriptionTier = registry.subscription_tier || "basic";
                const storageQuota = registry.storage_quota_bytes ? ` | Storage Quota: ${registry.storage_quota_bytes} bytes` : "";
                const storageUsage = registry.storage_usage_bytes !== undefined ? ` | Storage Usage: ${registry.storage_usage_bytes} bytes` : "";
                
                cli.output(`📊 Registry: ${registry.name} | Region: ${registry.region} | Tier: ${subscriptionTier} | Server: ${serverUrl} | Created: ${registry.created_at}${storageQuota}${storageUsage}`);
                
                return `Registry: ${registry.name} in ${registry.region}`;
            } else {
                throw new Error("Registry not found");
            }
        } catch (error) {
            throw new Error(`Failed to get registry info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all repositories in the registry
     */
    @action()
    listRepositories(_args: Args): any {
        try {
            if (!this.state.name) {
                throw new Error("Registry name not available. Ensure registry exists first.");
            }
            const response = this.makeRequest("GET", `/registry/${this.state.name}/repositoriesV2`);
            const repositories = response.repositories || [];
            
            if (repositories.length === 0) {
                cli.output(`Repositories in registry "${this.state.name}": No repositories found\nRegistry: ${this.state.name}\nServer: ${this.state.server_url}`);
            } else {
                const repoList = repositories.map((repo: any, index: number) => 
                    `${index + 1}. ${repo.name} (${repo.tag_count} tags)`
                );
                
                const info = [
                    `Repositories in registry "${this.state.name}" (${repositories.length} total):`,
                    ...repoList,
                    `Registry: ${this.state.name}`,
                    `Server: ${this.state.server_url}`
                ];
                
                cli.output(info.join('\n'));
            }
            
            return response;
        } catch (error) {
            throw new Error(`Failed to list repositories: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Private method to fetch and extract username from Docker credentials
     */
    private fetchUsername(): string | undefined {
        try {
            const response = this.makeRequest("GET", "/registry/docker-credentials");
            
            if (response.auths && Object.keys(response.auths).length > 0) {
                const serverUrl = Object.keys(response.auths)[0];
                const auth = response.auths[serverUrl];
                
                // auth.auth is base64 encoded "username:password"
                // Let's decode it to get the actual username
                try {
                    const decoded = atob(auth.auth);
                    const [username] = decoded.split(':');
                    return username;
                } catch (decodeError) {
                    // If decoding fails, return undefined
                    return undefined;
                }
            }
            
            return undefined;
        } catch (error) {
            // If we can't get credentials, return undefined
            return undefined;
        }
    }

    /**
     * Run garbage collection on the registry
     */
    @action()
    runGarbageCollection(args: Args): void {
        const gcType = args.type || "untagged_manifests_only";
        
        try {
            if (!this.state.name) {
                throw new Error("Registry name not available. Ensure registry exists first.");
            }
            
            const validatedType = validateGarbageCollectionType(gcType);
            
            const response = this.makeRequest("POST", `/registry/${this.state.name}/garbage-collection`, {
                type: validatedType
            });
            
            if (response.garbage_collection) {
                cli.output(`Garbage collection started: ${response.garbage_collection.uuid}`);
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
                
                let storageInfo = `💾 Storage for "${response.registry.name}":`;
                
                if (response.registry.storage_usage_bytes !== undefined) {
                    storageInfo += ` Usage: ${usageMB} MB`;
                } else {
                    storageInfo += ` Usage: Not available`;
                }
                
                if (response.registry.storage_quota_bytes) {
                    storageInfo += ` | Quota: ${quotaMB} MB`;
                    if (usagePercent !== null) {
                        storageInfo += ` | Used: ${usagePercent}%`;
                    }
                } else {
                    storageInfo += ` | Quota: Unlimited (Basic tier)`;
                }
                
                cli.output(storageInfo);
                
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
        // Use definition values or args for configuration
        const registryName = args.name || this.definition.name;
        const region = args.region || this.definition.region;
        const subscriptionTier = args.subscription_tier || this.definition.subscription_tier;
        const storageQuota = args.storage_quota_bytes || this.definition.storage_quota_bytes;
        
        try {
            // Check if registry already exists
            const existingRegistry = this.findExistingRegistry();
            if (existingRegistry) {
                cli.output(`✅ Container Registry already exists: ${existingRegistry.name} in ${existingRegistry.region}`);
                this.updateStateFromRegistry(existingRegistry);
                
                // Fetch and store username for Docker authentication
                const username = this.fetchUsername();
                if (username) {
                    this.state.username = username;
                }
                
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

            const response = this.makeRequest("POST", "/registry", createRequest);
            
            if (response.registry) {
                this.updateStateFromRegistry(response.registry);
                
                // Fetch and store username for Docker authentication
                const username = this.fetchUsername();
                if (username) {
                    this.state.username = username;
                }
                
                const serverUrl = `registry.digitalocean.com/${response.registry.name}`;
                let subscriptionInfo = "";
                if (response.subscription) {
                    subscriptionInfo = ` | Tier: ${response.subscription.tier.name} | Price: $${response.subscription.tier.monthly_price_in_cents / 100}/month`;
                }
                
                cli.output(`✅ Registry created: ${response.registry.name} | Region: ${response.registry.region} | Server: ${serverUrl}${subscriptionInfo}`);
                
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
                    // Try to get the existing registry info with more detailed error handling
                    try {
                        const existingRegistry = this.findExistingRegistry();
                        if (existingRegistry) {
                            cli.output(`✅ Found existing registry: ${existingRegistry.name} in ${existingRegistry.region}`);
                            this.updateStateFromRegistry(existingRegistry);
                            
                            // Fetch and store username for Docker authentication
                            const username = this.fetchUsername();
                            if (username) {
                                this.state.username = username;
                            }
                            
                            return {
                                status: "exists",
                                registry: existingRegistry,
                                message: "Registry with this name already exists"
                            };
                        } else {
                            cli.output(`❌ Registry name "${registryName}" is not available - try a different name`);
                            return {
                                status: "name_unavailable",
                                message: `Registry name "${registryName}" is not available. Try a different name or check if it was recently deleted.`,
                                suggested_action: "Try a different registry name"
                            };
                        }
                    } catch (checkError) {
                        cli.output(`❌ Registry name "${registryName}" is not available - unable to check existing registries`);
                        return {
                            status: "name_unavailable",
                            message: `Registry name "${registryName}" is not available. Try a different name.`,
                            suggested_action: "Try a different registry name"
                        };
                    }
                }
                
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
            this.state.username = undefined;
            
            cli.output(`✅ Registry deleted: ${existingRegistry.name}`);
            
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
        try {
            const existingRegistry = this.findExistingRegistry();
            
            if (!existingRegistry) {
                cli.output("⚪ No container registries found");
                return {
                    registries: [],
                    count: 0
                };
            }

            const serverUrl = `registry.digitalocean.com/${existingRegistry.name}`;
            const subscriptionTier = existingRegistry.subscription_tier || "basic";
            
            let storageInfo = "";
            if (existingRegistry.storage_quota_bytes) {
                const quotaMB = Math.round(existingRegistry.storage_quota_bytes / (1024 * 1024));
                storageInfo += ` | Quota: ${quotaMB} MB`;
            }
            if (existingRegistry.storage_usage_bytes !== undefined) {
                const usageMB = Math.round(existingRegistry.storage_usage_bytes / (1024 * 1024));
                storageInfo += ` | Usage: ${usageMB} MB`;
            }

            cli.output(`📊 Registry: ${existingRegistry.name} | Region: ${existingRegistry.region} | Tier: ${subscriptionTier} | Server: ${serverUrl} | Created: ${existingRegistry.created_at}${storageInfo}`);

            return {
                registries: [existingRegistry],
                count: 1
            };
        } catch (error) {
            throw new Error(`Failed to list container registries: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Find existing registry (DigitalOcean allows only one registry per account)
     */
    private findExistingRegistry(): any | null {
        try {
            const response = this.makeRequest("GET", "/registry");
            
            // DigitalOcean only allows one registry per account
            if (response.registry) {
                return response.registry;
            }
            
            return null;
        } catch (error) {
            // If we can't get registry info, assume it doesn't exist
            if (error instanceof Error) {
                // If it's a 404, that's expected when no registry exists
                if (error.message.includes("404")) {
                    return null;
                }
            }
            
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
        this.state.server_url = `registry.digitalocean.com/${registry.name}`;
        this.state.created_at = registry.created_at;
    }
}
