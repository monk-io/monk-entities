import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import cli from "cli";

export interface AWSRDSDefinition {
    region: string;
    db_instance_identifier: string;
    db_instance_class: string;
    engine: string;
    master_username: string;
    allocated_storage: number;
    engine_version?: string;
    port?: number;
    password_secret_ref?: string;
    vpc_security_group_ids?: string[];
    db_subnet_group_name?: string;
    backup_retention_period?: number;
    preferred_backup_window?: string;
    preferred_maintenance_window?: string;
    auto_minor_version_upgrade?: boolean;
    multi_az?: boolean;
    publicly_accessible?: boolean;
    storage_type?: string;
    storage_encrypted?: boolean;
    kms_key_id?: string;
    deletion_protection?: boolean;
    skip_final_snapshot?: boolean;
    final_db_snapshot_identifier?: string;
    tags?: Record<string, string>;
    // Security group auto-creation options
    auto_create_security_group?: boolean;
    security_group_name?: string;
    security_group_description?: string;
    vpc_id?: string;
    allowed_cidr_blocks?: string[];
    allowed_security_group_names?: string[];
}

export interface AWSRDSState {
    existing: boolean;
    db_instance_identifier?: string;
    db_instance_arn?: string;
    db_instance_status?: string;
    endpoint_address?: string;
    endpoint_port?: number;
    allocated_storage?: number;
    creation_time?: string;
    last_modified?: string;
    // Security group state
    created_security_group_id?: string;
    created_security_group_existing?: boolean;
    // Note: No previous_allowed_* fields - we query AWS directly for current rules
}

export interface RDSResponse {
    DBInstances?: Array<{
        DBInstanceIdentifier?: string;
        DBInstanceClass?: string;
        Engine?: string;
        DBInstanceStatus?: string;
        MasterUsername?: string;
        Endpoint?: {
            Address?: string;
            Port?: number;
        };
        AllocatedStorage?: number;
        InstanceCreateTime?: string;
        PreferredBackupWindow?: string;
        BackupRetentionPeriod?: number;
        VpcSecurityGroups?: Array<{
            VpcSecurityGroupId?: string;
            Status?: string;
        }>;
        DBParameterGroups?: Array<{
            DBParameterGroupName?: string;
            ParameterApplyStatus?: string;
        }>;
        AvailabilityZone?: string;
        DBSubnetGroup?: {
            DBSubnetGroupName?: string;
            DBSubnetGroupDescription?: string;
            VpcId?: string;
        };
        PreferredMaintenanceWindow?: string;
        PendingModifiedValues?: any;
        LatestRestorableTime?: string;
        AutoMinorVersionUpgrade?: boolean;
        ReadReplicaDBInstanceIdentifiers?: string[];
        LicenseModel?: string;
        OptionGroupMemberships?: Array<{
            OptionGroupName?: string;
            Status?: string;
        }>;
        PubliclyAccessible?: boolean;
        StorageType?: string;
        DbInstancePort?: number;
        StorageEncrypted?: boolean;
        KmsKeyId?: string;
        DbiResourceId?: string;
        CACertificateIdentifier?: string;
        DomainMemberships?: any[];
        CopyTagsToSnapshot?: boolean;
        MonitoringInterval?: number;
        EnhancedMonitoringResourceArn?: string;
        MonitoringRoleArn?: string;
        PromotionTier?: number;
        DBInstanceArn?: string;
        Timezone?: string;
        IAMDatabaseAuthenticationEnabled?: boolean;
        PerformanceInsightsEnabled?: boolean;
        PerformanceInsightsKMSKeyId?: string;
        PerformanceInsightsRetentionPeriod?: number;
        EnabledCloudwatchLogsExports?: string[];
        ProcessorFeatures?: any[];
        DeletionProtection?: boolean;
        AssociatedRoles?: any[];
        ListenerEndpoint?: {
            Address?: string;
            Port?: number;
            HostedZoneId?: string;
        };
        MaxAllocatedStorage?: number;
        EngineVersion?: string;
        MultiAZ?: boolean;
    }>;
    DBInstance?: {
        DBInstanceIdentifier?: string;
        DBInstanceClass?: string;
        Engine?: string;
        DBInstanceStatus?: string;
        MasterUsername?: string;
        Endpoint?: {
            Address?: string;
            Port?: number;
        };
        AllocatedStorage?: number;
        InstanceCreateTime?: string;
        PreferredBackupWindow?: string;
        BackupRetentionPeriod?: number;
        VpcSecurityGroups?: Array<{
            VpcSecurityGroupId?: string;
            Status?: string;
        }>;
        DBParameterGroups?: Array<{
            DBParameterGroupName?: string;
            ParameterApplyStatus?: string;
        }>;
        AvailabilityZone?: string;
        DBSubnetGroup?: {
            DBSubnetGroupName?: string;
            DBSubnetGroupDescription?: string;
            VpcId?: string;
        };
        PreferredMaintenanceWindow?: string;
        PendingModifiedValues?: any;
        LatestRestorableTime?: string;
        AutoMinorVersionUpgrade?: boolean;
        ReadReplicaDBInstanceIdentifiers?: string[];
        LicenseModel?: string;
        OptionGroupMemberships?: Array<{
            OptionGroupName?: string;
            Status?: string;
        }>;
        PubliclyAccessible?: boolean;
        StorageType?: string;
        DbInstancePort?: number;
        StorageEncrypted?: boolean;
        KmsKeyId?: string;
        DbiResourceId?: string;
        CACertificateIdentifier?: string;
        DomainMemberships?: any[];
        CopyTagsToSnapshot?: boolean;
        MonitoringInterval?: number;
        EnhancedMonitoringResourceArn?: string;
        MonitoringRoleArn?: string;
        PromotionTier?: number;
        DBInstanceArn?: string;
        Timezone?: string;
        IAMDatabaseAuthenticationEnabled?: boolean;
        PerformanceInsightsEnabled?: boolean;
        PerformanceInsightsKMSKeyId?: string;
        PerformanceInsightsRetentionPeriod?: number;
        EnabledCloudwatchLogsExports?: string[];
        ProcessorFeatures?: any[];
        DeletionProtection?: boolean;
        AssociatedRoles?: any[];
        ListenerEndpoint?: {
            Address?: string;
            Port?: number;
            HostedZoneId?: string;
        };
        MaxAllocatedStorage?: number;
        TagList?: Array<{
            Key?: string;
            Value?: string;
        }>;
        DBInstanceAutomatedBackupsReplications?: any[];
        CustomerOwnedIpEnabled?: boolean;
        EngineVersion?: string;
        LastModifiedTime?: string;
    };
}

export interface RDSErrorResponse {
    Error?: {
        Type?: string;
        Code?: string;
        Message?: string;
    };
    RequestId?: string;
}

export abstract class AWSRDSEntity<
    TDefinition extends AWSRDSDefinition,
    TState extends AWSRDSState
> extends MonkEntity<TDefinition, TState> {
    
    protected region!: string;

    protected override before(): void {
        // AWS credentials are already injected into the aws built-in module
        this.region = this.definition.region;
    }

    protected abstract getDBInstanceIdentifier(): string;

    protected makeRDSRequest(action: string, params: Record<string, any> = {}): RDSResponse {
        const url = `https://rds.${this.region}.amazonaws.com/`;
        
        // Build URL-encoded form data for RDS API
        const formParams: Record<string, string> = {
            'Action': action,
            'Version': '2014-10-31'
        };
        
        // Add parameters to form data
        this.addParamsToFormData(formParams, params);
        
        // Convert to URL-encoded string
        const formBody = Object.entries(formParams)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        const response = aws.post(url, {
            service: 'rds',
            region: this.region,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody
        });

        if (response.statusCode >= 400) {
            let errorMessage = `AWS RDS API error: ${response.statusCode} ${response.status}`;
            
            try {
                // Parse XML error response
                const errorMatch = /<Message>(.*?)<\/Message>/.exec(response.body);
                if (errorMatch) {
                    errorMessage += ` - ${errorMatch[1]}`;
                }
                const codeMatch = /<Code>(.*?)<\/Code>/.exec(response.body);
                if (codeMatch) {
                    errorMessage += ` (${codeMatch[1]})`;
                }
            } catch (_parseError) {
                errorMessage += ` - Raw: ${response.body}`;
            }
            throw new Error(errorMessage);
        }

        // Parse XML response - simplified for core functionality
        return this.parseRDSResponse(response.body);
    }

    private addParamsToFormData(formParams: Record<string, string>, params: Record<string, any>, prefix = ''): void {
        for (const [key, value] of Object.entries(params)) {
            const paramKey = prefix ? `${prefix}.${key}` : key;
            
            if (value === null || value === undefined) {
                continue;
            }
            
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (typeof item === 'object') {
                        this.addParamsToFormData(formParams, item, `${paramKey}.member.${index + 1}`);
                    } else {
                        formParams[`${paramKey}.member.${index + 1}`] = String(item);
                    }
                });
            } else if (typeof value === 'object') {
                this.addParamsToFormData(formParams, value, paramKey);
            } else {
                formParams[paramKey] = String(value);
            }
        }
    }

    private parseRDSResponse(xmlBody: string): RDSResponse {
        // Extract DBInstance information from XML response
        const dbInstance: any = {};
        
        // Parse basic instance information
        const identifierMatch = /<DBInstanceIdentifier>(.*?)<\/DBInstanceIdentifier>/.exec(xmlBody);
        if (identifierMatch) dbInstance.DBInstanceIdentifier = identifierMatch[1];
        
        const classMatch = /<DBInstanceClass>(.*?)<\/DBInstanceClass>/.exec(xmlBody);
        if (classMatch) dbInstance.DBInstanceClass = classMatch[1];
        
        const engineMatch = /<Engine>(.*?)<\/Engine>/.exec(xmlBody);
        if (engineMatch) dbInstance.Engine = engineMatch[1];
        
        const statusMatch = /<DBInstanceStatus>(.*?)<\/DBInstanceStatus>/.exec(xmlBody);
        if (statusMatch) {
            dbInstance.DBInstanceStatus = statusMatch[1];
        }
        
        const usernameMatch = /<MasterUsername>(.*?)<\/MasterUsername>/.exec(xmlBody);
        if (usernameMatch) dbInstance.MasterUsername = usernameMatch[1];
        
        const storageMatch = /<AllocatedStorage>(.*?)<\/AllocatedStorage>/.exec(xmlBody);
        if (storageMatch) dbInstance.AllocatedStorage = parseInt(storageMatch[1]);
        
        const engineVersionMatch = /<EngineVersion>(.*?)<\/EngineVersion>/.exec(xmlBody);
        if (engineVersionMatch) dbInstance.EngineVersion = engineVersionMatch[1];
        
        const createTimeMatch = /<InstanceCreateTime>(.*?)<\/InstanceCreateTime>/.exec(xmlBody);
        if (createTimeMatch) dbInstance.InstanceCreateTime = createTimeMatch[1];
        
        const arnMatch = /<DBInstanceArn>(.*?)<\/DBInstanceArn>/.exec(xmlBody);
        if (arnMatch) dbInstance.DBInstanceArn = arnMatch[1];
        
        // Parse endpoint information
        const endpointAddressMatch = /<Address>(.*?)<\/Address>/.exec(xmlBody);
        const endpointPortMatch = /<Port>(.*?)<\/Port>/.exec(xmlBody);
        if (endpointAddressMatch || endpointPortMatch) {
            dbInstance.Endpoint = {};
            if (endpointAddressMatch) dbInstance.Endpoint.Address = endpointAddressMatch[1];
            if (endpointPortMatch) dbInstance.Endpoint.Port = parseInt(endpointPortMatch[1]);
        }
        
        return { DBInstance: dbInstance };
    }

    protected checkDBInstanceExists(dbInstanceIdentifier: string): RDSResponse | null {
        try {
            return this.makeRDSRequest('DescribeDBInstances', {
                DBInstanceIdentifier: dbInstanceIdentifier
            });
        } catch (error) {
            // Instance doesn't exist if we get a DBInstanceNotFound error
            if (error instanceof Error && error.message.includes('DBInstanceNotFound')) {
                return null;
            }
            throw error;
        }
    }

    protected createDBInstance(params: Record<string, any>): RDSResponse {
        return this.makeRDSRequest('CreateDBInstance', params);
    }

    protected modifyDBInstance(dbInstanceIdentifier: string, params: Record<string, any>): RDSResponse {
        return this.makeRDSRequest('ModifyDBInstance', {
            DBInstanceIdentifier: dbInstanceIdentifier,
            ...params
        });
    }

    protected deleteDBInstance(dbInstanceIdentifier: string, skipFinalSnapshot: boolean = true, finalSnapshotId?: string): void {
        const params: Record<string, any> = {
            DBInstanceIdentifier: dbInstanceIdentifier,
            SkipFinalSnapshot: skipFinalSnapshot
        };
        
        if (!skipFinalSnapshot && finalSnapshotId) {
            params.FinalDBSnapshotIdentifier = finalSnapshotId;
        }
        
        this.makeRDSRequest('DeleteDBInstance', params);
    }

    protected waitForDBInstanceState(dbInstanceIdentifier: string, targetState: string, maxAttempts: number = 60): boolean {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = this.checkDBInstanceExists(dbInstanceIdentifier);
                if (response?.DBInstance?.DBInstanceStatus === targetState) {
                    return true;
                }
                
                if (response?.DBInstance?.DBInstanceStatus === 'failed') {
                    throw new Error(`DB instance ${dbInstanceIdentifier} is in failed state`);
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

    // Security Group Management Methods
    
    protected makeEC2Request(action: string, params: Record<string, any> = {}): any {
        const url = `https://ec2.${this.region}.amazonaws.com/`;
        
        // Build URL-encoded form data for EC2 API
        const formParams: Record<string, string> = {
            'Action': action,
            'Version': '2016-11-15'
        };
        
        // Add parameters to form data
        this.addParamsToFormData(formParams, params);
        
        // Convert to URL-encoded string
        const formBody = Object.entries(formParams)
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        const response = aws.post(url, {
            service: 'ec2',
            region: this.region,
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

        const parsedResponse = this.parseEC2Response(response.body);
        
        return parsedResponse;
    }

    private parseEC2Response(xmlBody: string): any {
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

    protected getDefaultVpc(): string | null {
        try {
            const response = this.makeEC2Request('DescribeVpcs', {
                'Filter.1.Name': 'isDefault',
                'Filter.1.Value.1': 'true'
            });
            
            // Check if the response has VpcId and IsDefault flag
            if (response.VpcId && response.IsDefault) {

                return response.VpcId;
            }

            return null;
        } catch (error) {
            console.log(`Warning: Could not retrieve default VPC: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    protected resolveSecurityGroupNames(groupNames: string[], vpcId?: string): string[] {
        if (groupNames.length === 0) {
            return [];
        }
        
        try {
            const params: Record<string, any> = {};
            
            // Add group name filters (use single filter with multiple values)
            params['Filter.1.Name'] = 'group-name';
            groupNames.forEach((name, index) => {
                params[`Filter.1.Value.${index + 1}`] = name;
            });
            
            // If VPC ID is specified, filter by VPC
            if (vpcId) {
                params['Filter.2.Name'] = 'vpc-id';
                params['Filter.2.Value.1'] = vpcId;
            } else {
                // Try to get the default VPC if no VPC ID is specified
                const defaultVpcId = this.getDefaultVpc();
                if (defaultVpcId) {
                    params['Filter.2.Name'] = 'vpc-id';
                    params['Filter.2.Value.1'] = defaultVpcId;
                } else {
                }
            }
            const response = this.makeEC2Request('DescribeSecurityGroups', params);
            // Parse security groups from response
            const sgIds: string[] = [];
            const sgMatches = response.SecurityGroups || [];
            
            if (Array.isArray(sgMatches)) {
                sgMatches.forEach((sg: any) => {
                    if (sg.GroupId) {
                        sgIds.push(sg.GroupId);
                    }
                });
            } else {
                // Fallback to XML parsing if structured response not available
                const xmlMatches = response.match ? response.match(/<groupId>(.*?)<\/groupId>/g) : [];
                if (xmlMatches) {
                    xmlMatches.forEach((match: string) => {
                        const idMatch = /<groupId>(.*?)<\/groupId>/.exec(match);
                        if (idMatch) {
                            sgIds.push(idMatch[1]);
                        }
                    });
                } else {
                }
            }
            
            // If we didn't find any security groups and we were using a VPC filter, try without VPC filter
            if (sgIds.length === 0 && (vpcId || this.getDefaultVpc())) {
                // Also list all security groups for debugging
                try {
                    const allSgsResponse = this.makeEC2Request('DescribeSecurityGroups', {});
                    if (allSgsResponse.SecurityGroups && Array.isArray(allSgsResponse.SecurityGroups)) {
                        // Removed debug logging
                    } else {
                    }
                } catch (_listError) {
                    // Ignore error - this was for debugging
                }
                
                // Create new parameters without VPC filter
                const noVpcParams: Record<string, any> = {};
                noVpcParams['Filter.1.Name'] = 'group-name';
                groupNames.forEach((name, index) => {
                    noVpcParams[`Filter.1.Value.${index + 1}`] = name;
                });
                const noVpcResponse = this.makeEC2Request('DescribeSecurityGroups', noVpcParams);
                // Parse the no-VPC response
                const noVpcMatches = noVpcResponse.SecurityGroups || [];
                if (Array.isArray(noVpcMatches)) {
                    noVpcMatches.forEach((sg: any) => {
                        if (sg.GroupId) {
                            sgIds.push(sg.GroupId);
                        }
                    });
                }
            }
            
            // Return the found security group IDs
            
            return sgIds;
        } catch (error) {
            throw new Error(`Failed to resolve security group names: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected createSecurityGroup(groupName: string, description: string, vpcId?: string): string {
        const params: Record<string, any> = {
            GroupName: groupName,
            GroupDescription: description
        };
        
        // If vpcId is provided, use it; otherwise, let AWS use the default VPC
        if (vpcId) {
            params.VpcId = vpcId;
        }
        
        const response = this.makeEC2Request('CreateSecurityGroup', params);
        if (!response.GroupId) {
            throw new Error('Failed to create security group: No GroupId in response');
        }
        
        return response.GroupId;
    }

    protected checkSecurityGroupExists(groupId: string): boolean {
        try {
            this.makeEC2Request('DescribeSecurityGroups', {
                'GroupId.1': groupId
            });
            return true;
        } catch (error) {
            // Security group doesn't exist if we get a InvalidGroupId.NotFound error
            if (error instanceof Error && error.message.includes('InvalidGroupId.NotFound')) {
                return false;
            }
            throw error;
        }
    }

    protected findSecurityGroupByName(groupName: string, vpcId?: string): string | null {
        try {
            const params: Record<string, any> = {
                'Filter.1.Name': 'group-name',
                'Filter.1.Value.1': groupName
            };
            
            // If VPC ID is not provided, try to get the default VPC
            const targetVpcId = vpcId || this.getDefaultVpc();
            
            // Filter by VPC ID (either provided or default)
            if (targetVpcId) {
                params['Filter.2.Name'] = 'vpc-id';
                params['Filter.2.Value.1'] = targetVpcId;
            }

            const response = this.makeEC2Request('DescribeSecurityGroups', params);
            
            // Check if we have any security groups in the response
            // AWS EC2 API returns SecurityGroups (plural) array
            if (response.SecurityGroups && response.SecurityGroups.length > 0) {
                const securityGroups = Array.isArray(response.SecurityGroups) ? 
                    response.SecurityGroups : [response.SecurityGroups];
                
                if (securityGroups.length > 0) {
                    return securityGroups[0].GroupId;
                }
            }
            
            return null; // No security group found with this name
        } catch (error) {
            // If there's an error describing security groups, return null
            console.log(`Error finding security group by name: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }

    protected authorizeSecurityGroupIngress(groupId: string, protocol: string, fromPort: number, toPort: number, cidrBlocks: string[], sourceSecurityGroupIds: string[] = []): void {
        const params: Record<string, any> = {
            GroupId: groupId
        };
        
        let permissionIndex = 1;
        
        // Add IP permissions for each CIDR block
        cidrBlocks.forEach((cidr) => {
            const permissionBase = `IpPermissions.${permissionIndex}`;
            params[`${permissionBase}.IpProtocol`] = protocol;
            params[`${permissionBase}.FromPort`] = fromPort.toString();
            params[`${permissionBase}.ToPort`] = toPort.toString();
            params[`${permissionBase}.IpRanges.1.CidrIp`] = cidr;
            permissionIndex++;
        });
        
        // Add permissions for each source security group
        sourceSecurityGroupIds.forEach((sgId) => {
            const permissionBase = `IpPermissions.${permissionIndex}`;
            params[`${permissionBase}.IpProtocol`] = protocol;
            params[`${permissionBase}.FromPort`] = fromPort.toString();
            params[`${permissionBase}.ToPort`] = toPort.toString();
            params[`${permissionBase}.Groups.1.GroupId`] = sgId;
            permissionIndex++;
        });
        try {
            this.makeEC2Request('AuthorizeSecurityGroupIngress', params);
        } catch (error) {
            // Ignore errors for rules that already exist (duplicate rules)
            if (error instanceof Error && !error.message.includes('InvalidPermission.Duplicate')) {
                cli.output(`[ERROR] AuthorizeSecurityGroupIngress failed: ${error.message}`);
                throw error;
            }
        }
    }

    protected revokeSecurityGroupIngress(groupId: string, protocol: string, fromPort: number, toPort: number, cidrBlocks: string[], sourceSecurityGroupIds: string[] = []): void {
        const params: Record<string, any> = {
            GroupId: groupId
        };
        
        let permissionIndex = 1;
        
        // Add IP permissions for each CIDR block to revoke
        cidrBlocks.forEach((cidr) => {
            const permissionBase = `IpPermissions.${permissionIndex}`;
            params[`${permissionBase}.IpProtocol`] = protocol;
            params[`${permissionBase}.FromPort`] = fromPort.toString();
            params[`${permissionBase}.ToPort`] = toPort.toString();
            params[`${permissionBase}.IpRanges.1.CidrIp`] = cidr;
            permissionIndex++;
        });
        
        // Add permissions for each source security group to revoke
        sourceSecurityGroupIds.forEach((sgId) => {
            const permissionBase = `IpPermissions.${permissionIndex}`;
            params[`${permissionBase}.IpProtocol`] = protocol;
            params[`${permissionBase}.FromPort`] = fromPort.toString();
            params[`${permissionBase}.ToPort`] = toPort.toString();
            params[`${permissionBase}.Groups.1.GroupId`] = sgId;
            permissionIndex++;
        });
        try {
            this.makeEC2Request('RevokeSecurityGroupIngress', params);
        } catch (error) {
            // Ignore errors for rules that don't exist (already removed)
            if (error instanceof Error && !error.message.includes('InvalidPermission.NotFound')) {
                cli.output(`[ERROR] RevokeSecurityGroupIngress failed: ${error.message}`);
                throw error;
            }
        }
    }

    protected updateSecurityGroupRules(): void {
        // Only update rules for auto-created security groups
        if (!this.state.created_security_group_id || this.state.created_security_group_existing) {

            return;
        }

        const groupId = this.state.created_security_group_id;
        const port = this.definition.port || this.getDefaultPortForEngine(this.definition.engine);
        const allowedCidrs = this.definition.allowed_cidr_blocks || [];
        const allowedSgNames = this.definition.allowed_security_group_names || [];
        try {
            // API-ONLY APPROACH: Query current AWS rules directly
            const currentAwsRules = this.getCurrentSecurityGroupRules(groupId, port);
            
            // Resolve template security group names to IDs
            const allowedSgIds = allowedSgNames.length > 0 ?
                this.resolveSecurityGroupNames([...allowedSgNames], this.definition.vpc_id) : [];
            // Compare template vs AWS reality
            const cidrsToAdd = allowedCidrs.filter(cidr => !currentAwsRules.cidrs.includes(cidr));
            const cidrsToRemove = currentAwsRules.cidrs.filter(cidr => !allowedCidrs.includes(cidr));
            const sgIdsToAdd = allowedSgIds.filter(sgId => !currentAwsRules.sgIds.includes(sgId));
            const sgIdsToRemove = currentAwsRules.sgIds.filter(sgId => !allowedSgIds.includes(sgId));
            // Check if there are actually changes to make
            if (cidrsToAdd.length === 0 && cidrsToRemove.length === 0 &&
                sgIdsToAdd.length === 0 && sgIdsToRemove.length === 0) {
                return;
            }

            // Remove old rules first
            if (cidrsToRemove.length > 0 || sgIdsToRemove.length > 0) {
                this.revokeSecurityGroupIngress(groupId, 'tcp', port, port, cidrsToRemove, sgIdsToRemove);
            }

            // Add new rules
            if (cidrsToAdd.length > 0 || sgIdsToAdd.length > 0) {
                this.authorizeSecurityGroupIngress(groupId, 'tcp', port, port, cidrsToAdd, sgIdsToAdd);
            }
        } catch (error) {
            throw new Error(`Failed to update security group rules: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected getCurrentSecurityGroupRules(groupId: string, port: number): { cidrs: string[]; sgIds: string[] } {
        try {
            // Get actual rules from AWS
            const response = this.makeEC2Request('DescribeSecurityGroups', {
                'GroupId.1': groupId
            });
            const actualCidrs: string[] = [];
            const actualSgIds: string[] = [];

            // Parse ingress rules from the response
            if (response.SecurityGroups && response.SecurityGroups.length > 0) {
                const securityGroup = response.SecurityGroups[0];
                // Look for rules on our specific port
                if (securityGroup.IpPermissions) {
                    const permissions = Array.isArray(securityGroup.IpPermissions) ?
                        securityGroup.IpPermissions : [securityGroup.IpPermissions];

                    permissions.forEach((permission: any) => {
                        if (permission.IpProtocol === 'tcp' &&
                            parseInt(permission.FromPort) === port &&
                            parseInt(permission.ToPort) === port) {

                            // Collect CIDR blocks
                            if (permission.IpRanges) {
                                const ipRanges = Array.isArray(permission.IpRanges) ?
                                    permission.IpRanges : [permission.IpRanges];
                                ipRanges.forEach((range: any) => {
                                    if (range.CidrIp) {
                                        actualCidrs.push(range.CidrIp);
                                    }
                                });
                            }

                            // Collect security group IDs
                            if (permission.UserIdGroupPairs) {
                                const groups = Array.isArray(permission.UserIdGroupPairs) ?
                                    permission.UserIdGroupPairs : [permission.UserIdGroupPairs];
                                groups.forEach((group: any) => {
                                    if (group.GroupId) {
                                        actualSgIds.push(group.GroupId);
                                    }
                                });
                            }
                        }
                    });
                }
            }
            return { cidrs: actualCidrs, sgIds: actualSgIds };
            
        } catch (error) {
            // Return empty arrays as fallback
            return { cidrs: [], sgIds: [] };
        }
    }

    protected deleteSecurityGroup(groupId: string): void {
        this.makeEC2Request('DeleteSecurityGroup', {
            GroupId: groupId
        });
    }

    protected getOrCreateSecurityGroup(): string[] {
        // If security group IDs are explicitly provided, use them
        if (this.definition.vpc_security_group_ids?.length) {
            return [...this.definition.vpc_security_group_ids];
        }
        
        // If auto-creation is disabled, return empty array (AWS will use default)
        if (this.definition.auto_create_security_group === false) {
            return [];
        }
        
        // Create a security group automatically
        const dbInstanceIdentifier = this.getDBInstanceIdentifier();
        const groupName = this.definition.security_group_name || `${dbInstanceIdentifier}-sg`;
        const description = this.definition.security_group_description || `Security group for RDS instance ${dbInstanceIdentifier}`;
        const port = this.definition.port || this.getDefaultPortForEngine(this.definition.engine);
        const allowedCidrs = this.definition.allowed_cidr_blocks || [];
        const allowedSgNames = this.definition.allowed_security_group_names || [];
        
        // Require at least one access method to be specified
        if (allowedCidrs.length === 0 && allowedSgNames.length === 0) {
            throw new Error('Security group auto-creation requires either allowed_cidr_blocks or allowed_security_group_names to be specified for security');
        }
        
        // Check if we already created a security group for this instance
        if (this.state.created_security_group_id) {
            // Verify it still exists
            if (this.checkSecurityGroupExists(this.state.created_security_group_id)) {
                return [this.state.created_security_group_id];
            } else {
                // Security group was deleted externally, clear our state
                this.state.created_security_group_id = undefined;
                this.state.created_security_group_existing = false;
            }
        }
        
        try {
            // Use provided VPC ID or let AWS use the default VPC
            const vpcId = this.definition.vpc_id; // Can be undefined, which is fine
            
            // First, check if a security group with this name already exists
            let groupId = this.findSecurityGroupByName(groupName, vpcId);
            let isExisting = false;
            
                            if (groupId) {
                    // Security group already exists, use it
                    isExisting = true;
                } else {
                    // Create a new security group
                    groupId = this.createSecurityGroup(groupName, description, vpcId);
                }
            
            // Resolve security group names to IDs
            const allowedSgIds = allowedSgNames.length > 0 ? 
                this.resolveSecurityGroupNames([...allowedSgNames], vpcId) : [];
            
                            // Add ingress rules for database port (only if we created a new security group)
                // For existing security groups, we assume they already have the correct rules
                if (!isExisting) {
                    this.authorizeSecurityGroupIngress(groupId, 'tcp', port, port, [...allowedCidrs], allowedSgIds);
                } else {
                }
            
            // Store in state that we are using this security group
            this.state.created_security_group_id = groupId;
            this.state.created_security_group_existing = isExisting;
            
            // Note: API-only approach - no state tracking needed
            
            return [groupId];
        } catch (error) {
            throw new Error(`Failed to create or find security group: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    
    private getDefaultPortForEngine(engine: string): number {
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
        
        return portMap[engine.toLowerCase()] || 3306;
    }

    protected cleanupCreatedSecurityGroup(): void {
        if (this.state.created_security_group_id && !this.state.created_security_group_existing) {
            try {
                console.log(`Deleting created security group: ${this.state.created_security_group_id}`);
                this.deleteSecurityGroup(this.state.created_security_group_id);
                this.state.created_security_group_id = undefined;
                this.state.created_security_group_existing = false;
            } catch (error) {
                console.log(`Warning: Could not delete security group ${this.state.created_security_group_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                // Don't throw error here - we still want to proceed with other cleanup
            }
        }
    }
} 