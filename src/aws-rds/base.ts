import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";
import { addParamsToFormData } from "./common.ts";
import { authorizeSecurityGroupIngress, checkSecurityGroupExists, createSecurityGroup, deleteSecurityGroup, findSecurityGroupByName, resolveSecurityGroupNames, updateSecurityGroupRules } from "./security-group.ts";
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
    db_name?: string;
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
        addParamsToFormData(formParams, params);
        
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

    protected waitForDBInstanceDeletion(dbInstanceIdentifier: string, maxAttempts: number = 40): boolean {
        console.log(`Waiting for DB instance ${dbInstanceIdentifier} to be fully deleted...`);
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = this.checkDBInstanceExists(dbInstanceIdentifier);
                
                // If instance doesn't exist, deletion is complete
                if (!response) {
                    console.log(`DB instance ${dbInstanceIdentifier} has been successfully deleted`);
                    return true;
                }
                
                const status = response.DBInstance?.DBInstanceStatus;
                console.log(`DB instance ${dbInstanceIdentifier} status: ${status} (attempt ${attempt + 1}/${maxAttempts})`);
                
                // If still deleting, continue waiting
                if (status === 'deleting') {
                    // Wait 30 seconds before next attempt
                    const start = Date.now();
                    while (Date.now() - start < 30000) {
                        // Simple busy wait
                    }
                    continue;
                }
                
                // If in any other state, something went wrong
                throw new Error(`DB instance ${dbInstanceIdentifier} is in unexpected state: ${status}`);
                
            } catch (error) {
                // If we get a "DBInstanceNotFound" error, that means deletion is complete
                if (error instanceof Error && error.message.includes('DBInstanceNotFound')) {
                    console.log(`DB instance ${dbInstanceIdentifier} has been successfully deleted`);
                    return true;
                }
                
                // For other errors, only throw on final attempt
                if (attempt === maxAttempts - 1) {
                    throw new Error(`Failed to confirm DB instance deletion: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Security Group Management Methods
    
    updateSecurityGroupRules(): void {
        // Only update rules for auto-created security groups
        if (!this.state.created_security_group_id || this.state.created_security_group_existing) {
            return;
        }
    
        const groupId = this.state.created_security_group_id;
        const port = this.definition.port || this.getDefaultPortForEngine(this.definition.engine);
        const allowedCidrs = this.definition.allowed_cidr_blocks || [];
        const allowedSgNames = this.definition.allowed_security_group_names || [];
        const vpcId = this.definition.vpc_id;
        
        updateSecurityGroupRules(this.region, groupId, port, [...allowedCidrs], [...allowedSgNames], vpcId);
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
        
        // Check if we already created a security group for this instance
        if (this.state.created_security_group_id) {
            // Verify it still exists
            if (checkSecurityGroupExists(this.region, this.state.created_security_group_id)) {
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
            let groupId = findSecurityGroupByName(this.region, groupName, vpcId);
            let isExisting = false;
            
                            if (groupId) {
                    // Security group already exists, use it
                    isExisting = true;
                } else {
                    // Create a new security group
                    groupId = createSecurityGroup(this.region, groupName, description, vpcId);
                }
            
            // Resolve security group names to IDs
            const allowedSgIds = allowedSgNames.length > 0 ? 
                resolveSecurityGroupNames(this.region, [...allowedSgNames], vpcId) : [];
            
                // Add ingress rules for database port (only if we created a new security group)
                // For existing security groups, we assume they already have the correct rules
                if (!isExisting && (allowedCidrs.length > 0 || allowedSgIds.length > 0)) {
                    authorizeSecurityGroupIngress(this.region, groupId, 'tcp', port, port, [...allowedCidrs], allowedSgIds);
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

    protected cleanupCreatedSecurityGroup(): void {
        if (this.state.created_security_group_id && !this.state.created_security_group_existing) {
            try {
                cli.output(`Deleting created security group: ${this.state.created_security_group_id}`);
                deleteSecurityGroup(this.region, this.state.created_security_group_id);
                this.state.created_security_group_id = undefined;
                this.state.created_security_group_existing = false;
            } catch (error) {
                cli.output(`Warning: Could not delete security group ${this.state.created_security_group_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                // Don't throw error here - we still want to proceed with other cleanup
            }
        }
    }

    protected getDefaultPortForEngine(engine: string): number {
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
} 