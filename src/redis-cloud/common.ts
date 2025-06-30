import secret from "secret";

/**
 * Redis Cloud API base URL
 */
export const BASE_URL = "https://api.redislabs.com/v1";

/**
 * Content type header for Redis Cloud API
 */
export const CONTENT_TYPE = "application/json";

/**
 * Default timeout for task operations in seconds
 */
export const DEFAULT_TASK_TIMEOUT = 600;

/**
 * Default polling interval for task status in milliseconds
 */
export const DEFAULT_POLLING_INTERVAL = 5000;

/**
 * Retrieve Redis Cloud API credentials from secret reference
 */
export function getCredentials(secretRef: string): { accessKey: string; secretKey: string } {
    const accessKeySecret = secret.get(secretRef + "_access_key");
    const secretKeySecret = secret.get(secretRef + "_secret_key");
    
    if (!accessKeySecret || !secretKeySecret) {
        throw new Error(`Redis Cloud credentials not found. Expected secrets: ${secretRef}_access_key and ${secretRef}_secret_key`);
    }

    return { accessKey: accessKeySecret, secretKey: secretKeySecret };
}

/**
 * Create Redis Cloud API authentication string
 */
export function createAuthString(accessKey: string, secretKey: string): string {
    return btoa(`${accessKey}:${secretKey}`);
} 