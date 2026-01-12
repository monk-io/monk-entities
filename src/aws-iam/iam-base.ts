import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

export interface AWSIAMDefinition {
    /** @description AWS region for IAM operations (signing region) */
    region: string;
}

export interface AWSIAMState {
    /** @description Indicates if the resource pre-existed before this entity managed it */
    existing?: boolean;
}

// AWS IAM API response interfaces
interface IAMPolicyResponse {
    Policy?: {
        PolicyName?: string;
        PolicyId?: string;
        Arn?: string;
        Path?: string;
        DefaultVersionId?: string;
        AttachmentCount?: number;
        PermissionsBoundaryUsageCount?: number;
        IsAttachable?: boolean;
        Description?: string;
        CreateDate?: string;
        UpdateDate?: string;
        PolicyVersionList?: Array<{
            Document?: string;
            VersionId?: string;
            IsDefaultVersion?: boolean;
            CreateDate?: string;
        }>;
        Tags?: Array<{
            Key: string;
            Value: string;
        }>;
    };
}

interface IAMPolicyVersionResponse {
    PolicyVersion?: {
        Document?: string;
        VersionId?: string;
        IsDefaultVersion?: boolean;
        CreateDate?: string;
    };
}

interface IAMListPoliciesResponse {
    Policies?: Array<{
        PolicyName?: string;
        PolicyId?: string;
        Arn?: string;
        Path?: string;
        DefaultVersionId?: string;
        AttachmentCount?: number;
        PermissionsBoundaryUsageCount?: number;
        IsAttachable?: boolean;
        Description?: string;
        CreateDate?: string;
        UpdateDate?: string;
    }>;
    IsTruncated?: boolean;
    Marker?: string;
}

interface IAMErrorResponse {
    Error?: {
        Code?: string;
        Message?: string;
        Type?: string;
    };
    RequestId?: string;
}

export abstract class AWSIAMEntity<
    D extends AWSIAMDefinition,
    S extends AWSIAMState
> extends MonkEntity<D, S> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    protected abstract getPolicyName(): string;

    protected makeAWSRequest(method: string, action: string, body?: any): any {
        const url = "https://iam.amazonaws.com/";
        
        // IAM uses query parameters for actions
        const options: any = {
            service: "iam",
            region: this.region,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            timeout: 30000,
        };

        // Build form data for IAM API
        let formData = "Action=" + encodeURIComponent(action) + "&Version=2010-05-08";
        
        if (body) {
            for (const [key, value] of Object.entries(body)) {
                if (value !== undefined && value !== null) {
                    if (typeof value === 'object') {
                        formData += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(JSON.stringify(value));
                    } else {
                        formData += "&" + encodeURIComponent(key) + "=" + encodeURIComponent(String(value));
                    }
                }
            }
        }

        options.body = formData;

        try {
            let response: any;
            
            // Use specific HTTP methods
            if (method === "GET") {
                response = aws.get(url, options);
            } else if (method === "POST") {
                response = aws.post(url, options);
            } else if (method === "PUT") {
                response = aws.put(url, options);
            } else if (method === "DELETE") {
                response = aws.delete(url, options);
            } else {
                throw new Error("Unsupported HTTP method: " + method);
            }
            
            if (response.statusCode >= 400) {
                let errorMessage = "AWS IAM API error: " + response.statusCode + " " + response.status;
                
                try {
                    // IAM returns XML error responses
                    const errorBody = this.parseXMLError(response.body);
                    if (errorBody.Error?.Message) {
                        errorMessage += ` - ${errorBody.Error.Message}`;
                    }
                    if (errorBody.Error?.Code) {
                        errorMessage += ` - Code: ${errorBody.Error.Code}`;
                    }
                } catch (parseError) {
                    errorMessage += ` - Raw: ${response.body}`;
                }
                throw new Error(errorMessage);
            }

            // Parse response body if present
            if (response.body) {
                try {
                    return this.parseXMLResponse(response.body);
                } catch (error) {
                    throw new Error(`Failed to parse AWS IAM API response: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            return response;
        } catch (error) {
            throw new Error(`AWS IAM API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private parseXMLError(xmlBody: string): IAMErrorResponse {
        // Simple XML parsing for IAM error responses
        const errorMatch = xmlBody.match(/<Error>(.*?)<\/Error>/s);
        if (!errorMatch) {
            return {};
        }

        const errorContent = errorMatch[1];
        const codeMatch = errorContent.match(/<Code>(.*?)<\/Code>/);
        const messageMatch = errorContent.match(/<Message>(.*?)<\/Message>/);
        const typeMatch = errorContent.match(/<Type>(.*?)<\/Type>/);

        return {
            Error: {
                Code: codeMatch ? codeMatch[1] : undefined,
                Message: messageMatch ? messageMatch[1] : undefined,
                Type: typeMatch ? typeMatch[1] : undefined,
            }
        };
    }

    private parseXMLResponse(xmlBody: string): any {
        // For now, we'll handle the most common IAM policy responses
        // Use indexOf to handle xmlns attributes in XML elements
        if (xmlBody.indexOf('<CreatePolicyResponse') !== -1) {
            return this.parseCreatePolicyResponse(xmlBody);
        } else if (xmlBody.indexOf('<CreatePolicyVersionResponse') !== -1) {
            return this.parseCreatePolicyVersionResponse(xmlBody);
        } else if (xmlBody.indexOf('<GetPolicyResponse') !== -1) {
            return this.parseGetPolicyResponse(xmlBody);
        } else if (xmlBody.indexOf('<CreateRoleResponse') !== -1) {
            return this.parseCreateRoleResponse(xmlBody);
        } else if (xmlBody.indexOf('<GetRoleResponse') !== -1) {
            return this.parseGetRoleResponse(xmlBody);
        } else if (xmlBody.indexOf('<ListAttachedRolePoliciesResponse') !== -1) {
            return this.parseListAttachedRolePoliciesResponse(xmlBody);
        } else if (xmlBody.indexOf('<ListRolePoliciesResponse') !== -1) {
            return this.parseListRolePoliciesResponse(xmlBody);
        } else if (xmlBody.indexOf('<ListPoliciesResponse') !== -1) {
            return this.parseListPoliciesResponse(xmlBody);
        } else if (xmlBody.indexOf('<GetPolicyVersionResponse') !== -1) {
            return this.parseGetPolicyVersionResponse(xmlBody);
        }
        
        // Fallback: return raw body for debugging
        return { rawBody: xmlBody };
    }

    private parseCreatePolicyResponse(xmlBody: string): IAMPolicyResponse {
        // Try to find the Policy element within CreatePolicyResult
        let policyMatch = xmlBody.match(/<Policy>(.*?)<\/Policy>/s);
        
        // If not found, try looking within CreatePolicyResult
        if (!policyMatch) {
            const resultMatch = xmlBody.match(/<CreatePolicyResult>(.*?)<\/CreatePolicyResult>/s);
            if (resultMatch) {
                policyMatch = resultMatch[1].match(/<Policy>(.*?)<\/Policy>/s);
            }
        }
        
        if (!policyMatch) {
            return {};
        }

        const policyContent = policyMatch[1];
        return {
            Policy: {
                PolicyName: this.extractXMLValue(policyContent, 'PolicyName'),
                PolicyId: this.extractXMLValue(policyContent, 'PolicyId'),
                Arn: this.extractXMLValue(policyContent, 'Arn'),
                Path: this.extractXMLValue(policyContent, 'Path'),
                DefaultVersionId: this.extractXMLValue(policyContent, 'DefaultVersionId'),
                CreateDate: this.extractXMLValue(policyContent, 'CreateDate'),
                UpdateDate: this.extractXMLValue(policyContent, 'UpdateDate'),
            }
        };
    }

    private parseCreatePolicyVersionResponse(xmlBody: string): any {
        // Look for the PolicyVersion element within CreatePolicyVersionResult
        let versionMatch = xmlBody.match(/<PolicyVersion>(.*?)<\/PolicyVersion>/s);
        
        // If not found, try looking within CreatePolicyVersionResult
        if (!versionMatch) {
            const resultMatch = xmlBody.match(/<CreatePolicyVersionResult>(.*?)<\/CreatePolicyVersionResult>/s);
            if (resultMatch) {
                versionMatch = resultMatch[1].match(/<PolicyVersion>(.*?)<\/PolicyVersion>/s);
            }
        }
        
        if (!versionMatch) {
            return {};
        }

        const versionContent = versionMatch[1];
        return {
            PolicyVersion: {
                VersionId: this.extractXMLValue(versionContent, 'VersionId'),
                IsDefaultVersion: this.extractXMLValue(versionContent, 'IsDefaultVersion') === 'true',
                CreateDate: this.extractXMLValue(versionContent, 'CreateDate'),
            }
        };
    }

    private parseCreateRoleResponse(xmlBody: string): any {
        // Look for the Role element within CreateRoleResult
        let roleMatch = xmlBody.match(/<Role>(.*?)<\/Role>/s);
        
        // If not found, try looking within CreateRoleResult
        if (!roleMatch) {
            const resultMatch = xmlBody.match(/<CreateRoleResult>(.*?)<\/CreateRoleResult>/s);
            if (resultMatch) {
                roleMatch = resultMatch[1].match(/<Role>(.*?)<\/Role>/s);
            }
        }
        
        if (!roleMatch) {
            return {};
        }

        const roleContent = roleMatch[1];
        return {
            Role: {
                RoleName: this.extractXMLValue(roleContent, 'RoleName'),
                RoleId: this.extractXMLValue(roleContent, 'RoleId'),
                Arn: this.extractXMLValue(roleContent, 'Arn'),
                Path: this.extractXMLValue(roleContent, 'Path'),
                AssumeRolePolicyDocument: this.extractXMLValue(roleContent, 'AssumeRolePolicyDocument'),
                Description: this.extractXMLValue(roleContent, 'Description'),
                MaxSessionDuration: parseInt(this.extractXMLValue(roleContent, 'MaxSessionDuration') || '3600'),
                CreateDate: this.extractXMLValue(roleContent, 'CreateDate'),
            }
        };
    }

    private parseGetRoleResponse(xmlBody: string): any {
        // Look for the Role element within GetRoleResult
        let roleMatch = xmlBody.match(/<Role>(.*?)<\/Role>/s);
        
        // If not found, try looking within GetRoleResult
        if (!roleMatch) {
            const resultMatch = xmlBody.match(/<GetRoleResult>(.*?)<\/GetRoleResult>/s);
            if (resultMatch) {
                roleMatch = resultMatch[1].match(/<Role>(.*?)<\/Role>/s);
            }
        }
        
        if (!roleMatch) {
            return {};
        }

        const roleContent = roleMatch[1];
        return {
            Role: {
                RoleName: this.extractXMLValue(roleContent, 'RoleName'),
                RoleId: this.extractXMLValue(roleContent, 'RoleId'),
                Arn: this.extractXMLValue(roleContent, 'Arn'),
                Path: this.extractXMLValue(roleContent, 'Path'),
                AssumeRolePolicyDocument: this.extractXMLValue(roleContent, 'AssumeRolePolicyDocument'),
                Description: this.extractXMLValue(roleContent, 'Description'),
                MaxSessionDuration: parseInt(this.extractXMLValue(roleContent, 'MaxSessionDuration') || '3600'),
                CreateDate: this.extractXMLValue(roleContent, 'CreateDate'),
            }
        };
    }

    private parseListAttachedRolePoliciesResponse(xmlBody: string): any {
        // Look for AttachedPolicies within ListAttachedRolePoliciesResult
        const resultMatch = xmlBody.match(/<ListAttachedRolePoliciesResult>(.*?)<\/ListAttachedRolePoliciesResult>/s);
        if (!resultMatch) {
            return { AttachedPolicies: [] };
        }

        const resultContent = resultMatch[1];
        const attachedPolicies: any[] = [];
        
        // Extract all member elements within AttachedPolicies
        const attachedPoliciesMatch = resultContent.match(/<AttachedPolicies>(.*?)<\/AttachedPolicies>/s);
        if (attachedPoliciesMatch) {
            const memberMatches = attachedPoliciesMatch[1].match(/<member>(.*?)<\/member>/gs);
            if (memberMatches) {
                for (const memberMatch of memberMatches) {
                    const memberContent = memberMatch.replace(/<\/?member>/g, '');
                    attachedPolicies.push({
                        PolicyName: this.extractXMLValue(memberContent, 'PolicyName'),
                        PolicyArn: this.extractXMLValue(memberContent, 'PolicyArn')
                    });
                }
            }
        }

        return { AttachedPolicies: attachedPolicies };
    }

    private parseListRolePoliciesResponse(xmlBody: string): any {
        // Look for PolicyNames within ListRolePoliciesResult
        const resultMatch = xmlBody.match(/<ListRolePoliciesResult>(.*?)<\/ListRolePoliciesResult>/s);
        if (!resultMatch) {
            return { PolicyNames: [] };
        }

        const resultContent = resultMatch[1];
        const policyNames: string[] = [];
        
        // Extract all member elements within PolicyNames
        const policyNamesMatch = resultContent.match(/<PolicyNames>(.*?)<\/PolicyNames>/s);
        if (policyNamesMatch) {
            const memberMatches = policyNamesMatch[1].match(/<member>(.*?)<\/member>/gs);
            if (memberMatches) {
                for (const memberMatch of memberMatches) {
                    const memberContent = memberMatch.replace(/<\/?member>/g, '').trim();
                    if (memberContent) {
                        policyNames.push(memberContent);
                    }
                }
            }
        }

        return { PolicyNames: policyNames };
    }

    private parseGetPolicyResponse(xmlBody: string): IAMPolicyResponse {
        // Look for the Policy element within GetPolicyResult
        let policyMatch = xmlBody.match(/<Policy>(.*?)<\/Policy>/s);
        
        // If not found, try looking within GetPolicyResult
        if (!policyMatch) {
            const resultMatch = xmlBody.match(/<GetPolicyResult>(.*?)<\/GetPolicyResult>/s);
            if (resultMatch) {
                policyMatch = resultMatch[1].match(/<Policy>(.*?)<\/Policy>/s);
            }
        }
        
        if (!policyMatch) {
            return {};
        }

        const policyContent = policyMatch[1];
        return {
            Policy: {
                PolicyName: this.extractXMLValue(policyContent, 'PolicyName'),
                PolicyId: this.extractXMLValue(policyContent, 'PolicyId'),
                Arn: this.extractXMLValue(policyContent, 'Arn'),
                Path: this.extractXMLValue(policyContent, 'Path'),
                DefaultVersionId: this.extractXMLValue(policyContent, 'DefaultVersionId'),
                AttachmentCount: parseInt(this.extractXMLValue(policyContent, 'AttachmentCount') || '0'),
                CreateDate: this.extractXMLValue(policyContent, 'CreateDate'),
                UpdateDate: this.extractXMLValue(policyContent, 'UpdateDate'),
            }
        };
    }

    private parseListPoliciesResponse(_xmlBody: string): IAMListPoliciesResponse {
        // Basic list parsing - would need more sophisticated parsing for full implementation
        return { Policies: [] };
    }

    private parseGetPolicyVersionResponse(xmlBody: string): IAMPolicyVersionResponse {
        const versionMatch = xmlBody.match(/<PolicyVersion>(.*?)<\/PolicyVersion>/s);
        if (!versionMatch) return {};

        const versionContent = versionMatch[1];
        return {
            PolicyVersion: {
                Document: this.extractXMLValue(versionContent, 'Document'),
                VersionId: this.extractXMLValue(versionContent, 'VersionId'),
                IsDefaultVersion: this.extractXMLValue(versionContent, 'IsDefaultVersion') === 'true',
                CreateDate: this.extractXMLValue(versionContent, 'CreateDate'),
            }
        };
    }

    private extractXMLValue(content: string, tagName: string): string | undefined {
        const match = content.match(new RegExp('<' + tagName + '>(.*?)</' + tagName + '>', 's'));
        return match ? decodeURIComponent(match[1]) : undefined;
    }

    protected checkPolicyExists(policyName: string): IAMPolicyResponse | null {
        try {
            // Build the correct policy ARN including the path
            const definition = this.definition as any; // Cast to access path property
            const path = definition.path || "/";
            const policyArn = `arn:aws:iam::${this.getAccountId()}:policy${path}${policyName}`;
            
            const result = this.makeAWSRequest("POST", "GetPolicy", {
                PolicyArn: policyArn
            });
            
            return result;
        } catch (error) {
            // Policy doesn't exist
            return null;
        }
    }

    protected deletePolicy(policyArn: string, policyName: string): void {
        if (this.state.existing) {
            return;
        }

        try {
            this.makeAWSRequest("POST", "DeletePolicy", {
                PolicyArn: policyArn
            });
        } catch (error) {
            throw new Error(`Failed to delete IAM Policy ${policyName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Helper method to get AWS account ID using STS GetCallerIdentity
    private getAccountId(): string {
        try {
            const response = this.makeSTSRequest("POST", "GetCallerIdentity", {});
            if (response.Account) {
                return response.Account;
            }
        } catch (error) {
            // Continue with fallback
        }
        
        // Fallback to placeholder if STS call fails
        return "123456789012";
    }

    // Helper method to make STS API requests
    private makeSTSRequest(method: string, action: string, body?: any): any {
        const url = "https://sts.amazonaws.com/";
        
        const options: any = {
            service: "sts",
            region: "us-east-1",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            timeout: 30000
        };
        
        // Build form data
        let formData = `Action=${action}&Version=2011-06-15`;
        if (body) {
            for (const [key, value] of Object.entries(body)) {
                if (value !== undefined && value !== null) {
                    formData += `&${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
                }
            }
        }
        options.body = formData;
        
        try {
            let response: any;
            if (method === "POST") {
                response = aws.post(url, options);
            } else if (method === "GET") {
                response = aws.get(url, options);
            } else {
                throw new Error("Unsupported HTTP method for STS: " + method);
            }
            
            if (response.statusCode >= 400) {
                throw new Error(`STS API error: ${response.statusCode} ${response.status}`);
            }
            
            if (response.body) {
                return this.parseSTSResponse(response.body);
            }
            
            return response;
        } catch (error) {
            throw new Error(`STS API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Simple XML parser for STS GetCallerIdentity response
    private parseSTSResponse(xmlBody: string): any {
        // Use a simple regex to extract the Account directly from the XML
        const accountMatch = xmlBody.match(/<Account>([^<]+)<\/Account>/);
        if (accountMatch && accountMatch[1]) {
            return { Account: accountMatch[1] };
        }
        
        return { rawBody: xmlBody };
    }
}

