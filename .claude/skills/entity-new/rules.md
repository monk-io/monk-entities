# Critical Rules for Entity Implementation

Derived from real implementation sessions (AWS Glue/Neptune, Azure PostgreSQL, Azure Storage/ServiceBus/EventHubs). These rules prevent the most common bugs and compilation failures.

## MUST DO

1. **JSDoc `@description` on EVERY Definition/State property** — compiled into schema
2. **`checkReadiness()` returns `boolean`** — never an object or void
3. **snake_case for Definition/State properties** — e.g., `secret_ref`, `project_id`
4. **kebab-case for action names** — e.g., `@action("get-info")`
5. **Check if resource exists in `create()`** — adopt with `existing: true` if found
6. **Skip deletion when `existing: true`** — don't delete pre-existing resources
7. **Initialize HTTP client in `before()`** — not in constructor
8. **Reload MANIFEST after recompiling** — `monk load MANIFEST` picks up new code
9. **Use `cli.output()` for user-facing messages** — not console.log
10. **MANIFEST REPO line must be just the package name** — e.g., `REPO aws-route53`, NOT `REPO https://github.com/...`. A full URL causes broken entity paths.
11. **Implement `get-cost-estimate` and `costs` actions on every billable entity** — `get-cost-estimate` is human-readable, `costs` is standardized JSON for Monk's billing system. See the "Cost estimation" section below.

## MUST NOT DO

1. **Never name a property `description`** — reserved by Monk. Use `<entity>_description` instead.
2. **Never name a property `type`** — reserved by JSON Schema. Use `<entity>_type`, `record_type`, etc.
3. **Never name a class `Namespace`** — collides with YAML `namespace:` keyword. Prefix it: `ServiceBusNamespace`.
4. **Never use `@default false` on optional booleans** — the compiler injects the default, making `!== undefined` checks unreliable. Omit `@default` for booleans that should be undefined when not set.
5. **Never use `|| true` for boolean display** — `false || true === true`. Use `?? true` (nullish coalescing) instead.
6. **Never log sensitive data** — redact passwords, API keys, connection strings from request/response logs.
7. **Never use `sync()` method** — it doesn't exist. Use `create()`, `update()`, `delete()`.
8. **Never import across entity packages** — cross-module imports are not supported by monkec compiler. Duplicate shared code if needed.
9. **Never use busy-wait loops** — use the built-in `sleep()` function available in the MonkEC runtime.
10. **Never set `secrets_populated = true` unconditionally** — only set it inside the population method on success, so transient failures allow retry.
11. **Never add `permitted-secrets` for cloud provider builtins** — AWS/Azure/GCP credentials are automatically injected.

## WATCH OUT FOR

1. **Azure async operations** — HTTP 202 means "accepted, not done". Must poll for completion.
2. **Azure server names are globally unique** — use unique names in examples/tests.
3. **AWS has two API styles** — JSON-RPC (`X-Amz-Target` header) and form-urlencoded. Check which the service uses.
4. **AWS Neptune shares the RDS endpoint** — differentiated by `Engine=neptune`.
5. **Multiline YAML strings containing JSON** — if the JSON contains `description` or `type` keys, Monk may misparse them. Use inline JSON strings instead of YAML `|` blocks.
6. **State fields vs definition fields in readiness** — when `create_when_missing = false`, state may be empty. Check `this.definition.*` for always-available values.
7. **API responses may not include all fields** — don't blindly assign `response.field` to state; it may be `undefined` and overwrite good data.
8. **Cloud builtin `.do()` throws on non-2xx** — for `aws`, `azure`, and `gcp` builtins, the `.do()` method throws "unexpected response code NNN" on non-2xx, losing the response body. Use named methods instead (`.get()`, `.post()`, `.put()`, `.delete()`) — these return a response object with `statusCode` and `body` even on errors, allowing proper error parsing. Only use `.do()` for HTTP methods not covered by the named helpers (e.g., PATCH for Azure).
9. **Always log `response.body` on cloud API errors** — error responses (XML or JSON) contain the actual error code and message. Without logging the body, you only see "unexpected response code 400" which is useless for debugging. Parse and output the body before throwing.
10. **Test domains** — `example.com` is reserved by AWS and cannot be used in Route 53. More generally, avoid well-known reserved domains in tests. Use a real domain or a clearly test-only domain.

## Common Compilation Errors

- **Unused imports** — Remove any imports not used in the file
- **Unused parameters** — Prefix with underscore: `_args`
- **`checkReadiness()` return type** — Must be `boolean`, not `{ ready: boolean; message: string }`
- **Type mismatches** — Ensure generics match: `MonkEntity<Definition, State>`

## Monk CLI Rules

- **All monk commands require `sudo`** — daemon socket is root-owned
- **Always use `-l` (or `--local`) with `monk run`** — without it, monk prompts interactively for tag selection, which blocks non-interactive execution
- **`--force` goes before the target** — `sudo monk delete --force <target>`, not `<target> --force`
- **In integration tests, use `run` with `args: tag: "local"`** — without the tag arg, `run` triggers an interactive tag selection prompt that blocks the test runner. Deploy each entity individually, not via group

## Cost Estimation (two actions required)

Every billable entity must implement TWO cost-related actions. See `doc/cost-estimation.md` for full details and per-entity breakdowns.

### 1. `get-cost-estimate` — human-readable detailed breakdown

```ts
@action("get-cost-estimate")
getCostEstimate(_args?: Args): void {
    // Output a detailed, human-readable cost breakdown with:
    // - Resource configuration (instance type, storage, region, etc.)
    // - Pricing rates from the provider's pricing API
    // - Usage metrics from monitoring (last 30 days)
    // - Cost per component (compute, storage, network, etc.)
    // - Total estimated monthly cost
    // - Notes about what's NOT included
    // Use cli.output() for formatted text output
}
```

### 2. `costs` — standardized JSON for Monk billing system

```ts
@action("costs")
costs(): void {
    if (!this.state.id) {
        cli.output(JSON.stringify({
            type: "<package>-<entity>",
            costs: { month: { amount: "0", currency: "USD" } }
        }));
        return;
    }

    try {
        const monthlyCost = calculateCost();
        cli.output(JSON.stringify({
            type: "<package>-<entity>",
            costs: { month: { amount: monthlyCost.toFixed(2), currency: "USD" } }
        }));
    } catch {
        cli.output(JSON.stringify({
            type: "<package>-<entity>",
            costs: { month: { amount: "0", currency: "USD", error: "Error message" } }
        }));
    }
}
```

**`costs` output format:**
- Single-line JSON via `cli.output(JSON.stringify(result))`
- `type` — identifier like `aws-s3-bucket`, `gcp-cloud-storage`, `azure-postgresql-flexible-server`
- `amount` — string, monthly cost in USD, two decimal places
- `currency` — always `"USD"`
- `error` — optional, included when estimation fails
- If resource doesn't exist yet, return `amount: "0"`

### Pricing data sources by provider

| Provider | Pricing API | Usage Metrics |
|----------|------------|---------------|
| AWS | AWS Price List API (`api.pricing.us-east-1.amazonaws.com`) | CloudWatch (last 30 days) |
| GCP | Cloud Billing Catalog API (`cloudbilling.googleapis.com`) | Cloud Monitoring |
| Azure | Azure Retail Prices API (`prices.azure.com`, no auth needed) | Azure Monitor |
| DigitalOcean | Hardcoded pricing tables (no API available) | DO API |
| SaaS | Provider billing/usage API if available | Varies |

### Key implementation rules

- **Fetch live pricing** — use the provider's pricing API, not hardcoded rates (except DigitalOcean)
- **Usage metrics from last 30 days** — CloudWatch, Cloud Monitoring, or Azure Monitor
- **Fail gracefully** — if pricing API or metrics are unavailable, omit that component rather than guessing
- **Never include discounts** — show on-demand pricing only (reserved instances, savings plans not reflected)
- **Share calculation logic** between `get-cost-estimate` and `costs` — avoid duplicating pricing/metric fetching

### Existing examples to study

- `src/aws-s3/bucket.ts` — storage + requests + data transfer (AWS Price List API + CloudWatch)
- `src/gcp/cloud-storage.ts` — GCP storage with location-based rates (Cloud Billing Catalog)
- `src/azure-postgresql/flexible-server.ts` — Azure compute + storage (Retail Prices API)
- `src/aws-sqs/queue.ts` — simple usage-based (requests per million)

## Common Runtime Errors

- **Secret not found** — Check `permitted-secrets` in template, verify secret is set
- **API auth failure** — Verify token format, check API endpoint URL
- **Readiness never reached** — Check status values match what API actually returns
- **Action not found** — Verify `@action()` decorator, recompile and reload MANIFEST
- **Stale compiled code** — Must `monk load MANIFEST` after every recompile
