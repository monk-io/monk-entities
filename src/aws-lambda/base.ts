import { MonkEntity } from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";
import blobs from "blobs";

export interface AWSLambdaDefinition {
    region: string;
    blob_name: string;
}

export interface AWSLambdaState {
    existing?: boolean;
    function_name?: string;
    function_arn?: string;
    code_sha256?: string;
    last_modified?: string;
    state?: string;
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
        try {
            // Get blob metadata to verify it exists
            const blobMeta = blobs.get(this.definition.blob_name);
            if (!blobMeta) {
                throw new Error(`Blob not found: ${this.definition.blob_name}`);
            }

            cli.output(`Found blob: ${blobMeta.name} (${blobMeta.size} bytes)`);

            // Get ZIP archive content from blob
            const zipContent = blobs.zip(this.definition.blob_name);
            if (!zipContent) {
                throw new Error(`Failed to get ZIP content from blob: ${this.definition.blob_name}`);
            }

            // AWS Lambda requires ZipFile to be base64-encoded
            // blobs.zip() returns raw binary bytes as a string, so we need to convert to base64
            let base64Content: string;
            try {
                cli.output(`Original ZIP content length: ${zipContent.length} bytes`);
                
                // Convert binary string to base64 using btoa()
                // btoa() expects a binary string where each character represents a byte
                base64Content = btoa(zipContent);
                cli.output(`Converted binary ZIP content to base64`);
                cli.output(`Base64 content length: ${base64Content.length} chars`);
            } catch (error) {
                throw new Error(`Failed to encode ZIP content to base64: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }

            return base64Content;
        } catch (error) {
            throw new Error(`Failed to retrieve Lambda code from blob ${this.definition.blob_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected makeAWSRequest(method: string, path: string, body?: any): LambdaResponse {
        const url = `https://lambda.${this.region}.amazonaws.com${path}`;
        
        // Follow the same pattern as other entities (efs.js, rds.js, dynamo-db.yaml)
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

        cli.output(`Making AWS Request: ${method} ${url}`);
        cli.output(`Request Options: ${JSON.stringify({...options, body: body ? '[BODY_PRESENT]' : undefined}, null, 2)}`);
        if (body) {
            // Don't log the full body for create requests as it contains large base64 data
            if (method === "POST" && body.Code?.ZipFile) {
                const logBody = { ...body };
                logBody.Code = { ZipFile: `[BASE64_DATA_${body.Code.ZipFile.length}_chars]` };
                cli.output(`Request Body: ${JSON.stringify(logBody, null, 2)}`);
            } else {
                cli.output(`Request Body: ${JSON.stringify(body, null, 2)}`);
            }
        }

        try {
            let response: any;
            
            // Use specific HTTP methods like other entities, not aws.do()
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
            
            cli.output(`AWS Response: Status ${response.statusCode} ${response.status}`);
            cli.output(`Response Headers: ${JSON.stringify(response.headers || {}, null, 2)}`);
            
            if (response.statusCode >= 400) {
                let errorMessage = `AWS Lambda API error: ${response.statusCode} ${response.status}`;
                cli.output(`Raw AWS Error Response Body: ${response.body}`);
                
                try {
                    const errorBody = JSON.parse(response.body);
                    if (errorBody.message) {
                        errorMessage += ` - ${errorBody.message}`;
                    }
                    if (errorBody.errorMessage) {
                        errorMessage += ` - ${errorBody.errorMessage}`;
                    }
                    if (errorBody.Type) {
                        errorMessage += ` - Type: ${errorBody.Type}`;
                    }
                    if (errorBody.__type) {
                        errorMessage += ` - ErrorType: ${errorBody.__type}`;
                    }
                    cli.output(`Parsed AWS Error Details: ${JSON.stringify(errorBody, null, 2)}`);
                } catch (parseError) {
                    cli.output(`Failed to parse error response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
                    errorMessage += ` - Raw: ${response.body}`;
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
            cli.output(`Lambda function ${functionName} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            this.makeAWSRequest("DELETE", `/2015-03-31/functions/${encodeURIComponent(functionName)}`);
            cli.output(`Successfully deleted Lambda function: ${functionName}`);
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
                    
                    // Log current status for debugging
                    console.log(`Waiting for function ${functionName} - State: ${config.State}, LastUpdateStatus: ${config.LastUpdateStatus}, Target: ${targetState}`);
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