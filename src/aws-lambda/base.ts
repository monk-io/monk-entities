import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import blobs from "blobs";

export interface AWSLambdaDefinition {
    /**
     * @description AWS region where the Lambda function will be managed
     * @example "us-east-1"
     */
    region: string;
    /**
     * @description Name of the blob that contains the ZIP archive for code deployments (used when `package_type` is Zip)
     */
    blob_name?: string;  // Optional for container images
    /**
     * @description ECR image URI for container image deployments (used when `package_type` is Image)
     * @example "123456789012.dkr.ecr.us-east-1.amazonaws.com/repo:tag"
     */
    image_uri?: string;  // Container image URI for package_type: Image
}

export interface AWSLambdaState {
    /** @description Indicates if the function pre-existed before this entity managed it */
    existing?: boolean;
    /** @description Lambda function name */
    function_name?: string;
    /** @description ARN of the Lambda function */
    function_arn?: string;
    /** @description SHA-256 hash of the currently deployed code */
    code_sha256?: string;
    /** @description Timestamp of the last modification (ISO 8601) */
    last_modified?: string;
    /** @description Current function lifecycle state (e.g., Active) */
    state?: string;
    /** @description Reason for the current state, if any */
    state_reason?: string;
}

interface LambdaResponse {
    FunctionName?: string;
    FunctionArn?: string;
    Runtime?: string;
    Role?: string;
    Handler?: string;
    CodeSize?: number;
    Description?: string;
    Timeout?: number;
    MemorySize?: number;
    LastModified?: string;
    CodeSha256?: string;
    Version?: string;
    Environment?: {
        Variables?: Record<string, string>;
        Error?: {
            ErrorCode?: string;
            Message?: string;
        };
    };
    DeadLetterConfig?: {
        TargetArn?: string;
    };
    KMSKeyArn?: string;
    TracingConfig?: {
        Mode?: string;
    };
    MasterArn?: string;
    RevisionId?: string;
    Layers?: Array<{
        Arn?: string;
        CodeSize?: number;
        SigningProfileVersionArn?: string;
        SigningJobArn?: string;
    }>;
    State?: string;
    StateReason?: string;
    StateReasonCode?: string;
    LastUpdateStatus?: string;
    LastUpdateStatusReason?: string;
    LastUpdateStatusReasonCode?: string;
    FileSystemConfigs?: Array<{
        Arn: string;
        LocalMountPath: string;
    }>;
    PackageType?: string;
    ImageConfigResponse?: {
        ImageConfig?: {
            EntryPoint?: string[];
            Command?: string[];
            WorkingDirectory?: string;
        };
        Error?: {
            ErrorCode?: string;
            Message?: string;
        };
    };
    SigningProfileVersionArn?: string;
    SigningJobArn?: string;
    CodeSigningConfigArn?: string;
    Architectures?: string[];
    EphemeralStorage?: {
        Size?: number;
    };
    SnapStart?: {
        ApplyOn?: string;
        OptimizationStatus?: string;
    };
    RuntimeVersionConfig?: {
        RuntimeVersionArn?: string;
        Error?: {
            ErrorCode?: string;
            Message?: string;
        };
    };
    LoggingConfig?: {
        LogFormat?: string;
        ApplicationLogLevel?: string;
        SystemLogLevel?: string;
        LogGroup?: string;
    };
}

export abstract class AWSLambdaEntity<
    D extends AWSLambdaDefinition,
    S extends AWSLambdaState
> extends MonkEntity<D, S> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    protected abstract getFunctionName(): string;

    protected getLambdaZipFromBlob(): string {
        if (!this.definition.blob_name) {
            throw new Error("blob_name is required for ZIP package deployments");
        }

        try {
            // Get blob metadata to verify it exists
            const blobMeta = blobs.get(this.definition.blob_name);
            if (!blobMeta) {
                throw new Error(`Blob not found: ${this.definition.blob_name}`);
            }

            // Get ZIP archive content from blob
            const zipContent = blobs.zip(this.definition.blob_name);
            if (!zipContent) {
                throw new Error(`Failed to get ZIP content from blob: ${this.definition.blob_name}`);
            }

            return zipContent;
        } catch (error) {
            throw new Error(`Failed to retrieve Lambda code from blob ${this.definition.blob_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected makeAWSRequest(method: string, path: string, body?: any): LambdaResponse {
        const url = `https://lambda.${this.region}.amazonaws.com${path}`;
        
        // Follow the same pattern as other entities
        const options: any = {
            service: "lambda",
            region: this.region,
            headers: {},
            timeout: 30000,
        };
        
        if (body) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
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
                throw new Error(`Unsupported HTTP method: ${method}`);
            }
            
            if (response.statusCode >= 400) {
                let errorMessage = `AWS Lambda API error: ${response.statusCode} ${response.status}`;
                let errorDetails: any = {};
                
                try {
                    errorDetails = JSON.parse(response.body);
                    if (errorDetails.message) {
                        errorMessage += ` - ${errorDetails.message}`;
                    }
                    if (errorDetails.errorMessage) {
                        errorMessage += ` - ${errorDetails.errorMessage}`;
                    }
                    if (errorDetails.Type) {
                        errorMessage += ` - Type: ${errorDetails.Type}`;
                    }
                    if (errorDetails.__type) {
                        errorMessage += ` - ErrorType: ${errorDetails.__type}`;
                    }
                } catch (_parseError) {
                    errorMessage += ` - Raw response: ${response.body}`;
                }

                // Enhanced error details for specific status codes
                if (response.statusCode === 403) {
                    errorMessage += `\n\n🔍 403 FORBIDDEN ERROR ANALYSIS:`;
                    errorMessage += `\n   • Request URL: ${url}`;
                    errorMessage += `\n   • HTTP Method: ${method}`;
                    errorMessage += `\n   • Region: ${this.region}`;
                    
                    // Check if this is a container image deployment
                    if (body && (body.Code?.ImageUri || body.PackageType === "Image")) {
                        errorMessage += `\n   • Deployment Type: Container Image`;
                        if (body.Code?.ImageUri) {
                            errorMessage += `\n   • Image URI: ${body.Code.ImageUri}`;
                        }
                        errorMessage += `\n\n💡 CONTAINER IMAGE 403 TROUBLESHOOTING:`;
                        errorMessage += `\n   1. Missing ECR permissions - you need:`;
                        errorMessage += `\n      • ecr:GetAuthorizationToken`;
                        errorMessage += `\n      • ecr:BatchCheckLayerAvailability`;
                        errorMessage += `\n      • ecr:GetDownloadUrlForLayer`;
                        errorMessage += `\n      • ecr:BatchGetImage`;
                        errorMessage += `\n   2. Check if ECR repository exists:`;
                        if (body.Code?.ImageUri) {
                            const imageUri = body.Code.ImageUri;
                            const repoMatch = imageUri.match(/\/([^:]+)/);
                            if (repoMatch) {
                                errorMessage += `\n      aws ecr describe-repositories --repository-names ${repoMatch[1]} --region ${this.region}`;
                            }
                        }
                        errorMessage += `\n   3. Verify image exists in ECR repository`;
                        errorMessage += `\n   4. Ensure Lambda execution role has ECR permissions`;
                    } else {
                        errorMessage += `\n   • Deployment Type: ZIP Package`;
                        errorMessage += `\n\n💡 ZIP PACKAGE 403 TROUBLESHOOTING:`;
                        errorMessage += `\n   1. Missing Lambda permissions - you need:`;
                        errorMessage += `\n      • lambda:CreateFunction`;
                        errorMessage += `\n      • lambda:GetFunction`;
                        errorMessage += `\n      • lambda:UpdateFunctionCode`;
                        errorMessage += `\n   2. Check IAM role ARN is valid and accessible`;
                        errorMessage += `\n   3. Verify role has lambda.amazonaws.com trust policy`;
                    }
                    
                    if (errorDetails.message && errorDetails.message.includes("not authorized")) {
                        errorMessage += `\n\n🚨 SPECIFIC AUTHORIZATION ERROR:`;
                        errorMessage += `\n   This is a credential/permission issue, not a configuration error.`;
                        errorMessage += `\n   Run: aws sts get-caller-identity`;
                        errorMessage += `\n   Then verify your credentials have the required permissions.`;
                    }
                }

                // Add full response details for debugging
                errorMessage += `\n\n📋 FULL ERROR DETAILS:`;
                errorMessage += `\n   Status Code: ${response.statusCode}`;
                errorMessage += `\n   Status Text: ${response.status || 'N/A'}`;
                errorMessage += `\n   Response Headers: ${JSON.stringify(response.headers || {}, null, 2)}`;
                errorMessage += `\n   Response Body: ${response.body || 'Empty'}`;
                if (body) {
                    errorMessage += `\n   Request Body: ${JSON.stringify(body, null, 2)}`;
                }
                
                throw new Error(errorMessage);
            }

            // Parse response body if present
            if (response.body) {
                try {
                    return JSON.parse(response.body) as LambdaResponse;
                } catch (error) {
                    throw new Error(`Failed to parse AWS Lambda API response: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }

            return response;
        } catch (error) {
            throw new Error(`AWS Lambda API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected checkFunctionExists(functionName: string): LambdaResponse | null {
        try {
            return this.makeAWSRequest("GET", `/2015-03-31/functions/${encodeURIComponent(functionName)}`);
        } catch (error) {
            // Function doesn't exist if we get a 404
            if (error instanceof Error && error.message.includes("404")) {
                return null;
            }
            throw error;
        }
    }

    protected deleteLambdaFunction(functionName: string): void {
        if (this.state.existing) {
            return;
        }

        try {
            this.makeAWSRequest("DELETE", `/2015-03-31/functions/${encodeURIComponent(functionName)}`);
        } catch (error) {
            throw new Error(`Failed to delete Lambda function ${functionName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected waitForFunctionState(functionName: string, targetState: string, maxAttempts: number = 30): boolean {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = this.checkFunctionExists(functionName);
                if (response) {
                    // Handle nested Configuration structure from AWS Lambda API
                    const config = (response as any).Configuration || response; // Use type assertion to handle nested structure
                    
                    // For Lambda functions, we need to check both State and LastUpdateStatus
                    // to ensure the function is truly ready for the next operation
                    const isTargetState = config.State === targetState;
                    const isUpdateComplete = config.LastUpdateStatus === "Successful";
                    
                    if (isTargetState && isUpdateComplete) {
                        return true;
                    }
                    
                    if (config.State === "Failed" || config.LastUpdateStatus === "Failed") {
                        throw new Error(`Function ${functionName} is in Failed state. State: ${config.State}, LastUpdateStatus: ${config.LastUpdateStatus}, Reason: ${config.StateReason}`);
                    }
                }

                // Wait 5 seconds before next attempt
                const start = Date.now();
                while (Date.now() - start < 5000) {
                    // Simple busy wait since we don't have a proper sleep function
                }
            } catch (error) {
                if (attempt === maxAttempts - 1) {
                    throw error;
                }
            }
        }
        
        return false;
    }
} 