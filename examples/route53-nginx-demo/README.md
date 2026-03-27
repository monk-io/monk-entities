# Route53 Nginx Demo

Demonstrates wiring AWS Route53 DNS to an nginx container behind Monk's ingress (Traefik). A single YAML stack provisions the hosted zone, creates a DNS A record dynamically pointed at the ingress node's public IP, sets up a health check, and deploys nginx with host-based ingress routing — all wired together.

## Architecture

```
                         +-----------------------+
                         |   Route53 Hosted Zone  |
                         |   (example-app.com)    |
                         +-----------+-----------+
                                     |
                         +-----------+-----------+
                         |   Route53 A Record     |
                         |   www.example-app.com   |
                         |   -> ingress public IP  |
                         +-----------+-----------+
                                     |
               +---------------------+---------------------+
               |                                           |
   +-----------+-----------+               +---------------+-----------+
   |   Traefik Ingress      |               |   Route53 Health Check    |
   |   Host: www.example-   |               |   HTTP :80 /              |
   |   app.com -> nginx     |               |   www.example-app.com     |
   +-----------+-----------+               +---------------------------+
               |
   +-----------+-----------+
   |   Nginx Container      |
   |   "Hello from Monk!"   |
   +------------------------+
```

**How it works:**

1. **nginx** runs behind Monk ingress with a host-based route (`www.example-app.com`)
2. **dns-zone** creates a Route53 hosted zone for `example-app.com`
3. **web-record** creates an A record for `www.example-app.com` pointing to the ingress node's public IP, obtained dynamically via `service-public-ip("system/traefik", "web")`
4. **web-health-check** monitors the endpoint with HTTP checks from multiple AWS regions

When a request arrives for `www.example-app.com`, DNS resolves to the ingress IP, Traefik matches the `Host` header and routes traffic to the nginx container.

## Prerequisites

- A Monk cluster with at least one cloud node
- Ingress plugin enabled:
  ```bash
  monk plugins enable ingress
  ```
- AWS credentials configured with Route53 permissions:
  ```bash
  monk cluster providers
  ```
  Required IAM permissions: `route53:CreateHostedZone`, `route53:ChangeResourceRecordSets`, `route53:GetHostedZone`, `route53:ListResourceRecordSets`, `route53:DeleteHostedZone`, `route53:CreateHealthCheck`, `route53:DeleteHealthCheck`, `route53:GetHealthCheckStatus`, `route53:ChangeTagsForResource`

## Deploy

```bash
# Load the Route53 entity package
monk load dist/aws-route53/MANIFEST

# Load the example stack
monk load examples/route53-nginx-demo/route53-nginx-demo.yaml

# Deploy to a cloud node (replace TAG with your node's tag)
monk run -t TAG route53-nginx-demo/stack
```

## Verify

### Check stack status

```bash
monk ps
```

### Inspect Route53 resources

```bash
# View hosted zone details and name servers
monk do route53-nginx-demo/dns-zone/get-zone-info

# List all DNS records in the zone
monk do route53-nginx-demo/dns-zone/list-records

# Check health check status from AWS regions
monk do route53-nginx-demo/web-health-check/get-status
```

### Verify DNS resolution

Query the Route53 name servers directly to confirm the A record resolves to the ingress IP (the name servers are shown by `get-zone-info`):

```bash
dig @NS_SERVER www.example-app.com A +short
# Expected: the public IP of your ingress node
```

### Test end-to-end HTTP access

Use `--resolve` to bypass public DNS (since `example-app.com` is not a real domain) and verify the full chain — DNS record IP -> Traefik ingress -> nginx:

```bash
curl -sk --resolve www.example-app.com:80:INGRESS_IP \
         --resolve www.example-app.com:443:INGRESS_IP \
         -L http://www.example-app.com/
```

Expected output:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Route53 Nginx Demo</title>
  </head>
  <body>
    <h1>Hello from Monk!</h1>
    <p>This page is served by nginx and accessible via Route53 DNS.</p>
  </body>
</html>
```

## Key Wiring Patterns

This example demonstrates three important patterns for integrating Route53 with Monk workloads:

### 1. Ingress route for host-based routing

```yaml
services:
  http:
    container: web
    port: 80
    protocol: tcp
    ingress-routes:
      web:
        host: www.example-app.com
```

Registers the nginx service with Traefik so requests with `Host: www.example-app.com` are routed to this container. The container can migrate between nodes without breaking DNS — the A record always points to the ingress.

### 2. Dynamic A record from ingress IP

```yaml
record_values:
  - <- service-public-ip("system/traefik", "web")
```

Resolves the public IP of the Traefik ingress service at deploy time and sets it as the DNS A record value. No hardcoded IPs.

### 3. Entity-to-entity wiring via connections

```yaml
connections:
  dns-zone:
    runnable: route53-nginx-demo/dns-zone
    service: data
zone_id: <- connection-target("dns-zone") entity-state get-member("zone_id")
```

The DNS record entity connects to the hosted zone entity and reads the `zone_id` from its state at runtime. This creates a dependency chain — the record is only created after the zone is ready.

## Customization

To use your own domain:

1. Replace `example-app.com` and `www.example-app.com` throughout the YAML
2. Deploy the stack
3. Run `monk do route53-nginx-demo/dns-zone/get-zone-info` to get the assigned name servers
4. At your domain registrar, point your domain's NS records to those name servers
5. Once NS records propagate, `www.your-domain.com` will resolve and serve traffic through the Monk ingress

## Cleanup

```bash
monk delete --force route53-nginx-demo/stack
```

This deletes all AWS resources (hosted zone, DNS records, health check) and stops the nginx container.
