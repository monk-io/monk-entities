import aws from "cloud/aws";

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
export function buildCreateInstanceParams(definition: any, password: string, securityGroupIds?: string[]): Record<string, any> {
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
    
    // Use provided security group IDs (from auto-creation) or definition
    if (securityGroupIds?.length) {
        params.VpcSecurityGroupIds = securityGroupIds;
    } else if (definition.vpc_security_group_ids?.length) {
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
 * Builds parameters for ModifyDBInstance API call
 * @param definition - Entity definition containing updated values
 * @param securityGroupIds - Optional security group IDs to use (from getOrCreateSecurityGroup)
 */
export function buildModifyInstanceParams(definition: any, securityGroupIds?: string[]): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Storage modifications
    if (definition.allocated_storage !== undefined) {
        params.AllocatedStorage = definition.allocated_storage;
    }
    
    if (definition.max_allocated_storage !== undefined) {
        params.MaxAllocatedStorage = definition.max_allocated_storage;
    }
    
    // Instance class modification
    if (definition.db_instance_class !== undefined) {
        params.DBInstanceClass = definition.db_instance_class;
    }
    
    // Engine version upgrade
    if (definition.engine_version !== undefined) {
        params.EngineVersion = definition.engine_version;
    }
    
    // Auto minor version upgrade
    if (definition.auto_minor_version_upgrade !== undefined) {
        params.AutoMinorVersionUpgrade = definition.auto_minor_version_upgrade ? "true" : "false";
    }
    
    // Backup retention period
    if (definition.backup_retention_period !== undefined) {
        params.BackupRetentionPeriod = definition.backup_retention_period;
    }
    
    // Backup window
    if (definition.backup_window !== undefined) {
        params.PreferredBackupWindow = definition.backup_window;
    }
    
    // Maintenance window
    if (definition.maintenance_window !== undefined) {
        params.PreferredMaintenanceWindow = definition.maintenance_window;
    }
    
    // Multi-AZ
    if (definition.multi_az !== undefined) {
        params.MultiAZ = definition.multi_az ? "true" : "false";
    }
    
    // Performance Insights
    if (definition.performance_insights_enabled !== undefined) {
        params.EnablePerformanceInsights = definition.performance_insights_enabled ? "true" : "false";
    }
    
    // Monitoring interval
    if (definition.monitoring_interval !== undefined) {
        params.MonitoringInterval = definition.monitoring_interval;
    }
    
    // CloudWatch logs exports
    if (definition.enabled_cloudwatch_logs_exports && Array.isArray(definition.enabled_cloudwatch_logs_exports)) {
        params.CloudwatchLogsExportConfiguration = {
            LogTypesToEnable: definition.enabled_cloudwatch_logs_exports
        };
    }
    
    // Deletion protection
    if (definition.deletion_protection !== undefined) {
        params.DeletionProtection = definition.deletion_protection ? "true" : "false";
    }
    
    // VPC Security Groups
    // Use provided security group IDs (from getOrCreateSecurityGroup) or fall back to definition
    if (securityGroupIds && securityGroupIds.length > 0) {
        params.VpcSecurityGroupIds = securityGroupIds;
    } else if (definition.vpc_security_group_ids && Array.isArray(definition.vpc_security_group_ids)) {
        params.VpcSecurityGroupIds = definition.vpc_security_group_ids;
    }
    
    // Apply immediately or during maintenance window
    params.ApplyImmediately = "true"; // Default to apply immediately for updates
    
    return params;
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
    } catch (_error) {
        // If parsing fails, return the raw body
    }
    
    return xmlBody;
} 

export function addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix = ''): void {
    for (const [key, value] of Object.entries(params)) {
        const paramKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null || value === undefined) {
            continue;
        }
        
        if (Array.isArray(value)) {
            value.forEach((item, index) => {
                if (typeof item === 'object') {
                    addParamsToFormData(formParams, item, `${paramKey}.member.${index + 1}`);
                } else {
                    formParams[`${paramKey}.member.${index + 1}`] = String(item);
                }
            });
        } else if (typeof value === 'object') {
            addParamsToFormData(formParams, value, paramKey);
        } else {
            formParams[paramKey] = String(value);
        }
    }
}

export function makeEC2Request(region: string, action: string, params: Record<string, any> = {}): any {
    const url = `https://ec2.${region}.amazonaws.com/`;
    
    // Build URL-encoded form data for EC2 API
    const formParams: Record<string, string> = {
        'Action': action,
        'Version': '2016-11-15'
    };
    
    // Add parameters to form data
    addParamsToFormData(formParams, params);
    
    // Convert to URL-encoded string
    const formBody = Object.entries(formParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    
    const response = aws.post(url, {
        service: 'ec2',
        region: region,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formBody
    });

    if (response.statusCode >= 400) {
        let errorMessage = `AWS EC2 API error: ${response.statusCode} ${response.status}`;
        
        try {
            // Parse XML error response
            const errorMatch = /<message>(.*?)<\/message>/i.exec(response.body);
            if (errorMatch) {
                errorMessage += ` - ${errorMatch[1]}`;
            }
            const codeMatch = /<code>(.*?)<\/code>/i.exec(response.body);
            if (codeMatch) {
                errorMessage += ` (${codeMatch[1]})`;
            }
        } catch (_parseError) {
            errorMessage += ` - Raw: ${response.body}`;
        }
        throw new Error(errorMessage);
    }

    const parsedResponse = parseEC2Response(response.body);
    
    return parsedResponse;
}

function parseEC2Response(xmlBody: string): any {
    // Simple XML parsing for security group operations
    const result: any = {};
    
    // Parse security group ID from CreateSecurityGroup response
    const groupIdMatch = /<groupId>(.*?)<\/groupId>/.exec(xmlBody);
    if (groupIdMatch) {
        result.GroupId = groupIdMatch[1];
    }
    
    // Parse security group info from DescribeSecurityGroups response
    const groupNameMatch = /<groupName>(.*?)<\/groupName>/.exec(xmlBody);
    if (groupNameMatch) {
        result.GroupName = groupNameMatch[1];
    }
    
    const descriptionMatch = /<groupDescription>(.*?)<\/groupDescription>/.exec(xmlBody);
    if (descriptionMatch) {
        result.Description = descriptionMatch[1];
    }
    
    const vpcIdMatch = /<vpcId>(.*?)<\/vpcId>/.exec(xmlBody);
    if (vpcIdMatch) {
        result.VpcId = vpcIdMatch[1];
    }
    
    // Parse default VPC from DescribeVpcs response
    const isDefaultMatch = /<isDefault>true<\/isDefault>/.exec(xmlBody);
    if (isDefaultMatch && vpcIdMatch) {
        result.IsDefault = true;
    }
    
    // Parse security groups with ingress rules
    // More specific regex to match only top-level security group items within securityGroupInfo
    const securityGroupInfoMatch = /<securityGroupInfo>(.*?)<\/securityGroupInfo>/s.exec(xmlBody);
    if (securityGroupInfoMatch) {
        const securityGroupInfoXml = securityGroupInfoMatch[1];

        // Match only direct child <item> elements of securityGroupInfo
        // We need to be more careful to avoid matching nested <item> tags
        const sgMatches = [];
        let currentIndex = 0;
        let itemStart = securityGroupInfoXml.indexOf('<item>', currentIndex);
        
        while (itemStart !== -1) {
            // Find the matching closing tag by counting open/close tags
            let depth = 1;
            let searchPos = itemStart + 6; // Start after '<item>'
            let itemEnd = -1;
            
            while (depth > 0 && searchPos < securityGroupInfoXml.length) {
                const nextOpen = securityGroupInfoXml.indexOf('<item>', searchPos);
                const nextClose = securityGroupInfoXml.indexOf('</item>', searchPos);
                
                if (nextClose === -1) break; // No more closing tags
                
                if (nextOpen !== -1 && nextOpen < nextClose) {
                    // Found an opening tag before the next closing tag
                    depth++;
                    searchPos = nextOpen + 6;
                } else {
                    // Found a closing tag
                    depth--;
                    if (depth === 0) {
                        itemEnd = nextClose + 7; // Include </item>
                    }
                    searchPos = nextClose + 7;
                }
            }
            
            if (itemEnd !== -1) {
                sgMatches.push(securityGroupInfoXml.substring(itemStart, itemEnd));
                currentIndex = itemEnd;
                itemStart = securityGroupInfoXml.indexOf('<item>', currentIndex);
            } else {
                break; // Malformed XML
            }
        }

        if (sgMatches.length > 0) {
            result.SecurityGroups = [];
            sgMatches.forEach(sgItemXml => {
                // Extract the content inside the security group item
                const sgContentMatch = /<item>(.*?)<\/item>/s.exec(sgItemXml);
                if (!sgContentMatch) return;
                const sgXml = sgContentMatch[1];
                
                const sgIdMatch = /<groupId>(.*?)<\/groupId>/.exec(sgXml);
                const sgNameMatch = /<groupName>(.*?)<\/groupName>/.exec(sgXml);
                if (sgIdMatch && sgNameMatch) {
                    const vpcIdMatch = /<vpcId>(.*?)<\/vpcId>/.exec(sgXml);
                    const securityGroup: any = {
                        GroupId: sgIdMatch[1],
                        GroupName: sgNameMatch[1],
                        VpcId: vpcIdMatch ? vpcIdMatch[1] : undefined
                    };
                
                    // Parse ingress rules (IpPermissions)
                    const ipPermissionsMatch = /<ipPermissions>(.*?)<\/ipPermissions>/s.exec(sgItemXml);
                    if (ipPermissionsMatch) {
                        const ipPermissionsXml = ipPermissionsMatch[1];

                        // Use depth-counting approach for permission items too (same nested <item> issue)
                        const permissionItems = [];
                        let currentIndex = 0;
                        let itemStart = ipPermissionsXml.indexOf('<item>', currentIndex);
                        
                        while (itemStart !== -1) {
                            // Find the matching closing tag by counting open/close tags
                            let depth = 1;
                            let searchPos = itemStart + 6; // Start after '<item>'
                            let itemEnd = -1;
                            
                            while (depth > 0 && searchPos < ipPermissionsXml.length) {
                                const nextOpen = ipPermissionsXml.indexOf('<item>', searchPos);
                                const nextClose = ipPermissionsXml.indexOf('</item>', searchPos);
                                
                                if (nextClose === -1) break; // No more closing tags
                                
                                if (nextOpen !== -1 && nextOpen < nextClose) {
                                    // Found an opening tag before the next closing tag
                                    depth++;
                                    searchPos = nextOpen + 6;
                                } else {
                                    // Found a closing tag
                                    depth--;
                                    if (depth === 0) {
                                        itemEnd = nextClose + 7; // Include </item>
                                    }
                                    searchPos = nextClose + 7;
                                }
                            }
                            
                            if (itemEnd !== -1) {
                                permissionItems.push(ipPermissionsXml.substring(itemStart, itemEnd));
                                currentIndex = itemEnd;
                                itemStart = ipPermissionsXml.indexOf('<item>', currentIndex);
                            } else {
                                break; // Malformed XML
                            }
                        }

                        if (permissionItems.length > 0) {
                            securityGroup.IpPermissions = [];
                            permissionItems.forEach(permXml => {
                                const protocolMatch = /<ipProtocol>(.*?)<\/ipProtocol>/.exec(permXml);
                                const fromPortMatch = /<fromPort>(.*?)<\/fromPort>/.exec(permXml);
                                const toPortMatch = /<toPort>(.*?)<\/toPort>/.exec(permXml);
                                
                                if (protocolMatch) {
                                    const permission: any = {
                                        IpProtocol: protocolMatch[1],
                                        FromPort: fromPortMatch ? fromPortMatch[1] : null,
                                        ToPort: toPortMatch ? toPortMatch[1] : null
                                    };
                                    
                                    // Parse IP ranges
                                    const ipRangesMatch = /<ipRanges>(.*?)<\/ipRanges>/s.exec(permXml);
                                    if (ipRangesMatch) {
                                        const ipRangesXml = ipRangesMatch[1];
                                        const ipRangeItems = ipRangesXml.match(/<item>.*?<\/item>/gs);
                                        if (ipRangeItems) {
                                            permission.IpRanges = [];
                                            ipRangeItems.forEach(ipXml => {
                                                const cidrMatch = /<cidrIp>(.*?)<\/cidrIp>/.exec(ipXml);
                                                if (cidrMatch) {
                                                    permission.IpRanges.push({ CidrIp: cidrMatch[1] });
                                                }
                                            });
                                        }
                                    }
                                    
                                    // Parse user ID group pairs
                                    const groupsMatch = /<groups>(.*?)<\/groups>/s.exec(permXml);
                                    if (groupsMatch) {
                                        const groupsXml = groupsMatch[1];
                                        const groupItems = groupsXml.match(/<item>.*?<\/item>/gs);
                                        if (groupItems) {
                                            permission.UserIdGroupPairs = [];
                                            groupItems.forEach(grpXml => {
                                                                                                        const grpIdMatch = /<groupId>(.*?)<\/groupId>/.exec(grpXml);
                                                if (grpIdMatch) {
                                                    permission.UserIdGroupPairs.push({ GroupId: grpIdMatch[1] });
                                                }
                                            });

                                        }
                                    }
                                    
                                    securityGroup.IpPermissions.push(permission);
                                }
                            });
                        }
                    }
                    
                    result.SecurityGroups.push(securityGroup);
                }
            });
        }
    }
    
    return result;
}