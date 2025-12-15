/**
 * DigitalOcean Container Registry common types and utilities
 */

/**
 * Container Registry subscription tiers (API only supports basic and professional)
 */
export type RegistrySubscriptionTier = "basic" | "professional";

/**
 * Container Registry regions supported by DigitalOcean
 */
export type RegistryRegion = 
    | "ams3" | "blr1" | "fra1" | "lon1" | "nyc1" | "nyc3" 
    | "sfo3" | "sgp1" | "tor1" | "syd1";

/**
 * Repository visibility options
 */
export type RepositoryVisibility = "private" | "public";

/**
 * Common response interface for DigitalOcean Container Registry API
 */
export interface ContainerRegistryApiResponse {
    data?: any;
    links?: {
        first?: string;
        last?: string;
        next?: string;
        prev?: string;
    };
    meta?: {
        total?: number;
    };
}

/**
 * Error response from DigitalOcean Container Registry API
 */
export interface ContainerRegistryApiError {
    id: string;
    message: string;
    request_id: string;
}

/**
 * Registry garbage collection types
 */
export type GarbageCollectionType = "untagged_manifests_only" | "unreferenced_blobs_only" | "unreferenced_blobs_and_manifests";

/**
 * Validate registry region
 */
export function validateRegistryRegion(region: string): RegistryRegion {
    const validRegions: RegistryRegion[] = [
        "ams3", "blr1", "fra1", "lon1", "nyc1", "nyc3", 
        "sfo3", "sgp1", "tor1", "syd1"
    ];
    if (!validRegions.includes(region as RegistryRegion)) {
        throw new Error(`Invalid registry region: ${region}. Valid regions: ${validRegions.join(", ")}`);
    }
    return region as RegistryRegion;
}

/**
 * Validate subscription tier
 */
export function validateSubscriptionTier(tier: string): RegistrySubscriptionTier {
    const validTiers: RegistrySubscriptionTier[] = ["basic", "professional"];
    if (!validTiers.includes(tier as RegistrySubscriptionTier)) {
        throw new Error(`Invalid subscription tier: ${tier}. Valid tiers: ${validTiers.join(", ")}. Note: 'starter' tier is only available through DigitalOcean web interface, not API.`);
    }
    return tier as RegistrySubscriptionTier;
}

/**
 * Validate repository visibility
 */
export function validateRepositoryVisibility(visibility: string): RepositoryVisibility {
    const validVisibilities: RepositoryVisibility[] = ["private", "public"];
    if (!validVisibilities.includes(visibility as RepositoryVisibility)) {
        throw new Error(`Invalid repository visibility: ${visibility}. Valid options: ${validVisibilities.join(", ")}`);
    }
    return visibility as RepositoryVisibility;
}

/**
 * Validate garbage collection type
 */
export function validateGarbageCollectionType(type: string): GarbageCollectionType {
    const validTypes: GarbageCollectionType[] = [
        "untagged_manifests_only", 
        "unreferenced_blobs_only", 
        "unreferenced_blobs_and_manifests"
    ];
    if (!validTypes.includes(type as GarbageCollectionType)) {
        throw new Error(`Invalid garbage collection type: ${type}. Valid types: ${validTypes.join(", ")}`);
    }
    return type as GarbageCollectionType;
}
