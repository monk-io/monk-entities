import secret from "secret";

/**
 * Validates a broker name according to AWS MQ naming rules
 */
export function validateBrokerName(name: string): boolean {
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

/**
 * Validates engine type
 */
export function validateEngineType(engineType: string): boolean {
    return ['ACTIVEMQ', 'RABBITMQ'].includes(engineType);
}

/**
 * Validates deployment mode for the given engine type
 */
export function validateDeploymentMode(_engineType: string, _deploymentMode: string): boolean {
    const validModes: Record<string, string[]> = {
        'ACTIVEMQ': ['SINGLE_INSTANCE', 'ACTIVE_STANDBY_MULTI_AZ'],
        'RABBITMQ': ['SINGLE_INSTANCE', 'CLUSTER_MULTI_AZ']
    };
    
    return validModes[_engineType]?.includes(_deploymentMode) || false;
}

/**
 * Gets default engine version for the given engine type
 */
export function getDefaultEngineVersion(engineType: string): string {
    const defaultVersions: Record<string, string> = {
        'ACTIVEMQ': '5.18',
        'RABBITMQ': '3.11.20'
    };
    
    return defaultVersions[engineType] || '5.18';
}

/**
 * Gets default deployment mode for the given engine type
 */
export function getDefaultDeploymentMode(_engineType: string): string {
    return 'SINGLE_INSTANCE';
}

/**
 * Gets or creates a password for a user
 */
export function getOrCreateUserPassword(username: string, secretRef?: string): string {
    const actualSecretRef = secretRef || `mq-user-${username}-password`;
    
    try {
        const storedPassword = secret.get(actualSecretRef);
        if (!storedPassword) {
            throw new Error("Password not found");
        }
        return storedPassword;
    } catch (_e) {
        // Generate a secure random password (16 characters)
        const password = secret.randString(16);
        secret.set(actualSecretRef, password);
        return password;
    }
}

/**
 * Builds create broker parameters from definition
 */
export function buildCreateBrokerParams(definition: any): any {
    if (!validateBrokerName(definition.broker_name)) {
        throw new Error(`Invalid broker name: ${definition.broker_name}. Must be 1-50 alphanumeric characters or hyphens, cannot start/end with hyphen.`);
    }
    
    if (!validateEngineType(definition.engine_type)) {
        throw new Error(`Invalid engine type: ${definition.engine_type}. Must be ACTIVEMQ or RABBITMQ.`);
    }
    
    const params: any = {
        brokerName: definition.broker_name,
        engineType: definition.engine_type === 'ACTIVEMQ' ? 'ActiveMQ' : definition.engine_type,
        hostInstanceType: definition.host_instance_type
    };
    
    // Set engine version
    params.engineVersion = definition.engine_version || getDefaultEngineVersion(definition.engine_type);
    
    // Set deployment mode
    const deploymentMode = definition.deployment_mode || getDefaultDeploymentMode(definition.engine_type);
    if (!validateDeploymentMode(definition.engine_type, deploymentMode)) {
        throw new Error(`Invalid deployment mode ${deploymentMode} for engine type ${definition.engine_type}`);
    }
    params.deploymentMode = deploymentMode;
    
    // Optional parameters
    if (definition.publicly_accessible !== undefined) {
        params.publiclyAccessible = definition.publicly_accessible;
    }
    
    if (definition.subnet_ids && definition.subnet_ids.length > 0) {
        params.subnetIds = definition.subnet_ids;
    }
    
    if (definition.security_groups && definition.security_groups.length > 0) {
        params.securityGroups = definition.security_groups;
    }
    
    if (definition.auto_minor_version_upgrade !== undefined) {
        params.autoMinorVersionUpgrade = definition.auto_minor_version_upgrade;
    }
    
    if (definition.maintenance_window_start_time) {
        params.maintenanceWindowStartTime = {
            dayOfWeek: definition.maintenance_window_start_time.split(':')[0],
            timeOfDay: definition.maintenance_window_start_time.split(':').slice(1).join(':'),
            timeZone: 'UTC'
        };
    }
    
    if (definition.storage_type) {
        params.storageType = definition.storage_type;
    }
    
    // Logging configuration
    if (definition.enable_general_logging !== undefined || definition.enable_audit_logging !== undefined) {
        params.logs = {};
        if (definition.enable_general_logging !== undefined) {
            params.logs.general = definition.enable_general_logging;
        }
        if (definition.enable_audit_logging !== undefined) {
            params.logs.audit = definition.enable_audit_logging;
        }
    }
    
    // User configuration
    if (definition.users && definition.users.length > 0) {
        params.users = definition.users.map((user: any) => {
            const userConfig: any = {
                username: user.username,
                password: getOrCreateUserPassword(user.username, user.password_secret_ref)
            };
            
            if (user.console_access !== undefined) {
                userConfig.consoleAccess = user.console_access;
            }
            
            if (user.groups && user.groups.length > 0) {
                userConfig.groups = user.groups;
            }
            
            return userConfig;
        });
    }
    
    // LDAP authentication
    if (definition.ldap_authentication) {
        const ldap = definition.ldap_authentication;
        params.ldapServerMetadata = {
            hosts: [ldap.host],
            userBase: ldap.user_base
        };
        
        if (ldap.port) {
            params.ldapServerMetadata.hosts = [`${ldap.host}:${ldap.port}`];
        }
        
        if (ldap.role_base) {
            params.ldapServerMetadata.roleBase = ldap.role_base;
        }
        
        if (ldap.service_account_username) {
            params.ldapServerMetadata.serviceAccountUsername = ldap.service_account_username;
            if (ldap.service_account_password_secret_ref) {
                params.ldapServerMetadata.serviceAccountPassword = secret.get(ldap.service_account_password_secret_ref);
            }
        }
    }
    
    // Configuration
    if (definition.configuration && definition.configuration.id) {
        params.configuration = {
            id: definition.configuration.id
        };
        
        if (definition.configuration.revision) {
            params.configuration.revision = definition.configuration.revision;
        }
    }
    
    // Encryption options
    if (definition.encryption_options) {
        params.encryptionOptions = {};
        
        if (definition.encryption_options.use_aws_owned_key !== undefined) {
            params.encryptionOptions.useAwsOwnedKey = definition.encryption_options.use_aws_owned_key;
        }
        
        if (definition.encryption_options.kms_key_id) {
            params.encryptionOptions.kmsKeyId = definition.encryption_options.kms_key_id;
        }
    }
    
    // Tags
    if (definition.tags && Object.keys(definition.tags).length > 0) {
        params.tags = definition.tags;
    }
    
    return params;
}

/**
 * Builds update broker parameters from definition
 */
export function buildUpdateBrokerParams(definition: any): any {
    const params: any = {};
    
    // Only include fields that can be updated
    if (definition.auto_minor_version_upgrade !== undefined) {
        params.autoMinorVersionUpgrade = definition.auto_minor_version_upgrade;
    }
    
    if (definition.maintenance_window_start_time) {
        params.maintenanceWindowStartTime = {
            dayOfWeek: definition.maintenance_window_start_time.split(':')[0],
            timeOfDay: definition.maintenance_window_start_time.split(':').slice(1).join(':'),
            timeZone: 'UTC'
        };
    }
    
    // Logging configuration updates
    if (definition.enable_general_logging !== undefined || definition.enable_audit_logging !== undefined) {
        params.logs = {};
        if (definition.enable_general_logging !== undefined) {
            params.logs.general = definition.enable_general_logging;
        }
        if (definition.enable_audit_logging !== undefined) {
            params.logs.audit = definition.enable_audit_logging;
        }
    }
    
    // Security group updates
    if (definition.security_groups && definition.security_groups.length > 0) {
        params.securityGroups = definition.security_groups;
    }
    
    return params;
}

/**
 * Formats MQ API response data for state storage
 * @param broker - MQ broker data from AWS API
 * @param wasPreExisting - true if broker existed before entity creation
 */
export function formatBrokerState(broker: any, wasPreExisting: boolean = false): any {
    const endpoints: string[] = [];
    
    // Parse broker instances for endpoints (AWS API uses camelCase)
    const instances = broker.brokerInstances || broker.BrokerInstances; // Handle both casings
    if (instances && Array.isArray(instances) && instances.length > 0) {
        instances.forEach((instance: any) => {
            const endpointList = instance.endpoints || instance.Endpoints; // Handle both casings
            if (endpointList && Array.isArray(endpointList)) {
                // Store endpoints as simple strings for cleaner state representation
                endpoints.push(...endpointList);
            }
        });
    }
    
    return {
        existing: wasPreExisting, // true = don't delete (pre-existing), false = we created it (can delete)
        broker_id: broker.brokerId || broker.BrokerId, // Handle both casing (prefer camelCase first)
        broker_arn: broker.brokerArn || broker.BrokerArn, // Handle both casing
        broker_state: broker.brokerState || broker.BrokerState, // Handle both casing
        created: broker.created || broker.Created, // Handle both casing
        last_modified: broker.lastModified || broker.Modified, // Handle both casing
        endpoints: endpoints,
        web_console_url: instances?.[0]?.consoleURL || instances?.[0]?.ConsoleURL // Handle both casings
    };
}

/**
 * Validates instance type for the given engine type
 */
export function validateInstanceType(engineType: string, instanceType: string): boolean {
    // Common valid instance types for MQ brokers
    const validTypes = [
        'mq.t3.micro', 'mq.t3.small', 'mq.t3.medium', 'mq.t3.large',
        'mq.m5.large', 'mq.m5.xlarge', 'mq.m5.2xlarge', 'mq.m5.4xlarge',
        'mq.m5.12xlarge', 'mq.m5.24xlarge'
    ];
    
    // RabbitMQ has some additional instance types
    if (engineType === 'RABBITMQ') {
        validTypes.push('mq.t3.micro', 'mq.m5.large', 'mq.m5.xlarge');
    }
    
    return validTypes.includes(instanceType);
}

/**
 * Validates maintenance window format
 */
export function validateMaintenanceWindow(window: string): boolean {
    // Format: "ddd:hh24:mi-ddd:hh24:mi" or "ddd:hh24:mi"
    // Examples: "sun:23:00-mon:01:30", "mon:02:00"
    const pattern = /^(sun|mon|tue|wed|thu|fri|sat):(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9](-((sun|mon|tue|wed|thu|fri|sat):(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]))?$/;
    return pattern.test(window.toLowerCase());
}

/**
 * Parse MQ error messages from JSON responses
 */
export function parseMQError(responseBody: string): string {
    try {
        const errorBody = JSON.parse(responseBody);
        if (errorBody.message) {
            return errorBody.message;
        }
        if (errorBody.__type) {
            return errorBody.__type;
        }
    } catch (_error) {
        // If parsing fails, return the raw body
    }
    
    return responseBody;
} 
