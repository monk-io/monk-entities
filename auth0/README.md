# Monk example for Auth0 Entity

Using Auth0 Clients(Application) with Monk.

## Usage

See example.yaml for a simple example of how to use Auth0 with Monk.
It creates the following resources:
- Application(Clients)

We'll use Monk CLI to load and run everything:

      # load Entity types and example template
      monk load MANIFEST
      monk load example.yaml

      # set secret with neon token (https://console.upstash.com/account/api?teamid=0)
      monk secrets add -g auth0-management-my-app-token-secret=<client-secret>
      monk secrets add -g auth0-management-my-client-id=<client-id>

      # run
      monk run auth0-example/my-auth0-app

This should deploy a client(app) with your configuration
