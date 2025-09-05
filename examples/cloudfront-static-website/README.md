# CloudFront Static Website Demo

A comprehensive example demonstrating how to deploy a global static website using **AWS CloudFront CDN** and **Amazon S3** with the Monk orchestrator platform. This example showcases real-world usage patterns, performance optimization, and production-ready deployment strategies.

## 🎯 What This Demo Demonstrates

### CloudFront Features
- ✅ **Global Content Delivery** - 400+ edge locations worldwide
- ✅ **Intelligent Caching** - Different cache policies for HTML, CSS, JS, and images
- ✅ **Automatic Compression** - Gzip compression for better performance
- ✅ **HTTPS Everywhere** - SSL/TLS encryption with HTTP to HTTPS redirection
- ✅ **Custom Error Pages** - Branded error responses with proper caching
- ✅ **S3 Website Integration** - Optimized S3 static website hosting
- ✅ **Cache Invalidation** - Programmatic cache clearing for deployments

### Real-World Patterns
- 🌐 **Multi-Origin Setup** - Separate origins for static files and API calls
- ⚡ **Performance Optimization** - TTL tuning for different content types
- 🔒 **Security Best Practices** - SSL certificates, security headers, access controls
- 📊 **Monitoring Integration** - Performance metrics and CloudWatch integration
- 🚀 **DevOps Workflows** - Automated deployment with Infrastructure as Code

## 🏗️ Architecture

```
┌─────────────┐    HTTPS    ┌──────────────────┐    Origin    ┌─────────────────┐
│   Global    │ ──────────► │   CloudFront     │ ──────────► │   S3 Bucket     │
│   Users     │             │   Edge Locations │             │   Static Files  │
└─────────────┘             └──────────────────┘             └─────────────────┘
                                     │
                                     │ /api/*
                                     ▼
                            ┌──────────────────┐
                            │   API Backend    │
                            │   (Future)       │
                            └──────────────────┘
```

### Components

1. **Static Website** (`src/`)
   - Modern HTML5 website with responsive design
   - Interactive performance demonstrations
   - Real-time metrics and cache behavior visualization

2. **CloudFront Distribution** (`website-cdn`)
   - Optimized cache behaviors for different content types
   - Custom error responses
   - Security headers and compression

3. **S3 Bucket** (`website-bucket`)
   - Static website hosting configuration automatically configured
   - Public read bucket policy automatically applied
   - CORS configuration for API demos

## 🚀 Quick Start

### Prerequisites

1. **Monk Platform** - Monk orchestrator installed and configured
2. **AWS Account** - With CloudFront and S3 access
3. **AWS CLI** - For content deployment

### Step 1: Deploy Infrastructure with Monk

```bash
# Build and load the required entities
cd /path/to/monk-entities

# Build the CloudFront and S3 entities
./build.sh aws-cloudfront
./build.sh aws-s3

# Load entities
cd dist/aws-cloudfront && monk load MANIFEST
cd ../aws-s3 && monk load MANIFEST

# Load the demo stack
cd ../../examples/cloudfront-static-website
monk load cloudfront-static-website.yaml

# Deploy the complete stack
monk run cloudfront-static-website/cloudfront-demo-stack
```

### Step 2: Upload Website Files

```bash
# Upload website files using AWS CLI
aws s3 sync ./src/ s3://cloudfront-demo-static-website-enhanced/ \
  --delete \
  --cache-control "max-age=300"

# Or use the provided script
./scripts/sync-to-s3.sh
```

### Step 3: Access Your Website

```bash
# Get distribution information
monk do cloudfront-static-website/website-cdn/get-distribution-info

# Your website will be available at the CloudFront domain
# Example: https://d123456789abcdef.cloudfront.net
```

## 🌐 Real-World Usage Scenarios

### Scenario 1: E-commerce Website

Perfect for online stores requiring global performance and reliability.

**Key Features:**
- Multiple origins (static content, product images, API backend)
- Optimized cache behaviors for different content types
- SSL certificate for custom domain
- Access logging for analytics

**Configuration Highlights:**
```yaml
cache_behaviors:
  - path_pattern: "/api/*"      # No caching for dynamic API
    default_ttl: 0
  - path_pattern: "/images/*"   # Long caching for product images
    default_ttl: 2592000        # 30 days
  - path_pattern: "/products/*" # Short caching for product pages
    default_ttl: 300            # 5 minutes
```

### Scenario 2: Single Page Application

Ideal for React, Vue, or Angular applications.

**Key Features:**
- Custom error responses for client-side routing
- Optimized caching for bundled assets
- API proxy configuration
- Automated deployment workflows

**SPA-Specific Configuration:**
```yaml
custom_error_responses:
  - error_code: 404
    response_page_path: "/index.html"  # Handle SPA routing
    response_code: 200
    error_caching_min_ttl: 0
```

### Scenario 3: Corporate Website

Professional business website with global audience.

**Key Features:**
- Multiple regions support
- Cost optimization with price classes
- Security headers and access controls
- Performance monitoring

## 🔧 Content Deployment Workflow

### Manual Deployment

```bash
# Sync all files
aws s3 sync ./src/ s3://your-bucket-name/ \
  --exclude "*.md" \
  --cache-control max-age=300

# Sync with specific cache headers for different file types
aws s3 sync ./src/assets/css/ s3://your-bucket-name/assets/css/ \
  --cache-control "max-age=2592000"  # 30 days for CSS

aws s3 sync ./src/assets/js/ s3://your-bucket-name/assets/js/ \
  --cache-control "max-age=2592000"  # 30 days for JS

aws s3 sync ./src/assets/images/ s3://your-bucket-name/assets/images/ \
  --cache-control "max-age=7776000"  # 90 days for images
```

### Automated Deployment Script

The included `scripts/sync-to-s3.sh` provides automated deployment with:
- Intelligent cache header setting
- CloudFront invalidation
- Progress reporting
- Error handling

```bash
# Deploy with automatic cache invalidation
./scripts/sync-to-s3.sh

# Dry run to preview changes
SYNC_DRYRUN=true ./scripts/sync-to-s3.sh
```

### Production Deployment

```bash
# Deploy infrastructure
monk run cloudfront-static-website/cloudfront-demo-stack

# Update website files
./scripts/sync-to-s3.sh

# Monitor deployment
monk describe cloudfront-static-website/website-cdn
monk logs cloudfront-static-website/website-cdn
```

## 📊 Performance Features

### Cache Optimization

The demo implements intelligent caching strategies:

| Content Type | TTL | Strategy |
|-------------|-----|----------|
| HTML files | 5 minutes | Short cache for content updates |
| CSS/JS files | 30 days | Long cache for versioned assets |
| Images | 90 days | Very long cache for static media |
| API calls | 0 seconds | No caching for dynamic data |

### Compression

All text-based content (HTML, CSS, JS, JSON) is automatically compressed using gzip, typically achieving:
- **HTML**: 60-80% size reduction
- **CSS**: 70-85% size reduction  
- **JavaScript**: 60-75% size reduction

### Performance Monitoring

The website includes real-time performance monitoring:
- Page load times
- Cache hit ratios
- Bandwidth savings
- Edge location detection

## 🔒 Security Features

### SSL/TLS Configuration
- Automatic HTTPS redirection
- Modern TLS protocols only (TLS 1.2+)
- SNI-based SSL certificate support

### S3 Security (Automatically Configured)
- Website hosting configuration
- Public read bucket policy
- CORS configuration for API access
- Smart public access block management

### Access Control
```yaml
# S3 bucket security (automatically applied by enhanced entity)
website_configuration:
  index_document: "index.html"
  error_document: "error.html"

bucket_policy:
  policy: "public-read"  # Automatic public read policy

public_read_access: true   # Smart public access block configuration
```

## 💰 Cost Optimization

### Price Class Selection

The demo uses `PriceClass_100` (US, Canada, Europe) for cost optimization. Adjust based on your audience:

```yaml
# Cost optimized (Americas + Europe)
price_class: "PriceClass_100"

# Balanced (adds Asia Pacific)  
price_class: "PriceClass_200"

# Global performance (all edge locations)
price_class: "PriceClass_All"
```

### Monitoring Costs

- Enable CloudFront access logging to analyze traffic patterns
- Monitor cache hit ratios to optimize caching strategies
- Use AWS Cost Explorer to track CloudFront costs

## 🧪 Testing the Demo

### Manual Testing

```bash
# Check website accessibility
curl -I https://your-cloudfront-domain.com

# Test cache headers
curl -I https://your-cloudfront-domain.com/assets/css/styles.css

# Test compression
curl -H "Accept-Encoding: gzip" https://your-cloudfront-domain.com
```

### Performance Testing

```bash
# Test from multiple locations using curl
for region in us-east-1 eu-west-1 ap-southeast-1; do
  echo "Testing from $region..."
  time curl -s -o /dev/null https://your-cloudfront-domain.com
done
```

### Cache Invalidation Testing

```bash
# Create invalidation
monk do cloudfront-static-website/website-cdn/create-invalidation

# Check invalidation status
monk do cloudfront-static-website/website-cdn/list-invalidations
```

## 🔧 Customization

### Adding Custom Domains

1. **Create SSL Certificate in ACM** (us-east-1 region):
   ```bash
   aws acm request-certificate \
     --domain-name demo.yourwebsite.com \
     --validation-method DNS \
     --region us-east-1
   ```

2. **Update CloudFront Configuration**:
   ```yaml
   aliases:
     - "demo.yourwebsite.com"
     - "www.demo.yourwebsite.com"
   
   viewer_certificate:
     acm_certificate_arn: "arn:aws:acm:us-east-1:123456789012:certificate/your-cert-id"
     ssl_support_method: "sni-only"
     minimum_protocol_version: "TLSv1.2_2021"
   ```

3. **Configure DNS** (Route 53 or your DNS provider):
   ```
   demo.yourwebsite.com    CNAME    d123456789abcdef.cloudfront.net
   www.demo.yourwebsite.com CNAME   d123456789abcdef.cloudfront.net
   ```

### Adding API Backend

1. **Add API Origin**:
   ```yaml
   origins:
     - id: "api-backend"
       domain_name: "api.yourwebsite.com"
       custom_origin_config:
         https_port: 443
         origin_protocol_policy: "https-only"
   ```

2. **Configure API Cache Behavior**:
   ```yaml
   cache_behaviors:
     - path_pattern: "/api/*"
       target_origin_id: "api-backend"
       forward_cookies: "all"
       forward_query_string: true
       default_ttl: 0  # No caching for API
   ```

### Custom Error Pages

Create custom error pages in `src/` directory:
- `404.html` - Page not found
- `500.html` - Server error
- `maintenance.html` - Maintenance mode

## 🚨 Troubleshooting

### Common Issues

1. **S3 Bucket Access Denied**
   ```bash
   # Check bucket policy and public access settings
   aws s3api get-bucket-policy --bucket your-bucket-name
   aws s3api get-public-access-block --bucket your-bucket-name
   ```

2. **CloudFront Distribution Not Found**
   ```bash
   # Verify distribution exists and is deployed
   monk describe cloudfront-static-website/website-cdn
   monk do cloudfront-static-website/website-cdn/get-distribution-info
   ```

3. **SSL Certificate Issues**
   ```bash
   # Ensure certificate is in us-east-1 region for CloudFront
   aws acm list-certificates --region us-east-1
   ```

4. **Cache Not Working**
   ```bash
   # Check cache headers in browser dev tools or with curl
   curl -I https://your-cloudfront-domain.com/assets/css/styles.css
   ```

### Debug Mode

Enable debug logging:
```bash
monk logs cloudfront-static-website/website-cdn
```

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] AWS credentials configured
- [ ] CloudFront and S3 entities compiled and loaded
- [ ] Website files ready in `src/` directory

### Deployment
- [ ] S3 bucket created successfully with website hosting enabled
- [ ] CloudFront distribution deployed (15-20 minutes)
- [ ] Website files uploaded to S3
- [ ] Custom domain DNS configured (if using)

### Post-Deployment
- [ ] Website accessible via CloudFront URL
- [ ] Cache headers working correctly
- [ ] Compression enabled and working
- [ ] SSL certificate valid
- [ ] Performance metrics collecting

### Production Readiness
- [ ] Access logging configured
- [ ] Monitoring and alerting set up
- [ ] Backup and disaster recovery plan
- [ ] Cost monitoring configured

## 🌟 Production Enhancements

### Advanced Features to Add

1. **Web Application Firewall (WAF)**
   ```yaml
   web_acl_id: "arn:aws:wafv2:us-east-1:123456789012:global/webacl/your-waf/12345"
   ```

2. **Origin Failover**
   ```yaml
   origins:
     - id: "primary-origin"
       domain_name: "primary.yoursite.com"
     - id: "failover-origin" 
       domain_name: "backup.yoursite.com"
   ```

3. **Lambda@Edge Functions**
   - Request/response manipulation
   - A/B testing
   - Security headers injection
   - Geo-targeting

4. **Real-Time Monitoring**
   - CloudWatch dashboards
   - Custom metrics and alarms
   - Performance budgets

## 📚 Related Documentation

- [AWS CloudFront Entity Documentation](../../src/aws-cloudfront/README.md)
- [AWS S3 Entity Documentation](../../src/aws-s3/README.md)
- [Monk Platform Documentation](https://docs.monk.io/)
- [AWS CloudFront Best Practices](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/best-practices.html)

## 🤝 Contributing

To improve this demo:

1. **Add new features** to the website
2. **Optimize performance** metrics and demonstrations
3. **Enhance security** configurations
4. **Improve documentation** and examples
5. **Add monitoring** and alerting examples

## 📄 License

This demo is provided as an example for educational and development purposes. Customize and adapt as needed for your production requirements.

---

**💡 Pro Tip**: This example serves as a template for real-world static website deployments. Copy and modify the configuration files to match your specific requirements, domain names, and performance needs. The enhanced S3 entity automatically configures website hosting and bucket policies, making deployment simple and reliable.