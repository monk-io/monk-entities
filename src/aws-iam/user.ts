import { AWSIAMEntity, AWSIAMDefinition, AWSIAMState } from "./base.ts";
import { IAM_ACTIONS, formatIAMResourceName } from "./common.ts";
import { action } from "monkec/base";
import cli from "cli";
import secret from "secret";

export interface IAMUserDefinition extends AWSIAMDefinition {
    /** @description Name of the IAM user */
    user_name: string;
    /** @description Path for the user (default: "/") */
    path?: string;
    /** @description Permissions boundary policy ARN for the user */
    permissions_boundary?: string;
    /** @description Tags to apply to the user */
    tags?: Record<string, string>;
    /** @description List of policy ARNs to attach to the user */
    attached_policy_arns?: string[];
    /** @description Whether to create access keys for this user */
    create_access_keys?: boolean;
    /** @description Secret reference for storing the access key ID */
    access_key_id_secret_ref?: string;
    /** @description Secret reference for storing the secret access key */
    secret_access_key_secret_ref?: string;
}

export interface IAMUserState extends AWSIAMState {
    /** @description IAM user ARN */
    user_arn?: string;
    /** @description IAM user ID */
    user_id?: string;
    /** @description IAM user creation date */
    create_date?: string;
    /** @description Access key ID (if created) */
    access_key_id?: string;
    /** @description Whether access keys were created by this entity */
    access_keys_created?: boolean;
    /** @description List of attached policy ARNs */
    attached_policies?: string[];
}

/**
 * @description AWS IAM User entity.
 * Creates and manages IAM users for programmatic and console access.
 * Supports access key generation and policy attachments.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: secret names from `access_key_id_secret_ref`, `secret_access_key_secret_ref` properties (if `create_access_key` is true)
 * 
 * ## State Fields for Composition
 * - `state.user_arn` - User ARN for policies and cross-account access
 * - `state.user_id` - User ID
 * - `state.access_key_id` - Access key ID (if created)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-iam/policy` - Attach policies for permissions
 */
export class IAMUser extends AWSIAMEntity<IAMUserDefinition, IAMUserState> {
    
    // Customize readiness check parameters
    static readonly readiness = { period: 5, initialDelay: 5, attempts: 12 };
    
    override checkReadiness(): boolean {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            // If we're managing an existing user, trust that it exists
            if (this.state.existing) {
                console.log(`IAM User ${userName} is existing user - checking configuration readiness`);
                
                // For existing users, check if access keys were created if requested
                if (this.definition.create_access_keys && !this.state.access_key_id) {
                    console.log(`IAM User ${userName} not ready - access keys not created for existing user`);
                    return false;
                }
                
                console.log(`IAM User ${userName} (existing) is ready`);
                return true;
            }
            
            // For new users, verify the user exists in AWS
            const userExists = this.checkUserExists(userName);
            if (!userExists) {
                console.log(`IAM User ${userName} not ready - user doesn't exist`);
                return false;
            }
            
            // Check if access keys exist if they were requested
            if (this.definition.create_access_keys && !this.state.access_key_id) {
                console.log(`IAM User ${userName} not ready - access keys not created`);
                return false;
            }
            
            console.log(`IAM User ${userName} is ready`);
            return true;
        } catch (error) {
            console.log(`IAM User ${userName} readiness check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    checkLiveness(): boolean { return this.checkReadiness(); }
    
    override create(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        const existingUser = this.checkUserExists(userName);
        
        if (existingUser) {
            // Mark as existing (don't delete on cleanup)
            this.state.existing = true;
            const userObj = (existingUser as Record<string, unknown>).User as Record<string, unknown>;
            this.state.user_arn = userObj?.Arn as string;
            this.state.user_id = userObj?.UserId as string;
            this.state.create_date = userObj?.CreateDate as string;
            
            cli.output(`IAM User ${userName} already exists, managing existing user`);
            
            // Still attach policies and create access keys if requested
            this.attachPolicies();
            this.createAccessKeysIfRequested();
            return;
        }
        
        // Create new user
        const params: Record<string, unknown> = {
            UserName: userName,
        };
        
        if (this.definition.path) {
            params.Path = this.definition.path;
        }
        
        if (this.definition.permissions_boundary) {
            params.PermissionsBoundary = this.definition.permissions_boundary;
        }
        
        if (this.definition.tags) {
            let tagIndex = 1;
            for (const [key, value] of Object.entries(this.definition.tags)) {
                params[`Tags.member.${tagIndex}.Key`] = key;
                params[`Tags.member.${tagIndex}.Value`] = value;
                tagIndex++;
            }
        }
        
        try {
            const response = this.makeAWSRequest("POST", IAM_ACTIONS.CREATE_USER, params);
            
            if (response?.User) {
                this.state.existing = false;
                this.state.user_arn = response.User.Arn;
                this.state.user_id = response.User.UserId;
                this.state.create_date = response.User.CreateDate;
                
                cli.output(`Created IAM User: ${userName} (ARN: ${this.state.user_arn})`);
                
                // Attach policies after user creation
                this.attachPolicies();
                
                // Create access keys if requested
                this.createAccessKeysIfRequested();
            } else {
                throw new Error("User creation response missing User object");
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            // Check if user already exists
            if (errorMessage.includes('EntityAlreadyExists') || 
                errorMessage.includes('already exists')) {
                cli.output(`IAM User ${userName} already exists, attempting to manage existing user`);
                
                // Try to get the existing user info
                const existingUser = this.checkUserExists(userName);
                if (existingUser) {
                    this.state.existing = true;
                    const userObj = (existingUser as Record<string, unknown>).User as Record<string, unknown>;
                    this.state.user_arn = userObj?.Arn as string;
                    this.state.user_id = userObj?.UserId as string;
                    this.state.create_date = userObj?.CreateDate as string;
                    
                    cli.output(`Managing existing IAM User: ${userName} (ARN: ${this.state.user_arn})`);
                } else {
                    // User exists but we can't get details (likely permissions issue)
                    this.state.existing = true;
                    
                    // Create a basic ARN pattern for the user even without full details
                    this.state.user_arn = `arn:aws:iam::*:user/${userName}`;
                    
                    cli.output(`Managing existing IAM User: ${userName} (limited permissions - using basic ARN)`);
                }
                
                // Still attach policies and create access keys if requested
                try {
                    this.attachPolicies();
                    this.createAccessKeysIfRequested();
                } catch (policyError) {
                    const policyErrorMsg = policyError instanceof Error ? policyError.message : 'Unknown error';
                    cli.output(`Note: Could not fully configure existing user: ${policyErrorMsg}`);
                }
                return;
            }
            
            throw new Error(`Failed to create IAM User ${userName}: ${errorMessage}`);
        }
    }
    
    override delete(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        // Don't delete pre-existing users
        if (this.state.existing) {
            cli.output(`Not deleting pre-existing IAM User ${userName}`);
            
            // Clean up access keys if we created them
            if (this.state.access_keys_created && this.state.access_key_id) {
                this.deleteAllAccessKeys();
            }
            
            // Detach policies we attached
            this.detachPolicies();
            
            // Clear state
            this.state.user_arn = undefined;
            this.state.user_id = undefined;
            this.state.access_key_id = undefined;
            this.state.access_keys_created = undefined;
            this.state.attached_policies = undefined;
            return;
        }
        
        if (!this.state.user_arn) {
            cli.output(`IAM User ${userName} not found in state, nothing to delete`);
            return;
        }
        
        try {
            // First, ensure all access keys are deleted
            this.deleteAllAccessKeys();
            
            // Detach all policies
            this.detachPolicies();
            
            // Delete the user
            this.makeAWSRequest("POST", IAM_ACTIONS.DELETE_USER, {
                UserName: userName
            });
            
            cli.output(`Deleted IAM User: ${userName}`);
            
            // Clear state
            this.state.user_arn = undefined;
            this.state.user_id = undefined;
            this.state.create_date = undefined;
            this.state.access_key_id = undefined;
            this.state.access_keys_created = undefined;
            this.state.attached_policies = undefined;
            
        } catch (error) {
            throw new Error(`Failed to delete IAM User ${userName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    override update(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        // Update policy attachments
        this.attachPolicies();
        
        // Create or update access keys if needed
        this.createAccessKeysIfRequested();
        
        cli.output(`Updated IAM User ${userName}`);
    }
    
    protected getPolicyName(): string {
        return formatIAMResourceName(this.definition.user_name);
    }
    
    private checkUserExists(userName: string): Record<string, unknown> | null {
        try {
            const response = this.makeAWSRequest("POST", IAM_ACTIONS.GET_USER, {
                UserName: userName
            });
            return response;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            
            // Check if it's a "user not found" error
            if (errorMessage.includes('NoSuchEntity') || 
                errorMessage.includes('does not exist') || 
                errorMessage.includes('404')) {
                // User doesn't exist - this is expected
                return null;
            }
            
            // For any other error, log it but don't assume user doesn't exist
            console.log(`Warning: Error checking if user ${userName} exists: ${errorMessage}`);
            
            // Return null to be safe, but this might indicate a permissions issue
            return null;
        }
    }
    
    private attachPolicies(): void {
        if (!this.definition.attached_policy_arns || this.definition.attached_policy_arns.length === 0) {
            return;
        }
        
        const userName = formatIAMResourceName(this.definition.user_name);
        const attachedPolicies: string[] = [];
        
        for (const policyArn of this.definition.attached_policy_arns) {
            try {
                this.makeAWSRequest("POST", IAM_ACTIONS.ATTACH_USER_POLICY, {
                    UserName: userName,
                    PolicyArn: policyArn
                });
                
                attachedPolicies.push(policyArn);
                cli.output(`Attached policy ${policyArn} to user ${userName}`);
            } catch (error) {
                // Policy might already be attached, check if that's the case
                if (error instanceof Error && error.message.includes('already attached')) {
                    attachedPolicies.push(policyArn);
                    cli.output(`Policy ${policyArn} already attached to user ${userName}`);
                } else {
                    cli.output(`Failed to attach policy ${policyArn}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
        }
        
        this.state.attached_policies = attachedPolicies;
    }
    
    private detachPolicies(): void {
        if (!this.state.attached_policies || this.state.attached_policies.length === 0) {
            return;
        }
        
        const userName = formatIAMResourceName(this.definition.user_name);
        
        for (const policyArn of this.state.attached_policies) {
            try {
                this.makeAWSRequest("POST", IAM_ACTIONS.DETACH_USER_POLICY, {
                    UserName: userName,
                    PolicyArn: policyArn
                });
                
                cli.output(`Detached policy ${policyArn} from user ${userName}`);
            } catch (error) {
                cli.output(`Failed to detach policy ${policyArn}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        
        this.state.attached_policies = undefined;
    }
    
    private createAccessKeysIfRequested(): void {
        if (!this.definition.create_access_keys) {
            return;
        }
        
        // Don't create keys if they already exist
        if (this.state.access_key_id && this.state.access_keys_created) {
            cli.output("Access keys already created for this user");
            return;
        }
        
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            const response = this.makeAWSRequest("POST", IAM_ACTIONS.CREATE_ACCESS_KEY, {
                UserName: userName
            });
            
            if (response?.AccessKey) {
                this.state.access_key_id = response.AccessKey.AccessKeyId;
                this.state.access_keys_created = true;
                
                // Store credentials in secrets
                this.storeCredentialsInSecrets(
                    response.AccessKey.AccessKeyId,
                    response.AccessKey.SecretAccessKey
                );
                
                cli.output(`Created access keys for IAM User ${userName}`);
                cli.output(`Access key ID stored in secret: ${this.getAccessKeyIdSecretRef()}`);
                cli.output(`Secret access key stored in secret: ${this.getSecretAccessKeySecretRef()}`);
            } else {
                throw new Error("Access key creation response missing AccessKey object");
            }
        } catch (error) {
            throw new Error(`Failed to create access keys for IAM User ${userName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private deleteAccessKeys(): void {
        if (!this.state.access_key_id) {
            return;
        }
        
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            this.makeAWSRequest("POST", IAM_ACTIONS.DELETE_ACCESS_KEY, {
                UserName: userName,
                AccessKeyId: this.state.access_key_id
            });
            
            // Remove from secrets
            this.removeCredentialsFromSecrets();
            
            cli.output(`Deleted access keys for IAM User ${userName}`);
            
            this.state.access_key_id = undefined;
            this.state.access_keys_created = undefined;
        } catch (error) {
            cli.output(`Failed to delete access keys for IAM User ${userName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private deleteAllAccessKeys(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            // List all access keys for the user
            const response = this.makeAWSRequest("POST", IAM_ACTIONS.LIST_ACCESS_KEYS, {
                UserName: userName
            });
            
            // Check for AccessKeys in the response (standard AWS IAM API structure)
            let accessKeys: Array<Record<string, unknown>> = [];
            
            if (response && response.AccessKeys) {
                // Standard AWS API response format
                accessKeys = response.AccessKeys as Array<Record<string, unknown>>;
            } else if (response && response.AccessKeyMetadata) {
                // Alternative format
                accessKeys = response.AccessKeyMetadata as Array<Record<string, unknown>>;
            } else if (response && response.ListAccessKeysResult) {
                // Nested response format
                if (response.ListAccessKeysResult.AccessKeys) {
                    accessKeys = response.ListAccessKeysResult.AccessKeys as Array<Record<string, unknown>>;
                } else if (response.ListAccessKeysResult.AccessKeyMetadata) {
                    accessKeys = response.ListAccessKeysResult.AccessKeyMetadata as Array<Record<string, unknown>>;
                }
            }
            
            if (accessKeys.length > 0) {
                for (const keyData of accessKeys) {
                    const accessKeyId = keyData.AccessKeyId as string;
                    if (accessKeyId) {
                        try {
                            this.makeAWSRequest("POST", IAM_ACTIONS.DELETE_ACCESS_KEY, {
                                UserName: userName,
                                AccessKeyId: accessKeyId
                            });
                        } catch (keyError) {
                            const keyErrorMsg = keyError instanceof Error ? keyError.message : 'Unknown error';
                            cli.output(`Warning: Failed to delete access key ${accessKeyId}: ${keyErrorMsg}`);
                            // Continue with other keys
                        }
                    }
                }
            }
            
            // Remove credentials from secrets if we have them
            if (this.state.access_key_id) {
                this.removeCredentialsFromSecrets();
            }
            
            // Clear state regardless
            this.state.access_key_id = undefined;
            this.state.access_keys_created = undefined;
            
        } catch (error) {
            // If listing fails, try to delete the one we know about from state
            if (this.state.access_key_id) {
                try {
                    this.makeAWSRequest("POST", IAM_ACTIONS.DELETE_ACCESS_KEY, {
                        UserName: userName,
                        AccessKeyId: this.state.access_key_id
                    });
                    this.removeCredentialsFromSecrets();
                } catch (knownKeyError) {
                    const knownKeyErrorMsg = knownKeyError instanceof Error ? knownKeyError.message : 'Unknown error';
                    // Re-throw this error since we couldn't clean up properly
                    throw new Error(`Failed to delete access keys: ${knownKeyErrorMsg}`);
                }
            }
            
            // Clear state to avoid further conflicts
            this.state.access_key_id = undefined;
            this.state.access_keys_created = undefined;
        }
    }
    
    private storeCredentialsInSecrets(accessKeyId: string, secretAccessKey: string): void {
        const accessKeyIdRef = this.getAccessKeyIdSecretRef();
        const secretAccessKeyRef = this.getSecretAccessKeySecretRef();
        
        try {
            secret.set(accessKeyIdRef, accessKeyId);
            secret.set(secretAccessKeyRef, secretAccessKey);
        } catch (error) {
            throw new Error(`Failed to store credentials in secrets: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private removeCredentialsFromSecrets(): void {
        const accessKeyIdRef = this.getAccessKeyIdSecretRef();
        const secretAccessKeyRef = this.getSecretAccessKeySecretRef();
        
        try {
            // Clear the secrets by setting empty values
            secret.set(accessKeyIdRef, "");
            secret.set(secretAccessKeyRef, "");
            cli.output(`Cleared secrets: ${accessKeyIdRef}, ${secretAccessKeyRef}`);
        } catch (error) {
            // Ignore errors when clearing secrets
            cli.output(`Note: Could not clear secrets (may not exist): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private getAccessKeyIdSecretRef(): string {
        return this.definition.access_key_id_secret_ref || 
               `${this.definition.user_name}-access-key-id`;
    }
    
    private getSecretAccessKeySecretRef(): string {
        return this.definition.secret_access_key_secret_ref || 
               `${this.definition.user_name}-secret-access-key`;
    }
    
    // Override makeAWSRequest to handle user-specific XML parsing
    
    protected makeAWSRequest(method: string, action: string, body: Record<string, unknown> = {}): any {
        const response = super.makeAWSRequest(method, action, body);
        
        // If we get a raw response with XML body, try parsing user-specific responses
        if (response.rawBody && typeof response.rawBody === 'string') {
            return this.parseUserXMLResponse(response.rawBody);
        }
        
        return response;
    }
    
    private parseUserXMLResponse(xmlBody: string): any {
        // Handle user-specific responses
        if (xmlBody.indexOf('<CreateUserResponse') !== -1) {
            return this.parseCreateUserResponse(xmlBody);
        } else if (xmlBody.indexOf('<GetUserResponse') !== -1) {
            return this.parseGetUserResponse(xmlBody);
        } else if (xmlBody.indexOf('<CreateAccessKeyResponse') !== -1) {
            return this.parseCreateAccessKeyResponse(xmlBody);
        } else if (xmlBody.indexOf('<ListAccessKeysResponse') !== -1) {
            return this.parseListAccessKeysResponse(xmlBody);
        } else if (xmlBody.indexOf('<ListAttachedUserPoliciesResponse') !== -1) {
            return this.parseListAttachedUserPoliciesResponse(xmlBody);
        }
        
        // Fallback: return raw body for debugging
        return { rawBody: xmlBody };
    }
    
    private parseCreateUserResponse(xmlBody: string): any {
        // Look for the User element within CreateUserResult
        let userMatch = xmlBody.match(/<User>(.*?)<\/User>/s);
        
        // If not found, try looking within CreateUserResult
        if (!userMatch) {
            const resultMatch = xmlBody.match(/<CreateUserResult>(.*?)<\/CreateUserResult>/s);
            if (resultMatch) {
                userMatch = resultMatch[1].match(/<User>(.*?)<\/User>/s);
            }
        }
        
        if (!userMatch) {
            return {};
        }

        const userContent = userMatch[1];
        return {
            User: {
                UserName: this.extractUserXMLValue(userContent, 'UserName'),
                UserId: this.extractUserXMLValue(userContent, 'UserId'),
                Arn: this.extractUserXMLValue(userContent, 'Arn'),
                Path: this.extractUserXMLValue(userContent, 'Path') || '/',
                CreateDate: this.extractUserXMLValue(userContent, 'CreateDate'),
                PermissionsBoundary: this.extractUserXMLValue(userContent, 'PermissionsBoundary'),
            }
        };
    }
    
    private parseGetUserResponse(xmlBody: string): any {
        // Look for the User element within GetUserResult
        let userMatch = xmlBody.match(/<User>(.*?)<\/User>/s);
        
        // If not found, try looking within GetUserResult
        if (!userMatch) {
            const resultMatch = xmlBody.match(/<GetUserResult>(.*?)<\/GetUserResult>/s);
            if (resultMatch) {
                userMatch = resultMatch[1].match(/<User>(.*?)<\/User>/s);
            }
        }
        
        if (!userMatch) {
            return {};
        }

        const userContent = userMatch[1];
        return {
            User: {
                UserName: this.extractUserXMLValue(userContent, 'UserName'),
                UserId: this.extractUserXMLValue(userContent, 'UserId'),
                Arn: this.extractUserXMLValue(userContent, 'Arn'),
                Path: this.extractUserXMLValue(userContent, 'Path') || '/',
                CreateDate: this.extractUserXMLValue(userContent, 'CreateDate'),
                PermissionsBoundary: this.extractUserXMLValue(userContent, 'PermissionsBoundary'),
            }
        };
    }
    
    private parseCreateAccessKeyResponse(xmlBody: string): any {
        // Look for the AccessKey element within CreateAccessKeyResult
        let accessKeyMatch = xmlBody.match(/<AccessKey>(.*?)<\/AccessKey>/s);
        
        // If not found, try looking within CreateAccessKeyResult
        if (!accessKeyMatch) {
            const resultMatch = xmlBody.match(/<CreateAccessKeyResult>(.*?)<\/CreateAccessKeyResult>/s);
            if (resultMatch) {
                accessKeyMatch = resultMatch[1].match(/<AccessKey>(.*?)<\/AccessKey>/s);
            }
        }
        
        if (!accessKeyMatch) {
            return {};
        }

        const accessKeyContent = accessKeyMatch[1];
        return {
            AccessKey: {
                UserName: this.extractUserXMLValue(accessKeyContent, 'UserName'),
                AccessKeyId: this.extractUserXMLValue(accessKeyContent, 'AccessKeyId'),
                SecretAccessKey: this.extractUserXMLValue(accessKeyContent, 'SecretAccessKey'),
                Status: this.extractUserXMLValue(accessKeyContent, 'Status') || 'Active',
                CreateDate: this.extractUserXMLValue(accessKeyContent, 'CreateDate'),
            }
        };
    }
    
    private parseListAccessKeysResponse(xmlBody: string): any {
        const resultMatch = xmlBody.match(/<ListAccessKeysResult>(.*?)<\/ListAccessKeysResult>/s);
        if (!resultMatch) {
            return { AccessKeys: [] };
        }

        const accessKeys: any[] = [];
        const memberMatches = resultMatch[1].match(/<member>(.*?)<\/member>/gs);
        
        if (memberMatches) {
            for (const memberMatch of memberMatches) {
                const accessKey = {
                    UserName: this.extractUserXMLValue(memberMatch, 'UserName'),
                    AccessKeyId: this.extractUserXMLValue(memberMatch, 'AccessKeyId'),
                    Status: this.extractUserXMLValue(memberMatch, 'Status') || 'Active',
                    CreateDate: this.extractUserXMLValue(memberMatch, 'CreateDate'),
                };
                accessKeys.push(accessKey);
            }
        }

        return { AccessKeys: accessKeys };
    }
    
    private parseListAttachedUserPoliciesResponse(xmlBody: string): any {
        const resultMatch = xmlBody.match(/<ListAttachedUserPoliciesResult>(.*?)<\/ListAttachedUserPoliciesResult>/s);
        if (!resultMatch) {
            return { AttachedPolicies: [] };
        }

        const attachedPolicies: any[] = [];
        const memberMatches = resultMatch[1].match(/<member>(.*?)<\/member>/gs);
        
        if (memberMatches) {
            for (const memberMatch of memberMatches) {
                const policy = {
                    PolicyName: this.extractUserXMLValue(memberMatch, 'PolicyName'),
                    PolicyArn: this.extractUserXMLValue(memberMatch, 'PolicyArn'),
                };
                attachedPolicies.push(policy);
            }
        }

        return { AttachedPolicies: attachedPolicies };
    }
    
    private extractUserXMLValue(xmlContent: string, tagName: string): string {
        const match = xmlContent.match(new RegExp(`<${tagName}>(.*?)<\/${tagName}>`, 's'));
        return match ? match[1].trim() : '';
    }
    
    // Custom Actions
    
    @action("get-user-info")
    getUserInfo(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            if (!this.state.user_arn) {
                cli.output(`IAM User ${userName} not found in entity state`);
                throw new Error(`IAM User ${userName} not found`);
            }
            
            const response = this.checkUserExists(userName);
            if (!response?.User) {
                cli.output(`IAM User ${userName} not found in AWS`);
                throw new Error(`IAM User ${userName} not found`);
            }
            
            const user = (response as Record<string, unknown>).User as Record<string, unknown>;
            
            cli.output("=== IAM User Information ===");
            cli.output(`User Name: ${user.UserName}`);
            cli.output(`User ID: ${user.UserId}`);
            cli.output(`ARN: ${user.Arn}`);
            cli.output(`Path: ${user.Path}`);
            cli.output(`Create Date: ${user.CreateDate}`);
            const permissionsBoundary = user.PermissionsBoundary as Record<string, unknown>;
            if (permissionsBoundary) {
                cli.output(`Permissions Boundary: ${permissionsBoundary.PermissionsBoundaryArn}`);
            }
            
            // Show access key status
            if (this.state.access_key_id) {
                cli.output(`Access Key ID: ${this.state.access_key_id}`);
                cli.output(`Access Key Secret Reference: ${this.getAccessKeyIdSecretRef()}`);
                cli.output(`Secret Access Key Reference: ${this.getSecretAccessKeySecretRef()}`);
            } else {
                cli.output("No access keys created");
            }
            
            // Show attached policies
            if (this.state.attached_policies && this.state.attached_policies.length > 0) {
                cli.output("\nAttached Policies:");
                for (const policyArn of this.state.attached_policies) {
                    cli.output(`  - ${policyArn}`);
                }
            }
            
        } catch (error) {
            const errorMsg = `Failed to get user information: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    @action("list-access-keys")
    listAccessKeys(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            const response = this.makeAWSRequest("POST", IAM_ACTIONS.LIST_ACCESS_KEYS, {
                UserName: userName
            });
            
            cli.output("=== Access Keys ===");
            if (response?.AccessKeyMetadata && response.AccessKeyMetadata.length > 0) {
                for (const keyMetadata of response.AccessKeyMetadata) {
                    cli.output(`Access Key ID: ${keyMetadata.AccessKeyId}`);
                    cli.output(`Status: ${keyMetadata.Status}`);
                    cli.output(`Create Date: ${keyMetadata.CreateDate}`);
                    cli.output("---");
                }
            } else {
                cli.output("No access keys found");
            }
            
        } catch (error) {
            const errorMsg = `Failed to list access keys: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    @action("get-credentials")
    getCredentials(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            if (!this.state.access_key_id) {
                cli.output(`No access keys created for user ${userName}`);
                return;
            }
            
            cli.output("=== AWS Credentials ===");
            cli.output(`Access Key ID Secret: ${this.getAccessKeyIdSecretRef()}`);
            cli.output(`Secret Access Key Secret: ${this.getSecretAccessKeySecretRef()}`);
            cli.output("\nTo use these credentials:");
            cli.output(`export AWS_ACCESS_KEY_ID=$(monk get secret ${this.getAccessKeyIdSecretRef()})`);
            cli.output(`export AWS_SECRET_ACCESS_KEY=$(monk get secret ${this.getSecretAccessKeySecretRef()})`);
            cli.output(`export AWS_REGION=${this.region}`);
            
        } catch (error) {
            const errorMsg = `Failed to get credentials: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    @action("create-access-keys")
    createAccessKeysAction(): void {
        try {
            if (this.state.access_key_id && this.state.access_keys_created) {
                cli.output("Access keys already exist for this user");
                return;
            }
            
            // Temporarily enable access key creation for this action
            const originalValue = this.definition.create_access_keys;
            (this.definition as Record<string, unknown>).create_access_keys = true;
            
            this.createAccessKeysIfRequested();
            
            // Restore original value
            (this.definition as Record<string, unknown>).create_access_keys = originalValue;
            
        } catch (error) {
            const errorMsg = `Failed to create access keys: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
    
    @action("regenerate-access-keys") 
    regenerateAccessKeys(): void {
        const userName = formatIAMResourceName(this.definition.user_name);
        
        try {
            // Delete existing keys
            if (this.state.access_key_id) {
                this.deleteAccessKeys();
                cli.output("Deleted existing access keys");
            }
            
            // Create new keys
            const originalValue = this.definition.create_access_keys;
            (this.definition as Record<string, unknown>).create_access_keys = true;
            
            this.createAccessKeysIfRequested();
            
            // Restore original value
            (this.definition as Record<string, unknown>).create_access_keys = originalValue;
            
            cli.output(`Successfully regenerated access keys for user ${userName}`);
            
        } catch (error) {
            const errorMsg = `Failed to regenerate access keys: ${error instanceof Error ? error.message : 'Unknown error'}`;
            cli.output(errorMsg);
            throw new Error(errorMsg);
        }
    }
}
