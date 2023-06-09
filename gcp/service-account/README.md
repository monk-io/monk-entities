# Service Account

Entity to manage GCP IAM resources.
It will allow us to create new ServiceAccount and Access Key.

## Usage

See example.yaml for full resource examples.

      # load templates
      monk load MANIFEST example.yaml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

IAM resource should be created for you.

To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the IAM resources from GCP.
