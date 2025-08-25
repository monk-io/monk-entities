import { AWSCognitoEntity, type AWSCognitoDefinition, type AWSCognitoState } from "./cognito-base.ts";
import { action } from "monkec/base";
import cli from "cli";

/**
 * Interface for User Pool Client-specific definition properties
 */
export interface UserPoolClientDefinition extends AWSCognitoDefinition {
    user_pool_id: string;
    client_name: string;
    generate_secret?: boolean;
    refresh_token_validity?: number;
    access_token_validity?: number;
    id_token_validity?: number;
    token_validity_units?: {
        AccessToken?: 'seconds' | 'minutes' | 'hours' | 'days';
        IdToken?: 'seconds' | 'minutes' | 'hours' | 'days';
        RefreshToken?: 'seconds' | 'minutes' | 'hours' | 'days';
    };
    explicit_auth_flows?: string[];
    read_attributes?: string[];
    write_attributes?: string[];
    supported_identity_providers?: string[];
    callback_urls?: string[];
    logout_urls?: string[];
    default_redirect_uri?: string;
    allowed_oauth_flows?: string[];
    allowed_oauth_scopes?: string[];
    allowed_oauth_flows_user_pool_client?: boolean;
    analytics_configuration?: {
        ApplicationId?: string;
        ApplicationArn?: string;
        RoleArn?: string;
        ExternalId?: string;
        UserDataShared?: boolean;
    };
    prevent_user_existence_errors?: 'LEGACY' | 'ENABLED';
    enable_token_revocation?: boolean;
    enable_propagate_additional_user_context_data?: boolean;
    auth_session_validity?: number;
}

/**
 * Interface for User Pool Client-specific state properties
 */
export interface UserPoolClientState extends AWSCognitoState {
    client_id?: string;
    client_secret?: string;
    creation_date?: string;
    last_modified_date?: string;
}

/**
 * Formats User Pool Client API response data for state storage
 * @param clientData - User Pool Client data from AWS API
 * @param wasPreExisting - true if client existed before entity creation, false if we created it
 */
export function formatUserPoolClientState(clientData: Record<string, unknown>, wasPreExisting: boolean = false): UserPoolClientState {
    return {
        existing: wasPreExisting,
        client_id: clientData.ClientId as string,
        client_secret: clientData.ClientSecret as string,
        creation_date: clientData.CreationDate as string,
        last_modified_date: clientData.LastModifiedDate as string,
    };
}

/**
 * AWS Cognito User Pool Client Entity
 * 
 * Manages User Pool Clients which define how applications interact with User Pools.
 * Handles OAuth flows, token validity, authentication flows, and callback URLs.
 */
export class UserPoolClient extends AWSCognitoEntity<UserPoolClientDefinition, UserPoolClientState> {
    /**
     * Get the User Pool ID for this client
     */
    private getUserPoolId(): string {
        return this.definition.user_pool_id;
    }

    /**
     * Get the client name
     */
    private getClientName(): string {
        return this.definition.client_name;
    }

    /**
     * Get the client ID from state
     */
    private getClientId(): string {
        if (!this.state.client_id) {
            throw new Error(`User Pool Client ID not found in state for client: ${this.getClientName()}`);
        }
        return this.state.client_id;
    }

    /**
     * Check if a User Pool Client exists in AWS
     */
    private checkUserPoolClientExists(userPoolId: string, clientId: string): Record<string, unknown> | null {
        try {
            const response = this.makeCognitoIdpRequest('DescribeUserPoolClient', {
                UserPoolId: userPoolId,
                ClientId: clientId
            });

            if (response.UserPoolClient) {
                return response;
            }
            return null;
        } catch (error) {
            if (error instanceof Error && error.message.includes('ResourceNotFoundException')) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Check if a User Pool Client exists by name
     */
    private findUserPoolClientByName(userPoolId: string, clientName: string): Record<string, unknown> | null {
        try {
            const response = this.makeCognitoIdpRequest('ListUserPoolClients', {
                UserPoolId: userPoolId,
                MaxResults: 60
            });

            if (response.UserPoolClients && Array.isArray(response.UserPoolClients)) {
                const client = response.UserPoolClients.find((c: Record<string, unknown>) => c.ClientName === clientName);
                if (client) {
                    // Get full client details
                    return this.checkUserPoolClientExists(userPoolId, client.ClientId as string);
                }
            }
            return null;
        } catch (error) {
            console.log(`Error searching for User Pool Client by name: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    /**
     * Build parameters for CreateUserPoolClient API call
     */
    private buildCreateUserPoolClientParams(): Record<string, unknown> {
        const params: Record<string, unknown> = {
            UserPoolId: this.getUserPoolId(),
            ClientName: this.getClientName()
        };

        // Optional boolean parameters
        if (this.definition.generate_secret !== undefined) {
            params.GenerateSecret = this.definition.generate_secret;
        }

        // Token validity parameters
        if (this.definition.refresh_token_validity !== undefined) {
            params.RefreshTokenValidity = this.definition.refresh_token_validity;
        }
        if (this.definition.access_token_validity !== undefined) {
            params.AccessTokenValidity = this.definition.access_token_validity;
        }
        if (this.definition.id_token_validity !== undefined) {
            params.IdTokenValidity = this.definition.id_token_validity;
        }

        // Token validity units
        if (this.definition.token_validity_units) {
            params.TokenValidityUnits = this.definition.token_validity_units;
        }

        // Authentication flows
        if (this.definition.explicit_auth_flows && this.definition.explicit_auth_flows.length > 0) {
            params.ExplicitAuthFlows = this.definition.explicit_auth_flows;
        }

        // Attribute permissions
        if (this.definition.read_attributes && this.definition.read_attributes.length > 0) {
            params.ReadAttributes = this.definition.read_attributes;
        }
        if (this.definition.write_attributes && this.definition.write_attributes.length > 0) {
            params.WriteAttributes = this.definition.write_attributes;
        }

        // Identity providers
        if (this.definition.supported_identity_providers && this.definition.supported_identity_providers.length > 0) {
            params.SupportedIdentityProviders = this.definition.supported_identity_providers;
        }

        // OAuth configuration
        if (this.definition.callback_urls && this.definition.callback_urls.length > 0) {
            params.CallbackURLs = this.definition.callback_urls;
        }
        if (this.definition.logout_urls && this.definition.logout_urls.length > 0) {
            params.LogoutURLs = this.definition.logout_urls;
        }
        if (this.definition.default_redirect_uri) {
            params.DefaultRedirectURI = this.definition.default_redirect_uri;
        }
        if (this.definition.allowed_oauth_flows && this.definition.allowed_oauth_flows.length > 0) {
            params.AllowedOAuthFlows = this.definition.allowed_oauth_flows;
        }
        if (this.definition.allowed_oauth_scopes && this.definition.allowed_oauth_scopes.length > 0) {
            params.AllowedOAuthScopes = this.definition.allowed_oauth_scopes;
        }
        if (this.definition.allowed_oauth_flows_user_pool_client !== undefined) {
            params.AllowedOAuthFlowsUserPoolClient = this.definition.allowed_oauth_flows_user_pool_client;
        }

        // Analytics configuration
        if (this.definition.analytics_configuration) {
            params.AnalyticsConfiguration = this.definition.analytics_configuration;
        }

        // Other configuration
        if (this.definition.prevent_user_existence_errors) {
            params.PreventUserExistenceErrors = this.definition.prevent_user_existence_errors;
        }
        if (this.definition.enable_token_revocation !== undefined) {
            params.EnableTokenRevocation = this.definition.enable_token_revocation;
        }
        if (this.definition.enable_propagate_additional_user_context_data !== undefined) {
            params.EnablePropagateAdditionalUserContextData = this.definition.enable_propagate_additional_user_context_data;
        }
        if (this.definition.auth_session_validity !== undefined) {
            params.AuthSessionValidity = this.definition.auth_session_validity;
        }

        return params;
    }

    /**
     * Create the User Pool Client
     */
    override create(): void {
        const userPoolId = this.getUserPoolId();
        const clientName = this.getClientName();

        try {
            // Check if client already exists by name (pre-existing)
            const existingClient = this.findUserPoolClientByName(userPoolId, clientName);
            if (existingClient && existingClient.UserPoolClient) {
                console.log(`Found existing User Pool Client: ${clientName}`);
                const state = formatUserPoolClientState(existingClient.UserPoolClient as Record<string, unknown>, true);
                Object.assign(this.state, state);
                return;
            }

            // Create new client
            console.log(`Creating User Pool Client: ${clientName} in User Pool: ${userPoolId}`);
            const params = this.buildCreateUserPoolClientParams();
            const response = this.makeCognitoIdpRequest('CreateUserPoolClient', params);

            if (response.UserPoolClient) {
                const state = formatUserPoolClientState(response.UserPoolClient as Record<string, unknown>, false);
                Object.assign(this.state, state);
                console.log(`Successfully created User Pool Client: ${clientName} with ID: ${this.state.client_id}`);
            } else {
                throw new Error('User Pool Client creation response missing UserPoolClient data');
            }
        } catch (error) {
            throw new Error(`Failed to create User Pool Client ${clientName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update the User Pool Client
     */
    override update(): void {
        const clientId = this.getClientId();
        const clientName = this.getClientName();

        try {
            console.log(`Updating User Pool Client: ${clientName} (${clientId})`);
            
            // Build update parameters (similar to create but with ClientId)
            const params = this.buildCreateUserPoolClientParams();
            params.ClientId = clientId;
            delete params.UserPoolId; // UpdateUserPoolClient doesn't need UserPoolId
            delete params.GenerateSecret; // Cannot update this after creation

            const response = this.makeCognitoIdpRequest('UpdateUserPoolClient', params);

            if (response.UserPoolClient) {
                const state = formatUserPoolClientState(response.UserPoolClient as Record<string, unknown>, this.state.existing);
                Object.assign(this.state, state);
                console.log(`Successfully updated User Pool Client: ${clientName}`);
            } else {
                throw new Error('User Pool Client update response missing UserPoolClient data');
            }
        } catch (error) {
            throw new Error(`Failed to update User Pool Client ${clientName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete the User Pool Client
     */
    override delete(): void {
        const userPoolId = this.getUserPoolId();
        const clientId = this.state.client_id;
        const clientName = this.getClientName();

        if (clientId && !this.state.existing) {
            try {
                console.log(`Deleting User Pool Client: ${clientName} (${clientId})`);
                this.makeCognitoIdpRequest('DeleteUserPoolClient', {
                    UserPoolId: userPoolId,
                    ClientId: clientId
                });
                console.log(`Successfully deleted User Pool Client: ${clientName}`);
            } catch (error) {
                console.log(`Error deleting User Pool Client ${clientName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        } else if (this.state.existing) {
            console.log(`Skipping deletion of pre-existing User Pool Client: ${clientName}`);
        }

        // Reset state
        this.state.client_id = undefined;
        this.state.client_secret = undefined;
        this.state.creation_date = undefined;
        this.state.last_modified_date = undefined;
    }

    /**
     * Check if the User Pool Client is ready
     */
    override checkReadiness(): boolean {
        const userPoolId = this.getUserPoolId();
        const clientId = this.state.client_id;

        if (!clientId) {
            console.log(`User Pool Client not ready: missing client ID`);
            return false;
        }

        try {
            const response = this.checkUserPoolClientExists(userPoolId, clientId);
            const isReady = response !== null;
            
            if (!isReady) {
                console.log(`User Pool Client ${clientId} not found in AWS`);
            }
            
            return isReady;
        } catch (error) {
            console.log(`Error checking User Pool Client readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    /**
     * Get comprehensive User Pool Client information
     */
    @action("get-client-info")
    getClientInfo(): void {
        const userPoolId = this.getUserPoolId();
        const clientId = this.getClientId();
        
        try {
            if (!this.state.client_id) {
                cli.output(`User Pool Client ${clientId} not found in entity state`);
                throw new Error(`User Pool Client ${clientId} not found`);
            }

            const response = this.makeCognitoIdpRequest('DescribeUserPoolClient', {
                UserPoolId: userPoolId,
                ClientId: clientId
            });

            if (!response.UserPoolClient) {
                cli.output(`User Pool Client ${clientId} not found in AWS`);
                throw new Error(`User Pool Client ${clientId} not found`);
            }

            const client = response.UserPoolClient as Record<string, unknown>;
            
            cli.output("=== User Pool Client Information ===");
            cli.output(`Client Name: ${client.ClientName || 'N/A'}`);
            cli.output(`Client ID: ${client.ClientId || 'N/A'}`);
            cli.output(`User Pool ID: ${client.UserPoolId || 'N/A'}`);
            cli.output(`Has Secret: ${client.ClientSecret ? 'Yes' : 'No'}`);
            cli.output(`Creation Date: ${client.CreationDate || 'N/A'}`);
            cli.output(`Last Modified: ${client.LastModifiedDate || 'N/A'}`);
            
            if (client.ExplicitAuthFlows && Array.isArray(client.ExplicitAuthFlows)) {
                cli.output(`Auth Flows: ${client.ExplicitAuthFlows.join(', ')}`);
            }
            
            if (client.AllowedOAuthFlows && Array.isArray(client.AllowedOAuthFlows)) {
                cli.output(`OAuth Flows: ${client.AllowedOAuthFlows.join(', ')}`);
            }
            
            if (client.AllowedOAuthScopes && Array.isArray(client.AllowedOAuthScopes)) {
                cli.output(`OAuth Scopes: ${client.AllowedOAuthScopes.join(', ')}`);
            }
            
            if (client.CallbackURLs && Array.isArray(client.CallbackURLs)) {
                cli.output(`Callback URLs: ${client.CallbackURLs.join(', ')}`);
            }

            cli.output(`Token Validities:`);
            const tokenUnits = client.TokenValidityUnits as Record<string, string> || {};
            cli.output(`  - Access Token: ${client.AccessTokenValidity || 'Default'} ${tokenUnits.AccessToken || 'hours'}`);
            cli.output(`  - ID Token: ${client.IdTokenValidity || 'Default'} ${tokenUnits.IdToken || 'hours'}`);
            cli.output(`  - Refresh Token: ${client.RefreshTokenValidity || 'Default'} ${tokenUnits.RefreshToken || 'days'}`);

        } catch (error) {
            const errorMsg = `Failed to get User Pool Client info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Get OAuth/OIDC configuration information
     */
    @action("get-oauth-config")
    getOAuthConfig(): void {
        const userPoolId = this.getUserPoolId();
        const clientId = this.getClientId();
        
        try {
            if (!this.state.client_id) {
                cli.output(`User Pool Client ${clientId} not found in entity state`);
                throw new Error(`User Pool Client ${clientId} not found`);
            }

            const response = this.makeCognitoIdpRequest('DescribeUserPoolClient', {
                UserPoolId: userPoolId,
                ClientId: clientId
            });

            if (!response.UserPoolClient) {
                cli.output(`User Pool Client ${clientId} not found in AWS`);
                throw new Error(`User Pool Client ${clientId} not found`);
            }

            const client = response.UserPoolClient as Record<string, unknown>;
            
            cli.output("=== OAuth/OIDC Configuration ===");
            cli.output(`Client ID: ${client.ClientId}`);
            
            if (client.AllowedOAuthFlows && Array.isArray(client.AllowedOAuthFlows)) {
                cli.output(`Allowed OAuth Flows: ${client.AllowedOAuthFlows.join(', ')}`);
            } else {
                cli.output(`Allowed OAuth Flows: None configured`);
            }
            
            if (client.AllowedOAuthScopes && Array.isArray(client.AllowedOAuthScopes)) {
                cli.output(`Allowed OAuth Scopes: ${client.AllowedOAuthScopes.join(', ')}`);
            } else {
                cli.output(`Allowed OAuth Scopes: None configured`);
            }
            
            if (client.CallbackURLs && Array.isArray(client.CallbackURLs)) {
                cli.output(`Callback URLs:`);
                client.CallbackURLs.forEach((url: unknown) => {
                    cli.output(`  - ${url}`);
                });
            } else {
                cli.output(`Callback URLs: None configured`);
            }
            
            if (client.LogoutURLs && Array.isArray(client.LogoutURLs)) {
                cli.output(`Logout URLs:`);
                client.LogoutURLs.forEach((url: unknown) => {
                    cli.output(`  - ${url}`);
                });
            } else {
                cli.output(`Logout URLs: None configured`);
            }

            if (client.DefaultRedirectURI) {
                cli.output(`Default Redirect URI: ${client.DefaultRedirectURI}`);
            }

            cli.output(`OAuth Flows Enabled: ${client.AllowedOAuthFlowsUserPoolClient ? 'Yes' : 'No'}`);

        } catch (error) {
            const errorMsg = `Failed to get OAuth config: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Test authentication with the User Pool Client
     */
    @action("test-auth-config")
    testAuthConfig(): void {
        const userPoolId = this.getUserPoolId();
        const clientId = this.getClientId();
        
        try {
            if (!this.state.client_id) {
                cli.output(`User Pool Client ${clientId} not found in entity state`);
                throw new Error(`User Pool Client ${clientId} not found`);
            }

            const response = this.makeCognitoIdpRequest('DescribeUserPoolClient', {
                UserPoolId: userPoolId,
                ClientId: clientId
            });

            if (!response.UserPoolClient) {
                cli.output(`User Pool Client ${clientId} not found in AWS`);
                throw new Error(`User Pool Client ${clientId} not found`);
            }

            const client = response.UserPoolClient as Record<string, unknown>;
            
            cli.output("=== Authentication Configuration Test ===");
            cli.output(`Client ID: ${client.ClientId}`);
            cli.output(`User Pool ID: ${userPoolId}`);
            
            // Check authentication flows
            if (client.ExplicitAuthFlows && Array.isArray(client.ExplicitAuthFlows)) {
                cli.output(`✅ Authentication Flows Configured: ${client.ExplicitAuthFlows.join(', ')}`);
                
                const hasUserSrp = client.ExplicitAuthFlows.includes('ALLOW_USER_SRP_AUTH');
                const hasUserPassword = client.ExplicitAuthFlows.includes('ALLOW_USER_PASSWORD_AUTH');
                const hasRefreshToken = client.ExplicitAuthFlows.includes('ALLOW_REFRESH_TOKEN_AUTH');
                
                cli.output(`Authentication Flow Support:`);
                cli.output(`  - SRP Authentication: ${hasUserSrp ? '✅ Enabled' : '❌ Disabled'}`);
                cli.output(`  - Password Authentication: ${hasUserPassword ? '✅ Enabled' : '❌ Disabled'}`);
                cli.output(`  - Refresh Token: ${hasRefreshToken ? '✅ Enabled' : '❌ Disabled'}`);
            } else {
                cli.output(`❌ No authentication flows configured`);
            }
            
            // Check OAuth configuration
            const hasOAuthFlows = client.AllowedOAuthFlows && Array.isArray(client.AllowedOAuthFlows) && client.AllowedOAuthFlows.length > 0;
            const hasCallbackUrls = client.CallbackURLs && Array.isArray(client.CallbackURLs) && client.CallbackURLs.length > 0;
            
            cli.output(`OAuth Configuration:`);
            cli.output(`  - OAuth Flows: ${hasOAuthFlows ? '✅ Configured' : '❌ Not configured'}`);
            cli.output(`  - Callback URLs: ${hasCallbackUrls ? '✅ Configured' : '❌ Not configured'}`);
            cli.output(`  - OAuth Client Enabled: ${client.AllowedOAuthFlowsUserPoolClient ? '✅ Yes' : '❌ No'}`);
            
            // Token validity
            cli.output(`Token Configuration:`);
            const tokenUnits2 = client.TokenValidityUnits as Record<string, string> || {};
            cli.output(`  - Access Token Validity: ${client.AccessTokenValidity || 'Default (1 hour)'} ${tokenUnits2.AccessToken || 'hours'}`);
            cli.output(`  - ID Token Validity: ${client.IdTokenValidity || 'Default (1 hour)'} ${tokenUnits2.IdToken || 'hours'}`);
            cli.output(`  - Refresh Token Validity: ${client.RefreshTokenValidity || 'Default (30 days)'} ${tokenUnits2.RefreshToken || 'days'}`);
            
            // Security features
            cli.output(`Security Features:`);
            cli.output(`  - Client Secret: ${client.ClientSecret ? '✅ Configured' : '❌ Public client'}`);
            cli.output(`  - Prevent User Existence Errors: ${client.PreventUserExistenceErrors || 'LEGACY'}`);
            cli.output(`  - Token Revocation: ${client.EnableTokenRevocation !== false ? '✅ Enabled' : '❌ Disabled'}`);

        } catch (error) {
            const errorMsg = `Failed to test auth config: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
}
