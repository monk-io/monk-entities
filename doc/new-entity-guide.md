# New Entity Authoring Guide

This guide gives you an end-to-end workflow to create, compile, load, and test a new MonkEC entity.

## 1) Scaffold

Create a new module under `src/`:

```
src/your-entity/
├── base.ts              # Optional: shared base class/utilities
├── entity.ts            # The entity implementation
├── README.md            # Optional: module docs
└── test/
    ├── env.example      # Test environment template
    ├── stack-template.yaml  # Template with an instance
    └── stack-integration.test.yaml  # Test definition
```

## 2) Implement the Entity

Use the generic base and the `@action()` decorator for operations.

```ts
import { MonkEntity, action, type Args } from "monkec/base";

export interface Definition {
  /**
   * @description Human-readable name for the resource to manage
   */
  name: string;
}

export interface State {
  /**
   * @description Provider-specific identifier of the created resource
   */
  id?: string;

  /**
   * @description Indicates the resource pre-existed and was not created by this entity
   */
  existing?: boolean;
}

export class MyEntity extends MonkEntity<Definition, State> {
  protected before(): void {
    // Initialize clients, secrets, etc.
  }

  override create(): void {
    // Create resource and populate state
  }

  override update(): void {
    // Update resource
  }

  override delete(): void {
    // Delete resource (consider existing flag)
  }

  override checkReadiness(): boolean {
    // Return true when ready
    return true;
  }

  @action("info")
  info(args?: Args): void {
    // Emit information via cli.output or update state
  }
}
```

Optional: tune readiness polling

```ts
static readonly readiness = { period: 10, initialDelay: 2, attempts: 20 };
```

## 3) Write the Template

Bind an instance to the compiled type and grant secrets if needed.

```yaml
namespace: your-entity-test

test-resource:
  defines: your-entity/my-entity
  name: example
  permitted-secrets:
    api-token: true
```

## 4) Create Tests

A minimal integration test:

```yaml
name: MyEntity Integration Test

description: Full lifecycle

timeout: 120000

setup:
  - name: Load compiled entity
    action: load
    target: dist/your-entity/MANIFEST
  - name: Load template
    action: load
    target: test/stack-template.yaml

tests:
  - name: Run entity
    action: run
    target: your-entity-test/test-resource
    expect:
      exitCode: 0
  - name: Wait ready
    action: wait
    target: your-entity-test/test-resource
    waitFor:
      condition: ready
      timeout: 60000
  - name: Action
    action: action
    target: your-entity-test/test-resource
    actionName: info

cleanup:
  - name: Delete
    action: delete
    target: your-entity-test/test-resource
```

## 5) Compile

```bash
INPUT_DIR=./src/your-entity/ OUTPUT_DIR=./dist/your-entity/ ./monkec.sh compile
```

## 6) Load and Run Manually

```bash
cd dist/your-entity/
monk load MANIFEST
monk load ../../src/your-entity/test/stack-template.yaml
monk update your-entity-test/test-resource
monk describe your-entity-test/test-resource
```

## 7) Test with Wrapper

```bash
sudo INPUT_DIR=./src/your-entity/ ./monkec.sh test --verbose
```

## 8) Secrets

- Grant in template via `permitted-secrets`.
- Add global: `monk secrets add -g api-token='secret'`
- Add per-entity: `monk secrets add -r your-entity-test/test-resource api-token='secret'`

## 9) Tips and Patterns

- Centralize HTTP setup in `before()`.
- Use a shared base class for provider authentication and request helpers (see `src/neon/neon-base.ts`, `src/digitalocean-database/digitalocean-base.ts`).
- Use `cli.output()` for clear user messages.
- Use `checkReadiness()` and static polling config for reliable waits.
- Prefer `@action()` for operational commands and demonstrate them in README and tests.

### Idempotent updates (recommended)

By default, the base `MonkEntity` stores a `definition_hash` in state after `create()` and auto-skips `update()` when the current hash matches. You can customize the hashed input by overriding `getDefinitionForHash()` in your entity to exclude ephemeral fields:

```ts
protected getDefinitionForHash(): unknown {
  // Return a sanitized subset of the definition for hashing
  const { /* e.g., exclude optional runtime-only flags */ ...rest } = this.definition as any;
  return rest;
}
```

See `doc/entity-conventions.md` → Change detection and idempotent updates for details and safeguards.

## 10) Troubleshooting

- Re-load `MANIFEST` after recompiling.
- Decode base64 errors: `echo '<err>' | monk decode-err`.
- Inspect: `monk ls`, `monk dump ns/name`, `monk describe ns/name`.
