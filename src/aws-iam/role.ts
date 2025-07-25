import { AWSIAMEntity, AWSIAMDefinition, AWSIAMState } from "./base.ts";
import cli from "cli";

// IAM Role specific interfaces
export interface IAMRoleDefinition extends AWSIAMDefinition {
    role_name: string;
    assume_role_policy_document: any; // JSON object representing the trust policy
    path?: string;
    role_description?: string;
    max_session_duration?: number; // Session duration in seconds (3600-43200)
    tags?: Record<string, string>;
    attached_policies?: string[]; // Array of policy ARNs to attach to the role
}

export interface IAMRoleState extends AWSIAMState {
    role_arn?: string;
    role_id?: string;
    create_date?: string;
    existing?: boolean;
}

export class IAMRole extends AWSIAMEntity<IAMRoleDefinition, IAMRoleState> {
    
    // Customize readiness check parameters
    static readonly readiness = { period: 5, initialDelay: 1, attempts: 10 };
    
    protected getPolicyName(): string {
        // This method is inherited from base class but not applicable for roles
        // Return role name as a fallback
        return this.definition.role_name;
    }
    
    protected getRoleName(): string {
        return this.definition.role_name;
    }

    private customJSONStringify(obj: any): string {
        // Custom JSON stringifier to handle Goja runtime indexed arrays (! notation) and convert to proper JSON
        if (obj === null) return "null";
        if (typeof obj === "undefined") return "undefined";
        if (typeof obj === "string") return '"' + obj.replace(/"/g, '\\"') + '"';
        if (typeof obj === "number" || typeof obj === "boolean") return String(obj);
        
        if (Array.isArray(obj)) {
            const items = obj.map(item => this.customJSONStringify(item));
            return "[" + items.join(",") + "]";
        }
        
        if (typeof obj === "object") {
            // Convert indexed object notation back to proper arrays
            const normalized = this.normalizeIndexedObject(obj);
            const keys = Object.keys(normalized);
            const items = keys.map(key => '"' + key + '":' + this.customJSONStringify(normalized[key]));
            return "{" + items.join(",") + "}";
        }
        
        return String(obj);
    }

    private normalizeIndexedObject(obj: any): any {
        const result: any = {};
        const arrayGroups: any = {};
        
        for (const [key, value] of Object.entries(obj)) {
            // Check if this is an indexed array notation (e.g., "Statement!0", "Action!1")
            const match = key.match(/^(.+)!(\d+)$/);
            if (match) {
                const baseKey = match[1];
                const index = parseInt(match[2]);
                
                if (!arrayGroups[baseKey]) {
                    arrayGroups[baseKey] = [];
                }
                arrayGroups[baseKey][index] = value;
            } else {
                result[key] = value;
            }
        }
        
        // Add converted arrays to result
        for (const [baseKey, array] of Object.entries(arrayGroups)) {
            result[baseKey] = (array as any[]).filter(item => item !== undefined);
        }
        
        return result;
    }

    override create(): void {
        cli.output(`Creating IAM Role: ${this.definition.role_name}`);
        
        // Check if role already exists
        const existing = this.checkRoleExists(this.definition.role_name);
        
        if (existing?.Role) {
            cli.output(`IAM Role ${this.definition.role_name} already exists, importing`);
            this.state = {
                role_arn: existing.Role.Arn,
                role_id: existing.Role.RoleId,
                create_date: existing.Role.CreateDate,
                existing: true
            };
            
            // Manage policy attachments for existing role
            this.managePolicyAttachments();
            return;
        }

        // Create new role - use custom JSON serialization to avoid Goja runtime issues
        const assumeRolePolicyDocument = typeof this.definition.assume_role_policy_document === 'string' 
            ? this.definition.assume_role_policy_document 
            : this.customJSONStringify(this.definition.assume_role_policy_document);
        
        cli.output(`DEBUG - Assume Role Policy Document JSON: ${assumeRolePolicyDocument}`);

        const params: any = {
            RoleName: this.definition.role_name,
            AssumeRolePolicyDocument: assumeRolePolicyDocument,
        };

        if (this.definition.path) {
            params.Path = this.definition.path;
        }

        if (this.definition.role_description) {
            params.Description = this.definition.role_description;
        }

        if (this.definition.max_session_duration) {
            params.MaxSessionDuration = this.definition.max_session_duration;
        }

        // Add tags if specified
        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            let tagIndex = 1;
            for (const [key, value] of Object.entries(this.definition.tags)) {
                params[`Tags.member.${tagIndex}.Key`] = key;
                params[`Tags.member.${tagIndex}.Value`] = value;
                tagIndex++;
            }
        }

        try {
            const response = this.makeAWSRequest("POST", "CreateRole", params);
            
            if (response.Role) {
                this.state = {
                    role_arn: response.Role.Arn,
                    role_id: response.Role.RoleId,
                    create_date: response.Role.CreateDate
                };

                cli.output(`Successfully created IAM Role: ${this.definition.role_name}`);
                cli.output(`Role ARN: ${this.state.role_arn}`);
                
                // Attach policies to the newly created role
                this.managePolicyAttachments();
            } else {
                throw new Error("No role information in CreateRole response");
            }
        } catch (error) {
            throw new Error(`Failed to create IAM Role ${this.definition.role_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.role_arn) {
            throw new Error("Role ARN not available. Role may not exist.");
        }

        cli.output(`Updating IAM Role: ${this.definition.role_name}`);

        // Update assume role policy document if needed
        const assumeRolePolicyDocument = typeof this.definition.assume_role_policy_document === 'string' 
            ? this.definition.assume_role_policy_document 
            : this.customJSONStringify(this.definition.assume_role_policy_document);

        try {
            // Update assume role policy
            this.makeAWSRequest("POST", "UpdateAssumeRolePolicy", {
                RoleName: this.definition.role_name,
                PolicyDocument: assumeRolePolicyDocument
            });

            // Update role description if specified
            if (this.definition.role_description !== undefined) {
                this.makeAWSRequest("POST", "UpdateRole", {
                    RoleName: this.definition.role_name,
                    Description: this.definition.role_description,
                    MaxSessionDuration: this.definition.max_session_duration || 3600
                });
            }

            // Update policy attachments
            this.updatePolicyAttachments();

            cli.output(`Successfully updated IAM Role: ${this.definition.role_name}`);
        } catch (error) {
            throw new Error(`Failed to update IAM Role ${this.definition.role_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        if (!this.state.role_arn) {
            cli.output("Role ARN not available. Role may not exist.");
            return;
        }

        cli.output(`Deleting IAM Role: ${this.definition.role_name}`);

        try {
            // First, detach all managed policies
            const attachedPolicies = this.getAttachedPolicies();
            cli.output(`Found ${attachedPolicies.length} attached managed policies`);
            for (const policyArn of attachedPolicies) {
                this.detachPolicyFromRoleStrict(policyArn);
            }
            
            // Then, delete all inline policies
            const inlinePolicies = this.getInlinePolicies();
            cli.output(`Found ${inlinePolicies.length} inline policies`);
            for (const policyName of inlinePolicies) {
                this.deleteInlinePolicyStrict(policyName);
            }
            
            // Wait a moment for AWS to process the policy changes
            cli.output("Waiting for policy detachment to complete...");
            
            // Delete the role
            this.makeAWSRequest("POST", "DeleteRole", {
                RoleName: this.definition.role_name
            });

            cli.output(`Successfully deleted IAM Role: ${this.definition.role_name}`);
        } catch (error) {
            throw new Error(`Failed to delete IAM Role ${this.definition.role_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private checkRoleExists(roleName: string): any {
        try {
            cli.output(`DEBUG: Checking if role exists: ${roleName}`);
            const result = this.makeAWSRequest("POST", "GetRole", {
                RoleName: roleName
            });
            
            cli.output(`DEBUG: checkRoleExists result: ${JSON.stringify(result, null, 2)}`);
            return result;
        } catch (error) {
            cli.output(`DEBUG: Role doesn't exist or error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    private attachPolicyToRole(policyArn: string): void {
        try {
            cli.output(`Attaching policy ${policyArn} to role ${this.definition.role_name}`);
            this.makeAWSRequest("POST", "AttachRolePolicy", {
                RoleName: this.definition.role_name,
                PolicyArn: policyArn
            });
            cli.output(`Successfully attached policy ${policyArn}`);
        } catch (error) {
            throw new Error(`Failed to attach policy ${policyArn} to role ${this.definition.role_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private detachPolicyFromRole(policyArn: string): void {
        try {
            cli.output(`Detaching policy ${policyArn} from role ${this.definition.role_name}`);
            this.makeAWSRequest("POST", "DetachRolePolicy", {
                RoleName: this.definition.role_name,
                PolicyArn: policyArn
            });
            cli.output(`Successfully detached policy ${policyArn}`);
        } catch (error) {
            // Log error but don't throw - policy might already be detached
            cli.output(`Warning: Failed to detach policy ${policyArn}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private detachPolicyFromRoleStrict(policyArn: string): void {
        try {
            cli.output(`Detaching policy ${policyArn} from role ${this.definition.role_name}`);
            this.makeAWSRequest("POST", "DetachRolePolicy", {
                RoleName: this.definition.role_name,
                PolicyArn: policyArn
            });
            cli.output(`Successfully detached policy ${policyArn}`);
        } catch (error) {
            throw new Error(`Failed to detach policy ${policyArn} from role ${this.definition.role_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private getAttachedPolicies(): string[] {
        try {
            const result = this.makeAWSRequest("POST", "ListAttachedRolePolicies", {
                RoleName: this.definition.role_name
            });
            
            if (result.AttachedPolicies) {
                return result.AttachedPolicies.map((policy: any) => policy.PolicyArn);
            }
            return [];
        } catch (error) {
            cli.output(`Warning: Failed to list attached policies: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }

    private getInlinePolicies(): string[] {
        try {
            const result = this.makeAWSRequest("POST", "ListRolePolicies", {
                RoleName: this.definition.role_name
            });
            
            if (result.PolicyNames) {
                return result.PolicyNames;
            }
            return [];
        } catch (error) {
            cli.output(`Warning: Failed to list inline policies: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return [];
        }
    }

    private deleteInlinePolicyStrict(policyName: string): void {
        try {
            cli.output(`Deleting inline policy ${policyName} from role ${this.definition.role_name}`);
            this.makeAWSRequest("POST", "DeleteRolePolicy", {
                RoleName: this.definition.role_name,
                PolicyName: policyName
            });
            cli.output(`Successfully deleted inline policy ${policyName}`);
        } catch (error) {
            throw new Error(`Failed to delete inline policy ${policyName} from role ${this.definition.role_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private managePolicyAttachments(): void {
        if (!this.definition.attached_policies || this.definition.attached_policies.length === 0) {
            return;
        }

        cli.output(`Managing policy attachments for role ${this.definition.role_name}`);
        
        // Attach each specified policy
        for (const policyArn of this.definition.attached_policies) {
            this.attachPolicyToRole(policyArn);
        }
    }

    private updatePolicyAttachments(): void {
        const currentPolicies = this.getAttachedPolicies();
        const desiredPolicies = this.definition.attached_policies || [];

        // Detach policies that are no longer needed
        for (const currentPolicy of currentPolicies) {
            if (!desiredPolicies.includes(currentPolicy)) {
                this.detachPolicyFromRole(currentPolicy);
            }
        }

        // Attach new policies
        for (const desiredPolicy of desiredPolicies) {
            if (!currentPolicies.includes(desiredPolicy)) {
                this.attachPolicyToRole(desiredPolicy);
            }
        }
    }
} 