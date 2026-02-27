# AWS Neptune Entity Tests

## Prerequisites

1. AWS credentials configured (automatically injected via AWS provider)
2. VPC with at least 2 subnets in different availability zones
3. IAM permissions for Neptune operations

## Required IAM Permissions

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "rds:CreateDBCluster",
                "rds:DescribeDBClusters",
                "rds:ModifyDBCluster",
                "rds:DeleteDBCluster",
                "rds:CreateDBInstance",
                "rds:DescribeDBInstances",
                "rds:ModifyDBInstance",
                "rds:DeleteDBInstance",
                "rds:CreateDBClusterParameterGroup",
                "rds:DescribeDBClusterParameterGroups",
                "rds:DescribeDBClusterParameters",
                "rds:ModifyDBClusterParameterGroup",
                "rds:DeleteDBClusterParameterGroup",
                "rds:ResetDBClusterParameterGroup",
                "rds:CreateDBSubnetGroup",
                "rds:DescribeDBSubnetGroups",
                "rds:ModifyDBSubnetGroup",
                "rds:DeleteDBSubnetGroup",
                "rds:CreateDBClusterSnapshot",
                "rds:DescribeDBClusterSnapshots",
                "rds:StartDBCluster",
                "rds:StopDBCluster",
                "rds:FailoverDBCluster",
                "rds:RebootDBInstance",
                "rds:DescribeDBLogFiles",
                "rds:AddTagsToResource",
                "rds:RemoveTagsFromResource",
                "rds:ListTagsForResource"
            ],
            "Resource": "*"
        }
    ]
}
```

## Running Tests

### 1. Compile the module

```bash
INPUT_DIR=./src/aws-neptune/ OUTPUT_DIR=./dist/aws-neptune/ ./monkec.sh compile
```

### 2. Load the entities

```bash
monk load dist/aws-neptune/MANIFEST
```

### 3. Load and run the example

```bash
monk load src/aws-neptune/example.yaml
monk run --autoload aws-neptune-example/my-subnet-group
```

**Note:** Before running, update the `subnet_ids` in `example.yaml` with actual subnet IDs from your VPC.

## Test Scenarios

### Basic Cluster Creation

1. Create subnet group with 2+ subnets
2. Create cluster with subnet group
3. Create primary instance
4. Verify cluster and instance are available
5. Test `get-info` action
6. Clean up resources

### High Availability

1. Create cluster with 2 instances
2. Verify reader endpoint is available
3. Test failover action
4. Verify new writer is promoted

### Serverless

1. Create cluster with serverless scaling config
2. Create serverless instance (db.serverless class)
3. Verify auto-scaling behavior

## Cleanup

Neptune resources can be expensive. Always clean up after testing:

```bash
monk delete --force aws-neptune-example/my-replica
monk delete --force aws-neptune-example/my-instance
monk delete --force aws-neptune-example/my-cluster
monk delete --force aws-neptune-example/my-parameter-group
monk delete --force aws-neptune-example/my-subnet-group
```

## Troubleshooting

### Cluster creation fails

- Ensure subnet group has subnets in at least 2 AZs
- Check security group allows inbound on port 8182
- Verify IAM permissions

### Instance creation takes too long

- Neptune instances can take 10-15 minutes to create
- The entity has a 90-attempt readiness check with 10-second intervals

### Cannot delete cluster

- Ensure all instances are deleted first
- Disable deletion protection if enabled
- Wait for any pending modifications to complete
