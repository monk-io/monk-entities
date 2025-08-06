/**
 * Validates a DB instance identifier according to AWS RDS naming rules
 */
export function validateDBInstanceIdentifier(identifier: string): boolean {
    // AWS RDS DB instance identifier constraints:
    // - Must be 1-63 alphanumeric characters or hyphens
    // - First character must be a letter
    // - Can't end with a hyphen or contain consecutive hyphens
    if (!identifier || identifier.length < 1 || identifier.length > 63) {
        return false;
    }
    
    if (!/^[a-zA-Z]/.test(identifier)) {
        return false;
    }
    
    if (identifier.endsWith('-') || identifier.includes('--')) {
        return false;
    }
    
    return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(identifier);
}

/**
 * Validates storage size according to AWS RDS constraints
 */
export function validateStorageSize(engine: string, storageSize: number): boolean {
    const minStorage: Record<string, number> = {
        'mysql': 20,
        'postgres': 20,
        'mariadb': 20,
        'oracle-ee': 20,
        'oracle-se2': 20,
        'sqlserver-ex': 20,
        'sqlserver-web': 20,
        'sqlserver-se': 20,
        'sqlserver-ee': 20
    };
    
    const minimum = minStorage[engine] || 20;
    return storageSize >= minimum;
}

/**
 * Maps user-friendly engine names to AWS RDS engine identifiers
 */
export function normalizeEngine(engine: string): string {
    const engineMap: Record<string, string> = {
        'mysql': 'mysql',
        'postgres': 'postgres',
        'postgresql': 'postgres',
        'mariadb': 'mariadb',
        'oracle': 'oracle-ee',
        'oracle-ee': 'oracle-ee',
        'oracle-se2': 'oracle-se2',
        'sqlserver': 'sqlserver-se',
        'sqlserver-ex': 'sqlserver-ex',
        'sqlserver-web': 'sqlserver-web',
        'sqlserver-se': 'sqlserver-se',
        'sqlserver-ee': 'sqlserver-ee'
    };
    
    return engineMap[engine.toLowerCase()] || engine;
}

/**
 * Gets default port for database engines
 */
export function getDefaultPort(engine: string): number {
    const portMap: Record<string, number> = {
        'mysql': 3306,
        'postgres': 5432,
        'mariadb': 3306,
        'oracle-ee': 1521,
        'oracle-se2': 1521,
        'sqlserver-ex': 1433,
        'sqlserver-web': 1433,
        'sqlserver-se': 1433,
        'sqlserver-ee': 1433
    };
    
    return portMap[engine] || 3306;
}

/**
 * Converts RDS instance configuration to API parameters
 */
export function buildCreateInstanceParams(definition: any, password: string): Record<string, any> {
    const params: Record<string, any> = {
        DBInstanceIdentifier: definition.db_instance_identifier,
        DBInstanceClass: definition.db_instance_class,
        Engine: normalizeEngine(definition.engine),
        MasterUsername: definition.master_username,
        MasterUserPassword: password,
        AllocatedStorage: definition.allocated_storage
    };
    
    // Add optional parameters
    if (definition.engine_version) {
        params.EngineVersion = definition.engine_version;
    }
    
    if (definition.port) {
        params.Port = definition.port;
    } else {
        params.Port = getDefaultPort(normalizeEngine(definition.engine));
    }
    
    // MasterUserPassword is now set as required above
    
    if (definition.vpc_security_group_ids?.length) {
        params.VpcSecurityGroupIds = definition.vpc_security_group_ids;
    }
    
    if (definition.db_subnet_group_name) {
        params.DBSubnetGroupName = definition.db_subnet_group_name;
    }
    
    if (definition.backup_retention_period !== undefined) {
        params.BackupRetentionPeriod = definition.backup_retention_period;
    }
    
    if (definition.preferred_backup_window) {
        params.PreferredBackupWindow = definition.preferred_backup_window;
    }
    
    if (definition.preferred_maintenance_window) {
        params.PreferredMaintenanceWindow = definition.preferred_maintenance_window;
    }
    
    if (definition.auto_minor_version_upgrade !== undefined) {
        params.AutoMinorVersionUpgrade = String(definition.auto_minor_version_upgrade);
    }
    
    if (definition.multi_az !== undefined) {
        params.MultiAZ = String(definition.multi_az);
    }
    
    if (definition.publicly_accessible !== undefined) {
        params.PubliclyAccessible = String(definition.publicly_accessible);
    }
    
    if (definition.storage_type) {
        params.StorageType = definition.storage_type;
    }
    
    if (definition.storage_encrypted !== undefined) {
        params.StorageEncrypted = String(definition.storage_encrypted);
    }
    
    if (definition.kms_key_id) {
        params.KmsKeyId = definition.kms_key_id;
    }
    
    if (definition.deletion_protection !== undefined) {
        params.DeletionProtection = String(definition.deletion_protection);
    }
    
    if (definition.skip_final_snapshot !== undefined) {
        params.SkipFinalSnapshot = String(definition.skip_final_snapshot);
    }
    
    // Add tags if provided
    if (definition.tags && Object.keys(definition.tags).length > 0) {
        const tags: any[] = [];
        Object.entries(definition.tags).forEach(([key, value]) => {
            if (key && value !== null && value !== undefined) {
                tags.push({
                    Key: String(key),
                    Value: String(value)
                });
            }
        });
        if (tags.length > 0) {
            params.Tags = tags;
        }
    }
    
    return params;
}

/**
 * Formats RDS API response data for state storage
 * @param dbInstance - RDS instance data from AWS API
 * @param wasPreExisting - true if instance existed before entity creation, false if we created it
 */
export function formatInstanceState(dbInstance: any, wasPreExisting: boolean = false): any {
    return {
        existing: wasPreExisting, // true = don't delete (pre-existing), false = we created it (can delete)
        db_instance_identifier: dbInstance.DBInstanceIdentifier,
        db_instance_arn: dbInstance.DBInstanceArn,
        db_instance_status: dbInstance.DBInstanceStatus,
        endpoint_address: dbInstance.Endpoint?.Address,
        endpoint_port: dbInstance.Endpoint?.Port,
        allocated_storage: dbInstance.AllocatedStorage,
        creation_time: dbInstance.InstanceCreateTime,
        last_modified: dbInstance.LastModifiedTime
    };
}

/**
 * Parses RDS error messages from XML responses
 */
export function parseRDSError(xmlBody: string): string {
    try {
        const errorMatch = /<Message>(.*?)<\/Message>/.exec(xmlBody);
        const codeMatch = /<Code>(.*?)<\/Code>/.exec(xmlBody);
        
        if (errorMatch && codeMatch) {
            return `${codeMatch[1]}: ${errorMatch[1]}`;
        } else if (errorMatch) {
            return errorMatch[1];
        }
    } catch (error) {
        // If parsing fails, return the raw body
    }
    
    return xmlBody;
} 