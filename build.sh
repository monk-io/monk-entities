#!/bin/bash

set -ex

# Build script for MonkEC modules
# Usage: ./build.sh [module1] [module2] ...

# Default modules if none specified.
# No quotes around expansion to allow word splitting for the default value.
modules=(${@:-monkec mongodb-atlas neon netlify vercel aws-dynamo-db aws-s3 aws-sqs aws-iam aws-lambda aws-rds digitalocean-spaces digitalocean-database digitalocean-domains digitalocean-agent digitalocean-container-registry cloudflare aws-api-gateway aws-ec2 aws-cloudfront digitalocean-monitoring})

for module in "${modules[@]}"; do
    echo "Building $module..."
    INPUT_DIR="./src/$module/" OUTPUT_DIR="./dist/$module/" ./monkec.sh compile
done
