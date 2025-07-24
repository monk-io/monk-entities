{
    "FunctionName": "docker-test-function",
    "FunctionArn": "arn:aws:lambda:us-east-1:065217599764:function:docker-test-function",
    "Runtime": "python3.9",
    "Role": "arn:aws:iam::065217599764:role/lambda-execution-role",
    "Handler": "test_lambda_function.lambda_handler",
    "CodeSize": 297,
    "Description": "Test function deployed via Docker container",
    "Timeout": 30,
    "MemorySize": 128,
    "LastModified": "2025-07-23T18:04:05.245+0000",
    "CodeSha256": "RNEEHHSW5W8nzux3br3sIQ+bEIc2e0edh6ID6ufi7xM=",
    "Version": "$LATEST",
    "TracingConfig": {
        "Mode": "PassThrough"
    },
    "RevisionId": "fb54d99a-9f91-4c7d-87ef-4140f48ec23a",
    "State": "Pending",
    "StateReason": "The function is being created.",
    "StateReasonCode": "Creating",
    "PackageType": "Zip",
    "Architectures": [
        "x86_64"
    ],
    "EphemeralStorage": {
        "Size": 512
    },
    "SnapStart": {
        "ApplyOn": "None",
        "OptimizationStatus": "Off"
    },
    "RuntimeVersionConfig": {
        "RuntimeVersionArn": "arn:aws:lambda:us-east-1::runtime:af29e10439856e364100c5dec1ce9c55d44feb2772258f7a7e480a95474aa18f"
    },
    "LoggingConfig": {
        "LogFormat": "Text",
        "LogGroup": "/aws/lambda/docker-test-function"
    }
}