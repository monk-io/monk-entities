# DO functions example

## Usage

1. Load
```
monk load MANIFEST
```

```
monk load example.yaml
```

2. Create secrets

```
monk secrets add -g default-do-api-token="YOUR_DO_API_TOKEN"
```

4. Deploy example stack using Monk.

```
monk run do-function-example/python-function
```