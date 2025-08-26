# Entity Conventions

Standard patterns to keep entities consistent and automatable.

## Naming and Files

- Module directory: `src/<provider-or-domain>/`
- Base file (optional): `<provider>-base.ts` providing shared auth, HttpClient, helpers
- Entity files: `*.ts` with one exported class extending `MonkEntity<Definition, State>`
- Tests: `src/<module>/test/` with `stack-template.yaml` and `stack-integration.test.yaml`

## Definition and State

- Add JSDoc on every property (compiled into schema)
- Prefer explicit types; avoid `any`
- Common state flags:
  - `existing?: boolean` indicates resource pre-existed
  - `id?: string` provider identifier when applicable

### Provider defaults

- Make `secret_ref` optional in configs and fall back to a provider default secret name in code (e.g., `"vercel-api-token"`, `"netlify-api-token"`, or `<package>-api-token`). Document the default in the package README.
- Prefer a single, well-known default secret name per provider across all entities.
- Tests should inject credentials via `.env` and map them to default secret name(s) using the test `secrets` section (no need to ask for secret name upfront).
  - It’s acceptable for generators to create `test/.env` automatically when credentials are provided in the prompt (support multiple variables); otherwise create `env.example` with placeholders.

### Naming conventions

- Definition/State properties: use snake_case in TypeScript; compiled YAML uses snake_case (e.g., `secret_ref`, `password_secret_ref`, `project_id`).
- Action names: use kebab-case strings with `@action("get-info")`, `@action("create-snapshot")`, etc. The compiler keeps the provided string.
- Avoid mixing styles inside a module; prefer consistent snake_case for definition/state.

Example:

```ts
export interface Definition {
  /** @description API token secret reference */
  secret_ref?: string; // may fall back to a provider default in code
  /** @description Human-readable resource name */
  name: string;
}

export interface State {
  /** @description Provider resource identifier */
  id?: string;
  /** @description Resource pre-existed */
  existing?: boolean;
}
```

### Reserved property names

Some property names conflict with JSON Schema keywords or Monk validators when used at the top level of Definition/State. Avoid these names for Definition/State properties; prefer prefixed variants instead:

- `type` → use `record_type`, `zone_type`, or a more specific name
- `enum`, `items`, `properties`, `$ref` → avoid entirely

This prevents schema validation warnings/errors like "Invalid type. Expected string/array of strings, given: type".

## Lifecycle and Hooks

- Initialize clients/secrets in `before()`; clean up in `after()` if needed
- Implement `create`, `update`, `delete`
- Implement `checkReadiness()` and expose static `readiness` where waiting is needed

## HTTP and Secrets

- Use `HttpClient` from `monkec/http-client`; configure in `before()`
- Retrieve secrets via `secret.get(definition.secret_ref)` (or provider-specific keys)
- Document secret names in README and template `permitted-secrets`

## Actions

- Expose operational functions with `@action()`
- Use kebab-case or explicit names (e.g., `@action("get-info")`)
- Print helpful messages via `cli.output()`

## Templates

- Provide `example.yaml` and `test/stack-template.yaml`
- Include `permitted-secrets` for all secrets used by the entity

## Readiness

- Return quickly and reliably; avoid blocking calls in `checkReadiness()`
- Use API status polling where available

## Testing

- Use `./monkec.sh test` with `.env` in `test/`
- Include tests for lifecycle, readiness wait, and at least one custom action

## Documentation

- Add README in module with configuration table and action list
- Cross-link to common docs: `doc/new-entity-guide.md`, `doc/testing.md`, `doc/monk-cli.md`

## Do and Don’t

- Do: reuse provider base classes
- Do: consistent field names (`secret_ref`, `password_secret_ref`, `id`, `existing`)
- Don’t: rely on global variables or side effects; keep state in `this.state`
