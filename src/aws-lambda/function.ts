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
    function_name: string;
    runtime: string;
    role: string;
    handler: string;
    summary?: string;
    timeout?: number;
    memory_size?: number;
    environment?: {
        variables?: Record<string, string>;
    };
    dead_letter_config?: {
        target_arn?: string;
    };
    kms_key_arn?: string;
    tracing_config?: {
        mode?: string;
    };
    tags?: Record<string, string>;
    layers?: string[];
    file_system_configs?: Array<{
        arn: string;
        local_mount_path: string;
    }>;
    image_config?: {
        entry_point?: string[];
        command?: string[];
        working_directory?: string;
    };
    code_signing_config_arn?: string;
    architectures?: string[];
    ephemeral_storage?: {
        size?: number;
    };
    snap_start?: {
        apply_on?: string;
    };
    logging_config?: {
        log_format?: string;
        application_log_level?: string;
        system_log_level?: string;
        log_group?: string;
    };
    package_type?: string;
    publish?: boolean;
}

export interface LambdaFunctionState extends AWSLambdaState {
    runtime?: string;
    role?: string;
    handler?: string;
    timeout?: number;
    memory_size?: number;
    code_size?: number;
    version?: string;
    last_update_status?: string;
    revision_id?: string;
}

export class LambdaFunction extends AWSLambdaEntity<LambdaFunctionDefinition, LambdaFunctionState> {
    
    // Customize readiness check parameters
    static readonly readiness = { period: 10, initialDelay: 5, attempts: 30 };

    protected getFunctionName(): string {
        return this.definition.function_name;
    }

    private buildCreateFunctionRequest(): CreateFunctionRequest {
        // Get ZIP content from blob
        const zipContent = this.getLambdaZipFromBlob();

        const request: CreateFunctionRequest = {
            FunctionName: this.definition.function_name,
            Runtime: this.definition.runtime,
            Role: this.definition.role,
            Handler: this.definition.handler,
            Code: {
                ZipFile: zipContent,
            },
            PackageType: this.definition.package_type || "Zip",
            Publish: this.definition.publish || false,
        };

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
        const config: Partial<LambdaFunctionConfig> = {
            FunctionName: this.definition.function_name,
        };

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
        cli.output(`Creating Lambda function: ${this.definition.function_name}`);

        // Check if function already exists
        cli.output(`Checking if function exists...`);
        const existingFunction = this.checkFunctionExists(this.definition.function_name);
        
        if (existingFunction) {
            cli.output(`Lambda function ${this.definition.function_name} already exists, marking as existing`);
            this.updateStateFromResponse(existingFunction);
            this.state.existing = true;
            return;
        }

        cli.output(`Function doesn't exist, proceeding to create...`);
        
        // Create new function
        cli.output(`Building create function request...`);
        const createRequest = this.buildCreateFunctionRequest();
        cli.output(`Create request built successfully`);
        
        try {
            cli.output(`Making POST request to create function...`);
            const response = this.makeAWSRequest("POST", "/2015-03-31/functions", createRequest);
            cli.output(`Successfully created Lambda function: ${this.definition.function_name}`);
            
            this.updateStateFromResponse(response);
            this.state.existing = false;
        } catch (error) {
            cli.output(`Error during function creation: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw new Error(`Failed to create Lambda function ${this.definition.function_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    override update(): void {
        if (!this.state.function_name) {
            cli.output("Function does not exist, creating instead");
            this.create();
            return;
        }

        cli.output(`Updating Lambda function: ${this.definition.function_name}`);

        try {
            // Update function code from blob
            const zipContent = this.getLambdaZipFromBlob();
            const updateCodeRequest = {
                ZipFile: zipContent,
            };
            
            this.makeAWSRequest(
                "PUT", 
                `/2015-03-31/functions/${encodeURIComponent(this.definition.function_name)}/code`,
                updateCodeRequest
            );
            
            cli.output("Updated Lambda function code");

            // Wait for function to be active and update to complete before updating configuration
            cli.output("Waiting for function to be ready for configuration update...");
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
                        cli.output(`Received 409 conflict (attempt ${attempt + 1}/${maxRetries}), retrying in 10 seconds...`);
                        
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
            
            cli.output("Updated Lambda function configuration");
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
            console.log(`Function exists: ${JSON.stringify(response)}`);

            // Function is ready when it's Active and last update was successful
            // Access properties from the Configuration object in the response
            const config = (response as any).Configuration || response; // Use type assertion to handle nested structure
            const isActive = config.State === "Active";
            const updateSuccessful = config.LastUpdateStatus === "Successful";
            
            if (isActive && updateSuccessful) {
                this.updateStateFromResponse(response);
                console.log(`FUNTION STATE: ${config.State}, Last update status: ${config.LastUpdateStatus}`);
                return true;
            }

            // Log current state for debugging
            console.log(`Function state: ${config.State}, Last update status: ${config.LastUpdateStatus}`);
            return false;
        } catch (error) {
            console.log(`Error checking readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

        cli.output(`Invoking Lambda function: ${this.definition.function_name}`);

        try {
            const response = this.makeAWSRequest(
                "POST",
                `/2015-03-31/functions/${encodeURIComponent(this.definition.function_name)}/invocations?InvocationType=${invocationType}`,
                payload
            );

            cli.output(`Function invoked successfully`);
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

        cli.output(`Updating Lambda function code: ${this.definition.function_name}`);

        try {
            const zipContent = this.getLambdaZipFromBlob();
            const updateCodeRequest = {
                ZipFile: zipContent,
            };
            
            const response = this.makeAWSRequest(
                "PUT", 
                `/2015-03-31/functions/${encodeURIComponent(this.definition.function_name)}/code`,
                updateCodeRequest
            );
            
            cli.output("Successfully updated Lambda function code");
            this.updateStateFromResponse(response);
        } catch (error) {
            throw new Error(`Failed to update function code: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
} 