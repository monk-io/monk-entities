#!/bin/bash

# ECR Access Test Script
# Tests if current AWS credentials can access the ECR image

ECR_URI="065217599764.dkr.ecr.us-east-1.amazonaws.com/monk/lambda-test:latest"
REGION="us-east-1"
REPOSITORY="monk/lambda-test"

echo "🔍 Testing ECR access for Lambda container deployment..."
echo "ECR URI: $ECR_URI"
echo "Region: $REGION"
echo ""

# Test 1: ECR Authorization
echo "1️⃣ Testing ECR authorization token..."
if aws ecr get-authorization-token --region $REGION >/dev/null 2>&1; then
    echo "   ✅ ECR authorization: SUCCESS"
else
    echo "   ❌ ECR authorization: FAILED"
    echo "   Missing permission: ecr:GetAuthorizationToken"
fi

# Test 2: Repository access
echo ""
echo "2️⃣ Testing repository access..."
if aws ecr describe-repositories --repository-names $REPOSITORY --region $REGION >/dev/null 2>&1; then
    echo "   ✅ Repository access: SUCCESS"
else
    echo "   ❌ Repository access: FAILED"
    echo "   Repository '$REPOSITORY' not found or no permission"
fi

# Test 3: Image access
echo ""
echo "3️⃣ Testing image access..."
if aws ecr describe-images --repository-name $REPOSITORY --region $REGION >/dev/null 2>&1; then
    echo "   ✅ Image access: SUCCESS"
    
    # Show available images
    echo "   📋 Available images:"
    aws ecr describe-images --repository-name $REPOSITORY --region $REGION \
        --query 'imageDetails[*].[imageTags[0],imageDigest,imagePushedAt]' \
        --output table 2>/dev/null || echo "   (Could not list images)"
else
    echo "   ❌ Image access: FAILED"
    echo "   Missing permission: ecr:DescribeImages"
fi

# Test 4: Lambda permissions
echo ""
echo "4️⃣ Testing Lambda permissions..."
if aws lambda list-functions --region $REGION >/dev/null 2>&1; then
    echo "   ✅ Lambda access: SUCCESS"
else
    echo "   ❌ Lambda access: FAILED"
    echo "   Missing permission: lambda:ListFunctions"
fi

# Test 5: IAM permissions
echo ""
echo "5️⃣ Testing IAM permissions..."
if aws iam get-user >/dev/null 2>&1 || aws sts get-caller-identity >/dev/null 2>&1; then
    echo "   ✅ IAM access: SUCCESS"
    echo "   👤 Current identity:"
    aws sts get-caller-identity 2>/dev/null || echo "   (Could not get caller identity)"
else
    echo "   ❌ IAM access: FAILED"
fi

echo ""
echo "🏁 Test completed!"
echo ""
echo "📝 If any tests failed, add the corresponding permissions to your AWS credentials."
echo "📋 See required-permissions.json for complete permission requirements."
