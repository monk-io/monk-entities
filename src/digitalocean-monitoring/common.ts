// Common types and validation functions for DigitalOcean Monitoring

export type AlertPolicyType = 'v1/insights/droplet/load_1' | 'v1/insights/droplet/load_5' | 'v1/insights/droplet/load_15' | 
                              'v1/insights/droplet/memory_utilization_percent' | 'v1/insights/droplet/disk_utilization_percent' |
                              'v1/insights/droplet/cpu' | 'v1/insights/droplet/disk_read' | 'v1/insights/droplet/disk_write' |
                              'v1/insights/droplet/public_outbound_bandwidth' | 'v1/insights/droplet/public_inbound_bandwidth' |
                              'v1/insights/droplet/private_outbound_bandwidth' | 'v1/insights/droplet/private_inbound_bandwidth';

export type AlertPolicyComparator = 'GreaterThan' | 'LessThan';

export type AlertPolicyWindow = '5m' | '10m' | '30m' | '1h';

export interface AlertPolicyDefinition {
  type: AlertPolicyType;
  name: string;
  description?: string;
  compare: AlertPolicyComparator;
  value: number;
  window: AlertPolicyWindow;
  entities: string[]; // Array of droplet IDs or tags
  tags: string[]; // Array of tags to match droplets
  emails: string[]; // Array of email addresses for notifications
  slack_channels?: SlackChannel[];
}

export interface SlackChannel {
  type: 'slack';
  channel: string;
  url: string;
}

export interface AlertPolicy {
  uuid?: string;
  type: AlertPolicyType;
  description: string;
  compare: AlertPolicyComparator;
  value: number;
  window: AlertPolicyWindow;
  entities: string[];
  tags: string[];
  alerts: {
    email: string[];
    slack: SlackChannel[];
  };
  enabled: boolean;
  created_at?: string;
}

export interface DropletMetrics {
  data: {
    result: Array<{
      metric: Record<string, string>;
      values: Array<[number, string]>;
    }>;
  };
  status: string;
}

export function validateAlertPolicyType(type: string): AlertPolicyType {
  const validTypes: AlertPolicyType[] = [
    'v1/insights/droplet/load_1',
    'v1/insights/droplet/load_5', 
    'v1/insights/droplet/load_15',
    'v1/insights/droplet/memory_utilization_percent',
    'v1/insights/droplet/disk_utilization_percent',
    'v1/insights/droplet/cpu',
    'v1/insights/droplet/disk_read',
    'v1/insights/droplet/disk_write',
    'v1/insights/droplet/public_outbound_bandwidth',
    'v1/insights/droplet/public_inbound_bandwidth',
    'v1/insights/droplet/private_outbound_bandwidth',
    'v1/insights/droplet/private_inbound_bandwidth'
  ];
  
  if (!validTypes.includes(type as AlertPolicyType)) {
    throw new Error(`Invalid alert policy type: ${type}. Valid types: ${validTypes.join(', ')}`);
  }
  
  return type as AlertPolicyType;
}

export function validateComparator(comparator: string): AlertPolicyComparator {
  const validComparators: AlertPolicyComparator[] = ['GreaterThan', 'LessThan'];
  
  if (!validComparators.includes(comparator as AlertPolicyComparator)) {
    throw new Error(`Invalid comparator: ${comparator}. Valid comparators: ${validComparators.join(', ')}`);
  }
  
  return comparator as AlertPolicyComparator;
}

export function validateWindow(window: string): AlertPolicyWindow {
  const validWindows: AlertPolicyWindow[] = ['5m', '10m', '30m', '1h'];
  
  if (!validWindows.includes(window as AlertPolicyWindow)) {
    throw new Error(`Invalid window: ${window}. Valid windows: ${validWindows.join(', ')}`);
  }
  
  return window as AlertPolicyWindow;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateEmails(emails: string[]): void {
  for (const email of emails) {
    if (!validateEmail(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }
  }
}
