# AWS Route 53

Monk entities for managing Amazon Route 53 DNS resources.

## Entities

| Entity | Description |
|--------|-------------|
| `aws-route53/hosted-zone` | Manages DNS hosted zones (public and private) |
| `aws-route53/record` | Manages DNS record sets within a hosted zone |
| `aws-route53/health-check` | Manages endpoint health checks for DNS failover |

## Prerequisites

- AWS Account with Route 53 access
- AWS credentials configured via `monk cluster providers`

## Required Permissions

The following IAM permissions are required:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:CreateHostedZone",
        "route53:GetHostedZone",
        "route53:ListHostedZones",
        "route53:ListHostedZonesByName",
        "route53:UpdateHostedZoneComment",
        "route53:DeleteHostedZone",
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets",
        "route53:GetChange",
        "route53:CreateHealthCheck",
        "route53:GetHealthCheck",
        "route53:UpdateHealthCheck",
        "route53:DeleteHealthCheck",
        "route53:GetHealthCheckStatus",
        "route53:GetHealthCheckLastFailureReason",
        "route53:ChangeTagsForResource",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

## Hosted Zone Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `region` | string | Yes | AWS region (used for signing; Route 53 is global) |
| `zone_name` | string | Yes | Domain name (e.g., example.com) |
| `is_private` | boolean | No | Whether this is a private hosted zone (default: false) |
| `vpc_id` | string | No | VPC ID for private hosted zones |
| `vpc_region` | string | No | VPC region for private hosted zones |
| `zone_comment` | string | No | Comment for the hosted zone |
| `tags` | map | No | Resource tags |

## Record Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `region` | string | Yes | AWS region |
| `zone_id` | string | Yes | Hosted zone ID |
| `record_name` | string | Yes | Record name (FQDN) |
| `record_type` | string | Yes | Record type (A, AAAA, CNAME, MX, TXT, etc.) |
| `ttl` | number | No | TTL in seconds (default: 300, not used for alias records) |
| `record_values` | string[] | No | Record values (required for non-alias records) |
| `alias_dns_name` | string | No | Alias target DNS name |
| `alias_hosted_zone_id` | string | No | Alias target hosted zone ID |
| `alias_evaluate_target_health` | boolean | No | Evaluate target health for alias |
| `weight` | number | No | Weight for weighted routing (0-255) |
| `set_identifier` | string | No | Set identifier for routing policies |
| `failover` | string | No | Failover type: PRIMARY or SECONDARY |
| `latency_region` | string | No | Region for latency-based routing |
| `health_check_id` | string | No | Associated health check ID |
| `multi_value_answer` | boolean | No | Multi-value answer routing |

## Health Check Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `region` | string | Yes | AWS region |
| `check_type` | string | Yes | Check type (HTTP, HTTPS, TCP, HTTP_STR_MATCH, HTTPS_STR_MATCH) |
| `ip_address` | string | No | IP address to check (ip_address or fqdn required) |
| `fqdn` | string | No | Domain name to check |
| `port` | number | No | Port number (default: 80/443) |
| `resource_path` | string | No | URL path for HTTP/HTTPS checks |
| `search_string` | string | No | String to search for (STR_MATCH types) |
| `request_interval` | number | No | Check interval: 10 or 30 seconds (default: 30) |
| `failure_threshold` | number | No | Failures before unhealthy: 1-10 (default: 3) |
| `enable_sni` | boolean | No | Enable SNI for HTTPS (default: true) |
| `measure_latency` | boolean | No | Measure latency |
| `check_regions` | string[] | No | Specific regions to check from |
| `tags` | map | No | Resource tags |

## Actions

### Hosted Zone

| Action | Description |
|--------|-------------|
| `get-zone-info` | Display zone information and name servers |
| `list-records` | List all DNS records in the zone |
| `get-cost-estimate` | Show estimated monthly cost |
| `costs` | Output costs as JSON |

### Record

| Action | Description |
|--------|-------------|
| `get-record-info` | Display record details |
| `get-cost-estimate` | Show cost info (included in zone) |
| `costs` | Output costs as JSON |

### Health Check

| Action | Description |
|--------|-------------|
| `get-status` | Show health check status from all regions |
| `get-last-failure-reason` | Show last failure reason |
| `get-cost-estimate` | Show estimated monthly cost |
| `costs` | Output costs as JSON |
