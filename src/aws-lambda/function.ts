/**
 * @fileoverview AWS Lambda Function entity for managing serverless functions.
 */

import { AWSLambdaEntity, AWSLambdaDefinition, AWSLambdaState } from "./lambda-base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";
import aws from "cloud/aws";

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
    VpcConfig?: {
        SubnetIds?: string[];
        SecurityGroupIds?: string[];
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
    /** @description VPC configuration */
    vpc_config?: {
        subnet_ids?: string[];
        security_group_ids?: string[];
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

/**
 * State interface for AWS Lambda Function entity.
 * Contains runtime information about the deployed function.
 * @interface LambdaFunctionState
 */
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

/**
 * @description AWS Lambda Function entity.
 * Creates and manages AWS Lambda serverless functions for event-driven compute.
 * Supports ZIP package deployments from Monk blobs or container images from ECR.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.function_name` - Function name for invocations
 * - `state.function_arn` - Function ARN for cross-service integrations
 * - `state.state` - Current function state (Active, Pending, etc.)
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-iam/role` - Execution role with required permissions
 * - `aws-api-gateway/api-gateway` - HTTP endpoints for Lambda functions
 * - `aws-sqs/queue` - Event source mappings for queue processing
 * - `aws-sns/topic` - Subscribe to topic notifications
 */
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
        
        if (this.definition.vpc_config) {
            request.VpcConfig = {
                SubnetIds: this.definition.vpc_config.subnet_ids ? [...this.definition.vpc_config.subnet_ids] : undefined,
                SecurityGroupIds: this.definition.vpc_config.security_group_ids ? [...this.definition.vpc_config.security_group_ids] : undefined,
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
        
        if (this.definition.vpc_config !== undefined) {
            config.VpcConfig = {
                SubnetIds: this.definition.vpc_config.subnet_ids ? [...this.definition.vpc_config.subnet_ids] : undefined,
                SecurityGroupIds: this.definition.vpc_config.security_group_ids ? [...this.definition.vpc_config.security_group_ids] : undefined,
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

    checkLiveness(): boolean { return this.checkReadiness(); }

    

    // Custom actions using @action decorator
    @action("invoke")
    invoke(args?: Args): void {
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
    getLogs(_args?: Args): void {
        if (!this.state.function_name) {
            throw new Error("Function does not exist, cannot get logs");
        }

        const logGroupName = `/aws/lambda/${this.definition.function_name}`;
        cli.output(`Lambda function logs are available in CloudWatch Log Group: ${logGroupName}`);
        cli.output("Use AWS CLI or Console to view logs:");
        cli.output(`aws logs describe-log-streams --log-group-name "${logGroupName}"`);
    }

    @action("update-code")
    updateCode(_args?: Args): void {
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

    /**
     * Get estimated monthly cost for the Lambda function based on CloudWatch metrics and AWS Pricing API.
     * 
     * Lambda pricing components:
     * - Request charges: $0.20 per 1 million requests
     * - Duration charges: Based on GB-seconds of compute time
     * - Provisioned Concurrency: If configured, charged per GB-hour
     */
    @action("get-cost-estimate")
    getCostEstimate(_args?: Args): void {
        if (!this.state.function_name) {
            throw new Error("Function does not exist, cannot get cost estimate");
        }

        try {
            const functionName = this.definition.function_name;
            const memoryMB = this.definition.memory_size || 128;
            const memoryGB = memoryMB / 1024;
            const architecture = this.definition.architectures?.[0] || 'x86_64';

            // Get pricing from AWS Price List API
            const pricing = this.getLambdaPricingRates(architecture);

            // Get CloudWatch metrics for the last 30 days
            const metrics = this.getCloudWatchLambdaMetrics(functionName);

            // Calculate costs
            const invocations = metrics?.invocations || 0;
            const totalDurationMs = metrics?.totalDurationMs || 0;
            const avgDurationMs = invocations > 0 ? totalDurationMs / invocations : 0;
            
            // Duration is billed in 1ms increments, minimum 1ms
            const gbSeconds = (totalDurationMs / 1000) * memoryGB;
            
            // Request costs: $0.20 per 1M requests (first 1M free tier not considered here)
            const requestCost = (invocations / 1_000_000) * pricing.requestRate;
            
            // Duration costs: price per GB-second
            const durationCost = gbSeconds * pricing.durationRate;
            
            // Total compute cost
            const totalComputeCost = requestCost + durationCost;

            // Check for provisioned concurrency
            const provisionedConcurrency = this.getProvisionedConcurrency(functionName);
            let provisionedCost = 0;
            if (provisionedConcurrency > 0) {
                // provisionedConcurrencyRate is per GB-second (same unit as durationRate).
                // Convert GB-hours to GB-seconds by multiplying by 3600.
                const hoursInMonth = 730;
                const provisionedGBSeconds = provisionedConcurrency * memoryGB * hoursInMonth * 3600;
                provisionedCost = provisionedGBSeconds * pricing.provisionedConcurrencyRate;
            }

            const totalMonthlyCost = totalComputeCost + provisionedCost;

            const costEstimate = {
                function_name: functionName,
                region: this.region,
                summary: {
                    memory_mb: memoryMB,
                    architecture: architecture,
                    timeout_seconds: this.definition.timeout || 3,
                    estimated_monthly_cost_usd: Math.round(totalMonthlyCost * 100) / 100
                },
                request_costs: {
                    source: "CloudWatch (last 30 days)",
                    invocations: invocations,
                    rate_per_million: pricing.requestRate,
                    monthly_cost_usd: Math.round(requestCost * 100) / 100
                },
                duration_costs: {
                    source: "CloudWatch (last 30 days)",
                    total_duration_ms: Math.round(totalDurationMs),
                    avg_duration_ms: Math.round(avgDurationMs * 100) / 100,
                    gb_seconds: Math.round(gbSeconds * 100) / 100,
                    rate_per_gb_second: pricing.durationRate,
                    monthly_cost_usd: Math.round(durationCost * 100) / 100
                },
                provisioned_concurrency_costs: {
                    provisioned_concurrency: provisionedConcurrency,
                    rate_per_gb_second: pricing.provisionedConcurrencyRate,
                    monthly_cost_usd: Math.round(provisionedCost * 100) / 100,
                    note: provisionedConcurrency > 0 
                        ? `${provisionedConcurrency} units provisioned` 
                        : "No provisioned concurrency configured"
                },
                cloudwatch_metrics: {
                    source: "CloudWatch (last 30 days)",
                    invocations: invocations,
                    errors: metrics?.errors || 0,
                    throttles: metrics?.throttles || 0,
                    concurrent_executions_max: metrics?.concurrentExecutionsMax || 0,
                    avg_duration_ms: Math.round(avgDurationMs * 100) / 100
                },
                pricing_rates: {
                    source: "AWS Price List API",
                    region: this.region,
                    architecture: architecture,
                    currency: "USD",
                    request_rate_per_million: pricing.requestRate,
                    duration_rate_per_gb_second: pricing.durationRate,
                    provisioned_concurrency_rate_per_gb_second: pricing.provisionedConcurrencyRate
                },
                disclaimer: "Pricing from AWS Price List API. Metrics from CloudWatch. Free tier not included. Actual costs may vary."
            };

            cli.output(`Lambda Cost Estimate:\n${JSON.stringify(costEstimate, null, 2)}`);

        } catch (error) {
            throw new Error(`Failed to get cost estimate: ${(error as Error).message}`);
        }
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     * 
     * Output format:
     * {
     *   "type": "aws-lambda-function",
     *   "costs": {
     *     "month": {
     *       "amount": "5.50",
     *       "currency": "USD"
     *     }
     *   }
     * }
     */
    @action("costs")
    costs(): void {
        if (!this.state.function_name) {
            // Return zero cost if function doesn't exist
            const result = {
                type: "aws-lambda-function",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const functionName = this.definition.function_name;
            const memoryMB = this.definition.memory_size || 128;
            const memoryGB = memoryMB / 1024;
            const architecture = this.definition.architectures?.[0] || 'x86_64';

            // Get pricing from AWS Price List API
            const pricing = this.getLambdaPricingRates(architecture);

            // Get CloudWatch metrics for the last 30 days
            const metrics = this.getCloudWatchLambdaMetrics(functionName);

            // Calculate costs
            const invocations = metrics?.invocations || 0;
            const totalDurationMs = metrics?.totalDurationMs || 0;
            
            // Duration is billed in 1ms increments
            const gbSeconds = (totalDurationMs / 1000) * memoryGB;
            
            // Request costs
            const requestCost = (invocations / 1_000_000) * pricing.requestRate;
            
            // Duration costs
            const durationCost = gbSeconds * pricing.durationRate;
            
            // Total compute cost
            const totalComputeCost = requestCost + durationCost;

            // Check for provisioned concurrency
            const provisionedConcurrency = this.getProvisionedConcurrency(functionName);
            let provisionedCost = 0;
            if (provisionedConcurrency > 0) {
                // provisionedConcurrencyRate is per GB-second (same unit as durationRate).
                // Convert GB-hours to GB-seconds by multiplying by 3600.
                const hoursInMonth = 730;
                const provisionedGBSeconds = provisionedConcurrency * memoryGB * hoursInMonth * 3600;
                provisionedCost = provisionedGBSeconds * pricing.provisionedConcurrencyRate;
            }

            const totalMonthlyCost = totalComputeCost + provisionedCost;

            const result = {
                type: "aws-lambda-function",
                costs: {
                    month: {
                        amount: totalMonthlyCost.toFixed(2),
                        currency: "USD"
                    }
                }
            };
            cli.output(JSON.stringify(result));

        } catch (error) {
            // Return zero cost on error
            const result = {
                type: "aws-lambda-function",
                costs: {
                    month: {
                        amount: "0",
                        currency: "USD",
                        error: (error as Error).message
                    }
                }
            };
            cli.output(JSON.stringify(result));
        }
    }

    /**
     * Get Lambda pricing rates from AWS Price List API
     */
    private getLambdaPricingRates(architecture: string): {
        requestRate: number;
        durationRate: number;
        provisionedConcurrencyRate: number;
        source: string;
    } {
        const pricingRegion = 'us-east-1';
        const url = `https://api.pricing.${pricingRegion}.amazonaws.com/`;
        const location = this.getRegionToLocationMap()[this.region];
        if (!location) {
            throw new Error(`Unsupported region for Lambda pricing: ${this.region}`);
        }

        // Determine architecture filter value
        const archFilter = architecture === 'arm64' ? 'ARM' : 'x86';

        // Get request pricing
        const requestFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AWSLambda' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'group', Value: 'AWS-Lambda-Requests' }
        ];

        const requestResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AWSLambda',
                Filters: requestFilters,
                MaxResults: 10
            })
        });

        if (requestResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${requestResponse.statusCode} for request pricing`);
        }

        // parseLambdaPricingWithUnit returns the raw pricePerUnit.USD and the unit string.
        // Normally Lambda request pricing is per individual request (e.g. $0.0000002/request),
        // so we multiply by 1_000_000 to express requestRate as "price per million requests",
        // matching the formula: (invocations / 1_000_000) * requestRate.
        // Guard: if the API already returns a per-million price, skip the multiplier to
        // avoid a 1,000,000× overcharge.
        const { price: requestRatePerUnit, unit: requestUnit } = this.parseLambdaPricingWithUnit(requestResponse.body);
        if (requestRatePerUnit === 0) {
            throw new Error(`No request pricing found for Lambda in ${location}`);
        }
        const requestRate = requestUnit.includes('million') ? requestRatePerUnit : requestRatePerUnit * 1_000_000;

        // Get duration pricing (GB-Second)
        const durationFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AWSLambda' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'group', Value: `AWS-Lambda-Duration${architecture === 'arm64' ? '-ARM' : ''}` }
        ];

        const durationResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AWSLambda',
                Filters: durationFilters,
                MaxResults: 10
            })
        });

        if (durationResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${durationResponse.statusCode} for duration pricing`);
        }

        const durationRate = this.parseLambdaPricing(durationResponse.body);
        if (durationRate === 0) {
            throw new Error(`No duration pricing found for Lambda (${archFilter}) in ${location}`);
        }

        // Get provisioned concurrency pricing
        const provisionedFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AWSLambda' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'group', Value: `AWS-Lambda-Provisioned-Concurrency${architecture === 'arm64' ? '-ARM' : ''}` }
        ];

        const provisionedResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AWSLambda',
                Filters: provisionedFilters,
                MaxResults: 10
            })
        });

        let provisionedConcurrencyRate = 0;
        if (provisionedResponse.statusCode === 200) {
            provisionedConcurrencyRate = this.parseLambdaPricing(provisionedResponse.body);
        }

        return {
            requestRate,
            durationRate,
            provisionedConcurrencyRate,
            source: "AWS Price List API"
        };
    }

    /**
     * Parse Lambda pricing from API response
     */
    private parseLambdaPricing(responseBody: string): number {
        return this.parseLambdaPricingWithUnit(responseBody).price;
    }

    /**
     * Parse Lambda pricing and return both the price and the unit string from
     * the same price dimension.  The unit is used to detect whether the API
     * already expresses the price per-bulk-quantity (e.g. "per 1 million
     * requests") so callers can avoid applying a redundant multiplier.
     */
    private parseLambdaPricingWithUnit(responseBody: string): { price: number; unit: string } {
        try {
            const data = JSON.parse(responseBody);
            if (!data.PriceList || data.PriceList.length === 0) {
                return { price: 0, unit: '' };
            }

            for (const priceItem of data.PriceList) {
                const product = typeof priceItem === 'string' ? JSON.parse(priceItem) : priceItem;
                const terms = product.terms;
                if (!terms || !terms.OnDemand) continue;

                for (const termKey of Object.keys(terms.OnDemand)) {
                    const term = terms.OnDemand[termKey];
                    const priceDimensions = term.priceDimensions;
                    if (!priceDimensions) continue;

                    for (const dimKey of Object.keys(priceDimensions)) {
                        const dimension = priceDimensions[dimKey];
                        const pricePerUnit = dimension.pricePerUnit;
                        if (pricePerUnit && pricePerUnit.USD) {
                            const price = parseFloat(pricePerUnit.USD);
                            if (price > 0) {
                                return { price, unit: (dimension.unit || '').toLowerCase() };
                            }
                        }
                    }
                }
            }
        } catch (error) {
            cli.output(`Warning: Failed to parse Lambda pricing: ${(error as Error).message}`);
        }
        return { price: 0, unit: '' };
    }

    /**
     * Get CloudWatch metrics for Lambda function
     */
    private getCloudWatchLambdaMetrics(functionName: string): {
        invocations: number;
        totalDurationMs: number;
        errors: number;
        throttles: number;
        concurrentExecutionsMax: number;
    } | null {
        try {
            const endTime = new Date();
            const startTime = new Date();
            startTime.setDate(startTime.getDate() - 30);

            const startTimeISO = startTime.toISOString();
            const endTimeISO = endTime.toISOString();

            const url = `https://monitoring.${this.region}.amazonaws.com/`;

            // Get invocations (Sum)
            const invocations = this.getCloudWatchLambdaMetric(
                url, functionName, 'Invocations', startTimeISO, endTimeISO, 'Sum'
            ) || 0;

            // Get duration (Sum of all durations in ms)
            const totalDurationMs = this.getCloudWatchLambdaMetric(
                url, functionName, 'Duration', startTimeISO, endTimeISO, 'Sum'
            ) || 0;

            // Get errors (Sum)
            const errors = this.getCloudWatchLambdaMetric(
                url, functionName, 'Errors', startTimeISO, endTimeISO, 'Sum'
            ) || 0;

            // Get throttles (Sum)
            const throttles = this.getCloudWatchLambdaMetric(
                url, functionName, 'Throttles', startTimeISO, endTimeISO, 'Sum'
            ) || 0;

            // Get concurrent executions (Maximum)
            const concurrentExecutionsMax = this.getCloudWatchLambdaMetric(
                url, functionName, 'ConcurrentExecutions', startTimeISO, endTimeISO, 'Maximum'
            ) || 0;

            return {
                invocations,
                totalDurationMs,
                errors,
                throttles,
                concurrentExecutionsMax
            };
        } catch (error) {
            cli.output(`Warning: Failed to get CloudWatch metrics: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get a single CloudWatch metric for Lambda
     */
    private getCloudWatchLambdaMetric(
        url: string,
        functionName: string,
        metricName: string,
        startTime: string,
        endTime: string,
        statistic: string
    ): number | null {
        try {
            // Build query string manually (URLSearchParams not available)
            const params: string[] = [
                'Action=GetMetricStatistics',
                'Version=2010-08-01',
                'Namespace=AWS/Lambda',
                `MetricName=${encodeURIComponent(metricName)}`,
                `StartTime=${encodeURIComponent(startTime)}`,
                `EndTime=${encodeURIComponent(endTime)}`,
                'Period=2592000', // 30 days in seconds
                `Statistics.member.1=${statistic}`,
                `Dimensions.member.1.Name=FunctionName`,
                `Dimensions.member.1.Value=${encodeURIComponent(functionName)}`
            ];

            const queryString = params.join('&');
            const fullUrl = `${url}?${queryString}`;

            const response = aws.get(fullUrl, {
                service: 'monitoring',
                region: this.region,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (response.statusCode !== 200) {
                return null;
            }

            // Parse XML response to extract the statistic value
            const body = response.body;
            const statLower = statistic.toLowerCase();
            
            // Look for the statistic in the response
            const patterns = [
                new RegExp(`<${statistic}>([\\d.]+)</${statistic}>`),
                new RegExp(`<${statLower}>([\\d.]+)</${statLower}>`),
                /<Sum>([\d.]+)<\/Sum>/,
                /<Average>([\d.]+)<\/Average>/,
                /<Maximum>([\d.]+)<\/Maximum>/
            ];

            for (const pattern of patterns) {
                const match = body.match(pattern);
                if (match) {
                    return parseFloat(match[1]);
                }
            }

            return 0;
        } catch (_error) {
            return null;
        }
    }

    /**
     * Get provisioned concurrency configuration for the function
     */
    private getProvisionedConcurrency(functionName: string): number {
        try {
            const response = this.makeAWSRequest(
                "GET",
                `/2019-09-30/functions/${encodeURIComponent(functionName)}/provisioned-concurrency?List=ALL`
            );

            if (response && typeof response === 'object') {
                const configs = (response as any).ProvisionedConcurrencyConfigs;
                if (configs && Array.isArray(configs)) {
                    // Sum up all provisioned concurrency across versions/aliases
                    let total = 0;
                    for (const config of configs) {
                        total += config.RequestedProvisionedConcurrentExecutions || 0;
                    }
                    return total;
                }
            }
            return 0;
        } catch (_error) {
            return 0;
        }
    }

    /**
     * Map AWS region codes to location names for Pricing API
     */
    private getRegionToLocationMap(): Record<string, string> {
        return {
            'us-east-1': 'US East (N. Virginia)',
            'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)',
            'us-west-2': 'US West (Oregon)',
            'af-south-1': 'Africa (Cape Town)',
            'ap-east-1': 'Asia Pacific (Hong Kong)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-south-2': 'Asia Pacific (Hyderabad)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'ap-southeast-2': 'Asia Pacific (Sydney)',
            'ap-southeast-3': 'Asia Pacific (Jakarta)',
            'ap-southeast-4': 'Asia Pacific (Melbourne)',
            'ap-northeast-1': 'Asia Pacific (Tokyo)',
            'ap-northeast-2': 'Asia Pacific (Seoul)',
            'ap-northeast-3': 'Asia Pacific (Osaka)',
            'ca-central-1': 'Canada (Central)',
            'eu-central-1': 'EU (Frankfurt)',
            'eu-central-2': 'EU (Zurich)',
            'eu-west-1': 'EU (Ireland)',
            'eu-west-2': 'EU (London)',
            'eu-west-3': 'EU (Paris)',
            'eu-south-1': 'EU (Milan)',
            'eu-south-2': 'EU (Spain)',
            'eu-north-1': 'EU (Stockholm)',
            'il-central-1': 'Israel (Tel Aviv)',
            'me-south-1': 'Middle East (Bahrain)',
            'me-central-1': 'Middle East (UAE)',
            'sa-east-1': 'South America (Sao Paulo)'
        };
    }
} 