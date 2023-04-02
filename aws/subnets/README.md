# Subneta

Entity to manage Subnet Resources.
It will allow us to create new Subnet Resources.

## Usage

We'll use Monk CLI to load and create our database instance.
Copy `example.yaml` and update the vars according to your needs.
Full schema available here: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_CreateTable.html

      # load templates
      monk load subnets.yml <your-entinty-instance>.yml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

Subnet Resources should be created for you in the specified region.


To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the Subnet Resources from AWS.