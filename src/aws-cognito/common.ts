import secret from "secret";

/**
 * Validates a User Pool name according to AWS requirements
 */
export function validateUserPoolName(name: string): void {
    if (!name || name.length < 1 || name.length > 128) {
        throw new Error("User Pool name must be between 1 and 128 characters");
    }
    
    // User Pool names can contain letters, numbers, spaces, hyphens, and underscores
    const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
    if (!validPattern.test(name)) {
        throw new Error("User Pool name can only contain letters, numbers, spaces, hyphens, and underscores");
    }
}

/**
 * Validates an Identity Pool name according to AWS requirements
 */
export function validateIdentityPoolName(name: string): void {
    if (!name || name.length < 1 || name.length > 128) {
        throw new Error("Identity Pool name must be between 1 and 128 characters");
    }
    
    // Identity Pool names can contain letters, numbers, spaces, hyphens, and underscores
    const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
    if (!validPattern.test(name)) {
        throw new Error("Identity Pool name can only contain letters, numbers, spaces, hyphens, and underscores");
    }
}

/**
 * Validates MFA configuration
 */
export function validateMfaConfiguration(mfaConfig: string): void {
    const validMfaOptions = ["OFF", "ON", "OPTIONAL"];
    if (!validMfaOptions.includes(mfaConfig)) {
        throw new Error(`MFA configuration must be one of: ${validMfaOptions.join(", ")}`);
    }
}

/**
 * Gets or creates a temporary password for admin-created users
 * This follows the security pattern of using secret references
 */
export function getOrCreateTempPassword(secretRef?: string, resourceName?: string): string {
    const defaultSecretRef = secretRef || `${resourceName}-temp-password`;
    
    try {
        const storedPassword = secret.get(defaultSecretRef);
        if (!storedPassword) throw new Error("Temporary password not found");
        return storedPassword;
    } catch (_e) {
        // Generate a strong temporary password that meets default policy requirements
        const password = secret.randString(12) + "A1!"; // Ensure it meets requirements
        secret.set(defaultSecretRef, password);
        return password;
    }
}

/**
 * Formats User Pool state data for storage
 * @param userPool - User Pool data from AWS API
 * @param wasPreExisting - true if pool existed before entity creation, false if we created it
 */
export function formatUserPoolState(userPool: Record<string, unknown>, wasPreExisting: boolean = false): Record<string, unknown> {
    return {
        existing: wasPreExisting, // true = don't delete (pre-existing), false = we created it (can delete)
        user_pool_id: userPool.Id,
        user_pool_arn: userPool.Arn,
        user_pool_name: userPool.Name,
        user_pool_status: userPool.Status,
        creation_date: userPool.CreationDate ? new Date((userPool.CreationDate as number) * 1000).toISOString() : undefined,
        last_modified_date: userPool.LastModifiedDate ? new Date((userPool.LastModifiedDate as number) * 1000).toISOString() : undefined,
        mfa_configuration: userPool.MfaConfiguration,
        estimated_number_of_users: userPool.EstimatedNumberOfUsers
    };
}

/**
 * Formats Identity Pool state data for storage
 * @param identityPool - Identity Pool data from AWS API
 * @param wasPreExisting - true if pool existed before entity creation, false if we created it
 */
export function formatIdentityPoolState(identityPool: Record<string, unknown>, wasPreExisting: boolean = false): Record<string, unknown> {
    return {
        existing: wasPreExisting, // true = don't delete (pre-existing), false = we created it (can delete)
        identity_pool_id: identityPool.IdentityPoolId,
        identity_pool_name: identityPool.IdentityPoolName,
        allow_unauthenticated_identities: identityPool.AllowUnauthenticatedIdentities,
        allow_classic_flow: identityPool.AllowClassicFlow
    };
}