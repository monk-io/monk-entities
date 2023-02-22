# DynamoDB

Entity to manage DynamoDB Table.
It will allow us to create new DynamoDB table.

## Usage

We'll use Monk CLI to load and create our database instance.
Copy `example.yaml` and update `region` and `dbschema` vars according to your needs.
Full schema available here: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_CreateTable.html

      # load templates
      monk load dynamo-db.yaml <your-entinty-instance>.yaml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

DynamoDB table should be created for you in the specified region.


To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the DynamoDB resource from AWS.
