# 🔐 AWS Cognito Authentication Example

A comprehensive demonstration of AWS Cognito authentication integration using **Monk's AWS Cognito entities**. This example showcases modern authentication flows including user registration, login, social authentication, JWT token validation, and federated AWS resource access.

## 🌟 Features

### 🔑 **Complete Authentication System**
- **Multiple Login Methods**: Embedded UI, Cognito Hosted UI, and Social Login
- **User Registration & Login** via email/password authentication
- **Social Login** with Google (configurable for Facebook, Apple, etc.)
- **Email Verification** and password policies
- **JWT Token Management** with automatic refresh
- **Multi-Factor Authentication** support

### ☁️ **AWS Integration**
- **Federated AWS Access** via Identity Pool
- **Temporary AWS Credentials** for secure resource access
- **Protected API Endpoints** with JWT verification
- **Real-time Token Validation** using Cognito JWKS

### 🏗️ **Infrastructure as Code**
- **5 Cognito Entities** deployed via Monk
- **Automated Infrastructure** provisioning
- **Environment Configuration** management
- **Scalable Architecture** patterns

## 🏗️ Architecture

This example demonstrates a complete Cognito setup with all 5 entity types:

```
┌─────────────────────────────────────────────────────┐
│                 AWS Cognito Setup                   │
├─────────────────────────────────────────────────────┤
│  1. User Pool         │ User management & auth      │
│  2. User Pool Domain  │ Hosted UI (login pages)    │
│  3. User Pool Client  │ OAuth/OIDC app config      │
│  4. Identity Provider │ Google social login        │
│  5. Identity Pool     │ Federated AWS access       │
└─────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐          ┌─────────────────────┐
│  React Frontend     │          │  Express.js API     │
│  (Port 3000)        │◄────────►│  (Port 3001)        │
│                     │          │                     │
│  • Login/Signup     │          │  • JWT Validation   │
│  • Profile Mgmt     │          │  • Protected Routes │
│  • AWS Resources    │          │  • JWKS Integration │
│  • API Testing      │          │  • User Data API    │
└─────────────────────┘          └─────────────────────┘
```

## 🔐 Authentication Methods

This example demonstrates **three different authentication approaches**:

### 1. **📧 Embedded UI (Amplify Authenticator)**
- **What**: Login form embedded directly in the React app
- **Flow**: User stays on your app → Fills form → Authenticated
- **Best for**: Seamless user experience, custom styling
- **Implementation**: Uses `@aws-amplify/ui-react` Authenticator component

### 2. **🌐 Cognito Hosted UI (COGNITO Provider)**
- **What**: AWS-hosted login pages with professional styling
- **Flow**: User clicks button → Redirects to Cognito → Redirects back authenticated
- **Best for**: Quick setup, consistent AWS branding, enterprise features
- **Implementation**: Uses `signInWithRedirect({ provider: 'COGNITO' })`

### 3. **🔍 Social Login (External Providers)**
- **What**: Login through third-party providers (Google, Facebook, etc.)
- **Flow**: User clicks social button → Provider OAuth → Cognito → Back to app
- **Best for**: Reducing friction, leveraging existing accounts
- **Implementation**: Uses Identity Provider entities + `signInWithRedirect({ provider: 'Google' })`

## 🚀 Quick Start

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **Monk CLI** installed and configured
3. **Google OAuth Credentials** (for social login)
4. **AWS IAM Permissions** for Cognito services

### Step 1: Configure Google OAuth (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3000/callback`

### Step 2: Update Configuration

Edit `cognito-auth-example.yaml` with your Google credentials:

```yaml
google-provider:
  provider_details:
    client_id: YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com
    client_secret: YOUR_GOOGLE_CLIENT_SECRET
```

### Step 3: Configure API Server (Optional)

The frontend can be configured to connect to different API servers using environment variables:

```bash
# Navigate to frontend directory
cd src/

# Create environment configuration
echo "REACT_APP_API_BASE_URL=http://localhost:3001" > .env

# Alternative configurations:
# echo "REACT_APP_API_BASE_URL=http://api:3001" > .env              # Docker Compose
# echo "REACT_APP_API_BASE_URL=https://api.yourdomain.com" > .env   # Production
```

See `src/ENVIRONMENT.md` for detailed configuration options.

### Step 4: Deploy Infrastructure

```bash
# Load and run the complete Cognito setup
monk load cognito-auth-example.yaml
monk run cognito-auth-example
```

### Step 5: Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001/api/public/health

## 🐳 Alternative: Docker Compose Setup

For local development and testing, you can also run the application using Docker Compose:

### Quick Docker Setup

```bash
# 1. Get Cognito configuration from existing deployment
monk describe cognito-auth-example/user-pool
monk describe cognito-auth-example/web-app-client
# ... (get all required values)

# 2. Configure environment
cp docker.env.example .env
# Edit .env with your actual Cognito values

# 3. Run with Docker Compose
docker compose up --build

# 4. Access application
# Frontend: http://localhost:3000
# Backend: http://localhost:3001/api/public/health
```

📖 **See [DOCKER-COMPOSE.md](DOCKER-COMPOSE.md) for detailed Docker setup instructions.**

## 📱 Application Features

### 🏠 **Home Page**
- Authentication options (Email/Password, Google)
- Infrastructure overview
- Feature demonstrations

### 📊 **Dashboard** (Authenticated)
- User profile information
- JWT token details (ID and Access tokens)
- Session information
- Security features overview

### 👤 **Profile Management** (Authenticated)
- View/edit user attributes
- Account security status
- Profile statistics

### ☁️ **AWS Resources** (Authenticated)
- Federated AWS credentials display
- Simulated AWS service calls (S3, DynamoDB, Lambda)
- Credential expiration tracking
- Security features explanation

### 🔌 **API Demo** (Authenticated)
- Test public and protected endpoints
- JWT token validation demonstration
- Real-time API response testing
- Backend implementation examples

## 🔧 Backend API

The Express.js backend demonstrates production-ready JWT validation:

### Endpoints

| Endpoint | Type | Description |
|----------|------|-------------|
| `GET /api/public/health` | Public | Health check and API info |
| `GET /api/public/info` | Public | Service information |
| `GET /api/protected/profile` | Protected | User profile with JWT claims |
| `GET /api/protected/user-data` | Protected | Simulated user data |
| `GET /api/protected/token-info` | Protected | Token analysis |

### JWT Verification Process

1. **Extract Bearer Token** from Authorization header
2. **Decode JWT Header** to get Key ID (kid)
3. **Fetch Public Key** from Cognito JWKS endpoint
4. **Verify Signature** using RS256 algorithm
5. **Validate Claims** (issuer, audience, expiration)
6. **Check Token Type** (must be access token)

## 🛡️ Security Features

### 🔐 **Authentication Security**
- **Password Policies** (length, complexity requirements)
- **Email Verification** mandatory
- **Token Expiration** (configurable timeouts)
- **Automatic Token Refresh** 

### 🎯 **Authorization Security**
- **JWT Signature Verification** using Cognito public keys
- **Audience Validation** (client ID verification)
- **Issuer Validation** (Cognito User Pool verification)
- **Token Type Validation** (access vs ID tokens)

### ☁️ **AWS Security**
- **Temporary Credentials** (auto-expiring)
- **Scoped Permissions** (least privilege access)
- **Federated Identity** (no long-term AWS keys)
- **Role-based Access Control**

## 🏗️ Monk Entities Used

This example showcases all 5 AWS Cognito entities:

### 1. **User Pool** (`aws-cognito/user-pool`)
```yaml
user-pool:
  defines: aws-cognito/user-pool
  pool_name: CognitoAuthExample
  username_attributes: [email]
  password_policy:
    minimum_length: 8
    require_uppercase: true
```

### 2. **User Pool Domain** (`aws-cognito/user-pool-domain`)
```yaml
auth-domain:
  defines: aws-cognito/user-pool-domain
  domain: cognito-auth-demo-2025
  user_pool_id: <- `user-pool.user_pool_id`
```

### 3. **User Pool Client** (`aws-cognito/user-pool-client`)
```yaml
web-app-client:
  defines: aws-cognito/user-pool-client
  client_name: CognitoAuthWebApp
  supported_identity_providers: [COGNITO, Google]
  callback_urls: [http://localhost:3000/callback]
```

### 4. **Identity Provider** (`aws-cognito/identity-provider`)
```yaml
google-provider:
  defines: aws-cognito/identity-provider
  provider_name: Google
  provider_type: Google
  provider_details:
    client_id: your-google-client-id
```

### 5. **Identity Pool** (`aws-cognito/identity-pool`)
```yaml
identity-pool:
  defines: aws-cognito/identity-pool
  identity_pool_name: CognitoAuthExampleIdentityPool
  allow_unauthenticated_identities: false
```

## 🔧 Development

### Production Deployment (Docker)

The application uses optimized Docker containers for production deployment:

```bash
# Deploy via Monk (builds Docker images automatically)
monk load cognito-auth-example.yaml
monk run cognito-auth-example

# Manual Docker build (if needed)
cd src/
docker build -t cognito-auth-frontend .

cd ../api/
docker build -t cognito-auth-backend .
```

### Local Development

```bash
# Frontend (React)
cd src/
npm install
npm start  # Runs on port 3000

# Backend (Express.js)
cd api/
npm install
npm start  # Runs on port 3001
```

### Docker Features

#### **Frontend Container** (`src/Dockerfile`)
- **Multi-stage build** with React build optimization
- **Nginx serving** static files with gzip compression
- **API proxy** routing `/api/*` to backend
- **Security headers** and caching policies
- **Health checks** for container monitoring

#### **Backend Container** (`api/Dockerfile`)
- **Multi-stage build** for minimal production image
- **Non-root user** for enhanced security
- **Signal handling** with dumb-init
- **Health checks** for API monitoring
- **Production optimizations**

### Environment Variables

The application uses these environment variables (automatically set by Monk):

```bash
# Frontend (React)
REACT_APP_REGION=us-east-1
REACT_APP_USER_POOL_ID=us-east-1_XXXXXXXXX
REACT_APP_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
REACT_APP_DOMAIN=your-domain-prefix
REACT_APP_IDENTITY_POOL_ID=us-east-1:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX

# Backend (Express.js)
USER_POOL_ID=us-east-1_XXXXXXXXX
REGION=us-east-1
```

## 🧪 Testing

### Manual Testing Flow

1. **Visit** http://localhost:3000
2. **Sign Up** with email and password
3. **Verify Email** (check your inbox)
4. **Sign In** and explore dashboard
5. **Test Google Login** (if configured)
6. **Try API Calls** in the API Demo section
7. **View AWS Credentials** in AWS Resources section

### API Testing with curl

```bash
# Get access token from browser (F12 -> Application -> Local Storage)
TOKEN="your-jwt-access-token"

# Test protected endpoint
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:3001/api/protected/profile
```

## 📚 Learn More

### Related Documentation
- [AWS Cognito Developer Guide](https://docs.aws.amazon.com/cognito/)
- [JWT.io](https://jwt.io/) - JWT token debugging
- [Monk Documentation](https://docs.monk.io/)

### Example Use Cases
- **SaaS Applications** with user management
- **Mobile Apps** with social login
- **API Services** with JWT authentication
- **Enterprise Apps** with federated identity
- **Microservices** with centralized auth

## 🤝 Contributing

This example is part of the Monk entities repository. To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This example is provided under the same license as the Monk entities project.

---

**Built with ❤️ using Monk's AWS Cognito Entities**

For more examples and documentation, visit the [Monk Entities Repository](https://github.com/monk-io/monk-entities).
