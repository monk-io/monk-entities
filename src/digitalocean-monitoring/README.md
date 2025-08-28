# DigitalOcean Monitoring Entity

This entity provides comprehensive monitoring capabilities for DigitalOcean resources using the DigitalOcean Monitoring API. It allows you to create, manage, and monitor alert policies for your Droplets with full access to metrics and account information.

## Features

- **Alert Policy Management**: Create, update, delete, enable/disable, and list alert policies
- **Monitoring Sinks Management**: List and manage monitoring sinks for data collection
- **Comprehensive Metrics Access**: Get detailed metrics for Droplets, Volumes, Apps, Load Balancers, and Databases
- **Multiple Metric Types**: Support for CPU, memory, disk, load, network bandwidth, and I/O metrics
- **Flexible Notifications**: Email and Slack notifications with auto-detection of verified account email
- **Entity and Tag Targeting**: Target specific Droplets by ID or tags
- **Account Management**: Access DigitalOcean account information and limits
- **Lifecycle Management**: Full CRUD operations with state management
- **Auto Time Range**: Automatic time range handling for metrics (defaults to last 1 hour)

## Prerequisites

- DigitalOcean API token with monitoring permissions
- Droplets with monitoring agent installed (for detailed metrics)

## Configuration

### Required Fields

- `name`: Unique name for the alert policy
- `metric_type`: Type of metric to monitor (see supported types below)
- `compare`: Comparison operator (`GreaterThan` or `LessThan`)
- `value`: Threshold value for the alert
- `window`: Time window for evaluation (`5m`, `10m`, `30m`, `1h`)

### Optional Fields

- `alert_description`: Description of the alert policy (auto-generated if not provided)
- `emails`: Array of email addresses for notifications (auto-detected from DigitalOcean account if not provided)
- `entities`: Array of Droplet IDs to monitor
- `tags`: Array of tags to match Droplets
- `slack_channels`: Array of Slack webhook configurations
- `enabled`: Whether the alert is enabled (default: true)
- `create_when_missing`: Whether to create resources when missing - set to false for testing (default: true)

## Supported Metric Types

### CPU and Load Metrics
- `v1/insights/droplet/cpu` - CPU utilization percentage
- `v1/insights/droplet/load_1` - 1-minute load average
- `v1/insights/droplet/load_5` - 5-minute load average
- `v1/insights/droplet/load_15` - 15-minute load average

### Memory and Disk Metrics
- `v1/insights/droplet/memory_utilization_percent` - Memory utilization percentage
- `v1/insights/droplet/disk_utilization_percent` - Disk utilization percentage
- `v1/insights/droplet/disk_read` - Disk read operations
- `v1/insights/droplet/disk_write` - Disk write operations

### Network Metrics
- `v1/insights/droplet/public_outbound_bandwidth` - Public outbound bandwidth
- `v1/insights/droplet/public_inbound_bandwidth` - Public inbound bandwidth
- `v1/insights/droplet/private_outbound_bandwidth` - Private outbound bandwidth
- `v1/insights/droplet/private_inbound_bandwidth` - Private inbound bandwidth

## Usage Examples

### Basic CPU Monitoring (Auto Email Detection)
```yaml
monk-cpu-alert:
  defines: digitalocean-monitoring/digital-ocean-monitoring
  name: monk-cpu-high-alert
  metric_type: v1/insights/droplet/cpu
  compare: GreaterThan
  value: 80
  window: 10m
  tags:
    - production
    - web-server
  enabled: true
  create_when_missing: true
```

### Memory Monitoring with Slack
```yaml
monk-memory-alert:
  defines: digitalocean-monitoring/digital-ocean-monitoring
  name: monk-memory-high-alert
  metric_type: v1/insights/droplet/memory_utilization_percent
  compare: GreaterThan
  value: 90
  window: 5m
  tags:
    - production
    - database
  slack_channels:
    - channel: "#alerts"
      url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
  enabled: true
  create_when_missing: true
```

### Disk Utilization Monitoring
```yaml
monk-disk-alert:
  defines: digitalocean-monitoring/digital-ocean-monitoring
  name: monk-disk-full-alert
  metric_type: v1/insights/droplet/disk_utilization_percent
  compare: GreaterThan
  value: 85
  window: 30m
  enabled: true
  create_when_missing: true
```

## Lifecycle Methods

### create()
Creates a new alert policy or uses an existing one if found.

### update()
Updates an existing alert policy or creates a new one if it doesn't exist.

### delete()
Deletes the alert policy and clears the entity state.

### checkReadiness()
Returns true if the alert policy exists and has a UUID.

## Actions

### Alert Policy Management

#### createAlertPolicy
Create a new alert policy manually.
```bash
monk do <entity>/create-alert-policy \
  name="my-alert" \
  type="v1/insights/droplet/cpu" \
  compare="GreaterThan" \
  value=80 \
  window="10m" \
  emails="admin@example.com"
```

#### listAlertPolicies
List all alert policies in your account.
```bash
monk do <entity>/list-alert-policies
```

#### getAlertPolicy
Get details of the current alert policy (uses entity's UUID).
```bash
monk do <entity>/get-alert-policy
# Or specify a different policy:
monk do <entity>/get-alert-policy policy_uuid="YOUR-POLICY-UUID"
```

#### updateAlertPolicy
Update an alert policy.
```bash
monk do <entity>/update-alert-policy \
  policy_uuid="YOUR-POLICY-UUID" \
  value=90
```

#### deleteAlertPolicy
Delete an alert policy by UUID.
```bash
monk do <entity>/delete-alert-policy policy_uuid="YOUR-POLICY-UUID"
```

#### enableAlertPolicy / disableAlertPolicy
Enable or disable an alert policy.
```bash
monk do <entity>/enable-alert-policy policy_uuid="YOUR-POLICY-UUID"
monk do <entity>/disable-alert-policy policy_uuid="YOUR-POLICY-UUID"
```

### Account Information

#### getAccountInfo
Get DigitalOcean account information and limits.
```bash
monk do <entity>/get-account-info
```

#### listDroplets
List all Droplets in your account to get their IDs.
```bash
monk do <entity>/list-droplets
```

### Droplet Metrics

#### getDropletMetrics
Get general metrics for a Droplet. Time parameters are optional (defaults to last 1 hour).
```bash
monk do <entity>/get-droplet-metrics \
  droplet_id="YOUR-DROPLET-ID" \
  metric_type="v1/insights/droplet/cpu" \
  start_time="2024-01-01T00:00:00Z" \
  end_time="2024-01-02T00:00:00Z"

# Or with auto time range:
monk do <entity>/get-droplet-metrics \
  droplet_id="YOUR-DROPLET-ID" \
  metric_type="v1/insights/droplet/cpu"
```

#### Specialized Droplet Metrics
```bash
# CPU metrics (auto time range - last 1 hour)
monk do <entity>/get-droplet-cpu-metrics droplet_id="YOUR-DROPLET-ID"

# Memory metrics  
monk do <entity>/get-droplet-memory-metrics droplet_id="YOUR-DROPLET-ID"

# Disk metrics
monk do <entity>/get-droplet-disk-metrics droplet_id="YOUR-DROPLET-ID"

# Network metrics
monk do <entity>/get-droplet-network-metrics droplet_id="YOUR-DROPLET-ID"

# Bandwidth metrics
monk do <entity>/get-droplet-bandwidth-inbound droplet_id="YOUR-DROPLET-ID"
monk do <entity>/get-droplet-bandwidth-outbound droplet_id="YOUR-DROPLET-ID"
monk do <entity>/get-droplet-private-bandwidth-inbound droplet_id="YOUR-DROPLET-ID"
monk do <entity>/get-droplet-private-bandwidth-outbound droplet_id="YOUR-DROPLET-ID"

# Disk I/O metrics
monk do <entity>/get-droplet-disk-read droplet_id="YOUR-DROPLET-ID"
monk do <entity>/get-droplet-disk-write droplet_id="YOUR-DROPLET-ID"

# Load average metrics
monk do <entity>/get-droplet-load-average-1 droplet_id="YOUR-DROPLET-ID"
monk do <entity>/get-droplet-load-average-5 droplet_id="YOUR-DROPLET-ID"
monk do <entity>/get-droplet-load-average-15 droplet_id="YOUR-DROPLET-ID"

# All metrics at once
monk do <entity>/get-all-droplet-metrics droplet_id="YOUR-DROPLET-ID"
```

### Monitoring Sinks Management

#### listSinks
List all monitoring sinks.
```bash
monk do <entity>/list-sinks
```

#### getSink
Get details of a monitoring sink.
```bash
monk do <entity>/get-sink sink_id="YOUR-SINK-ID"
```

### Other Resource Metrics

#### getVolumeMetrics
Get metrics for a Volume.
```bash
monk do <entity>/get-volume-metrics \
  volume_id="YOUR-VOLUME-ID" \
  start_time="2024-01-01T00:00:00Z" \
  end_time="2024-01-02T00:00:00Z"
```

#### getAppMetrics
Get metrics for a DigitalOcean App.
```bash
monk do <entity>/get-app-metrics \
  app_id="YOUR-APP-ID" \
  component="web" \
  start_time="2024-01-01T00:00:00Z" \
  end_time="2024-01-02T00:00:00Z"
```

#### getLoadBalancerMetrics
Get metrics for a Load Balancer.
```bash
monk do <entity>/get-load-balancer-metrics \
  lb_id="YOUR-LB-ID" \
  start_time="2024-01-01T00:00:00Z" \
  end_time="2024-01-02T00:00:00Z"
```

#### getDatabaseMetrics
Get metrics for a Database.
```bash
monk do <entity>/get-database-metrics \
  db_id="YOUR-DB-ID" \
  start_time="2024-01-01T00:00:00Z" \
  end_time="2024-01-02T00:00:00Z"
```

## Authentication

The entity uses the DigitalOcean provider for authentication. Configure your API token:

```bash
# Set up DigitalOcean provider
monk cluster provider add -p digitalocean --access-token="your-api-token"
```

The entity will automatically use the configured provider for all API calls and will auto-detect your verified account email for notifications.

## Error Handling

The entity includes comprehensive error handling for:
- Invalid metric types and parameters
- API authentication failures
- Network connectivity issues
- Resource not found errors
- Validation errors for emails and configurations

## Best Practices

1. **Auto Email Detection**: Let the entity auto-detect your verified DigitalOcean account email instead of hardcoding emails
2. **Use Tags**: Target Droplets using tags for easier management rather than specific Droplet IDs
3. **Set Appropriate Thresholds**: Avoid alert fatigue with reasonable thresholds (CPU: 80%, Memory: 90%, Disk: 85%)
4. **Use Different Windows**: Shorter windows (5m) for critical alerts, longer (30m-1h) for trends
5. **Multiple Notification Channels**: Use both email and Slack for important alerts
6. **Test Mode**: Use `create_when_missing: false` for testing without creating actual resources
7. **Organize by Environment**: Use different alert policies for production, staging, and development
8. **Monitor Different Resources**: Set up alerts for Droplets, Volumes, Apps, Load Balancers, and Databases

## Troubleshooting

### Common Issues

1. **"Invalid metric type"**: Ensure you're using one of the supported metric types listed above
2. **"Email is not verified"**: The entity will auto-detect verified emails, or ensure your DigitalOcean account email is verified
3. **"401 Unauthorized"**: Check your DigitalOcean provider configuration or API token permissions
4. **"404 Not Found"**: Verify your resource IDs (Droplet, Volume, App, etc.) are correct and exist
5. **"Droplet ID is required"**: Use `list-droplets` action to get your Droplet IDs first
6. **"No metrics available"**: Ensure the monitoring agent is installed on your Droplets for detailed metrics
7. **"failed to parse start time"**: Time parameters are now optional - entity automatically sets last 1 hour range

### Getting Resource IDs

Before using metric actions, you need to get the IDs of your resources:

**Droplet IDs**: Use `monk do <entity>/list-droplets` to see all your Droplets with their IDs.

**Volume IDs**: Check your DigitalOcean dashboard or use the DigitalOcean CLI: `doctl compute volume list`

**App IDs**: Check your Apps dashboard: `doctl apps list`

**Load Balancer IDs**: Check your Load Balancers: `doctl compute load-balancer list`

**Database IDs**: Check your Databases: `doctl databases list`

### Monitoring Agent Installation

For detailed metrics, install the monitoring agent on your Droplets:
```bash
curl -sSL https://repos.insights.digitalocean.com/install.sh | sudo bash
```

## Available Templates

The entity includes 6 pre-configured monitoring templates in `example.yaml`:

1. **`monk-cpu-alert`**: CPU utilization monitoring (>80%, 10m window)
2. **`monk-memory-alert`**: Memory utilization monitoring (>90%, 5m window) with Slack integration
3. **`monk-disk-alert`**: Disk utilization monitoring (>85%, 30m window)
4. **`monk-load-alert`**: Load average monitoring (>2.0, 10m window)
5. **`monk-bandwidth-alert`**: Network bandwidth monitoring (>1GB, 1h window)
6. **`monk-disk-io-alert`**: Disk I/O monitoring (>50MB/s, 10m window)

All templates use auto-detected email notifications and are ready to deploy with `monk update <template-name>`.

## Complete Action List

### Alert Policy Management (7 actions)
- `create-alert-policy` - Create new alert policy
- `list-alert-policies` - List all alert policies  
- `get-alert-policy` - Get policy details
- `update-alert-policy` - Update policy settings
- `delete-alert-policy` - Delete alert policy
- `enable-alert-policy` - Enable alert policy
- `disable-alert-policy` - Disable alert policy

### Monitoring Sinks Management (2 actions)
- `list-sinks` - List all monitoring sinks
- `get-sink` - Get monitoring sink details

### Account & Information (2 actions)
- `get-account-info` - Get account details and limits
- `list-droplets` - List all Droplets with their IDs

### Droplet Metrics (15 actions)
- `get-droplet-metrics` - General droplet metrics
- `get-droplet-cpu-metrics` - CPU metrics
- `get-droplet-memory-metrics` - Memory metrics
- `get-droplet-disk-metrics` - Disk metrics
- `get-droplet-network-metrics` - Network metrics
- `get-droplet-bandwidth-inbound` - Inbound bandwidth
- `get-droplet-bandwidth-outbound` - Outbound bandwidth
- `get-droplet-private-bandwidth-inbound` - Private inbound bandwidth
- `get-droplet-private-bandwidth-outbound` - Private outbound bandwidth
- `get-droplet-disk-read` - Disk read operations
- `get-droplet-disk-write` - Disk write operations
- `get-droplet-load-average-1` - 1-minute load average
- `get-droplet-load-average-5` - 5-minute load average  
- `get-droplet-load-average-15` - 15-minute load average
- `get-all-droplet-metrics` - All droplet metrics combined

### Other Resource Metrics (4 actions)
- `get-volume-metrics` - Volume metrics
- `get-app-metrics` - DigitalOcean App metrics
- `get-load-balancer-metrics` - Load Balancer metrics
- `get-database-metrics` - Database metrics

**Total: 30 actions** covering complete DigitalOcean monitoring functionality.

## API Reference

This entity uses the DigitalOcean Monitoring API v2:
- Base URL: `https://api.digitalocean.com/v2/monitoring`
- Account API: `https://api.digitalocean.com/v2/account`
- Documentation: https://docs.digitalocean.com/reference/api/digitalocean/#tag/Monitoring

## Support

For issues related to:
- Entity functionality: Check the Monk documentation
- DigitalOcean API: Refer to DigitalOcean support
- Monitoring setup: See DigitalOcean monitoring documentation
- Template usage: Use the provided examples in `example.yaml` as reference
