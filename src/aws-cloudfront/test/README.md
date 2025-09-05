# AWS CloudFront Entity Testing

This directory contains comprehensive tests for the AWS CloudFront entity, including integration tests that verify the complete lifecycle of CloudFront distributions and all custom actions.

## Test Files

- **`stack-template.yaml`** - Test entity definitions with basic and advanced CloudFront distribution configurations
- **`stack-integration.test.yaml`** - Comprehensive integration test suite covering all entity functionality
- **`env.example`** - Example environment variables for test configuration

## Prerequisites

### AWS Permissions

The test user/role must have the following CloudFront permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudfront:CreateDistribution",
                "cloudfront:GetDistribution",
                "cloudfront:UpdateDistribution",
                "cloudfront:DeleteDistribution",
                "cloudfront:ListDistributions",
                "cloudfront:CreateInvalidation",
                "cloudfront:GetInvalidation",
                "cloudfront:ListInvalidations"
            ],
            "Resource": "*"
        }
    ]
}
```

### Environment Setup

1. Copy the environment template:
   ```bash
   cp env.example .env
   ```

2. Configure your AWS credentials (if not using IAM roles):
   ```bash
   # Edit .env with your AWS credentials and preferences
   nano .env
   ```

## Running Tests

### Manual Testing (Step by Step)

1. **Build the CloudFront entity:**
   ```bash
   ./build.sh aws-cloudfront
   ```

2. **Load the entity manifest:**
   ```bash
   sudo /home/ivan/Work/monk/dist/monk load ./dist/aws-cloudfront/MANIFEST
   ```

3. **Load the test template:**
   ```bash
   sudo /home/ivan/Work/monk/dist/monk load ./src/aws-cloudfront/test/stack-template.yaml
   ```

4. **Run individual test distributions:**
   ```bash
   # Basic distribution test
   sudo /home/ivan/Work/monk/dist/monk run aws-cloudfront-test/test-basic-distribution
   
   # Custom origin distribution test
   sudo /home/ivan/Work/monk/dist/monk run aws-cloudfront-test/test-custom-origin-distribution
   ```

5. **Test custom actions:**
   ```bash
   # Get distribution information
   sudo /home/ivan/Work/monk/dist/monk do aws-cloudfront-test/test-basic-distribution/get-distribution-info
   
   # Get full distribution configuration
   sudo /home/ivan/Work/monk/dist/monk do aws-cloudfront-test/test-basic-distribution/get-distribution-config
   
   # Create cache invalidation
   sudo /home/ivan/Work/monk/dist/monk do aws-cloudfront-test/test-basic-distribution/create-invalidation
   
   # List invalidations
   sudo /home/ivan/Work/monk/dist/monk do aws-cloudfront-test/test-basic-distribution/list-invalidations
   ```

6. **Check entity status:**
   ```bash
   # List all running entities
   sudo /home/ivan/Work/monk/dist/monk ps -a
   
   # Describe specific entity
   sudo /home/ivan/Work/monk/dist/monk describe aws-cloudfront-test/test-basic-distribution
   ```

7. **Clean up:**
   ```bash
   # Delete test distributions
   sudo /home/ivan/Work/monk/dist/monk delete --force aws-cloudfront-test/test-basic-distribution
   sudo /home/ivan/Work/monk/dist/monk delete --force aws-cloudfront-test/test-custom-origin-distribution
   ```

### Automated Integration Testing

Run the complete integration test suite:

```bash
sudo INPUT_DIR=./src/aws-cloudfront/ ./monkec.sh test --test-file stack-integration.test.yaml
```

Or run with verbose output:

```bash
sudo INPUT_DIR=./src/aws-cloudfront/ ./monkec.sh test --verbose --test-file stack-integration.test.yaml
```

## Test Scenarios

### Basic Distribution Test

Tests a simple CloudFront distribution with:
- Single custom origin (example.com)
- Basic cache behavior configuration
- HTTPS redirect policy
- Standard AWS certificate

### Custom Origin Distribution Test

Tests an advanced CloudFront distribution with:
- Multiple origins (API and static content)
- Custom cache behaviors for different path patterns
- Complex caching rules and TTL settings
- Custom error page configuration

### Custom Actions Testing

The integration test verifies all custom actions:

1. **`get-distribution-info`** - Retrieves distribution status, ID, domain name, and basic information
2. **`get-distribution-config`** - Shows complete distribution configuration including origins and cache behaviors
3. **`create-invalidation`** - Creates cache invalidations for specified paths
4. **`list-invalidations`** - Lists all invalidations for the distribution

### Cache Invalidation Testing

Tests various invalidation scenarios:
- Default invalidation (all paths: `/*`)
- Specific path invalidation (`/index.html`, `/css/*`, etc.)
- Batch invalidation with multiple paths
- Custom caller reference handling
- Error handling for invalid requests

## Test Distribution Configurations

### Basic Distribution (`test-basic-distribution`)

```yaml
region: us-east-1
comment: "Test CloudFront distribution - basic S3 origin"
enabled: true
default_root_object: "index.html"

origins:
  - id: "test-s3-origin"
    domain_name: "example.com"
    custom_origin_config:
      http_port: 80
      https_port: 443
      origin_protocol_policy: "https-only"

default_cache_behavior:
  target_origin_id: "test-s3-origin"
  viewer_protocol_policy: "redirect-to-https"
  # ... additional cache behavior settings
```

### Custom Origin Distribution (`test-custom-origin-distribution`)

```yaml
region: us-east-1
comment: "Test CloudFront distribution - custom origins with cache behaviors"
enabled: true

origins:
  - id: "api-origin"
    domain_name: "api.example.com"
    origin_path: "/v1"
  - id: "static-origin"
    domain_name: "static.example.com"

cache_behaviors:
  - path_pattern: "/api/*"
    target_origin_id: "api-origin"
    # ... API-specific cache settings
  - path_pattern: "/images/*"
    target_origin_id: "static-origin"
    # ... static content cache settings

custom_error_responses:
  - error_code: 404
    response_page_path: "/error-pages/404.html"
    response_code: 404
```

## Performance Considerations

### CloudFront Distribution Deployment Time

- **Creation**: 15-20 minutes for new distributions
- **Updates**: 10-15 minutes for configuration changes  
- **Deletion**: 15-20 minutes (requires disabling first)

### Test Timeout Settings

The integration test uses appropriate timeouts:
- Overall test timeout: 30 minutes (`1800000` ms)
- Distribution readiness: 20 minutes for deployment
- Action timeouts: Standard (30 seconds)

### Resource Limits

CloudFront has service limits that may affect testing:
- Maximum 200 distributions per AWS account
- Maximum 25 origins per distribution
- Maximum 25 cache behaviors per distribution
- Maximum 3000 invalidation requests per month (first 1000 are free)

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure AWS user has required CloudFront permissions
   - Basic tests require: `cloudfront:CreateDistribution`, `cloudfront:DeleteDistribution`
   - Advanced tests also require: `cloudfront:GetDistribution`, `cloudfront:CreateInvalidation`, `cloudfront:ListInvalidations`
2. **Distribution Creation Timeout**: CloudFront deployments take 15-20 minutes
3. **Domain Validation Errors**: Ensure test origin domains are accessible
4. **Invalidation Limits**: CloudFront has monthly invalidation limits

### Running Tests with Limited Permissions

If you only have basic CloudFront permissions (`CreateDistribution`, `DeleteDistribution`), you can still verify core functionality:

```bash
# Test just the entity creation and deletion
sudo /home/ivan/Work/monk/dist/monk run aws-cloudfront-test/test-basic-distribution
sudo /home/ivan/Work/monk/dist/monk describe aws-cloudfront-test/test-basic-distribution
sudo /home/ivan/Work/monk/dist/monk delete --force aws-cloudfront-test/test-basic-distribution
```

The integration test will show which specific actions require additional permissions.

### Debug Mode

Enable debug logging to see detailed API interactions:

```bash
# The entity includes comprehensive debug output by default
# Check entity logs for detailed CloudFront API requests/responses
sudo /home/ivan/Work/monk/dist/monk logs aws-cloudfront-test/test-basic-distribution
```

### Test Data Cleanup

If tests fail and leave resources:

```bash
# List all running entities
sudo /home/ivan/Work/monk/dist/monk ps -a

# Force delete stuck entities
sudo /home/ivan/Work/monk/dist/monk delete --force aws-cloudfront-test/test-basic-distribution

# Check AWS Console for any remaining CloudFront distributions
```

## Cost Considerations

CloudFront testing costs:
- Distribution creation/deletion: Free
- Data transfer: Minimal for testing (< $1)
- Invalidation requests: First 1000/month free, then $0.005 each
- No charges while distributions are deploying

## CI/CD Integration

For automated testing in CI/CD pipelines:

```bash
# Environment setup in CI
export AWS_ACCESS_KEY_ID=$CI_AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=$CI_AWS_SECRET_ACCESS_KEY
export AWS_REGION=us-east-1

# Run tests with timeout handling
timeout 2400 sudo INPUT_DIR=./src/aws-cloudfront/ ./monkec.sh test --test-file stack-integration.test.yaml
```

Remember to configure appropriate IAM roles and policies for CI/CD environments with the minimum required CloudFront permissions.
