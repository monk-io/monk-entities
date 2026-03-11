import {
    AWSNeptuneEntity,
    AWSNeptuneDefinition,
    AWSNeptuneState,
    action
} from "./neptune-base.ts";
import cli from "cli";
import aws from "cloud/aws";
import {
    InstanceStatus,
    InstanceClass,
    validateInstanceIdentifier,
    NEPTUNE_ENGINE
} from "./common.ts";

/**
 * Definition interface for AWS Neptune Instance entity.
 * Configures instance properties including identifier, class, and cluster association.
 * @interface InstanceDefinition
 */
export interface InstanceDefinition extends AWSNeptuneDefinition {
    /** @description Unique identifier for the Neptune instance (1-63 chars, starts with letter) */
    db_instance_identifier: string;
    
    /** @description Cluster identifier this instance belongs to */
    db_cluster_identifier: string;
    
    /** @description Instance class (e.g., db.r5.large, db.serverless) */
    db_instance_class: InstanceClass | string;
    
    /** @description Neptune engine version */
    engine_version?: string;
    
    /** @description Availability zone for the instance */
    availability_zone?: string;
    
    /** @description DB parameter group name */
    db_parameter_group_name?: string;
    
    /** @description Preferred maintenance window (UTC, ddd:hh24:mi-ddd:hh24:mi) */
    preferred_maintenance_window?: string;
    
    /** @description Enable automatic minor version upgrades */
    auto_minor_version_upgrade?: boolean;
    
    /** @description Promotion tier for failover (0-15, lower = higher priority) */
    promotion_tier?: number;
    
    /** @description Enable Performance Insights */
    enable_performance_insights?: boolean;
    
    /** @description Performance Insights retention period (7 or 731 days) */
    performance_insights_retention_period?: number;
    
    /** @description Resource tags for the instance */
    tags?: Record<string, string>;
}

/**
 * State interface for AWS Neptune Instance entity.
 * Contains runtime information about the created instance.
 * @interface InstanceState
 */
export interface InstanceState extends AWSNeptuneState {
    /** @description Full ARN of the instance */
    db_instance_arn?: string;
    
    /** @description Instance identifier */
    db_instance_identifier?: string;
    
    /** @description Cluster identifier */
    db_cluster_identifier?: string;
    
    /** @description Current status of the instance */
    status?: InstanceStatus;
    
    /** @description Instance endpoint address */
    endpoint_address?: string;
    
    /** @description Instance endpoint port */
    endpoint_port?: number;
    
    /** @description Instance class */
    db_instance_class?: string;
    
    /** @description Engine version */
    engine_version?: string;
    
    /** @description Availability zone */
    availability_zone?: string;
    
    /** @description Instance creation timestamp */
    instance_create_time?: string;
    
    /** @description Resource ID */
    dbi_resource_id?: string;
    
    /** @description Whether this is the primary writer instance */
    is_cluster_writer?: boolean;
}

/**
 * @description AWS Neptune Instance entity.
 * Creates and manages Amazon Neptune database instances within a cluster.
 * Instances provide the compute capacity for graph queries.
 * 
 * ## Secrets
 * - Reads: none (authenticated via AWS provider)
 * - Writes: none
 * 
 * ## State Fields for Composition
 * - `state.db_instance_arn` - Instance ARN for IAM policies
 * - `state.db_instance_identifier` - Instance identifier
 * - `state.endpoint_address` - Instance endpoint for direct connections
 * - `state.endpoint_port` - Connection port
 * - `state.is_cluster_writer` - Whether this is the primary writer
 * 
 * ## Composing with Other Entities
 * Works with:
 * - `aws-neptune/cluster` - Parent cluster for this instance
 * - `aws-neptune/parameter-group` - Instance parameter configuration
 * - `aws-iam/role` - Grant instance access to other services
 */
export class Instance extends AWSNeptuneEntity<InstanceDefinition, InstanceState> {
    
    static readonly readiness = { period: 10, initialDelay: 60, attempts: 90 };

    private validateDefinition(): void {
        if (!validateInstanceIdentifier(this.definition.db_instance_identifier)) {
            throw new Error(
                `Invalid instance identifier: ${this.definition.db_instance_identifier}. ` +
                `Must be 1-63 characters, start with a letter, contain only letters, numbers, and hyphens.`
            );
        }
    }

    override create(): void {
        this.validateDefinition();
        
        // Check if instance already exists
        try {
            const existing = this.getInstanceInfo(this.definition.db_instance_identifier);
            if (existing) {
                this.state = {
                    db_instance_arn: existing.db_instance_arn,
                    db_instance_identifier: existing.db_instance_identifier,
                    db_cluster_identifier: existing.db_cluster_identifier,
                    status: existing.status,
                    endpoint_address: existing.endpoint_address,
                    endpoint_port: existing.endpoint_port,
                    db_instance_class: existing.db_instance_class,
                    engine_version: existing.engine_version,
                    availability_zone: existing.availability_zone,
                    instance_create_time: existing.instance_create_time,
                    dbi_resource_id: existing.dbi_resource_id,
                    is_cluster_writer: existing.is_cluster_writer,
                    existing: true
                };
                return;
            }
        } catch (error) {
            if (!this.isNotFoundError(error)) {
                throw error;
            }
        }

        // Build create parameters
        const params: Record<string, any> = {
            DBInstanceIdentifier: this.definition.db_instance_identifier,
            DBClusterIdentifier: this.definition.db_cluster_identifier,
            DBInstanceClass: this.definition.db_instance_class,
            Engine: NEPTUNE_ENGINE
        };

        if (this.definition.engine_version) {
            params.EngineVersion = this.definition.engine_version;
        }

        if (this.definition.availability_zone) {
            params.AvailabilityZone = this.definition.availability_zone;
        }

        if (this.definition.db_parameter_group_name) {
            params.DBParameterGroupName = this.definition.db_parameter_group_name;
        }

        if (this.definition.preferred_maintenance_window) {
            params.PreferredMaintenanceWindow = this.definition.preferred_maintenance_window;
        }

        if (this.definition.auto_minor_version_upgrade !== undefined) {
            params.AutoMinorVersionUpgrade = this.definition.auto_minor_version_upgrade;
        }

        if (this.definition.promotion_tier !== undefined) {
            params.PromotionTier = this.definition.promotion_tier;
        }

        if (this.definition.enable_performance_insights !== undefined) {
            params.EnablePerformanceInsights = this.definition.enable_performance_insights;
        }

        if (this.definition.performance_insights_retention_period !== undefined) {
            params.PerformanceInsightsRetentionPeriod = this.definition.performance_insights_retention_period;
        }

        if (this.definition.tags && Object.keys(this.definition.tags).length > 0) {
            params.Tags = Object.entries(this.definition.tags).map(([key, value]) => ({
                Key: key,
                Value: value
            }));
        }

        const response = this.makeNeptuneRequest("CreateDBInstance", params);
        
        // Parse response
        const instanceArn = this.extractXmlValue(response, 'DBInstanceArn');

        this.state = {
            db_instance_arn: instanceArn,
            db_instance_identifier: this.definition.db_instance_identifier,
            db_cluster_identifier: this.definition.db_cluster_identifier,
            db_instance_class: this.definition.db_instance_class,
            status: 'creating',
            existing: false
        };
    }

    override checkReadiness(): boolean {
        if (!this.state.db_instance_identifier) {
            return false;
        }

        try {
            const info = this.getInstanceInfo(this.state.db_instance_identifier);
            if (!info) {
                return false;
            }

            // Update state with latest info
            this.state.status = info.status;
            this.state.endpoint_address = info.endpoint_address;
            this.state.endpoint_port = info.endpoint_port;
            this.state.engine_version = info.engine_version;
            this.state.availability_zone = info.availability_zone;
            this.state.instance_create_time = info.instance_create_time;
            this.state.dbi_resource_id = info.dbi_resource_id;
            this.state.is_cluster_writer = info.is_cluster_writer;

            return info.status === 'available';
        } catch (error) {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    override update(): void {
        if (!this.state.db_instance_identifier) {
            throw new Error("Instance not created yet");
        }

        this.validateDefinition();

        const params: Record<string, any> = {
            DBInstanceIdentifier: this.state.db_instance_identifier
        };

        let hasChanges = false;

        if (this.definition.db_instance_class && this.definition.db_instance_class !== this.state.db_instance_class) {
            params.DBInstanceClass = this.definition.db_instance_class;
            hasChanges = true;
        }

        if (this.definition.db_parameter_group_name) {
            params.DBParameterGroupName = this.definition.db_parameter_group_name;
            hasChanges = true;
        }

        if (this.definition.preferred_maintenance_window) {
            params.PreferredMaintenanceWindow = this.definition.preferred_maintenance_window;
            hasChanges = true;
        }

        if (this.definition.auto_minor_version_upgrade !== undefined) {
            params.AutoMinorVersionUpgrade = this.definition.auto_minor_version_upgrade;
            hasChanges = true;
        }

        if (this.definition.promotion_tier !== undefined) {
            params.PromotionTier = this.definition.promotion_tier;
            hasChanges = true;
        }

        if (this.definition.enable_performance_insights !== undefined) {
            params.EnablePerformanceInsights = this.definition.enable_performance_insights;
            hasChanges = true;
        }

        if (hasChanges) {
            this.makeNeptuneRequest("ModifyDBInstance", params);
        }
    }

    override delete(): void {
        if (!this.state.db_instance_identifier) {
            return;
        }

        if (this.state.existing) {
            return;
        }

        try {
            this.makeNeptuneRequest("DeleteDBInstance", {
                DBInstanceIdentifier: this.state.db_instance_identifier,
                SkipFinalSnapshot: true
            });
            this.state.status = 'deleting';
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return;
            }
            throw error;
        }
    }

    /**
     * Get instance information from AWS
     */
    private getInstanceInfo(instanceIdentifier: string): InstanceState | null {
        try {
            const response = this.makeNeptuneRequest("DescribeDBInstances", {
                DBInstanceIdentifier: instanceIdentifier
            });

            const status = this.extractXmlValue(response, 'DBInstanceStatus');
            if (!status) {
                return null;
            }

            return {
                db_instance_arn: this.extractXmlValue(response, 'DBInstanceArn'),
                db_instance_identifier: this.extractXmlValue(response, 'DBInstanceIdentifier'),
                db_cluster_identifier: this.extractXmlValue(response, 'DBClusterIdentifier'),
                status: status as InstanceStatus,
                endpoint_address: this.extractXmlValue(response, 'Address'),
                endpoint_port: parseInt(this.extractXmlValue(response, 'Port') || '8182'),
                db_instance_class: this.extractXmlValue(response, 'DBInstanceClass'),
                engine_version: this.extractXmlValue(response, 'EngineVersion'),
                availability_zone: this.extractXmlValue(response, 'AvailabilityZone'),
                instance_create_time: this.extractXmlValue(response, 'InstanceCreateTime'),
                dbi_resource_id: this.extractXmlValue(response, 'DbiResourceId'),
                is_cluster_writer: this.extractXmlValue(response, 'IsClusterWriter') === 'true'
            };
        } catch (error) {
            if (this.isNotFoundError(error)) {
                return null;
            }
            throw error;
        }
    }

    // ==================== Actions ====================

    /**
     * Get detailed instance information
     */
    @action("get-info")
    getInfo(): void {
        if (!this.state.db_instance_identifier) {
            throw new Error("Instance not created yet");
        }

        const info = this.getInstanceInfo(this.state.db_instance_identifier);
        if (!info) {
            throw new Error(`Instance ${this.state.db_instance_identifier} not found`);
        }

        cli.output("==================================================");
        cli.output(`Neptune Instance: ${info.db_instance_identifier}`);
        cli.output("==================================================");
        cli.output(`ARN: ${info.db_instance_arn}`);
        cli.output(`Cluster: ${info.db_cluster_identifier}`);
        cli.output(`Status: ${info.status}`);
        cli.output(`Class: ${info.db_instance_class}`);
        cli.output(`Engine Version: ${info.engine_version}`);
        cli.output("");
        cli.output("Endpoint:");
        cli.output(`  Address: ${info.endpoint_address}`);
        cli.output(`  Port: ${info.endpoint_port}`);
        cli.output("");
        cli.output(`Availability Zone: ${info.availability_zone}`);
        cli.output(`Is Writer: ${info.is_cluster_writer}`);
        cli.output(`Created: ${info.instance_create_time}`);
        cli.output("==================================================");
    }

    /**
     * Reboot the instance
     */
    @action("reboot")
    reboot(args?: { force_failover?: string }): void {
        if (!this.state.db_instance_identifier) {
            throw new Error("Instance not created yet");
        }

        const params: Record<string, any> = {
            DBInstanceIdentifier: this.state.db_instance_identifier
        };

        if (args?.force_failover === 'true') {
            params.ForceFailover = true;
        }

        this.makeNeptuneRequest("RebootDBInstance", params);

        cli.output(`✅ Instance ${this.state.db_instance_identifier} is rebooting`);
    }

    /**
     * Promote a read replica to standalone (for Aurora replicas)
     */
    @action("promote")
    promote(): void {
        if (!this.state.db_instance_identifier) {
            throw new Error("Instance not created yet");
        }

        if (this.state.is_cluster_writer) {
            cli.output("⚠️ This instance is already the cluster writer");
            return;
        }

        // For Neptune, promotion is done via cluster failover
        if (this.state.db_cluster_identifier) {
            this.makeNeptuneRequest("FailoverDBCluster", {
                DBClusterIdentifier: this.state.db_cluster_identifier,
                TargetDBInstanceIdentifier: this.state.db_instance_identifier
            });
            cli.output(`✅ Failover initiated to promote ${this.state.db_instance_identifier} to writer`);
        } else {
            throw new Error("Cannot promote: cluster identifier not found");
        }
    }

    /**
     * Get instance logs
     */
    @action("get-logs")
    getLogs(_args?: { log_file?: string }): void {
        if (!this.state.db_instance_identifier) {
            throw new Error("Instance not created yet");
        }

        const response = this.makeNeptuneRequest("DescribeDBLogFiles", {
            DBInstanceIdentifier: this.state.db_instance_identifier
        });

        cli.output("==================================================");
        cli.output(`Log Files for Instance: ${this.state.db_instance_identifier}`);
        cli.output("==================================================");

        const logFiles = this.extractXmlValues(response, 'LogFileName');
        const sizes = this.extractXmlValues(response, 'Size');

        if (logFiles.length > 0) {
            for (let i = 0; i < logFiles.length; i++) {
                cli.output(`📄 ${logFiles[i]}`);
                cli.output(`   Size: ${sizes[i] || 'unknown'} bytes`);
                cli.output("");
            }
        } else {
            cli.output("No log files found.");
        }

        cli.output("==================================================");
    }

    // ==================== Cost Estimation ====================

    /**
     * Map AWS region codes to location names for Pricing API
     */
    private getRegionToLocationMap(): Record<string, string> {
        return {
            'us-east-1': 'US East (N. Virginia)',
            'us-east-2': 'US East (Ohio)',
            'us-west-1': 'US West (N. California)',
            'us-west-2': 'US West (Oregon)',
            'ap-south-1': 'Asia Pacific (Mumbai)',
            'ap-southeast-1': 'Asia Pacific (Singapore)',
            'ap-southeast-2': 'Asia Pacific (Sydney)',
            'ap-northeast-1': 'Asia Pacific (Tokyo)',
            'ap-northeast-2': 'Asia Pacific (Seoul)',
            'ca-central-1': 'Canada (Central)',
            'eu-central-1': 'EU (Frankfurt)',
            'eu-west-1': 'EU (Ireland)',
            'eu-west-2': 'EU (London)',
            'eu-west-3': 'EU (Paris)',
            'eu-north-1': 'EU (Stockholm)',
            'me-south-1': 'Middle East (Bahrain)',
            'sa-east-1': 'South America (Sao Paulo)'
        };
    }

    /**
     * Parse pricing response from AWS Price List API
     */
    private parsePricingResponse(responseBody: string): number {
        try {
            const data = JSON.parse(responseBody);
            if (!data.PriceList || data.PriceList.length === 0) {
                return 0;
            }

            for (const priceItem of data.PriceList) {
                const product = typeof priceItem === 'string' ? JSON.parse(priceItem) : priceItem;
                const terms = product.terms?.OnDemand;
                if (!terms) continue;

                for (const termKey of Object.keys(terms)) {
                    const priceDimensions = terms[termKey].priceDimensions;
                    for (const dimKey of Object.keys(priceDimensions)) {
                        const pricePerUnit = parseFloat(priceDimensions[dimKey].pricePerUnit?.USD || '0');
                        if (pricePerUnit > 0) {
                            return pricePerUnit;
                        }
                    }
                }
            }
        } catch (error) {
            cli.output(`Warning: Failed to parse pricing: ${(error as Error).message}`);
        }
        return 0;
    }

    /**
     * Fetch Neptune instance pricing from AWS Price List API
     */
    private fetchNeptunePricing(instanceClass: string): {
        instanceHourly: number;
        storagePerGBMonth: number;
        ioPerMillion: number;
        source: string;
    } | null {
        const pricingRegion = 'us-east-1';
        const url = `https://api.pricing.${pricingRegion}.amazonaws.com/`;
        const location = this.getRegionToLocationMap()[this.region] || 'US East (N. Virginia)';

        // Fetch instance pricing
        const instanceFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonNeptune' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceClass }
        ];

        const instanceResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AmazonNeptune',
                Filters: instanceFilters,
                MaxResults: 10
            })
        });

        if (instanceResponse.statusCode !== 200) {
            cli.output(`AWS Pricing API returned status ${instanceResponse.statusCode} for Neptune instance pricing`);
            return null;
        }

        const instanceHourly = this.parsePricingResponse(instanceResponse.body);
        if (instanceHourly === 0) {
            cli.output(`No pricing found for Neptune instance class ${instanceClass} in ${location}`);
            return null;
        }

        // Fetch storage pricing
        const storageFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonNeptune' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'Database Storage' }
        ];

        const storageResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AmazonNeptune',
                Filters: storageFilters,
                MaxResults: 10
            })
        });

        if (storageResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${storageResponse.statusCode} for Neptune storage pricing`);
        }
        const storagePerGBMonth = this.parsePricingResponse(storageResponse.body);
        if (storagePerGBMonth <= 0) {
            throw new Error('Could not parse Neptune storage pricing from AWS Price List API response');
        }

        // Fetch I/O pricing
        const ioFilters = [
            { Type: 'TERM_MATCH', Field: 'serviceCode', Value: 'AmazonNeptune' },
            { Type: 'TERM_MATCH', Field: 'location', Value: location },
            { Type: 'TERM_MATCH', Field: 'productFamily', Value: 'System Operation' }
        ];

        const ioResponse = aws.post(url, {
            service: 'pricing',
            region: pricingRegion,
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSPriceListService.GetProducts'
            },
            body: JSON.stringify({
                ServiceCode: 'AmazonNeptune',
                Filters: ioFilters,
                MaxResults: 10
            })
        });

        if (ioResponse.statusCode !== 200) {
            throw new Error(`AWS Pricing API returned status ${ioResponse.statusCode} for Neptune I/O pricing`);
        }
        const ioPerRequest = this.parsePricingResponse(ioResponse.body);
        if (ioPerRequest <= 0) {
            throw new Error('Could not parse Neptune I/O pricing from AWS Price List API response');
        }
        const ioPerMillion = ioPerRequest * 1000000;

        return {
            instanceHourly,
            storagePerGBMonth,
            ioPerMillion,
            source: 'AWS Price List API'
        };
    }

    /**
     * Get CloudWatch metrics for Neptune instance (last 30 days)
     */
    private getCloudWatchNeptuneMetrics(): {
        gremlinRequestsPerSecond: number;
        sparqlRequestsPerSecond: number;
        volumeBytesUsed: number;
    } | null {
        try {
            const endTime = new Date();
            const startTime = new Date();
            startTime.setDate(startTime.getDate() - 30);

            const startTimeISO = startTime.toISOString();
            const endTimeISO = endTime.toISOString();
            const url = `https://monitoring.${this.region}.amazonaws.com/`;

            const getMetric = (metricName: string, stat: string = 'Average'): number => {
                try {
                    const queryParams = [
                        'Action=GetMetricStatistics',
                        'Version=2010-08-01',
                        'Namespace=AWS%2FNeptune',
                        `MetricName=${encodeURIComponent(metricName)}`,
                        `StartTime=${encodeURIComponent(startTimeISO)}`,
                        `EndTime=${encodeURIComponent(endTimeISO)}`,
                        'Period=2592000',
                        `Statistics.member.1=${stat}`,
                        'Dimensions.member.1.Name=DBInstanceIdentifier',
                        `Dimensions.member.1.Value=${encodeURIComponent(this.state.db_instance_identifier!)}`
                    ];

                    const response = aws.get(`${url}?${queryParams.join('&')}`, {
                        service: 'monitoring',
                        region: this.region
                    });

                    if (response.statusCode !== 200) return 0;

                    const match = stat === 'Sum'
                        ? response.body.match(/<Sum>([\d.]+)<\/Sum>/)
                        : response.body.match(/<Average>([\d.]+)<\/Average>/);
                    return match ? parseFloat(match[1]) : 0;
                } catch (_e) {
                    return 0;
                }
            };

            return {
                gremlinRequestsPerSecond: getMetric('GremlinRequestsPerSec'),
                sparqlRequestsPerSecond: getMetric('SparqlRequestsPerSec'),
                volumeBytesUsed: getMetric('VolumeBytesUsed', 'Average')
            };
        } catch (error) {
            return null;
        }
    }

    @action("get-cost-estimate")
    getCostEstimate(): void {
        if (!this.state.db_instance_identifier) {
            throw new Error("Neptune instance not created yet");
        }

        const instanceClass = this.state.db_instance_class || this.definition.db_instance_class;
        if (!instanceClass) {
            throw new Error("Instance class not available for cost estimation");
        }

        cli.output(`\n💰 Cost Estimate for Neptune Instance: ${this.state.db_instance_identifier}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📊 Instance Configuration:`);
        cli.output(`   Instance: ${this.state.db_instance_identifier}`);
        cli.output(`   Cluster: ${this.state.db_cluster_identifier || 'N/A'}`);
        cli.output(`   Instance Class: ${instanceClass}`);
        cli.output(`   Engine Version: ${this.state.engine_version || 'N/A'}`);
        cli.output(`   Region: ${this.region}`);
        cli.output(`   Is Writer: ${this.state.is_cluster_writer || false}`);

        // Get pricing from AWS Price List API
        const pricing = this.fetchNeptunePricing(instanceClass);
        if (!pricing) {
            throw new Error("Failed to fetch pricing from AWS Price List API. Ensure you have pricing:GetProducts permission.");
        }

        const hoursPerMonth = 730;

        // Compute cost
        const instanceCostMonthly = pricing.instanceHourly * hoursPerMonth;

        cli.output(`\n💻 Compute Costs:`);
        cli.output(`   Instance Class: ${instanceClass}`);
        cli.output(`   Hourly Rate: $${pricing.instanceHourly.toFixed(4)}`);
        cli.output(`   Monthly Cost: $${instanceCostMonthly.toFixed(2)}`);

        // Storage cost (from CloudWatch if available)
        let storageCostMonthly = 0;
        const metrics = this.getCloudWatchNeptuneMetrics();

        if (metrics && metrics.volumeBytesUsed > 0) {
            const storageGB = metrics.volumeBytesUsed / (1024 * 1024 * 1024);
            storageCostMonthly = storageGB * pricing.storagePerGBMonth;

            cli.output(`\n💾 Storage Costs:`);
            cli.output(`   Volume Used: ${storageGB.toFixed(2)} GB`);
            cli.output(`   Rate: $${pricing.storagePerGBMonth.toFixed(3)}/GB-month`);
            cli.output(`   Monthly Cost: $${storageCostMonthly.toFixed(2)}`);
        } else {
            cli.output(`\n💾 Storage Costs:`);
            cli.output(`   Rate: $${pricing.storagePerGBMonth.toFixed(3)}/GB-month`);
            cli.output(`   ⚠️ CloudWatch metrics unavailable - storage cost not included`);
        }

        // I/O cost info
        cli.output(`\n📈 I/O Costs:`);
        cli.output(`   Rate: $${pricing.ioPerMillion.toFixed(2)} per million I/O requests`);
        if (metrics) {
            cli.output(`   Gremlin Requests/sec (avg): ${metrics.gremlinRequestsPerSecond.toFixed(2)}`);
            cli.output(`   SPARQL Requests/sec (avg): ${metrics.sparqlRequestsPerSecond.toFixed(2)}`);
        } else {
            cli.output(`   ⚠️ CloudWatch metrics unavailable - I/O cost not included`);
        }

        // Backup cost info
        cli.output(`\n🔒 Backup Storage:`);
        cli.output(`   Rate: $0.023/GB-month (beyond free retention)`);

        const totalMonthlyCost = instanceCostMonthly + storageCostMonthly;

        cli.output(`\n${'='.repeat(60)}`);
        cli.output(`💰 ESTIMATED MONTHLY COST: $${totalMonthlyCost.toFixed(2)}`);
        cli.output(`${'='.repeat(60)}`);

        cli.output(`\n📝 Notes:`);
        cli.output(`   - Pricing from ${pricing.source}`);
        cli.output(`   - Compute cost is for this instance only (cluster may have multiple instances)`);
        cli.output(`   - Storage is shared across the cluster`);
        cli.output(`   - Does not include: I/O requests, backup beyond retention, data transfer`);
    }

    /**
     * Returns cost information in standardized format for Monk's billing system.
     */
    @action("costs")
    costs(): void {
        const instanceClass = this.state.db_instance_class || this.definition.db_instance_class;

        if (!instanceClass || !this.state.db_instance_identifier) {
            const result = {
                type: "aws-neptune-instance",
                costs: { month: { amount: "0", currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
            return;
        }

        try {
            const pricing = this.fetchNeptunePricing(instanceClass);
            if (!pricing) {
                const result = {
                    type: "aws-neptune-instance",
                    costs: { month: { amount: "0", currency: "USD" } }
                };
                cli.output(JSON.stringify(result));
                return;
            }

            const hoursPerMonth = 730;
            let totalMonthlyCost = pricing.instanceHourly * hoursPerMonth;

            // Add storage cost from CloudWatch if available
            const metrics = this.getCloudWatchNeptuneMetrics();
            if (metrics && metrics.volumeBytesUsed > 0) {
                const storageGB = metrics.volumeBytesUsed / (1024 * 1024 * 1024);
                totalMonthlyCost += storageGB * pricing.storagePerGBMonth;
            }

            const result = {
                type: "aws-neptune-instance",
                costs: { month: { amount: totalMonthlyCost.toFixed(2), currency: "USD" } }
            };
            cli.output(JSON.stringify(result));
        } catch (error) {
            const result = {
                type: "aws-neptune-instance",
                costs: { month: { amount: "0", currency: "USD", error: (error as Error).message } }
            };
            cli.output(JSON.stringify(result));
        }
    }
}
