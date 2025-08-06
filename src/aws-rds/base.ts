import { MonkEntity } from "monkec/base";
import aws from "cloud/aws";

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
}

export interface RDSResponse {
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
            } catch (parseError) {
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
} 