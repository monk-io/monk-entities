/**
 * Common utilities and constants for Vercel entities
 */

/**
 * Vercel API endpoints
 */
export const VERCEL_API_ENDPOINTS = {
    PROJECTS: "/v9/projects",
    PROJECTS_V11: "/v11/projects",
    DEPLOYMENTS: "/v6/deployments",
    DEPLOYMENTS_V13: "/v13/deployments",
    DOMAINS: "/v9/projects",
    TEAMS: "/v2/teams",
    USER: "/v2/user"
} as const;

/**
 * Vercel project statuses
 */
export const VERCEL_PROJECT_STATUSES = {
    READY: "ready",
    ACTIVE: "active",
    PENDING: "pending",
    ERROR: "error",
    CANCELED: "canceled"
} as const;

/**
 * Vercel deployment statuses
 */
export const VERCEL_DEPLOYMENT_STATUSES = {
    READY: "ready",
    BUILDING: "building",
    ERROR: "error",
    CANCELED: "canceled",
    QUEUED: "queued"
} as const;

/**
 * Supported Git providers
 */
export const GIT_PROVIDERS = {
    GITHUB: "github",
    GITLAB: "gitlab",
    BITBUCKET: "bitbucket"
} as const;

/**
 * Common framework presets
 */
export const FRAMEWORK_PRESETS = {
    NEXTJS: "nextjs",
    REACT: "react",
    VUE: "vue",
    ANGULAR: "angular",
    NUXT: "nuxt",
    SVELTE: "svelte",
    SVELTEKIT: "sveltekit",
    REMIX: "remix",
    ASTRO: "astro",
    VITE: "vite",
    STATIC: "static"
} as const;

/**
 * Helper function to validate project name
 */
export function validateProjectName(name: string): boolean {
    // Vercel project names must be lowercase, alphanumeric, and hyphens only
    const validNameRegex = /^[a-z0-9-]+$/;
    return validNameRegex.test(name) && name.length >= 1 && name.length <= 100;
}

/**
 * Helper function to validate domain name
 */
export function validateDomainName(domain: string): boolean {
    // Basic domain validation
    const validDomainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return validDomainRegex.test(domain);
}

/**
 * Helper function to build team query parameter
 */
export function buildTeamQuery(teamId?: string): string {
    return teamId ? `?teamId=${teamId}` : "";
}

/**
 * Helper function to build team body parameter
 */
export function buildTeamBody(teamId?: string): Record<string, string> {
    return teamId ? { teamId } : {};
}

/**
 * Helper function to format deployment URL
 */
export function formatDeploymentUrl(deployment: any): string {
    if (deployment.url) {
        return deployment.url;
    }
    
    if (deployment.alias && deployment.alias.length > 0) {
        return deployment.alias[0];
    }
    
    return `https://${deployment.id}.vercel.app`;
}

/**
 * Helper function to get readable status
 */
export function getReadableStatus(status: string): string {
    switch (status) {
        case VERCEL_PROJECT_STATUSES.READY:
            return "Ready";
        case VERCEL_PROJECT_STATUSES.ACTIVE:
            return "Active";
        case VERCEL_PROJECT_STATUSES.PENDING:
            return "Pending";
        case VERCEL_PROJECT_STATUSES.ERROR:
            return "Error";
        case VERCEL_PROJECT_STATUSES.CANCELED:
            return "Canceled";
        default:
            return status;
    }
}

/**
 * Helper function to get deployment status emoji
 */
export function getStatusEmoji(status: string): string {
    switch (status) {
        case VERCEL_DEPLOYMENT_STATUSES.READY:
            return "✅";
        case VERCEL_DEPLOYMENT_STATUSES.BUILDING:
            return "🔨";
        case VERCEL_DEPLOYMENT_STATUSES.ERROR:
            return "❌";
        case VERCEL_DEPLOYMENT_STATUSES.CANCELED:
            return "🚫";
        case VERCEL_DEPLOYMENT_STATUSES.QUEUED:
            return "⏳";
        default:
            return "❓";
    }
} 