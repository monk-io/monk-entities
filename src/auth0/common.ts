import http from "http";
import secret from "secret";
import crypto from "crypto";

export interface Auth0TokenResponse {
    access_token: string;
    expires_in?: number;
}

/**
 * Exchange Auth0 Management API M2M client credentials for a Bearer token
 * (client_credentials grant against https://{domain}/oauth/token).
 *
 * Tokens are cached in Monk secrets, keyed by a hash of domain+credentials, so
 * repeated action invocations against the same tenant don't re-authenticate on
 * every call (Auth0's Management API rate limit is 2 req/s on free/trial
 * tenants, 15 req/s on paid tenants).
 */
export function getManagementToken(domain: string, clientIdRef: string, clientSecretRef: string): string {
    const clientId = secret.get(clientIdRef);
    if (!clientId) {
        throw new Error(`Management client ID secret not found: ${clientIdRef}`);
    }
    const clientSecret = secret.get(clientSecretRef);
    if (!clientSecret) {
        throw new Error(`Management client secret not found: ${clientSecretRef}`);
    }

    const cacheKey = crypto.sha256(`${domain}:${clientId}:${clientSecret}`);
    const cachedTokenKey = `auth0-mgmt-token-${cacheKey}`;
    const cachedExpiresKey = `auth0-mgmt-token-${cacheKey}-expires`;

    const now = new Date();
    try {
        const cachedToken = secret.get(cachedTokenKey);
        const cachedExpires = secret.get(cachedExpiresKey);
        if (cachedToken && cachedExpires && now < new Date(cachedExpires)) {
            return cachedToken;
        }
    } catch (_e) {
        // No usable cached token; fall through to a fresh token exchange
    }

    const res = http.post(`https://${domain}/oauth/token`, {
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            audience: `https://${domain}/api/v2/`,
            grant_type: "client_credentials",
        }),
    });

    if (res.error) {
        throw new Error(`Failed to obtain Auth0 Management API token: ${res.error}, body: ${res.body}`);
    }
    if (res.statusCode >= 400) {
        throw new Error(`Failed to obtain Auth0 Management API token: ${res.status}, body: ${res.body}`);
    }

    const tokenResponse: Auth0TokenResponse = JSON.parse(res.body);
    if (!tokenResponse.access_token) {
        throw new Error(`Auth0 token exchange failed: no access_token in response, body: ${res.body}`);
    }

    if (tokenResponse.expires_in) {
        // 60s safety margin so a token never expires mid-request
        const expiresAt = new Date(now.getTime() + (tokenResponse.expires_in - 60) * 1000);
        try {
            secret.set(cachedTokenKey, tokenResponse.access_token);
            secret.set(cachedExpiresKey, expiresAt.toISOString());
        } catch (_e) {
            // Caching is best-effort; a failed cache write just means the next call re-authenticates
        }
    }

    return tokenResponse.access_token;
}

/** Splits a comma-separated string into a trimmed array, or wraps a single value. */
export function toStringArray(value: string): string[] {
    return value.includes(",") ? value.split(",").map((v) => v.trim()) : [value];
}

/**
 * The Monk runtime represents array-of-object fields on an entity's Definition as
 * flattened indexed keys (e.g. `scopes!0`, `scopes!1`) rather than a proper JS array
 * on the parent object — arrays of primitives (string/number/boolean) are unaffected.
 * This helper reads either form and returns a real array.
 */
export function collectArray<T>(obj: any, key: string): T[] {
    if (!obj) return [];
    if (Array.isArray(obj[key])) return obj[key] as T[];
    const out: T[] = [];
    let i = 0;
    while (obj[`${key}!${i}`] !== undefined) {
        out.push(obj[`${key}!${i}`] as T);
        i++;
    }
    return out;
}
