# monk-entities

Examples of implementing Monk Entities using the new TypeScript-based approach with MonkEC compiler.

## Overview

This repository contains examples of Monk entities implemented using TypeScript source code that gets compiled into YAML and JavaScript files. This approach provides:

- **Type Safety**: Full TypeScript support with interfaces and type checking
- **Better Developer Experience**: IDE support, autocomplete, and error detection
- **Modular Architecture**: Reusable base classes and shared utilities
- **Testing Framework**: Built-in testing capabilities with functional tests
- **Compilation Pipeline**: Automatic conversion from TypeScript to Monk-compatible YAML/JS
- **Module System**: Reusable JavaScript modules with TypeScript definitions
- **HTTP Client**: Built-in HTTP client for API interactions

## Quick Start

### Building and Loading Entities

```bash
# Build all default modules (monkec, mongodb-atlas, neon)
./build.sh

# Build specific modules
./build.sh mongodb-atlas neon

# Load all entities
monk load MANIFEST

# Load specific entity
cd dist/mongodb-atlas/
monk load MANIFEST
```

### Testing Entities

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --test-file test/stack-integration.test.yaml

# Watch mode for development
sudo INPUT_DIR=./src/mongodb-atlas/ ./monkec.sh test --watch
```

## Developing New Entities

### Project Structure

```
src/
├── your-entity/
│   ├── base.ts              # Base class and common interfaces
│   ├── entity.ts            # Main entity implementation
│   ├── common.ts            # Shared utilities and constants
│   ├── README.md            # Entity documentation
│   └── test/
│       ├── README.md        # Testing instructions
│       ├── env.example      # Environment variables template
│       ├── stack-template.yaml      # Test stack configuration
│       └── stack-integration.test.yaml  # Functional test configuration
├── lib/
│   ├── modules/
│   │   ├── base.d.ts        # MonkEC base types
│   │   └── http-client.d.ts # HTTP client types
│   └── builtins/            # Built-in module types
└── monkec/                  # MonkEC compiler implementation
```

### Entity Implementation

Create a base class that extends `MonkEntity`:

```typescript
// src/your-entity/base.ts
import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";
import cli from "cli";

export interface YourEntityDefinition {
    secret_ref: string;
    // Add your entity-specific properties
}

export interface YourEntityState {
    existing?: boolean;
    // Add your entity-specific state
}

export abstract class YourEntity<
    D extends YourEntityDefinition,
    S extends YourEntityState
> extends MonkEntity<D, S> {
    
    protected apiKey!: string;
    protected httpClient!: HttpClient;

    protected override before(): void {
        // Initialize authentication and HTTP client
        this.apiKey = secret.get(this.definition.secret_ref);
        if (!this.apiKey) {
            throw new Error(`Failed to retrieve API key from secret: ${this.definition.secret_ref}`);
        }

        this.httpClient = new HttpClient({
            baseUrl: "https://api.yourservice.com",
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            parseJson: true,
            stringifyJson: true,
            timeout: 10000,
        });
    }

    protected abstract getEntityName(): string;

    protected makeRequest(method: string, path: string, body?: any): any {
        try {
            const response = this.httpClient.request(method as any, path, { body });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.statusCode} ${response.status} - ${response.data}`);
            }
            
            return response.data;
        } catch (error) {
            throw new Error(`${method} request to ${path} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    protected checkResourceExists(path: string): any | null {
        try {
            return this.makeRequest("GET", path);
        } catch (error) {
            return null;
        }
    }

    protected deleteResource(path: string, resourceName: string): void {
        if (this.state.existing) {
            cli.output(`${resourceName} wasn't created by this entity, skipping delete`);
            return;
        }

        try {
            this.makeRequest("DELETE", path);
            cli.output(`Successfully deleted ${resourceName}`);
        } catch (error) {
            throw new Error(`Failed to delete ${resourceName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
```

Create your specific entity class:

```typescript
// src/your-entity/entity.ts
import { YourEntity, YourEntityDefinition, YourEntityState } from "./base.ts";
import { action, Args } from "monkec/base";
import cli from "cli";

export interface SpecificEntityDefinition extends YourEntityDefinition {
    name: string;
    // Add specific properties
}

export interface SpecificEntityState extends YourEntityState {
    id?: string;
    name?: string;
    // Add specific state properties
}

export class SpecificEntity extends YourEntity<SpecificEntityDefinition, SpecificEntityState> {
    
    // Customize readiness check parameters
    static readonly readiness = { period: 10, initialDelay: 2, attempts: 20 };
    
    protected getEntityName(): string {
        return this.definition.name;
    }

    override create(): void {
        // Check if resource already exists
        const existing = this.checkResourceExists(`/resources/${this.definition.name}`);
        
        if (existing) {
            this.state = {
                id: existing.id,
                name: existing.name,
                existing: true
            };
            return;
        }

        // Create new resource
        const body = {
            name: this.definition.name,
            // Add other properties
        };
        
        const created = this.makeRequest("POST", "/resources", body);
        
        this.state = {
            id: created.id,
            name: created.name,
            existing: false
        };
    }

    override update(): void {
        if (!this.state.id) {
            this.create();
            return;
        }

        // Update logic here
        const body = {
            name: this.definition.name,
            // Add update properties
        };
        
        this.makeRequest("PUT", `/resources/${this.state.id}`, body);
    }

    override delete(): void {
        if (!this.state.id) {
            cli.output("Resource does not exist, nothing to delete");
            return;
        }
        
        this.deleteResource(`/resources/${this.state.id}`, "Resource");
    }

    override checkReadiness(): boolean {
        if (!this.state.id) {
            return false;
        }

        try {
            const resource = this.makeRequest("GET", `/resources/${this.state.id}`);
            return resource.status === "ready";
        } catch (error) {
            return false;
        }
    }

    // Custom actions using @action decorator
    @action("backup")
    backup(args?: Args): void {
        cli.output(`Backing up resource: ${this.definition.name}`);
        
        const backupResponse = this.makeRequest("POST", `/resources/${this.state.id}/backup`);
        cli.output(`Backup created: ${backupResponse.backupId}`);
    }

    @action("restore")
    restore(args?: Args): void {
        const backupId = args?.backupId;
        if (!backupId) {
            throw new Error("backupId argument is required");
        }

        cli.output(`Restoring resource from backup: ${backupId}`);
        
        this.makeRequest("POST", `/resources/${this.state.id}/restore`, {
            backupId: backupId
        });
    }
}
```

### Testing Setup

Create comprehensive tests using the MonkEC testing framework:

```yaml
# src/your-entity/test/stack-template.yaml
namespace: your-entity-test

test-resource:
  defines: your-entity/specific-entity
  secret_ref: your-service-token
  name: test-resource-123
  permitted-secrets:
    your-service-token: true
  services:
    data:
      protocol: custom
```

```yaml
# src/your-entity/test/stack-integration.test.yaml
name: Your Entity Integration Test
description: Complete integration test for Your Entity
timeout: 300000

secrets:
  global:
    your-service-token: "$YOUR_SERVICE_TOKEN"
    your-dev-password: "dev-secure-password-123"

setup:
  - name: Load compiled entity
    action: load
    target: dist/your-entity/MANIFEST
    expect:
      exitCode: 0

  - name: Load entity template
    action: load
    target: test/stack-template.yaml
    expect:
      exitCode: 0

tests:
  - name: Create and start entity
    action: run
    target: your-entity-test/test-resource
    expect:
      exitCode: 0
      output:
        - "Started your-entity-test/test-resource"

  - name: Wait for entity to be ready
    action: wait
    target: your-entity-test/test-resource
    waitFor:
      condition: ready
      timeout: 60000

  - name: Test custom action
    action: action
    target: your-entity-test/test-resource
    actionName: backup
    expect:
      exitCode: 0
      output:
        - "Backing up resource"

  - name: Test action with arguments
    action: action
    target: your-entity-test/test-resource
    actionName: restore
    args:
      backupId: "backup-123"
    expect:
      exitCode: 0
      output:
        - "Restoring resource from backup"

cleanup:
  - name: Delete entity
    action: delete
    target: your-entity-test/test-resource
    expect:
      exitCode: 0
```

### Environment Configuration

Create environment template with automatic loading:

```bash
# src/your-entity/test/env.example
# Required: Your Service API Token
YOUR_SERVICE_TOKEN=your-actual-api-token-here

# Optional: Test configuration
MONKEC_VERBOSE=true
TEST_TIMEOUT=300000
```

The testing framework automatically loads `.env` files from the test directory.

## Development Workflow

### Development Cycle

```bash
# 1. Make changes to TypeScript source
vim src/your-entity/entity.ts

# 2. Compile the entity
./build.sh your-entity

# 3. Load the compiled entity
monk load dist/your-entity/MANIFEST

# 4. Test the entity
sudo INPUT_DIR=./src/your-entity/ ./monkec.sh test

# 5. Iterate and repeat
```

### Best Practices

- **Type Safety**: Use TypeScript interfaces for all definitions and state
- **Error Handling**: Implement comprehensive error handling with try-catch blocks
- **Logging**: Use `cli.output()` for user-friendly messages
- **Testing**: Write functional tests for all entity operations
- **Environment Isolation**: Use separate test environments with `.env` files
- **Resource Cleanup**: Always clean up test resources
- **Watch Mode**: Use `--watch` flag for rapid development iteration

## Framework Features

### HTTP Client

The MonkEC framework provides a powerful HTTP client for API interactions:

```typescript
import { HttpClient } from "monkec/http-client";
import cli from "cli";

// Create client with configuration
const client = new HttpClient({
  baseUrl: "https://api.example.com",
  headers: {
    Authorization: "Bearer your-token",
    "Content-Type": "application/json",
  },
  timeout: 10000,
  parseJson: true,
  stringifyJson: true,
});

// Make requests
const response = client.get("/users/1");
if (response.ok) {
  cli.output("User: " + JSON.stringify(response.data));
}

// Error handling
if (!response.ok) {
  throw new Error(`Request failed: ${response.status}`);
}
```

### Module System

Create reusable modules for shared functionality:

```yaml
namespace: my-app

http-client:
  defines: module
  source: |
    function get(url, options = {}) {
      const http = require('http');
      return http.get(url, options);
    }
    
    function post(url, data, options = {}) {
      const http = require('http');
      return http.post(url, { 
        body: JSON.stringify(data),
        ...options 
      });
    }
    
    module.exports = { get, post };
  types: |
    export interface HttpOptions {
      headers?: Record<string, string>;
      timeout?: number;
    }
    
    export interface HttpResponse {
      status: number;
      data: any;
      headers: Record<string, string>;
    }
    
    export function get(url: string, options?: HttpOptions): HttpResponse;
    export function post(url: string, data: any, options?: HttpOptions): HttpResponse;
```

## Available Examples

### MongoDB Atlas Entities
- **Location**: `src/mongodb-atlas/`
- **Features**: Project, cluster, and user management
- **Documentation**: See `src/mongodb-atlas/README.md`
- **Testing**: Comprehensive integration tests with stack and multi-instance scenarios

### Neon Entities  
- **Location**: `src/neon/`
- **Features**: Project, branch, compute, and role management
- **Documentation**: See `src/neon/README.md`
- **Testing**: Full lifecycle testing with operation waiting

### Netlify Entities
- **Location**: `src/netlify/`
- **Features**: Site, deployment, and form management
- **Documentation**: See `src/netlify/README.md`
- **Testing**: Complete integration tests with site, deploy, and form scenarios
- **API**: Based on [Netlify API documentation](https://docs.netlify.com/api/get-started/)

### MonkEC Framework
- **Location**: `src/monkec/`
- **Features**: Base classes, HTTP client, and compilation tools
- **Documentation**: See `src/monkec/base.ts` and `src/monkec/http-client.ts`

## Troubleshooting

### Common Issues

1. **Compilation Errors**
   - Check TypeScript syntax and imports
   - Verify all required interfaces are defined
   - Ensure proper module paths in `tsconfig.json`

2. **Runtime Errors**
   - Verify API credentials and permissions
   - Check network connectivity to external APIs
   - Review entity state and definition validation

3. **Test Failures**
   - Ensure environment variables are set correctly in `.env` file
   - Check API rate limits and quotas
   - Verify test resources are properly cleaned up
   - Use `--verbose` flag for detailed debugging

4. **HTTP Client Issues**
   - Check response.ok before using data
   - Verify base URL and headers configuration
   - Set appropriate timeouts for your use case

### Debug Commands

```bash
# Enable verbose compilation
./build.sh your-entity

# Enable verbose testing
sudo MONKEC_VERBOSE=true INPUT_DIR=./src/your-entity/ ./monkec.sh test --verbose

# Check entity state
monk describe your-namespace/your-entity

# Watch mode for development
sudo INPUT_DIR=./src/your-entity/ ./monkec.sh test --watch
```

## Contributing

When contributing new entities:

1. Follow the established project structure
2. Implement comprehensive TypeScript interfaces
3. Add functional tests with proper cleanup
4. Document all features and usage examples
5. Update this README with new entity information
6. Use the module system for reusable functionality
7. Implement proper error handling and logging
8. Add readiness checks with appropriate timeouts

See source code in subfolders and README.md for usage. 

Use `monk load MANIFEST` to load all entity types at once.
You can see example.yaml in subfolders for example definitions.
