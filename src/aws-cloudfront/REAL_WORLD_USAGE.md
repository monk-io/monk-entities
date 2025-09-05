# AWS CloudFront Entity: Real-World Usage Guide

This guide provides practical examples and best practices for using the AWS CloudFront entity in production environments.

## 🌐 Common Real-World Scenarios

### 1. E-Commerce Website CDN

Perfect for online stores with global customers requiring fast page loads and secure checkout.

```yaml
namespace: ecommerce-prod

# Main website CDN with multiple origins
ecommerce-cdn:
  defines: aws-cloudfront/distribution
  region: us-east-1
  comment: "E-commerce site CDN with API and static content"
  enabled: true
  default_root_object: "index.html"
  
  # Multiple origins for different content types
  origins:
    # Static website files (HTML, CSS, JS)
    - id: "website-s3"
      domain_name: "ecommerce-website.s3.us-west-2.amazonaws.com"
      s3_origin_config:
        origin_access_identity: "origin-access-identity/cloudfront/E123EXAMPLE"
    
    # Product images and media
    - id: "media-s3"
      domain_name: "ecommerce-media.s3.us-west-2.amazonaws.com"
      s3_origin_config:
        origin_access_identity: "origin-access-identity/cloudfront/E123EXAMPLE"
    
    # API backend
    - id: "api-backend"
      domain_name: "api.ecommerce.com"
      origin_path: "/v2"
      custom_origin_config:
        http_port: 80
        https_port: 443
        origin_protocol_policy: "https-only"
        origin_ssl_protocols: ["TLSv1.2"]
        origin_read_timeout: 30
        origin_keep_alive_timeout: 5
      connection_attempts: 3
      connection_timeout: 10

  # Default behavior for website content
  default_cache_behavior:
    target_origin_id: "website-s3"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD", "OPTIONS"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: true
    min_ttl: 0
    default_ttl: 86400      # 1 day
    max_ttl: 31536000       # 1 year

  # Specific cache behaviors for different content
  cache_behaviors:
    # API calls - no caching, forward everything
    - path_pattern: "/api/*"
      target_origin_id: "api-backend"
      viewer_protocol_policy: "https-only"
      allowed_methods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "all"
      forward_query_string: true
      forward_headers: ["Authorization", "Content-Type", "Accept", "User-Agent"]
      compress: false
      min_ttl: 0
      default_ttl: 0         # No caching
      max_ttl: 0
    
    # Product images - long caching
    - path_pattern: "/images/*"
      target_origin_id: "media-s3"
      viewer_protocol_policy: "redirect-to-https"
      allowed_methods: ["GET", "HEAD"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "none"
      forward_query_string: false
      compress: true
      min_ttl: 86400         # 1 day
      default_ttl: 2592000   # 30 days
      max_ttl: 31536000      # 1 year
    
    # Dynamic content with short caching
    - path_pattern: "/products/*"
      target_origin_id: "website-s3"
      viewer_protocol_policy: "redirect-to-https"
      allowed_methods: ["GET", "HEAD"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "none"
      forward_query_string: true
      compress: true
      min_ttl: 0
      default_ttl: 300       # 5 minutes
      max_ttl: 3600          # 1 hour

  # Custom error pages
  custom_error_responses:
    - error_code: 404
      response_page_path: "/error-pages/404.html"
      response_code: 404
      error_caching_min_ttl: 300
    - error_code: 500
      response_page_path: "/error-pages/500.html"
      response_code: 500
      error_caching_min_ttl: 60
    - error_code: 503
      response_page_path: "/maintenance.html"
      response_code: 503
      error_caching_min_ttl: 0

  # Custom domain with SSL
  aliases:
    - "www.ecommerce.com"
    - "cdn.ecommerce.com"

  viewer_certificate:
    acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/12345678-1234-1234-1234-123456789012"
    ssl_support_method: "sni-only"
    minimum_protocol_version: "TLSv1.2_2021"

  # Global distribution for performance
  price_class: "PriceClass_All"
  is_ipv6_enabled: true
  http_version: "http2"

  # Access logging for analytics
  logging:
    enabled: true
    bucket: "ecommerce-cloudfront-logs.s3.amazonaws.com"
    prefix: "access-logs/"
    include_cookies: false

  tags:
    Environment: "production"
    Project: "ecommerce"
    CostCenter: "marketing"
    Owner: "devops-team"
```

### 2. Single Page Application (SPA) with API

Modern React/Vue/Angular applications with backend API integration.

```yaml
namespace: spa-prod

# SPA distribution with API proxy
spa-app-cdn:
  defines: aws-cloudfront/distribution
  region: us-east-1
  comment: "React SPA with API backend"
  enabled: true
  default_root_object: "index.html"
  
  origins:
    # SPA static files
    - id: "spa-s3"
      domain_name: "my-spa-app.s3.us-east-1.amazonaws.com"
      s3_origin_config:
        origin_access_identity: "origin-access-identity/cloudfront/E123EXAMPLE"
    
    # API Gateway or ALB
    - id: "api-gateway"
      domain_name: "api.myapp.com"
      custom_origin_config:
        http_port: 80
        https_port: 443
        origin_protocol_policy: "https-only"
        origin_ssl_protocols: ["TLSv1.2"]

  default_cache_behavior:
    target_origin_id: "spa-s3"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: true
    min_ttl: 0
    default_ttl: 300        # 5 minutes for HTML
    max_ttl: 86400

  cache_behaviors:
    # API requests - no caching
    - path_pattern: "/api/*"
      target_origin_id: "api-gateway"
      viewer_protocol_policy: "https-only"
      allowed_methods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "all"
      forward_query_string: true
      forward_headers: ["Authorization", "Content-Type", "Accept", "Origin", "Referer"]
      compress: false
      min_ttl: 0
      default_ttl: 0
      max_ttl: 0
    
    # Static assets - long caching
    - path_pattern: "/static/*"
      target_origin_id: "spa-s3"
      viewer_protocol_policy: "redirect-to-https"
      allowed_methods: ["GET", "HEAD"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "none"
      forward_query_string: false
      compress: true
      min_ttl: 31536000      # 1 year
      default_ttl: 31536000
      max_ttl: 31536000

  # Handle SPA routing - return index.html for 404s
  custom_error_responses:
    - error_code: 404
      response_page_path: "/index.html"
      response_code: 200
      error_caching_min_ttl: 0
    - error_code: 403
      response_page_path: "/index.html"
      response_code: 200
      error_caching_min_ttl: 0

  aliases:
    - "app.mycompany.com"

  viewer_certificate:
    acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/spa-cert-id"
    ssl_support_method: "sni-only"
    minimum_protocol_version: "TLSv1.2_2021"

  price_class: "PriceClass_100"  # Cost optimization
  is_ipv6_enabled: true
  http_version: "http2"

  tags:
    Environment: "production"
    Application: "web-app"
    Team: "frontend"
```

### 3. Video Streaming Platform

Large media files with global delivery optimization.

```yaml
namespace: streaming-prod

# Video streaming CDN
video-streaming-cdn:
  defines: aws-cloudfront/distribution
  region: us-east-1
  comment: "Video streaming platform CDN"
  enabled: true
  
  origins:
    # Video content S3 bucket
    - id: "video-s3"
      domain_name: "streaming-videos.s3.us-west-2.amazonaws.com"
      s3_origin_config:
        origin_access_identity: "origin-access-identity/cloudfront/E123EXAMPLE"
    
    # Thumbnail images
    - id: "thumbnails-s3"
      domain_name: "video-thumbnails.s3.us-west-2.amazonaws.com"
      s3_origin_config:
        origin_access_identity: "origin-access-identity/cloudfront/E123EXAMPLE"
    
    # API for metadata
    - id: "video-api"
      domain_name: "video-api.streaming.com"
      custom_origin_config:
        https_port: 443
        origin_protocol_policy: "https-only"
        origin_ssl_protocols: ["TLSv1.2"]

  default_cache_behavior:
    target_origin_id: "video-s3"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD", "OPTIONS"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: false          # Don't compress video files
    min_ttl: 86400          # 1 day
    default_ttl: 604800     # 1 week
    max_ttl: 31536000       # 1 year

  cache_behaviors:
    # Video segments (.m3u8, .ts files)
    - path_pattern: "*.m3u8"
      target_origin_id: "video-s3"
      viewer_protocol_policy: "redirect-to-https"
      allowed_methods: ["GET", "HEAD"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "none"
      forward_query_string: false
      compress: false
      min_ttl: 300           # 5 minutes
      default_ttl: 3600      # 1 hour
      max_ttl: 86400         # 1 day
    
    # Thumbnails - long caching
    - path_pattern: "/thumbnails/*"
      target_origin_id: "thumbnails-s3"
      viewer_protocol_policy: "redirect-to-https"
      allowed_methods: ["GET", "HEAD"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "none"
      forward_query_string: false
      compress: true
      min_ttl: 86400
      default_ttl: 2592000
      max_ttl: 31536000
    
    # API calls for metadata
    - path_pattern: "/api/*"
      target_origin_id: "video-api"
      viewer_protocol_policy: "https-only"
      allowed_methods: ["GET", "HEAD", "OPTIONS", "POST"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "whitelist"
      whitelist_cookies: ["session-id", "user-id"]
      forward_query_string: true
      compress: true
      min_ttl: 0
      default_ttl: 300
      max_ttl: 3600

  # Global delivery for video content
  price_class: "PriceClass_All"
  is_ipv6_enabled: true
  http_version: "http2"

  tags:
    Environment: "production"
    Service: "video-streaming"
    ContentType: "media"
```

### 4. API Acceleration

Accelerate API responses globally with edge caching.

```yaml
namespace: api-prod

# API acceleration CDN
api-acceleration-cdn:
  defines: aws-cloudfront/distribution
  region: us-east-1
  comment: "Global API acceleration"
  enabled: true
  
  origins:
    - id: "main-api"
      domain_name: "api.backend.com"
      origin_path: "/v1"
      custom_origin_config:
        http_port: 80
        https_port: 443
        origin_protocol_policy: "https-only"
        origin_ssl_protocols: ["TLSv1.2"]
        origin_read_timeout: 30
        origin_keep_alive_timeout: 5
      connection_attempts: 3
      connection_timeout: 10

  default_cache_behavior:
    target_origin_id: "main-api"
    viewer_protocol_policy: "https-only"
    allowed_methods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods: ["GET", "HEAD", "OPTIONS"]
    forward_cookies: "all"
    forward_query_string: true
    forward_headers: ["Authorization", "Content-Type", "Accept", "User-Agent", "X-Forwarded-For"]
    compress: true
    min_ttl: 0
    default_ttl: 0
    max_ttl: 86400

  cache_behaviors:
    # Cache GET requests for reference data
    - path_pattern: "/reference/*"
      target_origin_id: "main-api"
      viewer_protocol_policy: "https-only"
      allowed_methods: ["GET", "HEAD", "OPTIONS"]
      cached_methods: ["GET", "HEAD", "OPTIONS"]
      forward_cookies: "none"
      forward_query_string: true
      forward_headers: ["Authorization"]
      compress: true
      min_ttl: 300
      default_ttl: 3600
      max_ttl: 86400
    
    # No caching for user-specific data
    - path_pattern: "/user/*"
      target_origin_id: "main-api"
      viewer_protocol_policy: "https-only"
      allowed_methods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods: ["GET", "HEAD"]
      forward_cookies: "all"
      forward_query_string: true
      forward_headers: ["*"]
      compress: true
      min_ttl: 0
      default_ttl: 0
      max_ttl: 0

  aliases:
    - "api-cdn.mycompany.com"

  viewer_certificate:
    acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/api-cert-id"
    ssl_support_method: "sni-only"
    minimum_protocol_version: "TLSv1.2_2021"

  price_class: "PriceClass_All"
  is_ipv6_enabled: true
  http_version: "http2"

  tags:
    Environment: "production"
    Service: "api-acceleration"
    Type: "performance"
```

## 🔄 DevOps Integration Patterns

### CI/CD Pipeline Integration

```yaml
# Deploy CloudFront as part of application stack
namespace: myapp-deploy

# Environment-specific CDN
myapp-cdn:
  defines: aws-cloudfront/distribution
  region: us-east-1
  comment: "Application CDN - ${ENVIRONMENT}"
  enabled: true
  
  # Use environment variables for dynamic configuration
  origins:
    - id: "app-origin"
      domain_name: "${APP_DOMAIN}"
      custom_origin_config:
        https_port: 443
        origin_protocol_policy: "https-only"

  default_cache_behavior:
    target_origin_id: "app-origin"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: true
    min_ttl: 0
    default_ttl: 86400
    max_ttl: 31536000

  aliases:
    - "${CDN_DOMAIN}"

  tags:
    Environment: "${ENVIRONMENT}"
    Version: "${BUILD_VERSION}"
    DeployedBy: "${CI_USER}"
    BuildId: "${BUILD_ID}"
```

### Blue-Green Deployment with CloudFront

```yaml
namespace: bluegreen-deploy

# Blue environment CDN
app-cdn-blue:
  defines: aws-cloudfront/distribution
  region: us-east-1
  comment: "Blue environment CDN"
  enabled: true
  
  origins:
    - id: "blue-origin"
      domain_name: "blue.myapp.com"
      custom_origin_config:
        https_port: 443
        origin_protocol_policy: "https-only"

  default_cache_behavior:
    target_origin_id: "blue-origin"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: true

  # Blue-specific domain
  aliases:
    - "blue-cdn.myapp.com"

  tags:
    Environment: "blue"
    DeploymentStrategy: "blue-green"

# Green environment CDN
app-cdn-green:
  defines: aws-cloudfront/distribution
  region: us-east-1
  comment: "Green environment CDN"
  enabled: false  # Start disabled
  
  origins:
    - id: "green-origin"
      domain_name: "green.myapp.com"
      custom_origin_config:
        https_port: 443
        origin_protocol_policy: "https-only"

  default_cache_behavior:
    target_origin_id: "green-origin"
    viewer_protocol_policy: "redirect-to-https"
    allowed_methods: ["GET", "HEAD"]
    cached_methods: ["GET", "HEAD"]
    forward_cookies: "none"
    forward_query_string: false
    compress: true

  # Green-specific domain
  aliases:
    - "green-cdn.myapp.com"

  tags:
    Environment: "green"
    DeploymentStrategy: "blue-green"
```

## 🔧 Operations and Management

### Cache Invalidation Strategies

```bash
# Invalidate all content after deployment
monk do myapp-prod/app-cdn/create-invalidation

# Invalidate specific paths
monk do myapp-prod/app-cdn/create-invalidation paths='["/index.html", "/static/css/*", "/static/js/*"]'

# Invalidate API responses
monk do myapp-prod/api-cdn/create-invalidation paths='["/api/v1/products/*"]'

# Check invalidation status
monk do myapp-prod/app-cdn/list-invalidations
```

### Monitoring and Health Checks

```bash
# Check distribution status
monk do myapp-prod/app-cdn/get-distribution-info

# View distribution configuration
monk do myapp-prod/app-cdn/get-distribution-config

# Monitor entity status
monk describe myapp-prod/app-cdn
monk logs myapp-prod/app-cdn
```

## 💰 Cost Optimization Strategies

### 1. Price Class Selection

```yaml
# Cost-optimized for regional audience
regional-cdn:
  defines: aws-cloudfront/distribution
  price_class: "PriceClass_100"  # US, Canada, Europe
  
# Global reach for international business
global-cdn:
  defines: aws-cloudfront/distribution
  price_class: "PriceClass_All"  # All edge locations
```

### 2. TTL Optimization

```yaml
# Optimized TTL settings for different content types
optimized-cdn:
  defines: aws-cloudfront/distribution
  
  cache_behaviors:
    # Static assets - long caching
    - path_pattern: "/static/*"
      min_ttl: 31536000      # 1 year
      default_ttl: 31536000
      max_ttl: 31536000
    
    # HTML pages - medium caching
    - path_pattern: "*.html"
      min_ttl: 0
      default_ttl: 3600      # 1 hour
      max_ttl: 86400         # 1 day
    
    # API responses - minimal caching
    - path_pattern: "/api/*"
      min_ttl: 0
      default_ttl: 300       # 5 minutes
      max_ttl: 3600          # 1 hour
```

## 🔒 Security Best Practices

### 1. Origin Access Identity (OAI)

```yaml
# Secure S3 origin access
secure-s3-cdn:
  defines: aws-cloudfront/distribution
  
  origins:
    - id: "secure-s3"
      domain_name: "private-bucket.s3.amazonaws.com"
      s3_origin_config:
        # Use OAI to restrict direct S3 access
        origin_access_identity: "origin-access-identity/cloudfront/E123EXAMPLE"
```

### 2. Custom Headers and Security

```yaml
# Security-focused distribution
security-cdn:
  defines: aws-cloudfront/distribution
  
  default_cache_behavior:
    target_origin_id: "app-origin"
    viewer_protocol_policy: "https-only"  # Force HTTPS
    # Forward security headers
    forward_headers: 
      - "X-Forwarded-Proto"
      - "X-Forwarded-Host"
      - "CloudFront-Viewer-Country"
    compress: true

  # Use modern TLS only
  viewer_certificate:
    acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/cert-id"
    ssl_support_method: "sni-only"
    minimum_protocol_version: "TLSv1.2_2021"
```

## 🚀 Advanced Use Cases

### Multi-Region Failover

```yaml
# Primary region CDN
primary-cdn:
  defines: aws-cloudfront/distribution
  
  origins:
    - id: "primary-origin"
      domain_name: "primary.myapp.com"
      custom_origin_config:
        https_port: 443
        origin_protocol_policy: "https-only"
    
    # Failover origin
    - id: "failover-origin"
      domain_name: "failover.myapp.com"
      custom_origin_config:
        https_port: 443
        origin_protocol_policy: "https-only"

  # Configure origin groups for failover
  default_cache_behavior:
    target_origin_id: "primary-origin"
    viewer_protocol_policy: "redirect-to-https"
```

### Microservices Architecture

```yaml
# CDN for microservices with path-based routing
microservices-cdn:
  defines: aws-cloudfront/distribution
  
  origins:
    - id: "user-service"
      domain_name: "user-service.internal.com"
    - id: "product-service"
      domain_name: "product-service.internal.com"
    - id: "order-service"
      domain_name: "order-service.internal.com"

  cache_behaviors:
    - path_pattern: "/users/*"
      target_origin_id: "user-service"
      viewer_protocol_policy: "https-only"
      forward_cookies: "all"
      forward_query_string: true
    
    - path_pattern: "/products/*"
      target_origin_id: "product-service"
      viewer_protocol_policy: "https-only"
      # Cache product data longer
      default_ttl: 3600
    
    - path_pattern: "/orders/*"
      target_origin_id: "order-service"
      viewer_protocol_policy: "https-only"
      forward_cookies: "all"
      # No caching for orders
      default_ttl: 0
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] AWS IAM permissions configured
- [ ] SSL certificates created in ACM (us-east-1)
- [ ] Origin servers accessible and configured
- [ ] DNS records planned for aliases
- [ ] Cost implications reviewed

### Post-Deployment
- [ ] Distribution deployed successfully (15-20 minutes)
- [ ] DNS records updated to point to CloudFront
- [ ] SSL certificate working correctly
- [ ] Cache behaviors functioning as expected
- [ ] Access logs configured and flowing
- [ ] Monitoring and alerting set up

### Testing
- [ ] Test all cache behaviors with different paths
- [ ] Verify API forwarding works correctly
- [ ] Test custom error pages
- [ ] Validate SSL/TLS configuration
- [ ] Check geographic distribution performance

## 🔍 Troubleshooting Common Issues

### Performance Issues
```bash
# Check distribution status
monk do myapp-prod/app-cdn/get-distribution-info

# Review cache hit ratios in CloudWatch
# Adjust TTL settings for better performance
```

### SSL Certificate Issues
- Ensure certificate is in us-east-1 region
- Verify domain validation is complete
- Check certificate includes all required domains

### Origin Connection Issues
- Verify origin server is accessible
- Check security groups and NACLs
- Validate origin SSL certificates

This comprehensive guide covers the most common real-world scenarios for using the CloudFront entity in production environments. Each example can be customized based on specific requirements and integrated into existing infrastructure stacks.
