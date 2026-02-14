# RDS Aurora

Entity to manage RDS Aurora.
It will allow us to create new RDS Aurora.

## Usage

We'll use Monk CLI to load and create our database instance.
Copy `example.yaml` and update the vars according to your needs.
Full schema available here: https://docs.aws.amazon.com/AmazonRDS/latest/APIReference/API_Operations.html

      # load templates
      monk load aurora.yml <your-entinty-instance>.yml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

RDS Aurora should be created for you in the specified region.


To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the RDS Aurora resource from AWS.
