# Go Lambda Test Function

This is a simple Go Lambda function for testing the AWS Lambda entity functionality.

## Dependencies

- `github.com/aws/aws-lambda-go`: AWS Lambda Go runtime library

## Building

1. Install the lambda package
```
go mod download github.com/aws/aws-lambda-go
```

2. Build 
```
GOOS=linux GOARCH=amd64 go build -tags lambda.norpc -o bootstrap main.go
```

3. Create a deployment package (not required, will be created by entity)
```
zip myFunction.zip bootstrap
```