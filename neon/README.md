# Neon

Using Neon Serverless Postgres with Monk.

## Usage

See example.yaml for a simple example of how to use Neon Serverless Postgres with Monk.
It creates the following resources:
- Project
- Branch
- Role (database user) with password in Monk secret
- Database
- Example application container with connection to the database

We'll use Monk CLI to load and run everything:

      # load Entity types and example template
      monk load MANIFEST
      monk load example.yaml

      # set secret with neon token (https://console.neon.tech/app/settings#api-keys)
      monk secrets add -g neon-token=<NEON_TOKEN>

      # run 
      monk run neon-example/stack

This should deploy a Neon Serverless Postgres instance and container with a simple example application.
Open http://localhost:8080/api/products in your browser to check if it works.
It should show a list of products with data from the DB.