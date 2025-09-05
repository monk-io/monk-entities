# AWS CloudFront Entity for Monk Orchestrator

This directory contains a **production-ready** AWS CloudFront CDN entity implementation for the Monk orchestrator platform. The entity provides complete lifecycle management for CloudFront distributions including creation, updates, deletion, readiness checks, and comprehensive distribution management operations.

## 🎯 Status: Production Ready ✅

- ✅ **Fully Functional**: All lifecycle operations and custom actions working
- ✅ **Comprehensive Testing**: Complete integration test suite available  
- ✅ **Multiple Configurations**: Support for simple to complex distribution setups
- ✅ **AWS Compatible**: Successfully tested with AWS CloudFront API (IAM permissions required)
- ✅ **Production Features**: Multiple origins, cache behaviors, custom error pages, SSL certificates
- ✅ **Error Handling**: Robust AWS API error handling and reporting

## Architecture

The AWS CloudFront entity follows the established Monk entity pattern with three main components:

### Core Files

- **`base.ts`**: Contains the `AWSCloudFrontEntity` base class that provides common functionality for CloudFront operations
  - AWS API integration using the built-in `aws` module
  - Core CloudFront operations (create, delete, modify, describe distributions)
  - Distribution state management and array processing
  - Error handling and XML response parsing

- **`common.ts`**: Contains shared utilities and interfaces
  - Distribution configuration validation and normalization
  - Parameter building for AWS CloudFront API calls
  - Helper functions for distribution configuration
  - Validation utilities for domain names, origin IDs, and aliases

- **`distribution.ts`**: Main CloudFront distribution entity implementation
  - Extends `AWSCloudFrontEntity` base class
  - Implements lifecycle methods: create, start, stop, update, delete, checkReadiness
  - Provides custom actions for distribution management
  - Handles array processing from Monk's indexed field format
  - Supports complex distribution configurations

## Entity Usage

### Basic Distribution with S3 Origin

```yaml
namespace: my-app

my-website-cdn:
  defines: aws-cloudfront/cloud-front-distribution
  region: us-east-1
  comment: "CDN for my website"
  enabled: true
  default_root_object: "index.html"
  
  origins:
    - id: "s3-origin"
      domain_name: "my-website-bucket.s3.amazonaws.com"
      s3_origin_config:
        origin_access_identity: ""
  
  default_cache_behavior:
    target_origin_id: "s3-origin"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: true
    min_ttl: 0
    default_ttl: 86400
    max_ttl: 31536000

  price_class: "PriceClass_100"
  is_ipv6_enabled: true
  http_version: "http2"

  tags:
    Environment: "production"
    Project: "my-website"
```

### Advanced Distribution with Multiple Origins

```yaml
namespace: my-app

advanced-cdn:
  defines: aws-cloudfront/cloud-front-distribution
  region: us-east-1
  comment: "Advanced CDN with API and static content"
  enabled: true
  
  origins:
    - id: "api-origin"
      domain_name: "api.example.com"
      origin_path: "/v1"
      custom_origin_config:
        http_port: 80
        https_port: 443
        origin_protocol_policy: "https-only"
        origin_ssl_protocols: ["TLSv1.2"]
        origin_read_timeout: 30
        origin_keep_alive_timeout: 5
    
    - id: "static-origin"
      domain_name: "static.example.com"
      custom_origin_config:
        http_port: 80
        https_port: 443
        origin_protocol_policy: "redirect-to-https"
  
  default_cache_behavior:
    target_origin_id: "static-origin"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD", "OPTIONS"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: true

  cache_behaviors:
    - path_pattern: "/api/*"
      target_origin_id: "api-origin"
      viewer_protocol_policy: "https-only"
      allowed_methods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "all"
      forward_query_string: true
      forward_headers: ["Authorization", "Content-Type"]
      compress: false
      min_ttl: 0
      default_ttl: 0
      max_ttl: 0

  custom_error_responses:
    - error_code: 404
      response_page_path: "/error-pages/404.html"
      response_code: 404
      error_caching_min_ttl: 300

  aliases:
    - "cdn.example.com"

  viewer_certificate:
    acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"
    ssl_support_method: "sni-only"
    minimum_protocol_version: "TLSv1.2_2021"

  price_class: "PriceClass_All"
  is_ipv6_enabled: true
  http_version: "http2"

  logging:
    enabled: true
    bucket: "my-cloudfront-logs.s3.amazonaws.com"
    prefix: "access-logs/"
    include_cookies: false

  tags:
    Environment: "production"
    Project: "my-app"
    Team: "frontend"
```

## Custom Actions

The CloudFront entity provides several custom actions for distribution management:

### get-distribution-info

Displays comprehensive information about the CloudFront distribution.

```bash
monk do aws-cloudfront-test/test-basic-distribution/get-distribution-info
```

**Output:**
```json
{
  "distribution_id": "E1234567890ABC",
  "domain_name": "d123456789abcdef.cloudfront.net",
  "status": "Deployed",
  "arn": "arn:aws:cloudfront::123456789012:distribution/E1234567890ABC",
  "last_modified": "2024-01-15T10:30:00.000Z",
  "in_progress_invalidations": 0,
  "etag": "E1AB2CD3EF4GH5"
}
```

### get-distribution-config

Shows the complete distribution configuration.

```bash
monk do aws-cloudfront-test/test-basic-distribution/get-distribution-config
```

### create-invalidation

Creates a cache invalidation for specified paths.

```bash
# Invalidate all files
monk do aws-cloudfront-test/test-basic-distribution/create-invalidation

# Invalidate specific paths
monk do aws-cloudfront-test/test-basic-distribution/create-invalidation paths='["/index.html", "/css/*"]'
```

**Parameters:**
- `paths` (optional): Array of paths to invalidate (default: `["/*"]`)
- `caller_reference` (optional): Unique reference for the invalidation

### list-invalidations

Lists all invalidations for the distribution.

```bash
monk do aws-cloudfront-test/test-basic-distribution/list-invalidations
```

## Security Features

### No Plain Text Credentials
The entity uses Monk's built-in AWS module which handles AWS credential management securely. No plain text AWS credentials are required in the entity definitions.

### SSL/TLS Support
- Support for custom SSL certificates via AWS Certificate Manager (ACM)
- Multiple protocol version options (TLSv1, TLSv1.1, TLSv1.2)
- SNI and VIP SSL support methods

### Access Control
- Origin access identity support for S3 origins
- Web ACL integration for AWS WAF
- Viewer protocol policies (HTTP, HTTPS, redirect)

## Required AWS IAM Permissions

The AWS user or role must have the following CloudFront permissions:

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

## Pre-existing Infrastructure Protection

The entity automatically detects and protects pre-existing CloudFront distributions:

- **Safe Detection**: Checks for existing distributions before creation
- **State Tracking**: Marks pre-existing distributions with `existing: true`
- **Deletion Protection**: Never deletes distributions that existed before entity management
- **State Preservation**: Maintains tracking of distribution state without modifying pre-existing resources

## Performance and Optimization

### Distribution Deployment Time
- **Creation**: 15-20 minutes for new distributions
- **Updates**: 10-15 minutes for configuration changes
- **Deletion**: 15-20 minutes (requires disabling first)

### Readiness Checks
- Automatically monitors distribution status
- Reports ready when status is "Deployed"
- Configurable check intervals and timeouts

### Global Edge Network
- Support for all CloudFront price classes
- IPv6 support
- HTTP/2 protocol support

## Testing

### Running Tests

```bash
# Build the entity
./build.sh aws-cloudfront

# Load entity and test templates
sudo /home/ivan/Work/monk/dist/monk load ./dist/aws-cloudfront/MANIFEST
sudo /home/ivan/Work/monk/dist/monk load ./src/aws-cloudfront/test/stack-template.yaml

# Run individual test
sudo /home/ivan/Work/monk/dist/monk purge --no-confirm aws-cloudfront-test/test-basic-distribution
sudo /home/ivan/Work/monk/dist/monk run aws-cloudfront-test/test-basic-distribution

# Check status
sudo /home/ivan/Work/monk/dist/monk ps -a
sudo /home/ivan/Work/monk/dist/monk describe aws-cloudfront-test/test-basic-distribution
```

### Test Scenarios
- Basic S3 origin distribution
- Advanced multi-origin distribution with cache behaviors
- Custom error pages and SSL certificates
- Cache invalidation operations

## Deployment Considerations

### Distribution Management
- Distributions must be disabled before deletion
- Disabling requires deployment time (10-15 minutes)
- Use staging distributions for testing changes

### Cost Optimization
- Choose appropriate price class based on global requirements
- Monitor cache hit ratios for optimization opportunities
- Use appropriate TTL values for different content types

### Performance Tuning
- Configure cache behaviors for different content types
- Use compression for text-based content
- Implement custom error pages for better user experience

## Troubleshooting

### Common Issues

1. **Permission Errors**: Ensure AWS user has required CloudFront permissions
2. **Deployment Timeout**: CloudFront operations take 15-20 minutes
3. **SSL Certificate Issues**: Ensure ACM certificates are in us-east-1 region
4. **Origin Access**: Verify origin domains are accessible and configured correctly

### Debug Mode
Enable debug logging by examining entity logs:

```bash
monk logs aws-cloudfront-test/test-basic-distribution
```

## Examples

### Basic Examples
See the `example.yaml` file for comprehensive usage examples including:
- Basic S3 website distribution
- Advanced multi-origin setup
- Single Page Application (SPA) configuration
- Custom error handling and SSL setup

### Real-World Production Scenarios
See the `REAL_WORLD_USAGE.md` file for detailed production examples including:
- E-commerce website CDN with multiple origins
- Single Page Application with API integration
- Video streaming platform optimization
- API acceleration and global caching
- DevOps CI/CD integration patterns
- Blue-green deployment strategies
- Cost optimization techniques
- Security best practices

## Dependencies

- **Monk Platform**: Compatible with Monk orchestrator
- **AWS Account**: Valid AWS account with CloudFront access
- **IAM Permissions**: Required CloudFront API permissions
- **Network Access**: Internet connectivity for AWS API calls

## Support

For issues specific to this entity implementation:
1. Check AWS IAM permissions
2. Verify AWS region settings
3. Review entity logs for detailed error information
4. Ensure distribution configurations meet AWS CloudFront requirements

For general Monk platform support, refer to the Monk documentation.
