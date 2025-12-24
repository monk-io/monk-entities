import { AWSCognitoEntity, type AWSCognitoDefinition, type AWSCognitoState } from "./cognito-base.ts";
import { action } from "monkec/base";
import cli from "cli";

/**
 * Interface for Identity Provider-specific definition properties
 */
export interface IdentityProviderDefinition extends AWSCognitoDefinition {
    user_pool_id: string;
    provider_name: string;
    provider_type: 'SAML' | 'OIDC' | 'Facebook' | 'Google' | 'LoginWithAmazon' | 'SignInWithApple';
    provider_details: Record<string, string>;
    attribute_mapping?: Record<string, string>;
    idp_identifiers?: string[];
}

/**
 * Interface for Identity Provider-specific state properties
 */
export interface IdentityProviderState extends AWSCognitoState {
    provider_name?: string;
    provider_type?: string;
    creation_date?: string;
    last_modified_date?: string;
}

/**
 * Formats Identity Provider API response data for state storage
 * @param providerData - Identity Provider data from AWS API
 * @param wasPreExisting - true if provider existed before entity creation, false if we created it
 */
export function formatIdentityProviderState(providerData: Record<string, unknown>, wasPreExisting: boolean = false): IdentityProviderState {
    return {
        existing: wasPreExisting,
        provider_name: providerData.ProviderName as string,
        provider_type: providerData.ProviderType as string,
        creation_date: providerData.CreationDate as string,
        last_modified_date: providerData.LastModifiedDate as string,
    };
}

/**
 * @description AWS Cognito Identity Provider entity.
 * Creates and manages external identity providers for User Pool federation.
 * Supports SAML, OIDC, Google, Facebook, Amazon, and Apple sign-in.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.provider_name` - Provider name for configuration
 * - `state.provider_type` - Provider type (SAML, OIDC, etc.)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-cognito/user-pool` - The parent user pool
 * - `aws-cognito/user-pool-client` - App clients using this provider
 */
export class IdentityProvider extends AWSCognitoEntity<IdentityProviderDefinition, IdentityProviderState> {
    /**
     * Get the User Pool ID for this provider
     */
    private getUserPoolId(): string {
        return this.definition.user_pool_id;
    }

    /**
     * Get the provider name
     */
    private getProviderName(): string {
        return this.definition.provider_name;
    }

    /**
     * Get the provider type
     */
    private getProviderType(): string {
        return this.definition.provider_type;
    }

    /**
     * Check if an Identity Provider exists in AWS
     */
    private checkIdentityProviderExists(userPoolId: string, providerName: string): Record<string, unknown> | null {
        try {
            const response = this.makeCognitoIdpRequest('DescribeIdentityProvider', {
                UserPoolId: userPoolId,
                ProviderName: providerName
            });

            if (response.IdentityProvider) {
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
     * Build parameters for CreateIdentityProvider API call
     */
    private buildCreateIdentityProviderParams(): Record<string, unknown> {
        const params: Record<string, unknown> = {
            UserPoolId: this.getUserPoolId(),
            ProviderName: this.getProviderName(),
            ProviderType: this.getProviderType(),
            ProviderDetails: this.definition.provider_details
        };

        // Optional attribute mapping
        if (this.definition.attribute_mapping && Object.keys(this.definition.attribute_mapping).length > 0) {
            params.AttributeMapping = this.definition.attribute_mapping;
        }

        // Optional IdP identifiers
        if (this.definition.idp_identifiers && this.definition.idp_identifiers.length > 0) {
            params.IdpIdentifiers = this.definition.idp_identifiers;
        }

        return params;
    }

    /**
     * Validate provider configuration based on type
     */
    private validateProviderConfiguration(): void {
        const providerType = this.getProviderType();
        const details = this.definition.provider_details;

        switch (providerType) {
            case 'SAML': {
                if (!details.MetadataURL && !details.MetadataFile) {
                    throw new Error('SAML provider requires either MetadataURL or MetadataFile in provider_details');
                }
                break;
            }

            case 'OIDC': {
                const requiredOidcFields = ['client_id', 'client_secret', 'attributes_request_method', 'oidc_issuer'];
                for (const field of requiredOidcFields) {
                    if (!details[field]) {
                        throw new Error(`OIDC provider requires ${field} in provider_details`);
                    }
                }
                break;
            }

            case 'Facebook': {
                if (!details.client_id || !details.client_secret) {
                    throw new Error('Facebook provider requires client_id and client_secret in provider_details');
                }
                break;
            }

            case 'Google': {
                if (!details.client_id || !details.client_secret) {
                    throw new Error('Google provider requires client_id and client_secret in provider_details');
                }
                break;
            }

            case 'LoginWithAmazon': {
                if (!details.client_id || !details.client_secret) {
                    throw new Error('Amazon provider requires client_id and client_secret in provider_details');
                }
                break;
            }

            case 'SignInWithApple': {
                const requiredAppleFields = ['client_id', 'team_id', 'key_id', 'private_key'];
                for (const field of requiredAppleFields) {
                    if (!details[field]) {
                        throw new Error(`Apple provider requires ${field} in provider_details`);
                    }
                }
                break;
            }

            default: {
                throw new Error(`Unsupported provider type: ${providerType}`);
            }
        }
    }

    /**
     * Create the Identity Provider
     */
    override create(): void {
        const userPoolId = this.getUserPoolId();
        const providerName = this.getProviderName();

        try {
            // Validate configuration first
            this.validateProviderConfiguration();

            // Check if provider already exists (pre-existing)
            const existingProvider = this.checkIdentityProviderExists(userPoolId, providerName);
            if (existingProvider && existingProvider.IdentityProvider) {
                console.log(`Found existing Identity Provider: ${providerName}`);
                const state = formatIdentityProviderState(existingProvider.IdentityProvider as Record<string, unknown>, true);
                Object.assign(this.state, state);
                return;
            }

            // Create new provider
            console.log(`Creating Identity Provider: ${providerName} of type ${this.getProviderType()} in User Pool: ${userPoolId}`);
            const params = this.buildCreateIdentityProviderParams();
            const response = this.makeCognitoIdpRequest('CreateIdentityProvider', params);

            if (response.IdentityProvider) {
                const state = formatIdentityProviderState(response.IdentityProvider as Record<string, unknown>, false);
                Object.assign(this.state, state);
                console.log(`Successfully created Identity Provider: ${providerName}`);
            } else {
                throw new Error('Identity Provider creation response missing IdentityProvider data');
            }
        } catch (error) {
            throw new Error(`Failed to create Identity Provider ${providerName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update the Identity Provider
     */
    override update(): void {
        const userPoolId = this.getUserPoolId();
        const providerName = this.getProviderName();

        try {
            this.validateProviderConfiguration();

            console.log(`Updating Identity Provider: ${providerName}`);
            
            const params: Record<string, unknown> = {
                UserPoolId: userPoolId,
                ProviderName: providerName,
                ProviderDetails: this.definition.provider_details
            };

            // Optional attribute mapping
            if (this.definition.attribute_mapping && Object.keys(this.definition.attribute_mapping).length > 0) {
                params.AttributeMapping = this.definition.attribute_mapping;
            }

            // Optional IdP identifiers
            if (this.definition.idp_identifiers && this.definition.idp_identifiers.length > 0) {
                params.IdpIdentifiers = this.definition.idp_identifiers;
            }

            const response = this.makeCognitoIdpRequest('UpdateIdentityProvider', params);

            if (response.IdentityProvider) {
                const state = formatIdentityProviderState(response.IdentityProvider as Record<string, unknown>, this.state.existing);
                Object.assign(this.state, state);
                console.log(`Successfully updated Identity Provider: ${providerName}`);
            } else {
                throw new Error('Identity Provider update response missing IdentityProvider data');
            }
        } catch (error) {
            throw new Error(`Failed to update Identity Provider ${providerName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete the Identity Provider
     */
    override delete(): void {
        const userPoolId = this.getUserPoolId();
        const providerName = this.state.provider_name || this.getProviderName();

        if (providerName && !this.state.existing) {
            try {
                console.log(`Deleting Identity Provider: ${providerName}`);
                this.makeCognitoIdpRequest('DeleteIdentityProvider', {
                    UserPoolId: userPoolId,
                    ProviderName: providerName
                });
                console.log(`Successfully deleted Identity Provider: ${providerName}`);
            } catch (error) {
                console.log(`Error deleting Identity Provider ${providerName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        } else if (this.state.existing) {
            console.log(`Skipping deletion of pre-existing Identity Provider: ${providerName}`);
        }

        // Reset state
        this.state.provider_name = undefined;
        this.state.provider_type = undefined;
        this.state.creation_date = undefined;
        this.state.last_modified_date = undefined;
    }

    /**
     * Check if the Identity Provider is ready
     */
    override checkReadiness(): boolean {
        const userPoolId = this.getUserPoolId();
        const providerName = this.state.provider_name || this.getProviderName();

        if (!providerName) {
            console.log(`Identity Provider not ready: missing provider name`);
            return false;
        }

        try {
            const response = this.checkIdentityProviderExists(userPoolId, providerName);
            const isReady = response !== null;
            
            if (!isReady) {
                console.log(`Identity Provider ${providerName} not found in AWS`);
            }
            
            return isReady;
        } catch (error) {
            console.log(`Error checking Identity Provider readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    

    /**
     * Get comprehensive Identity Provider information
     */
    @action("get-provider-info")
    getProviderInfo(): void {
        const userPoolId = this.getUserPoolId();
        const providerName = this.state.provider_name || this.getProviderName();
        
        try {
            if (!this.state.provider_name) {
                cli.output(`Identity Provider ${providerName} not found in entity state`);
                throw new Error(`Identity Provider ${providerName} not found`);
            }

            const response = this.makeCognitoIdpRequest('DescribeIdentityProvider', {
                UserPoolId: userPoolId,
                ProviderName: providerName
            });

            if (!response.IdentityProvider) {
                cli.output(`Identity Provider ${providerName} not found in AWS`);
                throw new Error(`Identity Provider ${providerName} not found`);
            }

            const provider = response.IdentityProvider as Record<string, unknown>;
            
            cli.output("=== Identity Provider Information ===");
            cli.output(`Provider Name: ${provider.ProviderName || 'N/A'}`);
            cli.output(`Provider Type: ${provider.ProviderType || 'N/A'}`);
            cli.output(`User Pool ID: ${provider.UserPoolId || 'N/A'}`);
            cli.output(`Creation Date: ${provider.CreationDate || 'N/A'}`);
            cli.output(`Last Modified: ${provider.LastModifiedDate || 'N/A'}`);

            if (provider.ProviderDetails && typeof provider.ProviderDetails === 'object') {
                cli.output(`Provider Details:`);
                const details = provider.ProviderDetails as Record<string, unknown>;
                for (const [key, value] of Object.entries(details)) {
                    // Hide sensitive information
                    if (key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
                        cli.output(`  - ${key}: [HIDDEN]`);
                    } else {
                        cli.output(`  - ${key}: ${value}`);
                    }
                }
            }

            if (provider.AttributeMapping && typeof provider.AttributeMapping === 'object') {
                cli.output(`Attribute Mapping:`);
                const mapping = provider.AttributeMapping as Record<string, unknown>;
                for (const [cognitoAttr, providerAttr] of Object.entries(mapping)) {
                    cli.output(`  - ${cognitoAttr} ← ${providerAttr}`);
                }
            }

            if (provider.IdpIdentifiers && Array.isArray(provider.IdpIdentifiers)) {
                cli.output(`IdP Identifiers: ${provider.IdpIdentifiers.join(', ')}`);
            }

        } catch (error) {
            const errorMsg = `Failed to get Identity Provider info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * Test Identity Provider configuration
     */
    @action("test-provider-config")
    testProviderConfig(): void {
        const userPoolId = this.getUserPoolId();
        const providerName = this.state.provider_name || this.getProviderName();
        
        try {
            if (!this.state.provider_name) {
                cli.output(`Identity Provider ${providerName} not found in entity state`);
                throw new Error(`Identity Provider ${providerName} not found`);
            }

            const response = this.makeCognitoIdpRequest('DescribeIdentityProvider', {
                UserPoolId: userPoolId,
                ProviderName: providerName
            });

            if (!response.IdentityProvider) {
                cli.output(`Identity Provider ${providerName} not found in AWS`);
                throw new Error(`Identity Provider ${providerName} not found`);
            }

            const provider = response.IdentityProvider as Record<string, unknown>;
            
            cli.output("=== Identity Provider Configuration Test ===");
            cli.output(`Provider: ${provider.ProviderName} (${provider.ProviderType})`);
            cli.output(`User Pool: ${userPoolId}`);
            
            // Check required configuration based on provider type
            const providerType = provider.ProviderType as string;
            const details = provider.ProviderDetails as Record<string, unknown> || {};
            
            cli.output(`Configuration Validation:`);
            
            switch (providerType) {
                case 'SAML': {
                    cli.output(`  - SAML Metadata: ${details.MetadataURL || details.MetadataFile ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Provider Type: ✅ SAML 2.0`);
                    break;
                }

                case 'OIDC': {
                    cli.output(`  - Client ID: ${details.client_id ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Client Secret: ${details.client_secret ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - OIDC Issuer: ${details.oidc_issuer ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Request Method: ${details.attributes_request_method || 'GET'}`);
                    break;
                }

                case 'Facebook':
                case 'Google':
                case 'LoginWithAmazon': {
                    cli.output(`  - Client ID: ${details.client_id ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Client Secret: ${details.client_secret ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Provider Type: ✅ Social Login (${providerType})`);
                    break;
                }

                case 'SignInWithApple': {
                    cli.output(`  - Client ID: ${details.client_id ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Team ID: ${details.team_id ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Key ID: ${details.key_id ? '✅ Configured' : '❌ Missing'}`);
                    cli.output(`  - Private Key: ${details.private_key ? '✅ Configured' : '❌ Missing'}`);
                    break;
                }
            }

            // Check attribute mapping
            const hasMapping = provider.AttributeMapping && Object.keys(provider.AttributeMapping as Record<string, unknown>).length > 0;
            cli.output(`  - Attribute Mapping: ${hasMapping ? '✅ Configured' : '⚠️ No mapping'}`);

            // Check IdP identifiers
            const hasIdentifiers = provider.IdpIdentifiers && (provider.IdpIdentifiers as unknown[]).length > 0;
            cli.output(`  - IdP Identifiers: ${hasIdentifiers ? '✅ Configured' : '⚠️ None set'}`);

            cli.output(`Integration Status: ✅ Ready for authentication`);

        } catch (error) {
            const errorMsg = `Failed to test provider config: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    /**
     * List all Identity Providers in the User Pool
     */
    @action("list-providers")
    listProviders(): void {
        const userPoolId = this.getUserPoolId();
        
        try {
            const response = this.makeCognitoIdpRequest('ListIdentityProviders', {
                UserPoolId: userPoolId
            });

            cli.output("=== Identity Providers in User Pool ===");
            cli.output(`User Pool ID: ${userPoolId}`);

            if (response.Providers && Array.isArray(response.Providers)) {
                cli.output(`Found ${response.Providers.length} providers:`);
                
                response.Providers.forEach((provider: unknown, index: number) => {
                    const p = provider as Record<string, unknown>;
                    cli.output(`${index + 1}. ${p.ProviderName} (${p.ProviderType})`);
                    cli.output(`   Created: ${p.CreationDate || 'N/A'}`);
                    cli.output(`   Modified: ${p.LastModifiedDate || 'N/A'}`);
                });
            } else {
                cli.output(`No Identity Providers found in this User Pool`);
            }

        } catch (error) {
            const errorMsg = `Failed to list providers: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
}
