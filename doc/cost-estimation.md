# Cloud Cost Estimation Implementation

This document describes the implementation of `get-cost-estimate` and `costs` actions for cloud entities, providing accurate cost estimation using live cloud provider APIs.

## Overview

Every billable cloud entity implements two cost-related actions:

- **`get-cost-estimate`** — Detailed, human-readable cost breakdown with configuration, pricing rates, usage metrics, and notes
- **`costs`** — Standardized JSON output for Monk's billing system

### `costs` Output Format

All entities return costs in this standardized format:

```json
{
  "type": "<entity-type>",
  "costs": {
    "month": {
      "amount": "X.XX",
      "currency": "USD"
    }
  }
}
```

If an error occurs, the output includes an `error` field:

```json
{
  "type": "<entity-type>",
  "costs": {
    "month": {
      "amount": "0",
      "currency": "USD",
      "error": "Error message"
    }
  }
}
```

---

## Supported Entities

### AWS (9 entities)

| Entity | Path | Pricing Source | Usage Metrics |
|--------|------|---------------|---------------|
| S3 Bucket | `aws-s3/s3-bucket` | AWS Price List API | CloudWatch |
| RDS Instance | `aws-rds/rds-instance` | AWS Price List API | CloudWatch |
| Lambda Function | `aws-lambda/lambda-function` | AWS Price List API | CloudWatch |
| DynamoDB Table | `aws-dynamo-db/dynamo-db-table` | AWS Price List API | CloudWatch |
| CloudFront Distribution | `aws-cloudfront/cloudfront-distribution` | AWS Price List API | CloudWatch |
| SQS Queue | `aws-sqs/sqs-queue` | AWS Price List API | CloudWatch |
| SNS Topic | `aws-sns/sns-topic` | AWS Price List API | CloudWatch |
| Neptune Instance | `aws-neptune/neptune-instance` | AWS Price List API | CloudWatch |
| API Gateway | `aws-api-gateway/api-gateway` | AWS Price List API | CloudWatch |

### GCP (6 entities)

| Entity | Path | Pricing Source | Usage Metrics |
|--------|------|---------------|---------------|
| Cloud SQL Instance | `gcp/cloud-sql-instance` | Cloud Billing Catalog API | Cloud Monitoring |
| Cloud Storage | `gcp/cloud-storage` | Cloud Billing Catalog API | Cloud Monitoring |
| Cloud Function | `gcp/cloud-function` | Cloud Billing Catalog API | Cloud Monitoring |
| BigQuery Dataset | `gcp/big-query` | Cloud Billing Catalog API | Cloud Monitoring + BigQuery API |
| Memorystore Redis | `gcp/memorystore-redis` | Cloud Billing Catalog API | Cloud Monitoring |
| Firestore | `gcp/firestore` | Cloud Billing Catalog API | Cloud Monitoring |

### Azure (5 entities)

| Entity | Path | Pricing Source | Usage Metrics |
|--------|------|---------------|---------------|
| Storage Account | `azure-storage-account/storage-account` | Azure Retail Prices API | Azure Monitor |
| PostgreSQL Flexible Server | `azure-postgresql/flexible-server` | Azure Retail Prices API | Azure Monitor |
| Cosmos DB Account | `azure-cosmosdb/database-account` | Azure Retail Prices API | Azure Management API + Azure Monitor |
| Event Hubs Namespace | `azure-eventhubs/namespace` | Azure Retail Prices API | Azure Monitor |
| Service Bus Namespace | `azure-servicebus/namespace` | Azure Retail Prices API | Azure Monitor |

### DigitalOcean (3 entities)

| Entity | Path | Pricing Source | Usage Metrics |
|--------|------|---------------|---------------|
| Database | `digitalocean-database/database` | Hardcoded pricing table | DO API |
| Spaces Bucket | `digitalocean-spaces/bucket` | Hardcoded pricing | S3-compatible API |
| Container Registry | `digitalocean-container-registry/registry` | Hardcoded pricing | DO API |

**Total: 23 billable entities with cost estimation**

---

# AWS Entities

## Common AWS Pricing Infrastructure

All AWS entities use the **AWS Price List API** (`AWSPriceListService.GetProducts`) via POST requests to `api.pricing.us-east-1.amazonaws.com`. The Pricing API is only available in `us-east-1` and `ap-south-1`; the implementation defaults to `us-east-1`.

All AWS entities use **CloudWatch** (`GetMetricStatistics`) for actual usage metrics over the last 30 days.

### Monk AWS Module Changes

The AWS Pricing API required adding support for the `pricing` service in the Monk AWS module. The following change was made to `resolveEndpoint()`:

```go
// Handle services not in the default resolver
if service == "pricing" {
    pricingRegion := region
    if pricingRegion != "us-east-1" && pricingRegion != "ap-south-1" {
        pricingRegion = "us-east-1"
    }
    return &endpoints.ResolvedEndpoint{
        URL:           fmt.Sprintf("https://api.pricing.%s.amazonaws.com", pricingRegion),
        SigningRegion: pricingRegion,
        SigningName:   "pricing",
    }, nil
}
```

### Combined AWS IAM Policy

For all AWS cost estimation actions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket",
                "rds:DescribeDBInstances",
                "lambda:GetFunction",
                "lambda:GetProvisionedConcurrencyConfig",
                "dynamodb:DescribeTable",
                "cloudfront:GetDistribution",
                "sqs:GetQueueAttributes",
                "sns:GetTopicAttributes",
                "neptune:DescribeDBInstances",
                "apigateway:GET",
                "pricing:GetProducts",
                "cloudwatch:GetMetricStatistics"
            ],
            "Resource": "*"
        }
    ]
}
```

---

## S3 Bucket Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **S3 API** — Actual storage size and object count by storage class
2. **AWS Price List API** — Live, region-specific pricing rates
3. **CloudWatch Metrics** — Actual request counts and data transfer volumes

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Storage | `size_gb × rate_per_gb_month` per class | CloudWatch `BucketSizeBytes` + Price List API |
| PUT Requests | `(put_requests / 1000) × put_rate` | CloudWatch |
| GET Requests | `(get_requests / 1000) × get_rate` | CloudWatch |
| Data Transfer OUT | Tiered pricing ($0.09-$0.05/GB) | CloudWatch |

Storage size in the `costs` action is retrieved via the CloudWatch `BucketSizeBytes` metric (`StorageType=AllStorageTypes`, daily period) rather than paginated `ListObjectsV2` calls. This avoids thousands of API calls for large buckets and returns the same total-storage figure without iterating every object.

### What's NOT Included

- S3 Select, Inventory, Analytics costs
- Replication, lifecycle transition fees
- Glacier retrieval fees, early deletion fees

### Accuracy: 90-100% (depending on CloudWatch availability)

---

## RDS Instance Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **RDS API** — Instance configuration (class, engine, storage, Multi-AZ)
2. **AWS Price List API** — Live, region-specific pricing rates
3. **CloudWatch Metrics** — CPU, connections, IOPS, network

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Instance | `hourly_rate × 730 × multi_az_multiplier` | Price List API |
| Storage | `allocated_gb × rate_per_gb_month` | Price List API |
| IOPS (io1/io2) | `provisioned_iops × iops_rate × multi_az_multiplier` | Price List API |
| Data Transfer | `network_bytes_out_gb × data_transfer_rate` | CloudWatch + Price List API |
| Backup | `backup_gb × backup_rate` | CloudWatch + Price List API |

The Multi-AZ multiplier (2×) is applied to both the instance hourly rate **and** provisioned IOPS cost for io1/io2 storage, reflecting AWS's actual billing for Multi-AZ deployments. The `MultiAZ` flag is read from the live RDS API response using `??` (nullish coalescing) so an explicit `false` from AWS is never overridden by the definition's `multi_az` property.

Backup storage cost is based on CloudWatch's `TotalBackupStorageBilled` metric when available, and the per-GB backup rate is fetched from the AWS Price List API. If the backup metric is unavailable, backup cost is omitted rather than guessed.

### What's NOT Included

- Reserved Instance/Savings Plans pricing
- Performance Insights, Enhanced Monitoring
- Read replica costs, cross-region replication

### Accuracy: 95-98% (on-demand), 50-60% (reserved instances)

---

## Lambda Function Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Lambda API** — Function configuration (memory, architecture, timeout)
2. **AWS Price List API** — Live, region-specific pricing rates
3. **CloudWatch Metrics** — Invocation counts and duration

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Requests | `(invocations / 1M) × request_rate` | CloudWatch |
| Duration | `gb_seconds × duration_rate` | CloudWatch |
| Provisioned Concurrency | `provisioned_gb_seconds × rate_per_gb_second` | Lambda API |

Architecture-specific pricing: arm64 is ~20% cheaper than x86_64.

Provisioned concurrency cost uses GB-seconds (`provisioned_concurrency × memory_gb × 730h × 3600`), matching the per-GB-second unit returned by the AWS Price List API for the `AWS-Lambda-Provisioned-Concurrency` group.

The request rate is fetched from the Price List API and normalised to "price per million requests" at fetch time. A unit-aware guard checks whether the API already returns a per-million price (unit string contains `"million"`) to prevent a 1,000,000× overcharge if the pricing unit ever changes.

### What's NOT Included

- Free tier (1M requests, 400K GB-seconds/month)
- Lambda@Edge, data transfer, CloudWatch Logs, X-Ray

### Accuracy: 95-98% (with CloudWatch metrics)

---

## DynamoDB Table Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **DynamoDB API** — Table configuration (billing mode, size, GSIs)
2. **AWS Price List API** — Read/write capacity unit and storage pricing
3. **CloudWatch Metrics** — Consumed read/write capacity units

### Pricing API Filters

```
ServiceCode: AmazonDynamoDB
Groups: DDB-ReadUnits, DDB-WriteUnits
ProductFamily: Database Storage
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Storage | `table_size_gb × $0.25/GB` | DynamoDB API + Price List API |
| Provisioned RCU | `rcu × $0.00013/hour × 730` | Price List API |
| Provisioned WCU | `wcu × $0.00065/hour × 730` | Price List API |
| On-Demand Reads | `read_units × $0.00000025` | CloudWatch |
| On-Demand Writes | `write_units × $0.00000125` | CloudWatch |

Supports both **Provisioned** and **PAY_PER_REQUEST** (on-demand) billing modes.

### What's NOT Included

- Reserved capacity pricing
- Global tables replication costs
- DynamoDB Streams costs
- DAX (DynamoDB Accelerator) costs
- Backup/restore costs (PITR, on-demand)

### Accuracy: 90-95% (provisioned), 85-90% (on-demand without metrics)

---

## CloudFront Distribution Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **CloudFront API** — Distribution configuration (price class, SSL)
2. **AWS Price List API** — Data transfer and request pricing
3. **CloudWatch Metrics** — Total requests, bytes downloaded/uploaded

### Pricing API Filters

```
ServiceCode: AmazonCloudFront
Location: United States
ProductFamily: Data Transfer, Request
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Data Transfer OUT | `bytes_downloaded_gb × rate/GB` | CloudWatch |
| HTTPS Requests | `(total_requests / 10K) × rate` | CloudWatch |
| Dedicated IP SSL | $600/month (if VIP method) | Config |

### What's NOT Included

- Lambda@Edge, Field-Level Encryption
- Real-Time Logs, Origin Shield
- Free tier (1TB/month, 10M requests)

### Accuracy: 90-95% (with CloudWatch metrics)

---

## SQS Queue Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **SQS API** — Queue configuration (Standard vs FIFO)
2. **AWS Price List API** — Per-request pricing
3. **CloudWatch Metrics** — Messages sent, received, deleted

### Pricing API Filters

```
ServiceCode: AWSQueueService
QueueType: Standard | FIFO
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Standard Requests | `(total_requests / 1M) × $0.40` | CloudWatch |
| FIFO Requests | `(total_requests / 1M) × $0.50` | CloudWatch |

SQS is purely usage-based with no fixed monthly cost. Each 64KB chunk counts as one request.

### What's NOT Included

- Free tier (1M requests/month)
- Data transfer costs

### Accuracy: 95-98% (with CloudWatch metrics)

---

## SNS Topic Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **SNS API** — Topic configuration (Standard vs FIFO)
2. **AWS Price List API** — Publish and delivery pricing
3. **CloudWatch Metrics** — Messages published, notifications delivered/failed

### Pricing API Filters

```
ServiceCode: AmazonSNS
Groups: SNS-Requests-Tier1, SNS-HTTP-Notifications
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Publish | `(messages / 1M) × $0.50` | CloudWatch |
| HTTP/HTTPS Delivery | `(deliveries / 100K) × $0.06` | CloudWatch |
| Email Delivery | $2.00 per 100K | Not estimated |
| SMS Delivery | $0.00645+ per message | Not estimated |
| SQS/Lambda Delivery | Free | — |

### What's NOT Included

- Free tier (1M publishes, 100K HTTP deliveries/month)
- SMS delivery costs (varies by country)
- Mobile push notification costs

### Accuracy: 90-95% (with CloudWatch metrics)

---

## Neptune Instance Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Neptune API** — Instance configuration (class, cluster, engine version)
2. **AWS Price List API** — Instance, storage, and I/O pricing
3. **CloudWatch Metrics** — Gremlin/SPARQL requests, volume bytes used

### Pricing API Filters

```
ServiceCode: AmazonNeptune
InstanceType: <instance-class>
ProductFamily: Database Storage, System Operation
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Instance | `hourly_rate × 730` | Price List API |
| Storage | `volume_gb × $0.10/GB` | CloudWatch |
| I/O | `(io_requests / 1M) × io_rate` | CloudWatch |
| Backup | `backup_gb × $0.023/GB` | Estimated |

I/O cost is included in the total monthly estimate. The I/O rate is fetched from the Price List API (`productFamily: System Operation`) with a unit-aware guard: if the API returns the price already expressed per-million requests (unit string contains `"million"`), the rate is used as-is; otherwise it is multiplied by 1,000,000. I/O requests are derived from CloudWatch Gremlin and SPARQL request-rate metrics.

### What's NOT Included

- Reserved instance pricing
- Data transfer costs
- Neptune Serverless costs
- Neptune Analytics costs

### Accuracy: 90-95% (with CloudWatch metrics)

---

## API Gateway Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **API Gateway V2 API** — API configuration (HTTP vs WebSocket)
2. **AWS Price List API** — Per-request pricing
3. **CloudWatch Metrics** — Total request count

### Pricing API Filters

```
ServiceCode: AmazonApiGateway
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| HTTP API Requests | `(requests / 1M) × request_rate` | CloudWatch |
| WebSocket Messages | `(messages / 1M) × request_rate` | CloudWatch |
| WebSocket Connection Minutes | `(minutes / 1M) × connection_rate` | Not estimated |

Rates are fetched from the Price List API. Each item's unit string is read from its own price dimension (not from the first item in the response) to correctly determine whether the price is already expressed per-million. This prevents a 1,000,000× overcharge when the response mixes product types (e.g. connection-minute SKUs alongside request SKUs).

### What's NOT Included

- Free tier (1M requests/month, first 12 months)
- Data transfer costs
- Caching costs
- Custom domain names

### Accuracy: 90-95% (with CloudWatch metrics)

---

# GCP Entities

## Common GCP Pricing Infrastructure

All GCP entities use the **Cloud Billing Catalog API** (`cloudbilling.googleapis.com/v1/services/<serviceId>/skus`) for live pricing. Each service has a unique service ID:

| Service | Service ID |
|---------|-----------|
| Cloud SQL | `9662-B51E-5089` |
| Cloud Storage | `95FF-2EF5-5EA1` |
| Cloud Functions | `29E7-DA93-CA13` |
| BigQuery | `24E6-581D-38E5` |
| Memorystore for Redis | `3905-3524-EC04` |
| Firestore | `6F81-5844-456A` |

GCP entities that support usage metrics use the **Cloud Monitoring API** (`monitoring.googleapis.com/v3`).

### Required GCP IAM Permissions

```yaml
roles/billing.viewer         # For Cloud Billing Catalog API
roles/monitoring.viewer      # For Cloud Monitoring metrics
# Plus service-specific viewer roles
```

---

## Cloud SQL Instance Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Cloud SQL Admin API** — Instance configuration (tier, storage, HA)
2. **Cloud Billing Catalog API** — vCPU, RAM, storage, network, backup pricing
3. **Cloud Monitoring API** — CPU, memory, disk, network metrics

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Instance | `(vcpu × vcpu_rate + memory_gb × ram_rate) × 730 × ha_multiplier` | Billing API |
| Storage | `storage_gb × rate × ha_multiplier` | Billing API |
| Network Egress | Tiered pricing ($0.12/GB) | Cloud Monitoring |
| Backup | `backup_gb × backup_rate` | Estimated |

HA multiplier is 2× for REGIONAL instances.

### Accuracy: 95-98% (on-demand), 50-60% (committed use discounts)

---

## Cloud Storage Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Cloud Storage API** — Bucket configuration and object listing
2. **Cloud Billing Catalog API** — Storage, operations, network, retrieval pricing
3. **Cloud Monitoring API** — Request counts and data transfer

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Storage | `size_gb × rate_per_class` | Storage API + Billing API |
| Class A Ops | `(ops / 10K) × rate` | Cloud Monitoring |
| Class B Ops | `(ops / 10K) × rate` | Cloud Monitoring |
| Network Egress | Tiered pricing | Cloud Monitoring |
| Retrieval | `retrieval_gb × rate_per_class` | Cloud Monitoring |

### Accuracy: 90-98% (depending on monitoring availability)

---

## Cloud Function Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Cloud Functions V2 API** — Function configuration (memory, CPU, min instances)
2. **Cloud Billing Catalog API** — Invocation, CPU, memory, network pricing
3. **Cloud Monitoring API** — Execution count and execution time

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Invocations | `(count / 1M) × $0.40` | Cloud Monitoring |
| CPU | `execution_seconds × cpu × $0.0000100/GHz-s` | Cloud Monitoring |
| Memory | `execution_seconds × memory_gb × $0.0000025/GB-s` | Cloud Monitoring |
| Min Instances Idle | `instances × (cpu + memory) × 730h × 10%` | Config |

### What's NOT Included

- Free tier (2M invocations, 400K GB-seconds, 200K GHz-seconds/month)
- Network egress, Cloud Build costs

### Accuracy: 90-95% (with Cloud Monitoring metrics)

---

## BigQuery Dataset Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **BigQuery API** — Dataset metadata, table listing with storage sizes
2. **Cloud Billing Catalog API** — Storage, query, and streaming insert pricing
3. **Cloud Monitoring API** — Query bytes scanned and streaming insert bytes

### Pricing API Service ID: `24E6-581D-38E5`

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Storage | `billable_size_gb × active_storage_rate` | BigQuery API + Billing API |
| On-demand Queries | `billable_tb_scanned × query_rate` | Cloud Monitoring + Billing API |
| Streaming Inserts | `streaming_gb × streaming_insert_rate` | Cloud Monitoring + Billing API |

### Notes

- The first 10 GB of storage and 1 TB of queries per month are deducted before calculating billable usage.
- The implementation fetches both active and long-term storage SKUs, but the current monthly estimate does not split table bytes into active vs long-term storage classes; storage is therefore costed using the active-storage rate.
- Query and streaming insert costs depend on Cloud Monitoring metrics from the last 30 days; if those metrics are unavailable, those usage-driven components are omitted rather than guessed.

### Accuracy: 90-98% (depending on Cloud Monitoring availability)

---

## Memorystore Redis Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Memorystore API** — Instance configuration (tier, memory, replicas)
2. **Cloud Billing Catalog API** — Per-GB-per-hour pricing by tier and region
3. **Cloud Monitoring API** — Network egress usage

### Pricing API Service ID: `3905-3524-EC04`

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Primary Instance | `memory_gb × per_gb_hour × 730` | Billing API |
| Read Replicas | `replicas × memory_gb × per_gb_hour × 730` | Config |
| Network Egress | `egress_gb × egress_rate` | Cloud Monitoring + Billing API |

Pricing varies by tier:
- **Basic**: ~$0.034/GB/hour (~$24.82/GB/month)
- **Standard HA**: ~$0.049/GB/hour (~$35.77/GB/month)

### What's NOT Included

- No free tier for Memorystore

### Accuracy: 90-98% (depending on Cloud Monitoring availability)

---

## Firestore Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Firestore API** — Database configuration (type, location, PITR)
2. **Cloud Billing Catalog API** — Document operations, storage, network pricing
3. **Cloud Monitoring API** — Reads, writes, deletes, storage size, and network egress

### Pricing API Service ID: `6F81-5844-456A`

### Cost Components

| Component | Calculation | Source |
|-----------|------|--------|
| Storage | `storage_gib × storage_rate` | Cloud Monitoring + Billing API |
| Document Reads | `(reads / 100K) × read_rate` | Cloud Monitoring + Billing API |
| Document Writes | `(writes / 100K) × write_rate` | Cloud Monitoring + Billing API |
| Document Deletes | `(deletes / 100K) × delete_rate` | Cloud Monitoring + Billing API |
| Network Egress | `egress_gb × egress_rate` | Cloud Monitoring + Billing API |

### Notes

- Firestore estimates are based on the last 30 days of Cloud Monitoring usage and include storage, document operations, and network egress when those metrics are available.
- PITR adds ~30% to storage costs when enabled.
- Free tier: 1 GiB storage, 50K reads, 20K writes, 20K deletes per day.

### Accuracy: 90-98% (depending on Cloud Monitoring availability)

---

# Azure Entities

## Common Azure Pricing Infrastructure

All Azure entities use the **Azure Retail Prices API** (`prices.azure.com/api/retail/prices`) for live pricing. This API is free and requires no authentication.

Azure entities that support usage metrics use **Azure Monitor** for actual usage data.

### Required Azure Permissions

```
Microsoft.Insights/metrics/read    # For Azure Monitor metrics
# Plus service-specific read permissions
```

---

## Storage Account Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Azure Management API** — Account configuration (SKU, access tier, location)
2. **Azure Retail Prices API** — Storage, operations, network, retrieval pricing
3. **Azure Monitor** — Transactions, egress, ingress, used capacity

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Storage | `storage_gb × rate_per_gb` | Azure Monitor + Retail Prices |
| Operations | `((reads + writes + list) / 10K) × per-operation rates` | Azure Monitor + Retail Prices API |
| Network Egress | Tiered pricing | Azure Monitor + Retail Prices API |
| Data Retrieval | `retrieval_gb × rate` (Cool/Archive only) | Azure Monitor |

### Accuracy: 90-98% (depending on tier and redundancy)

---

## PostgreSQL Flexible Server Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Azure Management API** — Server configuration (SKU, tier, storage, HA)
2. **Azure Retail Prices API** — Compute, storage, backup pricing
3. **Azure Monitor** — CPU, memory, storage, connections, network

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Compute | `vcores × vcore_hourly_rate × 730 × ha_multiplier` | Retail Prices |
| Storage | `storage_gb × $0.115/GB` | Retail Prices |
| Backup | `additional_backup_gb × $0.095 × geo_multiplier` | Estimated |
| Network Egress | Tiered pricing | Azure Monitor |

**Important**: Burstable tier uses per-instance pricing (not per-vCore). The implementation correctly handles this distinction.

### Accuracy: 95-98% (on-demand), 50-60% (reserved capacity)

---

## Cosmos DB Account Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Azure Management API** — Account configuration (kind, regions, consistency)
2. **Azure Retail Prices API** — RU/s and storage pricing
3. **Azure Management API + Azure Monitor** — Throughput settings, region configuration, and `DataUsage` storage metrics

### Retail Prices API Filter

```
serviceName eq 'Azure Cosmos DB' and armRegionName eq '<region>'
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Throughput | `(RU/s / 100) × ru_rate × 730 × region_count` | Management API + Retail Prices API |
| Multi-region Writes | `throughput_cost × multi_region_write_multiplier` | Retail Prices API |
| Storage | `data_gb × storage_rate × region_count` | Azure Monitor + Retail Prices API |

### Concerns

- Throughput is discovered from account-, database-, or container-level throughput settings; the implementation fails if it cannot determine RU/s instead of assuming a default.
- Storage cost is included when Azure Monitor's `DataUsage` metric is available; if that metric is unavailable, storage is omitted rather than guessed.
- Free tier: 1000 RU/s and 25 GB storage (first account per subscription).

### Accuracy: 90-98% (depending on Azure Monitor availability)

---

## Event Hubs Namespace Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Azure Management API** — Namespace configuration (SKU, capacity)
2. **Azure Retail Prices API** — Throughput Unit (TU) / Processing Unit (PU) and ingress pricing
3. **Azure Monitor** — Incoming message counts

### Retail Prices API Filter

```
serviceName eq 'Event Hubs' and armRegionName eq '<region>'
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Throughput Units (Basic/Standard) | `capacity × tu_rate/hour × 730` | Retail Prices |
| Processing Units (Premium) | `capacity × pu_rate/hour × 730` | Retail Prices |
| Ingress Events | `(incoming_messages / 1M) × ingress_rate` | Azure Monitor + Retail Prices API |

### What's NOT Included

- Capture feature storage costs
- Auto-inflate scaling costs

### Accuracy: 90-98% (depending on Azure Monitor availability and auto-inflate behavior)

---

## Service Bus Namespace Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **Azure Management API** — Namespace configuration (SKU, capacity)
2. **Azure Retail Prices API** — Messaging unit, base, and operations pricing
3. **Azure Monitor** — `IncomingRequests` operations counts

### Retail Prices API Filter

```
serviceName eq 'Service Bus' and armRegionName eq '<region>'
```

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Premium Messaging Units | `capacity × messaging_unit_rate × 730` | Retail Prices API |
| Standard Base | `base_rate/hour × 730` | Retail Prices API |
| Operations (Basic/Standard) | `(incoming_requests / 1M) × operations_rate` | Azure Monitor + Retail Prices API |

### What's NOT Included

- Brokered connection charges
- Hybrid connection pricing

### Accuracy: 90-98% (depending on Azure Monitor availability)

---

# DigitalOcean Entities

## Common DigitalOcean Pricing Infrastructure

DigitalOcean does not provide a public pricing API. All pricing is **hardcoded** based on published pricing from the DigitalOcean website. This means pricing data may become stale if DigitalOcean changes their rates.

---

## Database Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **DigitalOcean API** — Database cluster configuration (size, engine, nodes)
2. **Hardcoded pricing table** — Fixed monthly prices per size slug

### Pricing Table

| Size Slug | Base Price | Included Storage |
|-----------|-----------|-----------------|
| `db-s-1vcpu-1gb` | $15/month | 10 GB |
| `db-s-1vcpu-2gb` | $30/month | 25 GB |
| `db-s-2vcpu-4gb` | $60/month | 38 GB |
| `db-s-4vcpu-8gb` | $120/month | 115 GB |
| `db-s-6vcpu-16gb` | $240/month | 270 GB |
| `db-s-8vcpu-32gb` | $480/month | 580 GB |

Engine multipliers: Kafka 1.5×, OpenSearch 1.2×, all others 1.0×.

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Compute | `price_per_node × num_nodes` | Hardcoded table |
| Storage | Included in base price | — |
| Additional Storage | $0.10/GB/month | — |
| Backups | Included (7-day retention) | — |

### Accuracy: 90-95% (based on published pricing)

---

## Spaces Bucket Cost Estimation

### Overview

Calculates estimated monthly costs by combining data from:

1. **S3-compatible API** — Bucket storage usage (object listing)
2. **Hardcoded pricing** — Fixed DigitalOcean Spaces pricing

### Pricing

| Component | Rate |
|-----------|------|
| Base Plan | $5.00/month |
| Included Storage | 250 GB |
| Included Transfer | 1 TB outbound |
| Additional Storage | $0.02/GB |
| Additional Transfer | $0.01/GB |

### Cost Components

| Component | Calculation | Source |
|-----------|-------------|--------|
| Base Plan | $5.00 fixed | Hardcoded |
| Additional Storage | `max(0, usage_gb - 250) × $0.02` | S3 API |
| Additional Transfer | Usage-based (not estimated) | — |

**Note**: Spaces pricing is per-account, not per-bucket. Inbound transfer is always free.

### Accuracy: 95-98% (storage), transfer not estimated

---

## Container Registry Cost Estimation

### Overview

Calculates estimated monthly costs based on subscription tier:

1. **DigitalOcean API** — Registry configuration and storage usage
2. **Hardcoded pricing** — Fixed per-tier pricing

### Pricing

| Tier | Monthly Price | Storage |
|------|--------------|---------|
| Starter | $0 | 500 MB |
| Basic | $5 | 5 GB |
| Professional | $20 | Unlimited |

### Cost Components

Fixed monthly price based on subscription tier. No usage-based charges.

**Note**: DigitalOcean allows only one registry per account.

### Accuracy: 100% (fixed pricing)

---

# Cross-Cutting Concerns

## Pricing Data Freshness

| Provider | Approach | Freshness |
|----------|----------|-----------|
| AWS | Live API calls (Price List API) | Real-time |
| GCP | Live API calls (Cloud Billing Catalog) | Real-time |
| Azure | Live API calls (Retail Prices API) | Real-time |
| DigitalOcean | Hardcoded pricing tables | Manual updates needed |

## Fallback Behavior

- **AWS**: Pricing API failures surface as errors in `costs` output; rate tables are not silently substituted.
- **GCP**: Pricing API failures surface as errors in `costs` output; usage-based components are omitted when Cloud Monitoring data is unavailable instead of being guessed.
- **Azure**: Pricing API failures surface as errors in `costs` output; usage-based components are omitted when Azure Monitor data is unavailable or insufficient for an accurate breakdown.
- **DigitalOcean**: Always uses hardcoded rates (no API available)

## Usage-Based vs Fixed Cost Entities

| Type | Entities | `costs` Behavior |
|------|----------|-----------------|
| **Fixed cost** | RDS, Cloud SQL, Neptune, Memorystore Redis, Event Hubs (Premium), Service Bus (Premium), DO Database, DO Registry | Returns calculated monthly cost |
| **Usage-based** | S3, Lambda, DynamoDB, CloudFront, SQS, SNS, API Gateway, Cloud Function, Cloud Storage, BigQuery, Firestore | Returns cost based on CloudWatch/Monitoring metrics (may be $0 if no metrics) |
| **Hybrid** | Cosmos DB, Event Hubs, Service Bus, DO Spaces | Returns fixed components plus measured usage components when metrics are available |

## Known Limitations

1. **No discount support** — Reserved instances, savings plans, committed use discounts, and enterprise agreements are not reflected in estimates
2. **Free tier handling varies by service** — Most entities show gross cost without free-tier deduction; BigQuery is a notable exception and deducts its storage/query free tier
3. **Metrics-dependent usage components may be omitted** — If CloudWatch, Cloud Monitoring, or Azure Monitor data is unavailable, usage-driven portions are omitted rather than guessed
4. **DigitalOcean pricing staleness** — Hardcoded prices may become outdated
5. **Cross-region data transfer** — Not estimated for most services
6. **Backup cost is still partly approximate for some databases** — Cloud SQL and Azure PostgreSQL derive billable backup size from configuration rather than a provider billing metric
7. **BigQuery long-term storage is not separated yet** — The implementation fetches the long-term storage rate but currently prices all measured storage at the active-storage rate
8. **Cosmos DB storage depends on Azure Monitor** — If the `DataUsage` metric is unavailable, storage cost is omitted from the total
9. **Neptune I/O without CloudWatch metrics** — If Gremlin/SPARQL request-rate metrics are unavailable, I/O cost is omitted from the total and a warning is displayed

## Future Improvements

1. **Reserved Instance/Savings Plan detection** — Check if resources are covered by commitments
2. **Free tier deduction** — Subtract free tier allowances from estimates
3. **Historical cost trending** — Use CloudWatch/Monitoring data to project future costs
4. **Cost optimization recommendations** — Suggest right-sizing based on usage metrics
5. **DigitalOcean API pricing** — Monitor for a public pricing API to replace hardcoded values
6. **Azure Cost Management integration** — Use actual billed costs for running resources
