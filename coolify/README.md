# Coolify example

Creates coolify selft-hosted instance on selected provider using Monk.
Another instance is joined to the first one using api with token auth.

## Usage example

See example.yaml file

First, need to set secrets for admin user password:
Email has to be real and pass requirements and password has to pass the requirements:
https://coolify.io/docs/knowledge-base/create-root-user-with-env

```bash
monk load MANIFEST
monk load example.yaml

monk secrets add -r coolify-example/root-node root-email='test@monk.io'
monk secrets add -r coolify-example/root-node root-password='2ekUr_fEgyi'

monk run coolify-example/stack
```

Then, open the browser and go to the url of the first instance and use email/password from above.

Theoretically, in place of root-node, apiUrl and token can be used to connect to cloud coolify instance (may need some adjustments).