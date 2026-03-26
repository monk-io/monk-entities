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
 * Database region — not restricted to a fixed set since DO may add regions.
 * Validated at runtime via the API, not at compile time.
 */
export type DatabaseRegion = string;

/**
 * Database size slug — not restricted to a fixed set since DO offers
 * multiple slug families (db-s-*, gd-*, so1_5-*) and may add more.
 * Validated at runtime via the API, not at compile time.
 */
export type DatabaseSize = string;

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
 * Validate database engine.
 * "redis" is accepted for backwards compatibility but maps to "valkey".
 * Caching (redis) cluster creates are no longer supported as of 2025-04-30.
 */
export function validateDatabaseEngine(engine: string): DatabaseEngine {
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
 * Validate database region — basic format check only.
 * The API itself will reject invalid regions with a clear error.
 */
export function validateDatabaseRegion(region: string): DatabaseRegion {
    if (!region || region.length < 3) {
        throw new Error(`Invalid database region: ${region}. Expected a DigitalOcean region slug (e.g., nyc1, sfo3, fra1).`);
    }
    return region;
}

/**
 * Validate database size — basic format check only.
 * DO offers multiple slug families (db-s-*, gd-*, so1_5-*) and may add more.
 * The API itself will reject invalid sizes with a clear error.
 */
export function validateDatabaseSize(size: string): DatabaseSize {
    if (!size || size.length < 3) {
        throw new Error(`Invalid database size: ${size}. Expected a DigitalOcean size slug (e.g., db-s-1vcpu-1gb, gd-2vcpu-8gb).`);
    }
    return size;
}
