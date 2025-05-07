# VPC

Entity to manage VPC Resource.
It will allow us to create new VPC Resource.

## Usage

We'll use Monk CLI to load and create our database instance.
Copy `example.yaml` and update the vars according to your needs.
Full schema available here: https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_CreateVpc.html

      # load templates
      monk load vpc.yml <your-entinty-instance>.yml

      # run to trigger a "create" event
      monk run <your-workspace>/<entity_name>

VPC Resource should be created for you in the specified region.


To delete it `monk delete`:

      monk delete <your-workspace>/<entity_name>

This should remove Entity from Monk and the VPC resource from AWS.
