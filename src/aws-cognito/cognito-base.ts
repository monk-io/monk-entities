import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

export interface AWSCognitoDefinition {
    /** @description AWS region where the Cognito resources will be managed */
    region: string;
}

export interface AWSCognitoState {
    /** @description Indicates if the resource pre-existed before this entity managed it */
    existing?: boolean;
}

// AWS Cognito Identity Provider API response interfaces
export interface CognitoUserPoolResponse {
    UserPool?: {
        Id?: string;
        Name?: string;
        Arn?: string;
        Status?: string;
        CreationDate?: number;
        LastModifiedDate?: number;
        MfaConfiguration?: string;
        DeviceConfiguration?: {
            ChallengeRequiredOnNewDevice?: boolean;
            DeviceOnlyRememberedOnUserPrompt?: boolean;
        };
        EstimatedNumberOfUsers?: number;
        EmailConfiguration?: {
            SourceArn?: string;
            ReplyToEmailAddress?: string;
            EmailSendingAccount?: string;
            ConfigurationSet?: string;
            From?: string;
        };
        SmsConfiguration?: {
            SnsCallerArn?: string;
            ExternalId?: string;
            SnsRegion?: string;
        };
        UserPoolTags?: Record<string, string>;
        SmsConfigurationFailure?: string;
        EmailConfigurationFailure?: string;
        Domain?: string;
        CustomDomain?: string;
        AdminCreateUserConfig?: {
            AllowAdminCreateUserOnly?: boolean;
            UnusedAccountValidityDays?: number;
            InviteMessageAction?: string;
            TemporaryPasswordValidityDays?: number;
        };
        UserPoolAddOns?: {
            AdvancedSecurityMode?: string;
        };
        UsernameConfiguration?: {
            CaseSensitive?: boolean;
        };
        Policies?: {
            PasswordPolicy?: {
                MinimumLength?: number;
                RequireUppercase?: boolean;
                RequireLowercase?: boolean;
                RequireNumbers?: boolean;
                RequireSymbols?: boolean;
                TemporaryPasswordValidityDays?: number;
            };
        };
        Schema?: Array<{
            Name?: string;
            AttributeDataType?: string;
            DeveloperOnlyAttribute?: boolean;
            Mutable?: boolean;
            Required?: boolean;
            NumberAttributeConstraints?: {
                MinValue?: string;
                MaxValue?: string;
            };
            StringAttributeConstraints?: {
                MinLength?: string;
                MaxLength?: string;
            };
        }>;
        AutoVerifiedAttributes?: string[];
        AliasAttributes?: string[];
        UsernameAttributes?: string[];
        VerificationMessageTemplate?: {
            SmsMessage?: string;
            EmailMessage?: string;
            EmailSubject?: string;
            EmailMessageByLink?: string;
            EmailSubjectByLink?: string;
            DefaultEmailOption?: string;
        };
        UserAttributeUpdateSettings?: {
            AttributesRequireVerificationBeforeUpdate?: string[];
        };
        AccountRecoverySetting?: {
            RecoveryMechanisms?: Array<{
                Priority?: number;
                Name?: string;
            }>;
        };
    };
}

export interface CognitoIdentityPoolResponse {
    IdentityPoolId?: string;
    IdentityPoolName?: string;
    AllowUnauthenticatedIdentities?: boolean;
    AllowClassicFlow?: boolean;
    SupportedLoginProviders?: Record<string, string>;
    DeveloperProviderName?: string;
    OpenIdConnectProviderARNs?: string[];
    CognitoIdentityProviders?: Array<{
        ProviderName?: string;
        ClientId?: string;
        ServerSideTokenCheck?: boolean;
    }>;
    SamlProviderArns?: string[];
    IdentityPoolTags?: Record<string, string>;
}

export interface CognitoErrorResponse {
    __type?: string;
    message?: string;
    code?: string;
}

export abstract class AWSCognitoEntity<
    TDefinition extends AWSCognitoDefinition,
    TState extends AWSCognitoState
> extends MonkEntity<TDefinition, TState> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    /**
     * Makes a request to AWS Cognito Identity Provider API
     * Used for User Pool operations
     */
    protected makeCognitoIdpRequest(action: string, body: Record<string, unknown> = {}): Record<string, unknown> {
        const url = `https://cognito-idp.${this.region}.amazonaws.com/`;
        
        const options: Record<string, unknown> = {
            service: "cognito-idp",
            region: this.region,
            headers: {
                "Content-Type": "application/x-amz-json-1.1",
                "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`
            },
            timeout: 30000,
        };

        if (body && Object.keys(body).length > 0) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = aws.post(url, options);
            
            if (response.statusCode >= 400) {
                let errorMessage = `AWS Cognito IDP API error: ${response.statusCode} ${response.status}`;
                let errorDetails: CognitoErrorResponse = {};
                
                try {
                    errorDetails = JSON.parse(response.body);
                    if (errorDetails.message) {
                        errorMessage += ` - ${errorDetails.message}`;
                    }
                    if (errorDetails.__type) {
                        errorMessage += ` - Type: ${errorDetails.__type}`;
                    }
                    if (errorDetails.code) {
                        errorMessage += ` - Code: ${errorDetails.code}`;
                    }
                } catch (_parseError) {
                    errorMessage += ` - Raw response: ${response.body}`;
                }

                // Enhanced error details for specific status codes
                if (response.statusCode === 403) {
                    errorMessage += `\n\n🔍 403 FORBIDDEN ERROR ANALYSIS:`;
                    errorMessage += `\n   • Request URL: ${url}`;
                    errorMessage += `\n   • Action: ${action}`;
                    errorMessage += `\n   • Region: ${this.region}`;
                    errorMessage += `\n\n💡 COGNITO 403 TROUBLESHOOTING:`;
                    errorMessage += `\n   1. Missing Cognito permissions - you need:`;
                    errorMessage += `\n      • cognito-idp:CreateUserPool`;
                    errorMessage += `\n      • cognito-idp:DescribeUserPool`;
                    errorMessage += `\n      • cognito-idp:UpdateUserPool`;
                    errorMessage += `\n      • cognito-idp:DeleteUserPool`;
                    errorMessage += `\n      • cognito-idp:ListUserPools`;
                    errorMessage += `\n   2. Check if you have the required IAM policy attached`;
                    errorMessage += `\n   3. Verify your AWS credentials are valid`;
                    errorMessage += `\n   4. Ensure the region is correct`;
                }

                // Add full response details for debugging
                errorMessage += `\n\n📋 FULL ERROR DETAILS:`;
                errorMessage += `\n   Status Code: ${response.statusCode}`;
                errorMessage += `\n   Status Text: ${response.status || 'N/A'}`;
                errorMessage += `\n   Response Headers: ${JSON.stringify(response.headers || {}, null, 2)}`;
                errorMessage += `\n   Response Body: ${response.body || 'Empty'}`;
                errorMessage += `\n   Request Body: ${JSON.stringify(body, null, 2)}`;
                
                throw new Error(errorMessage);
            }

            // Parse response body if present
            if (response.body) {
                try {
                    return JSON.parse(response.body) as Record<string, unknown>;
                } catch (error) {
                    throw new Error(`Failed to parse AWS Cognito IDP API response: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            return response as unknown as Record<string, unknown>;
        } catch (error) {
            throw new Error(`AWS Cognito IDP API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Makes a request to AWS Cognito Identity API
     * Used for Identity Pool operations
     */
    protected makeCognitoIdentityRequest(action: string, body: Record<string, unknown> = {}): Record<string, unknown> {
        const url = `https://cognito-identity.${this.region}.amazonaws.com/`;
        
        const options: Record<string, unknown> = {
            service: "cognito-identity",
            region: this.region,
            headers: {
                "Content-Type": "application/x-amz-json-1.1",
                "X-Amz-Target": `AWSCognitoIdentityService.${action}`
            },
            timeout: 30000,
        };

        if (body && Object.keys(body).length > 0) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = aws.post(url, options);
            
            if (response.statusCode >= 400) {
                let errorMessage = `AWS Cognito Identity API error: ${response.statusCode} ${response.status}`;
                let errorDetails: CognitoErrorResponse = {};
                
                try {
                    errorDetails = JSON.parse(response.body);
                    if (errorDetails.message) {
                        errorMessage += ` - ${errorDetails.message}`;
                    }
                    if (errorDetails.__type) {
                        errorMessage += ` - Type: ${errorDetails.__type}`;
                    }
                    if (errorDetails.code) {
                        errorMessage += ` - Code: ${errorDetails.code}`;
                    }
                } catch (_parseError) {
                    errorMessage += ` - Raw response: ${response.body}`;
                }

                throw new Error(errorMessage);
            }

            // Parse response body if present
            if (response.body) {
                try {
                    return JSON.parse(response.body) as Record<string, unknown>;
                } catch (error) {
                    throw new Error(`Failed to parse AWS Cognito Identity API response: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            return response as unknown as Record<string, unknown>;
        } catch (error) {
            throw new Error(`AWS Cognito Identity API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Checks if a User Pool exists by name
     */
    protected checkUserPoolExists(poolName: string): CognitoUserPoolResponse | null {
        try {
            // List all User Pools to find one with matching name
            const response = this.makeCognitoIdpRequest("ListUserPools", {
                MaxResults: 60 // Maximum allowed
            });
            
            const userPools = (response as { UserPools?: { Name?: string; Id?: string }[] }).UserPools;
            if (userPools) {
                for (const pool of userPools) {
                    if (pool.Name === poolName) {
                        // Get detailed information about the found pool
                        const detailResponse = this.makeCognitoIdpRequest("DescribeUserPool", {
                            UserPoolId: pool.Id
                        });
                        return detailResponse as CognitoUserPoolResponse;
                    }
                }
            }
            
            return null;
        } catch (error) {
            // If we can't list pools or the specific pool doesn't exist
            if (error instanceof Error && (error.message.includes("404") || error.message.includes("ResourceNotFoundException"))) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Checks if a User Pool exists by ID
     */
    protected checkUserPoolExistsById(userPoolId: string): CognitoUserPoolResponse | null {
        try {
            const response = this.makeCognitoIdpRequest("DescribeUserPool", {
                UserPoolId: userPoolId
            });
            return response as CognitoUserPoolResponse;
        } catch (error) {
            // User Pool doesn't exist if we get a 404 or ResourceNotFoundException
            if (error instanceof Error && (error.message.includes("404") || error.message.includes("ResourceNotFoundException"))) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Checks if an Identity Pool exists by name
     */
    protected checkIdentityPoolExists(poolName: string): CognitoIdentityPoolResponse | null {
        try {
            // List all Identity Pools to find one with matching name
            const response = this.makeCognitoIdentityRequest("ListIdentityPools", {
                MaxResults: 60 // Maximum allowed
            });
            
            const identityPools = (response as { IdentityPools?: { IdentityPoolName?: string; IdentityPoolId?: string }[] }).IdentityPools;
            if (identityPools) {
                for (const pool of identityPools) {
                    if (pool.IdentityPoolName === poolName) {
                        // Get detailed information about the found pool
                        const detailResponse = this.makeCognitoIdentityRequest("DescribeIdentityPool", {
                            IdentityPoolId: pool.IdentityPoolId
                        });
                        return detailResponse as CognitoIdentityPoolResponse;
                    }
                }
            }
            
            return null;
        } catch (error) {
            // If we can't list pools or the specific pool doesn't exist
            if (error instanceof Error && (error.message.includes("404") || error.message.includes("ResourceNotFoundException"))) {
                return null;
            }
            throw error;
        }
    }

    /**
     * Deletes a User Pool (only if we created it)
     */
    protected deleteUserPool(userPoolId: string): void {
        if (this.state.existing) {
            return;
        }

        try {
            this.makeCognitoIdpRequest("DeleteUserPool", {
                UserPoolId: userPoolId
            });
        } catch (error) {
            throw new Error(`Failed to delete User Pool ${userPoolId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Deletes an Identity Pool (only if we created it)
     */
    protected deleteIdentityPool(identityPoolId: string): void {
        if (this.state.existing) {
            return;
        }

        try {
            this.makeCognitoIdentityRequest("DeleteIdentityPool", {
                IdentityPoolId: identityPoolId
            });
        } catch (error) {
            throw new Error(`Failed to delete Identity Pool ${identityPoolId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}