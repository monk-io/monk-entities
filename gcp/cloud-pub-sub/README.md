# Cloud Pub Sub

Entity to manage RDS Instance.
It will allow us to create new RDS Instance.

## Usage

We'll use Monk CLI to load and create our pub sub resource.
Copy `example.yaml` and update the vars according to your needs.
Full schema available here: https://cloud.google.com/pubsub/docs/reference/rest/v1/projects.topics#Topic

      # load templates
      monk load pubsub.yml <your-entinty-instance>.yml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the resource from GCP.