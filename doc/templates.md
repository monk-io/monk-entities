# Templates and Stacks

This guide explains how to define instances of compiled entities using templates, manage secrets, and organize multiple instances using stacks (process groups).

## Template Basics

A template file declares instances under a `namespace` and binds them to compiled entity types by `defines`.

```yaml
namespace: my-app

my-entity:
  defines: module/entity-name
  # Configuration fields for the entity definition
  field1: value1
  field2: value2

  # Secret permissions (required to access secrets at runtime)
  permitted-secrets:
    api-token: true

  # Optional services block if your entity needs ports/protocols
  services:
    api:
      protocol: http
```

- **namespace**: Logical grouping for instances.
- **defines**: Points to a compiled entity type, e.g. `aws-s3/s3-bucket`, `neon/project`.

## Loading Templates

- Load a template file:
  - `monk load path/to/template.yaml`
- Update/start an instance:
  - `monk update my-app/my-entity`
- Inspect:
  - `monk describe my-app/my-entity`
  - `monk ps -a`

## Permitted Secrets

Grant entity access to secrets it needs.

```yaml
my-entity:
  defines: module/entity-name
  permitted-secrets:
    api-token: true
    another-secret: true
```

- Add a global secret:
  - `monk secrets add -g api-token='secret'`
- Add a per-entity secret:
  - `monk secrets add -r my-app/my-entity api-token='secret'`

Without `permitted-secrets`, the entity cannot read the secret at runtime.

## Expressing Dependencies and Sharing Values

Use `depends` to wait for other runnables and `connections` to reference their services. With `connection-target(...)` you can read the target entity's state or variables.

Pattern:

```yaml
consumer:
  defines: module/consumer
  connections:
    producer-service:
      runnable: my-app/producer
      service: data
  depends:
    wait-for:
      runnables:
        - my-app/producer
      timeout: 60
  variables:
    # Example: pull a value from producer entity-state
    producer_id: <- connection-target("producer-service") entity-state get-member("id")
```

Cloudflare example (DNS zone + record):

```yaml
namespace: cloudflare-test

zone:
  defines: cloudflare/cloudflare-dns-zone
  name: example.com
  permitted-secrets:
    cloudflare-api-token: true

record:
  defines: cloudflare/cloudflare-dns-record
  # Resolve zone_name dynamically from the zone entity's state
  zone_name: <- connection-target("zone-service") entity-state get-member("name")
  record_type: A
  name: www
  content: 203.0.113.10
  ttl: 120
  permitted-secrets:
    cloudflare-api-token: true
  connections:
    zone-service:
      runnable: cloudflare-test/zone
      service: data
  depends:
    wait-for:
      runnables:
        - cloudflare-test/zone
      timeout: 60

stack:
  defines: process-group
  runnable-list:
    - cloudflare-test/zone
    - cloudflare-test/record
```

## Stacks (Process Groups)

Stacks define ordered groups of runnables.

```yaml
stack:
  defines: process-group
  runnable-list:
    - my-app/service-a
    - my-app/service-b
```

- Start a stack by updating each member (top to bottom):
  - `monk update my-app/service-a && monk update my-app/service-b`

Use stacks to express dependencies and orchestrate multi-entity scenarios, including integration tests.

## Common Patterns

- **One template per test namespace**: Avoid collisions by using distinct namespaces like `*-test`.
- **Minimal config**: Only put what your entity needs to run.
- **Readiness checks**: Entities implementing `checkReadiness()` can be waited-on using test flows or manual checks.
- **Action endpoints**: Expose operations via `@action()` and invoke with `monk do my-app/my-entity/<action>`.

## Examples in Repository

- See `src/*/example.yaml` files for concrete patterns across providers.
- See test stack templates like `src/aws-cognito/test/stack-template.yaml` and `src/aws-sqs/test/stack-template.yaml` for multi-entity orchestration and connections.

## Troubleshooting

- Re-load templates after changes: `monk load path/to/template.yaml`.
- If an instance is stuck, `monk describe <ns/name>` and check logs; remove with `monk delete --force <ns/name>`.
- Decode base64 errors: `echo '<error>' | monk decode-err`.
