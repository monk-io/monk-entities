AWS API Gateway (HTTP API v2)

Provides an `api-gateway` entity to create HTTP APIs and route to Lambda via AWS Proxy integrations.

Example entity:

```yaml
api-gateway:
  defines: aws-api-gateway/api-gateway
  region: us-east-1
  name: lambda-dynamo-api
  protocol_type: HTTP
  routes:
    - path: /users
      method: ANY
      integration:
        type: lambda
        function: <- connection-target("lambda") entity-state get-member("function_arn")
  services:
    api:
      protocol: custom
  connections:
    lambda:
      runnable: lambda-dynamo-example/lambda-dynamo-function
      service: function
  depends:
    wait-for:
      runnables:
        - lambda-dynamo-example/lambda-dynamo-function
      timeout: 60
```

State exports:
- api_id
- api_endpoint

Required permissions for AWS key:
```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "apigateway:*",
            "Resource": "arn:aws:apigateway:*::/*"
        }
    ]
}
```

Notes:
- Uses API Gateway v2 endpoints and Lambda proxy integrations (payload format v2.0).
- Creates `$default` stage with auto-deploy.

