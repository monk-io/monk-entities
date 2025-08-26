# HttpClient

The `HttpClient` class provides a pleasant HTTP client that wraps the builtin `http` module, making it easier to perform HTTP requests in Monk entities.

## Overview

The `HttpClient` simplifies HTTP operations by:

- Providing a clean, fluent API for common HTTP methods
- Automatically handling JSON serialization/deserialization
- Managing base URLs and default headers
- Supporting request timeouts
- Providing structured response objects

## Installation

Import the `HttpClient` from the `monkec/http-client` module:

```typescript
import { HttpClient } from "monkec/http-client";
```

## Basic Usage

### Creating an HttpClient

```typescript
// Simple client with defaults
const client = new HttpClient();

// Client with configuration
const client = new HttpClient({
  baseUrl: "https://jsonplaceholder.typicode.com",
  headers: {
    Authorization: "Bearer your-token",
    "User-Agent": "MyApp/1.0",
  },
  timeout: 5000,
  parseJson: true,
  stringifyJson: true,
});
```

### Configuration Options

```typescript
interface HttpClientOptions {
  /** Base URL for all requests */
  baseUrl?: string;
  /** Default headers to include with all requests */
  headers?: Record<string, string>;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Whether to automatically parse JSON responses (default: true) */
  parseJson?: boolean;
  /** Whether to automatically stringify JSON requests (default: true) */
  stringifyJson?: boolean;
}
```

### Making Requests

```typescript
// GET request
const response = client.get("/users/1");

// POST request with data
const response = client.post("/users", {
  body: { name: "John", email: "john@example.com" },
});

// PUT request with query parameters
const response = client.put("/users/1", {
  body: { name: "Jane" },
  query: { include: "profile" },
});

// PATCH request
const response = client.patch("/users/1", {
  body: { email: "jane@example.com" },
});

// DELETE request
const response = client.delete("/users/1");

// Custom request
const response = client.request("HEAD", "/users/1");
```

### Request Options

```typescript
interface HttpClientRequestOptions {
  /** Additional headers for this request */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Request body (will be JSON stringified if object and stringifyJson is true) */
  body?: any;
  /** Query parameters to append to URL */
  query?: Record<string, string>;
}
```

### Response Object

```typescript
interface HttpClientResponse<T = any> {
  /** HTTP status code */
  statusCode: number;
  /** Status text */
  status: string;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body (parsed as JSON if parseJson is true and content-type is JSON) */
  data: T;
  /** Raw response body */
  raw: string;
  /** Content length in bytes */
  contentLength: number;
  /** Whether the request was successful (status 200-299) */
  ok: boolean;
}
```

## Using HttpClient in Entities

### Simple Usage in @before

The most common pattern is to instantiate the `HttpClient` in the `@before` method, making it available to all action methods:

```typescript
import { MonkEntity } from "monkec/base";
import { HttpClient } from "monkec/http-client";

export interface MyEntityDefinition {
  /**
   * @description Base URL for the remote API
   * @format uri
   */
  apiUrl: string;
  /**
   * @description Bearer token used for authenticating API requests
   */
  apiKey: string;
}

export interface MyEntityState {
  /**
   * @description Data items retrieved from the remote API
   */
  data: any[];
}

export class MyEntity extends MonkEntity<MyEntityDefinition, MyEntityState> {
  private httpClient?: HttpClient;

  protected before(): void {
    // Initialize HTTP client with configuration from definition
    this.httpClient = new HttpClient({
      baseUrl: this.definition.apiUrl,
      headers: {
        Authorization: `Bearer ${this.definition.apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log(`HTTP client configured for ${this.definition.apiUrl}`);
  }

  // Use the client in action methods
  @action
  fetchData(): void {
    if (!this.httpClient) {
      throw new Error("HTTP client not initialized");
    }

    const response = this.httpClient.get("/data");
    if (response.ok) {
      this.state.data = response.data;
    } else {
      throw new Error(`Failed to fetch data: ${response.status}`);
    }
  }
}
```

### Advanced Pattern with Base HttpEntity Class

For entities that heavily use HTTP operations, you can create a base class that manages the HTTP client:

```typescript
import { MonkEntity } from "monkec/base";
import { HttpClient, type HttpClientOptions } from "monkec/http-client";

/**
 * Definition interface for HTTP-enabled entities
 */
export interface HttpEntityDefinition {
  /** HTTP client configuration */
  http: HttpClientOptions;
}

/**
 * State interface for HTTP-enabled entities
 */
export interface HttpEntityState {
  /** Last HTTP response status for debugging */
  lastHttpStatus?: number;
  /** Any entity-specific state */
  [key: string]: any;
}

/**
 * Base class for entities that need HTTP client functionality.
 * This class sets up an HTTP client in the before() hook, making it
 * available to all action methods.
 */
export abstract class HttpEntity<
  D extends HttpEntityDefinition,
  S extends HttpEntityState
> extends MonkEntity<D, S> {
  protected httpClient?: HttpClient;

  /**
   * Set up the HTTP client before any action is executed
   */
  protected override before(): void {
    console.log("Setting up HTTP client...");

    // Create HTTP client with configuration from definition
    this.httpClient = new HttpClient(this.definition.http);

    console.log(
      `HTTP client configured with base URL: ${
        this.definition.http.baseUrl || "none"
      }`
    );
  }

  /**
   * Clean up after action execution
   */
  protected override after(): void {
    // Log the last HTTP status if available
    if (this.state.lastHttpStatus) {
      console.log(`Last HTTP request status: ${this.state.lastHttpStatus}`);
    }
  }

  /**
   * Helper method to update the last HTTP status in state
   */
  protected updateHttpStatus(statusCode: number): void {
    this.state.lastHttpStatus = statusCode;
  }

  /**
   * Helper method to ensure HTTP client is available
   */
  protected ensureHttpClient(): HttpClient {
    if (!this.httpClient) {
      throw new Error(
        "HTTP client not initialized. Make sure before() has been called."
      );
    }
    return this.httpClient;
  }
}
```

### Using the HttpEntity Base Class

```typescript
import { action, type Args } from "monkec/base";
import { HttpEntity } from "./http-entity.ts";

export interface ApiManagerDefinition {
  userId: number;
  http: {
    baseUrl: string;
    headers?: Record<string, string>;
    timeout?: number;
  };
}

export interface ApiManagerState {
  users: User[];
  lastHttpStatus?: number;
}

export class ApiManager extends HttpEntity<
  ApiManagerDefinition,
  ApiManagerState
> {
  override create(): void {
    console.log("Creating ApiManager...");

    const client = this.ensureHttpClient();

    try {
      const response = client.get<User[]>("/users");
      this.updateHttpStatus(response.statusCode);

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      this.state.users = response.data;
      console.log(`Loaded ${this.state.users.length} users`);
    } catch (error) {
      console.error("Failed to create ApiManager:", error);
      throw error;
    }
  }

  @action
  refreshUsers(): void {
    const client = this.ensureHttpClient();

    const response = client.get<User[]>("/users");
    this.updateHttpStatus(response.statusCode);

    if (response.ok) {
      this.state.users = response.data;
      console.log("Users refreshed successfully");
    } else {
      throw new Error(`Failed to refresh users: ${response.status}`);
    }
  }

  @action
  createUser(args?: Args): void {
    const { name, email } = args || {};
    if (!name || !email) {
      throw new Error("Name and email are required");
    }

    const client = this.ensureHttpClient();

    const response = client.post<User>("/users", {
      body: { name, email },
    });
    this.updateHttpStatus(response.statusCode);

    if (response.ok) {
      this.state.users.push(response.data);
      console.log(`User created: ${response.data.name}`);
    } else {
      throw new Error(`Failed to create user: ${response.status}`);
    }
  }
}
```

## Error Handling

The HttpClient will throw errors in the following cases:

- Network errors or request failures
- Timeouts

HTTP error status codes (4xx, 5xx) do not throw errors. Instead, check the `ok` property of the response:

```typescript
const response = client.get("/api/data");

if (!response.ok) {
  console.error(`Request failed: ${response.status} ${response.statusCode}`);
  // Handle error based on status code
  if (response.statusCode === 404) {
    console.log("Resource not found");
  } else if (response.statusCode >= 500) {
    console.log("Server error");
  }
}
```

## Best Practices

1. **Initialize in @before**: Always initialize the HttpClient in the `before()` method to ensure it's available for all actions.

2. **Use configuration from definition**: Store HTTP configuration in the entity definition for flexibility.

3. **Check response.ok**: Always check the `ok` property before using response data.

4. **Handle errors gracefully**: Wrap HTTP operations in try-catch blocks and provide meaningful error messages.

5. **Use TypeScript generics**: Specify response types using generics for better type safety:

   ```typescript
   const response = client.get<User[]>("/users");
   ```

6. **Reuse clients**: Create one HttpClient instance per entity rather than creating new instances for each request.

7. **Set appropriate timeouts**: Configure reasonable timeouts based on your use case to avoid hanging requests.

## Example: Complete Weather Service Entity

```typescript
import { MonkEntity, action, type Args } from "monkec/base";
import { HttpClient} from "monkec/http-client";

export interface WeatherServiceDefinition {
  apiKey: string;
  defaultCity: string;
  units: "metric" | "imperial";
}

export interface WeatherServiceState {
  currentWeather?: WeatherData;
  lastUpdate?: Date;
  lastHttpStatus?: number;
}

export interface WeatherData {
  city: string;
  temperature: number;
  description: string;
  humidity: number;
}

export class WeatherService extends MonkEntity<
  WeatherServiceDefinition,
  WeatherServiceState
> {
  private httpClient?: HttpClient;

  protected before(): void {
    this.httpClient = new HttpClient({
      baseUrl: "https://api.openweathermap.org/data/2.5",
      headers: {
        Accept: "application/json",
      },
      timeout: 5000,
      parseJson: true,
    });

    console.log("Weather service HTTP client initialized");
  }

  override create(): void {
    console.log("Creating weather service...");
    // Fetch initial weather for default city
    this.fetchWeather(this.definition.defaultCity);
  }

  @action
  getWeather(args?: Args): void {
    const city = args?.city || this.definition.defaultCity;
    this.fetchWeather(city);
  }

  @action
  refresh(): void {
    if (this.state.currentWeather) {
      this.fetchWeather(this.state.currentWeather.city);
    }
  }

  private fetchWeather(city: string): void {
    if (!this.httpClient) {
      throw new Error("HTTP client not initialized");
    }

    try {
      const response = this.httpClient.get("/weather", {
        query: {
          q: city,
          appid: this.definition.apiKey,
          units: this.definition.units,
        },
      });

      this.state.lastHttpStatus = response.statusCode;

      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const data = response.data;
      this.state.currentWeather = {
        city: data.name,
        temperature: data.main.temp,
        description: data.weather[0].description,
        humidity: data.main.humidity,
      };
      this.state.lastUpdate = new Date();

      console.log(
        `Weather updated for ${city}: ${this.state.currentWeather.temperature}°`
      );
    } catch (error) {
      console.error(`Failed to fetch weather for ${city}:`, error);
      throw error;
    }
  }
}
```

This example demonstrates a complete weather service entity that uses the HttpClient to fetch weather data, showing proper initialization in `@before`, error handling, and state management.
