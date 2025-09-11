import secret from "secret";

export const API_BASE_URL = "https://api.netlify.com/api/v1";
export const API_VERSION = "v1";

export function getApiToken(secretRef: string): string {
    const token = secret.get(secretRef);
    if (!token) {
        throw new Error(`API token not found in secret: ${secretRef}`);
    }
    return token;
}

export interface NetlifyApiResponse<T = any> {
    data: T;
    status: string;
    message?: string;
}

export interface NetlifySite {
    id: string;
    name: string;
    url: string;
    ssl_url: string;
    admin_url: string;
    custom_domain?: string;
    domain_aliases?: string[];
    state: string;
    created_at: string;
    updated_at: string;
}

export interface NetlifyDeploy {
    id: string;
    site_id: string;
    deploy_url: string;
    state: string;
    error_message?: string;
    created_at: string;
    published_at?: string;
    deploy_time?: number;
    framework?: string;
    function_count?: number;
    locked?: boolean;
}

export interface NetlifyForm {
    id: string;
    site_id: string;
    name: string;
    paths: string[];
    submission_count: number;
    fields: Array<{
        name: string;
        type: string;
    }>;
    created_at: string;
}

export interface NetlifySubmission {
    id: string;
    number: number;
    title?: string;
    email?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    company?: string;
    summary?: string;
    body?: string;
    data: Record<string, any>;
    created_at: string;
    site_url: string;
}

export interface NetlifyHook {
    id: string;
    site_id: string;
    type: string;
    event: string;
    data: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface NetlifySnippet {
    id: number;
    title: string;
    general: string;
    general_position: "head" | "footer";
    goal: string;
    goal_position: "head" | "footer";
}

/**
 * Helper function to build team-specific API paths
 */
export function buildTeamPath(teamSlug?: string): string {
    return teamSlug ? `/${teamSlug}` : "";
}

/**
 * Helper function to validate site ID format
 */
export function validateSiteId(siteId: string): boolean {
    // Netlify site IDs are typically UUIDs or alphanumeric strings
    return /^[a-zA-Z0-9-]+$/.test(siteId);
}

/**
 * Helper function to validate deploy ID format
 */
export function validateDeployId(deployId: string): boolean {
    // Netlify deploy IDs are typically alphanumeric strings
    return /^[a-zA-Z0-9]+$/.test(deployId);
}

/**
 * Helper function to format deployment time
 */
export function formatDeployTime(seconds?: number): string {
    if (!seconds) return "Unknown";
    
    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}

/**
 * Helper function to get deployment status emoji
 */
export function getDeployStatusEmoji(state: string): string {
    switch (state) {
        case "ready":
        case "published":
            return "✅";
        case "building":
        case "preparing":
            return "🔄";
        case "error":
        case "failed":
            return "❌";
        case "cancelled":
            return "⏹️";
        case "locked":
            return "🔒";
        default:
            return "❓";
    }
} 