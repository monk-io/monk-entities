# Common Issues When Developing Entities

This guide collects recurring errors and fixes seen while building MonkEC entities. Keep it updated as new issues arise.

## Compilation

- Type errors in generics (Definition/State)
  - Symptom: TS generics mismatch or `any` usage causing weak typing
  - Fix: Ensure `export class X extends MonkEntity<Definition, State>` uses concrete interfaces; avoid `any`

- Missing imports for built-ins
  - Symptom: Cannot find module 'monkec/base' or 'monkec/http-client'
  - Fix: Check `deno.json` imports mapping; use `import { MonkEntity } from "monkec/base"`

- Output not generated
  - Symptom: No files in `dist/<module>/`
  - Fix: Compile with `INPUT_DIR=./src/<module>/ OUTPUT_DIR=./dist/<module>/ ./monkec.sh compile`

## Template/Load

- Entity not found on load
  - Symptom: `defines: myns/my-entity` fails to load
  - Fix: Ensure `dist/<module>/MANIFEST` is loaded; `defines` matches compiled namespace/name

- Secrets not accessible
  - Symptom: `secret.get()` returns empty / permission denied
  - Fix: Add in template `permitted-secrets: { secret-name: true }` and set secret:
    - Global: `monk secrets add -g secret-name='value'`
    - Per-entity: `monk secrets add -r namespace/name secret-name='value'`

## Runtime/Actions

- Action not found
  - Symptom: `monk do ns/name/foo` -> Not found action
  - Fix: Decorate with `@action("foo")` or `@action()`; rebuild and reload MANIFEST

- HTTP client uninitialized
  - Symptom: "HTTP client not initialized"
  - Fix: Instantiate in `before()`; guard with helper method or null-check

- Missing readiness
  - Symptom: `wait ready` never completes
  - Fix: Implement `checkReadiness()` and add static `readiness` config if needed

## Testing

- Test can’t access Monk socket
  - Symptom: Permission denied during test
  - Fix: Run with sudo: `sudo INPUT_DIR=... ./monkec.sh test`

- Environment not loaded
  - Symptom: `$VAR` not expanded in tests
  - Fix: Place `.env` in `src/<module>/test/`, or export vars in shell before running tests

- Stale compiled output
  - Symptom: Changes not reflected at runtime
  - Fix: Recompile, reload MANIFEST, then re-run: `./monkec.sh compile` -> `monk load MANIFEST`

## Schema validation

- Reserved keyword `type` used as property name
  - Symptom: Warnings/errors like:
    - `"type" must be one of [array, boolean, integer, null, number, object, string]`
    - `Invalid type. Expected: string/array of strings, given: type`
  - Root cause: `type` conflicts with JSON Schema keyword when compiled to YAML and validated by Monk.
  - Example (Cloudflare):
    ```
    /monkec/dist/input/cloudflare/cloudflare-dns-zone.yaml:13:5: Must validate at least one schema (anyOf):
       type:
       ^
    /monkec/dist/input/cloudflare/cloudflare-dns-zone.yaml:13:5: "type" must be one of the following: ["array", "boolean", "integer", "null", "number", "object", "string"]:
       type:
       ^

    validate entity instance failed (namespace: cloudflare-test, path: templates/local/cloudflare-test/zone)
      ↪ Invalid type. Expected: string/array of strings, given: type
    ```
  - Fix: Rename field to a specific name and propagate changes across code, templates, and docs.
    - In entity Definition, rename to a non-reserved, specific name:
      - `type` → `zone_type` (for zones)
      - `type` → `record_type` (for DNS records)
    - Map renamed field back to provider API payload:
      - Example: `const payload = { name, type: definition.zone_type || "full" }`
    - Update templates/tests to use the new property names (`zone_type`, `record_type`).
    - Update README/examples accordingly.
    - Recompile and reload MANIFEST, then rerun tests.
  - Prevention: See `doc/entity-conventions.md` → Reserved property names.

## Debugging

- Decode Monk errors
  - Use: `echo '<base64>' | monk decode-err`

- Inspect state and logs
  - `monk describe namespace/name`
  - `monk ps -a`
  - `monk logs namespace/name` (if available)

## Best Practices

- Add JSDoc to every Definition/State property for better schema and docs
- Centralize HTTP setup in `before()`; check `response.ok`
- Keep `dist/**` out of globs/rules; don’t edit generated files
- Use clear `cli.output()` messages for user-facing steps

## Contribute Issues

When you hit a new problem, add:
- Symptom (exact error or behavior)
- Root cause
- Fix/mitigation
- Commands or code snippets if useful
