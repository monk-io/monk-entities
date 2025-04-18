# Monk example for Upstash Redis

Using Upstash Redis with Monk.


## Usage

See example.yaml for a simple example of how to use Upstash Redis with Monk.
It creates the following resources:
- Database

We'll use Monk CLI to load and run everything:

      # load Entity types and example template
      monk load MANIFEST
      monk load example.yaml

      # set secret with neon token (https://console.upstash.com/account/api?teamid=0)
      monk secrets add -g upstash-auth-token=<upstash-auth-token>
      monk secrets add -g upstash-email=<upstash-email>

      # run 
      monk run upstash-example/redis

This should deploy a Upstash Redis instance.
