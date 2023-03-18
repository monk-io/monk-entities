# Elastic File System 

Entity to manage EFS.
It will allow us to create new EFS.

## Usage

We'll use Monk CLI to load and create our database instance.
Copy `example.yaml` and update vars according to your needs.
Full schema available here: https://docs.aws.amazon.com/efs/latest/ug/API_CreateFileSystem.html

      # load templates
      monk load efs.yaml <your-entinty-instance>.yaml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

EFS table should be created for you in the specified region.


To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the EFS resource from AWS.
