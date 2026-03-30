# Critical Rules for Entity Implementation

Derived from real implementation sessions (AWS Glue/Neptune, Azure PostgreSQL, Azure Storage/ServiceBus/EventHubs). These rules prevent the most common bugs and compilation failures.

## MUST DO

1. **JSDoc `@description` on EVERY Definition/State property** — compiled into schema
2. **JSDoc `@description` on EVERY entity class** — entity class comments and example.yaml are synchronized into a RAG system. The class comment must include: a brief description of what the entity manages, required permissions (IAM actions for AWS, roles for GCP, etc.), state fields available for composition, and which other entities it works with. See the "Entity class comments" section below for the format.
3. **`checkReadiness()` returns `boolean`** — never an object or void
3. **snake_case for Definition/State properties** — e.g., `secret_ref`, `project_id`
4. **kebab-case for action names** — e.g., `@action("get-info")`
5. **Action methods MUST use camelCase names** — Use `@action("get-info")` decorator on a `getInfo()` method. Quoted kebab-case method names (`"get-info"()`) silently fail — the Goja runtime won't discover the action even though the decorator registers. Always use camelCase: `getInfo()`, `getCostEstimate()`, `rotateSecret()`.
6. **Re-export `action` from the base class** — Entity files import from the package base class, not `monkec/base`. The base class must include `export { action } from "monkec/base"` so entities can import it: `import { MyEntity, MyDefinition, MyState, action } from "./my-base.ts"`.
7. **Check if resource exists in `create()`** — adopt with `existing: true` if found
8. **Skip deletion when `existing: true`** — don't delete pre-existing resources
9. **Initialize HTTP client in `before()`** — not in constructor
10. **Reload MANIFEST after recompiling** — `monk load MANIFEST` picks up new code
11. **Use `cli.output()` for user-facing messages** — not console.log
12. **MANIFEST REPO line must be just the package name** — e.g., `REPO aws-route53`, NOT `REPO https://github.com/...`. A full URL causes broken entity paths.
13. **Fix MANIFEST LOAD order after every compile** — The compiler generates the LOAD line in arbitrary order, often placing `*-base.yaml` after entities that depend on it. After every `./monkec.sh compile`, verify the `*-base.yaml` file comes first in the LOAD line and manually fix if needed. This must be re-fixed after every recompile since the compiler overwrites it.
14. **Implement `get-cost-estimate` and `costs` actions on every billable entity** — `get-cost-estimate` is human-readable, `costs` is standardized JSON for Monk's billing system. See the "Cost estimation" section below.
15. **Document required permissions in README.md** — every entity README must list the exact IAM permissions / roles / scopes needed to manage the resource. Derive from all API calls in the entity source. Include cost estimation permissions (e.g., `pricing:GetProducts`, `cloudwatch:GetMetricStatistics` for AWS).

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
12. **Never `JSON.stringify()` body fields when HttpClient has `stringifyJson: true`** — The HttpClient serializes the entire body. Manually stringifying a field double-encodes it (string-in-a-string). Pass objects directly as body fields.

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
10. **Test domains** — `example.com` is reserved by AWS and cannot be used in Route 53. More generally, avoid well-known reserved domains in tests. Use clearly fake but non-reserved domains (e.g., `monk-test-<package>.io`, `test-<package>.dev`). Never use `*.example.com`, `*.test`, or `*.localhost` with cloud DNS providers.
11. **MANIFEST FILES line must match compiled output** — the FILES line lists compiled YAML filenames. If your base class file is `route53-base.ts`, the compiled output is `route53-base.yaml`, NOT `base.yaml`. Check `dist/<package>/` after compilation to verify actual filenames, or let the compiler generate the MANIFEST automatically.
12. **Entity test templates need `connections` block** — when using `connection-target("name") entity-state get-member("field")`, the template MUST have a `connections:` block mapping the connection name to a runnable + `service: data`. Also add `services: { data: { protocol: custom } }` on the providing entity. Without these, monk cannot resolve entity-state references and throws "could not access member value of error".
13. **`costs()` must match `get-cost-estimate`** — both actions compute the same monthly cost. Share the logic or ensure every cost component in `get-cost-estimate` is also in `costs()`. Common miss: add-ons like HTTPS, string-match, latency measurement, fast-interval that appear in the human-readable output but are forgotten in the JSON output.
14. **Record delete must use API-fetched values** — Route 53 DELETE requires the exact record values to match. Always fetch the current record from the API before building DELETE XML. Never build DELETE XML from `this.definition` — values may have drifted or be stale.
15. **Route 53 records with routing policies need SetIdentifier matching** — multiple records can share name+type but differ by SetIdentifier. Always match by SetIdentifier when `set_identifier` is set in the definition. Store `set_identifier` in state and include it in identity change detection.
16. **API docs lie about required fields** — Always test `create()` early against the real API. APIs often have undocumented required fields (e.g., Clerk's `created_by` on organizations, `is_satellite` on domains, `claims` on JWT templates). Don't trust docs alone — the 422 response will tell you what's actually required.
17. **Some REST APIs don't support GET by ID** — If `GET /resources/{id}` returns 405, fall back to list+filter: `GET /resources` then `items.find(it => it.id === id)`. Check this during the first manual test and fix before writing integration tests.

## Entity Class Comments

Entity class JSDoc comments and `example.yaml` files are ingested by a RAG system that helps users discover and configure entities. Accurate, structured comments are critical.

Every entity class MUST have a JSDoc block above it with:

```ts
/**
 * @description <Brief description of what the entity manages>.
 *
 * ## Required Permissions
 * <List IAM actions (AWS), roles (GCP), or actions (Azure) needed>
 *
 * ## Secrets
 * - Reads: <secret names or "none (authenticated via <provider> provider)">
 * - Writes: <secret names or "none">
 *
 * ## State Fields for Composition
 * - `state.<field>` - <what it is, how other entities use it>
 *
 * ## Composing with Other Entities
 * Works with:
 * - `<package>/<entity>` - <how they integrate>
 */
export class MyEntity extends ...
```

**Key points:**
- `@description` line is indexed by RAG — make it clear and specific
- Permissions must match the README — derive from actual API calls
- State fields section tells users which fields are available via `connection-target() entity-state get-member()`
- Composition section helps users discover entity wiring patterns

Similarly, `example.yaml` comments should briefly explain each example configuration, as these are also indexed.

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
