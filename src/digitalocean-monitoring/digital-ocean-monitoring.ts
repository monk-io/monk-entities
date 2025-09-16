import { action, Args } from "monkec/base";
import { DOMonitoringEntity, DOMonitoringDefinitionBase, DOMonitoringStateBase } from "./do-provider-base.ts";
import { 
    MetricType, 
    AlertComparisonOperator, 
    AlertWindow, 
    SlackChannel,
    validateMetricType,
    validateComparisonOperator,
    validateWindow,
    validateEmail,
    validateSlackUrl,
    generateTimeRange
} from "./common.ts";
import cli from "cli";

/**
 * Defines the immutable configuration properties for a DigitalOcean Monitoring entity.
 */
export interface DigitalOceanMonitoringDefinition extends DOMonitoringDefinitionBase {
    /**
     * Alert policy name
     * @description Unique name for the alert policy
     */
    name: string;

    /**
     * Metric type to monitor
     * @description Type of metric to monitor (e.g., v1/insights/droplet/cpu)
     */
    metric_type: MetricType;

    /**
     * Comparison operator
     * @description How to compare the metric value (GreaterThan or LessThan)
     */
    compare: AlertComparisonOperator;

    /**
     * Threshold value
     * @description The threshold value for the alert
     */
    value: number;

    /**
     * Time window for evaluation
     * @description Time window for metric evaluation (5m, 10m, 30m, 1h)
     */
    window: AlertWindow;

    /**
     * Alert description
     * @description Optional description of the alert policy (auto-generated if not provided)
     */
    alert_description?: string;

    /**
     * Email addresses for notifications
     * @description Array of email addresses (auto-detected from account if not provided)
     */
    emails?: string[];

    /**
     * Droplet IDs to monitor
     * @description Array of specific Droplet IDs to monitor
     */
    entities?: string[];

    /**
     * Tags to match Droplets
     * @description Array of tags to match Droplets for monitoring
     */
    tags?: string[];

    /**
     * Slack channel configurations
     * @description Array of Slack webhook configurations for notifications
     */
    slack_channels?: SlackChannel[];

    /**
     * Whether the alert is enabled
     * @description Whether the alert policy is enabled (default: true)
     */
    enabled?: boolean;
}

/**
 * Represents the mutable runtime state of a DigitalOcean Monitoring entity.
 */
export interface DigitalOceanMonitoringState extends DOMonitoringStateBase {
    /**
     * Alert policy UUID
     */
    uuid?: string;

    /**
     * Alert policy name
     */
    name?: string;

    /**
     * Metric type
     */
    type?: string;

    /**
     * Alert description
     */
    description?: string;

    /**
     * Comparison operator
     */
    compare?: string;

    /**
     * Threshold value
     */
    value?: number;

    /**
     * Time window
     */
    window?: string;

    /**
     * Entities being monitored
     */
    entities?: string[];

    /**
     * Tags being monitored
     */
    tags?: string[];

    /**
     * Alert configuration
     */
    alerts?: {
        email?: string[];
        slack?: SlackChannel[];
    };

    /**
     * Whether the alert is enabled
     */
    enabled?: boolean;

    /**
     * Creation timestamp
     */
    created_at?: string;
}

/**
 * DigitalOcean Monitoring entity for managing monitoring and alert policies.
 * 
 * This entity provides comprehensive monitoring capabilities for DigitalOcean resources
 * including alert policy management, metrics collection, and account information access.
 */
export class DigitalOceanMonitoring extends DOMonitoringEntity<
    DigitalOceanMonitoringDefinition,
    DigitalOceanMonitoringState
> {

    protected getEntityName(): string {
        return `DigitalOcean Monitoring: ${this.definition.name}`;
    }

    create(): void {
        cli.output(`🚀 Creating DigitalOcean monitoring alert policy: ${this.definition.name}`);

        // Check if we should create when missing
        if (!this.shouldCreateWhenMissing()) {
            cli.output(`🧪 Test mode: create_when_missing is false, setting ready state without creating`);
            this.state.uuid = "test-mode-uuid";
            this.state.name = this.definition.name;
            this.state.type = this.definition.metric_type;
            this.state.enabled = true;
            return;
        }

        // Validate configuration
        const validatedType = validateMetricType(this.definition.metric_type);
        const validatedCompare = validateComparisonOperator(this.definition.compare);
        const validatedWindow = validateWindow(this.definition.window);

        // Check if alert policy already exists
        const existingPolicy = this.findExistingAlertPolicy();
        if (existingPolicy) {
            cli.output(`✅ Alert policy ${this.definition.name} already exists`);
            this.state.existing = true;
            this.updateStateFromPolicy(existingPolicy);
            return;
        }

        // Get emails for notifications
        let notificationEmails = this.definition.emails || [];
        if (notificationEmails.length === 0) {
            const verifiedEmail = this.getVerifiedEmail();
            if (verifiedEmail) {
                notificationEmails = [verifiedEmail];
                cli.output(`📧 Auto-detected verified email: ${verifiedEmail}`);
            }
        }

        // Validate emails
        notificationEmails.forEach(email => {
            if (!validateEmail(email)) {
                throw new Error(`Invalid email address: ${email}`);
            }
        });

        // Validate Slack channels
        if (this.definition.slack_channels) {
            this.definition.slack_channels.forEach(slack => {
                if (!validateSlackUrl(slack.url)) {
                    throw new Error(`Invalid Slack webhook URL: ${slack.url}`);
                }
            });
        }

        // Prepare alert policy creation request
        const createRequest = {
            type: validatedType,
            description: this.definition.alert_description || `Alert for ${this.definition.name}: ${validatedType} ${validatedCompare} ${this.definition.value}`,
            compare: validatedCompare,
            value: this.definition.value,
            window: validatedWindow,
            entities: this.definition.entities || [],
            tags: this.definition.tags || [],
            alerts: {
                email: notificationEmails,
                slack: this.definition.slack_channels || []
            },
            enabled: this.definition.enabled !== false
        };

        try {
            const response = this.makeRequest("POST", "/monitoring/alerts", createRequest);
            
            if (response.policy) {
                this.updateStateFromPolicy(response.policy);
                cli.output(`✅ Alert policy created successfully: ${this.state.uuid}`);
            } else {
                throw new Error("Invalid response from DigitalOcean API - no policy object returned");
            }
        } catch (error) {
            throw new Error(`Failed to create alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    update(): void {
        if (!this.state.uuid) {
            throw new Error("Cannot update alert policy - no policy UUID in state");
        }

        // Check if we should create when missing
        if (!this.shouldCreateWhenMissing()) {
            cli.output(`🧪 Test mode: create_when_missing is false, skipping update`);
            return;
        }

        cli.output(`🔄 Updating DigitalOcean alert policy: ${this.state.uuid}`);

        // Validate configuration
        const validatedType = validateMetricType(this.definition.metric_type);
        const validatedCompare = validateComparisonOperator(this.definition.compare);
        const validatedWindow = validateWindow(this.definition.window);

        // Get emails for notifications
        let notificationEmails = this.definition.emails || [];
        if (notificationEmails.length === 0) {
            const verifiedEmail = this.getVerifiedEmail();
            if (verifiedEmail) {
                notificationEmails = [verifiedEmail];
            }
        }

        // Validate emails
        notificationEmails.forEach(email => {
            if (!validateEmail(email)) {
                throw new Error(`Invalid email address: ${email}`);
            }
        });

        // Validate Slack channels
        if (this.definition.slack_channels) {
            this.definition.slack_channels.forEach(slack => {
                if (!validateSlackUrl(slack.url)) {
                    throw new Error(`Invalid Slack webhook URL: ${slack.url}`);
                }
            });
        }

        // Prepare update request
        const updateRequest = {
            type: validatedType,
            description: this.definition.alert_description || `Alert for ${this.definition.name}: ${validatedType} ${validatedCompare} ${this.definition.value}`,
            compare: validatedCompare,
            value: this.definition.value,
            window: validatedWindow,
            entities: this.definition.entities || [],
            tags: this.definition.tags || [],
            alerts: {
                email: notificationEmails,
                slack: this.definition.slack_channels || []
            },
            enabled: this.definition.enabled !== false
        };

        try {
            const response = this.makeRequest("PUT", `/monitoring/alerts/${this.state.uuid}`, updateRequest);
            
            if (response.policy) {
                this.updateStateFromPolicy(response.policy);
                cli.output(`✅ Alert policy updated successfully`);
            } else {
                cli.output(`✅ Alert policy updated (no response data)`);
            }
        } catch (error) {
            throw new Error(`Failed to update alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    delete(): void {
        if (!this.state.uuid) {
            cli.output("⚪ No alert policy UUID in state, nothing to delete");
            return;
        }

        // Check if we should create when missing
        if (!this.shouldCreateWhenMissing()) {
            cli.output(`🧪 Test mode: create_when_missing is false, clearing state without deleting`);
            this.state.uuid = undefined;
            this.state.name = undefined;
            this.state.enabled = undefined;
            return;
        }

        this.deleteResource(`/monitoring/alerts/${this.state.uuid}`, `alert policy ${this.state.name || this.state.uuid}`);
        
        // Clear state after successful deletion
        this.state.uuid = undefined;
        this.state.name = undefined;
        this.state.type = undefined;
        this.state.description = undefined;
        this.state.enabled = undefined;
        this.state.alerts = undefined;
    }

    checkReadiness(): boolean {
        if (!this.state.uuid) {
            return false;
        }

        // In test mode, always return ready
        if (!this.shouldCreateWhenMissing()) {
            return true;
        }

        try {
            const response = this.makeRequest("GET", `/monitoring/alerts/${this.state.uuid}`);
            
            if (response.policy) {
                this.updateStateFromPolicy(response.policy);
                cli.output(`✅ Alert policy ${this.state.uuid} is ready`);
                return true;
            }
            
            return false;
        } catch (error) {
            cli.output(`❌ Failed to check alert policy readiness: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    // === Alert Policy Management Actions (7 actions) ===

    /**
     * Create a new alert policy manually
     */
    createAlertPolicy(args: Args): void {
        const name = args.name;
        const type = args.type;
        const compare = args.compare;
        const value = args.value;
        const window = args.window;
        const emails = args.emails;

        if (!name || !type || !compare || !value || !window) {
            throw new Error("Required parameters: --name, --type, --compare, --value, --window");
        }

        const validatedType = validateMetricType(type);
        const validatedCompare = validateComparisonOperator(compare);
        const validatedWindow = validateWindow(window);

        // Get emails for notifications
        let notificationEmails: string[] = [];
        if (emails) {
            notificationEmails = emails.split(',').map((email: string) => email.trim());
        } else {
            const verifiedEmail = this.getVerifiedEmail();
            if (verifiedEmail) {
                notificationEmails = [verifiedEmail];
            }
        }

        // Validate emails
        notificationEmails.forEach(email => {
            if (!validateEmail(email)) {
                throw new Error(`Invalid email address: ${email}`);
            }
        });

        const createRequest = {
            type: validatedType,
            description: `Manual alert: ${name}`,
            compare: validatedCompare,
            value: parseFloat(value),
            window: validatedWindow,
            entities: args.entities ? args.entities.split(',') : [],
            tags: args.tags ? args.tags.split(',') : [],
            alerts: {
                email: notificationEmails,
                slack: []
            },
            enabled: true
        };

        try {
            const response = this.makeRequest("POST", "/monitoring/alerts", createRequest);
            
            if (response.policy) {
                cli.output(`✅ Successfully created alert policy: ${response.policy.uuid}\n   Type: ${response.policy.type}\n   Description: ${response.policy.description}\n   Compare: ${response.policy.compare} ${response.policy.value}\n   Window: ${response.policy.window}`);
            }
        } catch (error) {
            throw new Error(`Failed to create alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * List all alert policies
     */
    @action("list-alert-policies")
    listAlertPolicies(_args: Args): void {
        try {
            const response = this.makeRequest("GET", "/monitoring/alerts");
            const policies = response.policies || [];
            
            let output = `📋 Alert Policies (${policies.length} total):`;
            
            if (policies.length === 0) {
                output += "\n   No alert policies found";
            } else {
                policies.forEach((policy: any, index: number) => {
                    const status = policy.enabled ? "✅ enabled" : "❌ disabled";
                    output += `\n   ${index + 1}. ${policy.uuid} - ${policy.type} ${policy.compare} ${policy.value} (${status})`;
                });
            }
            
            cli.output(output);
        } catch (error) {
            throw new Error(`Failed to list alert policies: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get alert policy information
     */
    @action("get-alert-policy")
    getAlertPolicy(args: Args): void {
        const policyUuid = args.policy_uuid || this.state.uuid;
        
        if (!policyUuid) {
            throw new Error("No alert policy UUID available (use --policy_uuid=UUID or ensure entity has a UUID)");
        }

        try {
            const response = this.makeRequest("GET", `/monitoring/alerts/${policyUuid}`);
            
            if (response.policy) {
                if (policyUuid === this.state.uuid) {
                    this.updateStateFromPolicy(response.policy);
                }
                
                const policy = response.policy;
                let output = `📊 Alert Policy Information:\n   UUID: ${policy.uuid}\n   Type: ${policy.type}\n   Description: ${policy.description}\n   Compare: ${policy.compare}\n   Value: ${policy.value}\n   Window: ${policy.window}\n   Enabled: ${policy.enabled}\n   Created: ${policy.created_at}`;
                
                if (policy.entities && policy.entities.length > 0) {
                    output += `\n   Entities: ${policy.entities.join(', ')}`;
                }
                
                if (policy.tags && policy.tags.length > 0) {
                    output += `\n   Tags: ${policy.tags.join(', ')}`;
                }
                
                if (policy.alerts) {
                    if (policy.alerts.email && policy.alerts.email.length > 0) {
                        output += `\n   Email notifications: ${policy.alerts.email.join(', ')}`;
                    }
                    if (policy.alerts.slack && policy.alerts.slack.length > 0) {
                        output += `\n   Slack channels: ${policy.alerts.slack.length} configured`;
                    }
                }
                
                cli.output(output);
            } else {
                throw new Error("Alert policy not found");
            }
        } catch (error) {
            throw new Error(`Failed to get alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Update an alert policy
     */
    updateAlertPolicy(args: Args): void {
        const policyUuid = args.policy_uuid;
        
        if (!policyUuid) {
            throw new Error("Alert policy UUID is required (use --policy_uuid=UUID)");
        }

        // Get current policy
        const currentResponse = this.makeRequest("GET", `/monitoring/alerts/${policyUuid}`);
        if (!currentResponse.policy) {
            throw new Error("Alert policy not found");
        }

        const currentPolicy = currentResponse.policy;

        // Build update request with only specified changes
        const updateRequest: any = {
            type: args.type || currentPolicy.type,
            description: args.description || currentPolicy.description,
            compare: args.compare || currentPolicy.compare,
            value: args.value ? parseFloat(args.value) : currentPolicy.value,
            window: args.window || currentPolicy.window,
            entities: args.entities ? args.entities.split(',') : (currentPolicy.entities || []),
            tags: args.tags ? args.tags.split(',') : (currentPolicy.tags || []),
            alerts: currentPolicy.alerts || { email: [], slack: [] },
            enabled: args.enabled !== undefined ? (args.enabled === 'true') : currentPolicy.enabled
        };

        // Update emails if specified
        if (args.emails) {
            const notificationEmails = args.emails.split(',').map((email: string) => email.trim());
            notificationEmails.forEach(email => {
                if (!validateEmail(email)) {
                    throw new Error(`Invalid email address: ${email}`);
                }
            });
            updateRequest.alerts.email = notificationEmails;
        }

        try {
            const response = this.makeRequest("PUT", `/monitoring/alerts/${policyUuid}`, updateRequest);
            
            let output = `✅ Successfully updated alert policy: ${policyUuid}`;
            if (response.policy) {
                output += `\n   Type: ${response.policy.type}\n   Compare: ${response.policy.compare} ${response.policy.value}\n   Enabled: ${response.policy.enabled}`;
            }
            cli.output(output);
        } catch (error) {
            throw new Error(`Failed to update alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Delete an alert policy
     */
    deleteAlertPolicy(args: Args): void {
        const policyUuid = args.policy_uuid;
        
        if (!policyUuid) {
            throw new Error("Alert policy UUID is required (use --policy_uuid=UUID)");
        }

        try {
            this.makeRequest("DELETE", `/monitoring/alerts/${policyUuid}`);
            cli.output(`✅ Successfully deleted alert policy: ${policyUuid}`);
        } catch (error) {
            throw new Error(`Failed to delete alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Enable an alert policy
     */
    @action("enable-alert-policy")
    enableAlertPolicy(args: Args): void {
        const policyUuid = args.policy_uuid;
        
        if (!policyUuid) {
            throw new Error("Alert policy UUID is required (use --policy_uuid=UUID)");
        }

        // Get current policy and update with enabled=true
        try {
            const currentResponse = this.makeRequest("GET", `/monitoring/alerts/${policyUuid}`);
            if (!currentResponse.policy) {
                throw new Error("Alert policy not found");
            }

            const updateRequest = {
                ...currentResponse.policy,
                enabled: true
            };

            this.makeRequest("PUT", `/monitoring/alerts/${policyUuid}`, updateRequest);
            cli.output(`✅ Successfully enabled alert policy: ${policyUuid}`);
        } catch (error) {
            throw new Error(`Failed to enable alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Disable an alert policy
     */
    @action("disable-alert-policy")
    disableAlertPolicy(args: Args): void {
        const policyUuid = args.policy_uuid;
        
        if (!policyUuid) {
            throw new Error("Alert policy UUID is required (use --policy_uuid=UUID)");
        }

        // Get current policy and update with enabled=false
        try {
            const currentResponse = this.makeRequest("GET", `/monitoring/alerts/${policyUuid}`);
            if (!currentResponse.policy) {
                throw new Error("Alert policy not found");
            }

            const updateRequest = {
                ...currentResponse.policy,
                enabled: false
            };

            this.makeRequest("PUT", `/monitoring/alerts/${policyUuid}`, updateRequest);
            cli.output(`✅ Successfully disabled alert policy: ${policyUuid}`);
        } catch (error) {
            throw new Error(`Failed to disable alert policy: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // === Monitoring Sinks Management (2 actions) ===

    /**
     * List all monitoring sinks
     */
    @action("list-sinks")
    listSinks(_args: Args): void {
        try {
            const response = this.makeRequest("GET", "/monitoring/sinks");
            const sinks = response.sinks || [];
            
            let output = `📋 Monitoring Sinks (${sinks.length} total):`;
            
            if (sinks.length === 0) {
                output += "\n   No monitoring sinks found";
            } else {
                sinks.forEach((sink: any, index: number) => {
                    output += `\n   ${index + 1}. ${sink.name} (${sink.type})`;
                });
            }
            
            cli.output(output);
        } catch (error) {
            throw new Error(`Failed to list monitoring sinks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get monitoring sink details
     */
    @action("get-sink")
    getSink(args: Args): void {
        const sinkId = args.sink_id;
        
        if (!sinkId) {
            throw new Error("Sink ID is required (use --sink_id=SINK_ID)");
        }

        try {
            const response = this.makeRequest("GET", `/monitoring/sinks/${sinkId}`);
            
            if (response.sink) {
                const sink = response.sink;
                cli.output(`📊 Monitoring Sink Information:\n   ID: ${sink.id}\n   Name: ${sink.name}\n   Type: ${sink.type}\n   Configuration: ${JSON.stringify(sink.config, null, 2)}`);
            } else {
                throw new Error("Monitoring sink not found");
            }
        } catch (error) {
            throw new Error(`Failed to get monitoring sink: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // === Account & Information (2 actions) ===

    /**
     * Get DigitalOcean account information and limits
     */
    @action("get-account-info")
    getAccountInfoAction(_args: Args): void {
        try {
            const response = this.getAccountInfo();
            
            if (response.account) {
                const account = response.account;
                let output = `📊 DigitalOcean Account Information:\n   Email: ${account.email}\n   Email Verified: ${account.email_verified ? '✅ Yes' : '❌ No'}\n   UUID: ${account.uuid}\n   Status: ${account.status}\n   Droplet Limit: ${account.droplet_limit}\n   Floating IP Limit: ${account.floating_ip_limit}`;
                
                if (account.status_message) {
                    output += `\n   Status Message: ${account.status_message}`;
                }
                
                cli.output(output);
            } else {
                throw new Error("Account information not found");
            }
        } catch (error) {
            throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }


    // === Droplet Metrics (15 actions) ===

    /**
     * Get general droplet metrics
     */
    @action("get-droplet-metrics")
    getDropletMetrics(args: Args): void {
        const dropletId = args.droplet_id;
        const metricType = args.metric_type;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }
        
        if (!metricType) {
            throw new Error("Metric type is required (use --metric_type=METRIC_TYPE)");
        }

        const validatedType = validateMetricType(metricType);
        
        // Use provided time range or auto-generate
        let startTime = args.start_time;
        let endTime = args.end_time;
        
        if (!startTime || !endTime) {
            const timeRange = generateTimeRange();
            startTime = timeRange.start_time;
            endTime = timeRange.end_time;
            cli.output(`📅 Using auto time range: ${startTime} to ${endTime}`);
        }

        try {
            const queryParams = `type=${encodeURIComponent(validatedType)}&start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/droplet/${dropletId}?${queryParams}`);
            
            cli.output(`📊 Droplet Metrics (${dropletId}):\n   Metric Type: ${validatedType}\n   Time Range: ${startTime} to ${endTime}`);
            
            if (response.data && response.data.result) {
                const results = response.data.result;
                let dataOutput = `   Data Points: ${results.length}`;
                
                results.forEach((result: any, index: number) => {
                    if (result.values && result.values.length > 0) {
                        const latestValue = result.values[result.values.length - 1];
                        dataOutput += `\n   ${index + 1}. Latest Value: ${latestValue[1]} at ${new Date(latestValue[0] * 1000).toISOString()}`;
                    }
                });
                
                cli.output(dataOutput);
            } else {
                cli.output("   No data available for this time range");
            }
        } catch (error) {
            throw new Error(`Failed to get droplet metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get CPU metrics for a droplet
     */
    @action("get-droplet-cpu-metrics")
    getDropletCpuMetrics(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        const timeRange = generateTimeRange();
        
        try {
            const queryParams = `type=${encodeURIComponent("v1/insights/droplet/cpu")}&start=${encodeURIComponent(timeRange.start_time)}&end=${encodeURIComponent(timeRange.end_time)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/droplet/${dropletId}?${queryParams}`);
            
            cli.output(`🖥️ Droplet CPU Metrics (${dropletId}):\n   Time Range: Last 1 hour`);
            
            this.displayMetricsResponse(response, "CPU Utilization %");
        } catch (error) {
            throw new Error(`Failed to get droplet CPU metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get memory metrics for a droplet
     */
    @action("get-droplet-memory-metrics")
    getDropletMemoryMetrics(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        const timeRange = generateTimeRange();
        
        try {
            const queryParams = `type=${encodeURIComponent("v1/insights/droplet/memory_utilization_percent")}&start=${encodeURIComponent(timeRange.start_time)}&end=${encodeURIComponent(timeRange.end_time)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/droplet/${dropletId}?${queryParams}`);
            
            cli.output(`💾 Droplet Memory Metrics (${dropletId}):\n   Time Range: Last 1 hour`);
            
            this.displayMetricsResponse(response, "Memory Utilization %");
        } catch (error) {
            throw new Error(`Failed to get droplet memory metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get disk metrics for a droplet
     */
    @action("get-droplet-disk-metrics")
    getDropletDiskMetrics(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        const timeRange = generateTimeRange();
        
        try {
            const queryParams = `type=${encodeURIComponent("v1/insights/droplet/disk_utilization_percent")}&start=${encodeURIComponent(timeRange.start_time)}&end=${encodeURIComponent(timeRange.end_time)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/droplet/${dropletId}?${queryParams}`);
            
            cli.output(`💽 Droplet Disk Metrics (${dropletId}):\n   Time Range: Last 1 hour`);
            
            this.displayMetricsResponse(response, "Disk Utilization %");
        } catch (error) {
            throw new Error(`Failed to get droplet disk metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get network metrics for a droplet
     */
    @action("get-droplet-network-metrics")
    getDropletNetworkMetrics(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        const timeRange = generateTimeRange();
        
        const metrics = [
            { type: "v1/insights/droplet/public_inbound_bandwidth", name: "Public Inbound Bandwidth" },
            { type: "v1/insights/droplet/public_outbound_bandwidth", name: "Public Outbound Bandwidth" },
            { type: "v1/insights/droplet/private_inbound_bandwidth", name: "Private Inbound Bandwidth" },
            { type: "v1/insights/droplet/private_outbound_bandwidth", name: "Private Outbound Bandwidth" }
        ];

        cli.output(`🌐 Droplet Network Metrics (${dropletId}):\n   Time Range: Last 1 hour`);

        try {
            let output = "";
            for (const metric of metrics) {
                const queryParams = `type=${encodeURIComponent(metric.type)}&start=${encodeURIComponent(timeRange.start_time)}&end=${encodeURIComponent(timeRange.end_time)}`;
                
                const response = this.makeRequest("GET", `/monitoring/metrics/droplet/${dropletId}?${queryParams}`);
                
                output += `\n\n📊 ${metric.name}:`;
                output += this.formatMetricsResponse(response, "Bytes");
            }
            
            if (output) {
                cli.output(output);
            }
        } catch (error) {
            throw new Error(`Failed to get droplet network metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get inbound bandwidth metrics
     */
    @action("get-droplet-bandwidth-inbound")
    getDropletBandwidthInbound(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/public_inbound_bandwidth", "📥 Public Inbound Bandwidth");
    }

    /**
     * Get outbound bandwidth metrics
     */
    @action("get-droplet-bandwidth-outbound")
    getDropletBandwidthOutbound(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/public_outbound_bandwidth", "📤 Public Outbound Bandwidth");
    }

    /**
     * Get private inbound bandwidth metrics
     */
    @action("get-droplet-private-bandwidth-inbound")
    getDropletPrivateBandwidthInbound(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/private_inbound_bandwidth", "📥 Private Inbound Bandwidth");
    }

    /**
     * Get private outbound bandwidth metrics
     */
    @action("get-droplet-private-bandwidth-outbound")
    getDropletPrivateBandwidthOutbound(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/private_outbound_bandwidth", "📤 Private Outbound Bandwidth");
    }

    /**
     * Get disk read metrics
     */
    @action("get-droplet-disk-read")
    getDropletDiskRead(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/disk_read", "📖 Disk Read Operations");
    }

    /**
     * Get disk write metrics
     */
    @action("get-droplet-disk-write")
    getDropletDiskWrite(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/disk_write", "📝 Disk Write Operations");
    }

    /**
     * Get 1-minute load average
     */
    @action("get-droplet-load-average-1")
    getDropletLoadAverage1(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/load_1", "⚖️ 1-Minute Load Average");
    }

    /**
     * Get 5-minute load average
     */
    @action("get-droplet-load-average-5")
    getDropletLoadAverage5(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/load_5", "⚖️ 5-Minute Load Average");
    }

    /**
     * Get 15-minute load average
     */
    @action("get-droplet-load-average-15")
    getDropletLoadAverage15(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        this.getSpecificDropletMetric(dropletId, "v1/insights/droplet/load_15", "⚖️ 15-Minute Load Average");
    }

    /**
     * Get all droplet metrics combined
     */
    @action("get-all-droplet-metrics")
    getAllDropletMetrics(args: Args): void {
        const dropletId = args.droplet_id;
        
        if (!dropletId) {
            throw new Error("Droplet ID is required (use --droplet_id=DROPLET_ID)");
        }

        const timeRange = generateTimeRange();
        
        const metrics = [
            { type: "v1/insights/droplet/cpu", name: "🖥️ CPU Utilization" },
            { type: "v1/insights/droplet/memory_utilization_percent", name: "💾 Memory Utilization" },
            { type: "v1/insights/droplet/disk_utilization_percent", name: "💽 Disk Utilization" },
            { type: "v1/insights/droplet/load_1", name: "⚖️ 1-Min Load Average" },
            { type: "v1/insights/droplet/load_5", name: "⚖️ 5-Min Load Average" },
            { type: "v1/insights/droplet/load_15", name: "⚖️ 15-Min Load Average" },
            { type: "v1/insights/droplet/public_inbound_bandwidth", name: "📥 Public Inbound Bandwidth" },
            { type: "v1/insights/droplet/public_outbound_bandwidth", name: "📤 Public Outbound Bandwidth" },
            { type: "v1/insights/droplet/disk_read", name: "📖 Disk Read" },
            { type: "v1/insights/droplet/disk_write", name: "📝 Disk Write" }
        ];

        let output = `📊 All Droplet Metrics (${dropletId}):\n   Time Range: Last 1 hour`;

        try {
            for (const metric of metrics) {
                const queryParams = `type=${encodeURIComponent(metric.type)}&start=${encodeURIComponent(timeRange.start_time)}&end=${encodeURIComponent(timeRange.end_time)}`;
                
                const response = this.makeRequest("GET", `/monitoring/metrics/droplet/${dropletId}?${queryParams}`);
                
                output += `\n\n${metric.name}:`;
                output += this.formatMetricsResponse(response);
            }
            
            cli.output(output);
        } catch (error) {
            throw new Error(`Failed to get all droplet metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // === Other Resource Metrics (4 actions) ===

    /**
     * Get volume metrics
     */
    @action("get-volume-metrics")
    getVolumeMetrics(args: Args): void {
        const volumeId = args.volume_id;
        
        if (!volumeId) {
            throw new Error("Volume ID is required (use --volume_id=VOLUME_ID)");
        }

        // Use provided time range or auto-generate
        let startTime = args.start_time;
        let endTime = args.end_time;
        
        if (!startTime || !endTime) {
            const timeRange = generateTimeRange();
            startTime = timeRange.start_time;
            endTime = timeRange.end_time;
        }

        try {
            const queryParams = `start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/volume/${volumeId}?${queryParams}`);
            
            cli.output(`💾 Volume Metrics (${volumeId}):\n   Time Range: ${startTime} to ${endTime}`);
            
            this.displayMetricsResponse(response);
        } catch (error) {
            throw new Error(`Failed to get volume metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get app metrics
     */
    @action("get-app-metrics")
    getAppMetrics(args: Args): void {
        const appId = args.app_id;
        const component = args.component || "web";
        
        if (!appId) {
            throw new Error("App ID is required (use --app_id=APP_ID)");
        }

        // Use provided time range or auto-generate
        let startTime = args.start_time;
        let endTime = args.end_time;
        
        if (!startTime || !endTime) {
            const timeRange = generateTimeRange();
            startTime = timeRange.start_time;
            endTime = timeRange.end_time;
        }

        try {
            const queryParams = `component=${encodeURIComponent(component)}&start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/app/${appId}?${queryParams}`);
            
            cli.output(`📱 App Metrics (${appId}):\n   Component: ${component}\n   Time Range: ${startTime} to ${endTime}`);
            
            this.displayMetricsResponse(response);
        } catch (error) {
            throw new Error(`Failed to get app metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get load balancer metrics
     */
    @action("get-load-balancer-metrics")
    getLoadBalancerMetrics(args: Args): void {
        const lbId = args.lb_id;
        
        if (!lbId) {
            throw new Error("Load Balancer ID is required (use --lb_id=LB_ID)");
        }

        // Use provided time range or auto-generate
        let startTime = args.start_time;
        let endTime = args.end_time;
        
        if (!startTime || !endTime) {
            const timeRange = generateTimeRange();
            startTime = timeRange.start_time;
            endTime = timeRange.end_time;
        }

        try {
            const queryParams = `start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/load_balancer/${lbId}?${queryParams}`);
            
            cli.output(`⚖️ Load Balancer Metrics (${lbId}):\n   Time Range: ${startTime} to ${endTime}`);
            
            this.displayMetricsResponse(response);
        } catch (error) {
            throw new Error(`Failed to get load balancer metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get database metrics
     */
    @action("get-database-metrics")
    getDatabaseMetrics(args: Args): void {
        const dbId = args.db_id;
        
        if (!dbId) {
            throw new Error("Database ID is required (use --db_id=DB_ID)");
        }

        // Use provided time range or auto-generate
        let startTime = args.start_time;
        let endTime = args.end_time;
        
        if (!startTime || !endTime) {
            const timeRange = generateTimeRange();
            startTime = timeRange.start_time;
            endTime = timeRange.end_time;
        }

        try {
            const queryParams = `start=${encodeURIComponent(startTime)}&end=${encodeURIComponent(endTime)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/database/${dbId}?${queryParams}`);
            
            cli.output(`🗄️ Database Metrics (${dbId}):\n   Time Range: ${startTime} to ${endTime}`);
            
            this.displayMetricsResponse(response);
        } catch (error) {
            throw new Error(`Failed to get database metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // === Helper Methods ===

    /**
     * Get specific droplet metric
     */
    private getSpecificDropletMetric(dropletId: string, metricType: string, metricName: string): void {
        const timeRange = generateTimeRange();
        
        try {
            const queryParams = `type=${encodeURIComponent(metricType)}&start=${encodeURIComponent(timeRange.start_time)}&end=${encodeURIComponent(timeRange.end_time)}`;
            
            const response = this.makeRequest("GET", `/monitoring/metrics/droplet/${dropletId}?${queryParams}`);
            
            cli.output(`${metricName} (${dropletId}):\n   Time Range: Last 1 hour`);
            
            this.displayMetricsResponse(response);
        } catch (error) {
            throw new Error(`Failed to get ${metricName.toLowerCase()}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Display metrics response in a formatted way
     */
    private displayMetricsResponse(response: any, unit?: string): void {
        cli.output(this.formatMetricsResponse(response, unit));
    }

    /**
     * Format metrics response as a string
     */
    private formatMetricsResponse(response: any, unit?: string): string {
        if (response.data && response.data.result) {
            const results = response.data.result;
            
            if (results.length === 0) {
                return "\n   No data available for this time range";
            }
            
            let output = "";
            results.forEach((result: any, index: number) => {
                if (result.values && result.values.length > 0) {
                    const latestValue = result.values[result.values.length - 1];
                    const value = unit ? `${latestValue[1]} ${unit}` : latestValue[1];
                    const timestamp = new Date(latestValue[0] * 1000).toISOString();
                    output += `\n   ${index + 1}. Latest: ${value} at ${timestamp}\n      Data points: ${result.values.length}`;
                } else {
                    output += `\n   ${index + 1}. No values available`;
                }
            });
            return output;
        } else {
            return "\n   No data available for this time range";
        }
    }

    /**
     * Find existing alert policy by checking description for name
     */
    private findExistingAlertPolicy(): any | null {
        try {
            const response = this.makeRequest("GET", "/monitoring/alerts");
            
            if (response.policies && Array.isArray(response.policies)) {
                // Try to find by name in description first
                const byName = response.policies.find(
                    (policy: any) => policy.description && policy.description.includes(this.definition.name)
                );
                
                if (byName) return byName;
                
                // Try to find by exact metric type and value match
                return response.policies.find(
                    (policy: any) => 
                        policy.type === this.definition.metric_type &&
                        policy.compare === this.definition.compare &&
                        policy.value === this.definition.value &&
                        policy.window === this.definition.window
                );
            }
            
            return null;
        } catch (error) {
            // If we can't list policies, assume it doesn't exist
            return null;
        }
    }

    /**
     * Update internal state from policy object
     */
    private updateStateFromPolicy(policy: any): void {
        this.state.uuid = policy.uuid;
        this.state.name = this.definition.name; // Keep our name
        this.state.type = policy.type;
        this.state.description = policy.description;
        this.state.compare = policy.compare;
        this.state.value = policy.value;
        this.state.window = policy.window;
        this.state.entities = policy.entities;
        this.state.tags = policy.tags;
        this.state.alerts = policy.alerts;
        this.state.enabled = policy.enabled;
        this.state.created_at = policy.created_at;
    }
}
