import secret from "secret";

export const BASE_URL = "https://console.neon.tech/api/v2";

/**
 * Get Neon API key from secret
 */
export function getApiKey(secretRef: string): string {
    const apiKey = secret.get(secretRef);
    if (!apiKey) {
        throw new Error(`Failed to retrieve Neon API key from secret: ${secretRef}`);
    }
    return apiKey;
}

/**
 * Neon API response interfaces
 */
export interface NeonApiResponse {
    data: any;
    statusCode: number;
    status: string;
    ok: boolean;
}

export interface NeonProject {
    id: string;
    name: string;
    region: string;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface NeonBranch {
    id: string;
    name: string;
    parent_id?: string;
    parent_lsn?: string;
    current_state: string;
    pending_state?: string;
    created_at: string;
    updated_at: string;
}

export interface NeonEndpoint {
    id: string;
    type: string;
    state: string;
    host: string;
    proxy_host?: string;
    branch_id: string;
    current_state: string;
    pending_state?: string;
    created_at: string;
    updated_at: string;
    last_active?: string;
    disabled?: boolean;
}

export interface NeonRole {
    name: string;
    protected: boolean;
    created_at: string;
    updated_at: string;
    password?: string;
}

export interface NeonOperation {
    id: string;
    status: string;
    error?: string;
    created_at: string;
    updated_at: string;
}

/**
 * Helper function to validate Neon API responses
 */
export function validateNeonResponse(response: any, operation: string): any {
    if (!response) {
        throw new Error(`Neon API ${operation} failed: No response received`);
    }
    
    if (response.error) {
        throw new Error(`Neon API ${operation} failed: ${response.error}`);
    }
    
    return response;
}

/**
 * Helper function to format Neon timestamps
 */
export function formatTimestamp(timestamp: string): string {
    if (!timestamp) return "";
    return new Date(timestamp).toISOString();
} 