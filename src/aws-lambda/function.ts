import { AWSLambdaEntity, AWSLambdaDefinition, AWSLambdaState } from "./base.ts";
import * as MonkecBase from "monkec/base";
const action = MonkecBase.action;
import cli from "cli";

// AWS Lambda API interfaces (internal to this file)
interface LambdaFunctionConfig {
    FunctionName: string;
    Runtime?: string;
    Role?: string;
    Handler?: string;
    Description?: string;
    Timeout?: number;
    MemorySize?: number;
    Environment?: {
        Variables?: Record<string, string>;
    };
    DeadLetterConfig?: {
        TargetArn?: string;
    };
    KMSKeyArn?: string;
    TracingConfig?: {
        Mode?: string;
    };
    Tags?: Record<string, string>;
    Layers?: string[];
    FileSystemConfigs?: Array<{
        Arn: string;
        LocalMountPath: string;
    }>;
    ImageConfig?: {
        EntryPoint?: string[];
        Command?: string[];
        WorkingDirectory?: string;
    };
    CodeSigningConfigArn?: string;
    Architectures?: string[];
    EphemeralStorage?: {
        Size?: number;
    };
    SnapStart?: {
        ApplyOn?: string;
    };
    LoggingConfig?: {
        LogFormat?: string;
        ApplicationLogLevel?: string;
        SystemLogLevel?: string;
        LogGroup?: string;
    };
}

interface CreateFunctionRequest extends LambdaFunctionConfig {
    Code: {
        ZipFile?: string;
        S3Bucket?: string;
        S3Key?: string;
        S3ObjectVersion?: string;
        ImageUri?: string;
    };
    PackageType?: string;
    Publish?: boolean;
}

export interface LambdaFunctionDefinition extends AWSLambdaDefinition {
    /** @description Lambda function name */
    function_name: string;
    /**
     * @description Lambda runtime (e.g., nodejs20.x). Optional for container images
     */
    runtime?: string;  // Optional for container images (defined in image)
    /** @description IAM role ARN assumed by the Lambda function */
    role: string;
    /**
     * @description Handler entrypoint (e.g., index.handler). Optional for container images
     */
    handler?: string;  // Optional for container images (defined in image)
    /** @description Human-readable description for the function */
    summary?: string;
    /** @description Function timeout in seconds
     *  @default 3
     */
    timeout?: number;
    /** @description Memory size in MB
     *  @default 128
     */
    memory_size?: number;
    /** @description Environment variables */
    environment?: {
        /** @description Key/value environment variables */
        variables?: Record<string, string>;
    };
    /** @description Dead-letter queue configuration */
    dead_letter_config?: {
        /** @description Target ARN for dead-letter messages */
        target_arn?: string;
    };
    /** @description KMS key ARN for encrypting environment variables */
    kms_key_arn?: string;
    /** @description AWS X-Ray tracing configuration */
    tracing_config?: {
        /** @description Tracing mode (e.g., Active, PassThrough) */
        mode?: string;
    };
    /** @description Resource tags to apply to the function */
    tags?: Record<string, string>;
    /** @description Layer ARNs to attach */
    layers?: string[];
    /** @description EFS file system configurations */
    file_system_configs?: Array<{
        /** @description EFS Access Point ARN */
        arn: string;
        /** @description Local mount path inside the Lambda environment */
        local_mount_path: string;
    }>;
    /** @description Container image runtime configuration overrides */
    image_config?: {
        /** @description Container entry point */
        entry_point?: string[];
        /** @description Container command */
        command?: string[];
        /** @description Working directory inside the container */
        working_directory?: string;
    };
    /** @description Code signing configuration ARN */
    code_signing_config_arn?: string;
    /** @description Instruction set architectures (e.g., x86_64, arm64) */
    architectures?: string[];
    /** @description Ephemeral /tmp storage configuration */
    ephemeral_storage?: {
        /** @description Size in MB for /tmp storage */
        size?: number;
    };
    /** @description SnapStart configuration */
    snap_start?: {
        /** @description Apply SnapStart on PublishedVersions or None */
        apply_on?: string;
    };
    /** @description Logging configuration */
    logging_config?: {
        /** @description Log format (e.g., JSON) */
        log_format?: string;
        /** @description Application log level */
        application_log_level?: string;
        /** @description System log level */
        system_log_level?: string;
        /** @description CloudWatch Logs group name */
        log_group?: string;
    };
    /** @description Deployment package type (Zip or Image)
     *  @default Zip
     */
    package_type?: string;
    /** @description Whether to publish a new version on create/update
     *  @default false
     */
    publish?: boolean;
}

export interface LambdaFunctionState extends AWSLambdaState {
    /** @description Effective runtime */
    runtime?: string;
    /** @description Role ARN bound to the function */
    role?: string;
    /** @description Handler entrypoint */
    handler?: string;
    /** @description Effective timeout in seconds */
    timeout?: number;
    /** @description Effective memory size in MB */
    memory_size?: number;
    /** @description Deployed code size in bytes */
    code_size?: number;
    /** @description Published function version */
    version?: string;
    /** @description Status of the last update operation */
    last_update_status?: string;
    /** @description Revision identifier */
    revision_id?: string;
}

export class LambdaFunction extends AWSLambdaEntity<LambdaFunctionDefinition, LambdaFunctionState> {
    
    // Customize readiness check parameters
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    protected getFunctionName(): string {
        return this.definition.function_name;
    }

    private validateContainerImageConfiguration(): void {
        const packageType = this.definition.package_type || "Zip";
        
        if (packageType === "Image") {
            if (!this.definition.image_uri) {
                throw new Error("image_uri is required when package_type is 'Image'");
            }
            
            // Validate ECR URI format
            const ecrUriPattern = /^[0-9]{12}\.dkr\.ecr\.[a-z0-9\-]+\.amazonaws\.com\/[a-zA-Z0-9\-_\/]+:[a-zA-Z0-9\-_\.]+$/;
            if (!ecrUriPattern.test(this.definition.image_uri)) {
                throw new Error(
                    `Invalid ECR image URI format: ${this.definition.image_uri}\n` +
                    `Expected format: 123456789012.dkr.ecr.region.amazonaws.com/repository:tag\n` +
                    `Note: AWS Lambda only supports ECR images, not Docker Hub or other registries`
                );
            }
            
            // Extract region from URI and validate it matches function region
            const uriRegionMatch = this.definition.image_uri.match(/\.dkr\.ecr\.([a-z0-9\-]+)\.amazonaws\.com\//);
            if (uriRegionMatch && uriRegionMatch[1] !== this.definition.region) {
                throw new Error(
                    `ECR image region (${uriRegionMatch[1]}) does not match Lambda function region (${this.definition.region})\n` +
                    `The ECR repository must be in the same region as the Lambda function`
                );
            }
        }
    }

    private buildCreateFunctionRequest(): CreateFunctionRequest {
        const packageType = this.definition.package_type || "Zip";
        
        // Validate deployment type configuration
        if (packageType === "Image") {
            this.validateContainerImageConfiguration();
        } else {
            if (!this.definition.runtime) {
                throw new Error("runtime is required when package_type is 'Zip'");
            }
            if (!this.definition.handler) {
                throw new Error("handler is required when package_type is 'Zip'");
            }
        }

        const request: CreateFunctionRequest = {
            FunctionName: this.definition.function_name,
            Role: this.definition.role,
            PackageType: packageType,
            Publish: this.definition.publish || false,
            Code: {},
        };

        // Configure code source based on package type
        if (packageType === "Image") {
            request.Code.ImageUri = this.definition.image_uri;
            // Runtime and Handler are not used for container images
        } else {
            // ZIP package deployment
            const zipContent = this.getLambdaZipFromBlob();
            request.Code.ZipFile = zipContent;
            request.Runtime = this.definition.runtime;
            request.Handler = this.definition.handler;
        }

        // Add optional configuration
        if (this.definition.summary) {
            request.Description = this.definition.summary;
        }
        
        if (this.definition.timeout) {
            request.Timeout = this.definition.timeout;
        }
        
        if (this.definition.memory_size) {
            request.MemorySize = this.definition.memory_size;
        }
        
        if (this.definition.environment) {
            request.Environment = {
                Variables: this.definition.environment.variables || {},
            };
        }
        
        if (this.definition.dead_letter_config) {
            request.DeadLetterConfig = {
                TargetArn: this.definition.dead_letter_config.target_arn,
            };
        }
        
        if (this.definition.kms_key_arn) {
            request.KMSKeyArn = this.definition.kms_key_arn;
        }
        
        if (this.definition.tracing_config) {
            request.TracingConfig = {
                Mode: this.definition.tracing_config.mode,
            };
        }
        
        if (this.definition.tags) {
            request.Tags = this.definition.tags;
        }
        
        if (this.definition.layers) {
            request.Layers = [...this.definition.layers];
        }
        
        if (this.definition.file_system_configs) {
            request.FileSystemConfigs = this.definition.file_system_configs.map(config => ({
                Arn: config.arn,
                LocalMountPath: config.local_mount_path,
            }));
        }
        
        if (this.definition.image_config) {
            request.ImageConfig = {
                EntryPoint: this.definition.image_config.entry_point ? [...this.definition.image_config.entry_point] : undefined,
                Command: this.definition.image_config.command ? [...this.definition.image_config.command] : undefined,
                WorkingDirectory: this.definition.image_config.working_directory,
            };
        }
        
        if (this.definition.code_signing_config_arn) {
            request.CodeSigningConfigArn = this.definition.code_signing_config_arn;
        }
        
        if (this.definition.architectures) {
            request.Architectures = [...this.definition.architectures];
        }
        
        if (this.definition.ephemeral_storage) {
            request.EphemeralStorage = {
                Size: this.definition.ephemeral_storage.size,
            };
        }
        
        if (this.definition.snap_start) {
            request.SnapStart = {
                ApplyOn: this.definition.snap_start.apply_on,
            };
        }
        
        if (this.definition.logging_config) {
            request.LoggingConfig = {
                LogFormat: this.definition.logging_config.log_format,
                ApplicationLogLevel: this.definition.logging_config.application_log_level,
                SystemLogLevel: this.definition.logging_config.system_log_level,
                LogGroup: this.definition.logging_config.log_group,
            };
        }

        return request;
    }

    private buildUpdateConfigurationRequest(): Partial<LambdaFunctionConfig> {
        const packageType = this.definition.package_type || "Zip";
        
        const config: Partial<LambdaFunctionConfig> = {
            FunctionName: this.definition.function_name,
        };

        // Add runtime and handler only for ZIP packages
        if (packageType === "Zip") {
            if (this.definition.runtime !== undefined) {
                config.Runtime = this.definition.runtime;
            }
            if (this.definition.handler !== undefined) {
                config.Handler = this.definition.handler;
            }
        }

        // Add optional configuration
        if (this.definition.summary !== undefined) {
            config.Description = this.definition.summary;
        }
        
        if (this.definition.timeout !== undefined) {
            config.Timeout = this.definition.timeout;
        }
        
        if (this.definition.memory_size !== undefined) {
            config.MemorySize = this.definition.memory_size;
        }
        
        if (this.definition.environment !== undefined) {
            config.Environment = {
                Variables: this.definition.environment.variables || {},
            };
        }
        
        if (this.definition.dead_letter_config !== undefined) {
            config.DeadLetterConfig = {
                TargetArn: this.definition.dead_letter_config.target_arn,
            };
        }
        
        if (this.definition.kms_key_arn !== undefined) {
            config.KMSKeyArn = this.definition.kms_key_arn;
        }
        
        if (this.definition.tracing_config !== undefined) {
            config.TracingConfig = {
                Mode: this.definition.tracing_config.mode,
            };
        }
        
        if (this.definition.layers !== undefined) {
            config.Layers = this.definition.layers ? [...this.definition.layers] : undefined;
        }
        
        if (this.definition.file_system_configs !== undefined) {
            config.FileSystemConfigs = this.definition.file_system_configs.map(config => ({
                Arn: config.arn,
                LocalMountPath: config.local_mount_path,
            }));
        }
        
        if (this.definition.image_config !== undefined) {
            config.ImageConfig = {
                EntryPoint: this.definition.image_config.entry_point ? [...this.definition.image_config.entry_point] : undefined,
                Command: this.definition.image_config.command ? [...this.definition.image_config.command] : undefined,
                WorkingDirectory: this.definition.image_config.working_directory,
            };
        }
        
        if (this.definition.ephemeral_storage !== undefined) {
            config.EphemeralStorage = {
                Size: this.definition.ephemeral_storage.size,
            };
        }
        
        if (this.definition.snap_start !== undefined) {
            config.SnapStart = {
                ApplyOn: this.definition.snap_start.apply_on,
            };
        }
        
        if (this.definition.logging_config !== undefined) {
            config.LoggingConfig = {
                LogFormat: this.definition.logging_config.log_format,
                ApplicationLogLevel: this.definition.logging_config.application_log_level,
                SystemLogLevel: this.definition.logging_config.system_log_level,
                LogGroup: this.definition.logging_config.log_group,
            };
        }

        return config;
    }

    private updateStateFromResponse(response: any): void {
        // Handle nested Configuration structure from AWS Lambda API
        const config = response.Configuration || response; // Fallback to flat structure for backward compatibility
        
        this.state = {
            ...this.state,
            function_name: config.FunctionName,
            function_arn: config.FunctionArn,
            code_sha256: config.CodeSha256,
            last_modified: config.LastModified,
            state: config.State,
            state_reason: config.StateReason,
            runtime: config.Runtime,
            role: config.Role,
            handler: config.Handler,
            timeout: config.Timeout,
            memory_size: config.MemorySize,
            code_size: config.CodeSize,
            version: config.Version,
            last_update_status: config.LastUpdateStatus,
            revision_id: config.RevisionId,
        };
    }

    override create(): void {
        // Check if function already exists
        const existingFunction = this.checkFunctionExists(this.definition.function_name);
        
        if (existingFunction) {
            cli.output(`Lambda function ${this.definition.function_name} already exists, marking as existing`);
            this.updateStateFromResponse(existingFunction);
            this.state.existing = true;
            return;
        }
        
        // Create new function
        const createRequest = this.buildCreateFunctionRequest();
        
        try {
            const response = this.makeAWSRequest("POST", "/2015-03-31/functions", createRequest);      
            this.updateStateFromResponse(response);
            this.state.existing = false;
        } catch (error) {
            throw new Error(`Failed to create Lambda function ${this.definition.function_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.function_name) {
            cli.output("Function does not exist, creating instead");
            this.create();
            return;
        }

        try {
            // Update function code based on package type
            const packageType = this.definition.package_type || "Zip";
            let updateCodeRequest: { ZipFile?: string; ImageUri?: string };
            
            if (packageType === "Image") {
                if (!this.definition.image_uri) {
                    throw new Error("image_uri is required for container image updates");
                }
                updateCodeRequest = {
                    ImageUri: this.definition.image_uri,
                };
            } else {
                // ZIP package update
                const zipContent = this.getLambdaZipFromBlob();
                updateCodeRequest = {
                    ZipFile: zipContent,
                };
            }
            
            this.makeAWSRequest(
                "PUT", 
                `/2015-03-31/functions/${encodeURIComponent(this.definition.function_name)}/code`,
                updateCodeRequest
            );

            // Wait for function to be active and update to complete before updating configuration
            if (!this.waitForFunctionState(this.definition.function_name, "Active")) {
                throw new Error("Function did not become active after code update");
            }

            // Update function configuration with retry logic for 409 conflicts
            const configRequest = this.buildUpdateConfigurationRequest();
            const maxRetries = 5;
            let configResponse;
            
            for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                    configResponse = this.makeAWSRequest(
                        "PUT",
                        `/2015-03-31/functions/${encodeURIComponent(this.definition.function_name)}/configuration`,
                        configRequest
                    );
                    break; // Success, exit retry loop
                } catch (error) {
                    const isConflictError = error instanceof Error && 
                        (error.message.includes('409') || 
                         error.message.includes('ResourceConflictException') ||
                         error.message.includes('update is in progress'));
                    
                    if (isConflictError && attempt < maxRetries - 1) {
                        // Wait 10 seconds before retry
                        const start = Date.now();
                        while (Date.now() - start < 10000) {
                            // Simple busy wait
                        }
                        
                        // Check function state again before retrying
                        if (!this.waitForFunctionState(this.definition.function_name, "Active")) {
                            throw new Error("Function became unavailable during retry");
                        }
                        continue;
                    }
                    
                    // If it's not a 409 error or we've exhausted retries, throw the error
                    throw error;
                }
            }
            
            if (configResponse) {
                this.updateStateFromResponse(configResponse);
            }
        } catch (error) {
            throw new Error(`Failed to update Lambda function ${this.definition.function_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override delete(): void {
        if (!this.state.function_name) {
            cli.output("Lambda function does not exist, nothing to delete");
            return;
        }
        
        this.deleteLambdaFunction(this.definition.function_name);
    }

    override checkReadiness(): boolean {
        if (!this.state.function_name) {
            return false;
        }

        try {
            const response = this.checkFunctionExists(this.definition.function_name);
            if (!response) {
                return false;
            }

            // Function is ready when it's Active and last update was successful
            // Access properties from the Configuration object in the response
            const config = (response as any).Configuration || response; // Use type assertion to handle nested structure
            const isActive = config.State === "Active";
            const updateSuccessful = config.LastUpdateStatus === "Successful";
            
            if (isActive && updateSuccessful) {
                this.updateStateFromResponse(response);
                return true;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    // Custom actions using @action decorator
    @action("invoke")
    invoke(args?: MonkecBase.Args): void {
        if (!this.state.function_name) {
            throw new Error("Function does not exist, cannot invoke");
        }

        const payload = args?.payload || "{}";
        const invocationType = args?.invocationType || "RequestResponse";

        try {
            const response = this.makeAWSRequest(
                "POST",
                `/2015-03-31/functions/${encodeURIComponent(this.definition.function_name)}/invocations?InvocationType=${invocationType}`,
                payload
            );

            if (response && typeof response === 'object') {
                cli.output(`Response: ${JSON.stringify(response, null, 2)}`);
            }
        } catch (error) {
            throw new Error(`Failed to invoke function: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    @action("get-logs")
    getLogs(_args?: MonkecBase.Args): void {
        if (!this.state.function_name) {
            throw new Error("Function does not exist, cannot get logs");
        }

        const logGroupName = `/aws/lambda/${this.definition.function_name}`;
        cli.output(`Lambda function logs are available in CloudWatch Log Group: ${logGroupName}`);
        cli.output("Use AWS CLI or Console to view logs:");
        cli.output(`aws logs describe-log-streams --log-group-name "${logGroupName}"`);
    }

    @action("update-code")
    updateCode(_args?: MonkecBase.Args): void {
        if (!this.state.function_name) {
            throw new Error("Function does not exist, cannot update code");
        }

        try {
            // Update function code based on package type
            const packageType = this.definition.package_type || "Zip";
            let updateCodeRequest: { ZipFile?: string; ImageUri?: string };
            
            if (packageType === "Image") {
                if (!this.definition.image_uri) {
                    throw new Error("image_uri is required for container image updates");
                }
                updateCodeRequest = {
                    ImageUri: this.definition.image_uri,
                };
                cli.output(`Updating Lambda function code with container image: ${this.definition.image_uri}`);
            } else {
                // ZIP package update
                const zipContent = this.getLambdaZipFromBlob();
                updateCodeRequest = {
                    ZipFile: zipContent,
                };
                cli.output(`Updating Lambda function code from blob: ${this.definition.blob_name}`);
            }
            
            const response = this.makeAWSRequest(
                "PUT", 
                `/2015-03-31/functions/${encodeURIComponent(this.definition.function_name)}/code`,
                updateCodeRequest
            );
            
            this.updateStateFromResponse(response);
            cli.output("Function code updated successfully");
        } catch (error) {
            throw new Error(`Failed to update function code: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
} 