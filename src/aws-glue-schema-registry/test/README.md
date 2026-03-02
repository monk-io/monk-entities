# AWS Glue Schema Registry Tests

Integration tests for AWS Glue Schema Registry entities.

## Prerequisites

1. AWS account with Glue Schema Registry access
2. IAM credentials with the following permissions:
   - `glue:CreateRegistry`, `glue:GetRegistry`, `glue:DeleteRegistry`, `glue:ListRegistries`
   - `glue:CreateSchema`, `glue:GetSchema`, `glue:DeleteSchema`, `glue:ListSchemas`, `glue:UpdateSchema`
   - `glue:RegisterSchemaVersion`, `glue:GetSchemaVersion`, `glue:ListSchemaVersions`, `glue:DeleteSchemaVersions`
   - `glue:CheckSchemaVersionValidity`, `glue:GetSchemaVersionsDiff`
   - `glue:PutSchemaVersionMetadata`, `glue:QuerySchemaVersionMetadata`, `glue:RemoveSchemaVersionMetadata`
   - `glue:TagResource`, `glue:UntagResource`, `glue:GetTags`

## Setup

1. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and add your AWS credentials:
   ```
   AWS_ACCESS_KEY_ID=your-access-key-id
   AWS_SECRET_ACCESS_KEY=your-secret-access-key
   ```

## Running Tests

### Compile the module first:
```bash
INPUT_DIR=./src/aws-glue-schema-registry/ OUTPUT_DIR=./dist/aws-glue-schema-registry/ ./monkec.sh compile
```

### Run integration tests:
```bash
sudo INPUT_DIR=./src/aws-glue-schema-registry/ ./monkec.sh test
```

### Run with verbose output:
```bash
sudo INPUT_DIR=./src/aws-glue-schema-registry/ ./monkec.sh test --verbose
```

### Run specific test file:
```bash
sudo INPUT_DIR=./src/aws-glue-schema-registry/ ./monkec.sh test --test-file test/stack-integration.test.yaml
```

## Manual Testing

### Load and deploy the test stack:
```bash
cd dist/aws-glue-schema-registry/
monk load MANIFEST
monk load ../../src/aws-glue-schema-registry/test/stack-template.yaml
monk secrets add -g aws-access-key-id='YOUR_KEY'
monk secrets add -g aws-secret-access-key='YOUR_SECRET'
monk update aws-glue-schema-registry-test/stack
```

### Check status:
```bash
monk ps -a
monk describe aws-glue-schema-registry-test/test-registry
monk describe aws-glue-schema-registry-test/test-schema
monk describe aws-glue-schema-registry-test/test-schema-version
```

### Run actions:
```bash
# Registry actions
monk do aws-glue-schema-registry-test/test-registry/get-info
monk do aws-glue-schema-registry-test/test-registry/list-schemas
monk do aws-glue-schema-registry-test/test-registry/list-registries

# Schema actions
monk do aws-glue-schema-registry-test/test-schema/get-info
monk do aws-glue-schema-registry-test/test-schema/list-versions
monk do aws-glue-schema-registry-test/test-schema/get-definition

# Schema version actions
monk do aws-glue-schema-registry-test/test-schema-version/get-info
monk do aws-glue-schema-registry-test/test-schema-version/query-metadata
```

### Cleanup:
```bash
monk delete --force aws-glue-schema-registry-test/stack
```

## Test Coverage

The integration tests cover:

### Registry Entity
- Creation and availability
- State fields (registry_name, registry_arn, status)
- Actions: get-info, list-schemas, list-registries

### Schema Entity
- Creation with AVRO format
- State fields (schema_name, registry_name, data_format, compatibility, latest_schema_version)
- Actions: get-info, list-versions, get-version, get-definition, check-compatibility

### Schema Version Entity
- Version registration
- State fields (schema_version_id, version_number, status)
- Metadata attachment
- Actions: get-info, get-definition, query-metadata, check-validity

### Cross-Entity
- Registry → Schema relationship
- Schema → Schema Version relationship
- Connection-based property resolution

## Troubleshooting

### Common Issues

1. **EntityNotFoundException**: Registry or schema doesn't exist
   - Ensure the parent resource is created first
   - Check the registry_name and schema_name are correct

2. **AlreadyExistsException**: Resource already exists
   - The entity will adopt existing resources (sets `existing: true`)
   - Delete manually if you want a fresh start

3. **InvalidInputException**: Invalid schema definition
   - Validate your AVRO/JSON schema syntax
   - Check compatibility mode allows your changes

4. **AccessDeniedException**: Missing IAM permissions
   - Verify your IAM user/role has the required Glue permissions
   - Check the region matches your credentials

### Debug Commands

```bash
# Check entity state
monk describe aws-glue-schema-registry-test/test-schema

# Decode Monk errors
echo '<base64-error>' | monk decode-err

# View loaded templates
monk ls
monk dump aws-glue-schema-registry-test/test-schema
```
