import { action, type Args } from "monkec/base";
import cli from "cli";
import { AWSCognitoEntity, type AWSCognitoDefinition, type AWSCognitoState } from "./cognito-base.ts";

/**
 * Definition interface for AWS Cognito User Pool entity.
 * Configures user pool properties including MFA, password policy, and email settings.
 * @interface UserPoolDefinition
 */
export interface UserPoolDefinition extends AWSCognitoDefinition {
    /**
     * @description Name of the User Pool
     * @example "my-app-users"
     */
    pool_name: string;

    /**
     * @description Multi-factor authentication configuration
     * @example "OPTIONAL"
     */
    mfa_configuration?: "OFF" | "ON" | "OPTIONAL";

    /**
     * @description Custom attributes for user profiles
     */
    schema?: Array<{
        Name: string;
        AttributeDataType: "String" | "Number" | "DateTime" | "Boolean";
        Required?: boolean;
        Mutable?: boolean;
        DeveloperOnlyAttribute?: boolean;
        StringAttributeConstraints?: {
            MinLength?: string;
            MaxLength?: string;
        };
        NumberAttributeConstraints?: {
            MinValue?: string;
            MaxValue?: string;
        };
    }>;

    /**
     * @description Password policy settings
     */
    password_policy?: {
        MinimumLength?: number;
        RequireUppercase?: boolean;
        RequireLowercase?: boolean;
        RequireNumbers?: boolean;
        RequireSymbols?: boolean;
        TemporaryPasswordValidityDays?: number;
    };

    /**
     * @description Admin create user configuration
     */
    admin_create_user_config?: {
        AllowAdminCreateUserOnly?: boolean;
        UnusedAccountValidityDays?: number;
        InviteMessageAction?: "EMAIL" | "SMS" | "SUPPRESS";
        TemporaryPasswordValidityDays?: number;
    };

    /**
     * @description Device configuration settings
     */
    device_configuration?: {
        ChallengeRequiredOnNewDevice?: boolean;
        DeviceOnlyRememberedOnUserPrompt?: boolean;
    };

    /**
     * @description Email configuration for user communications
     */
    email_configuration?: {
        EmailSendingAccount?: "COGNITO_DEFAULT" | "DEVELOPER";
        SourceArn?: string;
        ReplyToEmailAddress?: string;
        ConfigurationSet?: string;
        From?: string;
    };

    /**
     * @description SMS configuration for user communications
     */
    sms_configuration?: {
        SnsCallerArn: string;
        ExternalId?: string;
        SnsRegion?: string;
    };

    /**
     * @description Auto-verified attributes
     * @example ["email", "phone_number"]
     */
    auto_verified_attributes?: ("email" | "phone_number")[];

    /**
     * @description Alias attributes for sign-in
     * @example ["email", "phone_number"]
     */
    alias_attributes?: ("email" | "phone_number" | "preferred_username")[];

    /**
     * @description Username attributes for sign-in
     * @example ["email", "phone_number"]
     */
    username_attributes?: ("email" | "phone_number")[];

    /**
     * @description Custom verification message templates
     */
    verification_message_template?: {
        SmsMessage?: string;
        EmailMessage?: string;
        EmailSubject?: string;
        EmailMessageByLink?: string;
        EmailSubjectByLink?: string;
        DefaultEmailOption?: "CONFIRM_WITH_LINK" | "CONFIRM_WITH_CODE";
    };

    /**
     * @description Account recovery settings
     */
    account_recovery_setting?: {
        RecoveryMechanisms: Array<{
            Priority: 1 | 2;
            Name: "verified_email" | "verified_phone_number" | "admin_only";
        }>;
    };

    /**
     * @description Username configuration
     */
    username_configuration?: {
        CaseSensitive?: boolean;
    };

    /**
     * @description User pool add-ons
     */
    user_pool_add_ons?: {
        AdvancedSecurityMode?: "OFF" | "AUDIT" | "ENFORCED";
    };

    /**
     * @description User attribute update settings
     */
    user_attribute_update_settings?: {
        AttributesRequireVerificationBeforeUpdate?: ("email" | "phone_number")[];
    };

    /**
     * @description Tags to apply to the User Pool
     * @example { "Environment": "production", "Team": "backend" }
     */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS Cognito User Pool entity.
 * Contains runtime information about the created user pool.
 * @interface UserPoolState
 */
export interface UserPoolState extends AWSCognitoState {
    /** @description User Pool ID assigned by AWS */
    user_pool_id?: string;
    /** @description User Pool ARN */
    user_pool_arn?: string;
    /** @description User Pool name */
    user_pool_name?: string;
    /** @description Current status of the User Pool */
    user_pool_status?: string;
    /** @description Creation timestamp */
    creation_date?: string;
    /** @description Last modification timestamp */
    last_modified_date?: string;
    /** @description Current MFA configuration */
    mfa_configuration?: string;
    /** @description Estimated number of users */
    estimated_number_of_users?: number;
}

/**
 * @description AWS Cognito User Pool entity.
 * Creates and manages Amazon Cognito User Pools for user authentication and management.
 * Supports MFA, password policies, custom attributes, and federated identity providers.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.user_pool_id` - User Pool ID for SDK operations and client configuration
 * - `state.user_pool_arn` - User Pool ARN for IAM policies
 * - `state.user_pool_name` - User Pool display name
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-cognito/user-pool-client` - Create app clients for web/mobile applications
 * - `aws-cognito/user-pool-domain` - Configure hosted UI domain
 * - `aws-cognito/identity-provider` - Add social or SAML identity providers
 * - `aws-api-gateway/api-gateway` - Protect APIs with Cognito authorizers
 */
export class UserPool extends AWSCognitoEntity<UserPoolDefinition, UserPoolState> {

    protected getUserPoolName(): string {
        return this.definition.pool_name;
    }

    override create(): void {
        console.log(`Creating User Pool: ${this.definition.pool_name}`);
        
        // Validate pool name
        if (!this.definition.pool_name || this.definition.pool_name.length < 1 || this.definition.pool_name.length > 128) {
            throw new Error("User Pool name must be between 1 and 128 characters");
        }

        // Check if User Pool already exists
        const existingPool = this.checkUserPoolExists(this.definition.pool_name);
        if (existingPool && existingPool.UserPool) {
            console.log(`User Pool ${this.definition.pool_name} already exists, adopting it`);
            const state = this.formatUserPoolState(existingPool.UserPool, true);
            Object.assign(this.state, state);
            return;
        }

        // Build User Pool configuration
        const params: Record<string, unknown> = {
            PoolName: this.definition.pool_name
        };

        // MFA Configuration
        if (this.definition.mfa_configuration) {
            params.MfaConfiguration = this.definition.mfa_configuration;
        }

        // Password Policy
        if (this.definition.password_policy) {
            params.Policies = {
                PasswordPolicy: {
                    MinimumLength: this.definition.password_policy.MinimumLength || 8,
                    RequireUppercase: this.definition.password_policy.RequireUppercase !== false,
                    RequireLowercase: this.definition.password_policy.RequireLowercase !== false,
                    RequireNumbers: this.definition.password_policy.RequireNumbers !== false,
                    RequireSymbols: this.definition.password_policy.RequireSymbols || false,
                    TemporaryPasswordValidityDays: this.definition.password_policy.TemporaryPasswordValidityDays || 7
                }
            };
        }

        // Admin Create User Config
        if (this.definition.admin_create_user_config) {
            const adminConfig: Record<string, unknown> = {
                AllowAdminCreateUserOnly: this.definition.admin_create_user_config.AllowAdminCreateUserOnly || false,
                InviteMessageAction: this.definition.admin_create_user_config.InviteMessageAction || "EMAIL"
            };
            
            // Only add TemporaryPasswordValidityDays if explicitly defined
            if (this.definition.admin_create_user_config.TemporaryPasswordValidityDays !== undefined) {
                adminConfig.TemporaryPasswordValidityDays = this.definition.admin_create_user_config.TemporaryPasswordValidityDays;
            }
            
            params.AdminCreateUserConfig = adminConfig;
        }

        // Device Configuration
        if (this.definition.device_configuration) {
            params.DeviceConfiguration = {
                ChallengeRequiredOnNewDevice: this.definition.device_configuration.ChallengeRequiredOnNewDevice || false,
                DeviceOnlyRememberedOnUserPrompt: this.definition.device_configuration.DeviceOnlyRememberedOnUserPrompt || false
            };
        }

        // Email Configuration
        if (this.definition.email_configuration) {
            const emailConfig: Record<string, unknown> = {
                EmailSendingAccount: this.definition.email_configuration.EmailSendingAccount || "COGNITO_DEFAULT"
            };
            
            if (this.definition.email_configuration.SourceArn) {
                emailConfig.SourceArn = this.definition.email_configuration.SourceArn;
            }
            if (this.definition.email_configuration.ReplyToEmailAddress) {
                emailConfig.ReplyToEmailAddress = this.definition.email_configuration.ReplyToEmailAddress;
            }
            if (this.definition.email_configuration.ConfigurationSet) {
                emailConfig.ConfigurationSet = this.definition.email_configuration.ConfigurationSet;
            }
            if (this.definition.email_configuration.From) {
                emailConfig.From = this.definition.email_configuration.From;
            }
            
            params.EmailConfiguration = emailConfig;
        }

        // SMS Configuration
        if (this.definition.sms_configuration) {
            const smsConfig: Record<string, unknown> = {
                SnsCallerArn: this.definition.sms_configuration.SnsCallerArn
            };
            
            if (this.definition.sms_configuration.ExternalId) {
                smsConfig.ExternalId = this.definition.sms_configuration.ExternalId;
            }
            if (this.definition.sms_configuration.SnsRegion) {
                smsConfig.SnsRegion = this.definition.sms_configuration.SnsRegion;
            }
            
            params.SmsConfiguration = smsConfig;
        }

        // Auto-verified attributes
        if (this.definition.auto_verified_attributes && this.definition.auto_verified_attributes.length > 0) {
            params.AutoVerifiedAttributes = this.definition.auto_verified_attributes;
        }

        // Alias attributes
        if (this.definition.alias_attributes && this.definition.alias_attributes.length > 0) {
            params.AliasAttributes = this.definition.alias_attributes;
        }

        // Username attributes
        if (this.definition.username_attributes && this.definition.username_attributes.length > 0) {
            params.UsernameAttributes = this.definition.username_attributes;
        }

        // Verification message template
        if (this.definition.verification_message_template) {
            const messageTemplate: Record<string, unknown> = {};
            
            if (this.definition.verification_message_template.SmsMessage) {
                messageTemplate.SmsMessage = this.definition.verification_message_template.SmsMessage;
            }
            if (this.definition.verification_message_template.EmailMessage) {
                messageTemplate.EmailMessage = this.definition.verification_message_template.EmailMessage;
            }
            if (this.definition.verification_message_template.EmailSubject) {
                messageTemplate.EmailSubject = this.definition.verification_message_template.EmailSubject;
            }
            if (this.definition.verification_message_template.DefaultEmailOption) {
                messageTemplate.DefaultEmailOption = this.definition.verification_message_template.DefaultEmailOption;
            }
            
            params.VerificationMessageTemplate = messageTemplate;
        }

        // Account recovery settings
        if (this.definition.account_recovery_setting) {
            params.AccountRecoverySetting = this.definition.account_recovery_setting;
        }

        // Username configuration
        if (this.definition.username_configuration) {
            params.UsernameConfiguration = {
                CaseSensitive: this.definition.username_configuration.CaseSensitive !== undefined ? this.definition.username_configuration.CaseSensitive : false
            };
        }

        // User pool add-ons
        if (this.definition.user_pool_add_ons) {
            params.UserPoolAddOns = {
                AdvancedSecurityMode: this.definition.user_pool_add_ons.AdvancedSecurityMode || "OFF"
            };
        }

        // User attribute update settings
        if (this.definition.user_attribute_update_settings) {
            params.UserAttributeUpdateSettings = this.definition.user_attribute_update_settings;
        }

        // Tags
        if (this.definition.tags) {
            params.UserPoolTags = this.definition.tags;
        }

        try {
            const response = this.makeCognitoIdpRequest("CreateUserPool", params);
            const userPool = (response as { UserPool?: Record<string, unknown> }).UserPool;
            if (userPool) {
                console.log(`User Pool created successfully: ${userPool.Id}`);
                const state = this.formatUserPoolState(userPool, false);
                Object.assign(this.state, state);
            } else {
                throw new Error("No UserPool data in response");
            }
        } catch (error) {
            throw new Error(`Failed to create User Pool ${this.definition.pool_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.user_pool_id) {
            throw new Error("Cannot update User Pool: not found in state");
        }

        console.log(`Updating User Pool: ${this.state.user_pool_id}`);

        const params: Record<string, unknown> = {
            UserPoolId: this.state.user_pool_id
        };

        // Similar parameter building as in create()
        if (this.definition.mfa_configuration) {
            params.MfaConfiguration = this.definition.mfa_configuration;
        }

        if (this.definition.tags) {
            params.UserPoolTags = this.definition.tags;
        }

        try {
            const response = this.makeCognitoIdpRequest("UpdateUserPool", params);
            console.log(`User Pool updated successfully: ${this.state.user_pool_id}`);
            
            // Update state if response contains updated pool data
            const userPool = (response as { UserPool?: Record<string, unknown> }).UserPool;
            if (userPool) {
                const state = this.formatUserPoolState(userPool, this.state.existing || false);
                Object.assign(this.state, state);
            }
        } catch (error) {
            throw new Error(`Failed to update User Pool ${this.state.user_pool_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        if (this.state.user_pool_id && !this.state.existing) {
            console.log(`Deleting User Pool: ${this.state.user_pool_id}`);
            this.deleteUserPool(this.state.user_pool_id);
            
            // Clear state
            this.state.user_pool_id = undefined;
            this.state.user_pool_arn = undefined;
            this.state.user_pool_name = undefined;
            this.state.user_pool_status = undefined;
        } else if (this.state.existing) {
            console.log(`User Pool ${this.state.user_pool_id} was pre-existing, not deleting`);
            // Just clear our tracking
            this.state.user_pool_id = undefined;
            this.state.user_pool_arn = undefined;
            this.state.user_pool_name = undefined;
            this.state.user_pool_status = undefined;
        }
    }

    override checkReadiness(): boolean {
        if (!this.state.user_pool_id) {
            return false;
        }

        // Early exit if already ready
        if (this.state.user_pool_status === 'Ready') {
            return true;
        }

        console.log(`Checking readiness for User Pool: ${this.state.user_pool_id}`);

        try {
            const response = this.checkUserPoolExistsById(this.state.user_pool_id);
            if (!response || !response.UserPool) {
                return false;
            }

            // Update state from current AWS information
            const updatedState = this.formatUserPoolState(response.UserPool, this.state.existing || false);
            Object.assign(this.state, updatedState);

            // User Pool is ready when status is not in a transitional state
            const status = response.UserPool.Status as string;
            return status !== 'Creating' && status !== 'Deleting';
        } catch (error) {
            console.log(`Readiness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }

    

    @action("get-pool-info")
    getPoolInfo(): void {
        try {
            if (!this.state.user_pool_id) {
                cli.output(`User Pool not found in entity state`);
                throw new Error(`User Pool not found`);
            }

            const response = this.checkUserPoolExistsById(this.state.user_pool_id);
            if (!response || !response.UserPool) {
                cli.output(`User Pool ${this.state.user_pool_id} not found in AWS`);
                throw new Error(`User Pool ${this.state.user_pool_id} not found`);
            }

            const pool = response.UserPool;
            
            cli.output("=== User Pool Information ===");
            cli.output(`Pool ID: ${pool.Id || 'N/A'}`);
            cli.output(`Pool Name: ${pool.Name || 'N/A'}`);
            cli.output(`Pool ARN: ${pool.Arn || 'N/A'}`);
            cli.output(`Status: ${pool.Status || 'N/A'}`);
            cli.output(`Creation Date: ${pool.CreationDate ? new Date((pool.CreationDate as number) * 1000).toISOString() : 'N/A'}`);
            cli.output(`Last Modified: ${pool.LastModifiedDate ? new Date((pool.LastModifiedDate as number) * 1000).toISOString() : 'N/A'}`);
            cli.output(`MFA Configuration: ${pool.MfaConfiguration || 'N/A'}`);
            cli.output(`Estimated Users: ${pool.EstimatedNumberOfUsers || 0}`);

        } catch (error) {
            const errorMsg = `Failed to get User Pool info: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    @action("list-users")
    listUsers(args?: Args): void {
        const limit = args?.limit ? parseInt(args.limit as string) : 10;
        
        try {
            if (!this.state.user_pool_id) {
                cli.output(`User Pool not found in entity state`);
                throw new Error(`User Pool not found`);
            }

            const params: Record<string, unknown> = {
                UserPoolId: this.state.user_pool_id,
                Limit: Math.min(limit, 60) // AWS maximum is 60
            };

            if (args?.pagination_token) {
                params.PaginationToken = args.pagination_token;
            }

            const response = this.makeCognitoIdpRequest("ListUsers", params);
            
            cli.output("=== User Pool Users ===");
            cli.output(`User Pool: ${this.state.user_pool_id}`);
            
            const users = (response as { Users?: Record<string, unknown>[] }).Users;
            if (users && users.length > 0) {
                cli.output(`\nFound ${users.length} users:`);
                
                for (const user of users) {
                    cli.output(`\n--- User: ${user.Username || 'N/A'} ---`);
                    cli.output(`Status: ${user.UserStatus || 'N/A'}`);
                    cli.output(`Enabled: ${user.Enabled !== false}`);
                    
                    const createDate = user.UserCreateDate as number;
                    cli.output(`Created: ${createDate ? new Date(createDate * 1000).toISOString() : 'N/A'}`);
                }
                
                const paginationToken = (response as { PaginationToken?: string }).PaginationToken;
                if (paginationToken) {
                    cli.output(`\nPagination Token (for next page): ${paginationToken}`);
                }
            } else {
                cli.output("\nNo users found in the User Pool");
            }

        } catch (error) {
            const errorMsg = `Failed to list users: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    @action("create-user")
    createUser(args?: Args): void {
        try {
            if (!this.state.user_pool_id) {
                cli.output(`User Pool not found in entity state`);
                throw new Error(`User Pool not found`);
            }

            if (!args?.username) {
                cli.output("Username is required");
                throw new Error("Username is required");
            }

            const params: Record<string, unknown> = {
                UserPoolId: this.state.user_pool_id,
                Username: args.username,
                MessageAction: args.message_action || "EMAIL", // Default to EMAIL
                TemporaryPassword: args.temporary_password || undefined
            };

            // Parse user attributes if provided
            if (args.user_attributes) {
                try {
                    const attributes = typeof args.user_attributes === 'string' 
                        ? JSON.parse(args.user_attributes) 
                        : args.user_attributes;
                    
                    params.UserAttributes = Object.entries(attributes as Record<string, unknown>).map(([name, value]) => ({
                        Name: name,
                        Value: String(value)
                    }));
                } catch (_error) {
                    cli.output("Invalid user_attributes format. Expected JSON object.");
                    throw new Error("Invalid user_attributes format");
                }
            }

            const response = this.makeCognitoIdpRequest("AdminCreateUser", params);
            
            const user = (response as { User?: Record<string, unknown> }).User;
            if (user) {
                cli.output("=== User Created Successfully ===");
                cli.output(`Username: ${user.Username || 'N/A'}`);
                cli.output(`Status: ${user.UserStatus || 'N/A'}`);
                cli.output(`Enabled: ${user.Enabled !== false}`);
                
                const createDate = user.UserCreateDate as number;
                cli.output(`Created: ${createDate ? new Date(createDate * 1000).toISOString() : 'N/A'}`);
            }

        } catch (error) {
            const errorMsg = `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }

    private formatUserPoolState(userPool: Record<string, unknown>, wasPreExisting: boolean = false): Record<string, unknown> {
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
}