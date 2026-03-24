# Code Templates for New Entity Integrations

## common.ts

```ts
import secret from "secret";

export const BASE_URL = "https://api.provider.com";

export function getApiKey(secretRef: string): string {
    const key = secret.get(secretRef);
    if (!key) throw new Error(`Missing secret: ${secretRef}`);
    return key;
}

// Shared response interfaces, validators, formatters
```

## Base class (`<package>-base.ts`)

Every integration MUST have a base class:

```ts
import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import { getApiKey } from "./common.ts";
import cli from "cli";

export interface <Provider>EntityDefinition {
    /** @description Secret reference for API authentication */
    secret_ref?: string;
}

export interface <Provider>EntityState {
    /** @description Resource pre-existed before entity managed it */
    existing?: boolean;
}

export abstract class <Provider>Entity<
    D extends <Provider>EntityDefinition,
    S extends <Provider>EntityState
> extends MonkEntity<D, S> {
    protected httpClient!: HttpClient;

    static readonly readiness = { period: 15, initialDelay: 2, attempts: 20 };

    protected override before(): void {
        const secretRef = this.definition.secret_ref || "<package>-api-token";
        const token = getApiKey(secretRef);

        this.httpClient = new HttpClient({
            baseUrl: "https://api.provider.com",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            parseJson: true,
            stringifyJson: true,
        });
    }

    protected abstract getEntityName(): string;

    protected makeRequest(method: string, path: string, body?: any): any {
        const response = this.httpClient.request(method as any, path, { body });
        if (!response.ok) {
            throw new Error(`${this.getEntityName()} API error: ${response.statusCode} - ${JSON.stringify(response.data)}`);
        }
        return response.data;
    }

    protected checkResourceExists(path: string): any | null {
        try {
            return this.makeRequest("GET", path);
        } catch (error) {
            return null;
        }
    }
}
```

### Cloud provider builtins

For AWS/Azure/GCP, use the builtin SDK modules instead of HttpClient. **Before implementing, read the type definitions** to understand the available methods:

- **Azure**: Read `lib/src/builtins/azure.d.ts`, then `import azure from "cloud/azure"`
- **AWS**: Read `lib/src/builtins/aws.d.ts`, then `import aws from "cloud/aws"`
- **GCP**: Read `lib/src/builtins/gcp.d.ts`, then `import gcp from "cloud/gcp"`

These modules handle authentication automatically — no need for `secret.get()` or `permitted-secrets`.

### Cloud builtin error handling

For all cloud builtins (`aws`, `azure`, `gcp`), use the named HTTP methods (`.get()`, `.post()`, `.put()`, `.delete()`) — NOT `.do()`. The named methods return a response object with `statusCode` and `body` even on 400/403/500 errors. The `.do()` method throws "unexpected response code NNN" on non-2xx, losing the response body entirely.

```ts
// CORRECT — returns response on error, can parse error details
const response = aws.post(url, {
    service: "route53",
    region: "us-east-1",
    headers: { "Content-Type": "application/xml" },
    body: xmlBody,
});
if (response.statusCode >= 400) {
    cli.output(`Error (${response.statusCode}): ${response.body}`);
    throw new Error(`API error: ${parseErrorFromBody(response.body)}`);
}

// WRONG — throws with no details, can't parse error
const response = aws.do(url, { method: "POST", ... });
```

Always log `response.body` on errors — cloud API error responses (XML or JSON) contain the actual error code and message. Without this, debugging is impossible.

Only use `.do()` for HTTP methods not covered by named helpers (e.g., PATCH for Azure: `azure.do(url, { method: "PATCH", ... })`).

## Entity class (`<entity>.ts`)

```ts
import { action, Args } from "monkec/base";
import { <Provider>Entity, <Provider>EntityDefinition, <Provider>EntityState } from "./<package>-base.ts";
import cli from "cli";

export interface <Entity>Definition extends <Provider>EntityDefinition {
    /** @description Human-readable resource name */
    name: string;
    // Add provider-specific fields with JSDoc @description on EVERY property
}

export interface <Entity>State extends <Provider>EntityState {
    /** @description Provider resource identifier */
    id?: string;
    // Add state fields with JSDoc @description on EVERY property
}

export class <EntityClass> extends <Provider>Entity<<Entity>Definition, <Entity>State> {

    protected getEntityName(): string {
        return `<Provider> <Entity> ${this.definition.name || 'unnamed'}`;
    }

    override create(): void {
        // 1. Check if resource already exists
        const existing = this.checkResourceExists(`/path/${this.definition.name}`);
        if (existing) {
            this.state.existing = true;
            this.state.id = existing.id;
            cli.output(`Using existing resource: ${existing.name}`);
            return;
        }

        // 2. Create the resource
        const response = this.makeRequest("POST", "/resources", {
            name: this.definition.name,
        });

        // 3. Populate state
        this.state.id = response.id;
        this.state.existing = false;
        cli.output(`Created resource: ${this.state.id}`);
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }
        // PATCH/PUT by this.state.id
    }

    override delete(): void {
        if (!this.state.id) return;
        if (this.state.existing) {
            cli.output("Resource was pre-existing, skipping deletion");
            return;
        }
        this.makeRequest("DELETE", `/resources/${this.state.id}`);
        cli.output(`Deleted resource: ${this.state.id}`);
    }

    override checkReadiness(): boolean {
        if (!this.state.id) return false;
        try {
            const resource = this.makeRequest("GET", `/resources/${this.state.id}`);
            return resource.status === "active" || resource.status === "ready";
        } catch {
            return false;
        }
    }

    checkLiveness(): boolean {
        return this.checkReadiness();
    }

    @action("get-info")
    getInfo(_args?: Args): void {
        if (!this.state.id) throw new Error("Resource not created yet");
        const info = this.makeRequest("GET", `/resources/${this.state.id}`);
        cli.output(`Resource: ${JSON.stringify(info, null, 2)}`);
    }
}
```

## MANIFEST

```
REPO <package>
DESCRIPTION <Provider> entities for Monk
HOSTING <package>
TAGS <package>, cloud, <relevant-tags>
```

**IMPORTANT**: The REPO line MUST be just the package name (e.g., `aws-route53`), NOT a full URL. Using a URL causes entity paths like `https://github.com/.../entity-name` instead of `<package>/entity-name`.

## README.md

The README MUST include a "Required Permissions" section listing all permissions needed to manage the entities. This is critical for users to configure their cloud accounts before using the entities.

```markdown
# <Package>

Monk entities for managing <Provider> <resource type> resources.

## Entities

| Entity | Description |
|--------|-------------|
| `<package>/<entity>` | <description> |

## Prerequisites

- <Provider> credentials configured via `monk cluster providers` (or secret_ref for SaaS)

## Required Permissions

<For AWS: IAM policy JSON listing all required actions>
<For Azure: required Microsoft.* actions or roles>
<For GCP: required IAM roles>
<For SaaS: required API scopes>

## <Entity> Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|

## Actions

| Action | Description |
|--------|-------------|
```

Derive the permissions list from ALL API calls in the entity source code — every `.get()`, `.post()`, `.put()`, `.delete()` call maps to a provider permission. Include permissions for cost estimation (`pricing:GetProducts`, `cloudwatch:GetMetricStatistics` for AWS, etc.).

## example.yaml

```yaml
namespace: <package>-example

resource-1:
  defines: <package>/<entity-class>
  name: my-resource
  secret_ref: <package>-api-token
  permitted-secrets:
    <package>-api-token: true
```

## test/env.example

```bash
# <PROVIDER> API credentials
<PROVIDER>_API_TOKEN=your-api-token-here
```

## test/stack-template.yaml

```yaml
namespace: <package>-test

test-resource:
  defines: <package>/<entity-class>
  name: test-resource-name
  secret_ref: <package>-api-token
  permitted-secrets:
    <package>-api-token: true
```

## test/stack-integration.test.yaml

```yaml
name: "<Provider> Integration Test"
description: "Full lifecycle test for <Provider> entities"
timeout: 300000

secrets:
  global:
    <package>-api-token: "$<PROVIDER>_API_TOKEN"

setup:
  - name: "Load compiled entity"
    action: load
    target: dist/input/<package>/MANIFEST
    expect: { exitCode: 0 }
  - name: "Load test template"
    action: load
    target: stack-template.yaml
    expect: { exitCode: 0 }

tests:
  - name: "Create resource"
    action: run
    target: <package>-test/test-resource
    args:
      tag: "local"
    expect: { exitCode: 0 }
  - name: "Wait for readiness"
    action: wait
    target: <package>-test/test-resource
    waitFor: { condition: ready, timeout: 120000 }
  - name: "Get resource info"
    action: do
    target: <package>-test/test-resource/get-info
    expect: { exitCode: 0 }

cleanup:
  - name: "Delete resource"
    action: delete
    target: <package>-test/test-resource
    expect: { exitCode: 0 }
```
