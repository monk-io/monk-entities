# Cloud Storage

Entity to manage Cloud Storage.
It will allow us to create new Cloud Storage.

## Usage

We'll use Monk CLI to load and create our Cloud Storage.
Copy `example.yaml` and update the vars according to your needs.
Full schema available here: https://cloud.google.com/storage/docs/json_api/v1/buckets/insert

      # load templates
      monk load cloud-storage.yml <your-entinty-instance>.yml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

Cloud Storage should be created for you in the specified region.


To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the Cloud Storage from AWS.