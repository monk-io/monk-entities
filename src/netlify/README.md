# Netlify Entities

This directory contains TypeScript entities for managing Netlify resources using the MonkEC compiler. It provides functionality to create and manage sites, deployments, forms, and other Netlify resources.

## Overview

The Netlify entities allow you to:
- Create and manage Netlify sites
- Deploy and manage site deployments
- Manage forms and form submissions
- Configure site settings and custom domains
- Handle deployment rollbacks and management

## Prerequisites

1. **Netlify Account**: You need a Netlify account with API access
2. **Personal Access Token**: Create a personal access token in Netlify
3. **Site Access**: Ensure your token has access to the target sites

## Setup

### 1. Create Netlify Personal Access Token

1. Log in to Netlify
2. Go to User Settings → Applications → Personal access tokens
3. Create a new personal access token with appropriate permissions
4. Copy the token to your clipboard

### 2. Store Credentials in Monk Secrets

```bash
# Store your Netlify personal access token
monk secret set -g netlify-api-token "your_personal_access_token_here"
```

## Entity Types

### 1. Site Entity

Creates and manages Netlify sites.

**Definition Interface:**
```typescript
interface SiteDefinition {
  secret_ref: string;      // Secret reference for API token
  name: string;            // Site name
  team_slug?: string;      // Team slug (optional)
  custom_domain?: string;  // Custom domain (optional)
  password?: string;       // Password protection (optional)
  /**
   * Force SSL (optional)
   * @description Whether to force SSL for the site
   * @note Requires SSL certificate to be provisioned first
   */
  force_ssl?: boolean;
}
```

**State Interface:**
```typescript
interface SiteState {
  id?: string;            // Site ID
  name?: string;          // Site name
  url?: string;           // Site URL
  admin_url?: string;     // Admin URL
  custom_domain?: string; // Custom domain
  state?: string;         // Site state
  existing?: boolean;     // Whether site existed before
}
```

**Custom Actions:**
- `get-site` - Get current site information
- `list-deploys` - List all deployments for the site
- `create-deploy` - Create a new deployment
- `get-deploy` - Get specific deployment details
- `restore-deploy` - Restore a previous deployment

### 2. Deploy Entity

Manages Netlify deployments.

**Definition Interface:**
```typescript
interface DeployDefinition {
  secret_ref: string;        // Secret reference for API token
  site_id: string;           // Site ID to deploy to
  dir?: string;              // Deploy directory (optional)
  functions_dir?: string;    // Functions directory (optional)
  prod?: boolean;            // Production deploy (optional)
  draft?: boolean;           // Draft deploy (optional)
  branch?: string;           // Git branch (optional)
  commit_ref?: string;       // Git commit reference (optional)
}
```

**State Interface:**
```typescript
interface DeployState {
  id?: string;              // Deploy ID
  site_id?: string;         // Site ID
  deploy_url?: string;      // Deploy URL
  state?: string;           // Deploy state
  error_message?: string;   // Error message if failed
  created_at?: string;      // Creation timestamp
  published_at?: string;    // Publication timestamp
  deploy_time?: number;     // Deploy time in seconds
  framework?: string;       // Detected framework
  function_count?: number;  // Number of functions
  existing?: boolean;       // Whether deploy existed before
}
```

**Custom Actions:**
- `get-deploy` - Get deployment details
- `cancel-deploy` - Cancel a deployment
- `retry-deploy` - Retry a failed deployment
- `lock-deploy` - Lock a deployment
- `unlock-deploy` - Unlock a deployment
- `get-deploy-log` - Get deployment logs

### 3. Form Entity

Manages Netlify forms and form submissions.

**Definition Interface:**
```typescript
interface FormDefinition {
  secret_ref: string;    // Secret reference for API token
  site_id: string;       // Site ID that contains the form
  name: string;          // Form name
}
```

**State Interface:**
```typescript
interface FormState {
  id?: string;           // Form ID
  site_id?: string;      // Site ID
  name?: string;         // Form name
  paths?: string[];      // Form paths
  submission_count?: number; // Number of submissions
  fields?: Array<{       // Form fields
    name: string;
    type: string;
  }>;
  created_at?: string;   // Creation timestamp
  existing?: boolean;    // Whether form existed before
}
```

**Custom Actions:**
- `get-form` - Get form details
- `list-submissions` - List form submissions
- `get-submission` - Get specific submission details
- `mark-submission-spam` - Mark submission as spam
- `mark-submission-ham` - Mark submission as verified
- `delete-submission` - Delete a submission
- `list-all-forms` - List all forms on the site

## Usage Examples

### Basic Site Management

```yaml
namespace: my-netlify

# Create a site
my-site:
  defines: netlify/site
  secret_ref: netlify-api-token
  name: my-awesome-site
  custom_domain: mydomain.com
  # force_ssl: true  # Only enable if SSL certificate is provisioned
  permitted-secrets:
    netlify-api-token: true
  services:
    data:
      protocol: custom
```

### Deployment Management

```yaml
# Create a deployment
my-deploy:
  defines: netlify/deploy
  secret_ref: netlify-api-token
  site_id: <- connection-target("site") entity-state get-member("id")
  dir: ./dist
  prod: true
  permitted-secrets:
    netlify-api-token: true
  connections:
    site:
      runnable: my-netlify/my-site
      service: data
  depends:
    wait-for:
      runnables:
        - my-netlify/my-site
      timeout: 120
```

### Form Management

```yaml
# Manage a form
contact-form:
  defines: netlify/form
  secret_ref: netlify-api-token
  site_id: <- connection-target("site") entity-state get-member("id")
  name: contact
  permitted-secrets:
    netlify-api-token: true
  connections:
    site:
      runnable: my-netlify/my-site
      service: data
  depends:
    wait-for:
      runnables:
        - my-netlify/my-site
      timeout: 120
```

### Complete Stack Example

```yaml
namespace: my-web-app

# Netlify site
my-site:
  defines: netlify/site
  secret_ref: netlify-api-token
  name: my-web-app
  custom_domain: myapp.com
  force_ssl: true
  permitted-secrets:
    netlify-api-token: true
  services:
    data:
      protocol: custom

# Production deployment
prod-deploy:
  defines: netlify/deploy
  secret_ref: netlify-api-token
  site_id: <- connection-target("site") entity-state get-member("id")
  dir: ./dist
  prod: true
  permitted-secrets:
    netlify-api-token: true
  connections:
    site:
      runnable: my-web-app/my-site
      service: data
  depends:
    wait-for:
      runnables:
        - my-web-app/my-site
      timeout: 120

# Contact form management
contact-form:
  defines: netlify/form
  secret_ref: netlify-api-token
  site_id: <- connection-target("site") entity-state get-member("id")
  name: contact
  permitted-secrets:
    netlify-api-token: true
  connections:
    site:
      runnable: my-web-app/my-site
      service: data
  depends:
    wait-for:
      runnables:
        - my-web-app/my-site
      timeout: 120
```

## Custom Actions Usage

### Site Actions

```bash
# Get site information
monk do my-netlify/my-site/get-site

# List deployments
monk do my-netlify/my-site/list-deploys

# Create a new deployment
monk do my-netlify/my-site/create-deploy --args dir=./build,prod=true

# Get specific deployment
monk do my-netlify/my-site/get-deploy --args deploy_id=abc123

# Restore a deployment
monk do my-netlify/my-site/restore-deploy --args deploy_id=abc123
```

### Deploy Actions

```bash
# Get deployment details
monk do my-netlify/my-deploy/get-deploy

# Cancel deployment
monk do my-netlify/my-deploy/cancel-deploy

# Retry failed deployment
monk do my-netlify/my-deploy/retry-deploy

# Lock deployment
monk do my-netlify/my-deploy/lock-deploy

# Get deployment logs
monk do my-netlify/my-deploy/get-deploy-log
```

### Form Actions

```bash
# Get form details
monk do my-netlify/contact-form/get-form

# List submissions
monk do my-netlify/contact-form/list-submissions --args page=1,per_page=10

# Get specific submission
monk do my-netlify/contact-form/get-submission --args submission_id=abc123

# Mark submission as spam
monk do my-netlify/contact-form/mark-submission-spam --args submission_id=abc123

# List all forms on site
monk do my-netlify/contact-form/list-all-forms
```

## Testing

### Environment Setup

Create a `.env` file in the test directory:

```bash
# src/netlify/test/.env
NETLIFY_API_TOKEN=your-actual-netlify-api-token-here
TEST_SITE_NAME=test-site-123
TEST_CUSTOM_DOMAIN=test.example.com
```

### Running Tests

```bash
# Test with automatic environment loading
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test

# Test with verbose output
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --verbose

# Test specific test file
sudo INPUT_DIR=./src/netlify/ ./monkec.sh test --test-file test/site-integration.test.yaml
```

## Architecture

The Netlify entities follow a common architecture pattern:

### Base Classes and Utilities

- **`netlify-base.ts`**: Contains the `NetlifyEntity` base class that provides:
  - Authentication via Personal Access Token from secrets
  - HTTP client setup with proper headers
  - Standardized error handling
  - Operation waiting utilities
  - Resource existence checking
  - Deletion with existing resource checks

- **`common.ts`**: Contains shared utilities and interfaces:
  - API token retrieval function
  - Common response interfaces
  - Helper functions for validation and formatting
  - Type definitions for Netlify resources

### Entity Inheritance

All Netlify entities extend the `NetlifyEntity` base class and inherit:
- Standard authentication and HTTP client setup
- Common error handling patterns
- Operation waiting functionality
- Resource management utilities

## API Rate Limits

The Netlify API has the following rate limits:
- **General requests**: 500 requests per minute
- **Deployments**: 3 deployments per minute, 100 per day
- **Form submissions**: Varies by plan

The entities include proper error handling for rate limit responses.

## Best Practices

1. **Use Personal Access Tokens**: Store tokens securely in Monk secrets
2. **Handle Rate Limits**: Implement proper retry logic for rate-limited requests
3. **Validate Inputs**: Use the provided validation functions for IDs and parameters
4. **Monitor Deployments**: Use the readiness checks to ensure deployments complete
5. **Clean Up Resources**: Always clean up test resources to avoid conflicts
6. **Use Team Context**: Include team slugs when working with team-specific resources

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify personal access token is valid and not expired
   - Check token has appropriate permissions
   - Ensure token is stored correctly in Monk secrets

2. **Site Not Found**
   - Verify site ID format using validation functions
   - Check if site exists in your Netlify account
   - Ensure token has access to the site

3. **Deployment Failed**
   - Check deployment logs using `get-deploy-log` action
   - Verify build directory exists and contains valid files
   - Check for framework-specific build requirements

4. **Rate Limit Exceeded**
   - Implement exponential backoff in your applications
   - Monitor rate limit headers in responses
   - Consider upgrading your Netlify plan for higher limits

### Debug Commands

```bash
# Enable verbose testing
sudo MONKEC_VERBOSE=true INPUT_DIR=./src/netlify/ ./monkec.sh test --verbose

# Check entity state
monk describe my-netlify/my-site

# View entity logs
monk logs my-netlify/my-site

# Test specific actions
monk do my-netlify/my-site/get-site
```

## Migration from JavaScript

If you're migrating from the existing JavaScript implementation:

1. **Update imports**: Use TypeScript imports instead of `require()`
2. **Type definitions**: Add proper TypeScript interfaces for all data structures
3. **Error handling**: Use the standardized error handling from the base class
4. **Actions**: Use the `@action` decorator for custom actions
5. **Testing**: Use the new testing framework with YAML test files

The TypeScript implementation provides better type safety, improved error handling, and more comprehensive testing capabilities. 