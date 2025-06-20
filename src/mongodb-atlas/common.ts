import http from "http";
import secret from "secret";

export const BASE_URL = "https://cloud.mongodb.com/api/atlas/v2";
export const API_VERSION = "application/vnd.atlas.2023-01-01+json";
export const API_VERSION_2025 = "application/vnd.atlas.2025-03-12+json";

/**
 * Get MongoDB Atlas OAuth2 Bearer token from service account credentials
 * Implements token caching to avoid unnecessary OAuth exchanges
 */
export function getToken(secretRef: string): string {
    const now = new Date();
    let cachedToken: string | undefined;
    let cachedTokenExpires: string | undefined;

    // Try to get cached token and expiration
    try {
        cachedToken = secret.get(secretRef + "_cached_token");
        cachedTokenExpires = secret.get(secretRef + "_cached_token_expires");
    } catch (e) {
        cachedToken = undefined;
        cachedTokenExpires = undefined;
    }

    // Return cached token if it's still valid
    if (cachedToken && cachedTokenExpires) {
        const expires = new Date(cachedTokenExpires);
        if (now < expires) {
            return cachedToken;
        }
    }

    // Get service account token
    const serviceAccountToken = secret.get(secretRef);
    if (!serviceAccountToken) {
        throw new Error(`Failed to retrieve MongoDB Atlas service account token from secret: ${secretRef}`);
    }

    if (!serviceAccountToken.startsWith("mdb_sa_id")) {
        throw new Error("Token is not a service account token");
    }
    
    // Exchange service account credentials for OAuth2 Bearer token
    const headers = {
        "Accept": "application/json",
        "Authorization": "Basic " + btoa(serviceAccountToken),
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache"
    };

    const res = http.post("https://cloud.mongodb.com/api/oauth/token", {
        headers,
        body: "grant_type=client_credentials"
    });

    if (res.error) {
        throw new Error(`OAuth token exchange failed: ${res.error}, body: ${res.body}`);
    }

    if (res.statusCode >= 400) {
        throw new Error(`OAuth token exchange failed: ${res.status}, body: ${res.body}`);
    }

    const tokenResponse = JSON.parse(res.body);
    if (!tokenResponse.access_token) {
        throw new Error(`OAuth token exchange failed: no access_token in response, body: ${res.body}`);
    }

    // Cache the token with expiration
    if (tokenResponse.expires_in) {
        const expiresIn = new Date(now.getTime() + (tokenResponse.expires_in * 1000));
        secret.set(secretRef + "_cached_token", tokenResponse.access_token);
        secret.set(secretRef + "_cached_token_expires", expiresIn.toISOString());
    }

    return tokenResponse.access_token;
}

/**
 * Get organization by name
 */
export function getOrganization(name: string, bearerToken: string): AtlasOrganization {
    const headers = {
        "Accept": API_VERSION,
        "Authorization": "Bearer " + bearerToken
    };

    // List all organizations and find the one with matching name
    const res = http.get(BASE_URL + "/orgs", {
        headers
    });

    if (res.error) {
        throw new Error(res.error + ", body " + res.body);
    }

    if (res.statusCode >= 400) {
        throw new Error("Error getting organizations: " + res.status + ", body " + res.body);
    }

    const resObj = JSON.parse(res.body);
    if (!resObj.results || resObj.results.length === 0) {
        throw new Error("No organizations found, body " + res.body);
    }

    for (let i = 0; i < resObj.results.length; i++) {
        if (resObj.results[i].name === name) {
            return { id: resObj.results[i].id, name: resObj.results[i].name };
        }
    }

    throw new Error("Organization not found: " + name + ", body " + res.body);
}

export interface AtlasTokenResponse {
    access_token: string;
    expires_in: number;
}

export interface AtlasOrganization {
    id: string;
    name: string;
}

export interface AtlasHttpResponse {
    statusCode: number;
    status: string;
    body: string;
    error?: string;
}