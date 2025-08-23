import { DOFunctionDefinition, DOFunctionState } from "./base.ts";

/**
 * Utility functions for DigitalOcean App Platform Functions
 */

/**
 * Validate GitHub repository URL format
 */
export function validateGitHubRepo(repoUrl: string): boolean {
    const patterns = [
        /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+$/,
        /^https:\/\/github\.com\/[\w\-\.]+\/[\w\-\.]+\.git$/
    ];
    
    return patterns.some(pattern => pattern.test(repoUrl));
}

/**
 * Normalize GitHub repository URL to owner/repo format for Functions API
 * Converts "https://github.com/owner/repo" to "owner/repo"
 * Functions API specifically requires owner/repo format, not full URLs
 */
export function normalizeGitHubRepo(repoUrl: string): string {
    // If it's already in owner/repo format, return as-is
    if (!repoUrl.includes('://')) {
        return repoUrl;
    }
    
    // Extract from full URL
    const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
    if (match) {
        // Remove .git suffix if present
        return match[1].replace(/\.git$/, '');
    }
    
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}. Expected format: https://github.com/owner/repo`);
}

/**
 * Validate DigitalOcean region
 */
export function validateRegion(region: string): boolean {
    const validRegions = [
        'nyc1', 'nyc3', 'ams2', 'ams3', 'sfo1', 'sfo2', 'sfo3',
        'sgp1', 'lon1', 'fra1', 'tor1', 'blr1', 'syd1'
    ];
    
    return validRegions.includes(region);
}

/**
 * Validate instance size slug
 */
export function validateInstanceSize(size: string): boolean {
    const validSizes = [
        'basic-xxs', 'basic-xs', 'basic-s', 'basic-m',
        'professional-xs', 'professional-s', 'professional-m', 'professional-l',
        'professional-xl'
    ];
    
    return validSizes.includes(size);
}

/**
 * Validate environment slug
 */
export function validateEnvironmentSlug(slug: string): boolean {
    const validSlugs = [
        'node-js', 'python', 'go', 'php', 'ruby', 'static-site'
    ];
    
    return validSlugs.includes(slug);
}

/**
 * Validate environment variable scope
 */
export function validateEnvScope(scope: string): boolean {
    const validScopes = ['RUN_TIME', 'BUILD_TIME', 'RUN_AND_BUILD_TIME'];
    return validScopes.includes(scope);
}

/**
 * Validate environment variable type
 */
export function validateEnvType(type: string): boolean {
    const validTypes = ['GENERAL', 'SECRET'];
    return validTypes.includes(type);
}

/**
 * Validate alert rule
 */
export function validateAlertRule(rule: string): boolean {
    const validRules = [
        'DEPLOYMENT_FAILED',
        'DOMAIN_FAILED', 
        'FUNCTIONS_ACTIVATION_COUNT',
        'FUNCTIONS_AVERAGE_DURATION_MS',
        'FUNCTIONS_ERROR_RATE_PER_MINUTE'
    ];
    
    return validRules.includes(rule);
}

/**
 * Validate domain type
 */
export function validateDomainType(type: string): boolean {
    const validTypes = ['DEFAULT', 'PRIMARY', 'ALIAS'];
    return validTypes.includes(type);
}

/**
 * Validate CPU kind
 */
export function validateCpuKind(kind: string): boolean {
    const validKinds = ['shared', 'dedicated'];
    return validKinds.includes(kind);
}

/**
 * Sanitize app name for DigitalOcean App Platform
 */
export function sanitizeAppName(name: string): string {
    // App names must be lowercase, alphanumeric with hyphens
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-')
        .substring(0, 32); // Max length is 32 characters
}

/**
 * Sanitize component name
 */
export function sanitizeComponentName(name: string): string {
    // Component names must be lowercase, alphanumeric with hyphens
    return name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-')
        .substring(0, 32);
}

/**
 * Build environment variables array with secret resolution
 */
export function buildEnvironmentVariables(
    envs: DOFunctionDefinition['envs'] = [],
    secretResolver: (ref: string) => string
): Array<{key: string, value: string, scope: string, type: string}> {
    
    return envs.map(env => {
        let value = env.value || '';
        
        // Resolve secret references
        if (env.type === 'SECRET' && value.includes('secret(')) {
            const secretMatch = value.match(/secret\("([^"]+)"\)/);
            if (secretMatch) {
                const secretRef = secretMatch[1];
                try {
                    value = secretResolver(secretRef);
                } catch (error) {
                    throw new Error(`Failed to resolve secret ${secretRef}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        
        return {
            key: env.key,
            value: value,
            scope: env.scope || 'RUN_AND_BUILD_TIME',
            type: env.type || 'GENERAL'
        };
    });
}

/**
 * Build log destinations with secret resolution
 */
export function buildLogDestinations(
    destinations: DOFunctionDefinition['log_destinations'] = [],
    secretResolver: (ref: string) => string
): Array<any> {
    
    return destinations.map(dest => {
        const logDest: any = { name: dest.name };
        
        if (dest.datadog) {
            logDest.datadog = {
                endpoint: dest.datadog.endpoint,
                api_key: secretResolver(dest.datadog.api_key_secret_ref)
            };
        }
        
        if (dest.logtail) {
            logDest.logtail = {
                token: secretResolver(dest.logtail.token_secret_ref)
            };
        }
        
        return logDest;
    });
}

/**
 * Validate complete function definition
 */
export function validateFunctionDefinition(definition: DOFunctionDefinition): string[] {
    const errors: string[] = [];
    
    // Required fields
    if (!definition.app_name) {
        errors.push('app_name is required');
    } else if (definition.app_name !== sanitizeAppName(definition.app_name)) {
        errors.push(`app_name "${definition.app_name}" contains invalid characters. Use: ${sanitizeAppName(definition.app_name)}`);
    }
    
    if (!definition.component_name) {
        errors.push('component_name is required');
    } else if (definition.component_name !== sanitizeComponentName(definition.component_name)) {
        errors.push(`component_name "${definition.component_name}" contains invalid characters. Use: ${sanitizeComponentName(definition.component_name)}`);
    }
    
    if (!definition.github_repo) {
        errors.push('github_repo is required');
    } else if (!validateGitHubRepo(definition.github_repo)) {
        errors.push('github_repo must be a valid GitHub repository URL');
    }
    
    // Optional field validation
    if (definition.region && !validateRegion(definition.region)) {
        errors.push(`Invalid region: ${definition.region}`);
    }
    
    if (definition.instance_size_slug && !validateInstanceSize(definition.instance_size_slug)) {
        errors.push(`Invalid instance_size_slug: ${definition.instance_size_slug}`);
    }
    
    if (definition.environment_slug && !validateEnvironmentSlug(definition.environment_slug)) {
        errors.push(`Invalid environment_slug: ${definition.environment_slug}`);
    }
    
    if (definition.cpu_kind && !validateCpuKind(definition.cpu_kind)) {
        errors.push(`Invalid cpu_kind: ${definition.cpu_kind}`);
    }
    
    // Validate instance count
    if (definition.instance_count !== undefined) {
        if (!Number.isInteger(definition.instance_count) || definition.instance_count < 1 || definition.instance_count > 10) {
            errors.push('instance_count must be an integer between 1 and 10');
        }
    }
    
    // Validate environment variables
    if (definition.envs) {
        definition.envs.forEach((env, index) => {
            if (!env.key) {
                errors.push(`Environment variable at index ${index} is missing key`);
            }
            
            if (env.scope && !validateEnvScope(env.scope)) {
                errors.push(`Invalid scope for environment variable ${env.key}: ${env.scope}`);
            }
            
            if (env.type && !validateEnvType(env.type)) {
                errors.push(`Invalid type for environment variable ${env.key}: ${env.type}`);
            }
            
            // Check for secret references in SECRET type variables
            if (env.type === 'SECRET' && env.value && !env.value.includes('secret(')) {
                errors.push(`SECRET type environment variable ${env.key} should use secret() reference`);
            }
        });
    }
    
    // Validate alerts
    if (definition.alerts) {
        definition.alerts.forEach((alert, index) => {
            if (!validateAlertRule(alert.rule)) {
                errors.push(`Invalid alert rule at index ${index}: ${alert.rule}`);
            }
        });
    }
    
    // Validate domains
    if (definition.domains) {
        definition.domains.forEach((domain, index) => {
            if (!domain.domain) {
                errors.push(`Domain at index ${index} is missing domain name`);
            }
            
            if (domain.type && !validateDomainType(domain.type)) {
                errors.push(`Invalid domain type at index ${index}: ${domain.type}`);
            }
        });
    }
    
    // Validate log destinations
    if (definition.log_destinations) {
        definition.log_destinations.forEach((dest, index) => {
            if (!dest.name) {
                errors.push(`Log destination at index ${index} is missing name`);
            }
            
            if (!dest.datadog && !dest.logtail) {
                errors.push(`Log destination ${dest.name} must have either datadog or logtail configuration`);
            }
            
            if (dest.datadog) {
                if (!dest.datadog.endpoint) {
                    errors.push(`Datadog log destination ${dest.name} is missing endpoint`);
                }
                if (!dest.datadog.api_key_secret_ref) {
                    errors.push(`Datadog log destination ${dest.name} is missing api_key_secret_ref`);
                }
            }
            
            if (dest.logtail) {
                if (!dest.logtail.token_secret_ref) {
                    errors.push(`Logtail log destination ${dest.name} is missing token_secret_ref`);
                }
            }
        });
    }
    
    return errors;
}

/**
 * Format function state for consistent storage - minimal data only
 */
export function formatFunctionState(app: any, wasPreExisting: boolean = false, componentName?: string): DOFunctionState {
    return {
        existing: wasPreExisting,
        app_id: app.id,
        component_name: componentName || app.spec?.functions?.[0]?.name
    };
}

/**
 * Check if deployment phase indicates readiness
 */
export function isDeploymentReady(phase: string): boolean {
    return phase === 'ACTIVE';
}

/**
 * Check if deployment phase indicates failure
 */
export function isDeploymentFailed(phase: string): boolean {
    return ['ERROR', 'CANCELED'].includes(phase);
}

/**
 * Check if deployment is in progress
 */
export function isDeploymentInProgress(phase: string): boolean {
    return ['PENDING_BUILD', 'BUILDING', 'PENDING_DEPLOY', 'DEPLOYING'].includes(phase);
}

/**
 * Get deployment status description
 */
export function getDeploymentStatusDescription(phase: string): string {
    const descriptions: Record<string, string> = {
        'UNKNOWN': 'Unknown status',
        'PENDING_BUILD': 'Waiting to build',
        'BUILDING': 'Building application',
        'PENDING_DEPLOY': 'Waiting to deploy',
        'DEPLOYING': 'Deploying application',
        'ACTIVE': 'Successfully deployed and running',
        'SUPERSEDED': 'Replaced by newer deployment',
        'ERROR': 'Deployment failed',
        'CANCELED': 'Deployment was canceled'
    };
    
    return descriptions[phase] || `Unknown phase: ${phase}`;
}

/**
 * Extract repository owner and name from GitHub URL
 */
export function parseGitHubRepo(repoUrl: string): { owner: string; repo: string } {
    const normalizedUrl = normalizeGitHubRepo(repoUrl);
    const match = normalizedUrl.match(/https:\/\/github\.com\/([^\/]+)\/([^\/]+)/);
    
    if (!match) {
        throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
    }
    
    return {
        owner: match[1],
        repo: match[2]
    };
}

/**
 * Generate default component name from app name
 */
export function generateComponentName(appName: string): string {
    return `${sanitizeComponentName(appName)}-function`;
}

/**
 * Build default routes for function component
 */
export function buildDefaultRoutes(): Array<{path?: string, preserve_path_prefix?: boolean}> {
    return [{
        path: '/',
        preserve_path_prefix: false
    }];
}

/**
 * Merge environment variables, with later ones overriding earlier ones
 */
export function mergeEnvironmentVariables(
    base: DOFunctionDefinition['envs'] = [],
    override: DOFunctionDefinition['envs'] = []
): DOFunctionDefinition['envs'] {
    const merged = [...base];
    
    override.forEach(overrideEnv => {
        const existingIndex = merged.findIndex(env => env.key === overrideEnv.key);
        if (existingIndex >= 0) {
            merged[existingIndex] = overrideEnv;
        } else {
            merged.push(overrideEnv);
        }
    });
    
    return merged;
}
