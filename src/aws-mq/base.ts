import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

export interface AWSMQDefinition {
    /** @description AWS region for the MQ broker */
    region: string;
    /** @description Broker name (1-50 chars, alphanumeric and hyphens only) */
    broker_name: string;
    /** @description The type of broker engine (ACTIVEMQ or RABBITMQ) */
    engine_type: "ACTIVEMQ" | "RABBITMQ";
    /** @description Engine version to use */
    engine_version?: string;
    /** @description The broker's instance type (e.g., mq.t3.micro) */
    host_instance_type: string;
    /** @description Deployment mode (SINGLE_INSTANCE, ACTIVE_STANDBY_MULTI_AZ, CLUSTER_MULTI_AZ) */
    deployment_mode?: "SINGLE_INSTANCE" | "ACTIVE_STANDBY_MULTI_AZ" | "CLUSTER_MULTI_AZ";
    /** @description Whether the broker should be publicly accessible */
    publicly_accessible?: boolean;
    /** @description List of subnet IDs for the broker */
    subnet_ids?: string[];
    /** @description List of security group IDs */
    security_groups?: string[];
    /** @description Enable automatic minor version upgrades */
    auto_minor_version_upgrade?: boolean;
    /** @description Maintenance window for updates (ddd:hh24:mi-ddd:hh24:mi) */
    maintenance_window_start_time?: string;
    /** @description Storage type for brokers that support it */
    storage_type?: "EBS" | "EFS";
    /** @description Whether to enable general logging */
    enable_general_logging?: boolean;
    /** @description Whether to enable audit logging */
    enable_audit_logging?: boolean;
    /** @description List of broker users */
    users?: Array<{
        username: string;
        password_secret_ref?: string;
        console_access?: boolean;
        groups?: string[];
    }>;
    /** @description LDAP authentication configuration */
    ldap_authentication?: {
        host: string;
        port?: number;
        user_base: string;
        role_base?: string;
        service_account_username?: string;
        service_account_password_secret_ref?: string;
    };
    /** @description Configuration for the broker */
    configuration?: {
        id?: string;
        revision?: number;
        data?: string;
    };
    /** @description Encryption options */
    encryption_options?: {
        use_aws_owned_key?: boolean;
        kms_key_id?: string;
    };
    /** @description Resource tags */
    tags?: Record<string, string>;
}

export interface AWSMQState {
    /** @description Indicates if the broker pre-existed before this entity managed it */
    existing: boolean;
    /** @description Broker ID assigned by AWS */
    broker_id?: string;
    /** @description Broker ARN */
    broker_arn?: string;
    /** @description Current broker state (CREATION_IN_PROGRESS, RUNNING, DELETION_IN_PROGRESS, etc.) */
    broker_state?: string;
    /** @description Creation timestamp */
    created?: string;
    /** @description Last modified timestamp */
    last_modified?: string;
    /** @description Broker endpoints for connections */
    endpoints?: Array<{
        protocol: string;
        endpoint: string;
        port: number;
    }>;
    /** @description Web console URL */
    web_console_url?: string;
}

export interface MQResponse {
    BrokerId?: string;
    BrokerArn?: string;
    BrokerName?: string;
    BrokerState?: string;
    Created?: string;
    DeploymentMode?: string;
    EngineType?: string;
    EngineVersion?: string;
    HostInstanceType?: string;
    PubliclyAccessible?: boolean;
    SecurityGroups?: string[];
    SubnetIds?: string[];
    MaintenanceWindowStartTime?: string;
    AutoMinorVersionUpgrade?: boolean;
    StorageType?: string;
    BrokerInstances?: Array<{
        ConsoleURL?: string;
        Endpoints?: string[];
        IpAddress?: string;
    }>;
    Configurations?: {
        Current?: {
            Id?: string;
            Revision?: number;
        };
        History?: Array<{
            Id?: string;
            Revision?: number;
        }>;
        Pending?: {
            Id?: string;
            Revision?: number;
        };
    };
    EncryptionOptions?: {
        UseAwsOwnedKey?: boolean;
        KmsKeyId?: string;
    };
    LdapServerMetadata?: {
        Hosts?: string[];
        RoleBase?: string;
        RoleName?: string;
        RoleSearchMatching?: string;
        RoleSearchSubtree?: boolean;
        ServiceAccountUsername?: string;
        UserBase?: string;
        UserRoleName?: string;
        UserSearchMatching?: string;
        UserSearchSubtree?: boolean;
    };
    Logs?: {
        Audit?: boolean;
        General?: boolean;
    };
    Tags?: Record<string, string>;
    Users?: Array<{
        PendingChange?: string;
        Username?: string;
    }>;
    // For list brokers response (AWS uses camelCase)
    brokerSummaries?: Array<{
        brokerArn?: string;
        brokerId?: string;
        brokerName?: string;
        brokerState?: string;
        created?: string;
        deploymentMode?: string;
        engineType?: string;
        hostInstanceType?: string;
    }>;
}

export interface MQErrorResponse {
    message?: string;
    __type?: string;
}

export abstract class AWSMQEntity<
    TDefinition extends AWSMQDefinition,
    TState extends AWSMQState
> extends MonkEntity<TDefinition, TState> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    protected abstract getBrokerName(): string;

    protected makeMQRequest(method: string, path: string, body?: any): MQResponse {
        const url = `https://mq.${this.region}.amazonaws.com${path}`;
        
        // Debug logging removed for production
        
        const requestOptions: any = {
            method: method,
            url: url,
            service: 'mq',
            region: this.region,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        if (body) {
            requestOptions.body = JSON.stringify(body);
        }

        const response = method === 'GET'
            ? aws.get(url, { service: 'mq', region: this.region, headers: { 'Content-Type': 'application/json' } })
            : aws.post(url, { service: 'mq', region: this.region, headers: { 'Content-Type': 'application/json' }, body: requestOptions.body as string });

        // Debug logging removed for production

        if (response.statusCode >= 400) {
            let errorMessage = `AWS MQ API error: ${response.statusCode} ${response.status}`;
            
            try {
                const errorBody = JSON.parse(response.body);
                if (errorBody.message) {
                    errorMessage += ` - ${errorBody.message}`;
                }
                if (errorBody.__type) {
                    errorMessage += ` (${errorBody.__type})`;
                }
                
                // Add specific permission guidance for common errors
                if (response.statusCode === 403) {
                    errorMessage += `

Required AWS IAM permissions for MQ operations:
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "mq:CreateBroker",
                "mq:DeleteBroker",
                "mq:DescribeBroker",
                "mq:ListBrokers",
                "mq:ModifyBroker",
                "mq:RebootBroker",
                "mq:CreateTags",
                "mq:DeleteTags",
                "mq:ListTags"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ec2:DescribeVpcs",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups"
            ],
            "Resource": "*"
        }
    ]
}`;
                }
            } catch (_parseError) {
                errorMessage += ` - Raw: ${response.body}`;
            }
            throw new Error(errorMessage);
        }

        // Parse JSON response
        try {
            return response.body ? JSON.parse(response.body) : {};
        } catch (parseError) {
            throw new Error(`Failed to parse MQ API response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }
    }

    protected checkBrokerExists(brokerId: string): MQResponse | null {
        try {
            return this.makeMQRequest('GET', `/v1/brokers/${encodeURIComponent(brokerId)}`);
        } catch (error) {
            // Broker doesn't exist if we get a NotFoundException
            if (error instanceof Error && (error.message.includes('NotFoundException') || error.message.includes('404'))) {
                return null;
            }
            throw error;
        }
    }

    protected createBroker(params: any): MQResponse {
        return this.makeMQRequest('POST', '/v1/brokers', params);
    }

    protected updateBroker(brokerId: string, params: any): MQResponse {
        return this.makeMQRequest('PUT', `/v1/brokers/${encodeURIComponent(brokerId)}`, params);
    }

    protected deleteBroker(brokerId: string): void {
        this.makeMQRequest('DELETE', `/v1/brokers/${encodeURIComponent(brokerId)}`);
    }

    protected rebootBroker(brokerId: string): void {
        this.makeMQRequest('POST', `/v1/brokers/${encodeURIComponent(brokerId)}/reboot`);
    }

    protected listBrokers(): MQResponse {
        return this.makeMQRequest('GET', '/v1/brokers');
    }

    protected findBrokerByName(brokerName: string): MQResponse | null {
        try {
            const response = this.listBrokers();
            if (response && response.brokerSummaries) {
                const broker = response.brokerSummaries.find((b: any) => b.brokerName === brokerName);
                if (broker && broker.brokerId) {
                    // Get full broker details
                    return this.checkBrokerExists(broker.brokerId);
                }
            }
            return null;
        } catch (error) {
            // Silently handle errors - broker may not be accessible via listBrokers
            return null;
        }
    }

    protected waitForBrokerState(brokerId: string, targetState: string, maxAttempts: number = 60): boolean {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = this.checkBrokerExists(brokerId);
                if (response?.BrokerState === targetState) {
                    return true;
                }
                
                if (response?.BrokerState === 'DELETION_FAILED' || response?.BrokerState === 'CREATION_FAILED') {
                    throw new Error(`Broker ${brokerId} is in failed state: ${response.BrokerState}`);
                }

                // Wait 30 seconds before next attempt
                const start = Date.now();
                while (Date.now() - start < 30000) {
                    // Simple busy wait
                }
            } catch (error) {
                if (attempt === maxAttempts - 1) {
                    throw error;
                }
            }
        }
        
        return false;
    }

    protected waitForBrokerDeletion(brokerId: string, maxAttempts: number = 40): boolean {
        // Waiting for MQ broker deletion silently
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = this.checkBrokerExists(brokerId);
                
                // If broker doesn't exist, deletion is complete
                if (!response) {
                    console.log(`MQ broker ${brokerId} has been successfully deleted`);
                    return true;
                }
                
                const state = response.BrokerState;
                // MQ broker deletion in progress
                
                // If still deleting, continue waiting
                if (state === 'DELETION_IN_PROGRESS') {
                    // Wait 30 seconds before next attempt
                    const start = Date.now();
                    while (Date.now() - start < 30000) {
                        // Simple busy wait
                    }
                    continue;
                }
                
                // If in any other state, something went wrong
                throw new Error(`MQ broker ${brokerId} is in unexpected state: ${state}`);
                
            } catch (error) {
                // If we get a "NotFoundException" or 404, that means deletion is complete
                if (error instanceof Error && (error.message.includes('NotFoundException') || error.message.includes('404'))) {
                    // MQ broker deleted successfully
                    return true;
                }
                
                // For other errors, only throw on final attempt
                if (attempt === maxAttempts - 1) {
                    throw new Error(`Failed to confirm MQ broker deletion: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
                
                // Wait before retrying
                const start = Date.now();
                while (Date.now() - start < 30000) {
                    // Simple busy wait
                }
            }
        }
        
        return false;
    }

    protected getDefaultEngineVersion(_engineType: string): string {
        const defaultVersions: Record<string, string> = {
            'ACTIVEMQ': '5.17.6',
            'RABBITMQ': '3.11.20'
        };
        
        return defaultVersions[_engineType] || '5.17.6';
    }

    protected getDefaultDeploymentMode(_engineType: string): string {
        // For most use cases, SINGLE_INSTANCE is sufficient and cost-effective
        return 'SINGLE_INSTANCE';
    }

    protected validateBrokerName(name: string): boolean {
        // AWS MQ broker name constraints:
        // - Must be 1-50 characters
        // - Alphanumeric characters and hyphens only
        // - Cannot start or end with hyphen
        if (!name || name.length < 1 || name.length > 50) {
            return false;
        }
        
        if (name.startsWith('-') || name.endsWith('-')) {
            return false;
        }
        
        return /^[a-zA-Z0-9-]+$/.test(name);
    }
} 
