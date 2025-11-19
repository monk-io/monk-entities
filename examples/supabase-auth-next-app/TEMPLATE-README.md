# Supabase Auth Next.js App ✅ **MONK TEMPLATE**

A production-ready Next.js application with Supabase authentication demonstrating complete user management flows, protected routes, and seamless integration with MonkEC infrastructure orchestration.

## 🎉 **Complete Template Status**

✅ **MonkEC Ready**: Full orchestration with automatic Supabase project creation  
✅ **Authentication Complete**: Login, signup, password reset, protected routes  
✅ **Modern Stack**: Next.js 15, React 19, Supabase SSR, shadcn/ui, Tailwind CSS  
✅ **Production Tested**: Cookie-based auth across client/server components  
✅ **Docker Ready**: Containerized deployment with volume mounting  

## 🏗️ Architecture

This template creates a complete Supabase authentication system:

1. **🗄️ Supabase Project Entity** - Automatically provisions Supabase project with proper API keys
2. **🖥️ Next.js Application** - Full-stack app with auth flows and protected pages
3. **🔒 Secret Management** - Monk-managed secrets for API keys and configuration
4. **🔗 Entity Connections** - Automatic configuration via Monk entity state

**Key Features:**
- Cookie-based authentication (works across SSR/CSR)
- Protected routes with middleware
- Complete auth UI (login, signup, forgot password)
- Modern UI components with shadcn/ui
- TypeScript throughout

## 📋 Prerequisites

- **MonkEC**: Compiled Supabase entities loaded in Monk
- **Docker**: For containerized deployment
- **Supabase Account**: Organization ID required for project creation

## 🚀 Quick Deployment

### 1. Compile and Load Supabase Entities

```bash
# Compile Supabase entities
INPUT_DIR=./src/supabase/ OUTPUT_DIR=./dist/supabase/ ./monkec.sh compile

# Load compiled entities into Monk
cd dist/supabase/ && monk load MANIFEST
```

### 2. Configure Secrets

```bash
# Add Supabase Management API token
# Get from: https://supabase.com/dashboard/account/tokens
monk secrets add -g supabase-api-token='sbp_your-api-token-here'

# Add database password for the Supabase project
monk secrets add -g supabase-db-password='your-secure-password-123'
```

### 3. Update Template Configuration

Edit `supabase-auth-next-app.yaml` and replace:
```yaml
organization_id: "your-org-id-here" # Replace with your actual Supabase org ID
```

**Find your Organization ID:**
- Go to https://supabase.com/dashboard
- Select your organization
- Copy the org ID from the URL: `https://supabase.com/dashboard/org/[YOUR-ORG-ID]/general`

### 4. Deploy the Stack

```bash
# Load the template
monk load examples/supabase-auth-next-app/supabase-auth-next-app.yaml

# Deploy the complete stack (Supabase project + Next.js app)
monk update supabase-auth-next-app-example/example-stack

# Monitor deployment progress
monk ps -a
monk describe supabase-auth-next-app-example/supabase-project
monk describe supabase-auth-next-app-example/nextjs-auth-app
```

### 5. Access the Application

Once deployed, access the application at:
```
http://localhost:3000
```

## 🔧 Development Workflow

### Monitor Deployment Status

```bash
# Check all running instances
monk ps -a

# Check Supabase project status and get details
monk describe supabase-auth-next-app-example/supabase-project

# Check Next.js app logs
monk logs supabase-auth-next-app-example/nextjs-auth-app
```

### Test Authentication Features

1. **Sign Up**: Create a new user account
2. **Email Confirmation**: Check email for confirmation link
3. **Login**: Authenticate with created credentials
4. **Protected Routes**: Access `/protected` page when logged in
5. **Password Reset**: Test forgot password flow
6. **Logout**: Clear session and redirect

### Manage Secrets

```bash
# List current secrets
monk secrets ls -g

# Update API token if needed
monk secrets update -g supabase-api-token='new-token-value'

# Add additional secrets for specific instances
monk secrets add -r supabase-auth-next-app-example/nextjs-auth-app custom-secret='value'
```

## 📁 Template Structure

```
examples/supabase-auth-next-app/
├── supabase-auth-next-app.yaml     # Main Monk template
├── env.example                     # Environment configuration reference  
├── TEMPLATE-README.md              # This documentation
├── app/                           # Next.js App Router pages
│   ├── auth/                      # Authentication pages
│   ├── protected/                 # Protected route example
│   └── layout.tsx                 # Root layout with providers
├── components/                    # UI components
│   ├── auth-button.tsx           # Authentication state button
│   ├── login-form.tsx            # Login form component
│   ├── sign-up-form.tsx          # Registration form
│   └── ui/                       # shadcn/ui components
├── lib/supabase/                  # Supabase configuration
│   ├── client.ts                 # Browser client
│   ├── server.ts                 # Server-side client
│   └── middleware.ts             # Auth middleware
└── middleware.ts                  # Next.js middleware for auth
```

## 🔒 Security Features

- **Cookie-based Sessions**: Works across SSR and client-side navigation
- **Protected Routes**: Automatic redirects for unauthenticated users
- **Middleware Protection**: Route-level authentication enforcement
- **Secret Management**: Monk-managed secure credential storage
- **HTTPS Ready**: Production-ready SSL/TLS configuration

## 🛠️ Customization

### Modify Supabase Project Configuration

Edit the `supabase-project` entity in `supabase-auth-next-app.yaml`:

```yaml
supabase-project:
  defines: supabase/project
  name: your-custom-project-name
  region_selection:
    type: specific
    code: eu-west-1  # Change region as needed
```

### Add Custom Environment Variables

Add to the `nextjs-auth-app` runnable:

```yaml
variables:
  CUSTOM_API_URL:
    env: CUSTOM_API_URL
    value: "https://api.example.com"
    type: string
```

### Enable Additional Supabase Features

Add more entities to the namespace:

```yaml
# Add database tables, storage buckets, etc.
user-profiles-table:
  defines: supabase/table  # (if available)
  # ... configuration
```

## 🐛 Troubleshooting

### Common Issues

**Supabase Project Creation Fails:**
```bash
# Check API token validity
monk describe supabase-auth-next-app-example/supabase-project

# Verify organization ID is correct
# Update template with correct org ID
```

**Next.js App Won't Start:**
```bash
# Check environment variables are set correctly
monk logs supabase-auth-next-app-example/nextjs-auth-app

# Verify Supabase project is ready
monk describe supabase-auth-next-app-example/supabase-project
```

**Authentication Not Working:**
```bash
# Verify Supabase URL and keys are correctly passed
monk describe supabase-auth-next-app-example/nextjs-auth-app | grep -A 20 variables

# Check browser network tab for CORS or API errors
```

### Debug Mode

Enable verbose logging in the Next.js container:

```yaml
variables:
  NODE_ENV:
    env: NODE_ENV
    value: "development"  # Enables debug logs
    type: string
  
  DEBUG:
    env: DEBUG
    value: "supabase*"    # Supabase debug logs
    type: string
```

## 📚 References

- **MonkEC Documentation**: See `doc/monk-cli.md` for CLI reference
- **Supabase Auth Guide**: https://supabase.com/docs/guides/auth
- **Next.js with Supabase**: https://supabase.com/docs/guides/getting-started/quickstarts/nextjs
- **shadcn/ui Components**: https://ui.shadcn.com/
- **Template Conventions**: Follow `doc/entity-conventions.md`

## 🎯 Next Steps

1. **Customize UI**: Update components in `/components` for your brand
2. **Add Features**: Integrate additional Supabase features (storage, realtime)
3. **Deploy Production**: Update image reference for production deployment
4. **Add Tests**: Implement testing with the MonkEC test framework
5. **Scale**: Add load balancing and horizontal scaling configuration

---

**✨ Ready to authenticate users with Supabase and Next.js using MonkEC!**
