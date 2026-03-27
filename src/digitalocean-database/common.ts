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
 * Database regions available on DigitalOcean.
 * Listed as enum for schema generation (helps agents pick valid values).
 * Runtime validators accept any string — the API is the final authority.
 */
export type DatabaseRegion =
    | "ams3" | "blr1" | "fra1" | "lon1" | "nyc1" | "nyc3"
    | "sfo3" | "sgp1" | "tor1" | "syd1";

/**
 * Database size slugs available on DigitalOcean.
 * Includes basic (db-s-*), general purpose (gd-*), and storage-optimized (so1_5-*) families.
 * Listed as enum for schema generation (helps agents pick valid values).
 * Runtime validators accept any string — the API is the final authority.
 */
export type DatabaseSize =
    | "db-s-1vcpu-1gb" | "db-s-1vcpu-2gb" | "db-s-2vcpu-4gb"
    | "db-s-4vcpu-8gb" | "db-s-6vcpu-16gb" | "db-s-8vcpu-32gb"
    | "db-s-16vcpu-64gb"
    | "gd-2vcpu-8gb" | "gd-4vcpu-16gb" | "gd-8vcpu-32gb"
    | "gd-16vcpu-64gb" | "gd-32vcpu-128gb" | "gd-40vcpu-160gb"
    | "so1_5-2vcpu-16gb" | "so1_5-4vcpu-32gb" | "so1_5-8vcpu-64gb"
    | "so1_5-16vcpu-128gb" | "so1_5-24vcpu-192gb" | "so1_5-32vcpu-256gb";

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
    return region as DatabaseRegion;
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
    return size as DatabaseSize;
}
