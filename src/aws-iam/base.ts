import { MonkEntity } from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";

export interface AWSIAMDefinition {
    region: string;
}

export interface AWSIAMState {
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

                    cli.output("Making AWS IAM Request: " + method + " " + url);
                    cli.output("Action: " + action);
        cli.output(`Request Options: ${JSON.stringify({...options, body: '[FORM_DATA]'}, null, 2)}`);
        
        if (body) {
            // Log form data for debugging (mask sensitive data if needed)
            const logFormData = formData.replace(/PolicyDocument=([^&]*)/g, 'PolicyDocument=[POLICY_DOCUMENT]');
            cli.output(`Form Data: ${logFormData}`);
        }

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
            
            cli.output(`AWS IAM Response: Status ${response.statusCode} ${response.status}`);
            cli.output(`Response Headers: ${JSON.stringify(response.headers || {}, null, 2)}`);
            
            if (response.statusCode >= 400) {
                let errorMessage = "AWS IAM API error: " + response.statusCode + " " + response.status;
                cli.output(`Raw AWS IAM Error Response Body: ${response.body}`);
                
                try {
                    // IAM returns XML error responses
                    const errorBody = this.parseXMLError(response.body);
                    if (errorBody.Error?.Message) {
                        errorMessage += ` - ${errorBody.Error.Message}`;
                    }
                    if (errorBody.Error?.Code) {
                        errorMessage += ` - Code: ${errorBody.Error.Code}`;
                    }
                    cli.output(`Parsed AWS IAM Error Details: ${JSON.stringify(errorBody, null, 2)}`);
                } catch (parseError) {
                    cli.output(`Failed to parse error response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
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
        // This is a basic implementation - in production, you might want a more robust XML parser
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
        // Simple XML parsing for IAM responses
        // This is a basic implementation - for production use, consider a robust XML parser
        
        // Add debugging to see the actual response
        cli.output(`Raw AWS IAM Response Body: ${xmlBody}`);
        
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
            cli.output(`DEBUG: No Policy element found in CreatePolicy response. XML structure might be different.`);
            cli.output(`DEBUG: Response contains: ${xmlBody.substring(0, 500)}...`);
            return {};
        }

        const policyContent = policyMatch[1];
        const result = {
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
        
        cli.output(`DEBUG: Parsed Policy Response: ${JSON.stringify(result, null, 2)}`);
        return result;
    }

    private parseCreatePolicyVersionResponse(xmlBody: string): any {
        cli.output(`DEBUG: Parsing CreatePolicyVersion response`);
        
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
            cli.output(`DEBUG: No PolicyVersion element found in CreatePolicyVersion response. XML structure might be different.`);
            cli.output(`DEBUG: Response contains: ${xmlBody.substring(0, 500)}...`);
            return {};
        }

        const versionContent = versionMatch[1];
        const result = {
            PolicyVersion: {
                VersionId: this.extractXMLValue(versionContent, 'VersionId'),
                IsDefaultVersion: this.extractXMLValue(versionContent, 'IsDefaultVersion') === 'true',
                CreateDate: this.extractXMLValue(versionContent, 'CreateDate'),
            }
        };
        
        cli.output(`DEBUG: Parsed CreatePolicyVersion Response: ${JSON.stringify(result, null, 2)}`);
        return result;
    }

    private parseCreateRoleResponse(xmlBody: string): any {
        cli.output(`DEBUG: Parsing CreateRole response`);
        
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
            cli.output(`DEBUG: No Role element found in CreateRole response. XML structure might be different.`);
            cli.output(`DEBUG: Response contains: ${xmlBody.substring(0, 500)}...`);
            return {};
        }

        const roleContent = roleMatch[1];
        const result = {
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
        
        cli.output(`DEBUG: Parsed CreateRole Response: ${JSON.stringify(result, null, 2)}`);
        return result;
    }

    private parseGetRoleResponse(xmlBody: string): any {
        cli.output(`DEBUG: Parsing GetRole response`);
        
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
            cli.output(`DEBUG: No Role element found in GetRole response. XML structure might be different.`);
            cli.output(`DEBUG: Response contains: ${xmlBody.substring(0, 500)}...`);
            return {};
        }

        const roleContent = roleMatch[1];
        const result = {
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
        
        cli.output(`DEBUG: Parsed GetRole Response: ${JSON.stringify(result, null, 2)}`);
        return result;
    }

    private parseListAttachedRolePoliciesResponse(xmlBody: string): any {
        cli.output(`DEBUG: Parsing ListAttachedRolePolicies response`);
        
        // Look for AttachedPolicies within ListAttachedRolePoliciesResult
        const resultMatch = xmlBody.match(/<ListAttachedRolePoliciesResult>(.*?)<\/ListAttachedRolePoliciesResult>/s);
        if (!resultMatch) {
            cli.output(`DEBUG: No ListAttachedRolePoliciesResult found`);
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

        const result = { AttachedPolicies: attachedPolicies };
        cli.output(`DEBUG: Parsed ListAttachedRolePolicies Response: ${JSON.stringify(result, null, 2)}`);
        return result;
    }

    private parseListRolePoliciesResponse(xmlBody: string): any {
        cli.output(`DEBUG: Parsing ListRolePolicies response`);
        
        // Look for PolicyNames within ListRolePoliciesResult
        const resultMatch = xmlBody.match(/<ListRolePoliciesResult>(.*?)<\/ListRolePoliciesResult>/s);
        if (!resultMatch) {
            cli.output(`DEBUG: No ListRolePoliciesResult found`);
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

        const result = { PolicyNames: policyNames };
        cli.output(`DEBUG: Parsed ListRolePolicies Response: ${JSON.stringify(result, null, 2)}`);
        return result;
    }

    private parseGetPolicyResponse(xmlBody: string): IAMPolicyResponse {
        cli.output(`DEBUG: Parsing GetPolicy response`);
        
        // Look for the Policy element within GetPolicyResult (not CreatePolicyResult)
        let policyMatch = xmlBody.match(/<Policy>(.*?)<\/Policy>/s);
        
        // If not found, try looking within GetPolicyResult
        if (!policyMatch) {
            const resultMatch = xmlBody.match(/<GetPolicyResult>(.*?)<\/GetPolicyResult>/s);
            if (resultMatch) {
                policyMatch = resultMatch[1].match(/<Policy>(.*?)<\/Policy>/s);
            }
        }
        
        if (!policyMatch) {
            cli.output(`DEBUG: No Policy element found in GetPolicy response. XML structure might be different.`);
            cli.output(`DEBUG: Response contains: ${xmlBody.substring(0, 500)}...`);
            return {};
        }

        const policyContent = policyMatch[1];
        const result = {
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
        
        cli.output(`DEBUG: Parsed GetPolicy Response: ${JSON.stringify(result, null, 2)}`);
        return result;
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
            
            cli.output(`DEBUG: Checking if policy exists: ${policyArn}`);
            const result = this.makeAWSRequest("POST", "GetPolicy", {
                PolicyArn: policyArn
            });
            
            cli.output(`DEBUG: checkPolicyExists result: ${JSON.stringify(result, null, 2)}`);
            return result;
        } catch (error) {
            cli.output(`DEBUG: Policy doesn't exist or error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Policy doesn't exist
            return null;
        }
    }

    protected deletePolicy(policyArn: string, policyName: string): void {
        if (this.state.existing) {
            cli.output(`IAM Policy ${policyName} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            this.makeAWSRequest("POST", "DeletePolicy", {
                PolicyArn: policyArn
            });
            cli.output(`Successfully deleted IAM Policy: ${policyName}`);
        } catch (error) {
            throw new Error(`Failed to delete IAM Policy ${policyName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Helper method to get AWS account ID using STS GetCallerIdentity
    private getAccountId(): string {
        cli.output(`DEBUG: getAccountId() called`);
        try {
            cli.output(`DEBUG: Attempting STS GetCallerIdentity call`);
            const response = this.makeSTSRequest("POST", "GetCallerIdentity", {});
            cli.output(`DEBUG: STS response received: ${JSON.stringify(response)}`);
            if (response.Account) {
                cli.output(`DEBUG: Found account ID: ${response.Account}`);
                return response.Account;
            }
        } catch (error) {
            cli.output(`Warning: Failed to get account ID from STS: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Fallback to placeholder if STS call fails
        cli.output(`DEBUG: Falling back to placeholder account ID`);
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
            cli.output(`DEBUG: Making STS request: ${method} ${url}`);
            let response: any;
            if (method === "POST") {
                response = aws.post(url, options);
            } else if (method === "GET") {
                response = aws.get(url, options);
            } else {
                throw new Error("Unsupported HTTP method for STS: " + method);
            }
            
            cli.output(`DEBUG: STS response status: ${response.statusCode}`);
            cli.output(`DEBUG: STS response body type: ${typeof response.body}`);
            cli.output(`DEBUG: STS response body length: ${response.body ? response.body.length : 'null'}`);
            
            if (response.statusCode >= 400) {
                throw new Error(`STS API error: ${response.statusCode} ${response.status}`);
            }
            
            if (response.body) {
                cli.output(`DEBUG: About to call parseSTSResponse`);
                const parsed = this.parseSTSResponse(response.body);
                cli.output(`DEBUG: parseSTSResponse returned: ${JSON.stringify(parsed)}`);
                return parsed;
            }
            
            return response;
        } catch (error) {
            throw new Error(`STS API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Simple XML parser for STS GetCallerIdentity response
    private parseSTSResponse(xmlBody: string): any {
        cli.output(`DEBUG: Parsing STS response: ${xmlBody.substring(0, 200)}...`);
        
        // Use a simple regex to extract the Account directly from the XML
        const accountMatch = xmlBody.match(/<Account>([^<]+)<\/Account>/);
        if (accountMatch && accountMatch[1]) {
            const account = accountMatch[1];
            cli.output(`DEBUG: Found account ID in XML: ${account}`);
            return { Account: account };
        }
        
        cli.output(`DEBUG: Failed to parse account from STS response`);
        return { rawBody: xmlBody };
    }
} 