import { AWSIAMEntity, AWSIAMDefinition, AWSIAMState } from "./base.ts";
import cli from "cli";

// IAM Policy specific interfaces
export interface IAMPolicyDefinition extends AWSIAMDefinition {
    /** @description IAM policy name */
    policy_name: string;
    /** @description Policy document (JSON object or string) */
    policy_document: any; // JSON object representing the policy
    /** @description Optional path for the policy (defaults to "/") */
    path?: string;
    /** @description Human-readable description for the policy */
    policy_description?: string;
    /** @description Resource tags for the policy */
    tags?: Record<string, string>;
}

export interface IAMPolicyState extends AWSIAMState {
    /** @description Policy ARN */
    policy_arn?: string;
    /** @description Policy ID */
    policy_id?: string;
    /** @description Default version identifier */
    default_version_id?: string;
    /** @description Number of attachments to principals */
    attachment_count?: number;
    /** @description Creation timestamp */
    create_date?: string;
    /** @description Last update timestamp */
    update_date?: string;
}

export class IAMPolicy extends AWSIAMEntity<IAMPolicyDefinition, IAMPolicyState> {
    
    // Customize readiness check parameters - IAM policies can take longer to propagate
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 18 };
    
    protected getPolicyName(): string {
        return this.definition.policy_name;
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
            const pairs = keys.map(key => '"' + key + '":' + this.customJSONStringify(normalized[key]));
            return "{" + pairs.join(",") + "}";
        }
        
        return String(obj);
    }

    private normalizeIndexedObject(obj: any): any {
        // Convert indexed notation (key!0, key!1) back to arrays
        const result: any = {};
        const arrayGroups: { [key: string]: any[] } = {};
        
        for (const key of Object.keys(obj)) {
            if (key.includes('!')) {
                const [baseKey, indexStr] = key.split('!');
                const index = parseInt(indexStr, 10);
                
                if (!arrayGroups[baseKey]) {
                    arrayGroups[baseKey] = [];
                }
                arrayGroups[baseKey][index] = obj[key];
            } else {
                result[key] = obj[key];
            }
        }
        
        // Add converted arrays to result
        for (const [baseKey, array] of Object.entries(arrayGroups)) {
            result[baseKey] = array.filter(item => item !== undefined);
        }
        
        return result;
    }

    override create(): void {        
        // Check if policy already exists
        const existing = this.checkPolicyExists(this.definition.policy_name);
        
        if (existing?.Policy) {
            this.state = {
                policy_arn: existing.Policy.Arn,
                policy_id: existing.Policy.PolicyId,
                default_version_id: existing.Policy.DefaultVersionId,
                attachment_count: existing.Policy.AttachmentCount,
                create_date: existing.Policy.CreateDate,
                update_date: existing.Policy.UpdateDate,
                existing: true
            };
            return;
        }

        // Create new policy - use custom JSON serialization to avoid Goja runtime issues
        const policyDocument = typeof this.definition.policy_document === 'string' 
            ? this.definition.policy_document 
            : this.customJSONStringify(this.definition.policy_document);

        const params: any = {
            PolicyName: this.definition.policy_name,
            PolicyDocument: policyDocument,
        };

        if (this.definition.path) {
            params.Path = this.definition.path;
        }

        if (this.definition.policy_description) {
            params.Description = this.definition.policy_description;
        }

        // Add tags if provided
        if (this.definition.tags) {
            let tagIndex = 1;
            for (const [key, value] of Object.entries(this.definition.tags)) {
                params[`Tags.member.${tagIndex}.Key`] = key;
                params[`Tags.member.${tagIndex}.Value`] = value;
                tagIndex++;
            }
        }
        
        try {
            const response = this.makeAWSRequest("POST", "CreatePolicy", params);
            
            if (response.Policy) {
                this.state = {
                    policy_arn: response.Policy.Arn,
                    policy_id: response.Policy.PolicyId,
                    default_version_id: response.Policy.DefaultVersionId,
                    create_date: response.Policy.CreateDate,
                    update_date: response.Policy.UpdateDate,
                };
            } else {
                throw new Error("No policy information in CreatePolicy response");
            }
        } catch (error) {
            throw new Error(`Failed to create IAM Policy ${this.definition.policy_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.policy_arn) {
            this.create();
            return;
        }

        // IAM policies are updated by creating a new version and setting it as default
        const policyDocument = typeof this.definition.policy_document === 'string' 
            ? this.definition.policy_document 
            : this.customJSONStringify(this.definition.policy_document);

        const params = {
            PolicyArn: this.state.policy_arn,
            PolicyDocument: policyDocument,
            SetAsDefault: true
        };

        try {
            const response = this.makeAWSRequest("POST", "CreatePolicyVersion", params);
            
            if (response.PolicyVersion) {
                this.state.default_version_id = response.PolicyVersion.VersionId;
                this.state.update_date = response.PolicyVersion.CreateDate;
            } else {
                throw new Error("Unexpected response format from CreatePolicyVersion");
            }
        } catch (error) {
            throw new Error(`Failed to update IAM Policy ${this.definition.policy_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        if (!this.state.policy_arn) {
            return;
        }
        
        try {
            // First check if policy has attachments
            if (this.state.attachment_count && this.state.attachment_count > 0) {
                cli.output(`Warning: Policy has ${this.state.attachment_count} attachments. You may need to detach it first.`);
            }

            // Delete all non-default versions first
            this.deleteNonDefaultVersions();
            
            // Now delete the policy
            this.deletePolicy(this.state.policy_arn, this.definition.policy_name);
        } catch (error) {
            throw new Error(`Failed to delete IAM Policy ${this.definition.policy_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private deleteNonDefaultVersions(): void {
        try {
            // Get all policy versions
            const response = this.makeAWSRequest("POST", "ListPolicyVersions", {
                PolicyArn: this.state.policy_arn
            });

            if (response.Versions) {
                const nonDefaultVersions = response.Versions.filter((v: any) => !v.IsDefaultVersion);
                
                for (const version of nonDefaultVersions) {
                    try {
                        this.makeAWSRequest("POST", "DeletePolicyVersion", {
                            PolicyArn: this.state.policy_arn,
                            VersionId: version.VersionId
                        });
                    } catch (error) {
                        // Continue with other versions if one fails
                    }
                }
            }
        } catch (error) {
            // Log warning but don't fail the operation
        }
    }
} 