# Monk example for Upstash Vector

Using Upstash Vector with Monk.

## Usage

See `example.yaml` for a simple example of how to use Upstash Vector with Monk.
It creates the following resources:
- Vector Database

We'll use Monk CLI to load and run everything:

      # load Entity types and example template
      monk load MANIFEST
      monk load example.yaml

      # set secrets with Upstash credentials (https://console.upstash.com/account/api?teamid=0)
      monk secrets add -g upstash-auth-token=<upstash-auth-token>
      monk secrets add -g upstash-email=<upstash-email>

      # run 
      monk run upstash-example/vector

This should deploy a Upstash Vector database instance.