# GCP Cloud DNS Nginx Demo

Demonstrates wiring GCP Cloud DNS records to an nginx container behind Monk's ingress (Traefik). Creates a managed zone with A, MX, and TXT records — the A record dynamically points to the cluster's ingress IP.

## Architecture

```
                                    ┌──────────────────────────┐
                                    │     GCP Cloud DNS        │
                                    │                          │
                                    │  Zone: example-app.com   │
                                    │  ├── A   www → ingress IP│
                                    │  ├── MX  → mail server   │
                                    │  └── TXT → SPF record    │
                                    └──────────┬───────────────┘
                                               │
                                     DNS query │ www.example-app.com
                                               ▼
┌────────────────┐    Host header    ┌──────────────────┐
│   Browser      │ ───────────────→  │   Traefik        │
│                │  www.example-     │   (Monk Ingress)  │
│                │  app.com          │   Public IP       │
└────────────────┘                   └────────┬─────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │   nginx:alpine   │
                                    │   Hello World    │
                                    │   Port 80        │
                                    └──────────────────┘
```

**How it works:**
1. Cloud DNS managed zone is created for `example-app.com`
2. An A record for `www.example-app.com` is set to the cluster's Traefik ingress IP (resolved at deploy time via `service-public-ip()`)
3. MX and TXT records demonstrate additional DNS configuration
4. Traefik routes requests with `Host: www.example-app.com` to the nginx container
5. nginx serves a static hello world page

## Prerequisites

- A Monk cluster with at least one cloud node (GCP)
- Ingress plugin enabled: `monk plugins enable ingress`
- GCP credentials configured: `monk cluster provider add -p gcp`
- GCP IAM role: `roles/dns.admin` (or individual `dns.managedZones.*` and `dns.resourceRecordSets.*` permissions)

## Deploy

```bash
# Load the GCP entity package
monk load dist/gcp/MANIFEST

# Load the example stack
monk load examples/gcp-cloud-dns-nginx/gcp-cloud-dns-nginx.yaml

# Deploy to a cloud node (replace TAG with your node's tag)
monk run -t TAG gcp-cloud-dns-nginx/stack
```

## Verify

### Check stack status
```bash
monk ps
```

All entities should show `true true` for ready/live.

### Inspect the DNS zone
```bash
# View zone details and nameservers
monk do gcp-cloud-dns-nginx/dns-zone/get-info

# List all record sets in the zone
monk do gcp-cloud-dns-nginx/dns-zone/list-record-sets

# Check cost estimate
monk do gcp-cloud-dns-nginx/dns-zone/get-cost-estimate
```

### Inspect individual records
```bash
monk do gcp-cloud-dns-nginx/web-record/get-info
monk do gcp-cloud-dns-nginx/mail-record/get-info
monk do gcp-cloud-dns-nginx/txt-record/get-info
```

### Test DNS resolution
```bash
# Query the Cloud DNS nameservers directly (get NS from get-info output)
dig @ns-cloud-e1.googledomains.com www.example-app.com A

# Once NS records are delegated at your registrar:
dig www.example-app.com A
curl -H "Host: www.example-app.com" http://<ingress-ip>/
```

## Key Wiring Patterns

### 1. Ingress routing (nginx -> Traefik)
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
Traefik automatically routes traffic with the matching `Host` header to the nginx container. Containers can migrate between nodes without breaking DNS.

### 2. Dynamic IP resolution (DNS -> Ingress)
```yaml
rrdatas:
  - <- service-public-ip("system/traefik", "web")
```
The A record gets the ingress public IP at deploy time — no hardcoded IPs. If the ingress IP changes, redeploying updates the record.

### 3. Entity dependency chain
```yaml
dns-zone:
  depends:
    wait-for:
      runnables:
        - gcp-cloud-dns-nginx/enable-dns-api
      timeout: 120

web-record:
  depends:
    wait-for:
      runnables:
        - gcp-cloud-dns-nginx/dns-zone
      timeout: 120
```
Records wait for the zone to be ready. The zone waits for the DNS API to be enabled. Monk handles the ordering automatically.

## Customization

To use with a real domain:

1. Replace `example-app.com` with your domain in all `dns_name`, `record_name`, and `ingress-routes.web.host` fields
2. After deploying, get the assigned nameservers: `monk do gcp-cloud-dns-nginx/dns-zone/get-info`
3. At your domain registrar, update the NS records to point to the Cloud DNS nameservers
4. Wait for DNS propagation (up to 48 hours for NS changes)

To add more records, copy any `*-record` block and change `record_name`, `record_type`, `ttl`, and `rrdatas`.

## Cleanup

```bash
monk delete --force gcp-cloud-dns-nginx/stack
```
