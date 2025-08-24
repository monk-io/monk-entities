import { AWSCognitoEntity, type AWSCognitoDefinition, type AWSCognitoState } from "./cognito-base.ts";
import { action } from "monkec/base";
import cli from "cli";

/**
 * AWS Cognito User Pool Domain Definition
 * Supports both Cognito prefix domains (e.g., myapp.auth.region.amazoncognito.com)
 * and custom domains (e.g., auth.mycompany.com)
 */
export interface UserPoolDomainDefinition extends AWSCognitoDefinition {
    /** The User Pool ID to associate the domain with */
    user_pool_id: string;
    
    /** 
     * Domain name - can be:
     * - A prefix for Cognito domain (e.g., "myapp" -> myapp.auth.region.amazoncognito.com)
     * - A full custom domain (e.g., "auth.mycompany.com")
     */
    domain: string;
    
    /** 
     * Custom domain configuration (required for custom domains)
     * Contains ACM certificate ARN and optional managed login version
     */
    custom_domain_config?: {
        /** ARN of ACM certificate (must be in us-east-1 region) */
        certificate_arn: string;
        /** Managed login version: 1 (classic) or 2 (new) */
        managed_login_version?: number;
    };
}

/**
 * AWS Cognito User Pool Domain State
 * Tracks domain creation status and CloudFront distribution info
 */
export interface UserPoolDomainState extends AWSCognitoState {
    /** Whether domain was pre-existing (don't delete) or created by us */
    existing: boolean;
    
    /** Domain name as stored in AWS */
    domain?: string;
    
    /** CloudFront distribution domain (for custom domains) */
    cloudfront_distribution?: string;
    
    /** CloudFront distribution ARN (for custom domains) */
    cloudfront_distribution_arn?: string;
    
    /** Domain status (CREATING, ACTIVE, DELETING, FAILED) */
    status?: string;
    
    /** Custom domain configuration details */
    custom_domain_config?: Record<string, unknown>;
    
    /** Domain creation date */
    creation_date?: string;
    
    /** Whether this is a custom domain or Cognito prefix domain */
    is_custom_domain?: boolean;
}

/**
 * AWS Cognito User Pool Domain Entity
 * 
 * Manages hosted UI domains for Cognito User Pools. Supports both:
 * 1. Cognito prefix domains (simple setup, no SSL needed)
 * 2. Custom domains (branded experience, requires ACM certificate)
 * 
 * Custom Actions:
 * - get-domain-info: Show domain details and CloudFront info
 * - get-hosted-ui-url: Generate hosted UI URLs for login/signup
 * - test-domain-access: Verify domain accessibility and SSL
 */
export class UserPoolDomain extends AWSCognitoEntity<UserPoolDomainDefinition, UserPoolDomainState> {
    
    /**
     * Create a new User Pool Domain
     * Handles both Cognito prefix and custom domain creation
     */
    override create(): void {
        const domain = this.definition.domain;
        const userPoolId = this.definition.user_pool_id;
        
        // Validate required parameters
        if (!domain) {
            throw new Error('Domain is required for User Pool Domain creation');
        }
        if (!userPoolId) {
            throw new Error('User Pool ID is required for User Pool Domain creation');
        }
        
        // Validate domain format
        this.validateDomainFormat(domain);
        
        try {
            // Check if domain already exists
            console.log(`Checking if domain ${domain} already exists...`);
            const existingDomain = this.checkDomainExists(domain);
            if (existingDomain) {
                console.log(`User Pool Domain ${domain} already exists with status: ${existingDomain.Status}, marking as existing`);
                const state = this.formatDomainState(existingDomain, true);
                Object.assign(this.state, state);
                return;
            } else {
                console.log(`Domain ${domain} does not exist, proceeding with creation`);
            }
            
            // Determine if this is a custom domain
            const isCustomDomain = this.isCustomDomain(domain);
            
            // Build create domain parameters
            const params: Record<string, unknown> = {
                UserPoolId: userPoolId,
                Domain: domain
            };
            
            // Add custom domain configuration if provided
            if (isCustomDomain && this.definition.custom_domain_config) {
                const customConfig: Record<string, unknown> = {
                    CertificateArn: this.definition.custom_domain_config.certificate_arn
                };
                
                if (this.definition.custom_domain_config.managed_login_version) {
                    customConfig.ManagedLoginVersion = this.definition.custom_domain_config.managed_login_version;
                }
                
                params.CustomDomainConfig = customConfig;
            } else if (isCustomDomain) {
                throw new Error(`Custom domain ${domain} requires custom_domain_config with certificate_arn`);
            }
            
            // Create the domain
            console.log(`Creating User Pool Domain: ${domain} with params:`, params);
            const createResponse = this.makeCognitoIdpRequest('CreateUserPoolDomain', params);
            console.log(`CreateUserPoolDomain API response:`, createResponse);
            console.log(`Successfully initiated User Pool Domain creation: ${domain}`);
            
            // Wait a moment and then retrieve domain info
            // Some AWS services need a moment after creation
            const domainInfo = this.describeDomain(domain);
            if (!domainInfo) {
                // If we can't get domain info immediately, store basic info
                console.log(`Domain created but info not immediately available, storing basic state`);
                const basicState: UserPoolDomainState = {
                    existing: false,
                    domain: domain,
                    status: 'CREATING',
                    is_custom_domain: isCustomDomain,
                    cloudfront_distribution: undefined,
                    cloudfront_distribution_arn: undefined,
                    custom_domain_config: undefined,
                    creation_date: undefined
                };
                Object.assign(this.state, basicState);
            } else {
                const state = this.formatDomainState(domainInfo, false);
                Object.assign(this.state, state);
            }
            
        } catch (error) {
            console.error(`Error creating User Pool Domain ${domain}:`, error);
            if (error instanceof Error) {
                console.error(`Error details: ${error.message}`);
                // Check for common domain creation errors
                if (error.message.includes('InvalidParameterException')) {
                    throw new Error(`Invalid parameter for User Pool Domain ${domain}: ${error.message}`);
                } else if (error.message.includes('LimitExceededException')) {
                    throw new Error(`Domain limit exceeded for User Pool Domain ${domain}: ${error.message}`);
                } else if (error.message.includes('ResourceConflictException')) {
                    throw new Error(`Domain ${domain} already exists or conflicts with existing domain: ${error.message}`);
                }
            }
            throw new Error(`Failed to create User Pool Domain ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Update domain configuration
     * Note: AWS doesn't support updating domains directly, only recreation
     */
    override update(): void {
        console.log('User Pool Domain update requested - domains cannot be updated in place');
        console.log('To change domain configuration, delete and recreate the domain');
        
        // Refresh domain state
        try {
            const domain = this.definition.domain;
            const domainInfo = this.describeDomain(domain);
            if (domainInfo) {
                const state = this.formatDomainState(domainInfo, this.state.existing);
                Object.assign(this.state, state);
            }
        } catch (_error) {
            console.log(`Failed to refresh domain state: ${_error instanceof Error ? _error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Delete the User Pool Domain
     * Only deletes domains created by this entity (respects existing flag)
     */
    override delete(): void {
        const domain = this.state.domain || this.definition.domain;
        
        try {
            if (domain && !this.state.existing) {
                console.log(`Deleting User Pool Domain: ${domain}`);
                
                this.makeCognitoIdpRequest('DeleteUserPoolDomain', {
                    Domain: domain
                });
                
                console.log(`Successfully deleted User Pool Domain: ${domain}`);
                
                // Clear domain-related state
                this.state.domain = undefined;
                this.state.cloudfront_distribution = undefined;
                this.state.cloudfront_distribution_arn = undefined;
                this.state.status = undefined;
                this.state.custom_domain_config = undefined;
                this.state.creation_date = undefined;
                this.state.is_custom_domain = undefined;
                
            } else if (this.state.existing) {
                console.log(`User Pool Domain ${domain} was pre-existing, not deleting`);
                // Just clear our tracking
                this.state.domain = undefined;
            } else {
                console.log('No User Pool Domain to delete');
            }
        } catch (error) {
            throw new Error(`Failed to delete User Pool Domain ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    /**
     * Check if domain is ready
     * Domain is ready when status is ACTIVE
     */
    override checkReadiness(): boolean {
        const domain = this.state.domain || this.definition.domain;
        if (!domain) {
            console.log('User Pool Domain not specified');
            return false;
        }
        
        try {
            console.log(`Checking readiness for User Pool Domain: ${domain}`);
            const domainInfo = this.describeDomain(domain);
            
            if (!domainInfo) {
                console.log(`User Pool Domain ${domain} not found in AWS - may still be provisioning`);
                return false;
            }
            
            const status = domainInfo.Status as string;
            console.log(`User Pool Domain ${domain} current status: ${status || 'UNKNOWN'}`);
            
            if (status === 'ACTIVE') {
                console.log(`User Pool Domain ${domain} is ready (status: ACTIVE)`);
                // Update state with latest info now that it's active
                if (!this.state.domain) {
                    const state = this.formatDomainState(domainInfo, this.state.existing);
                    Object.assign(this.state, state);
                }
                return true;
            } else {
                console.log(`User Pool Domain ${domain} not ready yet (status: ${status || 'UNKNOWN'})`);
                if (status === 'FAILED') {
                    console.log(`User Pool Domain ${domain} creation failed - check AWS console for details`);
                }
                return false;
            }
        } catch (error) {
            console.log(`Failed to check User Pool Domain readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    
    /**
     * Get comprehensive domain information
     */
    @action("get-domain-info")
    getDomainInfo(): void {
        const domain = this.state.domain || this.definition.domain;
        
        try {
            if (!domain) {
                cli.output(`No domain specified in definition or state`);
                throw new Error(`No domain specified`);
            }
            
            const domainInfo = this.describeDomain(domain);
            if (!domainInfo) {
                cli.output(`User Pool Domain ${domain} not found in AWS`);
                throw new Error(`User Pool Domain ${domain} not found`);
            }
            
            cli.output("=== User Pool Domain Information ===");
            cli.output(`Domain: ${domainInfo.Domain}`);
            cli.output(`User Pool ID: ${domainInfo.UserPoolId}`);
            cli.output(`Status: ${domainInfo.Status}`);
            cli.output(`AWS Account ID: ${domainInfo.AWSAccountId || 'N/A'}`);
            
            if (domainInfo.CloudFrontDistribution) {
                cli.output(`CloudFront Distribution: ${domainInfo.CloudFrontDistribution}`);
            }
            
            if (domainInfo.CustomDomainConfig) {
                const customConfig = domainInfo.CustomDomainConfig as Record<string, unknown>;
                cli.output("Custom Domain Configuration:");
                cli.output(`  - Certificate ARN: ${customConfig.CertificateArn}`);
                if (customConfig.ManagedLoginVersion) {
                    cli.output(`  - Managed Login Version: ${customConfig.ManagedLoginVersion}`);
                }
            }
            
            if (domainInfo.Version) {
                cli.output(`Domain Version: ${domainInfo.Version}`);
            }
            
            // Generate full domain URL
            const fullDomain = this.getFullDomainUrl(domain);
            cli.output(`Full Domain URL: ${fullDomain}`);
            
        } catch (error) {
            const errorMsg = `Failed to get domain info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    /**
     * Generate hosted UI URLs for login, signup, and logout
     */
    @action("get-hosted-ui-url")
    getHostedUIUrl(): void {
        const domain = this.state.domain || this.definition.domain;
        
        try {
            if (!domain) {
                cli.output(`No domain specified in definition or state`);
                throw new Error(`No domain specified`);
            }
            
            const domainInfo = this.describeDomain(domain);
            if (!domainInfo || domainInfo.Status !== 'ACTIVE') {
                cli.output(`User Pool Domain ${domain} is not active`);
                throw new Error(`User Pool Domain ${domain} is not active`);
            }
            
            const fullDomain = this.getFullDomainUrl(domain);
            
            cli.output("=== Hosted UI URLs ===");
            cli.output(`Base Domain: ${fullDomain}`);
            cli.output("");
            cli.output("Login/Signup URLs (replace CLIENT_ID and REDIRECT_URI):");
            cli.output(`Login: ${fullDomain}/login?client_id=CLIENT_ID&response_type=code&scope=openid&redirect_uri=REDIRECT_URI`);
            cli.output(`Signup: ${fullDomain}/signup?client_id=CLIENT_ID&response_type=code&scope=openid&redirect_uri=REDIRECT_URI`);
            cli.output(`Logout: ${fullDomain}/logout?client_id=CLIENT_ID&logout_uri=REDIRECT_URI`);
            cli.output("");
            cli.output("OAuth 2.0 Endpoints:");
            cli.output(`Authorization: ${fullDomain}/oauth2/authorize`);
            cli.output(`Token: ${fullDomain}/oauth2/token`);
            cli.output(`UserInfo: ${fullDomain}/oauth2/userInfo`);
            cli.output(`JWKS: ${fullDomain}/.well-known/jwks.json`);
            
        } catch (error) {
            const errorMsg = `Failed to generate hosted UI URLs: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    /**
     * Debug domain creation issues
     */
    @action("debug-domain")
    debugDomain(): void {
        const domain = this.definition.domain;
        const userPoolId = this.definition.user_pool_id;
        
        try {
            cli.output("=== Domain Debug Information ===");
            cli.output(`Domain: ${domain}`);
            cli.output(`User Pool ID: ${userPoolId}`);
            cli.output(`Region: ${this.region}`);
            cli.output("");
            
            // Validate domain format
            try {
                this.validateDomainFormat(domain);
                cli.output("✅ Domain format validation: PASSED");
            } catch (error) {
                cli.output(`❌ Domain format validation: FAILED - ${error instanceof Error ? error.message : 'Unknown error'}`);
                return;
            }
            
            // Check if domain exists
            const existingDomain = this.checkDomainExists(domain);
            if (existingDomain) {
                cli.output("✅ Domain exists in AWS");
                cli.output(`Status: ${existingDomain.Status}`);
                cli.output(`User Pool ID: ${existingDomain.UserPoolId}`);
            } else {
                cli.output("❌ Domain does not exist in AWS");
            }
            
            // Check entity state
            cli.output("");
            cli.output("=== Entity State ===");
            cli.output(`State domain: ${this.state.domain || 'Not set'}`);
            cli.output(`State existing: ${this.state.existing}`);
            cli.output(`State status: ${this.state.status || 'Not set'}`);
            
        } catch (error) {
            const errorMsg = `Failed to debug domain: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    /**
     * Test domain accessibility and SSL configuration
     */
    @action("test-domain-access")
    testDomainAccess(): void {
        const domain = this.state.domain || this.definition.domain;
        
        try {
            if (!domain) {
                cli.output(`No domain specified in definition or state`);
                throw new Error(`No domain specified`);
            }
            
            const domainInfo = this.describeDomain(domain);
            if (!domainInfo) {
                cli.output(`User Pool Domain ${domain} not found in AWS`);
                throw new Error(`User Pool Domain ${domain} not found`);
            }
            
            cli.output("=== Domain Access Test ===");
            cli.output(`Domain: ${domain}`);
            cli.output(`Status: ${domainInfo.Status}`);
            
            const fullDomain = this.getFullDomainUrl(domain);
            cli.output(`Full URL: ${fullDomain}`);
            
            // Test basic connectivity
            if (domainInfo.Status === 'ACTIVE') {
                cli.output(`✅ Domain Status: Active`);
                
                if (this.state.is_custom_domain) {
                    cli.output(`✅ Domain Type: Custom Domain`);
                    if (domainInfo.CloudFrontDistribution) {
                        cli.output(`✅ CloudFront Distribution: ${domainInfo.CloudFrontDistribution}`);
                    }
                    if ((domainInfo.CustomDomainConfig as Record<string, unknown>)?.CertificateArn) {
                        cli.output(`✅ SSL Certificate: Configured`);
                    }
                } else {
                    cli.output(`✅ Domain Type: Cognito Prefix Domain`);
                    cli.output(`✅ SSL: Automatically managed by AWS`);
                }
                
                cli.output("");
                cli.output("Next Steps:");
                cli.output("1. Configure User Pool Client with this domain");
                cli.output("2. Test login flow with a real client_id and redirect_uri");
                cli.output("3. Verify OAuth endpoints are accessible");
                
            } else {
                cli.output(`❌ Domain Status: ${domainInfo.Status}`);
                cli.output("Domain is not yet active. Please wait for AWS to complete setup.");
                
                if (domainInfo.Status === 'CREATING') {
                    cli.output("This typically takes 15-20 minutes for custom domains.");
                }
            }
            
        } catch (error) {
            const errorMsg = `Failed to test domain access: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    /**
     * Check if a domain exists in AWS
     */
    private checkDomainExists(domain: string): Record<string, unknown> | null {
        try {
            console.log(`Checking if domain ${domain} exists...`);
            const result = this.describeDomain(domain);
            if (result && typeof result === 'object' && 'DomainDescription' in result) {
                const domainDesc = result.DomainDescription as Record<string, unknown>;
                console.log(`Domain ${domain} exists with status: ${domainDesc.Status}`);
                return domainDesc;
            } else {
                console.log(`Domain ${domain} does not exist (no DomainDescription in response)`);
                return null;
            }
        } catch (error) {
            console.log(`Domain ${domain} does not exist (API error): ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Domain doesn't exist or API error
            return null;
        }
    }
    
    /**
     * Describe a User Pool Domain
     */
    private describeDomain(domain: string): Record<string, unknown> | null {
        try {
            console.log(`Describing domain: ${domain}`);
            const response = this.makeCognitoIdpRequest('DescribeUserPoolDomain', {
                Domain: domain
            });
            
            const domainDescription = response?.DomainDescription as Record<string, unknown>;
            if (domainDescription) {
                console.log(`Domain ${domain} found with status: ${domainDescription.Status}`);
                return domainDescription;
            } else {
                console.log(`Domain ${domain} - no DomainDescription in response`);
                return null;
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('ResourceNotFoundException')) {
                console.log(`Domain ${domain} not found in AWS (ResourceNotFoundException)`);
                return null;
            }
            console.log(`Error describing domain ${domain}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    
    /**
     * Validate domain format according to AWS Cognito requirements
     */
    private validateDomainFormat(domain: string): void {
        if (!domain || domain.length === 0) {
            throw new Error('Domain cannot be empty');
        }
        
        // Check if it's a custom domain (contains dots)
        if (domain.includes('.')) {
            // Custom domain validation
            if (domain.length > 63) {
                throw new Error('Custom domain name cannot exceed 63 characters');
            }
            // Basic domain format validation
            const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
            if (!domainRegex.test(domain)) {
                throw new Error(`Invalid custom domain format: ${domain}`);
            }
        } else {
            // Cognito prefix domain validation
            if (domain.length < 1 || domain.length > 63) {
                throw new Error('Cognito domain prefix must be between 1 and 63 characters');
            }
            // Cognito prefix can only contain lowercase letters, numbers, and hyphens
            const prefixRegex = /^[a-z0-9-]+$/;
            if (!prefixRegex.test(domain)) {
                throw new Error(`Invalid Cognito domain prefix: ${domain}. Only lowercase letters, numbers, and hyphens are allowed`);
            }
            // Cannot start or end with hyphen
            if (domain.startsWith('-') || domain.endsWith('-')) {
                throw new Error('Cognito domain prefix cannot start or end with a hyphen');
            }
            // Cannot contain forbidden words
            const forbiddenWords = ['aws', 'amazon', 'cognito'];
            const lowerDomain = domain.toLowerCase();
            for (const word of forbiddenWords) {
                if (lowerDomain.includes(word)) {
                    throw new Error(`Domain prefix cannot contain the word "${word}". AWS restricts the use of aws, amazon, or cognito in domain prefixes.`);
                }
            }
        }
    }
    
    /**
     * Determine if a domain is a custom domain or Cognito prefix
     */
    private isCustomDomain(domain: string): boolean {
        // Custom domains contain dots (e.g., auth.example.com)
        // Cognito prefix domains are just the prefix (e.g., myapp)
        return !!(domain && domain.includes('.'));
    }
    
    /**
     * Get the full domain URL for hosted UI
     */
    private getFullDomainUrl(domain: string): string {
        if (this.isCustomDomain(domain)) {
            return `https://${domain}`;
        } else {
            // Cognito prefix domain
            return `https://${domain}.auth.${this.region}.amazoncognito.com`;
        }
    }
    
    /**
     * Format domain state from AWS API response
     */
    private formatDomainState(domainDescription: Record<string, unknown>, wasPreExisting: boolean = false): UserPoolDomainState {
        return {
            existing: wasPreExisting,
            domain: domainDescription.Domain as string,
            cloudfront_distribution: domainDescription.CloudFrontDistribution as string,
            cloudfront_distribution_arn: domainDescription.CloudFrontDistributionArn as string,
            status: domainDescription.Status as string,
            custom_domain_config: (domainDescription.CustomDomainConfig as Record<string, unknown>) || undefined,
            creation_date: domainDescription.Version as string, // Version contains creation info
            is_custom_domain: this.isCustomDomain(domainDescription.Domain as string)
        };
    }
}
