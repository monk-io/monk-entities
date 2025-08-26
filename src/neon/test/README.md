# Neon Database Integration Tests

This directory contains integration tests for Neon Database entities using Monk.

## Test Structure

The tests use a **stack integration approach** that creates a complete Neon database stack in sequential order:
- **Project**: Creates a Neon project with PostgreSQL 17
- **Branch**: Creates a development branch (waits for project to be ready)
- **Role**: Creates a database user with login permissions (waits for branch to be ready)
- **Compute**: Sets up read-write compute resources (waits for role to be ready)
- **Connection Test**: Validates the complete setup with a real PostgreSQL connection

The resources are created sequentially to avoid conflicts with Neon's operation scheduling.

## Key Features

### Project Reuse
The project entity **reuses existing projects** if they have the same name, similar to the [official Monk entities implementation](https://raw.githubusercontent.com/monk-io/monk-entities/refs/heads/main/neon/project-sync.js). This helps avoid 423 "Locked" errors that can occur when trying to create too many projects.

### Fixed Project Name
Tests use a fixed project name (`monkec-test-project`) that can be reused across test runs. This simplifies testing while still preventing conflicts with other projects.

### Readiness Checks
All entities include robust readiness checks that ensure resources are fully ready before dependent entities try to use them:

- **Project**: Checks operation status via API call, then verifies project accessibility
- **Branch**: Checks operation status via API call, then verifies branch accessibility  
- **Compute**: Checks operation status via API call, then verifies compute accessibility
- **Role**: Checks operation status via API call, then verifies role accessibility

This prevents timing issues like "project already has running conflicting operations" errors by properly tracking and waiting for operations to complete.

### Environment Variables
The test automatically loads environment variables from a `.env` file in this directory. Create a `.env` file with:

```bash
NEON_API_KEY=your_neon_api_key_here
```

## Running the Tests

### Prerequisites
1. **Neon Account**: You need a Neon account with API access
2. **API Key**: Generate an API key from the Neon Console
3. **Environment Setup**: Create a `.env` file with your API key

### Test Execution
```bash
# From the repository root (requires access to Monk socket)
sudo INPUT_DIR=./src/neon/ ./monkec.sh test --test-file test/stack-integration.test.yaml

# With verbose output for debugging
sudo INPUT_DIR=./src/neon/ ./monkec.sh test --test-file test/stack-integration.test.yaml --verbose
```

## Troubleshooting

### 423 "Locked" Errors
If you encounter 423 errors:

1. **Check Account Status**: Ensure your Neon account is active and not suspended
2. **Free Tier Limits**: Free tier accounts have limits on concurrent projects
3. **Clean Up Resources**: Delete unused projects in the Neon Console
4. **Wait and Retry**: Some operations require time between attempts
5. **Check Billing**: Ensure your account has proper billing setup

### Project Reuse Behavior
- The test will reuse existing projects with the same name (`monkec-test-project`)
- This prevents 423 errors from trying to create duplicate projects
- You can manually delete the project in the Neon Console if needed
- The project will be recreated on the next test run

### Timing Issues
- **Readiness Checks**: All entities now include robust readiness checks to prevent timing issues
- **API Polling**: Entities poll their status via API calls until ready before proceeding
- **Dependencies**: Proper dependency management ensures resources are ready before dependent entities start
- **Error Prevention**: This prevents "project already has running conflicting operations" errors

### Debug Output
The test includes detailed debug output showing:
- Project creation/reuse decisions
- API request/response details
- Connection test results
- Resource cleanup status

## Test Validation

The test validates:
- ✅ Project creation/reuse
- ✅ Branch creation
- ✅ Compute resource setup
- ✅ Database user creation
- ✅ Real PostgreSQL connection
- ✅ Data insertion and querying
- ✅ Resource cleanup

## Files

- `stack-integration.test.yaml` - Main test file
- `stack-template.yaml` - Stack definition template
- `README.md` - This documentation
- `.env.example` - Example environment file 