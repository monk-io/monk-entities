import secret from "secret";

/**
 * DigitalOcean API configuration
 */
export const BASE_URL = "https://api.digitalocean.com/v2";

/**
 * Get the DigitalOcean API token from secrets
 */
export function getApiToken(secretRef: string): string {
    const token = secret.get(secretRef);
    if (!token) {
        throw new Error(`Failed to retrieve DigitalOcean API token from secret: ${secretRef}`);
    }
    return token;
}

/**
 * Database engine types supported by DigitalOcean
 */
export type DatabaseEngine = "mysql" | "pg" | "mongodb" | "kafka" | "opensearch" | "valkey";

/**
 * Database region codes supported by DigitalOcean
 */
export type DatabaseRegion = 
    | "ams3" | "blr1" | "fra1" | "lon1" | "nyc1" | "nyc3" 
    | "sfo3" | "sgp1" | "tor1" | "syd1";

/**
 * Database size slugs for DigitalOcean databases
 */
export type DatabaseSize = 
    | "db-s-1vcpu-1gb" | "db-s-1vcpu-2gb" | "db-s-2vcpu-4gb" 
    | "db-s-4vcpu-8gb" | "db-s-6vcpu-16gb" | "db-s-8vcpu-32gb";

/**
 * Common response interface for DigitalOcean API
 */
export interface DigitalOceanApiResponse {
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
 * Error response from DigitalOcean API
 */
export interface DigitalOceanApiError {
    id: string;
    message: string;
    request_id: string;
}

/**
 * Database cluster status values
 */
export type DatabaseStatus = "creating" | "online" | "forking" | "migrating" | "resizing";

/**
 * Validate database engine
 * Note: "redis" is accepted for backwards compatibility but maps to "valkey"
 */
export function validateDatabaseEngine(engine: string): DatabaseEngine {
    // Map redis to valkey for backwards compatibility
    if (engine === "redis") {
        engine = "valkey";
    }
    
    const validEngines: DatabaseEngine[] = ["mysql", "pg", "mongodb", "kafka", "opensearch", "valkey"];
    if (!validEngines.includes(engine as DatabaseEngine)) {
        throw new Error(`Invalid database engine: ${engine}. Valid engines: ${validEngines.join(", ")}`);
    }
    return engine as DatabaseEngine;
}

/**
 * Validate database region
 */
export function validateDatabaseRegion(region: string): DatabaseRegion {
    const validRegions: DatabaseRegion[] = [
        "ams3", "blr1", "fra1", "lon1", "nyc1", "nyc3", 
        "sfo3", "sgp1", "tor1", "syd1"
    ];
    if (!validRegions.includes(region as DatabaseRegion)) {
        throw new Error(`Invalid database region: ${region}. Valid regions: ${validRegions.join(", ")}`);
    }
    return region as DatabaseRegion;
}

/**
 * Validate database size
 */
export function validateDatabaseSize(size: string): DatabaseSize {
    const validSizes: DatabaseSize[] = [
        "db-s-1vcpu-1gb", "db-s-1vcpu-2gb", "db-s-2vcpu-4gb", 
        "db-s-4vcpu-8gb", "db-s-6vcpu-16gb", "db-s-8vcpu-32gb"
    ];
    if (!validSizes.includes(size as DatabaseSize)) {
        throw new Error(`Invalid database size: ${size}. Valid sizes: ${validSizes.join(", ")}`);
    }
    return size as DatabaseSize;
}
