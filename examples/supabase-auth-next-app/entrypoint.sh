#!/bin/sh
# ========================================
# Next.js Runtime Environment Variable Injection
# This script injects runtime environment variables into the pre-built Next.js app
# ========================================

set -e

echo "🚀 Starting Supabase Next.js Auth App..."
echo "📋 Injecting runtime environment variables..."

# Check if required environment variables are set
if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  echo "❌ ERROR: NEXT_PUBLIC_SUPABASE_URL environment variable is required"
  exit 1
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" ]; then
  echo "❌ ERROR: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY environment variable is required"
  exit 1
fi

echo "✅ Supabase URL: $NEXT_PUBLIC_SUPABASE_URL"
echo "✅ Supabase Key: ${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:0:20}..."

# Find all JavaScript files in the Next.js build and replace placeholder values
# This approach works with Next.js standalone builds
find /app -name "*.js" -type f -exec grep -l "__NEXT_PUBLIC_SUPABASE_URL__\|__NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__" {} \; | while read -r file; do
  echo "📝 Updating: $file"
  # Replace placeholders with actual environment variable values
  sed -i "s|__NEXT_PUBLIC_SUPABASE_URL__|$NEXT_PUBLIC_SUPABASE_URL|g" "$file"
  sed -i "s|__NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY__|$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|g" "$file"
done

echo "✅ Environment variables injected successfully"
echo "▶️ Starting Next.js server..."

# Start the Next.js application
exec node server.js
