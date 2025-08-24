# 🚀 Cognito Auth Example - Deployment Guide

This guide walks you through deploying and testing the complete AWS Cognito authentication example.

## 📋 Prerequisites

### 1. **AWS Setup**
- AWS account with active credentials
- IAM permissions for Cognito services:
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "cognito-idp:*",
          "cognito-identity:*"
        ],
        "Resource": "*"
      }
    ]
  }
  ```

### 2. **Monk Setup**
- Monk CLI installed and configured
- AWS credentials available to Monk
- AWS Cognito entities compiled and available

### 3. **Google OAuth Setup** (Optional)
- Google Cloud Project with OAuth 2.0 credentials
- Authorized redirect URI: `http://localhost:3000/callback`

## 🛠️ Step-by-Step Deployment

### Step 1: Prepare AWS Cognito Entities

```bash
# Build the AWS Cognito entities (if not already done)
cd /path/to/monk-entities
./build.sh aws-cognito

# Verify entities are available
monk list | grep aws-cognito
```

### Step 2: Configure Application

1. **Copy the example** to your working directory:
   ```bash
   cp -r examples/cognito-auth-example /path/to/your/workspace
   cd /path/to/your/workspace/cognito-auth-example
   ```

2. **Update Google OAuth** (if using social login):
   Edit `cognito-auth-example.yaml`:
   ```yaml
   google-provider:
     provider_details:
       client_id: YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
       client_secret: YOUR_GOOGLE_CLIENT_SECRET
   ```

3. **Customize domain name** (optional):
   ```yaml
   auth-domain:
     domain: your-unique-domain-name-2025  # Must be globally unique
   ```

### Step 3: Deploy Infrastructure

```bash
# Load the configuration
monk load cognito-auth-example.yaml

# Start the complete stack
monk run cognito-auth-example
```

This will deploy:
- ✅ User Pool
- ✅ User Pool Domain
- ✅ User Pool Client
- ✅ Identity Provider (Google)
- ✅ Identity Pool
- ✅ React Frontend (port 3000)
- ✅ Express.js API (port 3001)

### Step 4: Wait for Readiness

```bash
# Check status of all components
monk ps

# Wait for domain to become active (can take 5-15 minutes)
monk logs cognito-auth-example/auth-domain

# Check when applications are ready
monk logs cognito-auth-example/web-app
monk logs cognito-auth-example/api-server
```

## 🧪 Testing the Application

### 1. **Access the Frontend**
Open http://localhost:3000 in your browser

### 2. **Test Authentication Flows**

#### **Email/Password Authentication:**
1. Click "📧 Email & Password" on the home page
2. Register with a valid email address
3. Check your email for verification
4. Sign in with your credentials
5. Explore the authenticated sections

#### **Google Social Login:**
1. Click "🔍 Sign in with Google"
2. Complete Google OAuth flow
3. Return to the application

### 3. **Test Application Features**

#### **Dashboard** (`/dashboard`)
- View JWT token information
- Check session details
- Verify user attributes

#### **Profile** (`/profile`)
- View user profile information
- Edit user attributes
- Check account security status

#### **AWS Resources** (`/aws-resources`)
- View federated AWS credentials
- Test simulated AWS service calls
- Check credential expiration

#### **API Demo** (`/api-demo`)
- Test public endpoints (no auth required)
- Test protected endpoints (JWT required)
- View real-time API responses

### 4. **Backend API Testing**

```bash
# Test public endpoint
curl http://localhost:3001/api/public/health

# Test protected endpoint (get token from browser first)
# 1. Open browser developer tools (F12)
# 2. Go to Application tab -> Local Storage
# 3. Find access token in Amplify storage
TOKEN="your-jwt-access-token-here"

curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3001/api/protected/profile
```

## 🔧 Troubleshooting

### Common Issues

#### **1. Domain Creation Failed**
```
Error: Domain name already exists
```
**Solution:** Change the domain name in `cognito-auth-example.yaml` to something unique:
```yaml
auth-domain:
  domain: your-unique-name-2025
```

#### **2. Google OAuth Not Working**
```
Error: Invalid client ID
```
**Solution:** Verify Google OAuth configuration:
- Check client ID and secret in `cognito-auth-example.yaml`
- Ensure redirect URI is configured in Google Cloud Console
- Verify Google+ API is enabled

#### **3. Frontend Not Loading**
```
Error: Cannot connect to backend
```
**Solution:** Check backend API status:
```bash
monk logs cognito-auth-example/api-server
curl http://localhost:3001/api/public/health
```

#### **4. JWT Validation Errors**
```
Error: Invalid token signature
```
**Solution:** 
- Ensure User Pool ID is correctly configured
- Check token expiration
- Verify JWKS endpoint is accessible

### Debug Commands

```bash
# Check all component status
monk ps

# View detailed logs
monk logs cognito-auth-example/user-pool
monk logs cognito-auth-example/auth-domain
monk logs cognito-auth-example/web-app-client
monk logs cognito-auth-example/identity-pool
monk logs cognito-auth-example/web-app
monk logs cognito-auth-example/api-server

# Check entity states
monk describe cognito-auth-example/user-pool
monk describe cognito-auth-example/auth-domain

# Test individual components
monk run cognito-auth-example/user-pool
monk wait cognito-auth-example/auth-domain
```

## 🧹 Cleanup

When finished testing, clean up all resources:

```bash
# Stop all services
monk stop cognito-auth-example

# Remove all resources (careful - this deletes AWS infrastructure)
monk rm cognito-auth-example

# Verify cleanup
monk ps
```

## 📊 Monitoring and Logs

### Application Logs

```bash
# Frontend logs
monk logs cognito-auth-example/web-app

# Backend API logs
monk logs cognito-auth-example/api-server

# Infrastructure logs
monk logs cognito-auth-example/user-pool
monk logs cognito-auth-example/auth-domain
```

### AWS Console Verification

1. **Cognito User Pools**: Check user pool creation and configuration
2. **Cognito Identity Pools**: Verify identity pool and role mappings
3. **CloudWatch Logs**: View authentication events and errors

## 🔐 Security Considerations

### Production Deployment

1. **Use HTTPS** for all endpoints
2. **Configure proper CORS** settings
3. **Set up domain certificates** for custom domains
4. **Enable CloudTrail** for audit logging
5. **Configure proper IAM roles** with minimal permissions
6. **Use environment variables** for all secrets
7. **Enable MFA** for administrative accounts

### Environment Variables for Production

```bash
# Use secure credential management
export AWS_ACCESS_KEY_ID="production-access-key"
export AWS_SECRET_ACCESS_KEY="production-secret-key"

# Use production Google OAuth credentials
export GOOGLE_CLIENT_ID="prod-client-id"
export GOOGLE_CLIENT_SECRET="prod-client-secret"

# Configure production domains
export PRODUCTION_DOMAIN="auth.yourdomain.com"
export FRONTEND_URL="https://app.yourdomain.com"
export API_URL="https://api.yourdomain.com"
```

## 🎯 Next Steps

After successful deployment and testing:

1. **Customize the UI** to match your brand
2. **Add more OAuth providers** (Facebook, Apple, etc.)
3. **Integrate with your existing backend**
4. **Set up monitoring and alerting**
5. **Configure custom domains** for production
6. **Add more sophisticated user management**
7. **Implement role-based access control**

## 📚 Additional Resources

- [AWS Cognito Documentation](https://docs.aws.amazon.com/cognito/)
- [Monk Documentation](https://docs.monk.io/)
- [JWT.io](https://jwt.io/) - Token debugging
- [Google OAuth Setup](https://developers.google.com/identity/protocols/oauth2)

---

**🎉 Congratulations!** You now have a fully functional, production-ready AWS Cognito authentication system deployed via Monk!
