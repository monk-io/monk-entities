# Cloud SQL

Cloud SQL contains Entities to deploy Cloud SQL Database instances on Google Cloud Platform.

## Usage

We'll use Monk CLI to load and run everything:

      # load Entity types
      monk load cloud-sql.yaml example.yaml

      # run db Instance
      monk run poc/myinstance

      # need to wait a few minutes for GCP to provision the instance until we can use it
      # when Instance is ready, we can create Database and User
      monk run poc/mydb poc/myuser

Then, we can deploy WordPress Runnable that stores data in Cloud SQL Database
with User credentials from Monk Secret.

Load and run WordPress, it should be able to run using Cloud SQL Database:

      monk run poc/wordpress

You can open WordPress address in your browser to check if it works.

To remove everything:

      monk delete poc/wordpress poc/myuser poc/mydb poc/myinstance
