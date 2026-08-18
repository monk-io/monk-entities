#!/bin/bash

set -e

# Build script for MonkEC modules
# Usage: ./build.sh [module1] [module2] ...

# Default modules if none specified.
# No quotes around expansion to allow word splitting for the default value.
modules=(${@:-monkec monk-bridge monk-endpoints mongodb-atlas neon netlify vercel aws-dynamo-db aws-s3 aws-sqs aws-iam aws-lambda aws-rds digitalocean-spaces digitalocean-database digitalocean-domains digitalocean-agent digitalocean-container-registry cloudflare aws-api-gateway aws-ec2 aws-cloudfront aws-ses aws-sns aws-neptune aws-glue-schema-registry aws-route53 digitalocean-monitoring stripe azure-cosmosdb azure-storage-account azure-eventhubs azure-servicebus supabase gcp clerk workos resend hetzner-storage-box runpod})

# Sanity check: when running the full default build (no module args), make
# sure every `dist/<name>` listed in the top-level MANIFEST also appears in
# the module list, and vice versa. Drift here causes "missing entity" bugs
# at load time that are hard to diagnose. Run `./build.sh foo` to bypass.
if [ "$#" -eq 0 ]; then
    manifest_modules=$(grep -oE 'dist/[a-z0-9-]+' MANIFEST | sed 's|dist/||' | sort -u)
    build_modules=$(printf '%s\n' "${modules[@]}" | sort -u)
    missing_in_build=$(comm -23 <(echo "$manifest_modules") <(echo "$build_modules"))
    missing_in_manifest=$(comm -13 <(echo "$manifest_modules") <(echo "$build_modules"))
    if [ -n "$missing_in_build" ] || [ -n "$missing_in_manifest" ]; then
        echo "ERROR: build.sh and MANIFEST are out of sync." >&2
        [ -n "$missing_in_build" ] && \
            echo "  In MANIFEST but missing from build.sh modules:" >&2 && \
            echo "$missing_in_build" | sed 's/^/    - /' >&2
        [ -n "$missing_in_manifest" ] && \
            echo "  In build.sh modules but missing from MANIFEST DIRS (as 'dist/<name>'):" >&2 && \
            echo "$missing_in_manifest" | sed 's/^/    - /' >&2
        exit 1
    fi
fi

set -x

for module in "${modules[@]}"; do
    echo "Building $module..."
    INPUT_DIR="./src/$module/" OUTPUT_DIR="./dist/$module/" ./monkec.sh compile
done
