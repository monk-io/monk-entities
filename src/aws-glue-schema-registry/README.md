# AWS Glue Schema Registry

Monk entities for managing AWS Glue Schema Registry resources. Schema Registry provides a central repository for managing and validating schemas used in data streaming and ETL pipelines.

## Features

- **Registry Management**: Create and manage schema registries as containers for schemas
- **Schema Management**: Create schemas with AVRO, JSON, or Protobuf formats
- **Version Control**: Register and track schema versions with compatibility validation
- **Metadata Support**: Attach key-value metadata to schema versions
- **Compatibility Modes**: Support for BACKWARD, FORWARD, FULL, and other compatibility modes

## Entities

| Entity | Description |
|--------|-------------|
| `aws-glue-schema-registry/registry` | Schema registry container |
| `aws-glue-schema-registry/schema` | Schema with initial version |
| `aws-glue-schema-registry/schema-version` | Individual schema version |

## Authentication

All entities use AWS provider authentication. Credentials are automatically injected via the built-in `aws` module.

Required IAM permissions:
- `glue:CreateRegistry`, `glue:GetRegistry`, `glue:UpdateRegistry`, `glue:DeleteRegistry`, `glue:ListRegistries`
- `glue:CreateSchema`, `glue:GetSchema`, `glue:UpdateSchema`, `glue:DeleteSchema`, `glue:ListSchemas`
- `glue:RegisterSchemaVersion`, `glue:GetSchemaVersion`, `glue:ListSchemaVersions`, `glue:DeleteSchemaVersions`
- `glue:CheckSchemaVersionValidity`, `glue:GetSchemaVersionsDiff`, `glue:GetSchemaByDefinition`
- `glue:PutSchemaVersionMetadata`, `glue:QuerySchemaVersionMetadata`, `glue:RemoveSchemaVersionMetadata`
- `glue:TagResource`, `glue:UntagResource`, `glue:GetTags`

## Usage Examples

### Create a Registry

```yaml
my-registry:
  defines: aws-glue-schema-registry/registry
  region: us-east-1
  registry_name: my-data-registry
  registry_description: Central registry for data pipeline schemas
  tags:
    environment: production
    team: data-engineering
```

### Create a Schema with AVRO Format

```yaml
user-events-schema:
  defines: aws-glue-schema-registry/schema
  depends:
    wait-for:
      runnables:
        - my-namespace/my-registry
  connections:
    registry:
      runnable: my-namespace/my-registry
      service: data
  region: us-east-1
  registry_name: <- connection-target("registry") entity-state get-member("registry_name")
  schema_name: user-events
  data_format: AVRO
  compatibility: BACKWARD
  schema_description: Schema for user event data
  schema_definition: '{"type":"record","name":"UserEvent","namespace":"com.example.events","fields":[{"name":"user_id","type":"string"},{"name":"event_type","type":"string"},{"name":"timestamp","type":"long"}]}'
  tags:
    domain: analytics
```

### Create a Schema with JSON Format

```yaml
order-schema:
  defines: aws-glue-schema-registry/schema
  depends:
    wait-for:
      runnables:
        - my-namespace/my-registry
  connections:
    registry:
      runnable: my-namespace/my-registry
      service: data
  region: us-east-1
  registry_name: <- connection-target("registry") entity-state get-member("registry_name")
  schema_name: orders
  data_format: JSON
  compatibility: FULL
  schema_description: Schema for e-commerce order data
  schema_definition: '{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"order_id":{"type":"string"},"customer_id":{"type":"string"},"total":{"type":"number"}},"required":["order_id","customer_id","total"]}'
  tags:
    domain: commerce
```

### Register a New Schema Version

```yaml
user-events-v2:
  defines: aws-glue-schema-registry/schema-version
  depends:
    wait-for:
      runnables:
        - my-namespace/user-events-schema
  connections:
    schema:
      runnable: my-namespace/user-events-schema
      service: data
  region: us-east-1
  registry_name: <- connection-target("schema") entity-state get-member("registry_name")
  schema_name: <- connection-target("schema") entity-state get-member("schema_name")
  schema_definition: '{"type":"record","name":"UserEvent","namespace":"com.example.events","fields":[{"name":"user_id","type":"string"},{"name":"event_type","type":"string"},{"name":"timestamp","type":"long"},{"name":"session_id","type":["null","string"],"default":null}]}'
  metadata:
    author: data-team
    change: Added optional session_id field
```

## Configuration Reference

### Registry

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `registry_name` | string | Yes | - | Unique registry name (1-255 chars) |
| `registry_description` | string | No | - | Human-readable description |
| `tags` | map | No | - | Resource tags |

### Schema

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `registry_name` | string | Yes | - | Parent registry name |
| `schema_name` | string | Yes | - | Unique schema name (1-255 chars) |
| `data_format` | string | Yes | - | `AVRO`, `JSON`, or `PROTOBUF` |
| `compatibility` | string | No | `BACKWARD` | Compatibility mode |
| `schema_definition` | string | Yes | - | Initial schema definition |
| `schema_description` | string | No | - | Human-readable description |
| `tags` | map | No | - | Resource tags |

**Compatibility Modes:**
- `NONE`: No compatibility checks
- `DISABLED`: Prevent new versions
- `BACKWARD`: New version can read old data
- `BACKWARD_ALL`: New version can read all old data
- `FORWARD`: Old version can read new data
- `FORWARD_ALL`: All old versions can read new data
- `FULL`: Both backward and forward compatible
- `FULL_ALL`: Both backward and forward compatible with all versions

### Schema Version

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `region` | string | Yes | - | AWS region |
| `registry_name` | string | Yes | - | Parent registry name |
| `schema_name` | string | Yes | - | Parent schema name |
| `schema_definition` | string | Yes | - | Version schema definition |
| `metadata` | map | No | - | Key-value metadata (max 256 chars each) |

## Actions

### Registry Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `get-info` | Get detailed registry information | - |
| `list-schemas` | List schemas in this registry | `max_results`, `next_token` |
| `list-registries` | List all registries in region | `max_results`, `next_token` |

### Schema Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `get-info` | Get detailed schema information | - |
| `register-version` | Register a new schema version | `schema_definition` |
| `list-versions` | List all versions of this schema | `max_results`, `next_token` |
| `get-version` | Get specific version details | `version_number`, `version_id` |
| `check-compatibility` | Check if definition is compatible | `schema_definition` |
| `get-diff` | Get diff between versions | `first_version`, `second_version` |
| `get-definition` | Get schema definition | `version_number` |

### Schema Version Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| `get-info` | Get version details with metadata | - |
| `get-definition` | Get schema definition | - |
| `put-metadata` | Add/update metadata | `key`, `value` |
| `query-metadata` | Query metadata | `key` (optional) |
| `remove-metadata` | Remove metadata key | `key` |
| `check-validity` | Check version validity status | - |

## State Fields

### Registry State

| Field | Description |
|-------|-------------|
| `registry_arn` | Full ARN of the registry |
| `registry_name` | Registry name |
| `status` | Current status (AVAILABLE, DELETING) |
| `existing` | Whether resource pre-existed |

### Schema State

| Field | Description |
|-------|-------------|
| `schema_arn` | Full ARN of the schema |
| `schema_name` | Schema name |
| `registry_name` | Parent registry name |
| `status` | Current status |
| `data_format` | Schema data format |
| `compatibility` | Compatibility mode |
| `latest_schema_version` | Latest version number |
| `schema_version_id` | UUID of latest version |
| `existing` | Whether resource pre-existed |

### Schema Version State

| Field | Description |
|-------|-------------|
| `schema_version_id` | UUID of this version |
| `version_number` | Sequential version number |
| `status` | Current status (AVAILABLE, PENDING, FAILURE) |
| `schema_arn` | Parent schema ARN |
| `data_format` | Schema data format |
| `existing` | Whether resource pre-existed |

## Integration with Other Services

Schema Registry integrates with:

- **Amazon MSK / Apache Kafka**: Validate and serialize messages
- **Amazon Kinesis Data Streams**: Schema validation for streaming data
- **AWS Lambda**: Deserialize data using schema versions
- **AWS Glue ETL**: Schema-aware data transformations
- **Apache Flink**: Stream processing with schema validation

## Related Documentation

- [AWS Glue Schema Registry Documentation](https://docs.aws.amazon.com/glue/latest/dg/schema-registry.html)
- [Schema Registry API Reference](https://docs.aws.amazon.com/glue/latest/dg/aws-glue-api-schema-registry-api.html)
- [AVRO Specification](https://avro.apache.org/docs/current/spec.html)
- [JSON Schema](https://json-schema.org/)
