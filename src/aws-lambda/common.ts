/**
 * Common utilities and constants for AWS Lambda entities
 */

// Supported Lambda runtimes
export const LAMBDA_RUNTIMES = {
    // Node.js runtimes
    NODEJS_18_X: "nodejs18.x",
    NODEJS_20_X: "nodejs20.x",
    
    // Python runtimes
    PYTHON_3_8: "python3.8",
    PYTHON_3_9: "python3.9",
    PYTHON_3_10: "python3.10",
    PYTHON_3_11: "python3.11",
    PYTHON_3_12: "python3.12",
    
    // Java runtimes
    JAVA_8: "java8",
    JAVA_8_AL2: "java8.al2",
    JAVA_11: "java11",
    JAVA_17: "java17",
    JAVA_21: "java21",
    
    // .NET runtimes
    DOTNET_6: "dotnet6",
    DOTNET_8: "dotnet8",
    
    // Go runtime
    GO_1_X: "go1.x",
    
    // Ruby runtimes
    RUBY_2_7: "ruby2.7",
    RUBY_3_2: "ruby3.2",
    
    // Custom runtime
    PROVIDED: "provided",
    PROVIDED_AL2: "provided.al2",
    PROVIDED_AL2023: "provided.al2023",
} as const;

// Lambda invocation types
export const INVOCATION_TYPES = {
    REQUEST_RESPONSE: "RequestResponse",
    EVENT: "Event",
    DRY_RUN: "DryRun",
} as const;

// Lambda function states
export const FUNCTION_STATES = {
    PENDING: "Pending",
    ACTIVE: "Active",
    INACTIVE: "Inactive",
    FAILED: "Failed",
} as const;

// Lambda update statuses
export const UPDATE_STATUSES = {
    SUCCESSFUL: "Successful",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
} as const;

// Lambda package types
export const PACKAGE_TYPES = {
    ZIP: "Zip",
    IMAGE: "Image",
} as const;

// Lambda architectures
export const ARCHITECTURES = {
    X86_64: "x86_64",
    ARM64: "arm64",
} as const;

// Lambda tracing modes
export const TRACING_MODES = {
    ACTIVE: "Active",
    PASS_THROUGH: "PassThrough",
} as const;

// Lambda log formats
export const LOG_FORMATS = {
    JSON: "JSON",
    TEXT: "Text",
} as const;

// Lambda log levels
export const LOG_LEVELS = {
    TRACE: "TRACE",
    DEBUG: "DEBUG",
    INFO: "INFO",
    WARN: "WARN",
    ERROR: "ERROR",
    FATAL: "FATAL",
} as const;

// SnapStart apply options
export const SNAP_START_APPLY_OPTIONS = {
    PUBLISHED_VERSIONS: "PublishedVersions",
    NONE: "None",
} as const;

// Default values
export const DEFAULTS = {
    TIMEOUT: 3,
    MEMORY_SIZE: 128,
    PACKAGE_TYPE: PACKAGE_TYPES.ZIP,
    ARCHITECTURE: ARCHITECTURES.X86_64,
    TRACING_MODE: TRACING_MODES.PASS_THROUGH,
    LOG_FORMAT: LOG_FORMATS.TEXT,
    EPHEMERAL_STORAGE_SIZE: 512,
} as const;

// Validation constraints
export const CONSTRAINTS = {
    FUNCTION_NAME: {
        MIN_LENGTH: 1,
        MAX_LENGTH: 64,
        PATTERN: /^[a-zA-Z0-9-_]+$/,
    },
    DESCRIPTION: {
        MAX_LENGTH: 256,
    },
    TIMEOUT: {
        MIN: 1,
        MAX: 900, // 15 minutes
    },
    MEMORY_SIZE: {
        MIN: 128,
        MAX: 10240, // 10 GB
        STEP: 1,
    },
    ZIP_FILE_SIZE: {
        MAX: 50 * 1024 * 1024, // 50 MB
    },
    UNCOMPRESSED_CODE_SIZE: {
        MAX: 250 * 1024 * 1024, // 250 MB
    },
    LAYERS: {
        MAX_COUNT: 5,
    },
    ENVIRONMENT_VARIABLES: {
        MAX_COUNT: 100,
        MAX_TOTAL_SIZE: 4096, // 4 KB
    },
    EPHEMERAL_STORAGE: {
        MIN: 512,
        MAX: 10240, // 10 GB
    },
} as const;

// AWS Lambda service endpoints by region
export const LAMBDA_ENDPOINTS = {
    "us-east-1": "lambda.us-east-1.amazonaws.com",
    "us-east-2": "lambda.us-east-2.amazonaws.com",
    "us-west-1": "lambda.us-west-1.amazonaws.com",
    "us-west-2": "lambda.us-west-2.amazonaws.com",
    "eu-west-1": "lambda.eu-west-1.amazonaws.com",
    "eu-west-2": "lambda.eu-west-2.amazonaws.com",
    "eu-west-3": "lambda.eu-west-3.amazonaws.com",
    "eu-central-1": "lambda.eu-central-1.amazonaws.com",
    "eu-north-1": "lambda.eu-north-1.amazonaws.com",
    "ap-south-1": "lambda.ap-south-1.amazonaws.com",
    "ap-southeast-1": "lambda.ap-southeast-1.amazonaws.com",
    "ap-southeast-2": "lambda.ap-southeast-2.amazonaws.com",
    "ap-northeast-1": "lambda.ap-northeast-1.amazonaws.com",
    "ap-northeast-2": "lambda.ap-northeast-2.amazonaws.com",
    "ca-central-1": "lambda.ca-central-1.amazonaws.com",
    "sa-east-1": "lambda.sa-east-1.amazonaws.com",
} as const;

/**
 * Utility functions for AWS Lambda
 */
export class LambdaUtils {
    
    /**
     * Validates Lambda function name
     */
    static validateFunctionName(name: string): boolean {
        if (!name || name.length < CONSTRAINTS.FUNCTION_NAME.MIN_LENGTH || name.length > CONSTRAINTS.FUNCTION_NAME.MAX_LENGTH) {
            return false;
        }
        return CONSTRAINTS.FUNCTION_NAME.PATTERN.test(name);
    }

    /**
     * Validates memory size value
     */
    static validateMemorySize(memorySize: number): boolean {
        return memorySize >= CONSTRAINTS.MEMORY_SIZE.MIN && 
               memorySize <= CONSTRAINTS.MEMORY_SIZE.MAX &&
               memorySize % CONSTRAINTS.MEMORY_SIZE.STEP === 0;
    }

    /**
     * Validates timeout value
     */
    static validateTimeout(timeout: number): boolean {
        return timeout >= CONSTRAINTS.TIMEOUT.MIN && timeout <= CONSTRAINTS.TIMEOUT.MAX;
    }

    /**
     * Validates ephemeral storage size
     */
    static validateEphemeralStorageSize(size: number): boolean {
        return size >= CONSTRAINTS.EPHEMERAL_STORAGE.MIN && size <= CONSTRAINTS.EPHEMERAL_STORAGE.MAX;
    }

    /**
     * Checks if runtime is supported
     */
    static isValidRuntime(runtime: string): boolean {
        return Object.values(LAMBDA_RUNTIMES).includes(runtime as any);
    }

    /**
     * Checks if architecture is supported
     */
    static isValidArchitecture(architecture: string): boolean {
        return Object.values(ARCHITECTURES).includes(architecture as any);
    }

    /**
     * Gets Lambda service endpoint for region
     */
    static getLambdaEndpoint(region: string): string {
        return LAMBDA_ENDPOINTS[region as keyof typeof LAMBDA_ENDPOINTS] || `lambda.${region}.amazonaws.com`;
    }

    /**
     * Formats environment variables for Lambda API
     */
    static formatEnvironmentVariables(variables: Record<string, string>): Record<string, string> {
        const formatted: Record<string, string> = {};
        
        for (const [key, value] of Object.entries(variables)) {
            // Ensure environment variable names are valid
            if (key && typeof value === 'string') {
                formatted[key] = value;
            }
        }
        
        return formatted;
    }

    /**
     * Calculates total size of environment variables
     */
    static getEnvironmentVariablesSize(variables: Record<string, string>): number {
        let totalSize = 0;
        
        for (const [key, value] of Object.entries(variables)) {
            totalSize += key.length + value.length;
        }
        
        return totalSize;
    }

    /**
     * Validates environment variables
     */
    static validateEnvironmentVariables(variables: Record<string, string>): { valid: boolean; error?: string } {
        const count = Object.keys(variables).length;
        
        if (count > CONSTRAINTS.ENVIRONMENT_VARIABLES.MAX_COUNT) {
            return { 
                valid: false, 
                error: `Too many environment variables: ${count}. Maximum allowed: ${CONSTRAINTS.ENVIRONMENT_VARIABLES.MAX_COUNT}` 
            };
        }
        
        const totalSize = LambdaUtils.getEnvironmentVariablesSize(variables);
        if (totalSize > CONSTRAINTS.ENVIRONMENT_VARIABLES.MAX_TOTAL_SIZE) {
            return { 
                valid: false, 
                error: `Environment variables total size: ${totalSize} bytes. Maximum allowed: ${CONSTRAINTS.ENVIRONMENT_VARIABLES.MAX_TOTAL_SIZE} bytes` 
            };
        }
        
        return { valid: true };
    }

    /**
     * Generates CloudWatch log group name for Lambda function
     */
    static getLogGroupName(functionName: string): string {
        return `/aws/lambda/${functionName}`;
    }

    /**
     * Encodes binary data for Lambda payload
     */
    static encodeBinaryData(data: string): string {
        // In a real implementation, this would handle base64 encoding
        // For now, just return the data as-is
        return data;
    }

    /**
     * Parses error response from Lambda API
     */
    static parseApiError(response: { statusCode: number; body: string }): string {
        try {
            const errorBody = JSON.parse(response.body);
            return errorBody.message || errorBody.errorMessage || `API Error: ${response.statusCode}`;
        } catch {
            return `API Error: ${response.statusCode} - ${response.body}`;
        }
    }
} 