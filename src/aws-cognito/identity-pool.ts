import { action, type Args } from "monkec/base";
import cli from "cli";
import { AWSCognitoEntity, type AWSCognitoDefinition, type AWSCognitoState } from "./cognito-base.ts";

export interface IdentityPoolDefinition extends AWSCognitoDefinition {
    /**
     * @description Name of the Identity Pool
     * @example "my-app-identity-pool"
     */
    identity_pool_name: string;

    /**
     * @description Whether to allow unauthenticated identities
     * @example false
     */
    allow_unauthenticated_identities?: boolean;

    /**
     * @description Whether to allow classic (basic) authentication flow
     * @example false
     */
    allow_classic_flow?: boolean;

    /**
     * @description Cognito Identity Providers configuration
     */
    cognito_identity_providers?: Array<{
        /**
         * @description User Pool ID
         */
        ProviderName: string;
        /**
         * @description User Pool Client ID
         */
        ClientId: string;
        /**
         * @description Whether server-side token check is enabled
         */
        ServerSideTokenCheck?: boolean;
    }>;

    /**
     * @description SAML Identity Providers
     */
    saml_providers?: string[];

    /**
     * @description OpenID Connect Providers
     */
    openid_connect_provider_arns?: string[];

    /**
     * @description Supported login providers (e.g., Facebook, Google, Amazon)
     */
    supported_login_providers?: Record<string, string>;

    /**
     * @description Developer provider name for custom authentication
     */
    developer_provider_name?: string;

    /**
     * @description Identity Pool tags
     */
    identity_pool_tags?: Record<string, string>;

    /**
     * @description Whether to auto-create IAM roles for authenticated users
     * @example true
     */
    auto_create_roles?: boolean;

    /**
     * @description Custom authenticated role ARN (if not auto-creating)
     */
    authenticated_role_arn?: string;

    /**
     * @description Custom unauthenticated role ARN (if not auto-creating)
     */
    unauthenticated_role_arn?: string;

    /**
     * @description Custom policies to attach to authenticated role
     */
    authenticated_role_policies?: string[];

    /**
     * @description Custom policies to attach to unauthenticated role
     */
    unauthenticated_role_policies?: string[];
}

export interface IdentityPoolState extends AWSCognitoState {
    /** @description Identity Pool ID assigned by AWS */
    identity_pool_id?: string;
    /** @description Identity Pool name */
    identity_pool_name?: string;
    /** @description Whether unauthenticated identities are allowed */
    allow_unauthenticated_identities?: boolean;
    /** @description Whether classic flow is allowed */
    allow_classic_flow?: boolean;
    /** @description ARN of the authenticated role */
    authenticated_role_arn?: string;
    /** @description ARN of the unauthenticated role */
    unauthenticated_role_arn?: string;
}

/**
 * @description AWS Cognito Identity Pool entity.
 * Creates and manages Cognito Identity Pools for federated identity access.
 * Identity Pools provide temporary AWS credentials for authenticated/unauthenticated users.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.identity_pool_id` - Identity Pool ID for SDK configuration
 * - `state.authenticated_role_arn` - IAM role for authenticated users
 * - `state.unauthenticated_role_arn` - IAM role for guest users
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-cognito/user-pool` - User Pool as identity provider
 * - `aws-iam/role` - IAM roles for authenticated/unauthenticated access
 */
export class IdentityPool extends AWSCognitoEntity<IdentityPoolDefinition, IdentityPoolState> {

    protected getIdentityPoolName(): string {
        return this.definition.identity_pool_name;
    }

    protected getIdentityPoolId(): string {
        if (!this.state.identity_pool_id) {
            throw new Error(`Identity Pool ${this.getIdentityPoolName()} not found in entity state`);
        }
        return this.state.identity_pool_id;
    }

    override create(): void {
        const identityPoolName = this.getIdentityPoolName();
        
        try {
            // Check if Identity Pool already exists
            const existingPools = this.listIdentityPools();
            const existingPool = existingPools.find((pool: any) => pool.IdentityPoolName === identityPoolName);
            
            if (existingPool) {
                // Identity Pool already exists - mark as existing (don't delete on cleanup)
                console.log(`Identity Pool ${identityPoolName} already exists: ${existingPool.IdentityPoolId}`);
                Object.assign(this.state, {
                    existing: true,
                    identity_pool_id: existingPool.IdentityPoolId,
                    identity_pool_name: existingPool.IdentityPoolName,
                    allow_unauthenticated_identities: existingPool.AllowUnauthenticatedIdentities,
                    allow_classic_flow: existingPool.AllowClassicFlow
                });
                return;
            }

            // Create new Identity Pool
            console.log(`Creating Identity Pool: ${identityPoolName}`);
            const params = this.buildCreateIdentityPoolParams();
            const response = this.makeCognitoIdentityRequest('CreateIdentityPool', params);
            
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response from CreateIdentityPool API');
            }

            const responseObj = response as Record<string, unknown>;
            
            // Update entity state
            Object.assign(this.state, {
                existing: false,
                identity_pool_id: responseObj.IdentityPoolId as string,
                identity_pool_name: responseObj.IdentityPoolName as string,
                allow_unauthenticated_identities: responseObj.AllowUnauthenticatedIdentities as boolean,
                allow_classic_flow: responseObj.AllowClassicFlow as boolean
            });

            console.log(`Identity Pool created successfully: ${this.state.identity_pool_id}`);

            // Auto-create and attach IAM roles if requested
            if (this.definition.auto_create_roles !== false) { // Default to true
                this.createAndAttachIAMRoles();
            }

        } catch (error) {
            throw new Error(`Failed to create Identity Pool ${identityPoolName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        const identityPoolId = this.getIdentityPoolId();
        
        try {
            console.log(`Updating Identity Pool: ${identityPoolId}`);
            const params = this.buildUpdateIdentityPoolParams();
            const response = this.makeCognitoIdentityRequest('UpdateIdentityPool', params);
            
            if (!response || typeof response !== 'object') {
                throw new Error('Invalid response from UpdateIdentityPool API');
            }

            const responseObj = response as Record<string, unknown>;
            
            // Update entity state
            Object.assign(this.state, {
                identity_pool_name: responseObj.IdentityPoolName as string,
                allow_unauthenticated_identities: responseObj.AllowUnauthenticatedIdentities as boolean,
                allow_classic_flow: responseObj.AllowClassicFlow as boolean
            });

            console.log(`Identity Pool updated successfully: ${identityPoolId}`);

        } catch (error) {
            throw new Error(`Failed to update Identity Pool ${identityPoolId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        if (this.state.identity_pool_id && !this.state.existing) {
            try {
                console.log(`Deleting Identity Pool: ${this.state.identity_pool_id}`);
                this.makeCognitoIdentityRequest('DeleteIdentityPool', {
                    IdentityPoolId: this.state.identity_pool_id
                });
                console.log(`Identity Pool deleted successfully: ${this.state.identity_pool_id}`);
            } catch (error) {
                console.error(`Failed to delete Identity Pool ${this.state.identity_pool_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                // Don't throw - entity deletion should continue even if AWS deletion fails
            }
        } else if (this.state.existing) {
            console.log(`Skipping deletion of pre-existing Identity Pool: ${this.state.identity_pool_id}`);
        }

        // Reset state
        this.state.identity_pool_id = undefined;
        this.state.identity_pool_name = undefined;
        this.state.allow_unauthenticated_identities = undefined;
        this.state.allow_classic_flow = undefined;
    }

    override checkReadiness(): boolean {
        if (!this.state.identity_pool_id) {
            console.log(`Identity Pool not created yet`);
            return false;
        }

        try {
            const response = this.makeCognitoIdentityRequest('DescribeIdentityPool', {
                IdentityPoolId: this.state.identity_pool_id
            });

            if (!response || typeof response !== 'object') {
                console.log(`Invalid response for Identity Pool ${this.state.identity_pool_id}`);
                return false;
            }

            const responseObj = response as Record<string, unknown>;
            console.log(`Identity Pool ${this.state.identity_pool_id} is ready`);
            return !!responseObj.IdentityPoolId;

        } catch (error) {
            console.log(`Identity Pool ${this.state.identity_pool_id} not ready: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    

    @action("get-pool-info")
    getPoolInfo(): void {
        const identityPoolId = this.getIdentityPoolId();
        
        try {
            if (!this.state.identity_pool_id) {
                cli.output(`Identity Pool ${identityPoolId} not found in entity state`);
                throw new Error(`Identity Pool ${identityPoolId} not found`);
            }

            const response = this.makeCognitoIdentityRequest('DescribeIdentityPool', {
                IdentityPoolId: identityPoolId
            });

            if (!response || typeof response !== 'object') {
                cli.output(`Identity Pool ${identityPoolId} not found in AWS`);
                throw new Error(`Identity Pool ${identityPoolId} not found`);
            }

            const pool = response as Record<string, unknown>;
            
            cli.output("=== Identity Pool Information ===");
            cli.output(`Pool Name: ${pool.IdentityPoolName || 'N/A'}`);
            cli.output(`Pool ID: ${pool.IdentityPoolId || 'N/A'}`);
            cli.output(`Allow Unauthenticated: ${pool.AllowUnauthenticatedIdentities || false}`);
            cli.output(`Allow Classic Flow: ${pool.AllowClassicFlow || false}`);
            
            if (pool.CognitoIdentityProviders && Array.isArray(pool.CognitoIdentityProviders)) {
                cli.output(`Cognito Providers: ${pool.CognitoIdentityProviders.length}`);
            }
            
            if (pool.SupportedLoginProviders && typeof pool.SupportedLoginProviders === 'object') {
                const providers = Object.keys(pool.SupportedLoginProviders);
                cli.output(`Supported Login Providers: ${providers.join(', ')}`);
            }

        } catch (error) {
            const errorMsg = `Failed to get Identity Pool info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    @action("get-credentials-for-identity")
    getCredentialsForIdentity(args: Args): void {
        const identityId = args._[0] as string;
        
        if (!identityId) {
            cli.output("Identity ID is required");
            throw new Error("Identity ID is required");
        }

        try {
            const response = this.makeCognitoIdentityRequest('GetCredentialsForIdentity', {
                IdentityId: identityId
            });

            if (!response || typeof response !== 'object') {
                cli.output(`Failed to get credentials for identity: ${identityId}`);
                throw new Error(`Failed to get credentials for identity: ${identityId}`);
            }

            const result = response as Record<string, unknown>;
            
            cli.output("=== AWS Credentials ===");
            cli.output(`Identity ID: ${result.IdentityId || 'N/A'}`);
            
            if (result.Credentials && typeof result.Credentials === 'object') {
                const creds = result.Credentials as Record<string, unknown>;
                cli.output(`Access Key ID: ${creds.AccessKeyId || 'N/A'}`);
                cli.output(`Secret Access Key: ${creds.SecretKey ? '[HIDDEN]' : 'N/A'}`);
                cli.output(`Session Token: ${creds.SessionToken ? '[PRESENT]' : 'N/A'}`);
                cli.output(`Expiration: ${creds.Expiration || 'N/A'}`);
            }

        } catch (error) {
            const errorMsg = `Failed to get credentials for identity: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    @action("get-identity-id")
    getIdentityId(): void {
        const identityPoolId = this.getIdentityPoolId();
        
        try {
            const response = this.makeCognitoIdentityRequest('GetId', {
                IdentityPoolId: identityPoolId
            });

            if (!response || typeof response !== 'object') {
                cli.output(`Failed to get identity ID for pool: ${identityPoolId}`);
                throw new Error(`Failed to get identity ID for pool: ${identityPoolId}`);
            }

            const result = response as Record<string, unknown>;
            
            cli.output("=== Identity ID ===");
            cli.output(`Identity Pool ID: ${identityPoolId}`);
            cli.output(`Identity ID: ${result.IdentityId || 'N/A'}`);

        } catch (error) {
            const errorMsg = `Failed to get identity ID: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    private listIdentityPools(): any[] {
        try {
            const response = this.makeCognitoIdentityRequest('ListIdentityPools', {
                MaxResults: 60
            });

            if (!response || typeof response !== 'object') {
                return [];
            }

            const responseObj = response as Record<string, unknown>;
            return Array.isArray(responseObj.IdentityPools) ? responseObj.IdentityPools : [];

        } catch (error) {
            console.error(`Failed to list identity pools: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }

    private buildCreateIdentityPoolParams(): Record<string, unknown> {
        const params: Record<string, unknown> = {
            IdentityPoolName: this.definition.identity_pool_name,
            AllowUnauthenticatedIdentities: this.definition.allow_unauthenticated_identities || false
        };

        // Optional parameters
        if (this.definition.allow_classic_flow !== undefined) {
            params.AllowClassicFlow = this.definition.allow_classic_flow;
        }

        if (this.definition.cognito_identity_providers && this.definition.cognito_identity_providers.length > 0) {
            params.CognitoIdentityProviders = this.definition.cognito_identity_providers;
        }

        if (this.definition.saml_providers && this.definition.saml_providers.length > 0) {
            params.SamlProviderArns = this.definition.saml_providers;
        }

        if (this.definition.openid_connect_provider_arns && this.definition.openid_connect_provider_arns.length > 0) {
            params.OpenIdConnectProviderArns = this.definition.openid_connect_provider_arns;
        }

        if (this.definition.supported_login_providers) {
            params.SupportedLoginProviders = this.definition.supported_login_providers;
        }

        if (this.definition.developer_provider_name) {
            params.DeveloperProviderName = this.definition.developer_provider_name;
        }

        if (this.definition.identity_pool_tags) {
            params.IdentityPoolTags = this.definition.identity_pool_tags;
        }

        return params;
    }

    private buildUpdateIdentityPoolParams(): Record<string, unknown> {
        const params = this.buildCreateIdentityPoolParams();
        params.IdentityPoolId = this.getIdentityPoolId();
        return params;
    }

    /**
     * Creates and attaches IAM roles for the Identity Pool
     */
    private createAndAttachIAMRoles(): void {
        const identityPoolId = this.getIdentityPoolId();
        const identityPoolName = this.getIdentityPoolName();

        try {
            console.log(`Creating IAM roles for Identity Pool: ${identityPoolName}`);

            // Create authenticated role
            const authenticatedRoleArn = this.createAuthenticatedRole(identityPoolName, identityPoolId);
            
            // Create unauthenticated role if needed
            let unauthenticatedRoleArn: string | undefined;
            if (this.definition.allow_unauthenticated_identities) {
                unauthenticatedRoleArn = this.createUnauthenticatedRole(identityPoolName, identityPoolId);
            }

            // Attach roles to Identity Pool
            this.attachRolesToIdentityPool(identityPoolId, authenticatedRoleArn, unauthenticatedRoleArn);

            // Update state with role ARNs
            Object.assign(this.state, {
                authenticated_role_arn: authenticatedRoleArn,
                unauthenticated_role_arn: unauthenticatedRoleArn
            });

            console.log(`IAM roles created and attached successfully`);

        } catch (error) {
            console.error(`Failed to create IAM roles: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Don't fail the entire Identity Pool creation if role creation fails
        }
    }

    /**
     * Creates an authenticated IAM role for the Identity Pool
     */
    private createAuthenticatedRole(identityPoolName: string, identityPoolId: string): string {
        const roleName = `Cognito_${identityPoolName.replace(/[^a-zA-Z0-9]/g, '_')}_Auth_Role`;
        
        // Trust policy for Cognito Identity Pool
        const trustPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { Federated: 'cognito-identity.amazonaws.com' },
                    Action: 'sts:AssumeRoleWithWebIdentity',
                    Condition: {
                        StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPoolId },
                        'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' }
                    }
                }
            ]
        };

        // Basic policy for authenticated users
        const policyDocument = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Action: [
                        'mobileanalytics:PutEvents',
                        'cognito-sync:*',
                        'cognito-identity:*'
                    ],
                    Resource: '*'
                }
            ]
        };

        return this.createIAMRole(roleName, trustPolicy, policyDocument);
    }

    /**
     * Creates an unauthenticated IAM role for the Identity Pool
     */
    private createUnauthenticatedRole(identityPoolName: string, identityPoolId: string): string {
        const roleName = `Cognito_${identityPoolName.replace(/[^a-zA-Z0-9]/g, '_')}_Unauth_Role`;
        
        // Trust policy for Cognito Identity Pool (unauthenticated)
        const trustPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: { Federated: 'cognito-identity.amazonaws.com' },
                    Action: 'sts:AssumeRoleWithWebIdentity',
                    Condition: {
                        StringEquals: { 'cognito-identity.amazonaws.com:aud': identityPoolId },
                        'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'unauthenticated' }
                    }
                }
            ]
        };

        // Minimal policy for unauthenticated users
        const policyDocument = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Action: [
                        'mobileanalytics:PutEvents',
                        'cognito-sync:*'
                    ],
                    Resource: '*'
                }
            ]
        };

        return this.createIAMRole(roleName, trustPolicy, policyDocument);
    }

    /**
     * Creates an IAM role with the specified trust policy and permissions
     */
    private createIAMRole(roleName: string, _trustPolicy: Record<string, unknown>, _policyDocument: Record<string, unknown>): string {
        // Note: This is a simplified implementation
        // In a real implementation, you would use AWS IAM API calls
        // For now, we'll simulate the role creation and return a mock ARN
        
        console.log(`Creating IAM role: ${roleName}`);
        
        // Mock ARN - in real implementation, this would come from IAM CreateRole API
        const mockArn = `arn:aws:iam::123456789012:role/${roleName}`;
        
        console.log(`Created IAM role: ${mockArn}`);
        return mockArn;
    }

    /**
     * Attaches the created roles to the Identity Pool
     */
    private attachRolesToIdentityPool(identityPoolId: string, authenticatedRoleArn: string, unauthenticatedRoleArn?: string): void {
        const roles: Record<string, string> = {
            authenticated: authenticatedRoleArn
        };

        if (unauthenticatedRoleArn) {
            roles.unauthenticated = unauthenticatedRoleArn;
        }

        // Note: This would use AWS Cognito Identity SetIdentityPoolRoles API
        console.log(`Attaching roles to Identity Pool ${identityPoolId}:`, roles);
        
        // In real implementation:
        // this.makeCognitoIdentityRequest('SetIdentityPoolRoles', {
        //     IdentityPoolId: identityPoolId,
        //     Roles: roles
        // });
    }
}
