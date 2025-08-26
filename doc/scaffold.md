# Canonical Entity Scaffold

Use this scaffold as a starting point for new entities. Replace placeholders and fill provider logic.

```ts
import { MonkEntity, action, type Args } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import secret from "secret";
import cli from "cli";

export interface Definition {
  /** @description API token secret reference (falls back to provider default) */
  secret_ref?: string;
  /** @description Human-readable resource name */
  name: string;
}

export interface State {
  /** @description Provider resource identifier */
  id?: string;
  /** @description Resource pre-existed */
  existing?: boolean;
}

export class ExampleEntity extends MonkEntity<Definition, State> {
  private http!: HttpClient;

  // Optional: tune readiness polling
  static readonly readiness = { period: 10, initialDelay: 2, attempts: 20 };

  protected before(): void {
    const secretRef = this.definition.secret_ref || "<PROVIDER-DEFAULT-SECRET>";
    const token = secret.get(secretRef);
    if (!token) throw new Error(`Missing secret: ${secretRef}`);

    this.http = new HttpClient({
      baseUrl: "https://api.example.com",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      parseJson: true,
      stringifyJson: true,
      timeout: 10000,
    });
  }

  override create(): void {
    // 1) try GET existing by name
    // 2) if found, set state { id, existing: true } and return
    // 3) else POST create, set state { id, existing: false }
  }

  override update(): void {
    // PUT/PATCH by this.state.id
  }

  override delete(): void {
    // If state.existing, skip destructive operations
    // else DELETE by this.state.id
  }

  override checkReadiness(): boolean {
    // GET status by id; return true when ready
    return Boolean(this.state.id);
  }

  @action("get-info")
  getInfo(args?: Args): void {
    cli.output(`Entity: ${this.definition.name}`);
  }
}
```

Template snippet:

```yaml
namespace: example-test

resource:
  defines: example/example-entity
  name: demo
  secret_ref: example-api-token
  permitted-secrets:
    example-api-token: true
```

Test snippet:

```yaml
name: Example Entity Integration Test

timeout: 120000

setup:
  - { action: load, target: dist/example/MANIFEST, expect: { exitCode: 0 } }
  - { action: load, target: test/stack-template.yaml, expect: { exitCode: 0 } }

tests:
  - { action: run, target: example-test/resource, expect: { exitCode: 0 } }
  - { action: wait, target: example-test/resource, waitFor: { condition: ready, timeout: 60000 } }
  - { action: action, target: example-test/resource, actionName: get-info, expect: { exitCode: 0 } }

cleanup:
  - { action: delete, target: example-test/resource, expect: { exitCode: 0 } }
```
