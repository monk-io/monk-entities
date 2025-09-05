# CloudFront Static Website - Deployment Guide

This guide walks you through deploying the CloudFront static website demo to AWS using the Monk orchestrator platform.

## 📋 Prerequisites Checklist

### AWS Requirements
- [ ] AWS Account with billing configured
- [ ] AWS CLI installed and configured
- [ ] IAM user/role with required permissions (see below)
- [ ] (Optional) Custom domain registered
- [ ] (Optional) SSL certificate requested in ACM

### Monk Platform Requirements
- [ ] Monk orchestrator installed
- [ ] AWS credentials configured in Monk
- [ ] CloudFront and S3 entities built and loaded

## 🔑 Required AWS Permissions

Your AWS user/role needs these permissions:

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
                "cloudfront:CreateInvalidation",
                "cloudfront:GetInvalidation",
                "cloudfront:ListInvalidations",
                "s3:CreateBucket",
                "s3:DeleteBucket",
                "s3:GetBucketLocation",
                "s3:GetBucketVersioning",
                "s3:PutBucketVersioning",
                "s3:GetBucketWebsite",
                "s3:PutBucketWebsite",
                "s3:GetBucketCORS",
                "s3:PutBucketCORS",
                "s3:GetBucketPublicAccessBlock",
                "s3:PutBucketPublicAccessBlock",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:GetBucketPolicy",
                "s3:PutBucketPolicy"
            ],
            "Resource": "*"
        }
    ]
}
```

## 🚀 Step-by-Step Deployment

### Step 1: Build and Load Entities

1. **Build Required Entities**
   ```bash
   cd monk-entities  # Navigate to monk-entities root
   ./build.sh aws-cloudfront
   ./build.sh aws-s3
   ```

2. **Load Entities into Monk**
   ```bash
   # Load CloudFront entity
   cd dist/aws-cloudfront
   monk load MANIFEST
   
   # Load S3 entity
   cd ../aws-s3
   monk load MANIFEST
   ```

3. **Load Demo Stack Template**
   ```bash
   cd ../../examples/cloudfront-static-website
   monk load cloudfront-static-website.yaml
   ```

4. **Verify Templates Loaded**
   ```bash
   monk ls | grep cloudfront-static-website
   ```

### Step 2: Deploy Infrastructure

1. **Deploy the Complete Stack**
   ```bash
   monk run cloudfront-static-website/cloudfront-demo-stack
   ```

2. **Monitor Deployment Progress**
   ```bash
   # Check overall stack status
   monk ps -a
   
   # Check individual components
   monk describe cloudfront-static-website/website-bucket
   monk describe cloudfront-static-website/website-cdn
   ```

3. **Wait for CloudFront Deployment**
   ```bash
   # CloudFront deployment takes 15-20 minutes
   monk logs cloudfront-static-website/website-cdn
   
   # Check when distribution is ready
   monk do cloudfront-static-website/website-cdn/get-distribution-info
   ```

### Step 3: Upload Website Content

1. **Upload Website Files**
   ```bash
   cd examples/cloudfront-static-website
   
   # Upload files with optimized cache headers
   aws s3 sync ./src/ s3://cloudfront-demo-static-website-enhanced/ \
     --delete \
     --cache-control "max-age=300"
   
   # Or use the provided script for more advanced deployment
   ./scripts/sync-to-s3.sh
   ```

2. **Verify S3 Website Hosting**
   ```bash
   # Check that S3 website hosting is configured
   aws s3api get-bucket-website --bucket cloudfront-demo-static-website-enhanced
   
   # Check bucket policy
   aws s3api get-bucket-policy --bucket cloudfront-demo-static-website-enhanced
   ```

### Step 4: Get Website URL and Test

1. **Get CloudFront Distribution Domain**
   ```bash
   monk do cloudfront-static-website/website-cdn/get-distribution-info
   ```

2. **Access Your Website**
   ```bash
   # The output will include the domain_name field
   # Something like: d123456789abcdef.cloudfront.net
   curl -I https://your-cloudfront-domain.com
   ```

### Step 5: Verify Deployment

1. **Test Website Functionality**
   - [ ] Home page loads
   - [ ] All sections are accessible
   - [ ] Performance demos work
   - [ ] Cache headers are correct
   - [ ] Compression is working
   - [ ] Error pages display properly

2. **Test Cache Behaviors**
   ```bash
   # Test HTML caching (5 minutes)
   curl -I https://your-cloudfront-domain.com/
   
   # Test CSS caching (30 days)
   curl -I https://your-cloudfront-domain.com/assets/css/styles.css
   
   # Test image caching (90 days)
   curl -I https://your-cloudfront-domain.com/assets/images/cloudfront-logo.svg
   ```

3. **Test Custom Error Pages**
   ```bash
   # Test 404 error
   curl -I https://your-cloudfront-domain.com/nonexistent-page
   ```

## 🔄 Updating the Website

### Content Update Workflow

1. **Deploy Changes to S3**
   ```bash
   # Sync updated files
   aws s3 sync ./src/ s3://cloudfront-demo-static-website-enhanced/ \
     --delete \
     --cache-control "max-age=300"
   
   # Or use the provided script
   ./scripts/sync-to-s3.sh
   ```

2. **Invalidate CloudFront Cache (if needed)**
   ```bash
   # For immediate cache clearing
   monk do cloudfront-static-website/website-cdn/create-invalidation \
     paths='["/index.html", "/assets/css/*", "/assets/js/*"]'
   ```

3. **Verify Updates**
   ```bash
   # Wait 1-5 minutes for cache invalidation
   # Then test the changes
   curl -I https://your-cloudfront-domain.com/
   ```

### Automated Deployment

Set up automated deployment with GitHub Actions:

```yaml
# .github/workflows/deploy.yml
name: Deploy to CloudFront
on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Deploy to S3
        run: |
          aws s3 sync ./src/ s3://cloudfront-demo-static-website-enhanced/ --delete
      
      - name: Invalidate CloudFront
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

## 🔧 Environment-Specific Configuration

### Development Environment

```yaml
# cloudfront-static-website-dev.yaml
namespace: cloudfront-dev

website-bucket:
  defines: templates/local/aws-s3/s3-bucket
  bucket_name: "cloudfront-demo-dev-$(date +%s)"
  tags:
    Environment: "development"
    AutoShutdown: "enabled"

website-cdn:
  defines: templates/local/aws-cloudfront/cloud-front-distribution
  comment: "Development CloudFront distribution"
  price_class: "PriceClass_100"  # Cost optimization
  enabled: true
  tags:
    Environment: "development"
    AutoShutdown: "enabled"
```

### Staging Environment

```yaml
# cloudfront-static-website-staging.yaml  
namespace: cloudfront-staging

website-bucket:
  defines: templates/local/aws-s3/s3-bucket
  bucket_name: "cloudfront-demo-staging"
  tags:
    Environment: "staging"

website-cdn:
  defines: templates/local/aws-cloudfront/cloud-front-distribution
  comment: "Staging CloudFront distribution"
  price_class: "PriceClass_200"  # More regions for testing
  enabled: true
  tags:
    Environment: "staging"
    TestingRequired: "true"
```

### Production Environment

```yaml
# cloudfront-static-website-prod.yaml
namespace: cloudfront-prod

website-bucket:
  defines: templates/local/aws-s3/s3-bucket
  bucket_name: "yourcompany-website-prod"
  website_configuration:
    index_document: "index.html"
    error_document: "error.html"
  bucket_policy:
    policy: "public-read"
  tags:
    Environment: "production"
    CriticalService: "true"

website-cdn:
  defines: templates/local/aws-cloudfront/cloud-front-distribution
  comment: "Production CloudFront distribution"
  price_class: "PriceClass_All"  # Global performance
  enabled: true
  
  aliases:
    - "www.yourwebsite.com"
    - "yourwebsite.com"
  
  viewer_certificate:
    acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/prod-cert"
    ssl_support_method: "sni-only"
    minimum_protocol_version: "TLSv1.2_2021"
  
  logging:
    enabled: true
    bucket: "your-cloudfront-logs.s3.amazonaws.com"
    prefix: "prod-access-logs/"
  
  tags:
    Environment: "production"
    CriticalService: "true"
    BackupRequired: "daily"
```

## 🔍 Monitoring and Maintenance

### CloudWatch Metrics to Monitor

1. **Cache Performance**
   - Cache hit ratio (aim for >90%)
   - Origin response time
   - Error rate (4xx, 5xx responses)

2. **Traffic Patterns**
   - Requests per minute
   - Data transfer amounts
   - Geographic distribution

3. **Cost Metrics**
   - Data transfer costs
   - Request costs
   - Cache invalidation costs

### Maintenance Tasks

**Daily:**
- [ ] Monitor error rates
- [ ] Check cache hit ratios
- [ ] Review access logs

**Weekly:**
- [ ] Analyze performance trends
- [ ] Review and optimize cache TTL settings
- [ ] Check SSL certificate expiry

**Monthly:**
- [ ] Cost optimization review
- [ ] Performance testing from multiple regions
- [ ] Security assessment and updates

## 🆘 Emergency Procedures

### High Error Rate

1. **Check S3 Origin Health**
   ```bash
   # Verify S3 bucket accessibility
   aws s3 ls s3://cloudfront-demo-static-website-enhanced
   
   # Check S3 website endpoint
   curl -I http://cloudfront-demo-static-website-enhanced.s3-website-us-east-1.amazonaws.com
   ```

2. **Check CloudFront Status**
   ```bash
   monk do cloudfront-static-website/website-cdn/get-distribution-info
   ```

### Performance Issues

1. **Cache Hit Ratio Too Low**
   - Review cache behaviors and TTL settings
   - Check for cache-busting query parameters
   - Analyze access logs for patterns

2. **Slow Origin Response**
   - Check S3 bucket region vs users
   - Consider adding more origin locations
   - Review origin timeout settings

### SSL Certificate Issues

1. **Certificate Expiring**
   ```bash
   # Check certificate status
   aws acm describe-certificate --certificate-arn your-cert-arn
   ```

2. **Domain Validation Failures**
   - Verify DNS records for domain validation
   - Check certificate covers all required domains

## 🔒 Security Best Practices

### S3 Bucket Security (Automatically Configured)

The enhanced S3 entity automatically configures:
- Static website hosting
- Public read bucket policy
- Intelligent public access block management
- CORS configuration

### CloudFront Security

1. **HTTPS Enforcement**
   ```yaml
   viewer_protocol_policy: "redirect-to-https"
   ```

2. **Security Headers**
   Add security headers via Lambda@Edge:
   ```javascript
   // Example security headers function
   exports.handler = (event, context, callback) => {
       const response = event.Records[0].cf.response;
       response.headers['strict-transport-security'] = [{
           key: 'Strict-Transport-Security',
           value: 'max-age=31536000; includeSubdomains'
       }];
       callback(null, response);
   };
   ```

## 🎯 Success Metrics

After deployment, you should achieve:

### Performance Targets
- **Page Load Time**: < 2 seconds globally
- **Cache Hit Ratio**: > 90%
- **First Contentful Paint**: < 1 second
- **Largest Contentful Paint**: < 2.5 seconds

### Availability Targets  
- **Uptime**: > 99.9%
- **Error Rate**: < 0.1%
- **SSL Certificate**: Valid and auto-renewing

### Cost Targets
- **Data Transfer**: Optimized with appropriate price class
- **Request Costs**: Minimized with efficient caching
- **Invalidations**: < 1000 per month (AWS free tier)

## 🔧 Advanced Features

### Adding Custom Domains

1. **Request SSL Certificate**
   ```bash
   aws acm request-certificate \
     --domain-name demo.yourwebsite.com \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Update CloudFront Configuration**
   ```yaml
   aliases:
     - "demo.yourwebsite.com"
     - "www.demo.yourwebsite.com"
   
   viewer_certificate:
     acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/your-cert-id"
     ssl_support_method: "sni-only"
     minimum_protocol_version: "TLSv1.2_2021"
   ```

3. **Configure DNS**
   ```bash
   # Example with Route 53
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890 \
     --change-batch file://dns-update.json
   ```

### API Backend Integration

Add API backend support:

```yaml
origins:
  - id: "s3-website-origin"
    domain_name: "your-bucket.s3-website-us-east-1.amazonaws.com"
    custom_origin_config:
      origin_protocol_policy: "http-only"
  
  - id: "api-backend"
    domain_name: "api.yourwebsite.com"
    custom_origin_config:
      origin_protocol_policy: "https-only"

cache_behaviors:
  - path_pattern: "/api/*"
    target_origin_id: "api-backend"
    forward_cookies: "all"
    forward_query_string: true
    default_ttl: 0  # No caching for API
```

---

## 🎉 Congratulations!

You now have a production-ready CloudFront static website deployment! This example demonstrates best practices for:

- ✅ Global content delivery with CloudFront
- ✅ Automated S3 static website hosting configuration
- ✅ Performance optimization with intelligent caching
- ✅ Security configuration with HTTPS and access controls
- ✅ Cost management with appropriate price classes
- ✅ Infrastructure as Code with Monk entities
- ✅ Monitoring and maintenance procedures

Use this as a foundation for your own static website deployments and adapt the configuration to meet your specific requirements.