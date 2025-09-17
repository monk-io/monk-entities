# DigitalOcean Monitoring Entity

This entity provides comprehensive monitoring capabilities for DigitalOcean resources using the DigitalOcean Monitoring API. It allows you to create, manage, and monitor alert policies for your Droplets with full access to metrics and account information.

## Features

- **Alert Policy Management**: Create, update, delete, enable/disable, and list alert policies
- **Monitoring Sinks Management**: List and manage monitoring sinks for data collection
- **Comprehensive Metrics Access**: Get detailed metrics for Droplets, Load Balancers, Databases, and Autoscale alerts
- **Multiple Metric Types**: Support for CPU, memory, disk, load, network bandwidth, autoscale, and database alert metrics
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

### Droplet Metrics

#### CPU and Load Metrics
- `v1/insights/droplet/cpu` - CPU utilization percentage
- `v1/insights/droplet/load_1` - 1-minute load average
- `v1/insights/droplet/load_5` - 5-minute load average  
- `v1/insights/droplet/load_15` - 15-minute load average

#### Memory Metrics
- `v1/insights/droplet/memory_utilization_percent` - Memory utilization percentage

#### Disk Metrics
- `v1/insights/droplet/disk_utilization_percent` - Disk utilization percentage
- `v1/insights/droplet/disk_read` - Disk read operations
- `v1/insights/droplet/disk_write` - Disk write operations

#### Network Bandwidth Metrics
- `v1/insights/droplet/public_outbound_bandwidth` - Public outbound bandwidth
- `v1/insights/droplet/public_inbound_bandwidth` - Public inbound bandwidth
- `v1/insights/droplet/private_outbound_bandwidth` - Private outbound bandwidth
- `v1/insights/droplet/private_inbound_bandwidth` - Private inbound bandwidth

### Load Balancer Metrics

#### Performance Metrics
- `v1/insights/lbaas/avg_cpu_utilization_percent` - Average CPU utilization
- `v1/insights/lbaas/connection_utilization_percent` - Connection utilization
- `v1/insights/lbaas/droplet_health` - Backend droplet health status
- `v1/insights/lbaas/tls_connections_per_second_utilization_percent` - TLS connection rate

#### HTTP Error Rate Metrics
- `v1/insights/lbaas/increase_in_http_error_rate_percentage_5xx` - 5xx error rate increase
- `v1/insights/lbaas/increase_in_http_error_rate_percentage_4xx` - 4xx error rate increase
- `v1/insights/lbaas/increase_in_http_error_rate_count_5xx` - 5xx error count increase
- `v1/insights/lbaas/increase_in_http_error_rate_count_4xx` - 4xx error count increase

#### Response Time Metrics
- `v1/insights/lbaas/high_http_request_response_time` - HTTP response time
- `v1/insights/lbaas/high_http_request_response_time_50p` - 50th percentile response time
- `v1/insights/lbaas/high_http_request_response_time_95p` - 95th percentile response time
- `v1/insights/lbaas/high_http_request_response_time_99p` - 99th percentile response time

### Database Metrics
- `v1/dbaas/alerts/load_15_alerts` - Database 15-minute load alerts
- `v1/dbaas/alerts/cpu_alerts` - Database CPU alerts
- `v1/dbaas/alerts/memory_utilization_alerts` - Database memory alerts
- `v1/dbaas/alerts/disk_utilization_alerts` - Database disk alerts

### Droplet Autoscale Metrics
- `v1/droplet/autoscale_alerts/current_instances` - Current number of instances
- `v1/droplet/autoscale_alerts/target_instances` - Target number of instances
- `v1/droplet/autoscale_alerts/current_cpu_utilization` - Current CPU utilization for autoscaling
- `v1/droplet/autoscale_alerts/target_cpu_utilization` - Target CPU utilization for autoscaling
- `v1/droplet/autoscale_alerts/current_memory_utilization` - Current memory utilization for autoscaling
- `v1/droplet/autoscale_alerts/target_memory_utilization` - Target memory utilization for autoscaling
- `v1/droplet/autoscale_alerts/scale_up` - Scale up events
- `v1/droplet/autoscale_alerts/scale_down` - Scale down events

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

### Autoscale Instance Monitoring
```yaml
monk-autoscale-instances-alert:
  defines: digitalocean-monitoring/digital-ocean-monitoring
  name: monk-autoscale-instances-alert
  metric_type: v1/droplet/autoscale_alerts/current_instances
  compare: GreaterThan
  value: 10
  window: 5m
  tags:
    - autoscale
    - production
  enabled: true
  create_when_missing: true
```

## Authentication

The entity uses the DigitalOcean provider for authentication. Configure your API token:

```bash
# Set up DigitalOcean provider
monk cluster provider add -p digitalocean --access-token="your-api-token"
```

The entity will automatically use the configured provider for all API calls and will auto-detect your verified account email for notifications.

## Usage Commands

All actions follow the pattern: `monk do templates/local/digitalocean-monitoring-example/<template-name>/<action-name> [parameters]`

### Basic Usage Examples

```bash
# Get account information
monk do templates/local/digitalocean-monitoring-example/monk-cpu-alert/get-account-details


# List all alert policies
monk do templates/local/digitalocean-monitoring-example/monk-cpu-alert/list-alert-policies

# Create a new alert policy
monk do templates/local/digitalocean-monitoring-example/monk-cpu-alert/create-alert-policy \
  name="test-alert" type="v1/insights/droplet/cpu" compare="GreaterThan" value=80 window="10m"

# Get droplet metrics (requires droplet ID)
monk do templates/local/digitalocean-monitoring-example/monk-cpu-alert/get-all-droplet-metrics \
  droplet_id=YOUR_DROPLET_ID
```

### Parameter Format

Parameters are passed using the format `parameter_name=value` (no dashes):
- ✅ `droplet_id=123456`
- ✅ `policy_uuid="abc-123"`

## Important Notes

### Monitoring Agent Requirement

For droplet metrics to be available, the DigitalOcean monitoring agent must be installed on your droplets:

```bash
# Install monitoring agent on your droplet
curl -sSL https://repos.insights.digitalocean.com/install.sh | sudo bash
```

**Without the monitoring agent:**
- `list-droplets` will work
- `get-droplet-*-metrics` actions will return 404 errors
- Alert policies will still be created but won't trigger

## Complete Action List

### Alert Policy Management
- `create-alert-policy` - Create new alert policy
- `list-alert-policies` - List all alert policies  
- `get-alert-policy` - Get policy details
- `update-alert-policy` - Update policy settings
- `delete-alert-policy` - Delete alert policy
- `enable-alert-policy` - Enable alert policy
- `disable-alert-policy` - Disable alert policy

### Monitoring Sinks Management
- `list-sinks` - List all monitoring sinks
- `get-sink` - Get monitoring sink details

### Account & Information
- `get-account-details` - Get account details and limits

### Droplet Metrics

#### Basic Droplet Metrics
- `get-droplet-metrics` - General droplet metrics
- `get-droplet-cpu-metrics` - CPU metrics
- `get-droplet-memory-metrics` - Memory metrics
- `get-droplet-disk-metrics` - Disk metrics
- `get-droplet-network-metrics` - Network metrics
- `get-all-droplet-metrics` - All droplet metrics combined

#### Network Bandwidth Metrics
- `get-droplet-bandwidth-inbound` - Public inbound bandwidth
- `get-droplet-bandwidth-outbound` - Public outbound bandwidth
- `get-droplet-private-bandwidth-inbound` - Private inbound bandwidth
- `get-droplet-private-bandwidth-outbound` - Private outbound bandwidth

#### Disk I/O & Load Metrics
- `get-droplet-disk-read` - Disk read operations
- `get-droplet-disk-write` - Disk write operations
- `get-droplet-load-average-1` - 1-minute load average
- `get-droplet-load-average-5` - 5-minute load average  
- `get-droplet-load-average-15` - 15-minute load average

### Load Balancer Metrics

#### Basic LB Metrics
- `get-load-balancer-metrics` - Basic LB connection metrics
- `get-load-balancer-cpu-utilization` - LB CPU utilization
- `get-load-balancer-connection-utilization` - Connection utilization
- `get-load-balancer-droplet-health` - Backend droplet health

#### Enhanced LB Metrics
- `get-lb-cpu-utilization` - LB CPU utilization (alias)
- `get-lb-connection-utilization` - Connection utilization (alias)
- `get-lb-droplet-health` - Droplet health (alias)
- `get-lb-tls-connections-utilization` - TLS connection utilization
- `get-lb-http-error-5xx-rate` - HTTP 5xx error rate
- `get-lb-http-error-4xx-rate` - HTTP 4xx error rate
- `get-lb-http-response-time-50p` - 50th percentile response time
- `get-lb-http-response-time-95p` - 95th percentile response time
- `get-lb-http-response-time-99p` - 99th percentile response time

### Database Metrics

#### Basic Database Metrics
- `get-database-metrics` - Basic database CPU metrics
- `get-database-cpu-utilization` - Database CPU utilization
- `get-database-memory-utilization` - Database memory utilization
- `get-database-disk-utilization` - Database disk utilization

#### Database Alert Metrics
- `get-db-load-15` - Database 15-minute load alerts
- `get-db-cpu-alerts` - Database CPU alerts
- `get-db-memory-alerts` - Database memory alerts
- `get-db-disk-alerts` - Database disk alerts

### Droplet Autoscale Metrics
- `get-autoscale-current-instances` - Current instance count metrics
- `get-autoscale-target-instances` - Target instance count metrics
- `get-autoscale-current-cpu` - Current CPU utilization for autoscaling
- `get-autoscale-target-cpu` - Target CPU utilization for autoscaling
- `get-autoscale-current-memory` - Current memory utilization for autoscaling
- `get-autoscale-target-memory` - Target memory utilization for autoscaling
- `get-autoscale-scale-up` - Scale up event metrics
- `get-autoscale-scale-down` - Scale down event metrics

## API Reference

This entity uses the DigitalOcean Monitoring API v2:
- Base URL: `https://api.digitalocean.com/v2/monitoring`
- Account API: `https://api.digitalocean.com/v2/account`
- Documentation: https://docs.digitalocean.com/reference/api/digitalocean/#tag/Monitoring