# Neptune

Entity to manage Neptune Instance.
It will allow us to create new Neptune Instance.

## Usage

We'll use Monk CLI to load and create our database instance.
Copy `example.yaml` and update the vars according to your needs.
Full schema available here: https://docs.aws.amazon.com/neptune/latest/userguide/api-clusters.html

      # load templates
      monk load neptune.yml <your-entinty-instance>.yml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

Neptune Instance should be created for you in the specified region.


To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the Neptune resource from AWS.