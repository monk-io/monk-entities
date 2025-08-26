# Monk Module System

The Monk module system allows you to create reusable JavaScript modules that can be shared between entities. This enables better code organization and reusability in your entity lifecycle scripts.

## Defining a Module

A module is defined using the `defines: module` directive and contains JavaScript source code:

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
```

## Module Types (TypeScript Definitions)

Modules can optionally include TypeScript type definitions using the `types` property. This provides better IDE support and type checking for your modules:

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

### Benefits of Type Definitions

1. **IDE Support**: Better autocomplete and IntelliSense in supported editors
2. **Type Safety**: Catch type errors during development
3. **Documentation**: Types serve as inline documentation for your module's API
4. **Refactoring**: Safer refactoring with type checking

## Using Modules in Entities

To use a module in an entity, add it to the `requires` list and use `require()` in your JavaScript code:

```yaml
my-service:
  defines: entity
  requires:
    - my-app/http-client  # Full path to the module
  create: |
    function main(definition, state, context) {
      const httpClient = require('my-app/http-client');
      
      const response = httpClient.get('https://api.example.com/status');
      
      return {
        status: 'created',
        api_response: response
      };
    }
```

## Module Resolution

Modules are resolved using the full namespace path. For example:
- Template path: `templates/local/my-app/http-client`
- Require path: `my-app/http-client`

The module system automatically handles Node.js-style module resolution, so you can use standard `require()` syntax.

## Best Practices

1. **Namespace Organization**: Group related modules under the same namespace
2. **Clear Exports**: Use descriptive names for exported functions
3. **Error Handling**: Include proper error handling in your modules
4. **Documentation**: Comment your module functions for better maintainability
5. **Type Definitions**: Include TypeScript definitions for better IDE support and type safety
6. **Interface Design**: Use interfaces to define complex data structures
7. **Generic Types**: Use generics for reusable utility functions like `retry<T>`

## Example: Complete Module System

```yaml
namespace: web-app

# Utility module for common operations
utils:
  defines: module
  source: |
    function formatDate(date) {
      return new Date(date).toISOString();
    }
    
    function retry(fn, maxAttempts = 3) {
      for (let i = 0; i < maxAttempts; i++) {
        try {
          return fn();
        } catch (error) {
          if (i === maxAttempts - 1) throw error;
        }
      }
    }
    
    module.exports = { formatDate, retry };
  types: |
    export function formatDate(date: Date | string | number): string;
    export function retry<T>(fn: () => T, maxAttempts?: number): T;

# HTTP client module
api-client:
  defines: module
  source: |
    function makeRequest(endpoint, method = 'GET', data = null) {
      const http = require('http');
      const utils = require('web-app/utils');
      
      return utils.retry(() => {
        if (method === 'GET') {
          return http.get(endpoint);
        } else {
          return http.post(endpoint, { body: JSON.stringify(data) });
        }
      });
    }
    
    module.exports = { makeRequest };
  types: |
    export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
    
    export interface ApiResponse {
      status: number;
      data: any;
    }
    
    export function makeRequest(
      endpoint: string, 
      method?: HttpMethod, 
      data?: any
    ): ApiResponse;

# Entity using both modules
web-service:
  defines: entity
  requires:
    - web-app/utils
    - web-app/api-client
  create: |
    function main(definition, state, context) {
      const utils = require('web-app/utils');
      const apiClient = require('web-app/api-client');
      
      const response = apiClient.makeRequest('https://api.example.com/health');
      
      return {
        status: 'created',
        created_at: utils.formatDate(new Date()),
        health_check: response
      };
    }
```

This module system provides a clean way to organize and share JavaScript code between your Monk entities, making your templates more maintainable and reusable. 