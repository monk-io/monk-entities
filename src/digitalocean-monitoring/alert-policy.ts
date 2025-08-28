import { action, Args } from "monkec/base";
import { DOProviderEntity, DOProviderDefinitionBase, DOProviderStateBase } from "./do-provider-base";
import { 
  AlertPolicy, 
  AlertPolicyType, 
  AlertPolicyComparator, 
  AlertPolicyWindow,
  validateAlertPolicyType, 
  validateComparator, 
  validateWindow, 
  validateEmails 
} from "./common";
import cli from "cli";

export interface DigitalOceanMonitoringDefinition extends DOProviderDefinitionBase {
  /**
   * @description Name of the alert policy
   * @example "high-cpu-alert"
   */
  name: string;
  
  /**
   * @description Description of the alert policy
   * @example "Alert when CPU usage exceeds 80%"
   */
  alert_description?: string;
  
  /**
   * @description Type of metric to monitor
   * @example "v1/insights/droplet/cpu"
   */
  metric_type: AlertPolicyType;
  
  /**
   * @description Comparison operator for the threshold
   * @example "GreaterThan"
   */
  compare: AlertPolicyComparator;
  
  /**
   * @description Threshold value for the alert
   * @example 80
   */
  value: number;
  
  /**
   * @description Time window for evaluation
   * @example "10m"
   */
  window: AlertPolicyWindow;
  
  /**
   * @description Array of Droplet IDs to monitor
   * @example ["123456789", "987654321"]
   */
  entities?: string[];
  
  /**
   * @description Array of tags to match Droplets
   * @example ["production", "web-server"]
   */
  tags?: string[];
  
  /**
   * @description Array of email addresses for notifications
   * @example ["admin@example.com", "alerts@example.com"]
   */
  emails?: string[];
  
  /**
   * @description Slack webhook configurations for notifications
   */
  slack_channels?: Array<{
    /**
     * @description Slack channel name
     * @example "#alerts"
     */
    channel: string;
    /**
     * @description Slack webhook URL
     * @example "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
     */
    url: string;
  }>;
  
  /**
   * @description Whether the alert is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * @description Whether to create resources when missing (for testing)
   * @default true
   */
  create_when_missing?: boolean;
}

export interface DigitalOceanMonitoringState extends DOProviderStateBase {
  uuid?: string;
  name?: string;
  alert_description?: string;
  metric_type?: AlertPolicyType;
  compare?: AlertPolicyComparator;
  value?: number;
  window?: AlertPolicyWindow;
  entities?: string[];
  tags?: string[];
  emails?: string[];
  slack_channels?: Array<{
    channel: string;
    url: string;
  }>;
  enabled?: boolean;
  created_at?: string;
}

export class DigitalOceanMonitoring extends DOProviderEntity<DigitalOceanMonitoringDefinition, DigitalOceanMonitoringState> {

  static readonly readiness = { period: 15, initialDelay: 5, attempts: 40 };

  protected getEntityName(): string {
    return "DigitalOcean Monitoring Alert Policy";
  }

  override create(): any {
    try {
      // Validate inputs
      validateAlertPolicyType(this.definition.metric_type);
      validateComparator(this.definition.compare);
      validateWindow(this.definition.window);

      // Check if we should create resources (for testing)
      if (this.definition.create_when_missing === false) {
        // Test mode - simulate successful creation
        this.state.uuid = `test-uuid-${Date.now()}`;
        this.state.name = this.definition.name;
        this.state.alert_description = `Test alert policy for ${this.definition.name}`;
        this.state.metric_type = this.definition.metric_type;
        this.state.compare = this.definition.compare;
        this.state.value = this.definition.value;
        this.state.window = this.definition.window;
        this.state.entities = this.definition.entities ? [...this.definition.entities] : undefined;
        this.state.tags = this.definition.tags ? [...this.definition.tags] : undefined;
        this.state.emails = this.definition.emails ? [...this.definition.emails] : [];
        this.state.enabled = this.definition.enabled !== false;
        this.state.created_at = new Date().toISOString();
        
        cli.output(`Alert Policy Created (Test Mode): ${this.state.name}\nUUID: ${this.state.uuid}\nType: ${this.state.metric_type}\nThreshold: ${this.state.compare} ${this.state.value}\nWindow: ${this.state.window}\nNotifications: ${this.state.emails?.join(', ')}\nStatus: ${this.state.enabled ? 'Enabled' : 'Disabled'}`);
        return;
      }

      // Determine emails to use
      let emailsToUse = this.definition.emails || [];
      
      // If no emails provided, try to get account email from DigitalOcean API
      if (emailsToUse.length === 0) {
        try {
          cli.output(`🔍 Attempting to get account email from DigitalOcean API...`);
          const accountResponse = this.makeRequest('GET', '/account');
          cli.output(`📋 Account API Response: ${JSON.stringify(accountResponse, null, 2)}`);
          
          let accountEmail = null;
          let emailVerified = false;
          
          // Try different possible response structures
          if (accountResponse.account) {
            accountEmail = accountResponse.account.email;
            emailVerified = accountResponse.account.email_verified;
          } else if (accountResponse.email) {
            accountEmail = accountResponse.email;
            emailVerified = accountResponse.email_verified;
          }
          
          if (accountEmail) {
            if (emailVerified) {
              cli.output(`📧 Using verified account email: ${accountEmail}`);
              emailsToUse = [accountEmail];
            } else {
              cli.output(`⚠️ Account email ${accountEmail} is not verified in DigitalOcean`);
              throw new Error(`Account email ${accountEmail} is not verified. Please verify it in DigitalOcean or provide verified emails in configuration.`);
            }
          } else {
            cli.output(`❌ No email found in account response`);
            throw new Error(`No email found in DigitalOcean account. Please provide emails in configuration.`);
          }
        } catch (error) {
          cli.output(`❌ Failed to get account email: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw new Error(`Failed to get account email: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      if (emailsToUse.length > 0) {
        validateEmails([...emailsToUse]);
      }

      // Test API access first
      try {
        const testResponse = this.makeRequest('GET', '/monitoring/alerts');
        const alerts = testResponse.alerts || testResponse.policies || [];
        cli.output(`✅ API access verified, found ${alerts.length} existing policies`);
      } catch (error) {
        throw new Error(`API access test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Check if alert policy already exists
      const existingPolicy = this.findExistingPolicy();
      if (existingPolicy) {
        this.updateStateFromPolicy(existingPolicy);
        cli.output(`Alert Policy Found: ${this.state.name}\nUUID: ${this.state.uuid}\nType: ${this.state.metric_type}\nStatus: ${this.state.enabled ? 'Enabled' : 'Disabled'}\nCreated: ${this.state.created_at}`);
        return;
      }

      // Create new alert policy
      const policyData = this.buildPolicyData([...emailsToUse]);
      const response = this.makeRequest('POST', '/monitoring/alerts', policyData);

      cli.output(`📋 Create Response: ${JSON.stringify(response, null, 2)}`);
      
      if (response.policy) {
        // DigitalOcean returns 'policy' in create response
        this.updateStateFromPolicy(response.policy);
        cli.output(`Alert Policy Created: ${this.state.name}\nUUID: ${this.state.uuid}\nType: ${this.state.metric_type}\nThreshold: ${this.state.compare} ${this.state.value}\nWindow: ${this.state.window}\nNotifications: ${this.state.emails?.join(', ')}\nStatus: ${this.state.enabled ? 'Enabled' : 'Disabled'}`);
      } else if (response.alert) {
        this.updateStateFromPolicy(response.alert);
        cli.output(`Alert Policy Created: ${this.state.name}\nUUID: ${this.state.uuid}\nType: ${this.state.metric_type}\nThreshold: ${this.state.compare} ${this.state.value}\nWindow: ${this.state.window}\nNotifications: ${this.state.emails?.join(', ')}\nStatus: ${this.state.enabled ? 'Enabled' : 'Disabled'}`);
      } else if (response.alerts && response.alerts.length > 0) {
        // Try alternative response format
        this.updateStateFromPolicy(response.alerts[0]);
        cli.output(`Alert Policy Created: ${this.state.name}\nUUID: ${this.state.uuid}\nType: ${this.state.metric_type}\nThreshold: ${this.state.compare} ${this.state.value}\nWindow: ${this.state.window}\nNotifications: ${this.state.emails?.join(', ')}\nStatus: ${this.state.enabled ? 'Enabled' : 'Disabled'}`);
      } else {
        cli.output(`❌ Unexpected response format: ${JSON.stringify(response, null, 2)}`);
        throw new Error('Failed to create alert policy: No policy returned in response');
      }
    } catch (error: any) {
      throw new Error(`Failed to create alert policy: ${error.message}`);
    }
    
    return this.state;
  }

  override update(): any {
    try {
      // Check if we should create resources (for testing)
      if (this.definition.create_when_missing === false) {
        // Test mode - simulate successful update
        if (!this.state.uuid) {
          // If no existing state, create it
          this.create();
          return;
        }
        
        // Update existing test state
        this.state.name = this.definition.name;
        this.state.alert_description = `Test alert policy for ${this.definition.name}`;
        this.state.metric_type = this.definition.metric_type;
        this.state.compare = this.definition.compare;
        this.state.value = this.definition.value;
        this.state.window = this.definition.window;
        this.state.entities = this.definition.entities ? [...this.definition.entities] : undefined;
        this.state.tags = this.definition.tags ? [...this.definition.tags] : undefined;
        this.state.emails = this.definition.emails ? [...this.definition.emails] : [];
        this.state.enabled = this.definition.enabled !== false;
        
        cli.output(`Alert Policy Updated (Test Mode): ${this.state.name}\nUUID: ${this.state.uuid}\nType: ${this.state.metric_type}\nThreshold: ${this.state.compare} ${this.state.value}\nWindow: ${this.state.window}\nNotifications: ${this.state.emails?.join(', ')}\nStatus: ${this.state.enabled ? 'Enabled' : 'Disabled'}`);
        return;
      }

      // Check if policy exists
      const existingPolicy = this.findExistingPolicy();
      if (!existingPolicy) {
        // Create new policy if it doesn't exist
        this.create();
        return;
      }

      // Update existing policy
      let emailsToUse = this.definition.emails || [];
      if (emailsToUse.length === 0) {
        try {
          const accountResponse = this.makeRequest('GET', '/account');
          const accountEmail = accountResponse.account?.email;
          const emailVerified = accountResponse.account?.email_verified;
          
          if (accountEmail && emailVerified) {
            emailsToUse = [accountEmail];
          } else {
            throw new Error('Account email not verified or not found. Please provide emails in configuration.');
          }
        } catch (error) {
          throw new Error(`Failed to get account email: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      const policyData = this.buildPolicyData([...emailsToUse]);
      const response = this.makeRequest('PUT', `/monitoring/alerts/${existingPolicy.uuid}`, policyData);

      // DigitalOcean API returns the updated policy under 'policy' key
      const updatedPolicy = response.policy || response.alert || response;
      this.updateStateFromPolicy(updatedPolicy);
      cli.output(`Alert Policy Updated: ${this.state.name}\nUUID: ${this.state.uuid}\nType: ${this.state.metric_type}\nThreshold: ${this.state.compare} ${this.state.value}\nWindow: ${this.state.window}\nNotifications: ${this.state.emails?.join(', ')}\nStatus: ${this.state.enabled ? 'Enabled' : 'Disabled'}`);
    } catch (error: any) {
      throw new Error(`Failed to update alert policy: ${error.message}`);
    }
    
    return this.state;
  }

  override delete(): any {
    try {
      if (!this.state.uuid) {
        cli.output('No alert policy to delete');
        return;
      }

      const policyUuid = this.state.uuid;
      const policyName = this.state.name || this.state.alert_description || 'Unknown';

      // Check if we should create resources (for testing)
      if (this.definition.create_when_missing === false) {
        // Test mode - simulate successful deletion
        cli.output(`Alert policy deleted successfully (Test Mode)\nName: ${policyName}\nUUID: ${policyUuid}`);
        
        // Clear all state
        this.state = {
          uuid: undefined,
          name: undefined,
          alert_description: undefined,
          metric_type: undefined,
          compare: undefined,
          value: undefined,
          window: undefined,
          entities: undefined,
          tags: undefined,
          emails: undefined,
          slack_channels: undefined,
          enabled: undefined,
          created_at: undefined
        };
        return;
      }

      // Make the actual DELETE request to DigitalOcean API
      cli.output(`🗑️ Deleting alert policy from DigitalOcean: ${policyName} (${policyUuid})`);
      this.makeRequest('DELETE', `/monitoring/alerts/${policyUuid}`);

      // Clear all state after successful deletion
              this.state = {
        uuid: undefined,
        name: undefined,
        alert_description: undefined,
        metric_type: undefined,
        compare: undefined,
        value: undefined,
        window: undefined,
        entities: undefined,
        tags: undefined,
        emails: undefined,
        slack_channels: undefined,
        enabled: undefined,
        created_at: undefined
      };

      cli.output(`✅ Alert policy deleted successfully from DigitalOcean\nName: ${policyName}\nUUID: ${policyUuid}`);
    } catch (error: any) {
      cli.output(`❌ Failed to delete alert policy: ${error.message}`);
      throw new Error(`Failed to delete alert policy: ${error.message}`);
    }
    
    return this.state;
  }

  override checkReadiness(): boolean {
    return !!this.state.uuid;
  }

  @action()
  createAlertPolicy(args: Args): any {
    try {
      cli.output(`DEBUG: Received args: ${JSON.stringify(args)}`);
      const name = args.name;
      const type = args.type;
      const compare = args.compare;
      const value = args.value;
      const window = args.window;
      const emails = args.emails;
      const entities = args.entities;
      const tags = args.tags;
      const description = args.description;
      const slack_channels = args.slack_channels;

      if (!name) throw new Error("Name is required (use name=your_alert_name)");
      if (!type) throw new Error("Type is required (use type=v1/insights/droplet/cpu)");
      if (!compare) throw new Error("Compare is required (use compare=GreaterThan)");
      if (!value) throw new Error("Value is required (use value=80)");
      if (!window) throw new Error("Window is required (use window=10m)");
      if (!emails) throw new Error("Emails is required (use emails=admin@example.com)");

      validateAlertPolicyType(type);
      validateComparator(compare);
      validateWindow(window);
      
      const emailArray = emails.split(',').map(e => e.trim());
      validateEmails(emailArray);

      const policyData: any = {
        type: type,
        description: description || `Alert policy for ${name}`,
        compare,
        value: Number(value),
        window,
        entities: entities ? entities.split(',').map(e => e.trim()) : [],
        tags: tags ? tags.split(',').map(t => t.trim()) : [],
        alerts: {
          email: emailArray,
          slack: slack_channels ? JSON.parse(slack_channels) : []
        },
        enabled: true
      };

      const response = this.makeRequest('POST', '/monitoring/alerts', policyData);

      if (response.alert) {
        const policy = response.alert;
        cli.output(`Alert Policy Created: ${name}\nUUID: ${policy.uuid}\nType: ${type}\nThreshold: ${compare} ${value}\nWindow: ${window}\nEntities: ${policyData.entities.join(', ') || 'None'}\nTags: ${policyData.tags.join(', ') || 'None'}\nNotifications: ${emailArray.join(', ')}\nStatus: Enabled`);
        return policy;
      }
    } catch (error: any) {
      throw new Error(`Failed to create alert policy: ${error.message}`);
    }
  }

  @action()
  listAlertPolicies(_args: Args): any {
    try {
      const response = this.makeRequest('GET', '/monitoring/alerts');
      
      // DigitalOcean API returns 'policies' not 'alerts' 
      const alerts = response.alerts || response.policies || [];
      
      if (!alerts || alerts.length === 0) {
        cli.output('No alert policies found');
        return { count: 0, policies: [] };
      }

      let output = `Alert Policies (${alerts.length} total):\n\n`;
      
      const policies = alerts.map((policy: AlertPolicy, index: number) => {
        const policyInfo = {
          index: index + 1,
          name: policy.description,
          uuid: policy.uuid,
          type: policy.type,
          threshold: `${policy.compare} ${policy.value}`,
          window: policy.window,
          entities: policy.entities || [],
          tags: policy.tags || [],
          emails: policy.alerts?.email || [],
          slack_channels: policy.alerts?.slack?.length || 0,
          status: policy.enabled ? 'Enabled' : 'Disabled',
          created_at: policy.created_at
        };
        
        output += `${index + 1}. ${policy.description}\n`;
        output += `   UUID: ${policy.uuid}\n`;
        output += `   Type: ${policy.type}\n`;
        output += `   Threshold: ${policy.compare} ${policy.value}\n`;
        output += `   Window: ${policy.window}\n`;
        output += `   Status: ${policy.enabled ? 'Enabled' : 'Disabled'}\n`;
        
        if (policy.entities && policy.entities.length > 0) {
          output += `   Entities: ${policy.entities.join(', ')}\n`;
        }
        if (policy.tags && policy.tags.length > 0) {
          output += `   Tags: ${policy.tags.join(', ')}\n`;
        }
        if (policy.alerts?.email && policy.alerts.email.length > 0) {
          output += `   Email notifications: ${policy.alerts.email.join(', ')}\n`;
        }
        if (policy.alerts?.slack && policy.alerts.slack.length > 0) {
          output += `   Slack notifications: ${policy.alerts.slack.length} channels\n`;
        }
        if (policy.created_at) {
          output += `   Created: ${new Date(policy.created_at).toLocaleString()}\n`;
        }
        output += '\n';
        
        return policyInfo;
      });

      cli.output(output.trim());
      return { count: alerts.length, policies: policies };
    } catch (error: any) {
      throw new Error(`Failed to list alert policies: ${error.message}`);
    }
  }

  @action()
  getAlertPolicy(_args: Args): any {
    try {
      if (!this.state.uuid) {
        throw new Error('No alert policy UUID available');
      }

      const response = this.makeRequest('GET', `/monitoring/alerts/${this.state.uuid}`);
      
      cli.output(`📋 Raw API Response: ${JSON.stringify(response, null, 2)}`);
      
      // Try different response formats
      let policy = response.alert || response.policy || response;
      
      if (!policy || !policy.uuid) {
        throw new Error('No valid policy found in response');
      }

      let output = `Alert Policy Details:\n`;
      output += `Name: ${policy.description}\n`;
      output += `UUID: ${policy.uuid}\n`;
      output += `Type: ${policy.type}\n`;
      output += `Threshold: ${policy.compare} ${policy.value}\n`;
      output += `Window: ${policy.window}\n`;
      output += `Entities: ${policy.entities?.join(', ') || 'None'}\n`;
      output += `Tags: ${policy.tags?.join(', ') || 'None'}\n`;
      output += `Emails: ${policy.alerts?.email?.join(', ') || 'None'}\n`;
      output += `Slack: ${policy.alerts?.slack?.length || 0} channels\n`;
      output += `Status: ${policy.enabled ? 'Enabled' : 'Disabled'}`;
      
      cli.output(output);
      return policy;
    } catch (error: any) {
      cli.output(`❌ Error getting alert policy: ${error.message}`);
      throw new Error(`Failed to get alert policy: ${error.message}`);
    }
  }

  @action()
  updateAlertPolicy(args: Args): any {
    try {
      if (!this.state.uuid) {
        throw new Error('No alert policy UUID available');
      }

      const compare = args.compare;
      const value = args.value;
      const window = args.window;
      const emails = args.emails;
      const entities = args.entities;
      const tags = args.tags;
      const enabled = args.enabled;

      const updateData: any = {};
      
      if (compare) {
        validateComparator(compare);
        updateData.compare = compare;
      }
      if (value !== undefined) updateData.value = Number(value);
      if (window) {
        validateWindow(window);
        updateData.window = window;
      }
      if (emails) {
        const emailArray = emails.split(',').map(e => e.trim());
        validateEmails(emailArray);
        updateData.alerts = { ...updateData.alerts, email: emailArray };
      }
      if (entities) updateData.entities = entities.split(',').map(e => e.trim());
      if (tags) updateData.tags = tags.split(',').map(t => t.trim());
      if (enabled !== undefined) updateData.enabled = enabled === 'true';

      const response = this.makeRequest('PUT', `/monitoring/alerts/${this.state.uuid}`, updateData);
      const policy = response.alert;

      cli.output(`Alert Policy Updated: ${policy.description}\nUUID: ${policy.uuid}\nType: ${policy.type}\nThreshold: ${policy.compare} ${policy.value}\nWindow: ${policy.window}\nStatus: ${policy.enabled ? 'Enabled' : 'Disabled'}`);
      return policy;
    } catch (error: any) {
      throw new Error(`Failed to update alert policy: ${error.message}`);
    }
  }





  @action()
  getAccountInfo(_args: Args): any {  
    try {
      const response = this.makeRequest('GET', '/account');
      
      const account = response.account;
      if (account) {
        let output = `Account Information:\n`;
        output += `  Name: ${account.name}\n`;
        output += `  Email: ${account.email} ${account.email_verified ? '(verified)' : '(not verified)'}\n`;
        output += `  UUID: ${account.uuid}\n`;
        output += `  Status: ${account.status}\n`;
        if (account.team) {
          output += `  Team: ${account.team.name} (${account.team.uuid})\n`;
        }
        output += `  Limits:\n`;
        output += `    Droplets: ${account.droplet_limit}\n`;
        output += `    Floating IPs: ${account.floating_ip_limit}\n`;
        output += `    Volumes: ${account.volume_limit}`;
        
        cli.output(output);
        
        return {
          email: account.email,
          uuid: account.uuid,
          name: account.name,
          status: account.status,
          email_verified: account.email_verified,
          team: account.team,
          limits: {
            droplet_limit: account.droplet_limit,
            floating_ip_limit: account.floating_ip_limit,
            volume_limit: account.volume_limit
          }
        };
      } else {
        cli.output('No account info found in response');
        return { error: 'No account info found in response', raw_response: response };
      }
    } catch (error: any) {
      throw new Error(`Failed to get account info: ${error.message}`);
    }
  }

  @action()
  getDropletMetrics(args: Args): any {
    try {
      const droplet_id = args.droplet_id;
      const type = args.type || 'v1/insights/droplet/cpu';
      let start_time = args.start_time;
      let end_time = args.end_time;

      if (!droplet_id) {
        throw new Error("Droplet ID is required (use droplet_id=YOUR-DROPLET-ID)");
      }

      validateAlertPolicyType(type);

      // Set default time range if not provided (last 1 hour)
      if (!end_time) {
        end_time = new Date().toISOString();
      }
      if (!start_time) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        start_time = oneHourAgo.toISOString();
      }

      // Build query string manually
      let queryParams = `host_id=${droplet_id}&start=${start_time}&end=${end_time}`;

      const metricPath = type.replace('v1/insights/droplet/', '');
      const response = this.makeRequest('GET', `/monitoring/metrics/droplet/${metricPath}?${queryParams}`);
      
      if (!response.data?.result || response.data.result.length === 0) {
        cli.output(`No metrics found for droplet ${droplet_id} and metric ${type}
Time Range: ${start_time} to ${end_time}
Note: Make sure the monitoring agent is installed on your droplet.`);
        return { droplet_id, metric_type: type, data: [] };
      }

      let output = `Droplet Metrics for ${droplet_id}:\n`;
      output += `Metric Type: ${type}\n\n`;

      const processedResults = response.data.result.map((result: any) => {
        const values = result.values || [];
        if (values.length === 0) return null;

        const latestValue = values[values.length - 1];
        const firstValue = values[0];
        
        output += `Metric Series:\n`;
        output += `  Latest Value: ${latestValue[1]} (${new Date(latestValue[0] * 1000).toLocaleString()})\n`;
        output += `  First Value: ${firstValue[1]} (${new Date(firstValue[0] * 1000).toLocaleString()})\n`;
        output += `  Total Data Points: ${values.length}\n`;
        
        // Calculate average if numeric values
        const numericValues = values.map((v: any) => parseFloat(v[1])).filter((v: number) => !isNaN(v));
        if (numericValues.length > 0) {
          const avg = numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length;
          const max = Math.max(...numericValues);
          const min = Math.min(...numericValues);
          output += `  Average: ${avg.toFixed(2)}\n`;
          output += `  Maximum: ${max}\n`;
          output += `  Minimum: ${min}\n`;
        }
        output += '\n';

        return {
          values: values,
          latest: { value: latestValue[1], timestamp: latestValue[0] },
          first: { value: firstValue[1], timestamp: firstValue[0] },
          count: values.length,
          stats: numericValues.length > 0 ? {
            average: numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length,
            maximum: Math.max(...numericValues),
            minimum: Math.min(...numericValues)
          } : null
        };
      }).filter(Boolean);

      cli.output(output.trim());
      return { 
        droplet_id, 
        metric_type: type, 
        data: processedResults,
        query_params: { start_time, end_time }
      };
    } catch (error: any) {
      throw new Error(`Failed to get droplet metrics: ${error.message}`);
    }
  }

  @action()
  getDropletCpuMetrics(args: Args): any {
    return this.getDropletMetrics({ ...args, type: 'v1/insights/droplet/cpu' });
  }

  @action()
  getDropletMemoryMetrics(args: Args): any {
    return this.getDropletMetrics({ ...args, type: 'v1/insights/droplet/memory_utilization_percent' });
  }

  @action()
  getDropletDiskMetrics(args: Args): any {
    return this.getDropletMetrics({ ...args, type: 'v1/insights/droplet/disk_utilization_percent' });
  }

  @action()
  getDropletNetworkMetrics(args: Args): any {
    const direction = args.direction || 'inbound';
    const interface_type = args.interface || 'public';
    return this.getDropletMetrics({ 
      ...args, 
      type: `v1/insights/droplet/bandwidth_utilization_percent_${direction}_${interface_type}` 
    });
  }

  @action()
  getAppMetrics(args: Args): any {
    try {
      const app_id = args.app_id;
      const component = args.component;
      const start_time = args.start_time;
      const end_time = args.end_time;

      if (!app_id) {
        throw new Error("App ID is required (use app_id=YOUR-APP-ID component=web)");
      }
      if (!component) {
        throw new Error("Component is required (use component=web)");
      }

      let queryParams = `app_id=${app_id}&app_component=${component}`;
      if (start_time) queryParams += `&start=${start_time}`;
      if (end_time) queryParams += `&end=${end_time}`;

      const response = this.makeRequest('GET', `/monitoring/metrics/apps/cpu_percentage?${queryParams}`);
      
      if (!response.data?.result || response.data.result.length === 0) {
        cli.output(`No metrics found for app ${app_id}, component ${component}`);
        return { app_id, component, data: [] };
      }

      let output = `App Metrics for ${app_id}:\n`;
      output += `Component: ${component}\n\n`;

      const processedResults = response.data.result.map((result: any) => {
        const values = result.values || [];
        if (values.length === 0) return null;

        const latestValue = values[values.length - 1];
        output += `CPU Usage:\n`;
        output += `  Latest: ${latestValue[1]}% (${new Date(latestValue[0] * 1000).toLocaleString()})\n`;
        output += `  Data Points: ${values.length}\n\n`;

        return {
          metric: 'cpu_percentage',
          values: values,
          latest: { value: latestValue[1], timestamp: latestValue[0] },
          count: values.length
        };
      }).filter(Boolean);

      cli.output(output.trim());
      return { app_id, component, data: processedResults };
    } catch (error: any) {
      throw new Error(`Failed to get app metrics: ${error.message}`);
    }
  }

  @action()
  getLoadBalancerMetrics(args: Args): any {
    try {
      const lb_id = args.lb_id;
      const start_time = args.start_time;
      const end_time = args.end_time;

      if (!lb_id) {
        throw new Error("Load Balancer ID is required (use lb_id=YOUR-LB-ID)");
      }

      let queryParams = `lb_id=${lb_id}`;
      if (start_time) queryParams += `&start=${start_time}`;
      if (end_time) queryParams += `&end=${end_time}`;

      const response = this.makeRequest('GET', `/monitoring/metrics/load_balancer/connections?${queryParams}`);
      
      if (!response.data?.result || response.data.result.length === 0) {
        cli.output(`No metrics found for load balancer ${lb_id}`);
        return { lb_id, data: [] };
      }

      let output = `Load Balancer Metrics for ${lb_id}:\n\n`;

      const processedResults = response.data.result.map((result: any) => {
        const values = result.values || [];
        if (values.length === 0) return null;

        const latestValue = values[values.length - 1];
        output += `Connections:\n`;
        output += `  Latest: ${latestValue[1]} (${new Date(latestValue[0] * 1000).toLocaleString()})\n`;
        output += `  Data Points: ${values.length}\n\n`;

        return {
          metric: 'connections',
          values: values,
          latest: { value: latestValue[1], timestamp: latestValue[0] },
          count: values.length
        };
      }).filter(Boolean);

      cli.output(output.trim());
      return { lb_id, data: processedResults };
    } catch (error: any) {
      throw new Error(`Failed to get load balancer metrics: ${error.message}`);
    }
  }

  @action()
  getDatabaseMetrics(args: Args): any {
    try {
      const db_id = args.db_id;
      const start_time = args.start_time;
      const end_time = args.end_time;

      if (!db_id) {
        throw new Error("Database ID is required (use db_id=YOUR-DB-ID)");
      }

      let queryParams = `db_id=${db_id}`;
      if (start_time) queryParams += `&start=${start_time}`;
      if (end_time) queryParams += `&end=${end_time}`;

      const response = this.makeRequest('GET', `/monitoring/metrics/databases/cpu?${queryParams}`);
      
      if (!response.data?.result || response.data.result.length === 0) {
        cli.output(`No metrics found for database ${db_id}`);
        return { db_id, data: [] };
      }

      let output = `Database Metrics for ${db_id}:\n\n`;

      const processedResults = response.data.result.map((result: any) => {
        const values = result.values || [];
        if (values.length === 0) return null;

        const latestValue = values[values.length - 1];
        output += `CPU Usage:\n`;
        output += `  Latest: ${latestValue[1]}% (${new Date(latestValue[0] * 1000).toLocaleString()})\n`;
        output += `  Data Points: ${values.length}\n\n`;

        return {
          metric: 'cpu',
          values: values,
          latest: { value: latestValue[1], timestamp: latestValue[0] },
          count: values.length
        };
      }).filter(Boolean);

      cli.output(output.trim());
      return { db_id, data: processedResults };
    } catch (error: any) {
      throw new Error(`Failed to get database metrics: ${error.message}`);
    }
  }

  @action()
  enableAlertPolicy(args: Args): any {
    try {
      const uuid = args.uuid || this.state.uuid;
      if (!uuid) throw new Error("Alert policy UUID is required (use uuid=policy-uuid)");

      // Get current policy data first
      const currentResponse = this.makeRequest('GET', `/monitoring/alerts/${uuid}`);
      const currentPolicy = currentResponse.policy || currentResponse.alert || currentResponse;
      
      // Update with all required fields but change enabled to true
      const updateData = {
        type: currentPolicy.type,
        description: currentPolicy.description,
        compare: currentPolicy.compare,
        value: currentPolicy.value,
        window: currentPolicy.window,
        entities: currentPolicy.entities || [],
        tags: currentPolicy.tags || [],
        alerts: currentPolicy.alerts || { email: [], slack: [] },
        enabled: true
      };

      const response = this.makeRequest('PUT', `/monitoring/alerts/${uuid}`, updateData);
      const policy = response.policy || response.alert || response;
      
      cli.output(`Alert policy ${uuid} enabled successfully`);
      return { uuid, enabled: true, policy: policy };
    } catch (error: any) {
      throw new Error(`Failed to enable alert policy: ${error.message}`);
    }
  }

  @action()
  disableAlertPolicy(args: Args): any {
    try {
      const uuid = args.uuid || this.state.uuid;
      if (!uuid) throw new Error("Alert policy UUID is required (use uuid=policy-uuid)");

      // Get current policy data first
      const currentResponse = this.makeRequest('GET', `/monitoring/alerts/${uuid}`);
      const currentPolicy = currentResponse.policy || currentResponse.alert || currentResponse;
      
      // Update with all required fields but change enabled to false
      const updateData = {
        type: currentPolicy.type,
        description: currentPolicy.description,
        compare: currentPolicy.compare,
        value: currentPolicy.value,
        window: currentPolicy.window,
        entities: currentPolicy.entities || [],
        tags: currentPolicy.tags || [],
        alerts: currentPolicy.alerts || { email: [], slack: [] },
        enabled: false
      };

      const response = this.makeRequest('PUT', `/monitoring/alerts/${uuid}`, updateData);
      const policy = response.policy || response.alert || response;
      
      cli.output(`Alert policy ${uuid} disabled successfully`);
      return { uuid, enabled: false, policy: policy };
    } catch (error: any) {
      throw new Error(`Failed to disable alert policy: ${error.message}`);
    }
  }

  @action()
  getVolumeMetrics(args: Args): any {
    try {
      const volume_id = args.volume_id;
      const start_time = args.start_time;
      const end_time = args.end_time;

      if (!volume_id) {
        throw new Error("Volume ID is required (use volume_id=YOUR-VOLUME-ID)");
      }

      let queryParams = ``;
      if (start_time) queryParams += `start=${start_time}&`;
      if (end_time) queryParams += `end=${end_time}&`;
      queryParams = queryParams.replace(/&$/, ''); // Remove trailing &

      const endpoint = `/monitoring/metrics/volumes/filesystem_size${queryParams ? '?' + queryParams : ''}`;
      const response = this.makeRequest('GET', endpoint);
      
      if (!response.data?.result?.length) {
        cli.output(`No volume metrics found for volume ${volume_id}`);
        return { volume_id, metrics: [] };
      }

      let output = `Volume Metrics for ${volume_id}:\n\n`;
      
      response.data.result.forEach((metric: any, index: number) => {
        output += `Metric ${index + 1}:\n`;
        output += `  Volume: ${metric.metric?.volume_id || 'Unknown'}\n`;
        output += `  Values: ${metric.values?.length || 0} data points\n`;
        if (metric.values?.length > 0) {
          const latestValue = metric.values[metric.values.length - 1];
          output += `  Latest: ${latestValue[1]} bytes at ${new Date(latestValue[0] * 1000).toISOString()}\n`;
        }
        output += `\n`;
      });

      cli.output(output.trim());
      return { volume_id, metrics: response.data.result };
    } catch (error: any) {
      throw new Error(`Failed to get volume metrics: ${error.message}`);
    }
  }

  @action()
  getDropletBandwidthInbound(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/public_inbound_bandwidth' 
    });
  }

  @action()
  getDropletBandwidthOutbound(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/public_outbound_bandwidth' 
    });
  }

  @action()
  getDropletPrivateBandwidthInbound(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/private_inbound_bandwidth' 
    });
  }

  @action()
  getDropletPrivateBandwidthOutbound(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/private_outbound_bandwidth' 
    });
  }

  @action()
  getDropletDiskRead(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/disk_read' 
    });
  }

  @action()
  getDropletDiskWrite(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/disk_write' 
    });
  }

  @action()
  getDropletLoadAverage1(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/load_1' 
    });
  }

  @action()
  getDropletLoadAverage5(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/load_5' 
    });
  }

  @action()
  getDropletLoadAverage15(args: Args): any {
    return this.getDropletMetrics({ 
      ...args, 
      type: 'v1/insights/droplet/load_15' 
    });
  }

  @action()
  listDroplets(_args: Args): any {
    try {
      const response = this.makeRequest('GET', '/droplets');
      const droplets = response.droplets || [];
      
      if (droplets.length === 0) {
        cli.output("No droplets found in your account");
        return { droplets: [] };
      }

      cli.output(`Droplets (${droplets.length} total):\n`);
      droplets.forEach((droplet: any, index: number) => {
        cli.output(`${index + 1}. ${droplet.name}
   ID: ${droplet.id}
   Status: ${droplet.status}
   Region: ${droplet.region?.name || droplet.region}
   Size: ${droplet.size_slug}
   IPv4: ${droplet.networks?.v4?.[0]?.ip_address || 'N/A'}
   Tags: ${droplet.tags?.join(', ') || 'None'}
   Created: ${droplet.created_at}
`);
      });
      
      return { droplets };
    } catch (error: any) {
      throw new Error(`Failed to list droplets: ${error.message}`);
    }
  }

  @action()
  deleteAlertPolicy(args: Args): any {
    try {
      const policy_uuid = args.policy_uuid || this.state.uuid;
      
      if (!policy_uuid) {
        throw new Error("Policy UUID is required (use policy_uuid=YOUR-POLICY-UUID)");
      }
      
      this.makeRequest('DELETE', `/monitoring/alerts/${policy_uuid}`);
      cli.output(`Alert policy ${policy_uuid} deleted successfully`);
      
      return true;
    } catch (error: any) {
      throw new Error(`Failed to delete alert policy: ${error.message}`);
    }
  }

  @action()
  listSinks(_args: Args): any {
    try {
      const response = this.makeRequest('GET', '/monitoring/sinks');
      const sinks = response.sinks || [];
      
      if (sinks.length === 0) {
        cli.output("No monitoring sinks found");
        return { sinks: [] };
      }

      cli.output(`Monitoring Sinks (${sinks.length} total):\n`);
      sinks.forEach((sink: any, index: number) => {
        cli.output(`${index + 1}. ${sink.name}
   ID: ${sink.id}
   Type: ${sink.type}
   Endpoint: ${sink.endpoint || 'N/A'}
   Status: ${sink.status || 'active'}
   Created: ${sink.created_at || 'N/A'}
`);
      });
      
      return { sinks };
    } catch (error: any) {
      throw new Error(`Failed to list monitoring sinks: ${error.message}`);
    }
  }

  @action()
  getSink(args: Args): any {
    try {
      const sink_id = args.sink_id;
      
      if (!sink_id) {
        throw new Error("Sink ID is required (use sink_id=YOUR-SINK-ID)");
      }
      
      const response = this.makeRequest('GET', `/monitoring/sinks/${sink_id}`);
      const sink = response.sink || response;
      
      cli.output(`Monitoring Sink Details:
Name: ${sink.name}
ID: ${sink.id}
Type: ${sink.type}
Endpoint: ${sink.endpoint || 'N/A'}
Status: ${sink.status || 'active'}
Created: ${sink.created_at || 'N/A'}`);
      
      return sink;
    } catch (error: any) {
      throw new Error(`Failed to get monitoring sink: ${error.message}`);
    }
  }

  @action()
  getAllDropletMetrics(args: Args): any {
    try {
      const droplet_id = args.droplet_id;
      if (!droplet_id) {
        throw new Error("Droplet ID is required (use droplet_id=YOUR-DROPLET-ID)");
      }

      const metrics = [
        'v1/insights/droplet/cpu',
        'v1/insights/droplet/memory_utilization_percent',
        'v1/insights/droplet/disk_utilization_percent',
        'v1/insights/droplet/load_1',
        'v1/insights/droplet/load_5',
        'v1/insights/droplet/load_15'
      ];

      let output = `All Metrics for Droplet ${droplet_id}:\n\n`;
      const results: { [key: string]: any } = {};
      let hasData = false;

      // Try to get metrics silently
      metrics.forEach(metric => {
        try {
          // Call getDropletMetrics without outputting to CLI
          const metricResult = this.getDropletMetricsInternal({ ...args, type: metric });
          if (metricResult && metricResult.data?.result?.length > 0) {
            results[metric] = metricResult;
            const values = metricResult.data.result[0]?.values;
            if (values && values.length > 0) {
              const latestValue = values[values.length - 1][1];
              output += `${metric}: ${latestValue} (${values.length} data points)\n`;
              hasData = true;
            } else {
              output += `${metric}: No data available\n`;
            }
          } else {
            output += `${metric}: No data available\n`;
          }
        } catch (error: any) {
          output += `${metric}: Unavailable (${error.message.split(':')[0]})\n`;
        }
      });

      if (!hasData) {
        cli.output(`No metrics data available for Droplet ${droplet_id}
Note: Make sure the monitoring agent is installed on your droplet:
curl -sSL https://repos.insights.digitalocean.com/install.sh | sudo bash`);
      } else {
        cli.output(output.trim());
      }
      
      return { droplet_id, all_metrics: results };
    } catch (error: any) {
      throw new Error(`Failed to get all droplet metrics: ${error.message}`);
    }
  }

  // Internal method that doesn't output to CLI
  private getDropletMetricsInternal(args: Args): any {
    const droplet_id = args.droplet_id;
    const type = args.type || 'v1/insights/droplet/cpu';
    let start_time = args.start_time;
    let end_time = args.end_time;

    if (!droplet_id) {
      throw new Error("Droplet ID is required");
    }

    validateAlertPolicyType(type);

    // Set default time range if not provided (last 1 hour)
    if (!end_time) {
      end_time = new Date().toISOString();
    }
    if (!start_time) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      start_time = oneHourAgo.toISOString();
    }

    // Build query string manually
    let queryParams = `host_id=${droplet_id}&start=${start_time}&end=${end_time}`;

    const metricPath = type.replace('v1/insights/droplet/', '');
    const response = this.makeRequest('GET', `/monitoring/metrics/droplet/${metricPath}?${queryParams}`);
    
    return response;
  }

  private findExistingPolicy(): AlertPolicy | null {
    // In test mode, don't make API calls
    if (this.definition.create_when_missing === false) {
      return null;
    }
    
    try {
      const response = this.makeRequest('GET', '/monitoring/alerts');
      
      // DigitalOcean API returns 'policies' not 'alerts'
      const alerts = response.alerts || response.policies || [];
      
      if (!alerts) {
        return null;
      }

      // Find policy by name (description field)
      const existingPolicy = alerts.find((policy: AlertPolicy) => 
        policy.description === this.definition.name ||
        policy.description === `Alert policy for ${this.definition.name}`
      );



      return existingPolicy || null;
    } catch (error: any) {
      return null;
    }
  }

  private buildPolicyData(emails?: string[]): any {
    const emailsToUse = emails || this.definition.emails || [];
    
    // Ensure we have at least one action (email or slack)
    if (emailsToUse.length === 0 && (!this.definition.slack_channels || this.definition.slack_channels.length === 0)) {
      throw new Error('Alert policy must have at least one action (email or slack). Please provide emails or slack_channels.');
    }

    return {
      type: this.definition.metric_type,
      description: this.definition.alert_description || `Alert policy for ${this.definition.name}`,
      compare: this.definition.compare,
      value: this.definition.value,
      window: this.definition.window,
      entities: this.definition.entities || [],
      tags: this.definition.tags || [],
      alerts: {
        email: emailsToUse,
        slack: this.definition.slack_channels?.map(ch => ({
          type: 'slack',
          channel: ch.channel,
          url: ch.url
        })) || []
      },
      enabled: this.definition.enabled !== false
    };
  }

  private updateStateFromPolicy(policy: AlertPolicy): void {
    this.state.uuid = policy.uuid;
    this.state.name = this.definition.name;
    this.state.alert_description = policy.description;
    this.state.metric_type = policy.type;
    this.state.compare = policy.compare;
    this.state.value = policy.value;
    this.state.window = policy.window;
    this.state.entities = policy.entities;
    this.state.tags = policy.tags;
    this.state.emails = policy.alerts?.email;
    this.state.slack_channels = policy.alerts?.slack?.map(ch => ({
      channel: ch.channel,
      url: ch.url
    }));
    this.state.enabled = policy.enabled;
  }
}

// Export as default for Monk entity system
export default DigitalOceanMonitoring;
