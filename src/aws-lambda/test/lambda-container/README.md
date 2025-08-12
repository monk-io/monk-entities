### Build lambda image
Build the Docker image with the docker build command. The following example names the image docker-image and gives it the test tag. To make your image compatible with Lambda, you must use the --provenance=false option.

```bash
docker buildx build --platform linux/amd64 --provenance=false -t 065217599764.dkr.ecr.us-east-1.amazonaws.com/monk/lambda-test:latest .

docker login --username AWS 065217599764.dkr.ecr.us-east-1.amazonaws.com

docker push 065217599764.dkr.ecr.us-east-1.amazonaws.com/monk/lambda-test:latest
```

> [!NOTE]
> The command specifies the --platform linux/amd64 option to ensure that your container is compatible with the Lambda execution environment regardless of the architecture of your build machine. If you intend to create a Lambda function using the ARM64 instruction set architecture, be sure to change the command to use the --platform linux/arm64 option instead.