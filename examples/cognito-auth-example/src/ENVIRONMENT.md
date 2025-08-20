# Environment Configuration

This document explains how to configure the React frontend app with environment variables.

## API Server Configuration

The frontend app can be configured to connect to different API servers using environment variables.

### Setting the API Base URL

Create a `.env` file in the `src/` directory with the following content:

```bash
# API Server Configuration
REACT_APP_API_BASE_URL=http://localhost:3001
```

### Environment Variable Options

| Environment | REACT_APP_API_BASE_URL | Description |
|-------------|------------------------|-------------|
| **Development** | `http://localhost:3001` | Local development server |
| **Docker Compose** | `http://api:3001` | Docker service name |
| **Production** | `https://api.yourdomain.com` | Production API server |
| **Local Network** | `http://192.168.1.100:3001` | Local network IP |

### Example .env Files

#### Development (.env)
```bash
REACT_APP_API_BASE_URL=http://localhost:3001
```

#### Docker Compose (.env)
```bash
REACT_APP_API_BASE_URL=http://api:3001
```

#### Production (.env)
```bash
REACT_APP_API_BASE_URL=https://api.yourdomain.com
```

## How It Works

1. **Environment Variable**: The app reads `REACT_APP_API_BASE_URL` from environment variables
2. **Fallback**: If not set, defaults to `http://localhost:3001`
3. **Build Time**: React apps embed environment variables at build time
4. **Prefix Required**: Only variables starting with `REACT_APP_` are accessible

## Setting Environment Variables

### Method 1: .env File (Recommended)
```bash
# Create .env file in src/ directory
echo "REACT_APP_API_BASE_URL=http://localhost:3001" > .env
```

### Method 2: Command Line
```bash
# Set for current session
export REACT_APP_API_BASE_URL=http://localhost:3001
npm start

# Or inline
REACT_APP_API_BASE_URL=http://localhost:3001 npm start
```

### Method 3: Docker Environment
```yaml
# docker-compose.yml
services:
  frontend:
    build: ./src
    environment:
      - REACT_APP_API_BASE_URL=http://api:3001
```

## Verification

The current API configuration is displayed in the **API Demo** page:

1. Navigate to the API Demo page
2. Look for the "API Configuration" section
3. Verify the Base URL matches your expected configuration

## Troubleshooting

### Issue: API calls fail with CORS errors
**Solution**: Ensure the API server URL is correct and the server allows CORS from your frontend domain.

### Issue: Environment variable not working
**Solutions**:
1. Ensure the variable starts with `REACT_APP_`
2. Restart the development server after changing .env
3. Check that .env is in the correct directory (src/)
4. Verify no spaces around the `=` sign

### Issue: Different behavior in production
**Solution**: Environment variables are embedded at build time. Rebuild the app after changing variables:
```bash
npm run build
```

## Security Notes

- Never put sensitive information in REACT_APP_ variables
- These variables are publicly accessible in the built app
- Use server-side configuration for sensitive API keys
- The API server should handle authentication and authorization
