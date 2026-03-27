# AWS Route 53 — Entity Plan

## Provider
- **Cloud**: AWS
- **Service**: Route 53 (DNS)
- **API**: REST, XML request/response bodies
- **Base URL**: `https://route53.amazonaws.com/2013-04-01`
- **Auth**: AWS Signature V4, service=`route53`, always signed with region=`us-east-1` (global service)

## Entities

| Entity | Class | Description |
|--------|-------|-------------|
| `aws-route53/hosted-zone` | `HostedZone` | Public and private DNS hosted zones |
| `aws-route53/record` | `Record` | DNS record sets (A, AAAA, CNAME, MX, TXT, etc.) |
| `aws-route53/health-check` | `HealthCheck` | Endpoint health monitoring for DNS failover |

## API Details

- **Hosted Zones**: CreateHostedZone (POST), GetHostedZone (GET), ListHostedZonesByName (GET), UpdateHostedZoneComment (POST), DeleteHostedZone (DELETE)
- **Records**: ChangeResourceRecordSets (POST with ChangeBatch XML), ListResourceRecordSets (GET) — all mutations via UPSERT/DELETE actions
- **Health Checks**: CreateHealthCheck (POST), GetHealthCheck (GET), UpdateHealthCheck (POST), DeleteHealthCheck (DELETE), GetHealthCheckStatus (GET)
- **Change Propagation**: Mutating ops return ChangeInfo with PENDING/INSYNC status, poll via GetChange
- **Tagging**: ChangeTagsForResource (POST) for both zones and health checks
- **Pagination**: ListResourceRecordSets returns max 300/page, uses IsTruncated + NextRecordName + NextRecordType

## Design Decisions

- XML parsing via regex (extractXMLValue, extractXMLBlocks) — no XML library needed for Route 53's simple response format
- Record DELETE fetches raw XML from API rather than rebuilding from definition — ensures exact match including routing policy fields
- Zone adoption checks PrivateZone flag for split-view DNS (same name, different public/private)
- Record identity = zone_id + record_name + record_type + set_identifier

## Pricing

| Resource | Cost |
|----------|------|
| Hosted zone | $0.50/month (first 25), $0.10/month after |
| Standard queries | $0.40/million |
| Health check (AWS endpoint) | $0.50/month |
| Health check (non-AWS) | $0.75/month |
| + HTTPS | +$1.00/month |
| + String match | +$2.00/month |
| + Fast interval (10s) | +$1.00/month |
| + Latency measurement | +$1.00/month |

## Progress

- [x] Plan — approved 2026-03-27
- [x] Implement — 3 entities, 8 source files, compiled clean
- [x] Tests — 23 test steps covering full lifecycle
- [x] Manual testing — all entities pass create/ready/actions/delete
- [x] Integration tests — 23/23 passed (173s)
- [x] PR — #175, CI green, 14 Bugbot issues fixed across 10 commits
- [x] Linear — ENG-144
- [ ] Merged

## Issues Found

- Route 53 API returns XML, not JSON — need manual XML parsing utilities
- `example.com` is reserved by AWS Route 53 — used `monk-test-route53.io` for tests
- Test templates need `connections:` block with `service: data` + `services: { data: { protocol: custom } }` on provider entity for `connection-target() entity-state get-member()` to work
- MANIFEST FILES must match compiled YAML filenames (`route53-base.yaml`, not `base.yaml`)
- Record DELETE requires exact match of all fields — must fetch current record from API, not use definition values
- Change propagation takes 20-30s — poll with GetChange API, configurable max attempts
- `costs()` action must include all add-ons from `get-cost-estimate` (HTTPS, string match, fast interval, latency measurement)
- ListResourceRecordSets paginates at 300 records — both list-records action and zone cleanup need pagination
- Routing policy records share name+type, differ by SetIdentifier — lookup must filter by it
- Private IP detection for 172.x needs RFC 1918 range check (172.16-31 only, not all 172.x)
- `gh api` defaults to 30 results — use `--paginate` for PR comments to avoid missing items
